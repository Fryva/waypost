import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {authorityFixture,now,at,expiry} from './helpers/native-calibration.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';
import {applySubscriptionAccounting} from '../scripts/team-subscription.mjs';
import {createProtocolLeaderAckRequest,createProtocolHandoverAckRequest,formatProtocolAction,protocolActionSlot} from '../scripts/team-native-action.mjs';
import {collectNativeActionProfile,serializeNativeModelProfile} from '../scripts/native-model-profile.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {collectNativeProtocolQuota,serializeNativeProtocolQuota,nativeQuotaSource,nativeQuotaEligible,selectNativeQuotaFrontier} from '../scripts/team-native-quota.mjs';
let shared;
async function fixture(){
 shared??=authorityFixture({billing:name=>knownBilling('peer-'+name)});const original=await shared,s=structuredClone(original.state);Object.assign(s,{protocol:1,owner_hash:'fixture',task_bindings:{task:'team'}});
 Object.assign(s.teams.team,{task:'task',policy:{protocol:1,revision:1,mode:'automatic',domain:'coding',generated_at:at,expires_at:expiry,sources:[{id:'fixture',url:'https://example.org/fixture',retrieved_at:at}],profiles:[],evidence_floor:['adapter-observed']},messages:[],work:{},status:'forming',leader:null,candidate:null,required_review_models:[],native_policy_bootstrap:true});
 let state=reduceTeamEvent(s,{type:'native-policy-install-v2',team:'team',actor:'owner:fixture',at,request_key:'install',cohort_id:'cohort',expected_policy_revision:1,scope:'waypost-protocol'},{revision:original.revision}).state,t=state.teams.team;
 const unit={scope:'team-native-counter',team:'team',counter_schema:'fixture-counter'},unit_digest=routingDigest(unit),policy={kind:'protocol-leader-ack',allow_unknown_quota:true,max_calls:2,max_estimate_tokens:'40',timeout_ms:1000,expires_at:expiry,unit_allocations:[{unit_digest,max_tokens:'80',allocation_revision:1}]};
 const H={owner:(_s,c)=>{if(c.actor!=='owner:fixture')throw Error('owner-required');}};
 let seq=0;function send(type,fields={},actor='owner:fixture',clock=now){const next=reduceTeamEvent(state,{type,team:'team',actor,at:new Date(clock).toISOString(),request_key:'quota-fixture-'+(++seq),...fields},{revision:original.revision+seq});state=next.state;return next;}
 return {get state(){return state;},get t(){return state.teams.team;},unit,unit_digest,policy,send,peers:original.peers};
}
function prepare(f,{nonce='control-one',actionId='action-one',operationId=randomUUID()}={}){
 const p=f.t.participants[f.t.candidate],peer=f.peers.find(peer=>peer.p.id===p.id),ctx=peer.manifest('action-'+nonce),context_id='ledger-action-'+nonce,actor='collector:'+p.native_binding.collector_id;
 const billing=knownBilling(p.id);
 f.send('subscription-context-capture-v2',{participant_id:p.id,...(f.t.native_quota_freeze?{protocol_handover_digest:routingDigest(f.t.native_protocol_handover)}:{}),context:{id:context_id,native_id:ctx.native_id,descriptor_digest:p.native_binding.descriptor_digest,incarnation:p.incarnation,unit_scope:f.unit,billing_observation:billing,observed_model:null,observed_at:at,expires_at:new Date(now+300000).toISOString(),owned:true,read_only:true}},actor);
 const core=f.t.native_protocol_handover?.state==='prepared'?createProtocolHandoverAckRequest(f.state,f.t,{actionId,now}):createProtocolLeaderAckRequest(f.t,{actionId,now}),action={...core,prompt_digest:routingDigest(formatProtocolAction(core)),operation_id:operationId};
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
function completion(f,a){return {protocol:1,scope:{team:'team',participant:a.p.id,incarnation:a.p.incarnation,epoch:a.action.request.runtime_epoch??a.reservation.epoch,descriptor_digest:a.p.native_binding.descriptor_digest},operation:a.action.operation_id,kind:a.action.kind,invocation_id:a.invocation_id,nonce:a.nonce,native_id:a.ctx.native_id,consume_type:'subscription-consume-v2',created_at:at,closed_at:at,stopped:true,callback_drained:true,evidence_digest:routingDigest('owned-closure-fixture')};}
async function settled(){const f=await fixture();f.send('native-protocol-control-enable-v2',{revision:1,policy:f.policy});const a=prepare(f);reserve(f,a);consume(f,a);const native=receipt(f,a);await capture(f,a,native);return {f,a};}


function knownBilling(participant='peer-a'){return {provider:'route',origin:'https://provider.fixture',account:routingDigest('quota-account-'+participant),sku:'fixture-subscription',mode:'subscription',paid_fallback:false,provenance:'native-runtime',auth_method:'native-fixture',credit_availability:'unavailable',observed_at:at,account_generation:0,consistent:true};}
async function leader(){const {f,a}=await settled();f.send('native-leader-ack-capture-v2',{invocation_id:a.invocation_id,nonce:a.nonce,completion:completion(f,a)},a.actor);return {f,a};}
function enableQuota(f){const sources=f.peers.flatMap(peer=>['available','exhausted'].map(status=>({status,documentation:'https://provider.fixture/docs/quota',collector_id:peer.p.native_binding.collector_id,source:'https://provider.fixture/quota',method:'GET /quota',evidence_kind:'provider-quota',provider_code:'subscription_'+status,scope:'provider-account'}))); return f.send('native-protocol-quota-enable-v2',{revision:1,policy:{automatic_handover:true,expires_at:expiry,source_rules:sources}});}
function providerProof(binding,status='exhausted',id='provider-one',clock=now){return {protocol:2,observation_id:id,status,reason:'provider-quota-'+status,source:'https://provider.fixture/quota',method:'GET /quota',evidence_kind:'provider-quota',provider_code:'subscription_'+status,scope:'provider-account',documentation:'https://provider.fixture/docs/quota',provider_confirmed:true,billing_digest:routingDigest(binding.billing),observed_at:new Date(clock).toISOString(),expires_at:new Date(clock+60000).toISOString()};}
async function quota(f,a,status='exhausted',clock=now,id='provider-one'){
 const p=f.t.participants[a.p.id],record=await collectNativeProtocolQuota({state:f.state,team:f.t,participant:p,sourceInvocationId:a.invocation_id,observe:async binding=>providerProof(binding,status,id,clock),now:clock});
 f.send('native-protocol-quota-capture-v2',{observation:serializeNativeProtocolQuota(record)},a.actor,clock);return record;
}
function stopProof(f,p){const xs=Object.values(f.state.subscription_invocations).filter(x=>x.team===f.t.id&&x.participant===p.id&&x.incarnation===p.incarnation&&x.epoch===f.t.epoch&&!['prepared','aborted'].includes(x.state));return {protocol:2,purpose:'protocol-quota-handover-stop',team:f.t.id,participant:p.id,incarnation:p.incarnation,epoch:f.t.epoch,descriptor_digest:p.native_binding.descriptor_digest,callback_drained:true,epoch_barrier:true,required_operations:xs.map(x=>x.id),operations:xs.map(x=>x.action?.operation_id).filter(Boolean),evidence_digest:routingDigest({fixture:'whole-runtime-stop',participant:p.id,epoch:f.t.epoch})};}
function captureStops(f){for(const p of Object.values(f.t.participants).filter(p=>p.native_binding))f.send('native-protocol-handover-stop-capture-v2',{stop_proof:stopProof(f,p)},'collector:'+p.native_binding.collector_id);}
function prepareHandover(f){captureStops(f);f.send('native-protocol-handover-prepare-v2');f.send('native-protocol-handover-enable-v2',{revision:1,policy:{...f.policy,kind:'protocol-handover-ack'}});}

test('all old-epoch scopes stop before fixed one-turn ACK applies provisional runtime epoch',async()=>{
 const {f,a}=await leader();enableQuota(f);await quota(f,a);const oldEpoch=f.t.epoch,oldFloor=f.t.review_floor;prepareHandover(f);const b=prepare(f,{nonce:'handover-one',actionId:'handover-one'});
 assert.equal(b.action.kind,'protocol-handover-ack');assert.equal(b.action.request.runtime_epoch,oldEpoch+1);assert.equal(b.reservation.epoch,oldEpoch);reserve(f,b);consume(f,b);const native=receipt(f,b);await capture(f,b,native);
 const result=f.send('native-protocol-handover-ack-capture-v2',{invocation_id:b.invocation_id,nonce:b.nonce,completion:completion(f,b)},b.actor);
 assert.equal(result.result.applied,true);assert.equal(result.result.protected_actions_granted,false);assert.equal(f.t.epoch,oldEpoch+1);assert.equal(f.t.leader,b.p.id);assert.equal(f.t.review_floor,oldFloor);assert.equal(f.t.native_quota_freeze,undefined);assert.equal(f.state.subscription_invocations[b.invocation_id].action_ack,undefined);assert.equal(f.state.subscription_invocations[b.invocation_id].protocol_handover_ack.leader,b.p.id);
});
test('child-only or partial stop vector cannot prepare, and scope changes invalidate whole callback stop',async()=>{
 const {f,a}=await leader();enableQuota(f);await quota(f,a);const p=f.t.participants[a.p.id],proof=stopProof(f,p);
 assert.throws(()=>f.send('native-protocol-handover-stop-capture-v2',{stop_proof:{...proof,callback_drained:false}},a.actor),/whole-old-epoch/);
 f.send('native-protocol-handover-stop-capture-v2',{stop_proof:proof},a.actor);assert.throws(()=>f.send('native-protocol-handover-prepare-v2'),/all-old-epoch/);
 captureStops(f);f.t.participants['peer-d'].incarnation='changed';assert.throws(()=>f.send('native-protocol-handover-prepare-v2'),/stop-scopes-changed/);
});
test('freeze permits accounting reconciliation but no new identity calibration audit or unbound context',async()=>{
 const {f,a}=await leader();enableQuota(f);await quota(f,a);
 assert.throws(()=>f.send('subscription-context-capture-v2',{participant_id:a.p.id,context:{}},a.actor),/transition-frozen/);
 assert.throws(()=>f.send('subscription-reserve-v2',{reservation:{purpose:'identity'}}),/transition-frozen/);
 assert.throws(()=>f.send('subscription-consume-v2',{invocation_id:a.invocation_id,nonce:a.nonce},a.actor),/transition-frozen/);
 assert.equal(f.send('subscription-usage-v2',{invocation_id:a.invocation_id,nonce:a.nonce,receipt:f.state.subscription_invocations[a.invocation_id].receipt},a.actor).result.unchanged,true);
});
test('changed frontier stale closure and consumed semantic retries cannot advance handover',async()=>{
 const {f,a}=await leader();enableQuota(f);await quota(f,a);prepareHandover(f);const b=prepare(f,{nonce:'handover-one'});reserve(f,b);consume(f,b);const native=receipt(f,b);await capture(f,b,native);
 assert.throws(()=>f.send('native-protocol-handover-ack-capture-v2',{invocation_id:b.invocation_id,nonce:b.nonce,completion:{...completion(f,b),scope:{...completion(f,b).scope,epoch:b.reservation.epoch}}},b.actor),/completion/);
 const modified=structuredClone(b.action);modified.action_id='new-id';modified.request.action_id='new-id';modified.request.policy_revision++;modified.request_digest=routingDigest(modified.request);assert.equal(protocolActionSlot(modified),protocolActionSlot(b.action));
 f.t.participants[b.p.id].availability='busy';assert.throws(()=>f.send('native-protocol-handover-ack-capture-v2',{invocation_id:b.invocation_id,nonce:b.nonce,completion:completion(f,b)},b.actor),/roster-changed|frontier/);assert.equal(f.t.leader,a.p.id);
});

test('same exhaustion refresh after settled ACK preserves pinned transition and permits capture',async()=>{
 const {f,a}=await leader();enableQuota(f);await quota(f,a);prepareHandover(f);const b=prepare(f,{nonce:'refresh-ack'});reserve(f,b);consume(f,b);const native=receipt(f,b);await capture(f,b,native);
 const pinned=structuredClone(f.t.native_protocol_handover),sample=structuredClone(f.t.participants[a.p.id].native_protocol_quota),revision=f.t.quota_revision,slot=structuredClone(f.t.native_control_slots[protocolActionSlot(b.action)]);
 await quota(f,a,'exhausted',now+1000,'provider-refresh');
 assert.deepEqual(f.t.native_protocol_handover,pinned);assert.deepEqual(f.t.participants[a.p.id].native_protocol_quota,sample);assert.equal(f.t.quota_revision,revision);assert.deepEqual(f.t.native_control_slots[protocolActionSlot(b.action)],slot);assert.equal(f.t.native_quota_observations[a.p.id].proof.observation_id,'provider-refresh');
 const result=f.send('native-protocol-handover-ack-capture-v2',{invocation_id:b.invocation_id,nonce:b.nonce,completion:completion(f,b)},b.actor,now+1000);assert.equal(result.result.applied,true);assert.equal(f.t.leader,b.p.id);
});
test('changed provider meaning invalidates prepared ACK but retains consumed semantic slot',async()=>{
 const {f,a}=await leader();enableQuota(f);await quota(f,a);prepareHandover(f);const b=prepare(f,{nonce:'changed-meaning'});reserve(f,b);consume(f,b);const native=receipt(f,b);await capture(f,b,native);const key=protocolActionSlot(b.action),slot=structuredClone(f.t.native_control_slots[key]);
 await quota(f,a,'available',now+1000,'provider-restored');assert.notEqual(f.t.native_protocol_handover.state,'prepared');assert.deepEqual(f.t.native_control_slots[key],slot);assert.throws(()=>f.send('native-protocol-handover-ack-capture-v2',{invocation_id:b.invocation_id,nonce:b.nonce,completion:completion(f,b)},b.actor,now+1000));assert.throws(()=>createProtocolHandoverAckRequest(f.state,f.t,{actionId:'paid-retry',now:now+1000}));assert.equal(f.t.leader,a.p.id);
});

test('late actual same-account context and consume are blocked before paid inference',async()=>{
 const {f,a}=await leader();enableQuota(f);await quota(f,a);prepareHandover(f);const b=prepare(f,{nonce:'late-account-switch'}),context=f.t.subscription_contexts[b.reservation.context_id],sameAccount=knownBilling(a.p.id);
 assert.throws(()=>f.send('subscription-context-capture-v2',{participant_id:b.p.id,protocol_handover_digest:routingDigest(f.t.native_protocol_handover),context:{id:'same-account-context',native_id:'same-account-native',descriptor_digest:b.p.native_binding.descriptor_digest,incarnation:b.p.incarnation,unit_scope:f.unit,billing_observation:sameAccount,observed_model:null,observed_at:at,expires_at:new Date(now+300000).toISOString(),owned:true,read_only:true}},b.actor),/provider-account-exhausted/);
 context.billing_observation=sameAccount;assert.throws(()=>reserve(f,b),/provider-account-exhausted/);context.billing_observation=knownBilling(b.p.id);reserve(f,b);f.t.subscription_contexts[b.reservation.context_id].billing_observation=sameAccount;assert.throws(()=>consume(f,b),/provider-account-exhausted/);assert.equal(f.state.subscription_invocations[b.invocation_id].state,'prepared');
});
