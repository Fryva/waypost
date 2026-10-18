import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createNativeEndpoint, validateNativeDescriptor } from '../scripts/team-transport.mjs';
import { CODEX_EVALUATION_SURFACE as S, EVALUATION_PROBED_CATALOGS, evaluationFrameGuard, evaluationDynamicTools } from '../scripts/codex-evaluation-surface.mjs';
import { PROBED_CATALOGS, CODEX_SURFACE_R1 } from '../scripts/codex-surface.mjs';
import { evaluationInputDigest, sealEvaluationSource } from '../scripts/evaluation-source.mjs';
const hash = x=>createHash('sha256').update(x).digest('hex');
const scratch = realpathSync(mkdtempSync(join(tmpdir(),'waypost-eval-home-'))); process.env.HOME=scratch;
test.after(()=>rmSync(scratch,{recursive:true,force:true}));
const counters = n=>({totalTokens:n,inputTokens:n-2,cachedInputTokens:0,outputTokens:2,reasoningOutputTokens:0});
function fixture(t,{probed=true,control=false,late=false,anchor=true,foreign=false,denied=false,configChange=false,probeTool,limits={},regress=false,reroute=false,lateCounter=false,forbiddenTool=false,moderation=false,lateModeration=false,moderationWires=[],splitModeration=false}={}) {
  const root=realpathSync(mkdtempSync(join(tmpdir(),'waypost-evaluation-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const cwd=join(root,'empty'),home=join(root,'home'),pkg=join(root,'pkg'),source=join(root,'source');
  for(const dir of [cwd,home,join(pkg,'bin'),source])mkdirSync(dir,{recursive:true});
  const executable=join(pkg,'bin','codex');writeFileSync(executable,'fixture');writeFileSync(join(home,'config.toml'),'');
  writeFileSync(join(home,'models_cache.json'),JSON.stringify({models:[{slug:'model',unique:root}]}));
  writeFileSync(join(source,'a.mjs'),'alpha\nbeta\n');
  const broker=sealEvaluationSource({root:source,manifest:[{path:'a.mjs',sha256:hash('alpha\nbeta\n')}],limits}), requests=[];
  let emit, child, changed=false;
  const notify=(method,params)=>emit({method,params:{threadId:'owned',turnId:'turn',...params}});
  const usage=(n,last=n)=>notify('thread/tokenUsage/updated',{tokenUsage:{total:counters(n),last:counters(last)}});
  const finish=()=>{
    if(reroute)notify('model/rerouted',{toModel:'unexpected-model'});
    if(moderation)notify('turn/moderationMetadata',{metadata:{opaque:['not a tool',{method:'item/tool/call'}]}});
    for(const wire of moderationWires){const bytes=Buffer.from(wire+'\n');if(splitModeration){const at=bytes.indexOf(Buffer.from('ж'))+1;child.stdout.write(bytes.subarray(0,at));child.stdout.write(bytes.subarray(at));}else child.stdout.write(bytes);}
    usage(regress?5:30,regress?5:20);notify('rawResponseItem/completed',{item:{type:'message'}});
    notify('item/completed',{item:{type:'agentMessage',phase:'final_answer',text:'answer'}});
    notify('turn/completed',{turn:{id:'turn',status:'completed'}});changed=true;
  };
  const toolIdentity=forbiddenTool?{namespace:null,tool:'evaluation_probe_forbidden'}:{namespace:'snapshot',tool:'read'};
  const toolArguments=()=>forbiddenTool?{}:denied?{path:'../private',start_line:1,end_line:2}:{path:'a.mjs',start_line:1,end_line:2};
  const callback=(id='call',args=toolArguments())=>emit({id:900,method:'item/tool/call',params:{threadId:foreign?'other':'owned',turnId:'turn',callId:id,...toolIdentity,arguments:args}});
  const spawnProcess=(exe,args)=>{
    const path=JSON.parse(args.find(x=>x.startsWith('model_catalog_json=')).slice(19));
    if(probed)EVALUATION_PROBED_CATALOGS.add(hash(readFileSync(path)));
    child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();emit=m=>child.stdout.write(JSON.stringify(m)+'\n');
    const results={
      initialize:{userAgent:'fixture/'+S.version+' (fixture)',codexHome:home},
      'thread/start':{thread:{id:'owned',sessionId:'owned',ephemeral:true,cwd,turns:[],forkedFromId:null},model:'model',modelProvider:'openai',reasoningEffort:'low',sandbox:{type:'readOnly',networkAccess:false},approvalPolicy:'never',instructionSources:[]},
      'config/read':{config:{model_catalog_json:path,...S.config_expect,features:Object.fromEntries(S.features_off.map(k=>[k,false]))},layers:[{name:{type:'sessionFlags'}},{name:{type:'user',file:join(home,'config.toml')}}]},
      'experimentalFeature/list':{data:[],nextCursor:null},'skills/list':{data:[{skills:[]}]},'hooks/list':{data:[{hooks:[]}]},'mcpServerStatus/list':{data:[],nextCursor:null},'app/installed':{apps:[]},
    };
    child.stdin={on(){},write(s){queueMicrotask(()=>{const m=JSON.parse(s);requests.push(m);
      if(m.method==='turn/start'){
        emit({id:m.id,result:{turn:{id:'turn'}}});notify('turn/started',{turn:{id:'turn'}});
        if(anchor)usage(10);
        const toolArgs=toolArguments();
        notify('rawResponseItem/completed',{item:{type:'function_call',call_id:'call',name:forbiddenTool?'evaluation_probe_forbidden':'snapshot.read',arguments:JSON.stringify(toolArgs)}});
        notify('item/started',{item:{type:'dynamicToolCall',id:'call',...toolIdentity,arguments:toolArgs,status:'inProgress'}});
        callback('call',toolArgs);
      } else if(m.id===900 && m.result){
        notify('rawResponseItem/completed',{item:{type:'function_call_output',call_id:'call',output:m.result.contentItems.map(item=>({type:'input_text',text:item.text}))}});
        notify('item/completed',{item:{type:'dynamicToolCall',id:'call',...toolIdentity,arguments:toolArguments(),status:m.result.success?'completed':'failed',success:m.result.success,contentItems:m.result.contentItems}});
        finish();}
      else if(Object.hasOwn(results,m.method)){const result=structuredClone(results[m.method]);if(configChange&&changed&&m.method==='config/read')result.config.model='changed';emit({id:m.id,result});}
    });}};
    child.kill=()=>{queueMicrotask(()=>{if(late)callback('late');if(lateCounter)usage(40,10);if(lateModeration)notify('turn/moderationMetadata',{metadata:null});child.emit('close',0);});return true;};return child;
  };
  const descriptor={harness:'codex',managed:true,mode:'read-only',cwd,executable,codex_home:home,tool_surface:S.id,model_id:'model',reasoning:'low'};
  return {descriptor,dependencies:{spawnProcess,evaluation:{broker,binding:{manifest_digest:broker.manifestDigest},instructions:'approved role instructions',control,probeTool}},requests,broker};
}
const send=e=>e.send('task',{id:'invocation',purpose:'evaluation',read_only:true,max_output_chars:8192});

test('separate version, catalogs and schema do not broaden the old no-exec surface',()=>{
  assert.equal(S.id,'codex-read-snapshot-r1');assert.equal(S.version,'0.163.0-alpha.10.2');
  assert.notEqual(EVALUATION_PROBED_CATALOGS,PROBED_CATALOGS);assert.deepEqual(CODEX_SURFACE_R1.residual_tools,[]);
  for (const name of ['code_mode_interrupt','instant_interrupt','cli_daybreak','api_key_cyber_access_programs']) {assert.ok(S.features_off.includes(name));assert.ok(S.overrides.includes(`features.${name}=false`));assert.ok(!S.allowed_features.includes(name));assert.ok(!CODEX_SURFACE_R1.features_off.includes(name));}
  const specs=evaluationDynamicTools();assert.equal(specs[0].type,'namespace');assert.deepEqual(specs[0].tools.map(t=>t.name),['read','search']);
  assert.throws(()=>evaluationDynamicTools('exec'));assert.equal(evaluationDynamicTools('evaluation_probe_forbidden').length,2);
});
test('multiple iterations retain the earliest bound zero anchor and actual read tools',async t=>{
  const f=fixture(t),e=await createNativeEndpoint(f.descriptor,f.dependencies);
  assert.match((await e.inspectContext()).effective_surface_digest,/^[a-f0-9]{64}$/);assert.deepEqual((await e.inspectContext()).observed_model,{provider:'openai',model_id:'model',reasoning:'low'});
  const r=await send(e);assert.equal(r.output,'answer');assert.deepEqual(r.context_manifest.tools,['snapshot.read','snapshot.search']);
  assert.equal(r.context_manifest.fresh_review_verified,false);assert.equal(r.context_manifest.evaluation_isolation_verified,true);assert.equal(r.evaluation.evaluation_isolation_verified,true);assert.equal(r.usage_span.actual_tokens,'30');assert.equal(r.usage_span.baseline_source,'native-first-early-cumulative-equals-last');
  assert.equal(f.broker.evidence().calls.length,1);assert.equal(r.evaluation.calls[0].success,true);
  const start=f.requests.find(m=>m.method==='thread/start');assert.equal(start.params.dynamicTools[0].name,'snapshot');assert.equal(start.params.developerInstructions,'approved role instructions');
  await e.stopAndWait();assert.equal(e.evaluationEvidence().closed,true);assert.equal(e.evaluationEvidence().violation,null);assert.equal(e.evaluationEvidence().evaluation_isolation_verified,true);
});
test('no early anchor never infers zero from freshness or terminal last counters',async t=>{
  const f=fixture(t,{anchor:false}),e=await createNativeEndpoint(f.descriptor,f.dependencies),r=await send(e);
  assert.equal(r.usage_span.coverage,'partial');assert.equal(r.usage_span.actual_tokens,null);await e.stopAndWait();
});
test('unprobed tasks cannot dispatch, owner controls allow only the catalog membership exception',async t=>{
  const f=fixture(t,{probed:false}),e=await createNativeEndpoint(f.descriptor,f.dependencies);
  assert.equal((await e.inspectContext()).blocker,'native-surface-catalog-unprobed');await assert.rejects(send(e),/catalog-unprobed/);assert.ok(!f.requests.some(m=>m.method==='turn/start'));await e.stopAndWait();
  const g=fixture(t,{probed:false,control:true}),other=await createNativeEndpoint(g.descriptor,g.dependencies);assert.equal((await other.inspectContext()).verified,true);await send(other);await other.stopAndWait();
});
test('a path denial is paired and contains no source data',async t=>{
  const f=fixture(t,{denied:true}),e=await createNativeEndpoint(f.descriptor,f.dependencies),r=await send(e);
  assert.equal(r.evaluation.calls[0].success,false);assert.equal(r.evaluation.calls[0].denial,'source-path');
  const response=f.requests.find(m=>m.id===900&&m.result);assert.match(response.result.contentItems[0].text,/source-path/);assert.doesNotMatch(response.result.contentItems[0].text,/alpha/);await e.stopAndWait();
});
test('a late callback during stop withdraws evidence and never accesses source',async t=>{
  const f=fixture(t,{late:true}),e=await createNativeEndpoint(f.descriptor,f.dependencies);await send(e);await e.stopAndWait();
  const proof=e.evaluationEvidence();assert.equal(proof.violation,'native-evaluation-late-callback');assert.equal(proof.evaluation_isolation_verified,false);assert.equal(proof.broker.calls.length,1);assert.equal(proof.calls.at(-1).success,false);
});
test('foreign callbacks fail closed while terminal counters remain available',async t=>{
  const f=fixture(t,{foreign:true}),e=await createNativeEndpoint(f.descriptor,f.dependencies),r=await send(e);
  assert.equal(r.context_manifest.provenance,'unverified');assert.equal(r.context_manifest.evaluation_isolation_verified,false);assert.equal(r.usage_span.actual_tokens,'30');assert.equal(f.broker.evidence().calls.length,0);await e.stopAndWait();
});
test('effective configuration drift withdraws isolation',async t=>{
  const f=fixture(t,{configChange:true}),e=await createNativeEndpoint(f.descriptor,f.dependencies),r=await send(e);
  assert.equal(r.context_manifest.provenance,'unverified');assert.equal(r.context_manifest.evaluation_isolation_verified,false);assert.equal(r.context_manifest.isolation_evidence.blocker,'native-evaluation-configuration-changed');await e.stopAndWait();
});
test('evaluation requires explicit broker, empty cwd and control-only probe declaration',async t=>{
  const f=fixture(t);assert.doesNotThrow(()=>validateNativeDescriptor(f.descriptor));
  await assert.rejects(createNativeEndpoint(f.descriptor,{spawnProcess:f.dependencies.spawnProcess}),/binding-required/);
  await assert.rejects(createNativeEndpoint(f.descriptor,{...f.dependencies,evaluation:{...f.dependencies.evaluation,probeTool:'evaluation_probe_x'}}),/control-required/);
  writeFileSync(join(f.descriptor.cwd,'private'),'secret');await assert.rejects(createNativeEndpoint(f.descriptor,f.dependencies),/empty-cwd/);
});
for(const [name,frame,blocker] of [
  ['exec',{method:'item/started',params:{threadId:'owned',turnId:'turn',item:{type:'commandExecution'}}},'native-surface-tool-item'],
  ['foreign turn',{method:'thread/tokenUsage/updated',params:{threadId:'owned',turnId:'foreign'}},'native-evaluation-foreign-turn'],
  ['undeclared raw tool',{method:'rawResponseItem/completed',params:{threadId:'owned',turnId:'turn',item:{type:'function_call',call_id:'x',name:'exec',arguments:'{}'}}},'native-evaluation-tool-call'],
])test('guard rejects '+name,()=>{const g=evaluationFrameGuard('owned');g.bind('turn');g.check(frame);assert.equal(g.blocker,blocker);});
test('guard rejects changed arguments for the same call and foreign raw results',()=>{
  const g=evaluationFrameGuard('owned');g.bind('turn');const p={threadId:'owned',turnId:'turn',callId:'call',namespace:'snapshot',tool:'search',arguments:{query:'a'}};
  g.check({id:1,method:'item/tool/call',params:p});g.check({id:2,method:'item/tool/call',params:{...p,arguments:{query:'b'}}});assert.equal(g.blocker,'native-evaluation-call-replay');
  const h=evaluationFrameGuard('owned');h.bind('turn');h.check({method:'rawResponseItem/completed',params:{threadId:'owned',turnId:'turn',item:{type:'function_call_output',call_id:'unknown'}}});assert.equal(h.blocker,'native-evaluation-unpaired-result');
});

test('decreasing cumulative counters retain uncertainty despite an early anchor',async t=>{
  const f=fixture(t,{regress:true}),e=await createNativeEndpoint(f.descriptor,f.dependencies),r=await send(e);
  assert.equal(r.usage_span.coverage,'partial');assert.equal(r.usage_span.actual_tokens,null);await e.stopAndWait();
});
test('serialized callback responses are bounded and stop the attempt on overflow',async t=>{
  const f=fixture(t,{limits:{maxOutputBytes:128}}),e=await createNativeEndpoint(f.descriptor,f.dependencies);
  await assert.rejects(send(e));await e.stopAndWait();assert.match(e.evaluationEvidence().violation,/limit/);
});
test('guard records callbacks after closure and preserves a sticky late violation',()=>{
  const g=evaluationFrameGuard('owned');g.bind('turn');g.close();g.check({id:1,method:'item/tool/call',params:{threadId:'owned',turnId:'turn',callId:'x',namespace:'snapshot',tool:'read',arguments:{}}});
  assert.equal(g.blocker,'native-evaluation-late-callback');
});

test('model rerouting withdraws evaluation isolation and records the actual runtime change',async t=>{
  const f=fixture(t,{reroute:true}),e=await createNativeEndpoint(f.descriptor,f.dependencies),r=await send(e);
  assert.equal(r.actualModel.model_id,'unexpected-model');assert.equal(r.context_manifest.evaluation_isolation_verified,false);assert.equal(r.context_manifest.isolation_evidence.blocker,'native-evaluation-model-rerouted');
  await e.stopAndWait();assert.equal(e.evaluationEvidence().violation,'native-evaluation-model-rerouted');assert.equal(e.evaluationEvidence().evaluation_isolation_verified,false);
});
test('late counters during owned stop survive as a sticky stream violation',async t=>{
  const f=fixture(t,{lateCounter:true}),e=await createNativeEndpoint(f.descriptor,f.dependencies);await send(e);await e.stopAndWait();
  assert.equal(e.evaluationEvidence().violation,'native-evaluation-late-frame');assert.equal(e.evaluationEvidence().evaluation_isolation_verified,false);
});

for(const lateCounter of [false,true])test('forbidden-tool control accounting '+(lateCounter?'is invalidated by subsequent late counters':'remains valid without another stream failure'),async t=>{
  const f=fixture(t,{forbiddenTool:true,control:true,probeTool:'evaluation_probe_forbidden',lateCounter}),e=await createNativeEndpoint(f.descriptor,f.dependencies),r=await send(e);
  assert.equal(r.evaluation.violation,'native-evaluation-tool-call');assert.equal(r.usage_span.coverage,'complete');assert.equal(r.evaluation.accounting_valid,true);assert.equal(r.evaluation.calls[0].name,'evaluation_probe_forbidden');assert.equal(r.evaluation.calls[0].success,false);assert.equal(f.broker.evidence().calls.length,0);
  const callbackRequest=f.requests.find(m=>m.id===900&&m.result);assert.match(callbackRequest.result.contentItems[0].text,/native-evaluation-tool-call/);assert.equal(callbackRequest.result.success,false);
  await e.stopAndWait();const proof=e.evaluationEvidence();assert.equal(proof.violation,'native-evaluation-tool-call');assert.equal(proof.accounting_valid,!lateCounter);
});

test('a raw declaration alone cannot authorize a tool result',()=>{
  const g=evaluationFrameGuard('owned');g.bind('turn');g.check({method:'rawResponseItem/completed',params:{threadId:'owned',turnId:'turn',item:{type:'function_call',call_id:'call',name:'snapshot.search',arguments:'{"query":"a"}'}}});
  g.check({method:'rawResponseItem/completed',params:{threadId:'owned',turnId:'turn',item:{type:'function_call_output',call_id:'call',output:'invented'}}});
  assert.equal(g.blocker,'native-evaluation-unpaired-result');assert.equal(g.accountingValid,false);
});
test('raw and completed dynamic outputs must match the emitted callback response',()=>{
  for(const kind of ['raw-mismatch','dynamic-mismatch','dynamic-unpaired']) {
    const g=evaluationFrameGuard('owned');g.bind('turn');const args={query:'a'},item={type:'dynamicToolCall',id:'call',namespace:'snapshot',tool:'search',arguments:args};
    g.check({id:1,method:'item/tool/call',params:{threadId:'owned',turnId:'turn',callId:'call',namespace:'snapshot',tool:'search',arguments:args}});
    if(kind!=='dynamic-unpaired')assert.equal(g.registerResponse('call',evaluationInputDigest('snapshot.search',args),{success:true,contentItems:[{type:'inputText',text:'actual'}]}),true);
    g.check(kind==='raw-mismatch'?{method:'rawResponseItem/completed',params:{threadId:'owned',turnId:'turn',item:{type:'function_call_output',call_id:'call',output:'invented'}}}:{method:'item/completed',params:{threadId:'owned',turnId:'turn',item:{...item,status:'completed',success:true,contentItems:[{type:'inputText',text:'invented'}]}}});
    assert.equal(g.blocker,kind==='dynamic-unpaired'?'native-evaluation-unpaired-result':'native-evaluation-result-content');
  }
});
test('callback request ids reject objects and unsafe integers before source access',()=>{
  for(const requestId of [{id:'wrapped'},Number.MAX_SAFE_INTEGER+1,null]) {const g=evaluationFrameGuard('owned');g.bind('turn');g.check({id:requestId,method:'item/tool/call',params:{threadId:'owned',turnId:'turn',callId:'call',namespace:'snapshot',tool:'search',arguments:{query:'a'}}});assert.equal(g.blocker,'native-evaluation-request-id');assert.equal(g.accountingValid,false);}
});


const moderationFrame=metadata=>({method:'turn/moderationMetadata',params:{threadId:'owned',turnId:'turn',metadata}});
const checkModeration=(g,frame)=>g.check(frame,Buffer.byteLength(JSON.stringify(frame)));
function moderationGuard() {
 const g=evaluationFrameGuard('owned');g.bind('turn');g.check({method:'rawResponseItem/completed',params:{threadId:'owned',turnId:'turn',item:{type:'message'}}});return g;
}
test('owned moderation data is opaque and does not affect native accounting or broker calls',async t=>{
 const f=fixture(t,{moderation:true}),e=await createNativeEndpoint(f.descriptor,f.dependencies),r=await send(e);
 assert.equal(r.usage_span.actual_tokens,'30');assert.equal(r.usage_span.coverage,'complete');assert.equal(r.context_manifest.evaluation_isolation_verified,true);assert.equal(f.broker.evidence().calls.length,1);
 await e.stopAndWait();assert.equal(e.evaluationEvidence().accounting_valid,true);assert.equal(e.evaluationEvidence().violation,null);
 assert.ok(!CODEX_SURFACE_R1.turn_methods.includes('turn/moderationMetadata'));assert.ok(!Object.hasOwn(CODEX_SURFACE_R1,'moderation_limits'));
});
test('moderation metadata accepts every JSON value without interpreting its contents',()=>{
 for(const metadata of [null,false,1,'opaque',[1,null],{method:'item/tool/call',instructions:'untrusted data',params:{path:'outside'}}]) {
  const g=moderationGuard();checkModeration(g,moderationFrame(metadata));assert.equal(g.blocker,null);assert.equal(g.accountingValid,true);
 }
});
test('moderation rejects unbound, foreign, malformed and server-request frames',()=>{
 const good=moderationFrame(null),cases=[{...good,params:{...good.params,threadId:'foreign'}},{...good,params:{...good.params,turnId:'foreign'}},{...good,params:{metadata:null,threadId:'owned'}},{...good,params:{threadId:'owned',turnId:'turn'}},{...good,params:{...good.params,extra:true}},{...good,params:[]},{...good,extra:true},{...good,jsonrpc:'1.0'},{...good,id:1},{...good,params:{...good.params,metadata:undefined}}];
 for(const frame of cases){const g=moderationGuard();checkModeration(g,frame);assert.ok(g.blocker);assert.equal(g.accountingValid,false);checkModeration(g,good);assert.equal(g.accountingValid,false);}
 const unbound=evaluationFrameGuard('owned');checkModeration(unbound,good);assert.ok(unbound.blocker);
 const closed=moderationGuard();closed.close();checkModeration(closed,good);assert.equal(closed.blocker,'native-evaluation-late-frame');assert.equal(closed.accountingValid,false);
});
test('moderation limits count full UTF-8 bytes, cumulative traffic and duplicates',()=>{
 const {maxFrameBytes,maxTotalBytes,maxFrames}=S.moderation_limits,base=Buffer.byteLength(JSON.stringify(moderationFrame(''))),available=maxFrameBytes-base;
 const text='ж'.repeat(Math.floor(available/2))+'x'.repeat(available%2),exact=moderationFrame(text);assert.equal(Buffer.byteLength(JSON.stringify(exact)),maxFrameBytes);
 const g=moderationGuard();checkModeration(g,exact);assert.equal(g.blocker,null);checkModeration(g,moderationFrame(text+'x'));assert.equal(g.blocker,'native-evaluation-moderation-limit');assert.equal(g.accountingValid,false);
 const total=moderationGuard();for(let i=0;i<Math.floor(maxTotalBytes/maxFrameBytes);i++)checkModeration(total,exact);assert.equal(total.blocker,null);checkModeration(total,exact);assert.equal(total.blocker,'native-evaluation-moderation-limit');
 const count=moderationGuard();for(let i=0;i<maxFrames;i++)checkModeration(count,moderationFrame(null));assert.equal(count.blocker,null);checkModeration(count,moderationFrame(null));assert.equal(count.blocker,'native-evaluation-moderation-limit');
});
for(const forbiddenTool of [false,true])test('late moderation invalidates accounting'+(forbiddenTool?' after the real C3 denial':''),async t=>{
 const f=fixture(t,{lateModeration:true,forbiddenTool,control:forbiddenTool,probeTool:forbiddenTool?'evaluation_probe_forbidden':undefined}),e=await createNativeEndpoint(f.descriptor,f.dependencies),r=await send(e);
 assert.equal(r.evaluation.accounting_valid,true);await e.stopAndWait();const proof=e.evaluationEvidence();assert.equal(proof.accounting_valid,false);assert.equal(proof.violation,forbiddenTool?'native-evaluation-tool-call':'native-evaluation-late-frame');assert.equal(proof.evaluation_isolation_verified,false);
});

test('moderation needs trusted parser byte evidence with no normalized fallback',()=>{
 for(const bytes of [undefined,null,NaN,Infinity,-1,0,1.5,Number.MAX_SAFE_INTEGER+1]){const g=moderationGuard();g.check(moderationFrame(null),bytes);assert.equal(g.blocker,'native-evaluation-moderation-byte-evidence');assert.equal(g.accountingValid,false);checkModeration(g,moderationFrame(null));assert.equal(g.accountingValid,false);}
 assert.equal(S.moderation_limits.byteMetric,'wire-json-line-bytes-excluding-lf-v1');
});
const paddedModeration=bytes=>{const wire=JSON.stringify(moderationFrame('ж'));return wire+' '.repeat(bytes-Buffer.byteLength(wire)-1)+'\r';};
for(const [name,wires,split,valid] of [
 ['exact noncompact CR boundary',[paddedModeration(65536)],false,true],
 ['one byte above noncompact boundary',[paddedModeration(65537)],false,false],
 ['escaped wire metadata',[JSON.stringify(moderationFrame('a'.repeat(12000))).replaceAll('a','\\u0061')],false,false],
 ['aggregate noncompact bytes',Array.from({length:5},()=>paddedModeration(65536)),false,false],
 ['split multibyte boundary',[paddedModeration(65536)],true,true],
 ['split oversized multibyte frame',[paddedModeration(65537)],true,false],
])test('moderation wire limits: '+name,async t=>{
 const f=fixture(t,{moderationWires:wires,splitModeration:split}),e=await createNativeEndpoint(f.descriptor,f.dependencies),r=await send(e);await e.stopAndWait();const proof=e.evaluationEvidence();
 assert.equal(proof.accounting_valid,valid);assert.equal(proof.evaluation_isolation_verified,valid);
 if(valid){assert.equal(r.usage_span.actual_tokens,'30');assert.equal(proof.violation,null);}else assert.equal(proof.violation,'native-evaluation-moderation-limit');
});
