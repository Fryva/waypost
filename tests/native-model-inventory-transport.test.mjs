import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createNativeModelInventoryEndpoint, nativeInventoryFailureClosure } from '../scripts/team-transport.mjs';
const cwd=realpathSync(tmpdir());
function child(handle){
 const c=new EventEmitter();c.stdout=new PassThrough();c.stderr=new PassThrough();c.kills=0;
 c.stdin={write(line){queueMicrotask(()=>handle(JSON.parse(line),reply=>c.stdout.write(JSON.stringify(reply)+'\n')));}};
 c.kill=()=>{c.kills++;queueMicrotask(()=>c.emit('close',0));return true;};return c;
}
function codex(pages,init={}){
 const calls=[];let process;
 return {calls,get process(){return process;},deps:{spawnProcess(_exe,args,options){calls.push({args,options});process=child((m,reply)=>{calls.push(m);if(m.method==='initialize')reply({id:m.id,result:init});if(m.method==='model/list'){const result=typeof pages==='function'?pages(m):pages.shift();reply({id:m.id,result});}});return process;}}};
}
const descriptor={harness:'codex',managed:true,cwd,timeout_ms:1000};
test('Codex metadata endpoint initializes and paginates without starting a thread or turn',async()=>{
 const native=codex([{data:[{id:'one',supportedReasoningEfforts:[{reasoningEffort:'future-effort'}]}],nextCursor:'opaque'},{data:[{id:'two'}],nextCursor:null}],{serverInfo:{version:'0.159.0'}});
 const endpoint=await createNativeModelInventoryEndpoint(descriptor,native.deps),result=await endpoint.listModelConfigurations();
 assert.equal(result.complete,true);assert.equal(result.pages,2);assert.equal(result.version,'0.159.0');assert.equal(result.version_provenance,'native-initialize');assert.deepEqual(result.filters,{includeHidden:true});assert.equal(result.response.data[0].supportedReasoningEfforts[0].reasoningEffort,'future-effort');
 assert.deepEqual(native.calls.filter(c=>c.method).map(c=>c.method),['initialize','initialized','model/list','model/list']);assert.deepEqual(native.calls.find(c=>c.method==='model/list').params,{limit:100,cursor:null,includeHidden:true});
 assert.equal(native.calls[0].options.shell,false);assert.equal(endpoint.owns_process,true);assert.equal(Object.hasOwn(endpoint,'send'),false);assert.equal(Object.hasOwn(endpoint,'native_id'),false);
 await endpoint.stopAndWait();assert.ok(native.process.kills);await assert.rejects(endpoint.listModelConfigurations(),/native-inventory-closed/);
});
test('Codex cannot reinterpret a user-agent string as runtime version',async()=>{
 const native=codex([{data:[],nextCursor:null}],{userAgent:'personal-user machine codex/0.1'}),endpoint=await createNativeModelInventoryEndpoint(descriptor,native.deps);
 assert.equal((await endpoint.listModelConfigurations()).version,'unknown');await endpoint.stopAndWait();
});
test('malformed pages, repeated cursors and unfinished pagination poison and stop the owned peer',async()=>{
 for(const source of [()=>({data:'bad',nextCursor:null}),()=>({data:[],nextCursor:'repeated'}),m=>({data:[],nextCursor:'cursor-'+m.id}),()=>({data:Array.from({length:101},()=>({id:'x'})),nextCursor:null})]){
  const native=codex(source),endpoint=await createNativeModelInventoryEndpoint(descriptor,native.deps);
  await assert.rejects(endpoint.listModelConfigurations(),/native-inventory-page-invalid|native-inventory-cursor-repeated|native-inventory-page-limit/);assert.ok(native.process.kills);await assert.rejects(endpoint.listModelConfigurations(),/native-inventory-closed/);
 }
});
test('metadata descriptor rejects personal endpoints, chosen models and Claude before launch',async()=>{
 let launches=0;const deps={spawnProcess(){launches++;throw Error('must not launch');}};
 for(const changes of [{model_id:'chosen'},{reasoning:'high'},{native_id:'personal'},{socket:'/personal'},{url:'http://127.0.0.1:4096'},{password:'secret'},{mode:'workspace-write'},{harness:'claude'},{harness:'opencode'}])await assert.rejects(createNativeModelInventoryEndpoint({...descriptor,...changes},deps),/invalid-native-inventory-descriptor|native-model-inventory-unsupported|owned-native-inventory-server-required/);
 assert.equal(launches,0);
});
function opencode(fetchHandler){
 const calls=[];let process;
 return {calls,get process(){return process;},deps:{spawnProcess(_exe,args,options){calls.push({args,options});process=child(()=>{});queueMicrotask(()=>process.stdout.write('listening http://127.0.0.1:45555\n'));return process;},async fetchImpl(url,options){calls.push({path:url.pathname,options});return fetchHandler(url,options);}}};
}
const serverDescriptor={managed:true,harness:'opencode',cwd,spawn_server:true,timeout_ms:1000};
const json=value=>({ok:true,body:(async function*(){yield Buffer.from(JSON.stringify(value));})()});
test('OpenCode inventory reads only health and provider through its own authenticated loopback',async()=>{
 const native=opencode(url=>json(url.pathname==='/global/health'?{healthy:true,version:'1.18.33'}:{all:[{id:'route',models:{m:{id:'m'}}}],default:{route:'m'},connected:['route']}));
 const endpoint=await createNativeModelInventoryEndpoint(serverDescriptor,native.deps),result=await endpoint.listModelConfigurations();assert.equal(result.harness,'opencode');assert.equal(result.version_provenance,'native-health');assert.equal(result.pages,1);assert.equal(result.complete,true);
 assert.deepEqual(native.calls.filter(c=>c.path).map(c=>c.path),['/global/health','/provider']);assert.deepEqual(native.calls[0].args,['serve','--pure','--hostname','127.0.0.1','--port','0']);
 for(const call of native.calls.filter(c=>c.path)){assert.equal(call.options.method,'GET');assert.equal(call.options.redirect,'error');assert.match(call.options.headers.authorization,/^Basic /);}
 assert.equal(JSON.stringify(result).includes(native.calls[0].options.env.OPENCODE_SERVER_PASSWORD),false);await endpoint.stopAndWait();assert.ok(native.process.kills);
});
test('OpenCode rejects oversized or malformed metadata and stops its owned server',async()=>{
 for(const kind of ['oversized','malformed','network']){
  const native=opencode(url=>{if(url.pathname==='/global/health')return json({healthy:true,version:'1.18.33'});if(kind==='network')throw Error('SECRET diagnostics');if(kind==='malformed')return json({all:[],connected:[],default:null});return {ok:true,body:(async function*(){yield Buffer.alloc(2*1024*1024+1);})()};});
  const endpoint=await createNativeModelInventoryEndpoint(serverDescriptor,native.deps);await assert.rejects(endpoint.listModelConfigurations(),error=>{assert.match(error.message,/native-response-limit|native-inventory-provider-invalid|native-inventory-http-failed/);assert.equal(error.message.includes('SECRET'),false);return true;});assert.ok(native.process.kills);
 }
});
test('busy operations refuse overlap and public close; awaited stop cancels instead of returning metadata',async()=>{
 let resolve;const native=opencode(url=>url.pathname==='/global/health'?json({healthy:true,version:'1.18.33'}):new Promise(r=>{resolve=r;}));
 const endpoint=await createNativeModelInventoryEndpoint(serverDescriptor,native.deps),pending=endpoint.listModelConfigurations();await assert.rejects(endpoint.listModelConfigurations(),/native-inventory-busy/);assert.throws(()=>endpoint.close(),/native-inventory-busy/);
 await endpoint.stopAndWait();resolve(json({all:[],default:{},connected:[]}));await assert.rejects(pending,/native-inventory-closed/);
});

test('only an original inventory failure carries its awaited owned-process closure',async()=>{
 const native=codex([{data:'malformed',nextCursor:null}]),endpoint=await createNativeModelInventoryEndpoint(descriptor,native.deps);
 let failure;try{await endpoint.listModelConfigurations();assert.fail('expected inventory rejection');}catch(error){failure=error;}
 const proof=nativeInventoryFailureClosure(failure);assert.equal(proof.stopped,true);assert.equal(proof.owned_processes,1);assert.equal(proof.process_group_closed,true);assert.equal(Object.isFrozen(proof),true);
 assert.equal(nativeInventoryFailureClosure({...failure}),null);assert.equal(nativeInventoryFailureClosure(JSON.parse(JSON.stringify(failure))),null);assert.equal(nativeInventoryFailureClosure({closure:proof}),null);assert.equal(nativeInventoryFailureClosure(null),null);
});
test('descriptor rejection or unknown failed launch cannot manufacture closure proof',async()=>{
 for(const [request,deps] of [[{...descriptor,model_id:'forbidden'},{}],[descriptor,{spawnProcess(){throw Error('launch failed');}}]]){
  await assert.rejects(createNativeModelInventoryEndpoint(request,deps),error=>{assert.equal(nativeInventoryFailureClosure(error),null);return true;});
 }
});
