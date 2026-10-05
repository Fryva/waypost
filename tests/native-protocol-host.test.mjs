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
test('a Claude leader ACK runs with a preflight before capture and before consume, and applies after owned closure',async t=>{
 const f=await fixture(t,{harness:'claude'}),begin=f.calls.length,result=await f.host.acknowledgeProtocolLeadership({actionId:'claude-action',nonce:'claude-action',estimateTokens:'40'});
 assert.equal(result.leader_acknowledged,true,result.action_blocker);assert.equal(f.load().state.teams.team.leader,f.participant);
 const calls=f.calls.slice(begin),inspects=calls.flatMap((x,i)=>x==='native-inspect'?[i]:[]);
 assert.equal(inspects.length,2);assert.ok(inspects[0]<calls.indexOf('subscription-context-capture-v2'));assert.ok(calls.indexOf('subscription-reserve-v2')<inspects[1]&&inspects[1]<calls.indexOf('subscription-consume-v2'));
 assert.ok(calls.indexOf('subscription-consume-v2')<calls.indexOf('native-send'));assert.ok(calls.lastIndexOf('native-stop')<calls.indexOf('native-leader-ack-capture-v2'));
 const x=f.load().state.subscription_invocations['subscription-claude-action'];assert.equal(x.receipt.isolation_verified,true);assert.equal(x.action_observation.profile.harness,'claude');assert.equal(x.action_observation.profile.version,'2.1.289');assert.equal(x.action_observation.profile.version_provenance,'native-binary-version');
});
test('a malformed Claude ACK spends its slot without a leader, and a refused second preflight aborts before the slot is taken',async t=>{
 const bad=await fixture(t,{harness:'claude',malformed:true}),result=await bad.host.acknowledgeProtocolLeadership({actionId:'claude-bad',nonce:'claude-bad',estimateTokens:'40'});
 assert.equal(result.leader_acknowledged,false);assert.equal(bad.load().state.teams.team.leader,null);assert.equal(bad.load().state.subscription_invocations['subscription-claude-bad'].state,'settled');
 const sends=bad.calls.filter(x=>x==='native-send').length;await assert.rejects(bad.host.acknowledgeProtocolLeadership({actionId:'claude-retry',nonce:'claude-retry',estimateTokens:'40'}));assert.equal(bad.calls.filter(x=>x==='native-send').length,sends);
 const refused=await fixture(t,{harness:'claude',refusePreflight:(created,inspection)=>created===1&&inspection===2});
 await assert.rejects(refused.host.acknowledgeProtocolLeadership({actionId:'claude-refused',nonce:'claude-refused',estimateTokens:'40'}),{code:'host-subscription-owned-read-only-context-unverified'});
 assert.equal(refused.load().state.subscription_invocations['subscription-claude-refused'].state,'aborted');assert.equal(refused.calls.includes('native-send'),false);assert.equal(refused.calls.includes('subscription-consume-v2'),false);
 const ok=await refused.host.acknowledgeProtocolLeadership({actionId:'claude-after',nonce:'claude-after',estimateTokens:'40'});assert.equal(ok.leader_acknowledged,true,'the aborted reservation did not take the slot');
});
test('an uncertain control call is reconciled from its owned closure: the estimate is charged, the slot is freed, and admission waits for the owner to accept a charge',async t=>{
 const {reduceTeamEvent}=await import('../scripts/team-state.mjs'),{collectOwnedRuntimeCompletion,serializeOwnedRuntimeCompletion}=await import('../scripts/team-owned-runtime.mjs');
 const f=await fixture(t,{failSend:created=>created===1});
 await assert.rejects(f.host.acknowledgeProtocolLeadership({actionId:'lost-action',nonce:'lost-action',estimateTokens:'40'}),/native-outcome-uncertain/);
 let x=f.load().state.subscription_invocations['subscription-lost-action'];assert.equal(x.state,'uncertain');
 const lost=structuredClone(f.load());
 const r=f.host.reconcileProtocolControl({invocationId:x.id});assert.equal(r.reconciled,x.id);assert.equal(r.charged_tokens,'40');assert.equal(r.protected_actions_granted,false);
 x=f.load().state.subscription_invocations[x.id];assert.equal(x.state,'reconciled');assert.equal(x.usage,'unknown');assert.equal(f.load().state.teams.team.leader,null);
 assert.equal(Object.values(f.load().state.teams.team.native_control_slots||{}).some(slot=>slot.invocation_id===x.id),false);
 assert.equal(f.host.reconcileProtocolControl({invocationId:x.id}).unchanged,true);
 {const after=f.load();for(const type of ['subscription-uncertain-v2','subscription-usage-v2'])assert.throws(()=>reduceTeamEvent(structuredClone(after.state),{type,team:'team',actor:x.collector,at:new Date().toISOString(),request_key:'late-'+type,invocation_id:x.id,nonce:x.nonce,...(type==='subscription-usage-v2'?{receipt:{}}:{})},{revision:after.revision}),/consumed-invocation-required/,type);}
 // Unknown usage blocks new admissions on the counter until the owner accepts a charge.
 await assert.rejects(f.host.acknowledgeProtocolLeadership({actionId:'blocked-action',nonce:'blocked-action',estimateTokens:'40'}),/overshoot|unreconciled/);
 await assert.rejects(Promise.resolve().then(()=>f.host.acceptUnknownUsage({invocationId:x.id,chargedTokens:'39'})),/accepted-charge-below-reservation/);
 assert.equal(f.host.acceptUnknownUsage({invocationId:x.id,chargedTokens:'40'}).charged_tokens,'40');
 const ok=await f.host.acknowledgeProtocolLeadership({actionId:'after-action',nonce:'after-action',estimateTokens:'40'});assert.equal(ok.leader_acknowledged,true,ok.action_blocker);
 // The reducer refuses a closure bound to anything else, a settled call and another actor.
 const directory=join(f.hostDir,'runtime'),selectors={directory,team:'team',participant:x.participant,incarnation:x.incarnation,epoch:x.epoch,descriptorDigest:x.descriptor_digest,operation:x.action.operation_id,invocation_id:x.id,nonce:x.nonce,native_id:x.context.native_id};
 const completion=serializeOwnedRuntimeCompletion(collectOwnedRuntimeCompletion(selectors)),state=lost.state,collectorActor=x.collector,at=new Date().toISOString();
 const command=patch=>({type:'subscription-reconcile-v2',team:'team',actor:collectorActor,at,request_key:'k',invocation_id:x.id,nonce:x.nonce,completion,...patch});
 assert.equal(reduceTeamEvent(structuredClone(state),command({}),{revision:lost.revision}).state.subscription_invocations[x.id].state,'reconciled');
 for(const [name,patch,code] of [['operation',{completion:{...completion,operation:'other-operation'}},/exact-owned-operation-completion/],['native id',{completion:{...completion,native_id:'native-other'}},/exact-owned-operation-completion/],['not stopped',{completion:{...completion,stopped:false}},/exact-owned-operation-completion/],['undrained',{completion:{...completion,callback_drained:false}},/exact-owned-operation-completion/],['closed before consume',{completion:{...completion,closed_at:new Date(Date.parse(x.consumed_at)-1).toISOString()}},/exact-owned-operation-completion/],['owner actor',{actor:'owner:'+state.owner_hash},/bound-invocation-collector/],['nonce',{nonce:'other'},/consumed-control-invocation/]])
  assert.throws(()=>reduceTeamEvent(structuredClone(state),command(patch),{revision:lost.revision}),code,name);
 // It works for a consumed call and after the participant is revoked, but not after its collector is revoked or with a closure in the future.
 const variant=edit=>{const copy=structuredClone(state);edit(copy);return copy;},collectorId=x.collector.replace(/^collector:/,'');
 assert.equal(reduceTeamEvent(variant(c=>{c.subscription_invocations[x.id].state='consumed';}),command({}),{revision:lost.revision}).state.subscription_invocations[x.id].state,'reconciled');
 assert.equal(reduceTeamEvent(variant(c=>{c.teams.team.participants[x.participant].revoked=true;}),command({}),{revision:lost.revision}).state.subscription_invocations[x.id].state,'reconciled');
 assert.throws(()=>reduceTeamEvent(variant(c=>{c.collectors[collectorId].revoked=true;}),command({}),{revision:lost.revision}),/bound-invocation-collector/);
 assert.throws(()=>reduceTeamEvent(structuredClone(state),command({completion:{...completion,closed_at:new Date(Date.now()+3600000).toISOString()}}),{revision:lost.revision}),/exact-owned-operation-completion/);
 // A settled call is refused by state even with its own exact closure.
 const settled=Object.values(f.load().state.subscription_invocations).find(y=>y.nonce==='after-action');
 const own=serializeOwnedRuntimeCompletion(collectOwnedRuntimeCompletion({...selectors,epoch:settled.epoch,operation:settled.action.operation_id,invocation_id:settled.id,nonce:settled.nonce,native_id:settled.context.native_id}));
 assert.throws(()=>reduceTeamEvent(structuredClone(f.load().state),command({invocation_id:settled.id,nonce:settled.nonce,completion:own}),{revision:f.load().revision}),/consumed-control-invocation-required/);
});
test('a control call whose answer reached the authority in a partial receipt keeps its slot when reconciled, so the answer cannot be asked again',async t=>{
 const f=await fixture(t,{partial:true});
 const first=await f.host.acknowledgeProtocolLeadership({actionId:'partial-action',nonce:'partial-action',estimateTokens:'40'});assert.equal(first.leader_acknowledged,false);
 const x=f.load().state.subscription_invocations['subscription-partial-action'];assert.equal(x.state,'uncertain');assert.ok(x.partial_receipt);
 const r=f.host.reconcileProtocolControl({invocationId:x.id});assert.equal(r.slot_released,false);
 assert.equal(Object.values(f.load().state.teams.team.native_control_slots).some(slot=>slot.invocation_id===x.id),true);
 assert.equal(f.host.acceptUnknownUsage({invocationId:x.id,chargedTokens:'40'}).charged_tokens,'40');assert.equal(f.host.acceptUnknownUsage({invocationId:x.id,chargedTokens:'40'}).unchanged,true);
 const sends=f.calls.filter(y=>y==='native-send').length;
 await assert.rejects(f.host.acknowledgeProtocolLeadership({actionId:'retry-action',nonce:'retry-action',estimateTokens:'40'}),/action-slot-already/);
 assert.equal(f.calls.filter(y=>y==='native-send').length,sends);assert.equal(f.load().state.teams.team.leader,null);
});
