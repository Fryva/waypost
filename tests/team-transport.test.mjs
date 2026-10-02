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
