import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {authorityFixture,now,at,expiry} from './helpers/native-calibration.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';
import {applySubscriptionAccounting} from '../scripts/team-subscription.mjs';
import {createProtocolLeaderAckRequest,formatProtocolLeaderAck,protocolLeaderAckSlot} from '../scripts/team-native-action.mjs';
import {collectNativeActionProfile,serializeNativeModelProfile} from '../scripts/native-model-profile.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
let shared;
async function fixture(){
 shared??=authorityFixture();const original=await shared,s=structuredClone(original.state);Object.assign(s,{protocol:1,owner_hash:'fixture',task_bindings:{task:'team'}});
 Object.assign(s.teams.team,{task:'task',policy:{protocol:1,revision:1,mode:'automatic',domain:'coding',generated_at:at,expires_at:expiry,sources:[{id:'fixture',url:'https://example.org/fixture',retrieved_at:at}],profiles:[],evidence_floor:['adapter-observed']},messages:[],work:{},status:'forming',leader:null,candidate:null,required_review_models:[],native_policy_bootstrap:true});
 const state=reduceTeamEvent(s,{type:'native-policy-install-v2',team:'team',actor:'owner:fixture',at,request_key:'install',cohort_id:'cohort',expected_policy_revision:1,scope:'waypost-protocol'},{revision:original.revision}).state,t=state.teams.team;
 const unit={scope:'team-native-counter',team:'team',counter_schema:'fixture-counter'},unit_digest=routingDigest(unit),policy={kind:'protocol-leader-ack',allow_unknown_quota:true,max_calls:2,max_estimate_tokens:'40',timeout_ms:1000,expires_at:expiry,unit_allocations:[{unit_digest,max_tokens:'80',allocation_revision:1}]};
 const H={owner:(_s,c)=>{if(c.actor!=='owner:fixture')throw Error('owner-required');}};
 function send(type,fields={},actor='owner:fixture',clock=now){return applySubscriptionAccounting(state,t,{type,team:'team',actor,at:new Date(clock).toISOString(),...fields},clock,H);}
 return {state,t,unit,unit_digest,policy,send,peers:original.peers};
}
function prepare(f,{nonce='control-one',actionId='action-one',operationId=randomUUID()}={}){
 const p=f.t.participants[f.t.candidate],peer=f.peers.find(peer=>peer.p.id===p.id),ctx=peer.manifest('action-'+nonce),context_id='ledger-action-'+nonce,actor='collector:'+p.native_binding.collector_id;
 const billing={provider:null,origin:null,account:null,sku:null,mode:'unknown',paid_fallback:'unknown',provenance:'unavailable',auth_method:null,credit_availability:'unknown',observed_at:at,account_generation:0,consistent:true};
 f.send('subscription-context-capture-v2',{participant_id:p.id,context:{id:context_id,native_id:ctx.native_id,descriptor_digest:p.native_binding.descriptor_digest,incarnation:p.incarnation,unit_scope:f.unit,billing_observation:billing,observed_model:null,observed_at:at,expires_at:new Date(now+300000).toISOString(),owned:true,read_only:true}},actor);
 const core=createProtocolLeaderAckRequest(f.t,{actionId,now}),action={...core,prompt_digest:routingDigest(formatProtocolLeaderAck(core)),operation_id:operationId};
 const reservation={id:'subscription-'+nonce,nonce,participant:p.id,incarnation:p.incarnation,context_id,purpose:'protocol-control',requested_model:{provider:'route',model_id:peer.model.model_id,reasoning:'unknown'},suite_digest:action.prompt_digest,max_calls:1,timeout_ms:1000,estimate_tokens:'40',epoch:f.t.epoch,quota_revision:0,mode_revision:1,allocation_revision:1,action};
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
function completion(f,a){return {protocol:1,scope:{team:'team',participant:a.p.id,incarnation:a.p.incarnation,epoch:a.reservation.epoch,descriptor_digest:a.p.native_binding.descriptor_digest},operation:a.action.operation_id,kind:'protocol-leader-ack',invocation_id:a.invocation_id,nonce:a.nonce,native_id:a.ctx.native_id,consume_type:'subscription-consume-v2',created_at:at,closed_at:at,stopped:true,callback_drained:true,evidence_digest:routingDigest('owned-closure-fixture')};}
async function settled(){const f=await fixture();f.send('native-protocol-control-enable-v2',{revision:1,policy:f.policy});const a=prepare(f);reserve(f,a);consume(f,a);const native=receipt(f,a);await capture(f,a,native);return {f,a};}

test('owner explicitly enables existing bounded units; measured roles alone cannot dispatch control',async()=>{
 const f=await fixture(),a=prepare(f),before=structuredClone(f.state.subscription_allocations);assert.throws(()=>reserve(f,a),/owner-control-policy/);
 assert.throws(()=>f.send('native-protocol-control-enable-v2',{revision:1,policy:f.policy},a.actor),/owner/);
 for(const change of [p=>p.allow_unknown_quota=false,p=>p.unit_allocations[0].max_tokens='100001',p=>p.expires_at=new Date(Date.parse(expiry)+1).toISOString()]){const p=structuredClone(f.policy);change(p);assert.throws(()=>f.send('native-protocol-control-enable-v2',{revision:1,policy:p}));}
 f.send('native-protocol-control-enable-v2',{revision:1,policy:f.policy});assert.deepEqual(f.state.subscription_allocations,before);assert.equal(reserve(f,a).result.reserved,a.invocation_id);assert.equal(f.t.leader,null);
});
test('consume binds installed prompt and semantic slot survives failed output, new nonce and action ID',async()=>{
 const f=await fixture();f.send('native-protocol-control-enable-v2',{revision:1,policy:f.policy});const a=prepare(f);reserve(f,a);
 assert.throws(()=>f.send('subscription-consume-v2',{invocation_id:a.invocation_id,nonce:a.nonce,prompt_digest:routingDigest('wrong')},a.actor),/consume/);consume(f,a);
 const native=receipt(f,a,{raw:'{}'});assert.equal(f.state.subscription_invocations[a.invocation_id].charged_tokens,'30');await assert.rejects(capture(f,a,native));assert.equal(f.t.leader,null);
 const retry=prepare(f,{nonce:'control-retry',actionId:'new-id'});assert.equal(protocolLeaderAckSlot(retry.action),protocolLeaderAckSlot(a.action));assert.throws(()=>reserve(f,retry),/slot-already/);
});
test('prepared abort has no consumed slot while ceilings remain inside existing allocation',async()=>{
 const f=await fixture();f.send('native-protocol-control-enable-v2',{revision:1,policy:{...f.policy,max_calls:1}});const a=prepare(f);reserve(f,a);assert.throws(()=>reserve(f,prepare(f,{nonce:'other'})),/slot-already/);
 f.send('subscription-abort-v2',{invocation_id:a.invocation_id,nonce:a.nonce});assert.equal(f.t.native_control_slots,undefined);const b=prepare(f,{nonce:'replacement'});reserve(f,b);consume(f,b);
 f.send('subscription-uncertain-v2',{invocation_id:b.invocation_id,nonce:b.nonce},b.actor);assert.equal(f.state.subscription_invocations[b.invocation_id].state,'uncertain');assert.throws(()=>reserve(f,prepare(f,{nonce:'uncertain-retry'})));assert.equal(f.state.subscription_allocations[f.unit_digest].max_tokens,'100000');
});
test('malformed action seal and quarantine preserve genuine charged usage without an acknowledgement',async()=>{
 for(const settings of [{sealMutation:s=>s.native_receipt_digest=routingDigest('forged')},{isolation:false},{coverage:'partial'}]){
  const f=await fixture();f.send('native-protocol-control-enable-v2',{revision:1,policy:f.policy});const a=prepare(f);reserve(f,a);consume(f,a);receipt(f,a,settings);const x=f.state.subscription_invocations[a.invocation_id];
  assert.equal(x.state,settings.coverage==='partial'?'uncertain':'settled');if(x.state==='settled')assert.equal(x.charged_tokens,'30');assert.equal(f.t.leader,null);assert.ok(f.t.native_control_slots[protocolLeaderAckSlot(a.action)]);
  assert.throws(()=>f.send('native-leader-ack-capture-v2',{invocation_id:a.invocation_id,nonce:a.nonce,completion:completion(f,a)},a.actor));
 }
});
test('own settled action plus exact drained closure atomically acknowledges one coordinator epoch',async()=>{
 const {f,a}=await settled(),c=completion(f,a),request={invocation_id:a.invocation_id,nonce:a.nonce,completion:c};
 const r=f.send('native-leader-ack-capture-v2',request,a.actor);assert.equal(r.result.applied,true);assert.equal(f.t.leader,a.p.id);assert.equal(f.t.epoch,2);assert.equal(f.t.status,'active');assert.equal(r.result.protected_actions_granted,false);
 assert.equal(f.send('native-leader-ack-capture-v2',request,a.actor).result.unchanged,true);assert.throws(()=>f.send('native-leader-ack-capture-v2',{...request,completion:{...c,evidence_digest:routingDigest('different')}},a.actor),/immutable/);
});
test('capture rejects stale frontier, actor, profile, native binding and closure without renewing source clocks',async()=>{
 for(const mutation of [f=>f.t.epoch++,f=>f.t.participants[f.t.review_candidate].availability='busy',f=>f.t.participants[f.t.review_candidate].revoked=true,f=>f.t.handover={},f=>f.t.quota_revision++,f=>f.t.participants[f.t.candidate].quota_observation={status:'exhausted'}]){
  const {f,a}=await settled();mutation(f);assert.throws(()=>f.send('native-leader-ack-capture-v2',{invocation_id:a.invocation_id,nonce:a.nonce,completion:completion(f,a)},a.actor));assert.equal(f.t.leader,null);
 }
 const {f,a}=await settled();assert.throws(()=>f.send('native-leader-ack-capture-v2',{invocation_id:a.invocation_id,nonce:a.nonce,completion:completion(f,a)},'owner:fixture'),/collector/);
 for(const patch of [{operation:randomUUID()},{callback_drained:false},{native_id:'foreign'},{closed_at:new Date(now-1).toISOString()}])assert.throws(()=>f.send('native-leader-ack-capture-v2',{invocation_id:a.invocation_id,nonce:a.nonce,completion:{...completion(f,a),...patch}},a.actor));
 assert.throws(()=>f.send('native-leader-ack-capture-v2',{invocation_id:a.invocation_id,nonce:a.nonce,completion:completion(f,a)},a.actor,Date.parse(expiry)));assert.equal(f.state.subscription_invocations[a.invocation_id].action_observation.observed_at,at);
});

test('control ceilings and known exhaustion refuse dispatch; overshoot remains charged and cannot acknowledge',async()=>{
 const f=await fixture();f.send('native-protocol-control-enable-v2',{revision:1,policy:{...f.policy,unit_allocations:[{unit_digest:f.unit_digest,max_tokens:'20',allocation_revision:1}]}});const a=prepare(f);assert.throws(()=>reserve(f,a),/ceiling/);
 const g=await fixture();g.send('native-protocol-control-enable-v2',{revision:1,policy:g.policy});const b=prepare(g);b.p.quota_observation={status:'exhausted'};assert.throws(()=>reserve(g,b),/exhausted/);
 const h=await fixture();h.send('native-protocol-control-enable-v2',{revision:1,policy:h.policy});const c=prepare(h);reserve(h,c);consume(h,c);const native=receipt(h,c,{actual:'50'});await capture(h,c,native);assert.equal(h.state.subscription_invocations[c.invocation_id].charged_tokens,'50');assert.throws(()=>h.send('native-leader-ack-capture-v2',{invocation_id:c.invocation_id,nonce:c.nonce,completion:completion(h,c)},c.actor),/admission/);assert.equal(h.t.leader,null);
});
test('profile capture keeps the stored source immutable across malformed or foreign snapshot submissions',async()=>{
 const {f,a}=await settled(),x=f.state.subscription_invocations[a.invocation_id],original=structuredClone(x.action_observation);
 for(const mutate of [p=>p.native_id='foreign',p=>p.action.request_digest=routingDigest('foreign'),p=>p.expires_at=new Date(Date.parse(p.expires_at)+1).toISOString(),p=>p.profile.native_model_id='foreign',p=>p.admission_digest=routingDigest('foreign')]){const profile=structuredClone(original);mutate(profile);assert.throws(()=>f.send('native-action-profile-capture-v2',{invocation_id:a.invocation_id,nonce:a.nonce,profile},a.actor));assert.deepEqual(x.action_observation,original);}
 assert.throws(()=>f.send('native-action-profile-capture-v2',{invocation_id:a.invocation_id,nonce:a.nonce,profile:original},'owner:fixture'),/collector/);assert.equal(x.action_seal.original_output,x.action_seal.native_receipt.output);
});
