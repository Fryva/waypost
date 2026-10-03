import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { routingDigest } from '../scripts/model-routing.mjs';
import { createTeamHost, validateBoundedUsageReceipt } from '../scripts/team-host.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(t,options={}) {
 const root=realpathSync(mkdtempSync(join(tmpdir(),'wp-host-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const ownerToken='a'.repeat(64),owner=join(root,'owner.json'),collector=join(root,'collector.json'),endpoint=join(root,'endpoint.json');
 writeFileSync(owner,JSON.stringify({protocol:1,role:'owner',token:ownerToken}),{mode:0o600});
 const model={provider:'openai',model_id:'model',reasoning:'low',model_revision:1,resolved:true,evidence:{kind:'self-declared',source:'fixture',observed_at:new Date().toISOString()}};
 const team={id:'team',epoch:0,policy:{revision:1},participants:{participant:{id:'participant',incarnation:'incarnation',model}},work:{},runtime_requests:{}};
 const participantCredential=join(root,'participant.json');writeFileSync(participantCredential,JSON.stringify({protocol:1,role:'participant',participant:'participant',incarnation:'incarnation',token:'b'.repeat(64)}),{mode:0o600});
 team.participants.participant.credential_hash=sha('b'.repeat(64));team.messages=[];team.deliveries={};
 const state={owner_hash:sha(ownerToken),teams:{team},collectors:{}};const calls=[],requests=[],accepted=new Map(),answers=[];let revision=0,failOnce=options.failOnce;
 const load=()=>({state:structuredClone(state),revision,requests:[...accepted].map(([key,entry])=>({key,actor:entry.command.actor}))});
 const mutate=(_root,request,_reducer,hooks)=>{
  hooks.authorize(state);const c=request.command;calls.push(c.type);requests.push(structuredClone(request));
  if(failOnce===c.type){failOnce=null;throw new Error('interrupted '+c.type);}
  if(accepted.has(request.key)){const prior=accepted.get(request.key);assert.deepEqual(c,prior.command);return {result:prior.result,revision,replayed:true};}
  revision++;
  if(options.deferredType===c.type)return {result:{deferred:true},revision};
  if(c.type==='quota-capture-v1'){team.participants[c.observation.participant].quota_observation=c.observation;team.status='handover';}
  if(c.type==='begin-handover-v1')team.handover={old_leader:team.leader,old_epoch:team.epoch,target_epoch:team.epoch+1,acks:{},adoptions:{}};
  if(c.type==='quiesce-capture-v1')team.handover.acks[c.participant_id]={stopped:c.stopped,evidence_digest:c.evidence_digest};
  if(c.type==='native-binding-v1')team.participants[c.participant_id].native_binding=c.binding;
  if(c.type==='participant-host-register-v1')team.participants[c.participant_id].host_binding=c.binding;
  if(c.type==='collector-register-v1')state.collectors[c.collector.id]={...c.collector,team:'team'};
  if(c.type==='runtime-request-v1')team.runtime_requests[c.nonce]={participant:c.participant_id,action:c.action,consumed:false};
  if(c.type==='runtime-consume-v1')team.runtime_requests[c.nonce].consumed=true;
  if(c.type==='delivery-consume-v1')team.deliveries[c.nonce]={nonce:c.nonce,message_id:c.message_id,participant:c.participant_id,incarnation:team.participants[c.participant_id].incarnation,epoch:c.epoch,native_id:c.native_id,state:'dispatching'};
  if(c.type==='delivery-capture-v1'){const delivery=team.deliveries[c.nonce];delivery.state=c.outcome==='uncertain'?'uncertain':'received';if(c.outcome!=='uncertain')Object.assign(delivery,{native_id:c.native_id,output:c.output,output_digest:c.output_digest,actual_model:c.actual_model,received_at:c.at});}
  if(c.type==='send')answers.push({key:request.key,...structuredClone(c)});
  if(c.type==='ack')team.messages.find(m=>m.id===c.message).ack={at:c.at};
  if(c.type==='runtime-capture-v1'){team.runtime_requests[c.nonce].captured=true;team.participants[team.runtime_requests[c.nonce].participant].model=c.model;}
  if(c.type==='handover-accept-v1'){team.leader=team.candidate;team.candidate=null;team.status='active';team.epoch++;}
  const result={type:c.type};accepted.set(request.key,{command:structuredClone(c),result});return {result,revision};
 };
 const native=async()=>{
  calls.push('native-create');
  return {native_id:'owned-native',async send(prompt,invocation){calls.push('native-send');if(options.failure)throw new Error('timeout');return {output:invocation.id,native_id:'owned-native',actualModel:{provider:options.provider||'openai',model_id:'model',reasoning:'low'},context_manifest:{id:'ctx',model_provider_is_billing_route:options.billingRoute||false}};},close(){calls.push('native-close');},...(options.stopWait?{async stopAndWait(){calls.push('native-stop-wait');await options.stopWait();calls.push('native-stopped');}}:{})};
 };
 const dependencies={load,mutate,createNativeEndpoint:native,...options.dependencies};
 const host=createTeamHost({authorityRoot:root,projectRoot:root,vaultPath:options.vaultPath?root:undefined,team:'team',ownerCredential:owner,collectorPath:collector,endpointPath:endpoint,leaderEndpointPath:endpoint,participant:'participant',participantCredential},dependencies);
 return {root,host,team,state,calls,endpoint,collector,requests,answers,dependencies};
}
test('host bootstrap persists private collector and endpoint with owner registration',async t=>{
 const f=fixture(t);await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});
 assert.equal(f.calls[0],'collector-register-v1');assert.ok(existsSync(f.collector));assert.equal(JSON.parse(readFileSync(f.endpoint)).participant,'participant');
 await f.host.bootstrap();assert.equal(f.calls.filter(x=>x==='collector-register-v1').length,1);
});
test('explicit participant host registration stores credential locator privately and binds immutable manifest',async t=>{
 const f=fixture(t,{vaultPath:true});await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});
 await f.host.registerParticipantHost();const binding=f.team.participants.participant.host_binding;
 const manifest=JSON.parse(readFileSync(binding.host_file));assert.equal(manifest.participant,'participant');assert.equal(manifest.incarnation,'incarnation');
 assert.ok(manifest.participant_credential_file.endsWith('participant.json'));assert.equal(JSON.stringify(binding).includes('token'),false);
 await f.host.registerParticipantHost();assert.equal(f.calls.filter(x=>x==='participant-host-register-v1').length,2);
 await assert.rejects(async()=>f.host.registerParticipantHost({participantCredentialFile:f.collector}),/credential-binding|invalid-credential|actor/);
});
test('runtime consumption precedes native launch and send; capture pins observed model',async t=>{
 const f=fixture(t);await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});
 await f.host.inspect({action:'coordinate:exact-key',nonce:'nonce1'});
 assert.deepEqual(f.calls.slice(2),['runtime-request-v1','runtime-consume-v1','native-create','native-send','runtime-capture-v1','native-close']);
 assert.equal(f.team.participants.participant.model.evidence.action,'coordinate:exact-key');
 assert.equal(f.team.participants.participant.model.evidence.kind,'adapter-observed');
 await f.host.inspect({action:'coordinate:exact-key',nonce:'nonce1'});assert.equal(f.calls.filter(x=>x==='native-send').length,1);
});
test('host invocation waits for confirmed endpoint shutdown before returning',async t=>{
 let release;const closure=new Promise(r=>release=r);const f=fixture(t,{stopWait:()=>closure});
 await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});
 let returned=false;const result=f.host.inspect({action:'shutdown-proof',nonce:'shutdown'}).then(()=>returned=true);
 await new Promise(r=>setImmediate(r));assert.equal(returned,false);assert.ok(f.calls.includes('native-stop-wait'));
 release();await result;assert.equal(returned,true);assert.ok(f.calls.includes('native-stopped'));assert.equal(f.calls.includes('native-close'),false);
});
test('simultaneous public host operations cannot bypass the first callback drain',async t=>{
 let release;const closure=new Promise(r=>release=r),f=fixture(t,{stopWait:()=>closure});
 await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});
 const first=f.host.inspect({action:'first',nonce:'first'});
 await assert.rejects(f.host.inspect({action:'second',nonce:'second'}),/host-operation-busy/);
 await new Promise(r=>setImmediate(r));release();await first;assert.equal(f.calls.filter(x=>x==='native-send').length,1);
});
test('a publication-deferred consumption cannot trigger external inference',async t=>{
 const f=fixture(t,{deferredType:'runtime-consume-v1'});await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});
 await assert.rejects(f.host.inspect({action:'coordinate:exact-key',nonce:'deferred'}),/deferred-no-external-dispatch/);
 assert.equal(f.calls.includes('native-create'),false);assert.equal(f.calls.includes('native-send'),false);
});
test('failed invocation remains consumed and cannot be dispatched again after restart',async t=>{
 const f=fixture(t,{failure:true});await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});
 await assert.rejects(f.host.inspect({action:'work',nonce:'nonce2'}),/timeout/);
 assert.equal(f.team.runtime_requests.nonce2.consumed,true);
 await assert.rejects(f.host.inspect({action:'work',nonce:'nonce2'}),{code:'host-runtime-outcome-uncertain-no-retry'});
 assert.equal(f.calls.filter(x=>x==='native-send').length,1);
});
test('billing-route metadata cannot mint model authorship; personal sessions cannot be imported',async t=>{
 const f=fixture(t,{billingRoute:true});await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});
 await assert.rejects(f.host.inspect({action:'work',nonce:'nonce3'}),{code:'host-runtime-authorship-unverified'});
 assert.equal(f.calls.includes('runtime-capture-v1'),false);
 const g=fixture(t);await assert.rejects(g.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'opencode',cwd:g.root,native_id:'personal'}}),{code:'host-personal-session-import-forbidden'});
});

test('relay delivers addressed messages in one owned context with consume before send',async t=>{
 const f=fixture(t);await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});
 f.team.messages=[{id:'message1',recipient:'participant',incarnation:'incarnation',epoch:0,kind:'question',sender:'participant',payload:{text:'first'}},{id:'message2',recipient:'participant',incarnation:'incarnation',epoch:0,kind:'question',sender:'participant',payload:{text:'second'}}];
 const result=await f.host.relay({limit:2,maxPolls:2,pollMs:0});assert.equal(result.delivered,2);
 assert.equal(f.calls.filter(x=>x==='native-create').length,1);assert.equal(f.calls.filter(x=>x==='native-send').length,2);
 for(let i=0;i<f.calls.length;i++)if(f.calls[i]==='native-send')assert.equal(f.calls[i-1],'delivery-consume-v1');
 assert.equal(f.calls.filter(x=>x==='send').length,2);assert.equal(f.team.messages.every(m=>m.ack),true);
});
for(const failedType of ['send','ack'])test('captured relay resumes durable answer after interrupted '+failedType+' without inference',async t=>{
 const f=fixture(t,{failOnce:failedType});await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});
 f.team.messages=[{id:'cached-source',recipient:'participant',incarnation:'incarnation',epoch:0,kind:'question',sender:'participant',payload:{text:'bounded question'}}];
 await assert.rejects(f.host.relay({limit:1,maxPolls:1,pollMs:0}),new RegExp('interrupted '+failedType));
 const delivery=Object.values(f.team.deliveries)[0];assert.equal(delivery.state,'received');assert.equal(delivery.output,delivery.nonce);assert.ok(delivery.received_at);assert.equal(f.team.messages[0].ack,undefined);
 const nativeCalls=f.calls.filter(x=>x.startsWith('native-')).length;
 const recovered=await f.host.relay({limit:1,maxPolls:1,pollMs:0});assert.equal(recovered.recovered,1);assert.equal(recovered.delivered,1);assert.equal(recovered.native_id,null);
 assert.equal(f.calls.filter(x=>x.startsWith('native-')).length,nativeCalls);assert.equal(f.calls.filter(x=>x==='native-send').length,1);
 assert.equal(f.answers.length,1);assert.equal(f.answers[0].payload.text,delivery.output);assert.equal(f.answers[0].reply_to,'cached-source');assert.ok(f.team.messages[0].ack);
 const answerRequests=f.requests.filter(r=>r.command.type==='send');assert.equal(answerRequests.length,failedType==='send'?2:1);assert.ok(answerRequests.every(r=>r.key==='relay-answer-'+delivery.nonce));
 const ackRequests=f.requests.filter(r=>r.command.type==='ack');assert.ok(ackRequests.every(r=>r.key==='relay-ack-'+delivery.nonce));assert.ok(ackRequests.every(r=>Math.abs(Date.now()-Date.parse(r.command.at))<30000));
});
test('uncertain relay invocation never redelivers consumed source message',async t=>{
 const f=fixture(t,{failure:true});await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});
 f.team.messages=[{id:'message1',recipient:'participant',incarnation:'incarnation',epoch:0,kind:'question',sender:'participant',payload:{}}];
 await assert.rejects(f.host.relay({limit:1,maxPolls:1,pollMs:0}),/timeout/);
 assert.equal(Object.values(f.team.deliveries)[0].state,'uncertain');
 const retry=await f.host.relay({limit:1,maxPolls:1,pollMs:0});assert.equal(retry.delivered,0);assert.equal(f.calls.filter(x=>x==='native-send').length,1);
});

test('review refuses missing native isolation proof before requesting or consuming verdict',async t=>{
 const f=fixture(t);await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});
 f.team.leader='participant';f.team.work.work={result:{target_digest:'a'.repeat(64)},criteria_digest:'b'.repeat(64)};
 await assert.rejects(f.host.review({workId:'work',nonce:'review1'}),{code:'host-independent-context-unverified'});
 assert.equal(f.calls.includes('review-request-v1'),false);assert.equal(f.calls.includes('review-consume-v1'),false);
 assert.equal(f.calls.at(-1),'native-close');
});

test('routed dispatch without installed bounded usage callback refuses before authority or native work',async t=>{
 const f=fixture(t);
 await assert.rejects(f.host.dispatchRouted({workId:'work',invocationId:'attempt1'}),{code:'host-bounded-provider-usage-unavailable'});
 assert.deepEqual(f.calls,[]);
});
test('routing grant installation cannot turn client JSON records into collector-proven evidence',async t=>{
 const f=fixture(t);await f.host.bootstrap();
 const manifest={protocol:1,goal:'bounded edit',base:'b'.repeat(40),domain:'coding',task_class:'bounded-edit',criteria_digest:'a'.repeat(64),paths:['a.txt'],tools:[],isolation:'worktree',input_tokens:100,output_tokens:100,attempts:1,budget:{currency:'USD-micro',max_units:'100',reserved_control_units:'10'},capability:{benchmark:'suite',revision:'1',criteria_digest:'b'.repeat(64),min_passes:1},safety:{bounded:true,reversible:true,architecture:false,security:false,migration:false,publication:false,data_loss:false}};
 assert.throws(()=>f.host.installRoutingGrant({manifest,verifiedEvidence:new Map([['participant',{trusted:true}]])}),/provenance|collector/);
 assert.equal(f.calls.includes('routing-grant-capture-v1'),false);assert.equal(f.calls.includes('native-create'),false);
});

test('persisted native binding refuses changed endpoint descriptor before any native invocation',async t=>{
 const f=fixture(t),descriptor={managed:true,harness:'codex',cwd:f.root,mode:'read-only'};
 await f.host.bootstrap({participant:'participant',descriptor});
 assert.equal(f.calls.filter(x=>x==='native-binding-v1').length,1);
 assert.equal(f.team.participants.participant.native_binding.endpoint_file,f.endpoint);
 await f.host.bootstrap({participant:'participant',descriptor});
 assert.equal(f.calls.filter(x=>x==='native-binding-v1').length,1);
 const file=JSON.parse(readFileSync(f.endpoint,'utf8'));file.descriptor.model_id='different-model';writeFileSync(f.endpoint,JSON.stringify(file));
 await assert.rejects(f.host.inspect({action:'work',nonce:'binding-nonce'}),{code:'host-authority-native-binding-mismatch'});
 assert.equal(f.calls.includes('native-create'),false);assert.equal(f.calls.includes('runtime-request-v1'),false);
});

test('bounded invoice is exact-bound to invocation, billing route, provider quote and exclusive allocation',()=>{
 const route={endpoint:'https://fixture.invalid',account:'fixture-account',sku:'fixture-sku',mode:'metered',pool:'fixture-pool'};
 const evidence={route,liability:{quote_id:'quote1'},quota:{allocation_id:'allocation1'}};
 const grant={route_digest:routingDigest(route),quote_id:'quote1',allocation_id:'allocation1'};
 const invocation={id:'invocation1',max_units:'100'};
 const usage={actual_units:'80',provider_invocation_id:'invoice1',invocation_id:invocation.id,...grant};
 assert.deepEqual(validateBoundedUsageReceipt({usage,invocation,grant,evidence}),{actual_units:'80',provider_invocation_id:'invoice1'});
 for(const field of ['invocation_id','route_digest','quote_id','allocation_id'])assert.throws(()=>validateBoundedUsageReceipt({usage:{...usage,[field]:'foreign'},invocation,grant,evidence}),{code:'host-billing-receipt-binding-mismatch'});
 assert.throws(()=>validateBoundedUsageReceipt({usage:{...usage,actual_units:'101'},invocation,grant,evidence}),{code:'host-bounded-usage-receipt-required'});
 assert.throws(()=>validateBoundedUsageReceipt({usage,invocation,grant,evidence:{...evidence,quota:{allocation_id:'foreign'}}}),{code:'host-billing-receipt-binding-mismatch'});
});


function quotaFixtureState(f){
 f.team.quota_policy={protocol:1,automatic_redistribution:true};f.team.leader='participant';f.team.candidate='successor';f.team.status='handover';
 f.team.participants.successor={id:'successor',incarnation:'successor-inc',model:structuredClone(f.team.participants.participant.model)};
}
function exhaustedQuota(request){
 const ms=Date.now();return {protocol:1,...request,route:{endpoint:'https://fixture.invalid/quota',account:'fixture-account',sku:'fixture-sku',mode:'api',pool:'fixture-pool',model:request.model},status:'exhausted',available_calls:0,provider_confirmed:true,evidence_kind:'provider-quota',reason:'provider-quota-exhausted',scope:'provider-account-model',observation_id:'provider-observation',source:'https://fixture.invalid/quota',observed_at:new Date(ms).toISOString(),expires_at:new Date(ms+60000).toISOString()};
}
test('host renews expiring positive permission before native inference and blocks failed renewal',async t=>{
 for(const reject of [false,true]){
  let reads=0;
  const f=fixture(t,{dependencies:{observeProviderQuota:({descriptor,...request})=>{
   reads++;if(reject)throw new Error('metadata-unavailable');
   return {...exhaustedQuota(request),status:'available',available_calls:1,reason:'provider-quota-available'};
  }}});
  await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});
  f.team.quota_policy={protocol:1,automatic_redistribution:true};
  const p=f.team.participants.participant,model={provider:p.model.provider,model_id:p.model.model_id,reasoning:p.model.reasoning};
  p.quota_observation={...exhaustedQuota({participant:p.id,incarnation:p.incarnation,model_revision:p.model.model_revision,model}),status:'available',available_calls:1,reason:'provider-quota-available',expires_at:new Date(Date.now()+1000).toISOString()};
  if(reject){await assert.rejects(f.host.inspect({action:'fresh',nonce:'fresh'}),/metadata-unavailable/);assert.equal(f.calls.includes('native-send'),false);}
  else{await f.host.inspect({action:'fresh',nonce:'fresh'});assert.ok(f.calls.indexOf('quota-capture-v1')<f.calls.indexOf('native-send'));}
  assert.equal(reads,1);
 }
});
test('default quota observation refuses an unbound execution identity before inference',async t=>{
 const f=fixture(t);await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});quotaFixtureState(f);
 await assert.rejects(f.host.observeQuota(),/quota-native-execution-identity-unverified/);
 assert.equal(f.calls.includes('native-create'),false);assert.equal(f.calls.includes('quota-capture-v1'),false);
});
test('confirmed quota exhaustion is persisted with safe capability blocker and no inference',async t=>{
 const f=fixture(t,{dependencies:{observeProviderQuota:({descriptor,...request})=>exhaustedQuota(request)}});await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});quotaFixtureState(f);
 const result=await f.host.observeQuota();assert.equal(result.redistribution_required,true);assert.equal(result.redistribution_blocker,'host-nonbillable-handover-capability-unavailable');
 assert.equal(f.team.participants.participant.quota_observation.status,'exhausted');assert.equal(f.calls.includes('begin-handover-v1'),false);assert.equal(f.calls.includes('native-create'),false);
});
test('default stop refuses legacy routed consumption with no whole-operation ledger',async t=>{
 const f=fixture(t,{vaultPath:true});await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});f.host.registerParticipantHost();quotaFixtureState(f);
 f.team.work.legacy={id:'legacy',worker:'participant',epoch:0,status:'uncertain',invocation_id:'legacy-charge'};
 f.state.invocations={'legacy-charge':{id:'legacy-charge',team:'team',epoch:0,state:'settled',work_id:'legacy'}};
 await assert.rejects(f.host.driveQuotaHandover(),/historical-consumption-stop-unconfirmed/);
 assert.equal(f.calls.includes('quiesce-capture-v1'),false);assert.equal(f.calls.includes('native-create'),false);
});
test('quota driver requires bound stop proofs before retained work adoption without old leader inference',async t=>{
 let f;const events=[],proofs=[];
 const candidate={inspect(){throw new Error('driver must delegate candidate acknowledgement');},async acknowledgeHandover(fields){events.push(fields);assert.ok(f.team.handover.acks.participant.stopped);assert.ok(f.team.handover.acks.worker.stopped);if(fields.accept){f.team.leader='successor';f.team.status='active';f.team.epoch++;}}};
 const worker={async acknowledgeAdoption(fields){events.push({adoption:fields.workId});}};
 f=fixture(t,{dependencies:{async stopOwnedParticipant({team,participant,epoch}){proofs.push({team,participant:participant.id,incarnation:participant.incarnation,epoch});return {stopped:true,participant:participant.id,incarnation:participant.incarnation,epoch,evidence_digest:'a'.repeat(64)};},resolveParticipantHost:id=>id==='successor'?candidate:worker}});
 await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});quotaFixtureState(f);
 f.team.participants.worker={id:'worker',incarnation:'worker-inc',model:structuredClone(f.team.participants.participant.model)};f.team.work.retained={id:'retained',worker:'worker',status:'submitted'};
 const result=await f.host.driveQuotaHandover();assert.deepEqual(result,{redistributed:true,leader:'successor',epoch:1});
 assert.deepEqual(proofs,[{team:'team',participant:'participant',incarnation:'incarnation',epoch:0},{team:'team',participant:'worker',incarnation:'worker-inc',epoch:0}]);
 assert.deepEqual(events,[{workId:'retained'},{adoption:'retained'},{accept:true}]);assert.equal(f.calls.includes('native-create'),false);assert.equal(f.calls.filter(x=>x==='quiesce-capture-v1').length,2);
});
test('quota driver resolves a registered successor with its actual credential without resolver injection',async t=>{
 const f=fixture(t,{vaultPath:true,dependencies:{stopOwnedParticipant:({participant,epoch})=>({stopped:true,participant:participant.id,incarnation:participant.incarnation,epoch,evidence_digest:'a'.repeat(64)})}});
 await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});quotaFixtureState(f);
 f.team.participants.successor.credential_hash=sha('c'.repeat(64));
 const pc=join(f.root,'successor-credential.json');writeFileSync(pc,JSON.stringify({protocol:1,role:'participant',participant:'successor',incarnation:'successor-inc',token:'c'.repeat(64)}),{mode:0o600});
 const candidate=createTeamHost({authorityRoot:f.root,projectRoot:f.root,vaultPath:f.root,team:'team',hostDir:f.root,ownerCredential:join(f.root,'owner.json'),collectorPath:join(f.root,'successor-collector.json'),endpointPath:join(f.root,'successor-endpoint.json'),participant:'successor',participantCredential:pc},f.dependencies);
 await candidate.bootstrap({participant:'successor',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});candidate.registerParticipantHost();
 const result=await f.host.driveQuotaHandover();assert.equal(result.redistributed,true);assert.equal(result.leader,'successor');
 const acceptance=f.requests.find(x=>x.command.type==='handover-accept-v1');assert.equal(acceptance.command.actor,'successor');assert.equal(acceptance.command.incarnation,'successor-inc');
});
for(const mismatch of ['stopped','participant','incarnation','epoch','evidence_digest'])test('quota driver refuses uncertain or misbound stop proof: '+mismatch,async t=>{
 let resolutions=0;const proof={stopped:true,participant:'participant',incarnation:'incarnation',epoch:0,evidence_digest:'a'.repeat(64)};
 proof[mismatch]=mismatch==='stopped'?false:mismatch==='epoch'?1:mismatch==='evidence_digest'?'':'foreign';
 const f=fixture(t,{dependencies:{stopOwnedParticipant:async()=>proof,resolveParticipantHost:()=>{resolutions++;throw new Error('candidate must not be contacted');}}});
 await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});quotaFixtureState(f);
 await assert.rejects(f.host.driveQuotaHandover(),{code:'host-bound-owned-process-stop-required'});
 assert.equal(resolutions,0);assert.equal(f.calls.includes('quiesce-capture-v1'),false);assert.equal(f.calls.includes('native-create'),false);assert.equal(f.team.status,'handover');
});

test('subscription mode refuses unsupported execution-context accounting before injected native launch',async t=>{
 const f=fixture(t);await f.host.bootstrap({participant:'participant',descriptor:{managed:true,harness:'codex',cwd:f.root,mode:'read-only'}});
 f.team.accounting={protocol:1,mode:'subscription-tokens',revision:1};const calls=f.calls.length;
 await assert.rejects(f.host.inspect({action:'identity',nonce:'subscription-probe'}),{code:'host-subscription-execution-context-collector-unavailable'});
 assert.equal(f.calls.length,calls);assert.equal(f.calls.includes('native-create'),false);
});
