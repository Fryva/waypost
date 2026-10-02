import test from 'node:test';
import assert from 'node:assert/strict';
import {collectQuotaObservation,serializeQuotaObservation,validateQuotaObservation,quotaEligible,effectiveReviewFloor} from '../scripts/team-quota.mjs';

const now=Date.parse('2026-10-01T20:00:00Z');
const descriptor=id=>({provider:'fixture',model_id:id,reasoning:'none',model_revision:1,resolved:true,evidence:{kind:'adapter-observed',source:'fixture-adapter',observed_at:new Date(now).toISOString()}});
const strong={id:'strong',incarnation:'strong-inc',model:descriptor('large'),availability:'ready',revoked:false};
const weak={id:'weak',incarnation:'weak-inc',model:descriptor('small'),availability:'ready',revoked:false};
const policy={protocol:1,mode:'manual',revision:1,domain:'coding',approved_by:'fixture',approved_at:new Date(now).toISOString(),profiles:[strong,weak].map((p,i)=>({provider:p.model.provider,model_id:p.model.model_id,reasoning:p.model.reasoning,priorities:{coordinate:i?1:3,implement:i?1:3,review:i?1:3},source:'fixture-policy',date:'2026-10-01'}))};
function observation(p,status='exhausted',overrides={}) {
 const model={provider:p.model.provider,model_id:p.model.model_id,reasoning:p.model.reasoning};
 return {protocol:1,participant:p.id,incarnation:p.incarnation,model_revision:p.model.model_revision,model,route:{endpoint:'https://provider.example/model',account:'opaque-account',sku:'subscription-fixture',mode:'subscription',pool:'shared-pool',model},status,available_calls:status==='exhausted'?0:5,provider_confirmed:true,evidence_kind:'provider-quota',scope:'provider-account-model',reason:status==='exhausted'?'provider-quota-exhausted':'provider-quota-available',observation_id:p.id+'-provider-observation-'+status,source:'https://provider.example/quota',observed_at:new Date(now).toISOString(),expires_at:new Date(now+60000).toISOString(),...overrides};
}
function team(ps=[strong,weak],overrides={}) {
 const review_admissions={};for(const p of ps){const model={provider:p.model.provider,model_id:p.model.model_id,reasoning:p.model.reasoning},id=JSON.stringify(Object.values(model));(review_admissions[id]??=[]).push({participant:p.id,incarnation:p.incarnation,model_revision:p.model.model_revision,model});}
 return {participants:Object.fromEntries(ps.map(p=>[p.id,p])),policy,review_floor:3,historical_review_floor:3,review_blocker:null,required_review_models:[[strong.model.provider,strong.model.model_id,strong.model.reasoning]],review_admissions,quota_policy:{protocol:1,automatic_redistribution:true},...overrides};
}

test('quota observations require a trusted provider callback and own-minted serialization',async()=>{
 const record=await collectQuotaObservation({participant:strong,observe:async query=>{assert.equal(query.incarnation,'strong-inc');return observation(strong);},now});
 assert.deepEqual(serializeQuotaObservation(record),observation(strong));
 assert.throws(()=>serializeQuotaObservation(structuredClone(record)),/collector-provenance/);
 await assert.rejects(collectQuotaObservation({participant:strong,observe:observation(strong),now}),/trusted-observer/);
 assert.throws(()=>{record.available_calls=2;},TypeError);
});
test('UI percentage, generic throttling, future/stale observations and mismatched billing source fail closed',async()=>{
 for(const patch of [{provider_confirmed:false},{evidence_kind:'desktop-ui-percentage'},{evidence_kind:'http-429'},{status:'rate-limited'},{status:'available',available_calls:0},{evidence_kind:'structured-native-refusal',status:'available',available_calls:1},{observed_at:new Date(now+1).toISOString()},{observed_at:new Date(now-30001).toISOString()},{expires_at:new Date(now).toISOString()},{expires_at:new Date(now+60001).toISOString()},{source:'https://unrelated.example/quota'}]) {
  await assert.rejects(collectQuotaObservation({participant:strong,observe:async()=>observation(strong,'exhausted',patch),now}),/quota-/);
 }
 const valid=observation(strong,'exhausted',{evidence_kind:'structured-native-refusal'});
 assert.equal((await collectQuotaObservation({participant:strong,observe:async()=>valid,now})).status,'exhausted');
});
test('quota admission binds exact participant incarnation, model revision, tuple and authenticated route',()=>{
 for(const patch of [{participant:'other'},{incarnation:'other'},{model_revision:2},{model:{provider:'fixture',model_id:'fallback',reasoning:'none'}}])assert.throws(()=>validateQuotaObservation(observation(strong,'exhausted',patch),{participant:strong,now}),/identity-mismatch/);
 const raw=observation(strong);raw.route.model.model_id='different';
 assert.throws(()=>validateQuotaObservation(raw,{participant:strong,now}),/identity-mismatch|billing-route/);
 const secret=observation(strong);secret.route.endpoint='https://secret:credential@provider.example/model';
 assert.throws(()=>validateQuotaObservation(secret,{participant:strong,now}),/provider-source/);
});
test('expiry and reset do not restore exhausted quota; explicit fresh positive evidence does',()=>{
 const exhausted={...strong,quota_observation:observation(strong,'exhausted',{reset_at:new Date(now+1000).toISOString()})};
 assert.equal(quotaEligible(exhausted,now),false);assert.equal(quotaEligible(exhausted,now+120000),false);
 const restored={...strong,quota_observation:observation(strong,'available',{observed_at:new Date(now+120000).toISOString(),expires_at:new Date(now+180000).toISOString()})};
 assert.equal(quotaEligible(restored,{now:now+120000}),true);assert.equal(quotaEligible(restored,now+180000),false);
 assert.equal(quotaEligible(strong,now),true);
 assert.equal(quotaEligible({...strong,incarnation:'restart',quota_observation:observation(strong)},now),false);
});
test('quota exception lowers only the effective floor and leaves immutable history intact',()=>{
 const exhausted={...strong,quota_observation:observation(strong)};
 const t=team([exhausted,weak]),before=structuredClone(t);
 const result=effectiveReviewFloor(t,now);
 assert.equal(result.floor,1);assert.equal(result.blocked,null);
 assert.deepEqual(result.exhausted_identities,[['fixture','large','none']]);
 assert.deepEqual(t,before);assert.equal(t.historical_review_floor,3);
 const disabled=effectiveReviewFloor({...t,quota_policy:{protocol:1,automatic_redistribution:false}},now);
 assert.equal(disabled.floor,3);assert.equal(disabled.exhausted_identities.length,0);
});
test('a same-model healthy peer, unavailable participant or departure without proof preserves strongest floor',()=>{
 const exhausted={...strong,quota_observation:observation(strong)};
 const peer={...strong,id:'same-model-peer',incarnation:'peer-inc'};
 for(const other of [peer,{...peer,availability:'busy'},{...peer,availability:'unavailable'},{...peer,revoked:true},{...peer,availability:'left'}])assert.equal(effectiveReviewFloor(team([exhausted,weak,other]),now).floor,3);
 assert.equal(effectiveReviewFloor(team([{...strong,availability:'unavailable'},weak]),now).floor,3);
 assert.equal(effectiveReviewFloor(team([{...exhausted,revoked:true},weak]),now).floor,3);
 assert.equal(effectiveReviewFloor(team([{...exhausted,availability:'left'},weak]),now).floor,3);
});
test('all-model exhaustion pauses review and stronger positive recovery restores the floor',()=>{
 const exStrong={...strong,quota_observation:observation(strong)},exWeak={...weak,quota_observation:observation(weak)};
 const all=effectiveReviewFloor(team([exStrong,exWeak]),now);
 assert.equal(all.floor,null);assert.equal(all.blocked,'all-qualified-review-models-quota-exhausted');
 assert.equal(effectiveReviewFloor(team([exStrong,weak]),now+120000).floor,1);
 const returned={...strong,quota_observation:observation(strong,'available')};
 assert.equal(effectiveReviewFloor(team([returned,weak]),now).floor,3);
});
test('historical unclassified identity is waived only by complete exact exhaustion evidence',()=>{
 const reduced={...policy,revision:2,profiles:policy.profiles.filter(p=>p.model_id==='small')};
 const t=team([strong,weak],{policy:reduced});
 assert.equal(effectiveReviewFloor(t,now).blocked,'previous-review-model-unclassified');
 t.participants.strong={...strong,quota_observation:observation(strong)};
 const waived=effectiveReviewFloor(t,now);assert.equal(waived.floor,1);assert.equal(waived.blocked,null);
 assert.deepEqual(t.required_review_models,[['fixture','large','none']]);
});
test('stale automatic model policy and invalid records never invent a capability order',()=>{
 const automatic={...policy,mode:'automatic',generated_at:new Date(now-60000).toISOString(),expires_at:new Date(now).toISOString(),sources:[{id:'fixture-policy',url:'https://source.example/agent',retrieved_at:new Date(now-60000).toISOString()}]};delete automatic.approved_by;delete automatic.approved_at;
 assert.equal(effectiveReviewFloor(team([strong,weak],{policy:automatic}),now).blocked,'model-policy-expired');
 const forged={...strong,quota_observation:observation(strong,'exhausted',{provider_confirmed:false})};
 assert.equal(effectiveReviewFloor(team([forged,weak]),now).floor,3);assert.equal(quotaEligible(forged,now),false);
});
test('local allocation, task budget and reservation failures are not provider exhaustion',async()=>{
 for(const patch of [{scope:'local-allocation'},{scope:'task-budget'},{scope:'project-reservations'},{reason:'budget-exhausted'},{reason:'reservation-exhausted'},{reason:'http-429'},{observation_id:''}]) {
  await assert.rejects(collectQuotaObservation({participant:strong,observe:async()=>observation(strong,'exhausted',patch),now}),/scope-or-reason/);
 }
});
test('stable review admission survives model switch, reincarnation, revocation and departure',()=>{
 const t=team([{...strong,quota_observation:observation(strong)},weak]),original=structuredClone(t.review_admissions);
 assert.equal(effectiveReviewFloor(t,now).floor,1);
 for(const patch of [{model:{...weak.model,model_revision:2}},{incarnation:'restarted'},{revoked:true},{availability:'left'}]) {
  const changed=structuredClone(t);Object.assign(changed.participants.strong,patch);
  assert.equal(effectiveReviewFloor(changed,now).floor,3);
  assert.deepEqual(changed.review_admissions,original);
 }
 const emptied=structuredClone(t);delete emptied.participants.strong;
 assert.equal(effectiveReviewFloor(emptied,now).floor,3);
});
test('legacy missing admission cannot authorize quota-only lowering',()=>{
 const t=team([{...strong,quota_observation:observation(strong)},weak]);delete t.review_admissions;
 const result=effectiveReviewFloor(t,now);
 assert.equal(result.floor,3);assert.equal(result.blocked,'quota-review-admissions-missing');
 assert.equal(result.exhausted_identities.length,0);
});
