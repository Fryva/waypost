import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createTeamHost} from '../scripts/team-host.mjs';
import {protocolHostFixture as fixture} from './helpers/native-protocol-host.mjs';
test('host fixed ACK waits for real owned-runtime callback drain and closure before applying leadership',async t=>{
 const f=await fixture(t),result=await f.host.acknowledgeProtocolLeadership({actionId:'host-action',nonce:'host-action',estimateTokens:'40'});
 assert.equal(result.leader_acknowledged,true);assert.equal(result.protocol_control_passed,true);assert.equal(f.load().state.teams.team.leader,f.participant);assert.equal(f.load().state.teams.team.epoch,2);
 const runtime=join(f.hostDir,'runtime'),closedName=readdirSync(runtime).find(name=>name.endsWith('.closed.json')),closed=JSON.parse(readFileSync(join(runtime,closedName),'utf8'));
 assert.equal(closed.callback_drained,true);assert.equal(closed.stopped,true);assert.equal(closed.closure_proofs[0].process_group_closed,true);assert.ok(closed.native_ids.includes('native-control-1'));assert.equal(readdirSync(runtime).some(name=>name.endsWith('.barrier.json')),false);
 assert.ok(f.calls.indexOf('subscription-consume-v2')<f.calls.indexOf('native-send'));assert.ok(f.calls.lastIndexOf('native-stop')<f.calls.indexOf('native-leader-ack-capture-v2'));assert.equal(f.calls.filter(x=>x==='native-send').length,1);
 const original=f.load().state.subscription_invocations['subscription-host-action'].action_observation;
 const recovered=await createTeamHost(f.config,f.dependencies).recoverProtocolLeadership({invocationId:'subscription-host-action'});assert.equal(recovered.leader_acknowledged,true);assert.equal(f.calls.filter(x=>x==='native-send').length,1);assert.deepEqual(f.load().state.subscription_invocations['subscription-host-action'].action_observation,original);
});
test('interrupted post-closure ACK recovers the same sealed source without another native call',async t=>{
 const f=await fixture(t,{interruptAck:true});await assert.rejects(f.host.acknowledgeProtocolLeadership({actionId:'recover-action',nonce:'recover-action',estimateTokens:'40'}),/interrupted ACK/);
 assert.equal(f.load().state.teams.team.leader,null);const invocation=f.load().state.subscription_invocations['subscription-recover-action'];assert.equal(invocation.state,'settled');assert.equal(invocation.charged_tokens,'30');assert.ok(invocation.action_observation);
 const recovered=await createTeamHost(f.config,f.dependencies).recoverProtocolLeadership({invocationId:invocation.id});assert.equal(recovered.leader_acknowledged,true);assert.equal(f.calls.filter(x=>x==='native-create').length,1);assert.equal(f.calls.filter(x=>x==='native-send').length,1);assert.equal(f.load().state.teams.team.leader,f.participant);
});
test('malformed or partial ACK cannot elect a leader and preserves charged usage or uncertain hold',async t=>{
 for(const options of [{malformed:true},{partial:true}]){
  const f=await fixture(t,options),nonce=options.partial?'partial-action':'bad-action',result=await f.host.acknowledgeProtocolLeadership({actionId:nonce,nonce,estimateTokens:'40'});
  assert.equal(result.leader_acknowledged,false);assert.equal(f.load().state.teams.team.leader,null);const x=f.load().state.subscription_invocations['subscription-'+nonce];assert.equal(x.state,options.partial?'uncertain':'settled');if(!options.partial)assert.equal(x.charged_tokens,'30');assert.equal(x.action_observation,undefined);assert.ok(f.load().state.teams.team.native_control_slots);
  const sends=f.calls.filter(x=>x==='native-send').length;await assert.rejects(f.host.acknowledgeProtocolLeadership({actionId:'new-id',nonce:'new-nonce',estimateTokens:'40'}));assert.equal(f.calls.filter(x=>x==='native-send').length,sends);
 }
});

test('recovery rebuilds an interrupted profile capture from the settled seal without inference or clock renewal',async t=>{
 const f=await fixture(t,{interruptProfile:true}),result=await f.host.acknowledgeProtocolLeadership({actionId:'profile-recovery',nonce:'profile-recovery',estimateTokens:'40'});
 assert.equal(result.leader_acknowledged,false);let x=f.load().state.subscription_invocations['subscription-profile-recovery'];assert.equal(x.state,'settled');assert.equal(x.charged_tokens,'30');assert.ok(x.action_seal);assert.equal(x.action_observation,undefined);assert.equal(f.load().state.teams.team.leader,null);
 const originalClock=x.action_seal.observed_at,originalReceipt=x.action_seal.native_receipt_digest;
 const recovered=await createTeamHost(f.config,f.dependencies).recoverProtocolLeadership({invocationId:x.id});assert.equal(recovered.leader_acknowledged,true);
 x=f.load().state.subscription_invocations[x.id];assert.equal(x.action_observation.observed_at,originalClock);assert.equal(Date.parse(x.action_observation.expires_at),Date.parse(originalClock)+900000);assert.equal(x.action_seal.native_receipt_digest,originalReceipt);assert.equal(f.calls.filter(c=>c==='native-send').length,1);assert.equal(f.calls.filter(c=>c==='native-create').length,1);
});
