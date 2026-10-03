import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCalibrationPolicyV2 } from '../scripts/model-strength.mjs';
import { collectAuthenticatedCalibrationSummary } from '../scripts/team-role-calibration.mjs';
import { applySubscriptionAccounting } from '../scripts/team-subscription.mjs';
import { createProtocolRoleSuite,formatProtocolTrial } from '../scripts/team-role-suite.mjs';
import { collectNativeModelProfile,collectNativeMeasurementProfile,serializeNativeModelProfile } from '../scripts/native-model-profile.mjs';
import { routingDigest } from '../scripts/model-routing.mjs';
import { rankParticipant,validatePolicy } from '../scripts/team.mjs';
const now=Date.parse('2026-10-03T12:00:00Z'),at=new Date(now).toISOString();
const expiry=new Date(now+600000).toISOString();
let fixturePromise;
async function authorityFixture(){
 const s={teams:{},collectors:{}},t={id:'team',epoch:1,quota_revision:0,participants:{}};s.teams.team=t;let revision=0;
 const H={owner:(_s,c)=>{if(c.actor!=='owner:fixture')throw Error('owner-required');}};
 const send=(type,data,actor='owner:fixture')=>{const result=applySubscriptionAccounting(s,t,{type,actor,at,...data},now,H);revision++;return result;};
 send('subscription-accounting-enable-v2',{revision:1,policy:{bootstrap:true,billing_policy:'inherited-native'}});
 const unit={scope:'team-native-counter',team:'team',counter_schema:'fixture-counter'};
 send('subscription-allocation-update-v2',{unit_scope:unit,max_tokens:'100000',revision:1});
 const billing={provider:null,origin:null,account:null,sku:null,mode:'unknown',paid_fallback:'unknown',provenance:'unavailable',auth_method:null,credit_availability:'unknown',observed_at:at,account_generation:0,consistent:true};
 const peers=[];
 for(const name of ['a','b','c','d']){
  const p={id:'peer-'+name,incarnation:'inc-'+name,model:{model_revision:1,resolved:false,provider:'route',model_id:'model-'+name,reasoning:'unknown'},availability:'ready',revoked:false,native_binding:{collector_id:'collector-'+name,descriptor_digest:routingDigest({adapter:name})}};
  t.participants[p.id]=p;s.collectors['collector-'+name]={id:'collector-'+name,team:'team',purposes:['runtime','usage'],revoked:false};
  const model={provider:'route',model_id:'model-'+name,reasoning:'unknown',observed_at:at};
  const manifest=id=>({id:'manifest-'+id,native_id:'native-'+id,harness:'opencode',cwd:'/fixture',version:'1.18.33',version_provenance:'native-health',read_only:true,fresh:true,fresh_review_verified:true,author_history_inherited:false,author_contexts:[],tools:[],isolation:'read-only',provenance:'adapter-isolated',model_provider_is_billing_route:true});
  const options={participant:p,adapter_revision:'native-profile-v1',requested_configuration:{model_id:model.model_id},execution_environment:{platform:'fixture'},now};
  const ctx=manifest('baseline-'+name),baseline=await collectNativeModelProfile({...options,observe:async()=>({native_id:ctx.native_id,invocation_id:'baseline-'+name,output:'token',actualModel:model,context_manifest:ctx,observed_at:at,correlation:{participant:p.id,incarnation:p.incarnation,model_revision:1,native_id:ctx.native_id,context_id:ctx.id,invocation_id:'baseline-'+name,nonce:'token'}})});
  peers.push({name,p,model,manifest,options,profile_id:baseline.profile_id});
 }
 const suite=createProtocolRoleSuite({seed:'policy-fixture-seed',cohort:'cohort',profiles:peers.map(p=>p.profile_id)});
 const members=peers.map(({p,profile_id})=>({participant:p.id,incarnation:p.incarnation,model_revision:1,descriptor_digest:p.native_binding.descriptor_digest,profile_id}));
 send('native-calibration-cohort-open-v2',{cohort:{id:'cohort',seed:'policy-fixture-seed',members,roles:['coordinate','review'],unit_allocations:[{unit_digest:routingDigest(unit),max_tokens:'100000',allocation_revision:1}],suite_digest:suite.suite_digest,criteria_digest:suite.grading_digest,expires_at:expiry}});
 for(const peer of peers){
  const roleList=peer.name==='a'?['coordinate']:peer.name==='b'?['coordinate','review']:peer.name==='c'?['review']:['coordinate'];
  for(const role of roleList)for(const trial of suite.trials.filter(t=>t.role===role)){
   const {p}=peer,nonce=peer.name+'-'+role+'-'+trial.family+'-'+trial.variant,invocation_id='subscription-'+nonce,ctx=peer.manifest(nonce),context_id='ledger-'+nonce,actor='collector:'+p.native_binding.collector_id;
   send('subscription-context-capture-v2',{participant_id:p.id,context:{id:context_id,native_id:ctx.native_id,descriptor_digest:p.native_binding.descriptor_digest,incarnation:p.incarnation,unit_scope:unit,billing_observation:billing,observed_model:null,observed_at:at,expires_at:new Date(now+300000).toISOString(),owned:true,read_only:true}},actor);
   const measurement={kind:'objective-role-trial',cohort_id:'cohort',role,case_id:trial.id,profile_id:peer.profile_id,suite_digest:suite.suite_digest,criteria_digest:suite.grading_digest,prompt_digest:routingDigest(formatProtocolTrial(suite,trial.id))};
   send('subscription-reserve-v2',{reservation:{id:invocation_id,nonce,participant:p.id,incarnation:p.incarnation,context_id,purpose:'calibration',requested_model:{provider:'route',model_id:peer.model.model_id,reasoning:'unknown'},suite_digest:suite.suite_digest,max_calls:1,timeout_ms:1000,estimate_tokens:'40',epoch:1,quota_revision:0,mode_revision:1,allocation_revision:1,measurement}});
   send('subscription-consume-v2',{invocation_id,nonce,prompt_digest:measurement.prompt_digest},actor);
   const failed=(peer.name==='b'&&role==='coordinate'&&trial.variant===0&&['dependencies','leases'].includes(trial.family))||(peer.name==='c'&&trial.variant===0&&['authority-binding','scope-identity'].includes(trial.family))||(peer.name==='d'&&trial.family==='dependencies'&&trial.variant<2);
   const raw=failed?(role==='coordinate'?'{"eligible_ids":[]}':'{"findings":[{"event_id":"extra","rule_id":"extra"}]}'):JSON.stringify(trial.answer_key);
   const native={invocation_id:nonce,native_id:ctx.native_id,output:raw,actualModel:peer.model,context_manifest:ctx,usage_span:{protocol:1,schema:unit.counter_schema,native_id:ctx.native_id,turn_id:'turn-'+nonce,coverage:'complete',before:'0',after:'30',actual_tokens:'30'}};
   const seal={...measurement,observed_at:at,original_output:raw,output_digest:routingDigest(raw),native_receipt_digest:routingDigest(native),native_receipt:native,outcome:'completed'};
   send('subscription-usage-v2',{invocation_id,nonce,receipt:{nonce,context_id,native_id:ctx.native_id,incarnation:p.incarnation,unit_scope:unit,counter_schema:unit.counter_schema,turn_id:native.usage_span.turn_id,billing_before:billing,billing_after:billing,observed_model:{provider:peer.model.provider,model_id:peer.model.model_id,reasoning:peer.model.reasoning},coverage:'complete',before:'0',after:'30',actual_tokens:'30',isolation_verified:true,measurement:seal}},actor);
   const admission={purpose:'calibration',state:'settled',context_quarantined:false,billing_policy:'inherited-native',nonce,invocation_id,participant:p.id,incarnation:p.incarnation,model_revision:1,native_id:ctx.native_id,actual_tokens:'30',measurement,output_digest:seal.output_digest,native_receipt_digest:seal.native_receipt_digest,observed_at:at};
   const observation=await collectNativeMeasurementProfile({...peer.options,suite,trial_id:trial.id,observe:async()=>({...native,observed_at:at,admission,correlation:{participant:p.id,incarnation:p.incarnation,model_revision:1,native_id:ctx.native_id,context_id:ctx.id,invocation_id:nonce,nonce}})});
   const profile=serializeNativeModelProfile(observation,{now});
   send('subscription-measurement-capture-v2',{invocation_id,nonce,capture:{measurement,original_output:raw,output_digest:seal.output_digest,native_receipt_digest:seal.native_receipt_digest,native_id:ctx.native_id,context_id,turn_id:native.usage_span.turn_id,incarnation:p.incarnation,descriptor_digest:p.native_binding.descriptor_digest,observed_at:at,expires_at:expiry,profile_digest:profile.profile_digest,profile_snapshot_digest:routingDigest(profile.profile),context_snapshot_digest:routingDigest(ctx),observation_id:profile.observation_id,native_profile:profile}},actor);
  }
 }
 return {state:s,revision,peers};
}
async function fixture(){fixturePromise??=authorityFixture();const f=await fixturePromise;return {...f,state:structuredClone(f.state)};}
async function trusted(f,clock=now){return collectAuthenticatedCalibrationSummary({teamId:'team',cohortId:'cohort',readAuthority:async()=>({state:f.state,revision:f.revision}),now:()=>clock});}

// These fixtures execute the installed reducers and pure profile factories. No
// provider, native process or caller-supplied score participates in calibration.
test('compiler accepts only authenticated summaries and emits an immutable diagnostic proposal',async()=>{
 const f=await fixture(),summary=await trusted(f),policy=compileCalibrationPolicyV2(summary,{now:()=>now,revision:3});
 assert.equal(policy.protocol,2);assert.equal(policy.mode,'automatic-calibration-proposal');assert.equal(policy.revision,3);assert.equal(policy.activation,false);assert.equal(policy.authority_granted,false);
 assert.equal(policy.provenance.summary_digest,routingDigest(summary));assert.equal(policy.provenance.authority_revision,f.revision);assert.equal(policy.provenance.captures_digest,summary.captures_digest);
 assert.throws(()=>{policy.profiles[0].priorities.coordinate=100;},TypeError);
 for(const forged of [{...summary},structuredClone(summary),JSON.parse(JSON.stringify(summary)),{protocol:2,profiles:[]}])assert.throws(()=>compileCalibrationPolicyV2(forged,{now}),/authenticated-summary-provenance/);
 assert.throws(()=>compileCalibrationPolicyV2(summary,{now,revision:0}),/revision/);
 assert.throws(()=>compileCalibrationPolicyV2(summary,{now:()=>NaN}),/clock/);
});
test('coordinate and review require their own qualified coverage; implement always remains null',async()=>{
 const f=await fixture(),summary=await trusted(f),policy=compileCalibrationPolicyV2(summary,{now});
 const byParticipant=Object.fromEntries(policy.profiles.map(p=>[p.participant,p]));
 assert.ok(byParticipant['peer-a'].priorities.coordinate>0);assert.equal(byParticipant['peer-a'].priorities.review,null);
 assert.ok(byParticipant['peer-b'].priorities.coordinate>0);assert.ok(byParticipant['peer-b'].priorities.review>0);
 assert.equal(byParticipant['peer-c'].priorities.coordinate,null);assert.ok(byParticipant['peer-c'].priorities.review>0);
 assert.equal(byParticipant['peer-d'].priorities.coordinate,null);assert.equal(byParticipant['peer-d'].calibration.coordinate.passes,22);assert.equal(byParticipant['peer-d'].calibration.coordinate.qualified,false);
 for(const p of policy.profiles){assert.equal(p.priorities.implement,null);assert.deepEqual(p.role_coverage.implement,[]);assert.equal(p.identity.kind,'native-configuration');assert.equal(Object.hasOwn(p,'provider'),false);assert.equal(Object.hasOwn(p,'model_id'),false);}
 assert.deepEqual(byParticipant['peer-a'].role_coverage.review,[]);assert.deepEqual(byParticipant['peer-d'].role_coverage.coordinate,[]);
 assert.equal(policy.scales.coordinate.cohort,summary.cohort);assert.equal(policy.scales.review.criteria_digest,summary.criteria_digest);
});
test('overlapping Wilson intervals stay on the strongest frontier without ordering by raw success',async()=>{
 const f=await fixture(),policy=compileCalibrationPolicyV2(await trusted(f),{now});
 const a=policy.profiles.find(p=>p.participant==='peer-a'),b=policy.profiles.find(p=>p.participant==='peer-b'),c=policy.profiles.find(p=>p.participant==='peer-c');
 assert.equal(a.calibration.coordinate.passes,24);assert.equal(b.calibration.coordinate.passes,22);assert.ok(a.calibration.coordinate.confidence.lower<b.calibration.coordinate.confidence.upper);assert.equal(a.priorities.coordinate,b.priorities.coordinate);
 assert.equal(b.calibration.review.passes,24);assert.equal(c.calibration.review.passes,22);assert.equal(b.priorities.review,c.priorities.review);
 assert.match(policy.limitations,/uncertainty frontier/);assert.equal(policy.scales.coordinate.comparison,'strict-disjoint-interval-partial-order');
});
test('recompilation and authority rereading preserve original measurement clocks and expiry',async()=>{
 const f=await fixture(),summary=await trusted(f),first=compileCalibrationPolicyV2(summary,{now}),later=compileCalibrationPolicyV2(summary,{now:()=>now+5000});
 assert.deepEqual(later,first);assert.equal(first.expires_at,expiry);
 const reread=compileCalibrationPolicyV2(await trusted(f,now+10000),{now:now+10000});assert.equal(reread.expires_at,first.expires_at);
 for(const p of reread.profiles)for(const role of ['coordinate','review']){assert.equal(p.calibration[role].observed_at,at);assert.equal(p.calibration[role].expires_at,expiry);}
 assert.throws(()=>compileCalibrationPolicyV2(summary,{now:Date.parse(expiry)}),/current-summary-required/);
});
test('changed enrollment removes proposal coverage while stored captures keep their original diagnostics',async()=>{
 const f=await fixture();f.state.teams.team.participants['peer-b'].model.model_revision=2;
 const policy=compileCalibrationPolicyV2(await trusted(f),{now}),b=policy.profiles.find(p=>p.participant==='peer-b');
 assert.equal(b.priorities.coordinate,null);assert.equal(b.priorities.review,null);assert.equal(b.calibration.review.passes,24);assert.equal(b.calibration.review.current,false);assert.deepEqual(b.role_coverage.review,[]);
});
test('capture score or answer tampering cannot enter the trusted summary; legacy ranks cannot borrow the proposal',async()=>{
 const f=await fixture(),capture=Object.values(f.state.teams.team.native_calibration_cohorts.cohort.captures)[0];capture.grade.pass=!capture.grade.pass;
 await assert.rejects(trusted(f),/authenticated-capture-snapshot/);
 const valid=await fixture(),proposal=compileCalibrationPolicyV2(await trusted(valid),{now});
 assert.throws(()=>validatePolicy(proposal));
 assert.equal(rankParticipant(valid.state.teams.team.participants['peer-a'],proposal,'coordinate',{now}),null);
 const forged=JSON.parse(JSON.stringify(await trusted(valid)));forged.profiles[0].roles[0].confidence={lower:1,score:1,upper:1,method:'wilson-95'};assert.throws(()=>compileCalibrationPolicyV2(forged,{now}),/provenance/);
});
test('unchanged grades cannot hide tampered original output, native counters, snapshots or clocks',async()=>{
 const mutations=[
  capture=>{capture.original_output+=' ';},
  (_capture,invocation)=>{invocation.measurement_seal.native_receipt.usage_span.actual_tokens='31';},
  capture=>{capture.native_profile.profile.execution_scope.cwd='/foreign';},
  capture=>{capture.observed_at=new Date(now+1000).toISOString();}
 ];
 for(const mutate of mutations){
  const f=await fixture(),capture=Object.values(f.state.teams.team.native_calibration_cohorts.cohort.captures)[0],invocation=f.state.subscription_invocations[capture.invocation_id];
  const originalGrade=structuredClone(capture.grade);
  mutate(capture,invocation);
  assert.deepEqual(capture.grade,originalGrade);
  await assert.rejects(trusted(f),/authenticated-capture-snapshot|native-receipt|original-native-seal|actual-profile-snapshot|sealed-capture-binding|immutable-observation/);
 }
 // Every mutation operates on a separate authority clone. Genuine originals
 // remain usable; rejection never rewrites an answer or manufactures a score.
 assert.equal(compileCalibrationPolicyV2(await trusted(await fixture()),{now}).activation,false);
});
