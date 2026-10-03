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
test('Claude context isolation is admitted only after matching native init proves zero tools', async () => {
  const endpoint = await createNativeEndpoint({harness:'claude',cwd,managed:true}, {spawnProcess:() => childMock((m,emit) => {
    emit({type:'system',subtype:'init',session_id:m.session_id,tools:[]});
    emit({type:'result',session_id:m.session_id,result:'ok',modelUsage:{'claude-exact':{}}});
  })});
  const result = await endpoint.send({prompt:'hello',invocation_nonce:'nonce',read_only:true,max_output_chars:8192});
  assert.equal(result.context_manifest.provenance,'adapter-isolated'); assert.equal(result.context_manifest.read_only,true);
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
    const value = path === '/global/health' ? {healthy:true,version:'test'} : path === '/config' ? JSON.parse(spawned.opts.env.OPENCODE_CONFIG_CONTENT) : path === '/session' ? {id:'new-owned',directory:cwd} : opts.method === 'GET' ? [] : {info:{role:'assistant',sessionID:'new-owned',providerID:'billing-proxy',modelID:'actual'},parts:[{type:'text',text:'reply'}]};
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
 },fetchImpl:async(url,opts)=>{const value=url.pathname==='/global/health'?{healthy:true,version:'test'}:url.pathname==='/config'?JSON.parse(spawned.env.OPENCODE_CONFIG_CONTENT):url.pathname==='/session'?{id:'own',directory:cwd}:opts.method==='GET'?[]:{info:{role:'assistant',sessionID:'own'},parts:[]};return {ok:true,body:[Buffer.from(JSON.stringify(value))]};}};
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
async function tokenEndpoint(turns,{fresh=true,replyAfterUsage=false,serverCollision=false,conflictingStart=false}={}) {
 let number=0,collisionId=null,collisionRejected=false;
 return createNativeEndpoint({harness:'codex',cwd,managed:true},{spawnProcess:()=>childMock((m,emit)=>{
  if(m.method===undefined && collisionId!==null && m.id===collisionId && m.error?.code===-32601)collisionRejected=true;
  if(m.method==='initialize')emit({id:m.id,result:{}});
  if(m.method==='thread/start')emit({id:m.id,result:{thread:{id:'token-owned',sessionId:'token-owned',cwd,ephemeral:fresh,turns:[],forkedFromId:null},model:'actual',modelProvider:'openai',reasoningEffort:'low',sandbox:{type:'readOnly',networkAccess:false}}});
  if(m.method==='mcpServerStatus/list')emit({id:m.id,result:{data:[],nextCursor:null}});
  if(m.method==='app/installed')emit({id:m.id,result:{apps:[]}});
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
 })});
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
