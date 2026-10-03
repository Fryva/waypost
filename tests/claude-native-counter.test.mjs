import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {randomUUID} from 'node:crypto';
import {realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createNativeEndpoint} from '../scripts/team-transport.mjs';
const cwd=realpathSync(tmpdir()),schema='claude-native-first-turn-total-v1';
const snake=['input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens'],camel=['inputTokens','outputTokens','cacheCreationInputTokens','cacheReadInputTokens'];
function terminal(session,values=[10,5,3,7]){return {type:'result',session_id:session,uuid:randomUUID(),num_turns:1,is_error:false,result:'answer',usage:Object.fromEntries(snake.map((key,i)=>[key,values[i]])),modelUsage:{'claude-sonnet-4':Object.fromEntries(camel.map((key,i)=>[key,values[i]]))}};}
async function fixture(t,handler){
 let child,turn=0,argv;
 const endpoint=await createNativeEndpoint({managed:true,harness:'claude',cwd,timeout_ms:1000,reasoning:'high'}, {spawnProcess(_exe,args){argv=args;child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin={write(line){queueMicrotask(()=>{const user=JSON.parse(line),emit=value=>child.stdout.write(JSON.stringify(value)+'\n');turn++;handler(user,emit,turn);});}};child.kill=()=>{queueMicrotask(()=>child.emit('close',0));return true;};return child;}});
 t.after(()=>endpoint.stopAndWait());return {endpoint,get argv(){return argv;},emit(value){child.stdout.write(JSON.stringify(value)+'\n');}};
}
const init=user=>({type:'system',subtype:'init',session_id:user.session_id,tools:[]});
test('first owned no-tools turn sums disjoint terminal buckets including caches without reasoning double count',async t=>{
 const f=await fixture(t,(user,emit)=>{emit(init(user));emit({type:'assistant',session_id:user.session_id,parent_tool_use_id:null,message:{id:'message',usage:{output_tokens:1},content:[{type:'text',text:'answer'}]}});const result=terminal(user.session_id);result.usage.thinking_tokens=999;result.modelUsage['claude-sonnet-4'].costUSD=500;emit(result);});
 const r=await f.endpoint.send('probe',{id:'one'});assert.equal(f.endpoint.usage_counter_schema,schema);assert.equal(r.usage_span.coverage,'complete');assert.equal(r.usage_span.actual_tokens,'25');assert.equal(r.usage_span.before,'0');assert.equal(r.usage_span.after,'25');assert.equal(r.actualModel.reasoning,'unknown');assert.equal(r.context_manifest.reasoning_requested,'high');assert.equal(r.usage_span.scope,'observed-first-owned-main-loop-buckets');assert.match(r.usage_span.turn_id,/^[a-f0-9-]{36}$/);
 assert.ok(f.argv.includes('--no-session-persistence'));assert.ok(f.argv.includes('--strict-mcp-config'));await assert.rejects(f.endpoint.inspectContext(),/inspection-unsupported/);await assert.rejects(f.endpoint.captureAccountingMetadata(),/metadata-unsupported/);
});
test('matching bounded flat multi-model aggregates preserve usage while exact model identity stays unknown',async t=>{
 const f=await fixture(t,(user,emit)=>{emit(init(user));const r=terminal(user.session_id);r.modelUsage={a:{inputTokens:5,outputTokens:2,cacheCreationInputTokens:1,cacheReadInputTokens:3,canonicalModel:'a'},b:{inputTokens:5,outputTokens:3,cacheCreationInputTokens:2,cacheReadInputTokens:4,provider:'route'}};emit(r);});
 const r=await f.endpoint.send('probe',{id:'one'});assert.equal(r.usage_span.actual_tokens,'25');assert.equal(r.actualModel.model_id,'unknown');
});
test('native error result retains exact bounded usage receipt without raw output or diagnostic text',async t=>{
 const f=await fixture(t,(user,emit)=>{emit(init(user));const r=terminal(user.session_id);r.is_error=true;r.result='PRIVATE native failure text';r.errors=['PRIVATE token'];emit(r);});
 await assert.rejects(f.endpoint.send('probe',{id:'failure'}),error=>{assert.equal(error.code,'native-turn-failed');assert.equal(error.native_receipt.invocation_id,'failure');assert.equal(error.native_receipt.usage_span.coverage,'complete');assert.equal(error.native_receipt.usage_span.actual_tokens,'25');assert.equal(JSON.stringify(error.native_receipt).includes('PRIVATE'),false);assert.equal(Object.hasOwn(error.native_receipt,'output'),false);return true;});
 assert.equal((await f.endpoint.stopAndWait()).stopped,true);
});
test('nested activity, conflicting model buckets, malformed counts and missing identity cannot claim complete usage',async t=>{
 const variants=[
  (_u,_e,r)=>{r.modelUsage['claude-sonnet-4'].outputTokens++;},
  (_u,_e,r)=>{delete r.usage.cache_read_input_tokens;},
  (_u,_e,r)=>{r.usage.output_tokens=1.5;},
  (_u,_e,r)=>{r.usage.input_tokens=Number.MAX_SAFE_INTEGER+1;},
  (_u,_e,r)=>{r.modelUsage['claude-sonnet-4'].nested={inputTokens:10};},
  (_u,_e,r)=>{r.modelUsage={};},
  (_u,_e,r)=>{r.modelUsage={'bad\u0000model':r.modelUsage['claude-sonnet-4']};},
  (_u,_e,r)=>{delete r.uuid;},
  (_u,_e,r)=>{r.uuid='not-a-native-uuid';},
  (_u,_e,r)=>{delete r.session_id;},
  (_u,_e,r)=>{delete r.is_error;},
  (_u,_e,r)=>{r.num_turns=2;},
  (_u,_e,r)=>{r.parent_tool_use_id='subagent';},
  (u,e)=>{e({type:'assistant',session_id:u.session_id,parent_tool_use_id:'subagent',message:{content:[{type:'text',text:'nested'}]}});},
  (u,e)=>{e({type:'stream_event',session_id:u.session_id,event:{type:'content_block_start',content_block:{type:'tool_use'}}});},
  (u,e)=>{e({type:'system',session_id:u.session_id,subtype:'task_started'});},
  (_u,_e,r)=>{for(const key of snake)r.usage[key]=0;for(const key of camel)r.modelUsage['claude-sonnet-4'][key]=0;}
 ];
 for(const mutate of variants){const f=await fixture(t,(user,emit)=>{emit(init(user));const r=terminal(user.session_id);mutate(user,emit,r);emit(r);});const r=await f.endpoint.send('probe',{id:'one'});assert.notEqual(r.usage_span.coverage,'complete');assert.equal(r.usage_span.actual_tokens,null);await f.endpoint.stopAndWait();}
});
test('late initialization, repeated init or duplicate terminal UUID never repairs first-turn coverage',async t=>{
 for(const kind of ['late','repeated','duplicate','distinct-terminal']){
  const f=await fixture(t,(user,emit)=>{if(kind==='late')emit({type:'assistant',session_id:user.session_id,message:{content:[{type:'text',text:'early'}]}});emit(init(user));if(kind==='repeated')emit(init(user));const r=terminal(user.session_id);emit(r);if(kind==='duplicate')emit(r);if(kind==='distinct-terminal')emit({...r,uuid:randomUUID()});});const result=await f.endpoint.send('probe',{id:'one'});assert.equal(result.usage_span.coverage,'partial');if(kind==='late'||kind==='repeated'){assert.equal(result.context_manifest.fresh_review_verified,false);assert.equal(result.context_manifest.read_only,false);}await f.endpoint.stopAndWait();
 }
});
test('foreign terminal session cannot be charged to this owned native session',async t=>{
 const f=await fixture(t,(user,emit)=>{emit(init(user));emit(terminal(randomUUID()));});await assert.rejects(f.endpoint.send('probe',{id:'one'}),error=>{assert.equal(error.code,'native-session-mismatch');assert.equal(error.native_receipt,undefined);return true;});
});
test('BigInt sums preserve valid totals above safe-integer range; subsequent turns stay partial',async t=>{
 const f=await fixture(t,(user,emit,turn)=>{if(turn===1)emit(init(user));emit(terminal(user.session_id,Array(4).fill(Number.MAX_SAFE_INTEGER)));});const first=await f.endpoint.send('probe',{id:'one'});assert.equal(first.usage_span.actual_tokens,String(BigInt(Number.MAX_SAFE_INTEGER)*4n));const second=await f.endpoint.send('again',{id:'two'});assert.equal(second.usage_span.coverage,'partial');assert.equal(second.usage_span.actual_tokens,null);assert.equal(second.context_manifest.fresh,false);
});
test('legacy terminals without counter evidence keep their answer and unknown reasoning with absent coverage',async t=>{
 const f=await fixture(t,(user,emit)=>emit({type:'result',session_id:user.session_id,result:'legacy answer',modelUsage:{legacy:{}}}));const r=await f.endpoint.send('probe',{id:'one'});assert.equal(r.output,'legacy answer');assert.equal(r.actualModel.model_id,'legacy');assert.equal(r.actualModel.reasoning,'unknown');assert.equal(r.usage_span.coverage,'absent');
});

test('unsolicited native result before dispatch permanently breaks freshness and counter proof',async t=>{
 const f=await fixture(t,(user,emit)=>{emit(init(user));emit(terminal(user.session_id));});f.emit(terminal(f.endpoint.native_id));const result=await f.endpoint.send('probe',{id:'one'});assert.equal(result.usage_span.coverage,'partial');assert.equal(result.context_manifest.fresh_review_verified,false);
});
test('a late empty tools list cannot repair previously observed nonempty runtime tools',async t=>{
 const f=await fixture(t,(user,emit)=>{emit({...init(user),tools:['Task']});emit(init(user));emit(terminal(user.session_id));});const result=await f.endpoint.send('probe',{id:'one'});assert.equal(result.usage_span.coverage,'partial');assert.equal(result.context_manifest.provenance,'unverified');assert.equal(result.context_manifest.read_only,false);
});

test('native model usage cannot hide server-side web search activity or malformed activity counters',async t=>{
 for(const value of [1,-1,1.5,'0',null]){
  const f=await fixture(t,(user,emit)=>{emit(init(user));const r=terminal(user.session_id);r.modelUsage['claude-sonnet-4'].webSearchRequests=value;emit(r);});
  const r=await f.endpoint.send('probe',{id:'one'});assert.equal(r.usage_span.coverage,'partial');if(value===1){assert.equal(r.context_manifest.read_only,false);assert.equal(r.context_manifest.fresh_review_verified,false);}await f.endpoint.stopAndWait();
 }
});

test('terminal usage server-tool counters must explicitly contain only zero known activity',async t=>{
 for(const activity of [{web_search_requests:1},{web_fetch_requests:1},{unknown:0},{web_search_requests:'0'},null,{}]){
  const f=await fixture(t,(user,emit)=>{emit(init(user));const r=terminal(user.session_id);r.usage.server_tool_use=activity;emit(r);});
  const r=await f.endpoint.send('probe',{id:'one'});assert.equal(r.usage_span.coverage,'partial');assert.equal(r.context_manifest.fresh_review_verified,false);await f.endpoint.stopAndWait();
 }
 const f=await fixture(t,(user,emit)=>{emit(init(user));const r=terminal(user.session_id);r.usage.server_tool_use={web_search_requests:0,web_fetch_requests:0};r.modelUsage['claude-sonnet-4'].webSearchRequests=0;emit(r);});
 assert.equal((await f.endpoint.send('probe',{id:'one'})).usage_span.coverage,'complete');
});

test('own assistant and stream output before dispatch cannot certify a fresh first turn',async t=>{
 for(const type of ['assistant','stream_event']){
  const f=await fixture(t,(user,emit)=>emit(terminal(user.session_id)));
  f.emit({type:'system',subtype:'init',session_id:f.endpoint.native_id,tools:[]});
  f.emit({type,session_id:f.endpoint.native_id,message:{content:[{type:'text',text:'previous'}]}});
  const r=await f.endpoint.send('probe',{id:'one'});assert.equal(r.usage_span.coverage,'partial');assert.equal(r.context_manifest.fresh_review_verified,false);assert.equal(r.context_manifest.provenance,'unverified');await f.endpoint.stopAndWait();
 }
});

test('malformed token rows cannot hide server-tool activity in this or a later model row',async t=>{
 for(const later of [false,true]){
  const f=await fixture(t,(user,emit)=>{emit(init(user));const r=terminal(user.session_id);delete r.modelUsage['claude-sonnet-4'].outputTokens;if(later)r.modelUsage.other={webSearchRequests:1};else r.modelUsage['claude-sonnet-4'].webSearchRequests=1;emit(r);});
  const r=await f.endpoint.send('probe',{id:'one'});assert.equal(r.usage_span.coverage,'partial');assert.equal(r.context_manifest.read_only,false);assert.equal(r.context_manifest.fresh_review_verified,false);await f.endpoint.stopAndWait();
 }
});
