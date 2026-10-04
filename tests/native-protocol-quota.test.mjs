import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {authorityFixture,now,at,expiry} from './helpers/native-calibration.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';
import {applySubscriptionAccounting} from '../scripts/team-subscription.mjs';
import {createProtocolLeaderAckRequest,createProtocolHandoverAckRequest,formatProtocolAction,protocolActionSlot} from '../scripts/team-native-action.mjs';
import {collectNativeActionProfile,serializeNativeModelProfile} from '../scripts/native-model-profile.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {collectNativeProtocolQuota,serializeNativeProtocolQuota,nativeQuotaSource,nativeQuotaEligible,selectNativeQuotaFrontier,assertNativeBillingQuotaEligible} from '../scripts/team-native-quota.mjs';
let shared;
async function fixture(){
 shared??=authorityFixture({billing:name=>knownBilling('peer-'+name)});const original=await shared,s=structuredClone(original.state);Object.assign(s,{protocol:1,owner_hash:'fixture',task_bindings:{task:'team'}});
 Object.assign(s.teams.team,{task:'task',policy:{protocol:1,revision:1,mode:'automatic',domain:'coding',generated_at:at,expires_at:expiry,sources:[{id:'fixture',url:'https://example.org/fixture',retrieved_at:at}],profiles:[],evidence_floor:['adapter-observed']},messages:[],work:{},status:'forming',leader:null,candidate:null,required_review_models:[],native_policy_bootstrap:true});
 let state=reduceTeamEvent(s,{type:'native-policy-install-v2',team:'team',actor:'owner:fixture',at,request_key:'install',cohort_id:'cohort',expected_policy_revision:1,scope:'waypost-protocol'},{revision:original.revision}).state,t=state.teams.team;
 const unit={scope:'team-native-counter',team:'team',counter_schema:'fixture-counter'},unit_digest=routingDigest(unit),policy={kind:'protocol-leader-ack',allow_unknown_quota:true,max_calls:2,max_estimate_tokens:'40',timeout_ms:1000,expires_at:expiry,unit_allocations:[{unit_digest,max_tokens:'80',allocation_revision:1}]};
 const H={owner:(_s,c)=>{if(c.actor!=='owner:fixture')throw Error('owner-required');}};
 let seq=0,currentClock=now;function send(type,fields={},actor='owner:fixture',clock=currentClock){const next=reduceTeamEvent(state,{type,team:'team',actor,at:new Date(clock).toISOString(),request_key:'quota-fixture-'+(++seq),...fields},{revision:original.revision+seq});state=next.state;return next;}
 return {get clock(){return currentClock;},set clock(value){currentClock=value;},get state(){return state;},get t(){return state.teams.team;},unit,unit_digest,policy,send,peers:original.peers};
}
function prepare(f,{nonce='control-one',actionId='action-one',operationId=randomUUID()}={}){
 const p=f.t.participants[f.t.candidate],peer=f.peers.find(peer=>peer.p.id===p.id),ctx=peer.manifest('action-'+nonce),context_id='ledger-action-'+nonce,actor='collector:'+p.native_binding.collector_id;
 const billing=knownBilling(p.id);
 f.send('subscription-context-capture-v2',{participant_id:p.id,...(f.t.native_quota_freeze?{protocol_handover_digest:routingDigest(f.t.native_protocol_handover)}:{}),context:{id:context_id,native_id:ctx.native_id,descriptor_digest:p.native_binding.descriptor_digest,incarnation:p.incarnation,unit_scope:f.unit,billing_observation:billing,observed_model:null,observed_at:at,expires_at:new Date(now+300000).toISOString(),owned:true,read_only:true}},actor);
 const core=f.t.native_protocol_handover?.state==='prepared'?createProtocolHandoverAckRequest(f.state,f.t,{actionId,now:f.clock}):createProtocolLeaderAckRequest(f.t,{actionId,now}),action={...core,prompt_digest:routingDigest(formatProtocolAction(core)),operation_id:operationId};
 const reservation={id:'subscription-'+nonce,nonce,participant:p.id,incarnation:p.incarnation,context_id,purpose:'protocol-control',requested_model:{provider:'route',model_id:peer.model.model_id,reasoning:'unknown'},suite_digest:action.prompt_digest,max_calls:1,timeout_ms:1000,estimate_tokens:'40',epoch:f.t.epoch,quota_revision:f.t.quota_revision||0,mode_revision:1,allocation_revision:1,action};
 return {p,peer,ctx,actor,billing,action,reservation,invocation_id:reservation.id,nonce};
}
function reserve(f,a){return f.send('subscription-reserve-v2',{reservation:a.reservation});}
function consume(f,a){return f.send('subscription-consume-v2',{invocation_id:a.invocation_id,nonce:a.nonce,prompt_digest:a.action.prompt_digest},a.actor);}
function receipt(f,a,{raw,coverage='complete',actual='30',isolation=true,sealMutation}={}){
 const output=raw??JSON.stringify({ack:true,action_id:a.action.action_id,request_digest:a.action.request_digest}),native={invocation_id:a.nonce,native_id:a.ctx.native_id,usage_span:{protocol:1,schema:f.unit.counter_schema,native_id:a.ctx.native_id,turn_id:'turn-'+a.nonce,coverage,before:'0',after:actual,actual_tokens:actual},actualModel:a.peer.model,context_manifest:a.ctx,output};
 const action_seal={action:a.action,original_output:output,output_digest:routingDigest(output),native_receipt:native,native_receipt_digest:routingDigest(native),observed_at:at,outcome:'completed'};if(sealMutation)sealMutation(action_seal);
 const value={nonce:a.nonce,context_id:a.reservation.context_id,native_id:a.ctx.native_id,incarnation:a.p.incarnation,unit_scope:f.unit,counter_schema:f.unit.counter_schema,turn_id:native.usage_span.turn_id,billing_before:a.billing,billing_after:a.billing,observed_model:{provider:a.peer.model.provider,model_id:a.peer.model.model_id,reasoning:a.peer.model.reasoning},coverage,before:'0',after:actual,actual_tokens:actual,isolation_verified:isolation,action_seal};
 f.send('subscription-usage-v2',{invocation_id:a.invocation_id,nonce:a.nonce,receipt:value},a.actor);return native;
}
async function capture(f,a,native){
 const x=f.state.subscription_invocations[a.invocation_id],seal=x.action_seal;
 const admission={purpose:'protocol-control',state:'settled',context_quarantined:false,billing_policy:'inherited-native',nonce:a.nonce,invocation_id:a.invocation_id,participant:a.p.id,incarnation:a.p.incarnation,model_revision:a.p.model.model_revision,native_id:a.ctx.native_id,actual_tokens:x.charged_tokens,action:a.action,request_digest:a.action.request_digest,original_output:seal.original_output,output_digest:seal.output_digest,native_receipt_digest:seal.native_receipt_digest,observed_at:at};
 const observed=await collectNativeActionProfile({...a.peer.options,participant:a.p,action:a.action,request:a.action.request,observe:async()=>({...native,observed_at:at,admission,correlation:{participant:a.p.id,incarnation:a.p.incarnation,model_revision:a.p.model.model_revision,native_id:a.ctx.native_id,context_id:a.ctx.id,invocation_id:a.nonce,nonce:a.nonce}})});
 const profile=serializeNativeModelProfile(observed,{now});f.send('native-action-profile-capture-v2',{invocation_id:a.invocation_id,nonce:a.nonce,profile},a.actor);return profile;
}
function completion(f,a){return {protocol:1,scope:{team:'team',participant:a.p.id,incarnation:a.p.incarnation,epoch:a.action.request.runtime_epoch??a.reservation.epoch,descriptor_digest:a.p.native_binding.descriptor_digest},operation:a.action.operation_id,kind:a.action.kind,invocation_id:a.invocation_id,nonce:a.nonce,native_id:a.ctx.native_id,consume_type:'subscription-consume-v2',created_at:at,closed_at:new Date(f.clock).toISOString(),stopped:true,callback_drained:true,evidence_digest:routingDigest('owned-closure-fixture')};}
async function settled(){const f=await fixture();f.send('native-protocol-control-enable-v2',{revision:1,policy:f.policy});const a=prepare(f);reserve(f,a);consume(f,a);const native=receipt(f,a);await capture(f,a,native);return {f,a};}


function knownBilling(participant='peer-a'){return {provider:'route',origin:'https://provider.fixture',account:routingDigest('quota-account-'+participant),sku:'fixture-subscription',mode:'subscription',paid_fallback:false,provenance:'native-runtime',auth_method:'native-fixture',credit_availability:'unavailable',observed_at:at,account_generation:0,consistent:true};}
async function leader(){const {f,a}=await settled();f.send('native-leader-ack-capture-v2',{invocation_id:a.invocation_id,nonce:a.nonce,completion:completion(f,a)},a.actor);return {f,a};}
function enableQuota(f,extra={}){const sources=f.peers.flatMap(peer=>['available','exhausted'].map(status=>({status,documentation:'https://provider.fixture/docs/quota',collector_id:peer.p.native_binding.collector_id,source:'https://provider.fixture/quota',method:'GET /quota',evidence_kind:'provider-quota',provider_code:'subscription_'+status,scope:'provider-account'}))); return f.send('native-protocol-quota-enable-v2',{revision:1,policy:{automatic_handover:true,expires_at:expiry,source_rules:sources,...extra}});}
function providerProof(binding,status='exhausted',id='provider-one',clock=now){return {protocol:2,observation_id:id,status,reason:'provider-quota-'+status,source:'https://provider.fixture/quota',method:'GET /quota',evidence_kind:'provider-quota',provider_code:'subscription_'+status,scope:'provider-account',documentation:'https://provider.fixture/docs/quota',provider_confirmed:true,billing_digest:routingDigest(binding.billing),observed_at:new Date(clock).toISOString(),expires_at:new Date(clock+60000).toISOString()};}
async function quota(f,a,status='exhausted',clock=now,id='provider-one'){
 const p=f.t.participants[a.p.id],record=await collectNativeProtocolQuota({state:f.state,team:f.t,participant:p,sourceInvocationId:a.invocation_id,observe:async binding=>providerProof(binding,status,id,clock),now:clock});
 f.send('native-protocol-quota-capture-v2',{observation:serializeNativeProtocolQuota(record)},a.actor,clock);return record;
}
function stopProof(f,p){const xs=Object.values(f.state.subscription_invocations).filter(x=>x.team===f.t.id&&x.participant===p.id&&x.incarnation===p.incarnation&&x.epoch===f.t.epoch&&!['prepared','aborted'].includes(x.state));return {protocol:2,purpose:'protocol-quota-handover-stop',team:f.t.id,participant:p.id,incarnation:p.incarnation,epoch:f.t.epoch,descriptor_digest:p.native_binding.descriptor_digest,callback_drained:true,epoch_barrier:true,required_operations:xs.map(x=>x.id),operations:xs.map(x=>x.action?.operation_id).filter(Boolean),evidence_digest:routingDigest({fixture:'whole-runtime-stop',participant:p.id,epoch:f.t.epoch})};}
function captureStops(f){for(const p of Object.values(f.t.participants).filter(p=>p.native_binding))f.send('native-protocol-handover-stop-capture-v2',{stop_proof:stopProof(f,p)},'collector:'+p.native_binding.collector_id);}
function prepareHandover(f){captureStops(f);f.send('native-protocol-handover-prepare-v2');f.send('native-protocol-handover-enable-v2',{revision:1,policy:{...f.policy,kind:'protocol-handover-ack'}});}

test('own known billing native source mints a nonimportable typed quota proof without legacy identity claims',async()=>{
 const {f,a}=await leader();enableQuota(f);const before=structuredClone(f.t.required_review_identities_v2),floor=f.t.review_floor,record=await quota(f,a);
 assert.equal(nativeQuotaEligible(f.t,f.t.participants[a.p.id],now),false);assert.equal(f.t.participants[a.p.id].quota_observation,undefined);assert.equal(f.t.review_floor,floor);assert.deepEqual(f.t.required_review_identities_v2,before);assert.equal(f.t.status,'handover');assert.notEqual(f.t.candidate,a.p.id);assert.equal(f.t.native_protocol_handover.stop_set.length,4);
 for(const copy of [{...record},structuredClone(record)])assert.throws(()=>serializeNativeProtocolQuota(copy),/collector-provenance/);
});
test('unknown billing, alternate credits, changed account and foreign profile refuse native quota',async()=>{
 for(const change of [x=>x.receipt.billing_before.account=null,x=>x.receipt.billing_before.paid_fallback=true,x=>x.receipt.billing_after.account=routingDigest('changed'),x=>x.receipt.billing_before.credit_availability='available',x=>x.action_observation.profile_id='foreign']){const {f,a}=await leader();enableQuota(f);change(f.state.subscription_invocations[a.invocation_id]);await assert.rejects(quota(f,a));assert.equal(f.t.native_quota_observations,undefined);}
});
test('provider proof does not accept 429 busy local ceilings unknown origins or reset clocks',async()=>{
 for(const patch of [{provider_confirmed:false},{evidence_kind:'http-429'},{provider_code:'busy'},{scope:'local-allocation'},{status:'rate-limited'},{source:'https://foreign.fixture/quota'},{billing_digest:routingDigest('foreign')},{observed_at:new Date(now+1).toISOString()},{reset_at:at}]){const {f,a}=await leader();enableQuota(f);await assert.rejects(collectNativeProtocolQuota({state:f.state,team:f.t,participant:f.t.participants[a.p.id],sourceInvocationId:a.invocation_id,now,observe:async b=>({...providerProof(b),...patch})}));}
});
test('exhaustion remains after expiry and busy revocation does not reduce historical critic floor',async()=>{
 const {f,a}=await leader();enableQuota(f);await quota(f,a);const floor=f.t.review_floor;assert.equal(nativeQuotaEligible(f.t,f.t.participants[a.p.id],now+120000),false);
 const candidate=f.t.participants[f.t.candidate];candidate.availability='busy';assert.equal(selectNativeQuotaFrontier(f.t,now).candidate,null);assert.equal(f.t.review_floor,floor);
});
test('fresh positive provider evidence restores eligibility but preserves callback-stop handover requirement',async()=>{
 const {f,a}=await leader();enableQuota(f);await quota(f,a);await quota(f,a,'available',now+1000,'positive');assert.equal(nativeQuotaEligible(f.t,f.t.participants[a.p.id],now+1000),true);assert.equal(f.t.status,'paused');assert.equal(f.t.native_quota_blocker,'native-quota-old-leader-reactivation-unsupported');assert.equal(f.t.native_quota_freeze.old_epoch,f.t.epoch);assert.throws(()=>createProtocolHandoverAckRequest(f.state,f.t,{actionId:'without-stop',now:now+1000}));
});

 test('unproven model and pool buckets cannot be installed or captured',async()=>{
 for(const scope of ['provider-account-model','provider-quota-pool']){const {f,a}=await leader();const source={collector_id:a.p.native_binding.collector_id,source:'https://provider.fixture/quota',method:'GET /quota',evidence_kind:'provider-quota',provider_code:'subscription_exhausted',scope,status:'exhausted',documentation:'https://provider.fixture/docs/quota'};assert.throws(()=>f.send('native-protocol-quota-enable-v2',{revision:1,policy:{automatic_handover:true,expires_at:expiry,source_rules:[source]}}),/documented-provider-proof/);enableQuota(f);await assert.rejects(collectNativeProtocolQuota({state:f.state,team:f.t,participant:f.t.participants[a.p.id],sourceInvocationId:a.invocation_id,now,observe:async b=>({...providerProof(b),scope})}),/installed-provider-source-rule/);}
});

test('malformed owner expiry cannot create an immortal quota policy',async()=>{
 for(const expiryValue of ['garbage','',null]){const {f}=await leader();enableQuota(f);const policy={...f.t.native_quota_policy,expires_at:expiryValue};delete policy.protocol;delete policy.revision;delete policy.enabled_at;assert.throws(()=>f.send('native-protocol-quota-enable-v2',{revision:2,policy}),/finite-policy-expiry|bounded-string/);}
});

test('account exhaustion excludes every verified profile on that account regardless of SKU or generation',async()=>{
 const {f,a}=await leader();enableQuota(f);const account=knownBilling(a.p.id).account;for(const x of Object.values(f.state.subscription_invocations)){for(const billing of [x.receipt?.billing_before,x.receipt?.billing_after,x.context?.billing_observation])if(billing){billing.account=account;if(x.participant!==a.p.id){billing.sku='different-sku';billing.account_generation=7;}}}
 await quota(f,a);assert.equal(f.t.status,'paused');assert.equal(f.t.candidate,null);assert.equal(selectNativeQuotaFrontier(f.t,now).candidate,null);for(const p of Object.values(f.t.participants).filter(p=>p.native_admission))assert.equal(nativeQuotaEligible(f.t,p,now),false);
});

test('positive account evidence expires for aliases and actual contexts rather than reverting to unknown quota',async()=>{
 const {f,a}=await leader();enableQuota(f);const account=knownBilling(a.p.id).account;for(const x of Object.values(f.state.subscription_invocations))for(const billing of [x.receipt?.billing_before,x.receipt?.billing_after,x.context?.billing_observation])if(billing)billing.account=account;
 await quota(f,a);await quota(f,a,'available',now+1000,'account-positive');const alias=f.t.participants['peer-b'];assert.equal(nativeQuotaEligible(f.t,alias,now+1000),true);assert.equal(nativeQuotaEligible(f.t,alias,now+62000),false);assert.throws(()=>assertNativeBillingQuotaEligible(f.t,knownBilling(a.p.id),now+62000),/availability-expired/);
});

test('missing opt-in preserves policy freeze and request shapes; late opt-in cannot retrofit basis',async()=>{
 const {f,a}=await leader();enableQuota(f);assert.equal(Object.hasOwn(f.t.native_quota_policy,'same_leader_reactivation'),false);await quota(f,a);assert.equal(Object.hasOwn(f.t.native_quota_freeze,'reactivation_basis'),false);const policy={...f.t.native_quota_policy,same_leader_reactivation:true};delete policy.protocol;delete policy.revision;delete policy.enabled_at;f.send('native-protocol-quota-enable-v2',{revision:2,policy});await quota(f,a,'available',now+1000,'late-opt-positive');assert.equal(Object.hasOwn(f.t.native_quota_freeze,'reactivation_basis'),false);assert.equal(f.t.status,'paused');assert.match(f.t.native_quota_blocker,/original-opt-in-basis/);
});
test('original exhaustion basis survives later negative observations and changed account',async()=>{
 const {f,a}=await leader();enableQuota(f,{same_leader_reactivation:true});await quota(f,a);const original=structuredClone(f.t.native_quota_freeze);await quota(f,a,'exhausted',now+1000,'second-exhaustion');assert.deepEqual(f.t.native_quota_freeze,original);for(const b of [f.state.subscription_invocations[a.invocation_id].receipt.billing_before,f.state.subscription_invocations[a.invocation_id].receipt.billing_after,f.state.subscription_invocations[a.invocation_id].context.billing_observation])b.account=routingDigest('changed-account');await quota(f,a,'available',now+2000,'different-account');assert.deepEqual(f.t.native_quota_freeze,original);assert.equal(f.t.native_account_quotas[original.reactivation_basis.account_key].proof.status,'exhausted');
});

async function renew(f,a,{clock,id,status='available',actor=a.actor}={}){
 const record=await collectNativeProtocolQuota({state:f.state,team:f.t,participant:f.t.participants[a.p.id],sourceInvocationId:a.invocation_id,observe:async binding=>providerProof(binding,status,id,clock),now:clock});
 return f.send('native-protocol-quota-renew-v2',{observation:serializeNativeProtocolQuota(record)},actor,clock);
}
async function leased(){const {f,a}=await leader();enableQuota(f);await quota(f,a,'available',now,'first-positive');return {f,a,revisions:[f.t.native_quota_revision,f.t.quota_revision]};}
test('an unexpired same-meaning positive lease renews without changing revisions, election or review state',async()=>{
 const {f,a,revisions}=await leased(),before=structuredClone({leader:f.t.leader,candidate:f.t.candidate,review_candidate:f.t.review_candidate,status:f.t.status,floor:f.t.review_floor});
 assert.equal(nativeQuotaEligible(f.t,f.t.participants[a.p.id],now+61000),false,'the first lease alone lapses');
 const r=(await renew(f,a,{clock:now+20000,id:'renewal-one'})).result;assert.equal(r.renewed,true);assert.equal(r.protected_actions_granted,false);
 assert.deepEqual([f.t.native_quota_revision,f.t.quota_revision],revisions);
 assert.deepEqual({leader:f.t.leader,candidate:f.t.candidate,review_candidate:f.t.review_candidate,status:f.t.status,floor:f.t.review_floor},before);
 assert.equal(nativeQuotaEligible(f.t,f.t.participants[a.p.id],now+61000),true);assert.equal(nativeQuotaEligible(f.t,f.t.participants[a.p.id],now+81000),false);
 assert.equal(f.t.participants[a.p.id].native_protocol_quota.proof.observation_id,'renewal-one');
});
test('renewal refuses a lapsed lease, another status, an older or equal observation, a reused id, a wrong collector, a freeze, an exhausted account, a policy change and any eligibility change',async()=>{
 const cases={
  'lapsed lease':[async(f,a)=>renew(f,a,{clock:now+61000,id:'late'}),/unexpired-same-meaning/],
  'exhausted status':[async(f,a)=>renew(f,a,{clock:now+20000,id:'negative',status:'exhausted'}),/unexpired-same-meaning/],
  'equal observation time':[async(f,a)=>renew(f,a,{clock:now,id:'same-time'}),/order-required/],
  'wrong collector':[async(f,a)=>renew(f,a,{clock:now+20000,id:'foreign',actor:'collector:'+f.peers.find(x=>x.p.id!==a.p.id).p.native_binding.collector_id}),/bound-provider-collector/],
  'exhausted account record':[async(f,a)=>{for(const r of Object.values(f.t.native_account_quotas))r.proof.status='exhausted';return renew(f,a,{clock:now+20000,id:'sticky'});},/available-account-record/],
  'freeze':[async(f,a)=>{f.t.native_quota_freeze={old_leader:f.t.leader};return renew(f,a,{clock:now+20000,id:'frozen'});},/outside-handover/],
  'unapplied handover':[async(f,a)=>{f.t.native_protocol_handover={state:'fenced'};return renew(f,a,{clock:now+20000,id:'fenced'});},/outside-handover/],
  'policy revision':[async(f,a)=>{f.t.native_quota_policy.revision=2;return renew(f,a,{clock:now+20000,id:'new-policy'});},/unexpired-same-meaning/],
  'reused observation id':[async(f,a)=>renew(f,a,{clock:now+20000,id:'first-positive'}),/observation-id-reused/],
  'eligibility change':[async(f,a)=>{const other=Object.values(f.t.participants).find(p=>p.id!==a.p.id&&p.native_binding);other.native_account_exclusions={keys:['stale-key'],available:{}};return renew(f,a,{clock:now+20000,id:'shifts'});},/eligibility-changed/]
 };
 for(const [name,[run,code]] of Object.entries(cases)){
  const {f,a,revisions}=await leased(),lease=structuredClone(f.t.participants[a.p.id].native_protocol_quota);
  await assert.rejects(Promise.resolve().then(()=>run(f,a)),code,name);
  assert.deepEqual(f.t.participants[a.p.id].native_protocol_quota,lease,name);assert.deepEqual([f.t.native_quota_revision,f.t.quota_revision],revisions,name);
 }
});
