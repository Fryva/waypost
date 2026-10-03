import test from 'node:test';
import assert from 'node:assert/strict';
import {protocolHostFixture} from './helpers/native-protocol-host.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {buildProtocolLeadershipAuditTarget,PROTOCOL_LEADERSHIP_AUDIT_RULES} from '../scripts/team-protocol-review.mjs';
async function fixture(t,options={}){
 const f=await protocolHostFixture(t,options);
 const acknowledged=await f.host.acknowledgeProtocolLeadership({actionId:'source-ack',nonce:'source-ack',estimateTokens:'40'});
 assert.equal(acknowledged.leader_acknowledged,true);
 const reviewer=f.load().state.teams.team.review_candidate;
 assert.notEqual(reviewer,f.participant);
 const host=f.hostFor(reviewer);
 host.enableProtocolReview({revision:1,policy:{kind:'protocol-leadership-audit',allow_unknown_quota:true,max_calls:1,max_estimate_tokens:'40',timeout_ms:1000,expires_at:f.expiry,unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:'40',allocation_revision:f.allocation.revision}]}});
 return {...f,reviewer,reviewHost:host,sourceInvocationId:'subscription-source-ack'};
}
const audit=f=>f.reviewHost.auditProtocolLeadership({actionId:'audit-one',sourceInvocationId:f.sourceInvocationId,nonce:'audit-one',estimateTokens:'40'});
test('strongest distinct native protocol critic consumes once and captures only after settlement and owned closure',async t=>{
 const f=await fixture(t),before=f.load(),target=buildProtocolLeadershipAuditTarget(before.state,before.state.teams.team,f.sourceInvocationId);
 const result=await audit(f);
 assert.equal(result.protocol_review_captured,true);assert.equal(result.protected_actions_granted,false);
 const state=f.load().state,x=state.subscription_invocations['subscription-audit-one'];
 assert.equal(x.state,'settled');assert.equal(x.charged_tokens,'30');assert.equal(x.participant,f.reviewer);assert.ok(x.protocol_review);
 assert.notEqual(x.context.native_id,state.subscription_invocations[f.sourceInvocationId].context.native_id);
 assert.deepEqual(buildProtocolLeadershipAuditTarget(state,state.teams.team,f.sourceInvocationId),target);
 assert.ok(f.calls.indexOf('subscription-usage-v2',f.calls.indexOf('native-leader-ack-capture-v2')+1)<f.calls.indexOf('native-protocol-review-capture-v2'));
 assert.ok(f.calls.lastIndexOf('native-stop')<f.calls.indexOf('native-protocol-review-capture-v2'));
 assert.equal(f.calls.filter(x=>x==='native-send').length,2);assert.deepEqual(state.teams.team.work,{});
 const recovered=await f.hostFor(f.reviewer).recoverProtocolAudit({invocationId:x.id});assert.equal(recovered.protocol_review_captured,true);assert.equal(f.calls.filter(x=>x==='native-send').length,2);
 await assert.rejects(f.reviewHost.auditProtocolLeadership({actionId:'rename',sourceInvocationId:f.sourceInvocationId,nonce:'rename',estimateTokens:'40'}));assert.equal(f.calls.filter(x=>x==='native-send').length,2);
});
test('interrupted audit publication recovers original sealed verdict without another native inference',async t=>{
 const f=await fixture(t,{interruptReview:true});await assert.rejects(audit(f),/interrupted review capture/);
 const x=f.load().state.subscription_invocations['subscription-audit-one'];assert.equal(x.state,'settled');assert.ok(x.action_observation);assert.equal(x.protocol_review,undefined);
 const recovered=await f.hostFor(f.reviewer).recoverProtocolAudit({invocationId:x.id});assert.equal(recovered.protocol_review_captured,true);assert.equal(f.calls.filter(x=>x==='native-send').length,2);
});
test('audit profile interruption recovers only original receipt and observation clock after owned closure',async t=>{
 const f=await fixture(t,{interruptReviewProfile:true}),result=await audit(f);assert.equal(result.protocol_review_captured,false);
 let x=f.load().state.subscription_invocations['subscription-audit-one'];assert.equal(x.state,'settled');assert.equal(x.action_observation,undefined);const original=x.action_seal.observed_at;
 const recovered=await f.hostFor(f.reviewer).recoverProtocolAudit({invocationId:x.id});assert.equal(recovered.protocol_review_captured,true);
 x=f.load().state.subscription_invocations[x.id];assert.equal(x.action_observation.observed_at,original);assert.equal(f.calls.filter(x=>x==='native-send').length,2);
});
test('malformed or partial audit retains charged tokens or unresolved hold without publishing a verdict',async t=>{
 for(const option of [{auditMalformed:true},{auditPartial:true}]){
  const f=await fixture(t,option),result=await audit(f),x=f.load().state.subscription_invocations['subscription-audit-one'];
  assert.equal(result.protocol_review_captured,false);assert.equal(x.protocol_review,undefined);assert.equal(x.state,option.auditPartial?'uncertain':'settled');if(!option.auditPartial)assert.equal(x.charged_tokens,'30');
  await assert.rejects(f.reviewHost.auditProtocolLeadership({actionId:'other',sourceInvocationId:f.sourceInvocationId,nonce:'other',estimateTokens:'40'}));assert.equal(f.calls.filter(x=>x==='native-send').length,2);
 }
});
test('author endpoint and generic project review cannot use scoped protocol critic admission',async t=>{
 const f=await fixture(t);await assert.rejects(f.host.auditProtocolLeadership({actionId:'author',sourceInvocationId:f.sourceInvocationId,nonce:'author',estimateTokens:'40'}),/reviewer-endpoint/);
 await assert.rejects(f.reviewHost.review({workId:'not-a-project-grant'}));assert.equal(f.calls.filter(x=>x==='native-send').length,1);
 await assert.rejects(f.reviewHost.recoverProtocolAudit({invocationId:f.sourceInvocationId}),/recovery-source/);
});

test('a negative native audit is preserved separately from project work and cannot imply approval',async t=>{
 const pair=PROTOCOL_LEADERSHIP_AUDIT_RULES[0],f=await fixture(t,{auditVerdict:'changes-requested',auditFindings:[{event_id:pair.event_id,rule_id:pair.rule_id}]}),result=await audit(f);
 assert.equal(result.protocol_review_captured,true);assert.equal(result.protocol_review.verdict,'changes-requested');
 const state=f.load().state,x=state.subscription_invocations['subscription-audit-one'],aggregate=state.teams.team.native_protocol_reviews[x.action.request.target_digest];
 assert.equal(aggregate.unresolved_negative,true);assert.equal(aggregate.records.length,1);assert.equal(x.protocol_review.verdict,'changes-requested');assert.deepEqual(state.teams.team.work,{});
 const original=structuredClone(x.protocol_review);await f.hostFor(f.reviewer).recoverProtocolAudit({invocationId:x.id});assert.deepEqual(f.load().state.subscription_invocations[x.id].protocol_review,original);assert.equal(f.calls.filter(x=>x==='native-send').length,2);
});
