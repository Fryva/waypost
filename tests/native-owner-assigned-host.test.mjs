import test from 'node:test';
import assert from 'node:assert/strict';
import {protocolHostFixture as fixture} from './helpers/native-protocol-host.mjs';
// Owner-assigned teams: zero calibration cohorts, identity from one collector-observed call per participant.
test('an owner-assigned leader ACK runs with no calibration cohort and pins the assignment digest',async t=>{
 const f=await fixture(t,{ownerAssigned:true}),before=f.load().state.teams.team;
 assert.equal(before.policy.mode,'owner-assigned');assert.equal(before.native_calibration_cohorts,undefined);assert.equal(f.participant,'peer-a');assert.equal(before.candidate,'peer-a');assert.equal(before.review_candidate,'peer-b');
 const result=await f.host.acknowledgeProtocolLeadership({actionId:'owner-ack',nonce:'owner-ack',estimateTokens:'40'});
 assert.equal(result.leader_acknowledged,true,result.action_blocker||result.native_profile_blocker);assert.equal(result.protocol_control_passed,true);assert.equal(result.protected_actions_granted,undefined);
 const state=f.load().state,t2=state.teams.team,x=state.subscription_invocations['subscription-owner-ack'];
 assert.equal(t2.leader,'peer-a');assert.equal(t2.status,'active');assert.equal(t2.epoch,2);assert.equal(x.action_ack.leader,'peer-a');
 assert.ok(x.action.request.assignment_digest);assert.equal(x.action.request.calibration_digest,undefined);assert.equal(x.action.request.review_candidate.calibration_digest,undefined);assert.ok(x.action.request.review_candidate.assignment_digest);
 assert.equal(x.action_observation.profile_id,t2.participants['peer-a'].native_admission.identity.profile_id);
 const prompt=f.prompts.find(p=>p.purpose==='protocol-control').prompt;assert.match(prompt,/"assignment_digest":/);assert.doesNotMatch(prompt,/calibration_digest/);
 assert.equal(f.calls.some(c=>c.startsWith('native-calibration')||c==='subscription-measurement-capture-v2'),false);assert.equal(f.calls.filter(c=>c==='native-send').length,1);
 const again=await f.hostFor('peer-a').recoverProtocolLeadership({invocationId:'subscription-owner-ack'});assert.equal(again.leader_acknowledged,true);assert.equal(f.calls.filter(c=>c==='native-send').length,1);
});
test('a native profile that changed since the identity call refuses the owner-assigned ACK',async t=>{
 const f=await fixture(t,{ownerAssigned:true,drift:true}),result=await f.host.acknowledgeProtocolLeadership({actionId:'drift-ack',nonce:'drift-ack',estimateTokens:'40'});
 assert.equal(result.leader_acknowledged,false);assert.match(result.native_profile_blocker||result.action_blocker||'',/profile-changed|profile/);
 const state=f.load().state,x=state.subscription_invocations['subscription-drift-ack'];assert.equal(state.teams.team.leader,null);assert.equal(x.action_observation,undefined);assert.equal(state.teams.team.status,'forming');
});
