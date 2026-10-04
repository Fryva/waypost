import test from 'node:test';
import assert from 'node:assert/strict';
import {protocolHostFixture} from './helpers/native-protocol-host.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {readdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
const billing={provider:'route',origin:'https://provider.fixture',account:routingDigest('quota-fixture-account'),sku:'fixture-subscription',mode:'subscription',paid_fallback:false,provenance:'native-runtime',auth_method:'native-fixture',credit_availability:'unavailable',account_generation:0,consistent:true};
async function fixture(t,options={}){
 const f=await protocolHostFixture(t,{registerHosts:true,billing:name=>({...billing,account:routingDigest('quota-fixture-account-'+name)}),...options});
 await f.host.acknowledgeProtocolLeadership({actionId:'source-ack',nonce:'source-ack',estimateTokens:'40'});
 const state=f.load().state,team=state.teams.team,old=team.leader,source='subscription-source-ack';
 const sourceRules=['exhausted','available'].map(status=>({collector_id:team.participants[old].native_binding.collector_id,source:'https://provider.fixture/quota',method:'GET /quota',evidence_kind:'provider-quota',provider_code:'provider-'+status,scope:'provider-account',status,documentation:'https://provider.fixture/docs/quota'}));
 f.host.enableNativeProtocolQuota({revision:1,policy:{automatic_handover:true,...(options.sameLeaderReactivation?{same_leader_reactivation:true}:{}),expires_at:f.expiry,source_rules:sourceRules}});
 f.host.enableNativeProtocolHandover({revision:1,policy:{kind:'protocol-handover-ack',allow_unknown_quota:true,max_calls:2,max_estimate_tokens:'40',timeout_ms:1000,expires_at:f.expiry,unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:'80',allocation_revision:f.allocation.revision}]}});
 f.dependencies.observeNativeProtocolProviderQuota=async({binding})=>({protocol:2,observation_id:'exhaustion-one',status:'exhausted',reason:'provider-quota-exhausted',source:'https://provider.fixture/quota',method:'GET /quota',evidence_kind:'provider-quota',provider_code:'provider-exhausted',scope:'provider-account',provider_confirmed:true,billing_digest:routingDigest(binding.billing),observed_at:new Date().toISOString(),expires_at:new Date(Date.now()+30000).toISOString(),documentation:'https://provider.fixture/docs/quota'});
 return {...f,old,source,ownerHost:f.hostFor(old)};
}
test('native protocol quota handover uses strongest surviving owned Host without weakening review floor',async t=>{
 const f=await fixture(t),before=f.load().state.teams.team,floor=before.review_floor,history=structuredClone(before.required_review_identities_v2),sends=f.calls.filter(x=>x==='native-send').length;
 const result=await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source});
 assert.equal(result.redistribution.handover_acknowledged,true);assert.equal(result.redistribution.protected_actions_granted,false);
 const after=f.load().state.teams.team;assert.notEqual(after.leader,f.old);assert.equal(after.epoch,before.epoch+1);assert.equal(after.review_floor,floor);assert.deepEqual(after.required_review_identities_v2,history);assert.notEqual(after.review_candidate,after.leader);assert.equal(f.calls.filter(x=>x==='native-send').length,sends+1);
 const x=Object.values(f.load().state.subscription_invocations).find(x=>x.action?.kind==='protocol-handover-ack');assert.equal(x.epoch,before.epoch);assert.equal(x.protocol_handover_ack.completion.scope.epoch,after.epoch);assert.equal(x.state,'settled');assert.equal(x.charged_tokens,'30');assert.equal(Object.keys(after.work).length,0);
});
test('handover capture recovery uses own settled seal and provisional epoch without another inference',async t=>{
 const f=await fixture(t,{interruptHandover:true});const result=await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source});assert.equal(result.redistribution_blocker,'host-native-handover-blocked');
 const x=Object.values(f.load().state.subscription_invocations).find(x=>x.action?.kind==='protocol-handover-ack');assert.equal(x.state,'settled');assert.equal(x.protocol_handover_ack,undefined);const count=f.calls.filter(x=>x==='native-send').length;
 const recovered=await f.ownerHost.driveNativeProtocolQuotaHandover();assert.equal(recovered.handover_acknowledged,true);assert.equal(f.calls.filter(x=>x==='native-send').length,count);assert.equal(f.load().state.teams.team.epoch,x.action.request.target_epoch);
});
test('unsupported installed provider observer refuses without native calls or quota mutation',async t=>{
 const f=await fixture(t);delete f.dependencies.observeNativeProtocolProviderQuota;const before=structuredClone(f.load().state),count=f.calls.filter(x=>x==='native-send').length;
 await assert.rejects(f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source}),/observer-unsupported/);assert.deepEqual(f.load().state,before);assert.equal(f.calls.filter(x=>x==='native-send').length,count);
});
test('same quota refresh after interrupted capture preserves prepared election and recovers without inference',async t=>{
 const f=await fixture(t,{interruptHandover:true});await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source});
 const before=f.load().state.teams.team,transition=structuredClone(before.native_protocol_handover),sample=structuredClone(before.participants[f.old].native_protocol_quota),revision=before.quota_revision,count=f.calls.filter(x=>x==='native-send').length;
 f.dependencies.observeNativeProtocolProviderQuota=async()=>({...sample.proof,observation_id:'exhaustion-refreshed',observed_at:new Date().toISOString(),expires_at:new Date(Date.now()+30000).toISOString()});
 const result=await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source,drive:false});assert.equal(result.refreshed,true);
 const refreshed=f.load().state.teams.team;assert.deepEqual(refreshed.native_protocol_handover,transition);assert.deepEqual(refreshed.participants[f.old].native_protocol_quota,sample);assert.equal(refreshed.quota_revision,revision);
 const recovered=await f.ownerHost.driveNativeProtocolQuotaHandover();assert.equal(recovered.handover_acknowledged,true);assert.equal(f.calls.filter(x=>x==='native-send').length,count);
});
test('account-wide exhaustion pauses every verified model on that account without another call',async t=>{
 const f=await fixture(t,{billing});const count=f.calls.filter(x=>x==='native-send').length;
 const result=await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source});assert.ok(result.redistribution_blocker);assert.equal(f.calls.filter(x=>x==='native-send').length,count);const after=f.load().state.teams.team;assert.equal(after.status,'paused');assert.equal(after.candidate,null);assert.equal(after.leader,f.old);
});
test('candidate account switch to exhausted billing is refused before sending handover ACK',async t=>{
 const f=await fixture(t);await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source,drive:false});
 const sample=f.load().state.teams.team.participants[f.old].native_protocol_quota,original=f.options.billing,count=f.calls.filter(x=>x==='native-send').length;
 f.options.billing=name=>({...original(name),account:sample.binding.billing.account});
 await assert.rejects(f.ownerHost.driveNativeProtocolQuotaHandover(),/account.*exhaust|exhaust.*account/);assert.equal(f.calls.filter(x=>x==='native-send').length,count);assert.equal(f.load().state.teams.team.leader,f.old);
});
test('missing historical settled subscription operation ledger blocks handover preparation',async t=>{
 const f=await fixture(t);const source=f.source;
 // An audit belongs to the acknowledged old epoch, unlike the initial ACK.
 const current=f.load().state.teams.team,reviewer=f.hostFor(current.review_candidate);
 reviewer.enableProtocolReview({revision:1,policy:{kind:'protocol-leadership-audit',allow_unknown_quota:true,max_calls:2,max_estimate_tokens:'40',timeout_ms:1000,expires_at:f.expiry,unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:'80',allocation_revision:f.allocation.revision}]}});
 await reviewer.auditProtocolLeadership({actionId:'old-audit',sourceInvocationId:source,nonce:'old-audit',estimateTokens:'40'});
 const audit=f.load().state.subscription_invocations['subscription-old-audit'],runtime=join(f.configFor(audit.participant).hostDir,'runtime');
 const path=readdirSync(runtime).find(name=>name.includes(audit.action.operation_id)&&name.endsWith('.closed.json'));assert.ok(path);unlinkSync(join(runtime,path));
 const count=f.calls.filter(x=>x==='native-send').length,result=await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:source});assert.equal(result.redistribution_required,true);assert.ok(result.redistribution_blocker);assert.equal(f.calls.filter(x=>x==='native-send').length,count);assert.equal(f.load().state.teams.team.leader,f.old);
});

async function restoreOldLeader(f,{drive=true}={}){
 const original=f.load().state.teams.team.participants[f.old].native_protocol_quota;
 f.dependencies.observeNativeProtocolProviderQuota=async()=>{const clock=Date.now();return {...original.proof,observation_id:'restored-one',status:'available',reason:'provider-quota-available',provider_code:'provider-available',observed_at:new Date(clock).toISOString(),expires_at:new Date(clock+60000).toISOString()};};
 return f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source,drive});
}
test('explicit recovery opt-in reactivates the old coordinator only through stopped scopes and new epoch ACK',async t=>{
 // Deterministic protocol time does not demonstrate completion within real provider TTL.
 t.mock.timers.enable({apis:['Date'],now:Date.now()});
 const f=await fixture(t,{sameLeaderReactivation:true});await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source,drive:false});
 t.mock.timers.tick(1000);
 const before=f.load().state.teams.team,floor=before.review_floor,history=structuredClone(before.required_review_identities_v2),count=f.calls.filter(x=>x==='native-send').length;
 const result=await restoreOldLeader(f);assert.equal(result.redistribution?.handover_acknowledged,true,result.redistribution_blocker);
 const after=f.load().state.teams.team;assert.equal(after.leader,f.old);assert.equal(after.epoch,before.epoch+1);assert.equal(after.status,'active');assert.equal(after.review_floor,floor);assert.deepEqual(after.required_review_identities_v2,history);assert.notEqual(after.review_candidate,f.old);assert.equal(f.calls.filter(x=>x==='native-send').length,count+1);
 assert.ok(after.native_protocol_handover.reactivation);const x=Object.values(f.load().state.subscription_invocations).find(x=>x.action?.kind==='protocol-handover-ack');assert.ok(x.action.request.reactivation_digest);assert.equal(x.protocol_handover_ack.completion.scope.epoch,after.epoch);assert.equal(Object.keys(after.work).length,0);
});
test('old coordinator interrupted recovery ACK reuses its original settled invocation without another inference',async t=>{
 t.mock.timers.enable({apis:['Date'],now:Date.now()});
 const f=await fixture(t,{sameLeaderReactivation:true,interruptHandover:true});await f.ownerHost.observeNativeProtocolQuota({sourceInvocationId:f.source,drive:false});
 t.mock.timers.tick(1000);
 const result=await restoreOldLeader(f);assert.equal(result.redistribution_blocker,'host-native-handover-blocked');const count=f.calls.filter(x=>x==='native-send').length;
 const x=Object.values(f.load().state.subscription_invocations).find(x=>x.action?.kind==='protocol-handover-ack');assert.equal(x.state,'settled');assert.equal(x.protocol_handover_ack,undefined);
 const recovered=await f.ownerHost.driveNativeProtocolQuotaHandover();assert.equal(recovered.handover_acknowledged,true);assert.equal(f.calls.filter(x=>x==='native-send').length,count);assert.equal(f.load().state.teams.team.leader,f.old);assert.equal(f.load().state.teams.team.epoch,x.action.request.target_epoch);
});
