import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {authorityFixture} from './helpers/native-calibration.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';
import {mutateAuthority,readAuthority} from '../scripts/team-store.mjs';
import {createTeamHost} from '../scripts/team-host.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t,options={}){
 const root=realpathSync(mkdtempSync(join(tmpdir(),'waypost-protocol-host-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const descriptors=Object.fromEntries(['a','b','c','d'].map(name=>[name,{managed:true,harness:'opencode',cwd:root,mode:'read-only',spawn_server:true,timeout_ms:1000,provider_id:'route',model_id:'model-'+name,reasoning:'unknown'}]));
 const schema='opencode-native-normalized-step-total-v1',clock=Date.now();
 const f=await authorityFixture({now:clock,counter_schema:schema,adapter_revision:'waypost-native-profile-1',descriptor_digest:name=>routingDigest(descriptors[name]),manifest:()=>({cwd:root}),requested_configuration:(_name,model)=>({model_id:model.model_id,provider_id:'route',reasoning:'unknown',mode:'read-only',initial_instructions_digest:null,rules_digest:null}),execution_environment:{platform:process.platform,architecture:process.arch}});
 const ownerToken='fixture-owner-token-'.repeat(4),ownerHash=sha(ownerToken);Object.assign(f.state,{protocol:1,owner_hash:ownerHash,task_bindings:{task:'team'}});
 Object.assign(f.state.teams.team,{task:'task',policy:{protocol:1,revision:1,mode:'automatic',domain:'coding',generated_at:f.at,expires_at:f.expiry,sources:[{id:'fixture',url:'https://example.org/fixture',retrieved_at:f.at}],profiles:[],evidence_floor:['adapter-observed']},messages:[],work:{},status:'forming',leader:null,candidate:null,required_review_models:[],native_policy_bootstrap:true});
 const state=reduceTeamEvent(f.state,{type:'native-policy-install-v2',team:'team',actor:'owner:'+ownerHash,at:f.at,request_key:'install',cohort_id:'cohort',expected_policy_revision:1,scope:'waypost-protocol'},{revision:f.revision}).state;
 const participant=state.teams.team.candidate,p=state.teams.team.participants[participant],name=participant.slice(-1),descriptor=descriptors[name],owner=join(root,'owner.json'),collector=join(root,'collector.json'),endpoint=join(root,'endpoint.json'),hostDir=join(root,'host');
 writeFileSync(owner,JSON.stringify({protocol:1,role:'owner',token:ownerToken}),{mode:0o600});
 const collectorToken='fixture-collector-token-'.repeat(4);writeFileSync(collector,JSON.stringify({protocol:1,role:'collector',collector:p.native_binding.collector_id,team:'team',token:collectorToken}),{mode:0o600});state.collectors[p.native_binding.collector_id].credential_hash=sha(collectorToken);
 Object.assign(p.native_binding,{endpoint_file:endpoint,collector_file:collector});writeFileSync(endpoint,JSON.stringify({protocol:1,team:'team',participant,descriptor}),{mode:0o600});
 const authority=join(root,'authority'),seed=structuredClone(state),reducer=(s,c,a)=>c.type==='fixture-initialize'?{state:structuredClone(seed),result:{fixture:true}}:reduceTeamEvent(s,c,a);
 mutateAuthority(authority,{actor:'owner:'+ownerHash,key:'fixture',expected_revision:0,command:{type:'fixture-initialize'}},reducer,{confirmedLocal:true});
 const calls=[];let created=0,interrupt=options.interruptAck,interruptProfile=options.interruptProfile;
 const dependencies={load:()=>readAuthority(authority,reducer),mutate:(path,request,_reducer,hooks)=>{calls.push(request.command.type);if(interruptProfile&&request.command.type==='native-action-profile-capture-v2'){interruptProfile=false;throw Error('fixture interrupted profile capture');}if(interrupt&&request.command.type==='native-leader-ack-capture-v2'){interrupt=false;throw Error('fixture interrupted ACK application');}return mutateAuthority(path,request,reducer,hooks);},createNativeEndpoint:async()=>{
  created++;const native_id='native-control-'+created,peer=f.peers.find(row=>row.p.id===participant),manifest=peer.manifest('host-control-'+created);manifest.native_id=native_id;calls.push('native-create');
  return {native_id,owns_process:true,usage_counter_schema:schema,async inspectContext(){return {verified:true};},async captureAccountingMetadata(){return {provider:null,origin:null,account:null,sku:null,mode:'unknown',paid_fallback:'unknown',provenance:'unavailable',auth_method:null,credit_availability:'unknown',observed_at:new Date().toISOString(),account_generation:0,consistent:true};},async send(prompt,invocation){calls.push('native-send');assert.equal(invocation.purpose,'protocol-control');const response=JSON.parse(prompt.split('\n').at(-1)).response;return {invocation_id:invocation.id,native_id,output:options.malformed?'{}':JSON.stringify(response),actualModel:{...peer.model,observed_at:new Date().toISOString()},context_manifest:manifest,usage_span:{schema,native_id,turn_id:'native-turn-'+created,coverage:options.partial?'partial':'complete',before:'0',after:'30',actual_tokens:'30'}};},async stopAndWait(){calls.push('native-stop');return {stopped:true,owned_processes:1,process_group_closed:true};}};
 }};
 const config={authorityRoot:authority,projectRoot:root,team:'team',hostDir,ownerCredential:owner,collectorPath:collector,endpointPath:endpoint,participant};
 const host=createTeamHost(config,dependencies),unit={scope:'team-native-counter',team:'team',counter_schema:schema},allocation=state.subscription_allocations[routingDigest(unit)];
 host.enableProtocolControl({revision:1,policy:{kind:'protocol-leader-ack',allow_unknown_quota:true,max_calls:2,max_estimate_tokens:'40',timeout_ms:1000,expires_at:f.expiry,unit_allocations:[{unit_digest:routingDigest(unit),max_tokens:'80',allocation_revision:allocation.revision}]}});
 return {root,host,config,dependencies,calls,load:dependencies.load,participant,hostDir};
}
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
