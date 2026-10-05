// Whole-operation ownership. Stop proof requires callback drain and child closure.
import { createServer } from 'node:http';
import { mkdirSync, lstatSync, readdirSync, readFileSync, openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { resolve, join, parse } from 'node:path';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const completions=new WeakMap();
const stops=new WeakMap();
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=code=>Object.assign(new Error('owned-runtime-'+code),{code:'owned-runtime-'+code});
const text=v=>typeof v==='string'&&v.length>0&&v.length<=256&&!/[\x00-\x1f\x7f]/.test(v);
function safe(path){path=resolve(path);let at=parse(path).root;for(const part of path.slice(at.length).split(/[\\/]/).filter(Boolean)){at=join(at,part);try{if(lstatSync(at).isSymbolicLink())throw fail('symlink');}catch(e){if(e.code!=='ENOENT')throw e;}}return path;}
function directory(path){const d=safe(path);mkdirSync(d,{recursive:true,mode:0o700});const s=lstatSync(d);if(!s.isDirectory()||(process.platform!=='win32'&&(s.mode&0o077)))throw fail('private-directory-required');return d;}
function write(path,value){const fd=openSync(safe(path),'wx',0o600);try{writeSync(fd,JSON.stringify(value)+'\n');fsyncSync(fd);}finally{closeSync(fd);}let dir;try{dir=openSync(resolve(path,'..'),'r');fsyncSync(dir);}catch(e){if(!['EINVAL','ENOTSUP','EISDIR'].includes(e.code)&&!(process.platform==='win32'&&e.code==='EPERM'))throw e;}finally{if(dir!==undefined)closeSync(dir);}}
function read(path){const s=lstatSync(safe(path));if(!s.isFile()||s.size>262144||(process.platform!=='win32'&&(s.mode&0o077)))throw fail('private-bounded-record-required');let v;try{v=JSON.parse(readFileSync(path,'utf8'));}catch{throw fail('invalid-record');}if(!v||typeof v!=='object'||Array.isArray(v))throw fail('invalid-record');return v;}
function exists(path){try{lstatSync(safe(path));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function binding({team,participant,incarnation,epoch,descriptorDigest}){if(![team,participant,incarnation].every(text)||!Number.isSafeInteger(epoch)||epoch<0||!/^([a-f0-9]{64})$/.test(descriptorDigest||''))throw fail('binding-required');return {team,participant,incarnation,epoch,descriptor_digest:descriptorDigest};}
function setup(options){const scope=binding(options),d=directory(options.directory),prefix='scope-'+hash(scope);return {scope,d,prefix,barrier:join(d,prefix+'.barrier.json')};}
function bound(record,scope){if(record.protocol!==1||hash(record.scope)!==hash(scope))throw fail('record-binding-mismatch');}
async function listen(server){await new Promise((yes,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',no);yes();});});return 'http://127.0.0.1:'+server.address().port+'/stop';}
async function bounded(promise,timeout){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(fail('stop-unconfirmed')),timeout);})]);}finally{clearTimeout(timer);}}

// One process-wide interrupt path for every owned operation, nested or
// concurrent: the first SIGINT, SIGTERM or SIGHUP stops each active operation
// the way an authenticated /stop does, so each still writes its closure, and no
// new operation starts. When the last one has finished, the signal is raised
// again unless another listener (such as team watch) was there to handle it. A
// second signal, or operations that do not drain within 15 seconds, exit at once
// without closures. Windows has no owned closure path and keeps its default.
const INTERRUPTS=process.platform==='win32'?[]:['SIGINT','SIGTERM','SIGHUP'],INTERRUPT_CODES={SIGHUP:129,SIGINT:130,SIGTERM:143};
const interruptible=new Set();let interrupted=null,interruptHandledElsewhere=false,interruptTimer=null;
function onInterrupt(signal){
 if(interrupted)process.exit(INTERRUPT_CODES[interrupted]);
 interrupted=signal;interruptHandledElsewhere=process.listenerCount(signal)>1;
 for(const run of interruptible)run.interrupt();
 interruptTimer=setTimeout(()=>process.exit(INTERRUPT_CODES[signal]),15000);
}
function enterInterruptible(run){
 if(interrupted)throw fail('operation-interrupted');
 // First in line, so a once-listener registered earlier is still counted.
 if(!interruptible.size)for(const signal of INTERRUPTS)process.prependListener(signal,onInterrupt);
 interruptible.add(run);
}
function leaveInterruptible(run){
 if(!interruptible.delete(run)||interruptible.size)return;
 for(const signal of INTERRUPTS)process.removeListener(signal,onInterrupt);
 if(!interrupted)return;
 clearTimeout(interruptTimer);const signal=interrupted,elsewhere=interruptHandledElsewhere;interrupted=null;interruptHandledElsewhere=false;
 if(!elsewhere)process.kill(process.pid,signal);
}

export function createOwnedRuntime(options){
 const config=setup(options),{scope,d,prefix,barrier}=config;
 return {async run({kind,operation=randomUUID()}={},callback){
  if(!text(kind)||!text(operation)||!/^[A-Za-z0-9_-]{1,128}$/.test(operation)||typeof callback!=='function')throw fail('operation-required');
  if(exists(barrier))throw fail('epoch-stopped');
  const base=join(d,prefix+'.operation-'+operation),intent={protocol:1,scope,operation,kind,created_at:new Date().toISOString()};
  write(base+'.intent.json',intent);
  // Only this still-live launcher can attest that callback entry never happened.
  // Recovery must never infer this from an abandoned intent or a missing PID.
  const closeUnstarted=()=>write(base+'.closed.json',{protocol:1,scope,operation,kind,closed_at:new Date().toISOString(),stopped:true,callback_drained:true,callback_started:false,consumptions:[],native_ids:[],closure_proofs:[]});
  // The barrier must be checked after durable intent: concurrent enumeration
  // either sees the intent or fences its launch. An unknown intent blocks proof.
  if(exists(barrier)){closeUnstarted();throw fail('epoch-stopped-after-intent');}
  let stopped=false,done=false,failedStop=false;const factories=new Set(),endpoints=new Set(),effects=[];
  let finishDrain;const drained=new Promise(resolve=>{finishDrain=resolve;});
  function assertActive(){if(stopped||exists(barrier))throw fail('operation-stopped');}
  async function closeEndpoint(endpoint){if(!endpoint||typeof endpoint.stopAndWait!=='function')throw fail('endpoint-stop-capability-required');const proof=await endpoint.stopAndWait();if(proof?.stopped!==true)throw fail('endpoint-stop-unconfirmed');if(text(endpoint.native_id)){if(proof.native_id!==undefined&&proof.native_id!==endpoint.native_id)throw fail('endpoint-stop-binding');return {...proof,native_id:endpoint.native_id};}return proof;}
  async function closeAll(){
   const pending=await Promise.allSettled([...factories]);
   if(pending.some(x=>x.status==='rejected'&&x.reason?.code==='owned-runtime-endpoint-stop-unconfirmed'))throw fail('endpoint-stop-unconfirmed');
   const result=await Promise.allSettled([...endpoints].map(closeEndpoint));
   if(result.some(x=>x.status==='rejected')){failedStop=true;throw fail('endpoint-stop-unconfirmed');}
   return result.map(x=>x.value);
  }
  const handle={interrupt(){stopped=true;closeAll().catch(()=>{failedStop=true;});}};
  try{enterInterruptible(handle);}catch(error){closeUnstarted();finishDrain();throw error;}
  const token=randomBytes(32).toString('hex');
  const server=createServer((req,res)=>{
   const supplied=req.headers.authorization,expected='Bearer '+token;
   if(req.method!=='POST'||req.url!=='/stop'||typeof supplied!=='string'||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))){res.writeHead(403);res.end();return;}
   let bytes=0,body='';req.on('data',chunk=>{bytes+=chunk.length;if(bytes>4096){req.destroy();return;}body+=chunk;});
   req.on('end',()=>{void(async()=>{try{const request=JSON.parse(body);if(!request||request.operation!==operation||hash(request.scope)!==hash(scope))throw fail('stop-binding-mismatch');
    stopped=true;await closeAll();await drained;
    const record=read(base+'.closed.json');bound(record,scope);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({stopped:true,evidence_digest:hash(record)}));
   }catch{failedStop=true;res.writeHead(409);res.end();}})();});
  });
  server.requestTimeout=5000;server.headersTimeout=5000;
  let url;
  try{url=await listen(server);write(base+'.capability.json',{protocol:1,scope,operation,url,token});assertActive();}
   catch(error){stopped=true;try{closeUnstarted();}finally{server.close();finishDrain();leaveInterruptible(handle);}throw error;}
  const operationScope={assertActive,get stopRequested(){return stopped||exists(barrier);},
   annotate(command){assertActive();if(!command||typeof command!=='object'||Array.isArray(command))throw fail('command-required');
    if(typeof command.type==='string'&&(/consume/.test(command.type)||command.type==='work-dispatch-ack-v1')){
     const evidence={type:command.type,nonce:command.nonce||null,invocation_id:command.invocation_id||null,native_id:command.native_id||null,request_key:command.request_key||null};
     if(JSON.stringify(evidence).length>2048||effects.length>=1024)throw fail('consumption-budget');
     write(base+'.effect-'+effects.length+'.json',{protocol:1,scope,operation,...evidence});effects.push(evidence);
    }
    assertActive();return command;
   },async native(factory){assertActive();if(typeof factory!=='function')throw fail('factory-required');let launched=false,captured=false;
    const pending=Promise.resolve().then(()=>{assertActive();launched=true;return factory();}).then(async endpoint=>{captured=true;endpoints.add(endpoint);if(stopped||exists(barrier)){await closeEndpoint(endpoint);throw fail('operation-stopped');}return endpoint;}).catch(error=>{if(launched&&!captured)failedStop=true;throw error;});
    factories.add(pending);try{return await pending;}finally{factories.delete(pending);}
   }};
  let result,error;
  try{result=await callback(operationScope);}catch(e){error=e;}
  finally{
   stopped=true;
   try{const proofs=await closeAll();if(failedStop)throw fail('stop-unconfirmed');write(base+'.closed.json',{protocol:1,scope,operation,kind,closed_at:new Date().toISOString(),stopped:true,callback_drained:true,consumptions:effects,native_ids:[...new Set(effects.map(x=>x.native_id).filter(Boolean))],closure_proofs:proofs});done=true;}
   catch(e){error=e;}
   finishDrain();server.close();
   leaveInterruptible(handle);
  }
  if(!done)throw error||fail('stop-unconfirmed');if(error)throw error;return result;
 }};
}

export async function stopOwnedRuntime(options){
 const {scope,d,prefix,barrier}=setup(options),required=options.requiredOperations||[],timeout=options.timeoutMs||5000;
 if(!Array.isArray(required)||required.length>1024||required.some(x=>!text(x))||!Number.isSafeInteger(timeout)||timeout<100||timeout>30000)throw fail('stop-options-invalid');
 if(!exists(barrier)){try{write(barrier,{protocol:1,scope,stopped_at:new Date().toISOString()});}catch(e){if(e.code!=='EEXIST')throw e;}}
 bound(read(barrier),scope);
 const names=readdirSync(d).filter(x=>x.startsWith(prefix+'.operation-')&&x.endsWith('.intent.json'));if(names.length>1024)throw fail('operation-budget');
 const proofs=[];
 for(const name of names){const base=join(d,name.slice(0,-'.intent.json'.length)),intent=read(base+'.intent.json');bound(intent,scope);
  if(!exists(base+'.closed.json')){
   if(!exists(base+'.capability.json'))throw fail('prepared-operation-stop-unconfirmed');
   const cap=read(base+'.capability.json');bound(cap,scope);if(cap.operation!==intent.operation||!/^http:\/\/127\.0\.0\.1:[0-9]+\/stop$/.test(cap.url||'')||!/^([a-f0-9]{64})$/.test(cap.token||''))throw fail('stop-capability-invalid');
   const controller=new AbortController();let timer;
   try{timer=setTimeout(()=>controller.abort(),timeout);const response=await bounded(fetch(cap.url,{method:'POST',redirect:'error',signal:controller.signal,headers:{Authorization:'Bearer '+cap.token,'Content-Type':'application/json'},body:JSON.stringify({scope,operation:intent.operation})}),timeout);if(response.status!==200)throw fail('operation-stop-unconfirmed');await response.body?.cancel();}
   catch{throw fail('operation-stop-unconfirmed');}finally{clearTimeout(timer);controller.abort();}
  }
  const proof=read(base+'.closed.json');bound(proof,scope);if(proof.operation!==intent.operation||proof.stopped!==true||proof.callback_drained!==true||!Array.isArray(proof.consumptions))throw fail('closure-proof-invalid');proofs.push(proof);
 }
 // A durable ledger cannot cover historical consumed work that predates it.
 const covered=new Set(proofs.flatMap(p=>[p.operation,...p.consumptions.flatMap(x=>[x.nonce,x.invocation_id].filter(Boolean))]));
 if(required.some(x=>!covered.has(x)))throw fail('historical-consumption-stop-unconfirmed');
 const result={stopped:true,team:scope.team,participant:scope.participant,incarnation:scope.incarnation,epoch:scope.epoch,descriptor_digest:scope.descriptor_digest,operations:proofs.map(p=>p.operation),evidence_digest:hash({barrier:read(barrier),proofs})};
 // Preserve the historical public shape. Only the new serializer admits strict
 // process-group evidence; the original stop remains backward compatible.
 const groupsClosed=proofs.every(p=>Array.isArray(p.native_ids)&&Array.isArray(p.closure_proofs)&&p.closure_proofs.every(x=>x.stopped===true&&x.process_group_closed===true&&Number.isSafeInteger(x.owned_processes)&&x.owned_processes>=0)&&p.native_ids.every(id=>p.closure_proofs.some(x=>x.native_id===id)));
 stops.set(result,{digest:hash(result),groupsClosed,required:[...new Set(required)].sort()});
 return result;
}


// No imported JSON, stored PID or child-exit assertion can mint an epoch stop.
export function serializeOwnedRuntimeStopProof(record){
 const proof=stops.get(record);
 if(!proof||proof.digest!==hash(record)||!proof.groupsClosed)throw fail('strict-stop-provenance-required');
 const {stopped,...scope}=record;
 return {protocol:2,purpose:'protocol-quota-handover-stop',...scope,callback_drained:true,epoch_barrier:true,required_operations:[...proof.required]};
}

// Read only the held host's derived operation paths. This lookup creates neither
// directories nor epoch barriers and never stops a process or renews evidence.
export function collectOwnedRuntimeCompletion(options={}) {
 const allowed=['directory','team','participant','incarnation','epoch','descriptorDigest','operation','invocation_id','nonce','native_id','consume_type'];
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!allowed.includes(key))||typeof options.directory!=='string')throw fail('completion-selectors-required');
 const scope=binding(options),operation=options.operation;
 if(!text(operation)||!/^[A-Za-z0-9_-]{1,128}$/.test(operation)||![options.invocation_id,options.nonce,options.native_id].every(text))throw fail('completion-selectors-required');
 const consumeType=options.consume_type||'subscription-consume-v2';
 if(!['subscription-consume-v2','protocol-control-consume-v2'].includes(consumeType))throw fail('completion-consume-type-required');
 const d=safe(options.directory),stats=lstatSync(d);
 if(!stats.isDirectory()||(process.platform!=='win32'&&(stats.mode&0o077)))throw fail('private-directory-required');
 const base=join(d,'scope-'+hash(scope)+'.operation-'+operation);
 const intent=read(base+'.intent.json'),closed=read(base+'.closed.json');bound(intent,scope);bound(closed,scope);
 if(intent.operation!==operation||closed.operation!==operation||!text(intent.kind)||closed.kind!==intent.kind||closed.stopped!==true||closed.callback_drained!==true||closed.callback_started===false||!Array.isArray(closed.consumptions)||closed.consumptions.length>1024||!Array.isArray(closed.native_ids)||!Array.isArray(closed.closure_proofs))throw fail('completion-closure-required');
 const created=Date.parse(intent.created_at),finished=Date.parse(closed.closed_at);
 if(!Number.isFinite(created)||!Number.isFinite(finished)||finished<created)throw fail('completion-clock-invalid');
 const consumptions=[];
 for(let i=0;i<closed.consumptions.length;i++){
  const effect=read(base+'.effect-'+i+'.json');bound(effect,scope);
  if(effect.operation!==operation)throw fail('completion-effect-binding');
  const evidence=Object.fromEntries(['type','nonce','invocation_id','native_id','request_key'].map(key=>[key,effect[key]]));
  if(hash(evidence)!==hash(closed.consumptions[i]))throw fail('completion-effect-mismatch');
  consumptions.push(evidence);
 }
 const matching=consumptions.filter(effect=>effect.type===consumeType&&effect.invocation_id===options.invocation_id&&effect.nonce===options.nonce&&effect.native_id===options.native_id);
 if(matching.length!==1||!closed.native_ids.includes(options.native_id))throw fail('completion-consumption-required');
 const proof=closed.closure_proofs.find(p=>p&&p.native_id===options.native_id&&p.stopped===true&&p.process_group_closed===true&&Number.isSafeInteger(p.owned_processes)&&p.owned_processes>0);
 if(!proof)throw fail('completion-native-closure-required');
 const result={protocol:1,scope:structuredClone(scope),operation,kind:intent.kind,invocation_id:options.invocation_id,nonce:options.nonce,native_id:options.native_id,consume_type:consumeType,created_at:intent.created_at,closed_at:closed.closed_at,stopped:true,callback_drained:true,evidence_digest:hash({intent,closed,consumptions})};
 Object.freeze(result.scope);Object.freeze(result);completions.set(result,hash(result));return result;
}
export function verifyOwnedRuntimeCompletion(result,selectors={}) {
 if(!completions.has(result)||completions.get(result)!==hash(result))throw fail('completion-provenance-required');
 for(const key of ['operation','invocation_id','nonce','native_id','consume_type'])if(selectors[key]!==undefined&&selectors[key]!==result[key])throw fail('completion-selector-mismatch');
 if(['team','participant','incarnation','epoch','descriptorDigest'].some(key=>selectors[key]!==undefined)&&hash(binding(selectors))!==hash(result.scope))throw fail('completion-scope-mismatch');
 return true;
}
export function serializeOwnedRuntimeCompletion(result,selectors={}) {verifyOwnedRuntimeCompletion(result,selectors);return structuredClone(result);}
