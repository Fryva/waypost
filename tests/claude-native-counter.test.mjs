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
// A pid above every platform's pid_max: signals to it can only fail with ESRCH.
const FAKE_PID=2147483000;let fakePids=0;
// Windows cannot prove a process tree stopped for a pid-bearing child, so the
// same-peer pid check is exercised on POSIX only.
const posix=process.platform!=='win32',posixOnly={skip:!posix&&'the fake child carries no pid on Windows'};
const contextSummary=()=>({categories:[{name:'System prompt',tokens:1428,color:'promptBorder',kind:'used'},{name:'Autocompact buffer',tokens:33000,color:'inactive',kind:'buffer'},{name:'Free space',tokens:965572,color:'promptBorder',kind:'free'}],totalTokens:1428,maxTokens:1000000,rawMaxTokens:1000000,autocompactSource:'model-default',percentage:0,gridRows:[],model:'claude-opus-5-5',memoryFiles:[],mcpTools:[],agents:[],autoCompactThreshold:967000,isAutoCompactEnabled:true,messageBreakdown:{toolCallTokens:0,toolResultTokens:0,attachmentTokens:0,assistantMessageTokens:0,userMessageTokens:0,redirectedContextTokens:0,unattributedTokens:0,toolCallsByType:[],attachmentsByType:[]},apiUsage:null});
const controlAnswers={initialize:pid=>({pid,account:{email:'private@example.com',organization:'Private Org',subscriptionType:'max',apiProvider:'firstParty'},agents:[]}),get_binary_version:()=>({version:'2.1.289',buildTime:'2026-10-03T19:21:39Z'}),get_hooks_listing:()=>({events:[],hooks:[],eventCatalog:[]}),get_context_usage:contextSummary};
async function fixture(t,handler,{control=(request,answer,_emit,_id,pid)=>answer(controlAnswers[request.subtype](pid))}={}){
 let child,turn=0,argv;const requests=[],kill=process.kill,fakePid=FAKE_PID-(fakePids++);
 t.mock.method(process,'kill',(pid,signal)=>{if(pid!==-fakePid)return kill.call(process,pid,signal);if(signal===0)throw Object.assign(new Error('no such process'),{code:'ESRCH'});queueMicrotask(()=>child.emit('close',0));return true;});
 const endpoint=await createNativeEndpoint({managed:true,harness:'claude',cwd,timeout_ms:1000,reasoning:'high'}, {spawnProcess(_exe,args){argv=args;child=new EventEmitter();if(posix)child.pid=fakePid;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin={write(line){queueMicrotask(()=>{const frame=JSON.parse(line),emit=value=>child.stdout.write(JSON.stringify(value)+'\n');if(frame.type==='control_request'){requests.push(frame.request);return control(frame.request,response=>emit({type:'control_response',response:{subtype:'success',request_id:frame.request_id,response}}),emit,frame.request_id,fakePid);}turn++;handler(frame,emit,turn);});}};child.kill=()=>{queueMicrotask(()=>child.emit('close',0));return true;};return child;}});
 t.after(()=>endpoint.stopAndWait());return {endpoint,requests,pid:fakePid,get argv(){return argv;},emit(value){child.stdout.write(JSON.stringify(value)+'\n');}};
}
const init=user=>({type:'system',subtype:'init',session_id:user.session_id,tools:[],mcp_servers:[],apiKeySource:'none',claude_code_version:'2.1.289'});
test('first owned no-tools turn sums disjoint terminal buckets including caches without reasoning double count',async t=>{
 const f=await fixture(t,(user,emit)=>{emit(init(user));emit({type:'assistant',session_id:user.session_id,parent_tool_use_id:null,message:{id:'message',usage:{output_tokens:1},content:[{type:'text',text:'answer'}]}});const result=terminal(user.session_id);result.usage.thinking_tokens=999;result.modelUsage['claude-sonnet-4'].costUSD=500;emit(result);});
 const r=await f.endpoint.send('probe',{id:'one'});assert.equal(f.endpoint.usage_counter_schema,schema);assert.equal(r.usage_span.coverage,'complete');assert.equal(r.usage_span.actual_tokens,'25');assert.equal(r.usage_span.before,'0');assert.equal(r.usage_span.after,'25');assert.equal(r.actualModel.reasoning,'unknown');assert.equal(r.context_manifest.reasoning_requested,'high');assert.equal(r.usage_span.scope,'observed-first-owned-main-loop-buckets');assert.match(r.usage_span.turn_id,/^[a-f0-9-]{36}$/);
 assert.ok(f.argv.includes('--no-session-persistence'));assert.ok(f.argv.includes('--strict-mcp-config'));assert.equal(r.context_manifest.read_only,false,'no pre-inference preflight was made');assert.equal(r.context_manifest.preflight,null);assert.equal((await f.endpoint.inspectContext()).blocker,'native-context-already-used');const billing=await f.endpoint.captureAccountingMetadata();assert.equal(billing.provenance,'unavailable');assert.equal(billing.paid_fallback,'unknown');assert.equal(billing.account,null);
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

test('observed Claude 2.1.286 row metadata does not double count thinking or turn pricing into accounting',async t=>{
 const f=await fixture(t,(user,emit)=>{emit(init(user));const r=terminal(user.session_id);Object.assign(r.modelUsage['claude-sonnet-4'],{thinkingTokens:4,costBasis:'list'});emit(r);});
 assert.equal((await f.endpoint.send('probe',{id:'one'})).usage_span.actual_tokens,'25');
 for(const extra of [{thinkingTokens:6},{thinkingTokens:-1},{thinkingTokens:'0'},{costBasis:'unrecognized'},{costBasis:{price:0}}]){
  const bad=await fixture(t,(user,emit)=>{emit(init(user));const r=terminal(user.session_id);Object.assign(r.modelUsage['claude-sonnet-4'],extra);emit(r);});
  assert.equal((await bad.endpoint.send('probe',{id:'one'})).usage_span.coverage,'partial');await bad.endpoint.stopAndWait();
 }
});

const clean=(user,emit)=>{emit(init(user));emit(terminal(user.session_id));};
test('same-peer summary preflight before the user frame admits a fresh no-tools receipt without account details',posixOnly,async t=>{
 const f=await fixture(t,clean);const inspected=await f.endpoint.inspectContext();
 assert.equal(inspected.verified,true,inspected.blocker);assert.equal(inspected.source,'native-get-context-usage-summary');
 assert.deepEqual(f.requests.map(r=>r.subtype),['initialize','get_binary_version','get_hooks_listing','get_context_usage']);
 assert.equal(f.requests[0].hooks,null);assert.equal(f.requests[3].detail,'summary','the full detail calls the token-count API');
 const again=await f.endpoint.inspectContext();assert.equal(again.verified,true);assert.notEqual(again.evidence_digest,undefined);
 assert.deepEqual(f.requests.slice(4).map(r=>r.subtype),['get_hooks_listing','get_context_usage'],'initialize runs once per peer');
 const r=await f.endpoint.send('probe',{id:'one'});
 assert.equal(r.context_manifest.read_only,true);assert.equal(r.context_manifest.fresh_review_verified,true);assert.equal(r.usage_span.coverage,'complete');
 // The profile collector admits only this isolated shape; renaming a field would silently spend every Claude trial and ACK slot.
 assert.equal(r.context_manifest.provenance,'adapter-isolated');assert.equal(r.context_manifest.isolation,'read-only');assert.deepEqual(r.context_manifest.tools,[]);assert.deepEqual(r.context_manifest.author_contexts,[]);assert.equal(r.context_manifest.fresh,true);assert.equal(r.context_manifest.author_history_inherited,false);assert.match(r.context_manifest.initial_instructions_digest,/^[a-f0-9]{64}$/);
 assert.equal(r.context_manifest.preflight.evidence_digest,again.evidence_digest);assert.equal(r.context_manifest.preflight.version,'2.1.289');assert.equal(r.context_manifest.preflight.pid,f.pid);
 assert.equal(JSON.stringify(r).includes('private@example.com')||JSON.stringify(r).includes('Private Org'),false);
 assert.equal((await f.endpoint.inspectContext()).blocker,'native-context-already-used');
});
const refusals={
 'unpinned binary version':[{get_binary_version:()=>({version:'2.1.290'})},'native-claude-preflight-version-unverified'],
 'initialize pid of another process':[{initialize:pid=>({...controlAnswers.initialize(pid),pid:pid+1})},'native-claude-first-party-subscription-route-unverified'],
 'non first-party route':[{initialize:pid=>({...controlAnswers.initialize(pid),account:{apiProvider:'bedrock'}})},'native-claude-first-party-subscription-route-unverified'],
 'token source route':[{initialize:pid=>({...controlAnswers.initialize(pid),account:{apiProvider:'firstParty',tokenSource:'ANTHROPIC_AUTH_TOKEN'}})},'native-claude-first-party-subscription-route-unverified'],
 'api key route':[{initialize:pid=>({...controlAnswers.initialize(pid),account:{apiProvider:'firstParty',apiKeySource:'ANTHROPIC_API_KEY'}})},'native-claude-first-party-subscription-route-unverified'],
 'configured hooks':[{get_hooks_listing:()=>({events:['UserPromptSubmit'],hooks:[{}]})},'native-claude-hooks-present'],
 'system tools row':[{get_context_usage:()=>{const r=contextSummary();r.categories.splice(1,0,{name:'System tools',tokens:6162,color:'x',kind:'used'});return r;}},'native-claude-context-not-fresh-no-tools'],
 'deferred tools row':[{get_context_usage:()=>{const r=contextSummary();r.categories.push({name:'Renamed',tokens:8568,color:'x',kind:'deferred'});return r;}},'native-claude-context-not-fresh-no-tools'],
 'unknown row kind':[{get_context_usage:()=>{const r=contextSummary();r.categories[0].kind='other';return r;}},'native-claude-context-not-fresh-no-tools'],
 'renamed used row':[{get_context_usage:()=>{const r=contextSummary();r.categories[0].name='Skills';return r;}},'native-claude-context-not-fresh-no-tools'],
 'memory files':[{get_context_usage:()=>({...contextSummary(),memoryFiles:[{path:'CLAUDE.md',tokens:10}]})},'native-claude-context-not-fresh-no-tools'],
 'mcp tools':[{get_context_usage:()=>({...contextSummary(),mcpTools:[{name:'x'}]})},'native-claude-context-not-fresh-no-tools'],
 'agents':[{get_context_usage:()=>({...contextSummary(),agents:[{name:'x'}]})},'native-claude-context-not-fresh-no-tools'],
 'full-detail placeholder message':[{get_context_usage:()=>{const r=contextSummary();r.messageBreakdown.unattributedTokens=10;return r;}},'native-claude-context-not-fresh-no-tools'],
 'prior api usage':[{get_context_usage:()=>({...contextSummary(),apiUsage:{input_tokens:1}})},'native-claude-context-not-fresh-no-tools'],
 'unknown field':[{get_context_usage:()=>({...contextSummary(),skills:[]})},'native-claude-context-not-fresh-no-tools'],
 'history':[{get_context_usage:()=>{const r=contextSummary();r.messageBreakdown.userMessageTokens=4;return r;}},'native-claude-context-not-fresh-no-tools']
};
for(const [name,[override,blocker]] of Object.entries(refusals)){
 test('Claude preflight refuses '+name+' and the peer stays unverified',posixOnly,async t=>{
  const f=await fixture(t,clean,{control:(request,answer,_emit,_id,pid)=>answer((override[request.subtype]||controlAnswers[request.subtype])(pid))});
  const r1=await f.endpoint.inspectContext();assert.equal(r1.verified,false);assert.equal(r1.blocker,blocker);
  assert.equal((await f.endpoint.inspectContext()).verified,false,'a refusal is sticky for this peer');
  const r=await f.endpoint.send('probe',{id:'one'});assert.equal(r.context_manifest.read_only,false);assert.equal(r.context_manifest.preflight,null);
 });
}
test('route environment, a failed control answer and unsolicited control frames refuse or break the preflight',posixOnly,async t=>{
 for(const name of ['ANTHROPIC_BASE_URL','ANTHROPIC_API_KEY','CLAUDE_CODE_USE_BEDROCK','CLAUDE_CODE_ENVIRONMENT_KIND']){
  const saved=process.env[name];process.env[name]='1';
  try{const f=await fixture(t,clean);const r=await f.endpoint.inspectContext();assert.equal(r.blocker,'native-claude-first-party-subscription-route-unverified',name);assert.equal(f.requests.length,0);}
  finally{if(saved===undefined)delete process.env[name];else process.env[name]=saved;}
 }
 const failed=await fixture(t,clean,{control:(request,answer,emit,id,pid)=>request.subtype==='get_context_usage'?emit({type:'control_response',response:{subtype:'error',request_id:id,error:'nope'}}):answer(controlAnswers[request.subtype](pid))});
 assert.equal((await failed.endpoint.inspectContext()).blocker,'native-claude-preflight-failed');
 for(const frame of [{type:'control_request',request_id:'cli',request:{subtype:'can_use_tool',tool_name:'Bash'}},{type:'control_response',response:{subtype:'success',request_id:'foreign',response:{}}}]){
  const f=await fixture(t,clean);assert.equal((await f.endpoint.inspectContext()).verified,true);f.emit(frame);await new Promise(resolve=>setImmediate(resolve));
  const r=await f.endpoint.send('probe',{id:'one'});assert.equal(r.context_manifest.read_only,false);assert.equal(r.context_manifest.preflight,null);
 }
 const duplicate=await fixture(t,clean,{control:(request,answer,_emit,_id,pid)=>{answer(controlAnswers[request.subtype](pid));if(request.subtype==='get_context_usage')answer(contextSummary());}});
 await duplicate.endpoint.inspectContext();await new Promise(resolve=>setImmediate(resolve));
 assert.equal((await duplicate.endpoint.send('probe',{id:'one'})).context_manifest.read_only,false,'a duplicate answer breaks the preflight');
});
test('the turn init must confirm no MCP server, no API key route and the preflighted binary',posixOnly,async t=>{
 for(const change of [{mcp_servers:[{name:'x',status:'connected'}]},{apiKeySource:'ANTHROPIC_API_KEY'},{claude_code_version:'2.1.290'},{mcp_servers:undefined},{apiKeySource:undefined},{claude_code_version:undefined}]){
  const f=await fixture(t,(user,emit)=>{emit({...init(user),...change});emit(terminal(user.session_id));});
  assert.equal((await f.endpoint.inspectContext()).verified,true);
  const r=await f.endpoint.send('probe',{id:'one'});assert.equal(r.context_manifest.read_only,false,JSON.stringify(change));assert.equal(r.usage_span.coverage,'complete');
 }
});
test('a flagged frame between preflight answers, a concurrent send and a control timeout never bind a preflight',posixOnly,async t=>{
 const between=await fixture(t,clean,{control:(request,answer,emit,_id,pid)=>{if(request.subtype==='get_context_usage')emit({type:'system',subtype:'task_started',session_id:'x'});answer(controlAnswers[request.subtype](pid));}});
 assert.equal((await between.endpoint.inspectContext()).blocker,'native-context-already-used');
 assert.equal((await between.endpoint.send('probe',{id:'one'})).context_manifest.read_only,false);
 let release;const slow=await fixture(t,clean,{control:(request,answer,_emit,_id,pid)=>{if(request.subtype==='get_context_usage')release=()=>answer(contextSummary());else answer(controlAnswers[request.subtype](pid));}});
 const pending=slow.endpoint.inspectContext();while(!release)await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(slow.endpoint.send('probe',{id:'one'}),{code:'native-endpoint-busy'});release();assert.equal((await pending).verified,true);
 const silent=await fixture(t,clean,{control:(request,answer,_emit,_id,pid)=>{if(request.subtype!=='get_hooks_listing')answer(controlAnswers[request.subtype](pid));}});
 assert.equal((await silent.endpoint.inspectContext()).blocker,'native-claude-preflight-failed');
 await assert.rejects(silent.endpoint.send('probe',{id:'one'}),/native-/);
});
test('a route variable present when the child was spawned refuses even after it is cleared',posixOnly,async t=>{
 const saved=process.env.ANTHROPIC_BASE_URL;process.env.ANTHROPIC_BASE_URL='https://gateway.invalid';
 let f;try{f=await fixture(t,clean);}finally{if(saved===undefined)delete process.env.ANTHROPIC_BASE_URL;else process.env.ANTHROPIC_BASE_URL=saved;}
 assert.equal((await f.endpoint.inspectContext()).blocker,'native-claude-first-party-subscription-route-unverified');assert.equal(f.requests.length,0);
});
