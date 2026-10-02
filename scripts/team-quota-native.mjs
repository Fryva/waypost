// Provider availability only. This collector never starts a thread or inference.
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { validateNativeDescriptor } from './team-transport.mjs';
import { validateQuotaObservation } from './team-quota.mjs';

const fail = code => new Error('quota-native-'+code);
const hash = value => createHash('sha256').update(value).digest('hex');
const text = value => typeof value==='string' && value.length>0 && value.length<=256 && !/[\x00-\x1f\x7f]/.test(value);
const accountReasons = new Set(['workspace_owner_credits_depleted','workspace_member_credits_depleted','workspace_owner_usage_limit_reached','workspace_member_usage_limit_reached']);
const plans = new Set(['free','go','plus','pro','prolite','promax','team','self_serve_business_prolite','self_serve_business_usage_based','business','ent26','enterprise_cbp_automation','enterprise_cbp_usage_based','enterprise','edu','edu_plus','edu_pro']);

function accountBinding(response) {
  const a=response?.account, routing=response?.workspaceRouting;
  if(a?.type!=='chatgpt')throw fail('account-type-unsupported');
  if(!text(a.email)||!plans.has(a.planType))throw fail('account-binding-unverified');
  if(routing!==undefined&&routing!==null&&(!text(routing.chatgptAccountId)||routing.backendOrigin!=='https://chatgpt.com'))throw fail('account-routing-unverified');
  return {accountId:routing?.chatgptAccountId||null,email:a.email,plan:a.planType};
}
function windows(bucket) {
  const values=[bucket.primary,bucket.secondary];
  if(values.some(w=>!w||!Number.isInteger(w.usedPercent)||w.usedPercent<0||w.usedPercent>100||!Number.isSafeInteger(w.windowDurationMins)||w.windowDurationMins<=0||!Number.isSafeInteger(w.resetsAt)||w.resetsAt<=0))throw fail('quota-window-unverified');
  return values;
}
function requireNoAlternativeCredits(bucket) {
  const credits=bucket.credits;
  if(!credits||typeof credits!=='object'||Array.isArray(credits)||credits.hasCredits!==false||credits.unlimited!==false)throw fail('alternative-credits-available-or-unverified');
  if(credits.balance!==undefined&&credits.balance!==null&&(typeof credits.balance!=='string'||!/^\d+(?:\.\d+)?$/.test(credits.balance)||Number(credits.balance)!==0))throw fail('alternative-credits-available-or-unverified');
}
function classify(response,binding,model) {
  if(!text(response?.accountId)||(binding.accountId!==null&&response.accountId!==binding.accountId)||typeof response.ordinaryUsageAllowed!=='boolean')throw fail('quota-account-or-permission-unverified');
  const map=response.rateLimitsByLimitId;
  if(!map||typeof map!=='object'||Array.isArray(map)||Object.keys(map).length===0||Object.keys(map).length>128)throw fail('quota-buckets-unverified');
  const entries=Object.entries(map);
  for(const [id,b]of entries)if(!text(id)||!b||b.limitId!==id||b.planType!==binding.plan)throw fail('quota-bucket-binding-unverified');
  const legacy=response.rateLimits;
  if(!legacy||!text(legacy.limitId)||!map[legacy.limitId])throw fail('quota-legacy-view-unverified');
  // Compare semantic fields, independent of JSON property order or display name.
  for(const field of ['normalModelSlug','planType','primary','secondary','rateLimitReachedType','spendControlReached','individualLimit','credits']) {
    const canonical = value => JSON.stringify(value,(key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
    if(canonical(legacy[field])!==canonical(map[legacy.limitId][field]))throw fail('quota-conflicting-views');
  }
  const accountBlocked=entries.filter(([,b])=>accountReasons.has(b.rateLimitReachedType));
  if(response.ordinaryUsageAllowed===false&&accountBlocked.length) {
    if(accountBlocked.length!==1)throw fail('quota-account-pool-ambiguous');
    // Included usage exhaustion alone does not exhaust a route that can still
    // use paid credits. Unknown credit state cannot waive the strongest model.
    for(const [,bucket]of entries)requireNoAlternativeCredits(bucket);
    return {status:'exhausted',scope:'provider-account',pool:accountBlocked[0][0]};
  }
  const relevant=entries.filter(([,b])=>b.normalModelSlug===model.model_id);
  if(!relevant.length)throw fail('quota-model-scope-unverified');
  if(relevant.length!==1)throw fail('quota-model-pool-ambiguous');
  const [pool,bucket]=relevant[0],w=windows(bucket);
  if(response.ordinaryUsageAllowed===false&&bucket.rateLimitReachedType==='rate_limit_reached'&&w.some(x=>x.usedPercent===100)) {
    requireNoAlternativeCredits(bucket);
    return {status:'exhausted',scope:'provider-account-model',pool};
  }
  if(response.ordinaryUsageAllowed!==true||bucket.rateLimitReachedType!==null||bucket.spendControlReached!==false||bucket.individualLimit!==null||w.some(x=>x.usedPercent>=100)||accountBlocked.length)throw fail('quota-availability-unverified');
  // accountId is returned by the same authenticated RPC session. Repeated
  // reads plus unchanged account profile fence switching without mapping email.
  // One means fresh permission to attempt, never a fabricated call/dollar quota.
  return {status:'available',scope:'provider-account-model',pool};
}

export async function observeNativeProviderQuota({descriptor,participant,now=Date.now(),spawnProcess=spawn}={}) {
  const d=validateNativeDescriptor(descriptor),p=participant,m=p?.model;
  if(d.harness!=='codex')throw fail('harness-unsupported');
  if(!p||!text(p.id)||!text(p.incarnation)||!Number.isSafeInteger(m?.model_revision)||m.model_revision<1||m.provider!=='openai'||!text(m.model_id)||!text(m.reasoning)||m.reasoning==='unknown'||d.model_id!==m.model_id||d.reasoning!==m.reasoning)throw fail('execution-identity-unverified');
  const start=typeof now==='function'?now():now;
  if(!Number.isFinite(start))throw fail('clock-required');
  const timeout=Math.min(30000,Math.max(100,d.timeout_ms||15000)),deadline=Date.now()+timeout;
  const child=spawnProcess(d.executable||'codex',['-c','features.apps=false','-c','apps._default.enabled=false','app-server','--listen','stdio://'],{cwd:d.cwd,env:{...process.env},shell:false,stdio:['pipe','pipe','pipe']});
  let seq=0,buffer='',bytes=0,frames=0,closed=false,fatal=null;
  const decoder=new StringDecoder('utf8');
  const pending=new Map();
  const closePromise=new Promise(resolve=>child.once('close',()=>{closed=true;rejectAll(fail('process-closed'));resolve();}));
  function rejectAll(error){fatal=error;for(const item of pending.values()){clearTimeout(item.timer);item.reject(error);}pending.clear();}
  child.on('error',()=>rejectAll(fail('process-error')));
  child.stdin.on('error',()=>rejectAll(fail('process-write-failed')));
  child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>1048576)rejectAll(fail('response-budget'));});
  child.stdout.on('data',chunk=>{
    bytes+=chunk.length;buffer+=decoder.write(chunk);
    if(bytes>1048576||buffer.length>262144){rejectAll(fail('response-budget'));return;}
    let end;
    while((end=buffer.indexOf('\n'))!==-1){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;
      if(++frames>256){rejectAll(fail('frame-budget'));return;}
      let msg;try{msg=JSON.parse(line);}catch{rejectAll(fail('invalid-frame'));return;}
      if(!msg||typeof msg!=='object'||Array.isArray(msg)){rejectAll(fail('invalid-frame'));return;}
      // No server callback may cause a login, approval or tool operation.
      if(msg.method&&msg.id!==undefined){rejectAll(fail('server-operation-unsupported'));return;}
      const item=pending.get(msg.id);if(!item)continue;pending.delete(msg.id);clearTimeout(item.timer);
      if(msg.error)item.reject(fail('provider-read-failed'));else if(msg.result&&typeof msg.result==='object'&&!Array.isArray(msg.result))item.resolve(msg.result);else item.reject(fail('invalid-response'));
    }
  });
  function request(method,params){if(fatal||closed)return Promise.reject(fatal||fail('process-closed'));return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(fail('read-timeout'));},Math.max(1,deadline-Date.now()));pending.set(id,{resolve,reject,timer});try{child.stdin.write(JSON.stringify({id,method,params})+'\n');}catch{pending.delete(id);clearTimeout(timer);reject(fail('process-write-failed'));}});}
  try {
    await request('initialize',{clientInfo:{name:'waypost-quota',version:'1.0.0'}});
    child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
    const before=accountBinding(await request('account/read',{refreshToken:false}));
    const raw=await request('account/rateLimits/read',{});
    const repeated=await request('account/rateLimits/read',{});
    if(raw.accountId!==repeated.accountId||JSON.stringify(raw.rateLimitsByLimitId)!==JSON.stringify(repeated.rateLimitsByLimitId)||raw.ordinaryUsageAllowed!==repeated.ordinaryUsageAllowed)throw fail('quota-account-or-snapshot-changed');
    const after=accountBinding(await request('account/read',{refreshToken:false}));
    if(JSON.stringify(before)!==JSON.stringify(after))throw fail('authorization-changed');
    const state=classify(raw,before,m);classify(repeated,after,m);const clock=typeof now==='function'?now():now;
    if(!Number.isFinite(clock)||clock<start||clock-start>30000)throw fail('read-stale');
    const model={provider:m.provider,model_id:m.model_id,reasoning:m.reasoning};
    return validateQuotaObservation({protocol:1,participant:p.id,incarnation:p.incarnation,model_revision:m.model_revision,model,route:{endpoint:'https://chatgpt.com',account:hash(raw.accountId),sku:'chatgpt-'+before.plan,mode:before.plan==='free'?'free':'subscription',pool:state.pool,model},status:state.status,available_calls:state.status==='available'?1:0,provider_confirmed:true,evidence_kind:'provider-quota',reason:'provider-quota-'+(state.status==='available'?'available':'exhausted'),scope:state.scope,observation_id:randomUUID(),source:'https://chatgpt.com',observed_at:new Date(clock).toISOString(),expires_at:new Date(clock+60000).toISOString()},{participant:p,now:clock});
  } finally {
    rejectAll(fail('observer-closed'));
    if(!closed){
      child.kill('SIGTERM');
      const timer=setTimeout(()=>{if(!closed)child.kill('SIGKILL');},1000);
      let deadlineTimer;
      try { await Promise.race([closePromise,new Promise((_,reject)=>{deadlineTimer=setTimeout(()=>reject(fail('process-stop-unconfirmed')),3000);})]); }
      finally {clearTimeout(timer);clearTimeout(deadlineTimer);}
    }
  }
}
