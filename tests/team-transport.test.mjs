import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createNativeEndpoint, validateNativeDescriptor } from '../scripts/team-transport.mjs';

const cwd = realpathSync(tmpdir());
function childMock(handle,config) {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.stdin = { write(s) { queueMicrotask(() => {const m=JSON.parse(s);if(m.method==='config/read')child.stdout.write(JSON.stringify(config ? {id:m.id,result:{config}} : {id:m.id,error:{code:-32601,message:'Fixture method unavailable'}})+'\n');else handle(m,m => child.stdout.write(JSON.stringify(m)+'\n'));}); } };
  child.kill = () => { queueMicrotask(() => child.emit('close',0)); return true; };
  return child;
}
test('native descriptors require explicit owned loopback binding and no implicit desktop sockets', () => {
  assert.throws(() => validateNativeDescriptor({harness:'codex',cwd}), /invalid-native-descriptor/);
  assert.throws(() => validateNativeDescriptor({harness:'codex',cwd,managed:true,socket:'/tmp/sock'}), /desktop-socket-protocol-unverified/);
  assert.throws(() => validateNativeDescriptor({harness:'claude',cwd,managed:true,mode:'workspace-write'}), /claude-managed-writes-unsupported/);
  assert.throws(() => validateNativeDescriptor({harness:'opencode',cwd,managed:true,url:'http://example.com:4096',password:'secret',create_session:true,read_only_enforced:true}), /loopback-native-endpoint-required/);
});
test('read-only Codex disables discovered MCP only in its own process overrides',async()=>{
 const calls=[];
 const endpoint=await createNativeEndpoint({harness:'codex',managed:true,cwd,reasoning:'low'}, {spawnProcess:(_exe,args)=>{
  calls.push(args);
  return childMock((m,emit)=>{
   if(m.method==='initialize')emit({id:m.id,result:{}});
   if(m.method==='thread/start'){assert.equal(m.params.sandbox,'read-only');emit({id:m.id,result:{thread:{id:'owned',sessionId:'owned',cwd,ephemeral:true,turns:[],forkedFromId:null},model:'fixture',modelProvider:'fixture',reasoningEffort:'low',sandbox:{type:'readOnly',networkAccess:false}}});}
   if(m.method==='mcpServerStatus/list')emit({id:m.id,result:{data:[],nextCursor:null}});
   if(m.method==='app/installed')emit({id:m.id,result:{apps:[]}});
   if(m.method==='turn/start'){emit({id:m.id,result:{turn:{id:'turn'}}});emit({method:'item/completed',params:{threadId:'owned',item:{type:'agentMessage',text:'ok'}}});emit({method:'turn/completed',params:{threadId:'owned',turn:{status:'completed'}}});}
  },{mcp_servers:{fixture_server:{enabled:true,command:'never execute'}}});
 }});
 assert.equal(calls.length,2);assert.ok(calls[1].includes('mcp_servers.fixture_server.enabled=false'));
 const r=await endpoint.send('echo',{id:'nonce'});assert.equal(r.context_manifest.fresh_review_verified,true);endpoint.close();
});
test('Codex managed thread serializes native turns and returns observed model metadata', async () => {
  let turn = 0, spawned;
  const endpoint = await createNativeEndpoint({harness:'codex',cwd,managed:true,model_id:'requested',reasoning:'low'}, {spawnProcess:(exe,args,opts) => {
    spawned = {exe,args,opts}; return childMock((m,emit) => {
      if (m.method === 'initialize') emit({id:m.id,result:{}});
      if (m.method === 'thread/start') emit({id:m.id,result:{thread:{id:'owned-thread'},model:'actual',modelProvider:'openai',reasoningEffort:'low',sandbox:{type:'readOnly'}}});
      if (m.method === 'turn/start') { turn++; emit({id:m.id,result:{turn:{id:'t'+turn}}}); emit({method:'item/completed',params:{threadId:'owned-thread',item:{type:'agentMessage',text:'reply '+turn}}}); emit({method:'turn/completed',params:{threadId:'owned-thread',turn:{status:'completed'}}}); }
    });
  }});
  const first = await endpoint.send('one',{id:'a'}); const second = await endpoint.send('two',{id:'b'});
  assert.equal(first.output,'reply 1'); assert.equal(second.text,'reply 2'); assert.equal(first.actualModel.model_id,'actual');
  assert.equal(spawned.opts.shell,false); assert.equal(first.native_id,second.native_id); assert.equal(first.context_manifest.fresh_review_verified,false);
  await assert.rejects(endpoint.send('again',{id:'a'}), /already-consumed/); endpoint.close();
});
test('Claude tools are disabled and requested effort is never mistaken for observed reasoning', async () => {
  let argv;
  const endpoint = await createNativeEndpoint({harness:'claude',cwd,managed:true,reasoning:'high'}, {spawnProcess:(_exe,args) => {
    argv = args; return childMock((m,emit) => emit({type:'result',session_id:m.session_id,result:'ok',usage:{thinking_tokens:0},modelUsage:{'claude-exact':{}}}));
  }});
  const response = await endpoint.send('hello',{id:'a'});
  assert.equal(response.actualModel.reasoning,'unknown'); assert.equal(response.actualModel.model_id,'claude-exact');
  assert.equal(argv[argv.indexOf('--tools')+1],''); assert.ok(argv.includes('--strict-mcp-config')); endpoint.close();
});
test('Codex isolated manifest requires observed fresh sandbox and empty external runtime inventory', async () => {
  let turn = 0;
  const endpoint = await createNativeEndpoint({harness:'codex',cwd,managed:true}, {spawnProcess:() => childMock((m,emit) => {
    if (m.method === 'initialize') emit({id:m.id,result:{}});
    if (m.method === 'thread/start') emit({id:m.id,result:{thread:{id:'isolated',sessionId:'isolated',cwd,ephemeral:true,turns:[],forkedFromId:null},model:'actual',modelProvider:'openai',reasoningEffort:'low',sandbox:{type:'readOnly',networkAccess:false}}});
    if (m.method === 'mcpServerStatus/list') emit({id:m.id,result:{data:[],nextCursor:null}});
    if (m.method === 'app/installed') emit({id:m.id,result:{apps:[]}});
    if (m.method === 'turn/start') { turn++; emit({id:m.id,result:{turn:{id:'t'+turn}}}); emit({method:'item/completed',params:{threadId:'isolated',item:{type:'agentMessage',text:'ok'}}}); emit({method:'turn/completed',params:{threadId:'isolated',turn:{status:'completed'}}}); }
  })});
  const result = await endpoint.send('review',{id:'one',read_only:true});
  assert.equal(result.context_manifest.fresh_review_verified,true); assert.equal(result.context_manifest.provenance,'adapter-isolated');
  assert.equal(result.context_manifest.isolation_evidence.before.source,'native-thread-mcp-app-runtime'); endpoint.close();
});
test('Claude post-turn empty init tools alone no longer admit isolation without a same-peer preflight', async () => {
  const endpoint = await createNativeEndpoint({harness:'claude',cwd,managed:true}, {spawnProcess:() => childMock((m,emit) => {
    emit({type:'system',subtype:'init',session_id:m.session_id,tools:[]});
    emit({type:'result',session_id:m.session_id,result:'ok',modelUsage:{'claude-exact':{}}});
  })});
  const result = await endpoint.send({prompt:'hello',invocation_nonce:'nonce',read_only:true,max_output_chars:8192});
  assert.equal(result.context_manifest.provenance,'unverified'); assert.equal(result.context_manifest.read_only,false); assert.equal(result.context_manifest.preflight,null);
  assert.equal(result.actualModel.reasoning,'unknown'); endpoint.close();
});
test('timeout poisons the endpoint; a new invocation cannot duplicate uncertain inference', async () => {
  const endpoint = await createNativeEndpoint({harness:'claude',cwd,managed:true,timeout_ms:100}, {spawnProcess:() => childMock(() => {})});
  await assert.rejects(endpoint.send('hi',{id:'one'}), /native-outcome-uncertain/);
  await assert.rejects(endpoint.send('again',{id:'two'}), /native-outcome-uncertain/); endpoint.close();
});
test('OpenCode sends only to its bound session with authentication and observes response identity', async () => {
  const calls = [];
  const fetchImpl = async (url,opts) => {
    calls.push({url:String(url),opts});
    const path = url.pathname;
    const value = path === '/global/health' ? {healthy:true,version:'1'} : path === '/session/owned' ? {id:'owned',directory:cwd} : {info:{sessionID:'owned',role:'assistant',providerID:'route',modelID:'exact'},parts:[{type:'text',text:'answer'}]};
    return {ok:true,body:[Buffer.from(JSON.stringify(value))]};
  };
  const endpoint = await createNativeEndpoint({harness:'opencode',cwd,managed:true,url:'http://127.0.0.1:4096',password:'secret',native_id:'owned',read_only_enforced:true}, {fetchImpl});
  const r = await endpoint.send('peer payload',{id:'one'});
  assert.equal(r.output,'answer'); assert.equal(r.context_manifest.fresh,false); assert.equal(r.actualModel.reasoning,'unknown');
  assert.ok(calls.every(c => c.opts.headers.Authorization.startsWith('Basic ')));
  assert.ok(calls.every(c => !c.url.endsWith('/session'))); endpoint.close();
});
test('owned OpenCode server uses secret env, deny config, empty history and mandatory close', async () => {
  let spawned, killed = false;
  const spawnProcess = (exe,args,opts) => {
    spawned = {exe,args,opts}; const child = childMock(() => {});
    child.kill = () => { killed = true; queueMicrotask(() => child.emit('close',0)); return true; };
    queueMicrotask(() => child.stdout.write('opencode server listening on http://127.0.0.1:43210\n'));
    return child;
  };
  const fetchImpl = async (url,opts) => {
    const path = url.pathname;
    const value = path === '/global/health' ? {healthy:true,version:'test'} : path === '/config' ? JSON.parse(spawned.opts.env.OPENCODE_CONFIG_CONTENT) : ['/session','/session/new-owned'].includes(path) ? {id:'new-owned',directory:cwd,permission:[{permission:'*',pattern:'*',action:'deny'}]} : opts.method === 'GET' ? [] : {info:{id:'msg_reply',parentID:JSON.parse(opts.body).messageID,time:{completed:1},finish:'stop',role:'assistant',sessionID:'new-owned',providerID:'billing-proxy',modelID:'actual'},parts:[{id:'prt_start',sessionID:'new-owned',messageID:'msg_reply',type:'step-start'},{id:'prt_text',sessionID:'new-owned',messageID:'msg_reply',type:'text',text:'reply'},{id:'prt_finish',sessionID:'new-owned',messageID:'msg_reply',type:'step-finish',reason:'stop'}]};
    return {ok:true,body:[Buffer.from(JSON.stringify(value))]};
  };
  const endpoint = await createNativeEndpoint({harness:'opencode',managed:true,cwd,spawn_server:true},{spawnProcess,fetchImpl});
  const result = await endpoint.send('hello',{id:'one'});
  assert.ok(spawned.args.includes('serve')); assert.ok(!spawned.args.includes(spawned.opts.env.OPENCODE_SERVER_PASSWORD));
  assert.equal(result.context_manifest.provenance,'adapter-isolated'); assert.equal(result.context_manifest.model_provider_is_billing_route,true);
  endpoint.close(); assert.equal(killed,true);
});
test('OpenCode numeric abort errors retain uncertain outcome and cannot be retried',async()=>{
 const fetchImpl=async(url,options)=>{
  if(options.method==='POST')throw Object.assign(new Error('Aborted'),{code:20});
  const value=url.pathname==='/global/health'?{healthy:true,version:'fixture'}:{id:'owned',directory:cwd};
  return {ok:true,body:[Buffer.from(JSON.stringify(value))]};
 };
 const endpoint=await createNativeEndpoint({harness:'opencode',cwd,managed:true,url:'http://127.0.0.1:4096',password:'secret',native_id:'owned',read_only_enforced:true},{fetchImpl});
 try{await assert.rejects(endpoint.send('probe',{id:'one'}),/native-outcome-uncertain/);await assert.rejects(endpoint.send('retry',{id:'two'}),/native-outcome-uncertain/);}finally{endpoint.close();}
});
function codexStartup(m,emit){
 if(m.method==='initialize')emit({id:m.id,result:{}});
 if(m.method==='thread/start')emit({id:m.id,result:{thread:{id:'owned'},model:'fixture',modelProvider:'openai',reasoningEffort:'low',sandbox:{type:'readOnly'}}});
}
test('Codex and Claude stopAndWait returns only after the held child closes',async()=>{
 for(const harness of ['codex','claude']){
  let closed=false;const signals=[];
  const endpoint=await createNativeEndpoint({harness,cwd,managed:true},{spawnProcess:()=>{
   const child=childMock(codexStartup);child.kill=signal=>{signals.push(signal);setTimeout(()=>{closed=true;child.emit('close',0);},20);return true;};return child;
  }});
  const pending=endpoint.stopAndWait({timeoutMs:200,killAfterMs:100});assert.equal(closed,false);
  assert.deepEqual(await pending,{stopped:true,owned_processes:1,process_group_closed:true});assert.equal(closed,true);assert.deepEqual(signals,['SIGTERM']);
  assert.deepEqual(await endpoint.stopAndWait(),{stopped:true,owned_processes:1,process_group_closed:true});
 }
});
test('unconfirmed native shutdown escalates and returns an explicit blocker',async()=>{
 for(const harness of ['codex','claude']){
  const signals=[];
  const endpoint=await createNativeEndpoint({harness,cwd,managed:true},{spawnProcess:()=>{const child=childMock(codexStartup);child.kill=signal=>{signals.push(signal);return true;};return child;}});
  await assert.rejects(endpoint.stopAndWait({timeoutMs:100,killAfterMs:10}),/native-process-stop-unconfirmed/);assert.deepEqual(signals,['SIGTERM','SIGKILL']);
  await assert.rejects(endpoint.send('later',{id:'new'}),/native-endpoint-closed/);
 }
});
test('Codex configuration replacement waits for original child closure before spawning',async()=>{
 let originalClosed=false,spawned=0;
 const endpoint=await createNativeEndpoint({harness:'codex',cwd,managed:true},{spawnProcess:()=>{
  const first=++spawned===1;if(!first)assert.equal(originalClosed,true);
  const child=childMock(codexStartup,first?{mcp_servers:{fixture:{enabled:true}}}:{mcp_servers:{}});
  if(first)child.kill=()=>{setTimeout(()=>{originalClosed=true;child.emit('close',0);},20);return true;};return child;
 }});
 assert.equal(spawned,2);await endpoint.stopAndWait();
});
test('null, arrays and primitive native stdio frames reject and await explicit closure',async()=>{
 for(const value of [null,[],1,true,'bad']){
  const endpoint=await createNativeEndpoint({harness:'claude',cwd,managed:true},{spawnProcess:()=>childMock((_m,emit)=>emit(value))});
  await assert.rejects(endpoint.send('probe',{id:'first'}),/invalid-native-frame/);
  assert.equal((await endpoint.stopAndWait()).stopped,true);
 }
});
function ownedServerFixture(closeOnKill){
 let spawned,closed=false;const signals=[];
 return {signals,get closed(){return closed;},spawnProcess:(_exe,_args,opts)=>{
  spawned=opts;const child=childMock(()=>{});child.kill=signal=>{signals.push(signal);if(closeOnKill)setTimeout(()=>{closed=true;child.emit('close',0);},20);return true;};queueMicrotask(()=>child.stdout.write('http://127.0.0.1:43210\n'));return child;
 },fetchImpl:async(url,opts)=>{const value=url.pathname==='/global/health'?{healthy:true,version:'test'}:url.pathname==='/config'?JSON.parse(spawned.env.OPENCODE_CONFIG_CONTENT):['/session','/session/own'].includes(url.pathname)?{id:'own',directory:cwd,permission:[{permission:'*',pattern:'*',action:'deny'}]}:opts.method==='GET'?[]:{info:{role:'assistant',sessionID:'own'},parts:[]};return {ok:true,body:[Buffer.from(JSON.stringify(value))]};}};
}
test('owned OpenCode server shutdown waits for closure and never fabricates timeout proof',async()=>{
 for(const closes of [true,false]){
  const f=ownedServerFixture(closes),endpoint=await createNativeEndpoint({harness:'opencode',managed:true,cwd,spawn_server:true},f);
  const stopped=endpoint.stopAndWait({timeoutMs:100,killAfterMs:50});
  if(closes){assert.equal(f.closed,false);assert.equal((await stopped).stopped,true);assert.equal(f.closed,true);}
  else{await assert.rejects(stopped,/native-process-stop-unconfirmed/);assert.deepEqual(f.signals,['SIGTERM','SIGKILL']);}
 }
});
test('an externally bound OpenCode server cannot receive an owned process stop proof',async()=>{
 const fetchImpl=async url=>({ok:true,body:[Buffer.from(JSON.stringify(url.pathname==='/global/health'?{healthy:true,version:'test'}:{id:'own',directory:cwd}))]});
 const endpoint=await createNativeEndpoint({harness:'opencode',cwd,managed:true,url:'http://127.0.0.1:43210',password:'secret',native_id:'own',read_only_enforced:true},{fetchImpl});
 await assert.rejects(endpoint.stopAndWait(),/native-process-stop-unverified-external-server/);
});

const counters=(total,input=total-2,extra={})=>({totalTokens:total,inputTokens:input,cachedInputTokens:1,outputTokens:total-input,reasoningOutputTokens:1,...extra});
// The live ChatGPT Plus shape (Codex 0.160.0) with identifiers replaced.
const codexBucket=(over={})=>({limitId:'codex',limitName:null,normalModelSlug:null,primary:{usedPercent:3,windowDurationMins:300,resetsAt:1791142753},secondary:{usedPercent:90,windowDurationMins:10080,resetsAt:1791580344},credits:{hasCredits:false,unlimited:false,balance:'0'},individualLimit:null,spendControlReached:false,planType:'plus',rateLimitReachedType:null,...over});
function codexRate(over={},bucket={}){const b=codexBucket(bucket);return {ordinaryUsageAllowed:true,rateLimits:b,rateLimitsByLimitId:{codex:b},rateLimitResetCredits:{availableCount:0,credits:[]},accountId:'native-private-account',rateLimitUpsell:null,...over};}
async function tokenEndpoint(turns,{fresh=true,replyAfterUsage=false,serverCollision=false,conflictingStart=false,metadata=false,accountChange=false,billing=null}={}) {
 if(billing)metadata=true;
 let number=0,collisionId=null,collisionRejected=false;
 return createNativeEndpoint({harness:'codex',cwd,managed:true},{spawnProcess:()=>childMock((m,emit)=>{
  if(m.method===undefined && collisionId!==null && m.id===collisionId && m.error?.code===-32601)collisionRejected=true;
  if(m.method==='initialize')emit({id:m.id,result:billing?{userAgent:'Codex Desktop/'+(billing.version||'0.160.0')+' (Mac OS 27.0.1; arm64) dumb (waypost; 1.0.0)'}:{}});
  if(m.method==='account/rateLimits/read')emit(billing?.rateError?{id:m.id,error:{code:-32603}}:{id:m.id,result:(billing?.rate||codexRate)()});
  if(m.method==='thread/start')emit({id:m.id,result:{thread:{id:'token-owned',sessionId:'token-owned',cwd,ephemeral:fresh,turns:[],forkedFromId:null},model:'actual',modelProvider:billing?.provider||'openai',reasoningEffort:'low',sandbox:{type:'readOnly',networkAccess:false}}});
  if(m.method==='mcpServerStatus/list')emit({id:m.id,result:{data:[],nextCursor:null}});
  if(m.method==='app/installed')emit({id:m.id,result:{apps:[]}});
  if(m.method==='getAuthStatus'){assert.equal(m.params.includeToken,false);assert.equal(m.params.refreshToken,false);if(accountChange)emit({method:'account/updated',params:{}});emit(metadata?{id:m.id,result:{authMethod:billing?.auth||'chatgpt',authToken:'never-store-this',...(billing?{requiresOpenaiAuth:true}:{})}}:{id:m.id,error:{code:-32601}});}
  if(m.method==='account/read'){assert.equal(m.params.refreshToken,false);emit(metadata?{id:m.id,result:{account:{type:'chatgpt',planType:billing?.plan||'plus',email:'private-profile@example.test'},workspaceRouting:{chatgptAccountId:'native-private-account',backendOrigin:'https://chatgpt.com'}}}:{id:m.id,error:{code:-32601}});}
  if(m.method==='turn/start'){
   const index=number++,turn='token-turn-'+index;
   if(serverCollision){collisionId=m.id;emit({id:m.id,method:'item/tool/call',params:{threadId:'token-owned'}});}
   if(!replyAfterUsage)emit({id:m.id,result:{turn:{id:turn}}});
   for(const event of turns[index]||[])emit({method:'thread/tokenUsage/updated',params:{threadId:'token-owned',turnId:turn,...event}});
   if(replyAfterUsage)emit({id:m.id,result:{turn:{id:turn}}});
   if(conflictingStart)emit({id:m.id,result:{turn:{id:'conflicting-turn'}}});
   if(serverCollision)queueMicrotask(()=>assert.equal(collisionRejected,true));
   emit({method:'item/completed',params:{threadId:'token-owned',item:{type:'agentMessage',text:'ok'}}});
   emit({method:'turn/completed',params:{threadId:'token-owned',turn:{id:turn,status:'completed'}}});
  }
 },billing?{openai_base_url:Object.hasOwn(billing,'baseUrl')?billing.baseUrl:null,model_provider:null,mcp_servers:{}}:undefined)});
}
test('Codex native cumulative span binds two own turns without summing cached or reasoning subsets',async()=>{
 const first=counters(10),second=counters(30,25),last=counters(7,5);
 const endpoint=await tokenEndpoint([[{tokenUsage:{total:first,last:first}},{tokenUsage:{total:first,last:first}}],[{tokenUsage:{total:second,last}}]]);
 try{
  const a=await endpoint.send('one',{id:'span-1'}),b=await endpoint.send('two',{id:'span-2'});
  assert.equal(a.usage_span.coverage,'complete');assert.equal(a.usage_span.baseline_source,'native-first-cumulative-equals-last');
  assert.equal(a.usage_span.before,'0');assert.equal(a.usage_span.after,'10');assert.equal(a.usage_span.actual_tokens,'10');
  assert.equal(b.usage_span.coverage,'complete');assert.equal(b.usage_span.before,'10');assert.equal(b.usage_span.after,'30');assert.equal(b.usage_span.actual_tokens,'20');
  assert.equal(b.usage_span.turn_id,'token-turn-1');assert.equal(b.usage_span.native_id,b.native_id);
  assert.deepEqual(b.usage,{total:second,last});assert.equal(b.usage_span.baseline_source,'previous-bound-terminal');
 }finally{endpoint.close();}
});
test('fresh thread alone never fabricates native zero token baseline',async()=>{
 for(const options of [{fresh:true},{fresh:false}]){
  const total=counters(30),last=counters(options.fresh?10:30);
  const endpoint=await tokenEndpoint([[{tokenUsage:{total,last}}]],options);
  try{const r=await endpoint.send('one',{id:'unproven'});assert.equal(r.usage_span.coverage,'partial');assert.equal(r.usage_span.before,null);assert.equal(r.usage_span.actual_tokens,null);}
  finally{endpoint.close();}
 }
});
test('missing, foreign-turn, reordered and decreasing token snapshots never produce a complete span',async()=>{
 const first=counters(10),next=counters(20);
 for(const events of [[],[{tokenUsage:{total:{totalTokens:10},last:{totalTokens:10}}}],[{turnId:'foreign-turn',tokenUsage:{total:first,last:first}}],[{tokenUsage:{total:next,last:next}},{tokenUsage:{total:first,last:first}}]]){
  const endpoint=await tokenEndpoint([events]);
  try{const r=await endpoint.send('one',{id:'uncertain'});assert.notEqual(r.usage_span.coverage,'complete');assert.equal(r.usage_span.actual_tokens,null);}
  finally{endpoint.close();}
 }
 const endpoint=await tokenEndpoint([[{tokenUsage:{total:first,last:first}}],[{tokenUsage:{total:counters(5,3),last:counters(5,3)}}]]);
 try{await endpoint.send('one',{id:'before'});const r=await endpoint.send('two',{id:'decrease'});assert.equal(r.usage_span.coverage,'partial');assert.equal(r.usage_span.actual_tokens,null);}
 finally{endpoint.close();}
});
test('foreign thread counters are ignored and a missing native update breaks cumulative baseline continuity',async()=>{
 const first=counters(10),later=counters(30,25);
 const endpoint=await tokenEndpoint([[{threadId:'foreign-thread',tokenUsage:{total:counters(900),last:counters(900)}},{tokenUsage:{total:first,last:first}}],[],[{tokenUsage:{total:later,last:counters(20,18)}}]]);
 try{
  assert.equal((await endpoint.send('one',{id:'own'})).usage_span.actual_tokens,'10');
  assert.equal((await endpoint.send('two',{id:'gap'})).usage_span.coverage,'absent');
  const r=await endpoint.send('three',{id:'after-gap'});assert.equal(r.usage_span.coverage,'partial');assert.equal(r.usage_span.actual_tokens,null);
 }finally{endpoint.close();}
});
test('optional native cache-write counter participates in first baseline proof and schema continuity',async()=>{
 const first=counters(10,8,{cacheWriteInputTokens:3}),mismatch={...first,cacheWriteInputTokens:2};
 for(const last of [first,mismatch]){
  const endpoint=await tokenEndpoint([[{tokenUsage:{total:first,last}}]]);
  try{const r=await endpoint.send('one',{id:'cache-proof'});assert.equal(r.usage_span.coverage,last===first?'complete':'partial');}
  finally{endpoint.close();}
 }
 const endpoint=await tokenEndpoint([[{tokenUsage:{total:counters(10),last:counters(10)}}],[{tokenUsage:{total:counters(30,25,{cacheWriteInputTokens:3}),last:counters(20,18,{cacheWriteInputTokens:1})}}]]);
 try{await endpoint.send('one',{id:'old-schema'});assert.equal((await endpoint.send('two',{id:'new-schema'})).usage_span.coverage,'partial');}
 finally{endpoint.close();}
});
test('token notification before correlated native turn-start reply stays partial',async()=>{
 const usage=counters(10),endpoint=await tokenEndpoint([[{tokenUsage:{total:usage,last:usage}}]],{replyAfterUsage:true});
 try{const r=await endpoint.send('one',{id:'early-notification'});assert.equal(r.usage_span.coverage,'partial');assert.equal(r.usage_span.actual_tokens,null);}
 finally{endpoint.close();}
});

test('server request id collision receives refusal and cannot replace native turn correlation',async()=>{
 const value=counters(10),endpoint=await tokenEndpoint([[{tokenUsage:{total:value,last:value}}]],{serverCollision:true});
 try{const r=await endpoint.send('one',{id:'collision'});assert.equal(r.usage_span.coverage,'complete');assert.equal(r.usage_span.turn_id,'token-turn-0');}
 finally{endpoint.close();}
});
test('conflicting repeated start response cannot rebind a native token span',async()=>{
 const value=counters(10),endpoint=await tokenEndpoint([[{tokenUsage:{total:value,last:value}}]],{conflictingStart:true});
 try{const r=await endpoint.send('one',{id:'conflicting-start'});assert.equal(r.usage_span.coverage,'partial');assert.equal(r.usage_span.actual_tokens,null);assert.equal(r.usage_span.turn_id,'token-turn-0');}
 finally{endpoint.close();}
});

test('same-peer billing metadata strips credentials and identifies native observations without monetary guarantees',async()=>{
 const endpoint=await tokenEndpoint([],{metadata:true});
 try{const observation=await endpoint.captureAccountingMetadata();assert.equal(observation.auth_method,'chatgpt');assert.equal(observation.origin,'https://chatgpt.com');assert.match(observation.account,/^[a-f0-9]{64}$/);assert.equal(observation.mode,'unknown');assert.equal(observation.paid_fallback,'unknown');assert.equal(observation.credit_availability,'unknown');assert.equal(observation.consistent,true);assert.doesNotMatch(JSON.stringify(observation),/never-store-this|private-profile|native-private-account/);}
 finally{endpoint.close();}
});
test('unsupported native metadata remains explicit unknown without disabling counter measurement',async()=>{
 const endpoint=await tokenEndpoint([]);
 try{const observation=await endpoint.captureAccountingMetadata();assert.equal(observation.provider,'openai');assert.equal(observation.origin,null);assert.equal(observation.account,null);assert.equal(observation.auth_method,null);assert.equal(observation.paid_fallback,'unknown');assert.equal(observation.provenance,'native-runtime');}
 finally{endpoint.close();}
});
test('account notification during same-peer metadata capture makes its continuity uncertain',async()=>{
 const endpoint=await tokenEndpoint([],{metadata:true,accountChange:true});
 try{const observation=await endpoint.captureAccountingMetadata();assert.equal(observation.consistent,false);assert.equal(observation.account_generation,1);assert.equal(observation.paid_fallback,'unknown');}
 finally{endpoint.close();}
});

function accountingOpenCodeFixture(options={}) {
  let spawned, history=[], result, request;
  const session={id:'ses_own',directory:cwd,permission:[{permission:'*',pattern:'*',action:'deny'}]};
  const response=value=>({ok:true,body:[Buffer.from(JSON.stringify(value))]});
  return {get result(){return result;},get request(){return request;},
    spawnProcess:(_exe,_args,opts)=>{spawned=opts;const child=childMock(()=>{});queueMicrotask(()=>child.stdout.write('http://127.0.0.1:43210\n'));return child;},
    fetchImpl:async(url,opts)=>{
      if(url.pathname==='/global/health')return response({healthy:true,version:options.version||'1.18.33'});
      if(url.pathname==='/config'){
        if(options.postInspectFailure&&history.length)throw Error('private diagnostic');
        const config=JSON.parse(spawned.env.OPENCODE_CONFIG_CONTENT);
        if(options.allowException)config.permission.bash={ '*':'deny','allowed-command':'allow'};
        return response(config);
      }
      if(['/session','/session/ses_own'].includes(url.pathname))return response(session);
      if(opts.method==='GET')return response(history);
      request=JSON.parse(opts.body);
      const tokens={input:10,output:7,reasoning:3,cache:{read:4,write:6},total:999};
      result={info:{id:'msg_assistant',sessionID:'ses_own',parentID:request.messageID,role:'assistant',time:{completed:1},finish:'stop',providerID:'proxy',modelID:'actual',tokens},parts:[
        {id:'prt_start',sessionID:'ses_own',messageID:'msg_assistant',type:'step-start'},
        {id:'prt_text',sessionID:'ses_own',messageID:'msg_assistant',type:'text',text:'answer'},
        {id:'prt_finish',sessionID:'ses_own',messageID:'msg_assistant',type:'step-finish',reason:'stop',tokens}
      ]};
      options.mutate?.(result);
      if(options.nativeError)result.info.error={name:'APIError',data:{statusCode:429,message:'private diagnostic'}};
      history=[{info:{id:request.messageID,sessionID:'ses_own',role:'user'},parts:[{id:'prt_user',sessionID:'ses_own',messageID:request.messageID,type:'text',text:request.parts[0].text}]},result];
      if(options.historyMutate)history=options.historyMutate(structuredClone(history));
      if(options.extraHistory)history.push({info:{id:'msg_extra',sessionID:'ses_own',role:'assistant'},parts:[]});
      return response(result);
    }
  };
}
async function accountingOpenCode(options={}) {
  const fixture=accountingOpenCodeFixture(options);
  const endpoint=await createNativeEndpoint({harness:'opencode',managed:true,cwd,spawn_server:true},fixture);
  return {endpoint,fixture};
}
test('OpenCode counts disjoint normalized step buckets and binds own request/history',async()=>{
  const {endpoint,fixture}=await accountingOpenCode();
  assert.equal(endpoint.usage_counter_schema,'opencode-native-normalized-step-total-v1');
  const metadata=await endpoint.captureAccountingMetadata();
  assert.equal(metadata.mode,'unknown');assert.equal(metadata.provider,null);assert.equal(metadata.paid_fallback,'unknown');
  const r=await endpoint.send('probe',{id:'nonce'});
  assert.match(fixture.request.messageID,/^msg_[a-f0-9]{12}[0-9A-Za-z]{14}$/);
  assert.equal(r.usage_span.coverage,'complete');assert.equal(r.usage_span.actual_tokens,'30');assert.equal(r.usage_span.raw_total,'999');
  assert.equal(r.usage_span.turn_id,'msg_assistant');assert.equal(r.context_manifest.read_only,true);
  // A repeated native ID/history cannot mint another complete span.
  await assert.rejects(endpoint.send('probe',{id:'nonce2'}),error=>{assert.equal(error.code,'native-turn-binding-unverified');assert.equal(error.native_receipt.usage_span.coverage,'partial');return true;});endpoint.close();
});
test('OpenCode rejects permission exceptions despite wildcard deny',async()=>{
  await assert.rejects(accountingOpenCode({allowException:true}),/native-read-only-configuration-unverified/);
});
test('OpenCode incomplete, foreign, duplicate, reordered and extra-step evidence stays partial',async()=>{
  const variants=[
    {version:'future'},
    {extraHistory:true},
    {mutate:r=>{delete r.info.time.completed;}},
    {mutate:r=>{r.info.parentID='msg_foreign';}},
    {mutate:r=>{r.parts[1].sessionID='ses_foreign';}},
    {mutate:r=>{r.parts[1].id=r.parts[0].id;}},
    {mutate:r=>{r.parts.reverse();}},
    {mutate:r=>{r.parts.push({...r.parts[0],id:'prt_second'});}},
    {mutate:r=>{r.parts.push({id:'prt_tool',sessionID:'ses_own',messageID:r.info.id,type:'tool'});}},
    {mutate:r=>{r.info.tokens.input=-1;}},
    {mutate:r=>{delete r.info.tokens.reasoning;}},
    {mutate:r=>{Object.assign(r.info.tokens,{input:0,output:0,reasoning:0,cache:{read:0,write:0}});}}
  ];
  for(const options of variants){const {endpoint}=await accountingOpenCode(options);let r;try{r=await endpoint.send('probe',{id:'one'});}catch(error){assert.equal(error.code,'native-turn-binding-unverified');r=error.native_receipt;}assert.equal(r.usage_span.coverage,'partial');assert.equal(r.usage_span.actual_tokens,null);endpoint.close();}
});
test('OpenCode post isolation failure preserves validated known usage with isolation false',async()=>{
  const {endpoint}=await accountingOpenCode({postInspectFailure:true});
  const r=await endpoint.send('probe',{id:'one'});
  assert.equal(r.usage_span.actual_tokens,'30');assert.equal(r.context_manifest.read_only,false);endpoint.close();
});
test('OpenCode bounded error receipts retain known usage and bind invocation without private output',async()=>{
  for(const options of [{nativeError:true},{}]){
    const {endpoint}=await accountingOpenCode(options);
    await assert.rejects(endpoint.send('probe',{id:'bound-nonce',...(options.nativeError?{}:{max_output_chars:1})}),error=>{
      assert.equal(error.code,options.nativeError?'native-turn-failed':'native-answer-budget');
      assert.equal(error.native_receipt.invocation_id,'bound-nonce');assert.equal(error.native_receipt.usage_span.actual_tokens,'30');
      assert.deepEqual(Object.keys(error.native_receipt).sort(),['actualModel','context_manifest','invocation_id','native_id','usage_span']);
      assert.equal(JSON.stringify(error.native_receipt).includes('private diagnostic'),false);assert.equal(Object.hasOwn(error.native_receipt,'output'),false);return true;
    });endpoint.close();
  }
});

test('OpenCode counter gap permanently disables complete coverage',async()=>{
  let first=true;
  const {endpoint}=await accountingOpenCode({mutate:r=>{const suffix=first?'first':'later';r.info.id+='_'+suffix;for(const p of r.parts){p.id+='_'+suffix;p.messageID=r.info.id;}if(first){first=false;delete r.info.tokens.reasoning;}}});
  assert.equal((await endpoint.send('probe',{id:'gap'})).usage_span.coverage,'partial');
  assert.equal((await endpoint.send('probe',{id:'later'})).usage_span.coverage,'partial');endpoint.close();
});

test('OpenCode missing assistant counter summary stays absent rather than losing the bound receipt',async()=>{
 const {endpoint}=await accountingOpenCode({mutate:r=>{delete r.info.tokens;}});
 const r=await endpoint.send('probe',{id:'missing-summary'});assert.equal(r.usage_span.coverage,'absent');assert.equal(r.usage_span.actual_tokens,null);endpoint.close();
});

test('OpenCode correlated API failure with no completed step remains uncertain instead of a binding conflict',async()=>{
 const {endpoint}=await accountingOpenCode({nativeError:true,mutate:r=>{r.parts=[];delete r.info.finish;r.info.tokens={input:0,output:0,reasoning:0,cache:{read:0,write:0}};}});
 await assert.rejects(endpoint.send('probe',{id:'failed-api'}),error=>{assert.equal(error.code,'native-turn-failed');assert.equal(error.native_receipt.usage_span.coverage,'partial');assert.equal(error.native_receipt.usage_span.actual_tokens,null);assert.equal(error.native_receipt.invocation_id,'failed-api');return true;});endpoint.close();
});


test('OpenCode stored JSON key order does not alter exact native span binding',async()=>{
 const reverse=value=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reverse(v)])):value;
 const {endpoint}=await accountingOpenCode({historyMutate:reverse});
 try{const r=await endpoint.send('probe',{id:'reordered-json-keys'});assert.equal(r.usage_span.coverage,'complete');assert.equal(r.usage_span.actual_tokens,'30');}finally{endpoint.close();}
});
test('OpenCode stored frame differences remain unverified after structural comparison',async()=>{
 for(const change of [m=>m.info.tokens.input++,m=>m.parts[1].text='foreign',m=>m.info.parentID='foreign',m=>m.parts.reverse()]){
  const {endpoint}=await accountingOpenCode({historyMutate:h=>{change(h[1]);return h;}});
  try{const r=await endpoint.send('probe',{id:'conflicting-inventory'});assert.equal(r.usage_span.coverage,'partial');assert.equal(r.usage_span.actual_tokens,null);assert.ok(r.usage_span.blockers.includes('native-step-inventory-unverified'));}finally{endpoint.close();}
 }
});

test('Codex billing is known only for the OpenAI thread provider over a personal ChatGPT plan with no credits on a pinned version',async()=>{
 const read=async billing=>{const endpoint=await tokenEndpoint([],{billing});try{return await endpoint.captureAccountingMetadata();}finally{endpoint.close();}};
 const known=await read({});assert.equal(known.mode,'subscription');assert.equal(known.paid_fallback,false);assert.equal(known.credit_availability,'unavailable');assert.equal(known.sku,'plus');assert.match(known.account,/^[a-f0-9]{64}$/);
 assert.doesNotMatch(JSON.stringify(known),/never-store-this|private-profile|native-private-account|usedPercent|resetsAt/);
 assert.equal((await read({plan:'free'})).mode,'free');
 for(const billing of [{baseUrl:'https://gateway.invalid/v1'},{provider:'azure'},{auth:'apikey'},{plan:'team'},{plan:'enterprise'},{version:'0.161.0'},{rate:()=>codexRate({},{credits:{hasCredits:true,unlimited:false,balance:'5'}})},{rate:()=>codexRate({},{credits:{hasCredits:false,unlimited:true,balance:null}})},{rate:()=>codexRate({},{credits:null})}]){
  const x=await read(billing);assert.deepEqual([x.mode,x.paid_fallback,x.credit_availability],['unknown','unknown','unknown'],JSON.stringify(billing));
 }
 // The app-server gives model buckets `credits: null`; only the account bucket carries credits.
 const spark={limitId:'spark',normalModelSlug:'spark',credits:null,rateLimitReachedType:null,planType:'plus'};
 assert.equal((await read({rate:()=>{const r=codexRate();r.rateLimitsByLimitId.spark=spark;return r;}})).paid_fallback,false);
 assert.equal((await read({rate:()=>{const r=codexRate();r.rateLimitsByLimitId.spark={...spark,credits:{hasCredits:true,unlimited:false,balance:'1'}};return r;}})).paid_fallback,'unknown');
 await assert.rejects(read({rate:()=>codexRate({accountId:'another-account'})}),/native-accounting-account-changed/);
 await assert.rejects(read({rateError:true}),/native-/);
});
