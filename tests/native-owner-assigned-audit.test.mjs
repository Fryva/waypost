import test from 'node:test';
import assert from 'node:assert/strict';
import {protocolHostFixture} from './helpers/native-protocol-host.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {createProtocolLeadershipAuditRequest} from '../scripts/team-native-action.mjs';
import {listedReviewer,policyRow} from '../scripts/team.mjs';
import {PROTOCOL_LEADERSHIP_AUDIT_RULES} from '../scripts/team-protocol-review.mjs';
// Owner-assigned teams: the leadership audit is run by the top independent reviewer of the owner's list.
async function fixture(t,options={}){
 const f=await protocolHostFixture(t,{ownerAssigned:true,...options});
 assert.equal((await f.host.acknowledgeProtocolLeadership({actionId:'source-ack',nonce:'source-ack',estimateTokens:'40'})).leader_acknowledged,true);
 const reviewer=f.load().state.teams.team.review_candidate;
 f.hostFor(reviewer).enableProtocolReview({revision:1,policy:{kind:'protocol-leadership-audit',allow_unknown_quota:true,max_calls:1,max_estimate_tokens:'40',timeout_ms:1000,expires_at:f.expiry,unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:'40',allocation_revision:f.allocation.revision}]}});
 return {...f,reviewer,reviewHost:f.hostFor(reviewer),sourceInvocationId:'subscription-source-ack'};
}
const audit=f=>f.reviewHost.auditProtocolLeadership({actionId:'audit-one',sourceInvocationId:f.sourceInvocationId,nonce:'audit-one',estimateTokens:'40'});
const now=f=>Date.parse(f.load().state.teams.team.policy.generated_at)+1000;
test('the owner-assigned audit request names the top independent listed reviewer and pins the assignment digest',async t=>{
 const f=await fixture(t),{state}=f.load(),team=state.teams.team,n=now(f);
 const {request:q}=createProtocolLeadershipAuditRequest(state,team,{actionId:'a1',sourceInvocationId:f.sourceInvocationId,now:n});
 const listed=listedReviewer(Object.values(team.participants),team.policy,{excluded:['peer-a'],now:n}).reviewer;
 assert.equal(q.participant,listed.id);assert.equal(q.participant,'peer-b');assert.equal(q.current_leader,'peer-a');
 assert.equal(q.assignment_digest,routingDigest(policyRow(team.policy,listed)));assert.equal(q.calibration_digest,undefined);assert.ok(!Object.hasOwn(q,'calibration_digest'));
 assert.deepEqual(q.profile,listed.native_admission.identity);assert.ok(!JSON.stringify(q).includes('undefined'));
 assert.equal(q.target.phases.find(p=>p.event_id==='reservation').facts.assignment_digest!==undefined,true);
 assert.ok(!Object.hasOwn(q.target.phases.find(p=>p.event_id==='reservation').facts,'calibration_digest'));
});
test('the audit reviewer may share the leader configuration but never be the leader or the source participant',async t=>{
 const f=await fixture(t),{state}=f.load(),team=structuredClone(state.teams.team),n=now(f);
 const shared=structuredClone(team);shared.participants['peer-b'].native_admission.identity=structuredClone(shared.participants['peer-a'].native_admission.identity);
 shared.policy.profiles.find(r=>r.participant==='peer-b').identity=structuredClone(shared.policy.profiles.find(r=>r.participant==='peer-a').identity);
 assert.equal(createProtocolLeadershipAuditRequest(state,shared,{actionId:'a2',sourceInvocationId:f.sourceInvocationId,now:n}).request.participant,'peer-b');
 // The leader is never the auditor, and a source participant other than the leader is excluded as well.
 for(const r of [createProtocolLeadershipAuditRequest(state,team,{actionId:'a3',sourceInvocationId:f.sourceInvocationId,now:n}).request])assert.notEqual(r.participant,'peer-a');
 const swapped=structuredClone(team);swapped.leader='peer-b';assert.equal(createProtocolLeadershipAuditRequest(state,swapped,{actionId:'a4',sourceInvocationId:f.sourceInvocationId,now:n}).request.participant,'peer-c');
 const alone=structuredClone(team);for(const id of ['peer-b','peer-c'])if(alone.participants[id])alone.participants[id].availability='left';
 assert.throws(()=>createProtocolLeadershipAuditRequest(state,alone,{actionId:'a5',sourceInvocationId:f.sourceInvocationId,now:n}),/strongest-independent-audit-reviewer-required/);
});
test('an owner-assigned approve audit is captured through the host with the assignment digest, no calibration digest',async t=>{
 const f=await fixture(t),result=await audit(f);
 assert.equal(result.protocol_review_captured,true,JSON.stringify(result));assert.equal(result.protected_actions_granted,false);
 const state=f.load().state,x=state.subscription_invocations['subscription-audit-one'],rec=x.protocol_review;
 assert.equal(x.participant,f.reviewer);assert.equal(rec.verdict,'approve');assert.ok(rec.assignment_digest);assert.ok(!Object.hasOwn(rec,'calibration_digest'));assert.ok(!JSON.stringify(rec).includes('undefined'));
 assert.equal(rec.assignment_digest,x.action.request.assignment_digest);assert.match(f.prompts.find(p=>p.purpose==='protocol-control'&&p.prompt.includes('leadership audit')).prompt,/"assignment_digest":/);
 assert.notEqual(x.context.native_id,state.subscription_invocations[f.sourceInvocationId].context.native_id);
 assert.equal((await f.hostFor(f.reviewer).recoverProtocolAudit({invocationId:x.id})).protocol_review_captured,true);
});
test('a negative owner-assigned audit blocks new work like a calibrated one and leaves the leader and roles alone',async t=>{
 const pair=PROTOCOL_LEADERSHIP_AUDIT_RULES[0],f=await fixture(t,{auditVerdict:'changes-requested',auditFindings:[{event_id:pair.event_id,rule_id:pair.rule_id}]}),result=await audit(f);
 assert.equal(result.protocol_review.verdict,'changes-requested');
 const team=f.load().state.teams.team,x=f.load().state.subscription_invocations['subscription-audit-one'];
 assert.equal(team.native_protocol_reviews[x.action.request.target_digest].unresolved_negative,true);
 assert.equal(team.leader,'peer-a');assert.equal(team.status,'active');assert.equal(team.assignment_lost,undefined);
});
