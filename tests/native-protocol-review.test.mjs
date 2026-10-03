import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {authorityFixture,now,at,expiry} from './helpers/native-calibration.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';
import {applySubscriptionAccounting} from '../scripts/team-subscription.mjs';
import {createProtocolLeaderAckRequest,createProtocolLeadershipAuditRequest,formatProtocolAction,protocolActionSlot,readProtocolActionResponse} from '../scripts/team-native-action.mjs';
import {collectNativeActionProfile,serializeNativeModelProfile} from '../scripts/native-model-profile.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {buildProtocolLeadershipAuditTarget,PROTOCOL_LEADERSHIP_AUDIT_RULES} from '../scripts/team-protocol-review.mjs';
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
function prepare(f,{nonce='control-one',actionId='action-one',operationId=randomUUID(),sourceInvocationId}={}){
 const core=sourceInvocationId?createProtocolLeadershipAuditRequest(f.state,f.t,{actionId,sourceInvocationId,now}):createProtocolLeaderAckRequest(f.t,{actionId,now});
 const p=f.t.participants[core.request.participant],peer=f.peers.find(peer=>peer.p.id===p.id),ctx=peer.manifest('action-'+nonce),context_id='ledger-action-'+nonce,actor='collector:'+p.native_binding.collector_id;
 const billing={provider:null,origin:null,account:null,sku:null,mode:'unknown',paid_fallback:'unknown',provenance:'unavailable',auth_method:null,credit_availability:'unknown',observed_at:at,account_generation:0,consistent:true};
 f.send('subscription-context-capture-v2',{participant_id:p.id,context:{id:context_id,native_id:ctx.native_id,descriptor_digest:p.native_binding.descriptor_digest,incarnation:p.incarnation,unit_scope:f.unit,billing_observation:billing,observed_model:null,observed_at:at,expires_at:new Date(now+300000).toISOString(),owned:true,read_only:true}},actor);
 const action={...core,prompt_digest:routingDigest(formatProtocolAction(core)),operation_id:operationId};
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
function completion(f,a){return {protocol:1,scope:{team:'team',participant:a.p.id,incarnation:a.p.incarnation,epoch:a.reservation.epoch,descriptor_digest:a.p.native_binding.descriptor_digest},operation:a.action.operation_id,kind:a.action.kind,invocation_id:a.invocation_id,nonce:a.nonce,native_id:a.ctx.native_id,consume_type:'subscription-consume-v2',created_at:at,closed_at:at,stopped:true,callback_drained:true,evidence_digest:routingDigest('owned-closure-fixture')};}
async function settled(){const f=await fixture();f.send('native-protocol-control-enable-v2',{revision:1,policy:f.policy});const a=prepare(f);reserve(f,a);consume(f,a);const native=receipt(f,a);await capture(f,a,native);return {f,a};}


async function leader(){const {f,a}=await settled();f.send('native-leader-ack-capture-v2',{invocation_id:a.invocation_id,nonce:a.nonce,completion:completion(f,a)},a.actor);return {f,a};}
function enableAudit(f,revision=1,max='80'){return f.send('native-protocol-review-enable-v2',{revision,policy:{...f.policy,kind:'protocol-leadership-audit',unit_allocations:[{unit_digest:f.unit_digest,max_tokens:max,allocation_revision:1}]}});}
function auditReply(a,verdict='approve',findings=[]){return JSON.stringify({verdict,action_id:a.action.action_id,request_digest:a.action.request_digest,target_digest:a.action.request.target_digest,findings});}
async function audit(f,source,nonce='audit-one',verdict='approve',findings=[]){const a=prepare(f,{nonce,actionId:nonce,sourceInvocationId:source.invocation_id});reserve(f,a);consume(f,a);const native=receipt(f,a,{raw:auditReply(a,verdict,findings)});await capture(f,a,native);const result=f.send('native-protocol-review-capture-v2',{invocation_id:a.invocation_id,nonce:a.nonce,completion:completion(f,a)},a.actor);return {a,result};}

test('immutable audit target is bounded, stable across current roster/budget changes and historical expiry',async()=>{
 const {f,a}=await leader(),target=buildProtocolLeadershipAuditTarget(f.state,f.t,a.invocation_id),digest=routingDigest(target);
 assert.deepEqual(target.phases.map(p=>p.event_id),['reservation','consume','settlement','profile','closure','ack']);assert.ok(Buffer.byteLength(JSON.stringify(target))<16384);
 f.t.participants[a.p.id].revoked=true;f.t.participants[a.p.id].availability='left';f.state.subscription_allocations[f.unit_digest].max_tokens='200000';
 assert.equal(routingDigest(buildProtocolLeadershipAuditTarget(f.state,f.t,a.invocation_id)),digest);
 const text=JSON.stringify(target);assert.equal(text.includes('original_output'),false);assert.equal(text.includes('billing_observation'),false);assert.equal(text.includes('account_generation'),false);
 target.phases[0].facts.epoch=900;assert.equal(routingDigest(buildProtocolLeadershipAuditTarget(f.state,f.t,a.invocation_id)),digest);
});
test('historical source corruption refuses immutable target construction',async()=>{
 for(const modify of [x=>delete x.action_ack,x=>x.action_ack.epoch++,x=>x.charged_tokens='31',x=>x.action_observation.admission_id='foreign',x=>x.action_seal.output_digest=routingDigest('forged'),x=>x.action_ack.completion.callback_drained=false]){
  const {f,a}=await leader();modify(f.state.subscription_invocations[a.invocation_id]);assert.throws(()=>buildProtocolLeadershipAuditTarget(f.state,f.t,a.invocation_id));
 }
});
test('typed ACK and audit budgets do not collide at equal revisions while global allocation is shared',async()=>{
 const {f,a}=await leader();enableAudit(f,1,'40');const b=prepare(f,{nonce:'audit-one',sourceInvocationId:a.invocation_id});reserve(f,b);consume(f,b);
 assert.equal(Object.hasOwn(f.state.subscription_invocations[a.invocation_id],'control_policy_kind'),false);assert.equal(f.state.subscription_invocations[b.invocation_id].control_policy_kind,'protocol-leadership-audit');
 assert.equal(f.state.subscription_invocations[b.invocation_id].control_policy_revision,1);assert.equal(f.state.subscription_invocations[a.invocation_id].control_policy_revision,1);
 const native=receipt(f,b,{raw:auditReply(b)});await capture(f,b,native);const r=f.send('native-protocol-review-capture-v2',{invocation_id:b.invocation_id,nonce:b.nonce,completion:completion(f,b)},b.actor);
 assert.equal(r.result.verdict,'approve');assert.equal(r.result.protected_actions_granted,false);assert.deepEqual(f.t.work,{});assert.equal(f.t.epoch,2);assert.equal(f.t.leader,a.p.id);
 assert.equal(f.state.subscription_invocations[b.invocation_id].charged_tokens,'30');
});
test('current independent strongest reviewer, request and exact source context are bound',async()=>{
 const {f,a}=await leader();enableAudit(f);const b=prepare(f,{nonce:'audit-one',sourceInvocationId:a.invocation_id});assert.notEqual(b.p.id,a.p.id);
 b.reservation.action.request.target.phases[0].facts.epoch++;assert.throws(()=>reserve(f,b),/fixed-action/);
 const c=prepare(f,{nonce:'audit-other',sourceInvocationId:a.invocation_id});f.t.participants[c.p.id].availability='busy';assert.throws(()=>reserve(f,c),/current-fixed-action/);assert.equal(f.state.subscription_invocations[c.invocation_id],undefined);
 const {f:g,a:source}=await leader();enableAudit(g);const d=prepare(g,{nonce:'audit-context',sourceInvocationId:source.invocation_id});g.t.subscription_contexts[d.reservation.context_id].native_id=source.ctx.native_id;assert.throws(()=>reserve(g,d),/independent-audit-context/);
});
test('strict verdicts accept negative findings but reject extra, unknown, duplicate or unsorted findings',async()=>{
 const {f,a}=await leader();enableAudit(f);const b=prepare(f,{nonce:'audit-one',sourceInvocationId:a.invocation_id}),pair=PROTOCOL_LEADERSHIP_AUDIT_RULES[0],finding={event_id:pair.event_id,rule_id:pair.rule_id};
 for(const verdict of ['changes-requested','blocked'])assert.equal(readProtocolActionResponse(auditReply(b,verdict,[finding]),b.action).verdict,verdict);
 for(const [verdict,findings] of [['approve',[finding]],['blocked',[]],['blocked',[finding,finding]],['blocked',[{event_id:'foreign',rule_id:'foreign'}]],['blocked',[{...finding,explanation:'arbitrary'}]]])assert.throws(()=>readProtocolActionResponse(auditReply(b,verdict,findings),b.action));
 const valid=JSON.parse(auditReply(b));valid.extra=true;assert.throws(()=>readProtocolActionResponse(JSON.stringify(valid),b.action));
 assert.throws(()=>readProtocolActionResponse(''+auditReply(b)+' trailing',b.action));
});
test('negative native outputs retain own profile provenance and remain sticky across policy and epoch changes',async()=>{
 const {f,a}=await leader();enableAudit(f);const r=PROTOCOL_LEADERSHIP_AUDIT_RULES[0],finding={event_id:r.event_id,rule_id:r.rule_id};
 const first=await audit(f,a,'audit-negative','changes-requested',[finding]),target=first.a.action.request.target_digest;
 assert.equal(first.result.result.unresolved_negative,true);assert.equal(f.state.subscription_invocations[first.a.invocation_id].action_observation.rank_eligible,false);
 f.t.policy.installation.previous_policy_revision=f.t.policy.revision;f.t.policy.revision++;f.t.epoch++;enableAudit(f,2);const second=await audit(f,a,'audit-later');
 assert.equal(second.a.action.request.target_digest,target);assert.equal(second.result.result.unresolved_negative,true);assert.equal(f.t.native_protocol_reviews[target].records.length,2);
 assert.equal(f.t.native_protocol_reviews[target].records[0].verdict,'changes-requested');assert.equal(f.t.native_protocol_reviews[target].records[1].verdict,'approve');
});
test('consumed audit retry cannot wash its slot through nonce, action ID or control policy revision',async()=>{
 const {f,a}=await leader();enableAudit(f);const first=await audit(f,a,'audit-consumed');enableAudit(f,2);
 const next=prepare(f,{nonce:'audit-retry',actionId:'different',sourceInvocationId:a.invocation_id});assert.equal(protocolActionSlot(first.a.action),protocolActionSlot(next.action));assert.throws(()=>reserve(f,next),/slot-already/);
});
test('own review capture rejects exchanged closure, stale frontier and foreign collector',async()=>{
 const {f,a}=await leader();enableAudit(f);const b=prepare(f,{nonce:'audit-one',sourceInvocationId:a.invocation_id});reserve(f,b);consume(f,b);const native=receipt(f,b,{raw:auditReply(b,'blocked',[{event_id:'ack',rule_id:'applied-exact-ack-binding'}])});await capture(f,b,native);
 const c={invocation_id:b.invocation_id,nonce:b.nonce,completion:completion(f,b)};
 assert.throws(()=>f.send('native-protocol-review-capture-v2',c,'owner:fixture'),/collector/);
 assert.throws(()=>f.send('native-protocol-review-capture-v2',{...c,completion:{...c.completion,kind:'protocol-leader-ack'}},b.actor),/completion/);
 f.t.epoch++;assert.throws(()=>f.send('native-protocol-review-capture-v2',c,b.actor),/admission/);assert.equal(f.t.native_protocol_reviews,undefined);
});

test('combined native unit allocation includes ACK, calibration and audit reservations',async()=>{
 const {f,a}=await leader();enableAudit(f);const b=prepare(f,{nonce:'audit-global',sourceInvocationId:a.invocation_id});
 const used=Object.values(f.state.subscription_invocations).filter(x=>x.unit_digest===f.unit_digest&&x.state!=='aborted').reduce((n,x)=>n+BigInt(x.state==='settled'?x.charged_tokens:x.estimate_tokens),0n);
 f.state.subscription_allocations[f.unit_digest].max_tokens=String(used+39n);
 assert.throws(()=>reserve(f,b),/token-allocation-exceeded/);assert.equal(f.state.subscription_invocations[b.invocation_id],undefined);
});
test('review request historical source remains readable beyond original observation expiry without reviewer refresh',async()=>{
 const {f,a}=await leader(),original=buildProtocolLeadershipAuditTarget(f.state,f.t,a.invocation_id);enableAudit(f);
 assert.deepEqual(buildProtocolLeadershipAuditTarget(f.state,f.t,a.invocation_id),original);
 assert.throws(()=>createProtocolLeadershipAuditRequest(f.state,f.t,{actionId:'expired-audit',sourceInvocationId:a.invocation_id,now:now+1000000}),/independent-audit-reviewer/);
});

test('legacy ACK reservation retains exact historic stored shape and ACK policy fallback through settlement',async()=>{
 const f=await fixture();f.send('native-protocol-control-enable-v2',{revision:1,policy:f.policy});const a=prepare(f);reserve(f,a);
 const stored=f.state.subscription_invocations[a.invocation_id],expected={...structuredClone(a.reservation),protocol:2,context:structuredClone(f.t.subscription_contexts[a.reservation.context_id]),team:f.t.id,collector:a.actor,descriptor_digest:a.p.native_binding.descriptor_digest,unit_digest:f.unit_digest,state:'prepared',control_policy_revision:1,model_revision:a.p.model.model_revision};
 assert.deepEqual(stored,expected);assert.equal(routingDigest(stored),routingDigest(expected));assert.equal(Object.hasOwn(stored,'control_policy_kind'),false);
 consume(f,a);const native=receipt(f,a);await capture(f,a,native);f.send('native-leader-ack-capture-v2',{invocation_id:a.invocation_id,nonce:a.nonce,completion:completion(f,a)},a.actor);
 assert.equal(Object.hasOwn(stored,'control_policy_kind'),false);assert.equal(stored.action_ack.leader,a.p.id);assert.equal(f.t.epoch,2);
});
