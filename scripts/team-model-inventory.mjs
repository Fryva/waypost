// Advisory native catalogs. Advertised configurations are never role evidence.
import { routingDigest } from './model-routing.mjs';
export const INVENTORY_REFRESH_MS=900000, INVENTORY_TTL_MS=3600000;
const SCHEMA='native-model-inventory-v1', MAX_ROWS=1000, MAX_BYTES=524288;
const SOURCES={codex:{method:'model/list',url:'https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/v2/ModelListResponse.json'},opencode:{method:'GET /provider',url:'https://opencode.ai/docs/server/'}};
const fail=code=>{throw Object.assign(new Error(code),{code});};
function object(x){if(!x||typeof x!=='object'||Array.isArray(x))fail('inventory-object-required');return x;}
function text(x,max=256){if(typeof x!=='string'||!x||x.trim()!==x||x.length>max||/[\x00-\x1f\x7f]/.test(x))fail('inventory-bounded-string-required');return x;}
function digest(x){if(!/^[a-f0-9]{64}$/.test(x||''))fail('inventory-digest-required');return x;}
function list(x,max=64){if(!Array.isArray(x)||x.length>max)fail('inventory-list-limit');return x;}
function strings(x,max=64){const rows=list(x,max).map(v=>text(v));if(new Set(rows).size!==rows.length)fail('inventory-duplicate-value');return rows;}
function clock(x){if(!Number.isSafeInteger(x)||x<0)fail('inventory-clock-required');return x;}
function candidate(harness,route,model,options,extra){
 options=[...options].sort((a,b)=>a.value.localeCompare(b.value));
 const row={id:'catalogue-'+routingDigest({schema:SCHEMA,harness,route,model,options}),native_route_id:route,native_model_id:model,requested_options:options,effective_reasoning:'unknown',backend_author:'unknown',roles:[],rank_eligible:false,calibration_required:true,...extra};
 return row;
}
function price(cost){
 if(cost===undefined||cost===null)return {kind:'unknown',input:null,output:null,currency:'unknown',unit:'unknown',coverage:[]};
 object(cost);const amount=x=>x===undefined||x===null?null:typeof x==='number'&&Number.isFinite(x)&&x>=0?String(x):fail('inventory-price-invalid');
 const input=amount(cost.input),output=amount(cost.output),coverage=[...(input===null?[]:['input']),...(output===null?[]:['output'])];
 return {kind:input==='0'&&output==='0'?'advertised-zero':coverage.length?'advertised-priced':'unknown',input,output,currency:cost.currency===undefined?'unknown':text(cost.currency,32),unit:cost.unit===undefined?'unknown':text(cost.unit,64),coverage};
}
export function metadataDescriptor(d){
 const fields=['managed','harness','cwd','mode','timeout_ms','executable','spawn_server'];
 return Object.fromEntries(fields.filter(k=>d[k]!==undefined).map(k=>[k,d[k]]));
}
export function projectNativeInventory(native){
 object(native);const source=SOURCES[native.harness];
 if(native.protocol!==1||!source||native.complete!==true||native.source?.method!==source.method||native.source?.url!==source.url||!Number.isSafeInteger(native.pages)||native.pages<1||native.pages>10)fail('inventory-complete-native-source-required');
 text(native.version,128);if(!['native-initialize','native-health','unknown'].includes(native.version_provenance))fail('inventory-version-provenance-required');
 const candidates=[];
 if(native.harness==='codex'){
  if(JSON.stringify(native.filters)!==JSON.stringify({includeHidden:true})||native.response?.nextCursor!==null)fail('inventory-complete-filter-required');
  for(const row of list(native.response.data,MAX_ROWS)){
   object(row);const model=text(row.model),id=text(row.id);
   if(typeof row.hidden!=='boolean'||typeof row.isDefault!=='boolean')fail('inventory-model-flags-required');
   const options=list(row.supportedReasoningEfforts).map(x=>({kind:'reasoning',value:text(object(x).reasoningEffort)}));
   if(new Set(options.map(x=>x.value)).size!==options.length)fail('inventory-duplicate-option');
   const defaultOption=text(row.defaultReasoningEffort);if(!options.some(x=>x.value===defaultOption))fail('inventory-default-option-unadvertised');
   candidates.push(candidate('codex',null,model,options,{native_catalogue_id:id,default_requested_option:defaultOption,hidden:row.hidden,is_default:row.isDefault,availability:'advertised',input_modalities:row.inputModalities===undefined?[]:strings(row.inputModalities),price_hint:price()}));
  }
 }else{
  if(JSON.stringify(native.filters)!==JSON.stringify({providers:'all',connected:true}))fail('inventory-complete-filter-required');
  const response=object(native.response),connected=new Set(strings(response.connected,MAX_ROWS)),routes=new Set();object(response.default);
  for(const provider of list(response.all,MAX_ROWS)){
   object(provider);const route=text(provider.id);if(routes.has(route))fail('inventory-duplicate-route');routes.add(route);
   for(const [key,row] of Object.entries(object(provider.models))){
    object(row);const model=text(row.id);if(model!==text(key))fail('inventory-model-key-mismatch');
    const options=row.variants===undefined?[]:Object.keys(object(row.variants)).map(value=>({kind:'variant',value:text(value)}));
    list(options);const modalities=row.modalities?.input===undefined?[]:strings(row.modalities.input);
    candidates.push(candidate('opencode',route,model,options,{native_catalogue_id:model,default_requested_option:null,hidden:null,is_default:response.default[route]===model,availability:connected.has(route)?'connected-advertised':'advertised',input_modalities:modalities,price_hint:price(row.cost)}));
    if(candidates.length>MAX_ROWS)fail('inventory-row-limit');
   }
  }
  if([...connected].some(route=>!routes.has(route)))fail('inventory-connected-route-missing');
 }
 if(candidates.length>MAX_ROWS||new Set(candidates.map(x=>x.id)).size!==candidates.length)fail('inventory-row-limit-or-duplicate');
 candidates.sort((a,b)=>a.id.localeCompare(b.id));
 const projected={schema:SCHEMA,harness:native.harness,source:{...source},version:native.version,version_provenance:native.version_provenance,pages:native.pages,filters:structuredClone(native.filters),complete:true,candidates};
 if(Buffer.byteLength(JSON.stringify(projected))>MAX_BYTES)fail('inventory-projection-byte-limit');return projected;
}
export async function collectModelInventory({transport,team,participant,descriptor,collector,nonce,startedAt,now=Date.now}={}){
 if(typeof transport?.listModelConfigurations!=='function')fail('inventory-native-metadata-unsupported');
 const started=clock(startedAt??(typeof now==='function'?now():now));
 const projected=projectNativeInventory(await transport.listModelConfigurations()),at=clock(typeof now==='function'?now():now);if(at<started||at-started>600000)fail('inventory-collection-window-invalid');
 return {protocol:1,purpose:'native-model-inventory',team:text(team),participant:text(participant.id),incarnation:text(participant.incarnation),descriptor_digest:routingDigest(descriptor),collector:text(collector),nonce:text(nonce,100),metadata_scope_digest:routingDigest({schema:SCHEMA,descriptor_digest:routingDigest(descriptor),source:projected.source,filters:projected.filters}),started_at:new Date(started).toISOString(),observed_at:new Date(at).toISOString(),expires_at:new Date(at+INVENTORY_TTL_MS).toISOString(),projected};
}
function exact(x,keys){object(x);if(Object.keys(x).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(x,k)))fail('inventory-projection-fields-required');}
function validateProjected(x){
 exact(x,['schema','harness','source','version','version_provenance','pages','filters','complete','candidates']);
 const source=SOURCES[x.harness];if(!source||x.schema!==SCHEMA||x.complete!==true||!Number.isSafeInteger(x.pages)||x.pages<1||x.pages>10)fail('inventory-complete-source-required');
 exact(x.source,['method','url']);if(x.source.method!==source.method||x.source.url!==source.url)fail('inventory-native-source-required');
 text(x.version,128);if(!['native-initialize','native-health','unknown'].includes(x.version_provenance))fail('inventory-version-provenance-required');
 if(JSON.stringify(x.filters)!==JSON.stringify(x.harness==='codex'?{includeHidden:true}:{providers:'all',connected:true}))fail('inventory-filter-required');
 const ids=new Set();
 for(const row of list(x.candidates,MAX_ROWS)){
  exact(row,['id','native_route_id','native_model_id','requested_options','effective_reasoning','backend_author','roles','rank_eligible','calibration_required','native_catalogue_id','default_requested_option','hidden','is_default','availability','input_modalities','price_hint']);
  text(row.native_model_id);text(row.native_catalogue_id);if(x.harness==='codex'?row.native_route_id!==null:typeof row.native_route_id!=='string')fail('inventory-native-route-required');if(row.native_route_id!==null)text(row.native_route_id);
  for(const option of list(row.requested_options)){exact(option,['kind','value']);if(option.kind!==(x.harness==='codex'?'reasoning':'variant'))fail('inventory-requested-option-kind');text(option.value);}
  if(new Set(row.requested_options.map(o=>o.value)).size!==row.requested_options.length)fail('inventory-duplicate-option');
  if(row.id!=='catalogue-'+routingDigest({schema:SCHEMA,harness:x.harness,route:row.native_route_id,model:row.native_model_id,options:row.requested_options})||ids.has(row.id))fail('inventory-candidate-key-required');ids.add(row.id);
  if(row.default_requested_option!==null){text(row.default_requested_option);if(!row.requested_options.some(o=>o.value===row.default_requested_option))fail('inventory-default-option-unadvertised');}
  if(typeof row.is_default!=='boolean'||(x.harness==='codex'?typeof row.hidden!=='boolean':row.hidden!==null)||!['advertised','connected-advertised'].includes(row.availability)||x.harness==='codex'&&row.availability!=='advertised')fail('inventory-advertisement-flags-required');
  strings(row.input_modalities);exact(row.price_hint,['kind','input','output','currency','unit','coverage']);
  const hint=row.price_hint;for(const key of ['input','output'])if(hint[key]!==null&&(typeof hint[key]!=='string'||!hint[key]||hint[key].trim()!==hint[key]||String(Number(hint[key]))!==hint[key]||hint[key].length>64||!Number.isFinite(Number(hint[key]))||Number(hint[key])<0))fail('inventory-price-invalid');
  text(hint.currency,32);text(hint.unit,64);const coverage=['input','output'].filter(k=>hint[k]!==null),kind=hint.input==='0'&&hint.output==='0'?'advertised-zero':coverage.length?'advertised-priced':'unknown';
  if(hint.kind!==kind||JSON.stringify(hint.coverage)!==JSON.stringify(coverage))fail('inventory-price-coverage-required');
  if(row.rank_eligible!==false||row.calibration_required!==true||row.effective_reasoning!=='unknown'||row.backend_author!=='unknown'||!Array.isArray(row.roles)||row.roles.length)fail('inventory-advisory-only');
 }
}
export function inventoryDue(record,now=Date.now()){
 if(!Number.isFinite(now))return false;
 const last=Date.parse(record?.attempt?.at);return !Number.isFinite(last)||now<last||now-last>=INVENTORY_REFRESH_MS;
}
function bound(s,t,c){
 const isCapture=c.type==='native-model-inventory-capture-v1';
 if(isCapture&&['participant_id','participant_incarnation','descriptor_digest','nonce','started_at'].some(k=>Object.hasOwn(c,k)))fail('inventory-capture-alias-forbidden');
 const p=t.participants[isCapture?c.capture?.participant:c.participant_id],x=s.collectors?.[c.actor?.slice(10)];
 if(!c.actor?.startsWith('collector:')||!x||x.revoked||x.team!==t.id||!x.purposes?.includes('runtime')||!p||p.revoked||p.availability==='left'||p.incarnation!==(c.participant_incarnation||c.capture?.incarnation)||p.native_binding?.collector_id!==x.id||p.native_binding.descriptor_digest!==(c.descriptor_digest||c.capture?.descriptor_digest))fail('inventory-bound-runtime-collector-required');
 return p;
}
export function applyModelInventory(s,t,c,now){
 if(!['native-model-inventory-capture-v1','native-model-inventory-attempt-v1'].includes(c.type))return {handled:false};
 const p=bound(s,t,c);t.model_inventory||={};const previous=t.model_inventory[p.id]||{},at=c.type==='native-model-inventory-capture-v1'?c.capture.observed_at:c.at;
 const measured=Date.parse(at);if(!Number.isFinite(measured)||measured>now||now-measured>30000)fail('inventory-original-clock-required');
 if(Number.isFinite(Date.parse(previous.attempt?.at))&&measured<Date.parse(previous.attempt.at))fail('inventory-out-of-order-attempt');
 const nonce=text(c.nonce||c.capture?.nonce,100);
 if(c.request_key!==(c.type==='native-model-inventory-capture-v1'?'inventory-':'inventory-failure-')+nonce)fail('inventory-canonical-request-key-required');
 const started=Date.parse(c.started_at||c.capture?.started_at);if(!Number.isFinite(started)||started>measured||measured-started>600000)fail('inventory-collection-window-invalid');
 if(Number.isFinite(Date.parse(previous.attempt?.started_at))&&started<Date.parse(previous.attempt.started_at))fail('inventory-out-of-order-request');
 if(c.type==='native-model-inventory-attempt-v1'){
  const blocker=text(c.blocker,128);if(!/^[a-z][a-z0-9-]*$/.test(blocker))fail('inventory-safe-blocker-required');
  t.model_inventory[p.id]={...previous,attempt:{nonce,at,started_at:new Date(started).toISOString(),status:'failed',blocker,complete:false}};
  return {handled:true,result:{inventory:false,blocker,previous_expiry:previous.snapshot?.expires_at||null,protected_roles_granted:false}};
 }
 const capture=object(c.capture),allowed=['protocol','purpose','team','participant','incarnation','descriptor_digest','collector','nonce','metadata_scope_digest','started_at','observed_at','expires_at','projected'];
 if(Object.keys(capture).some(k=>!allowed.includes(k))||allowed.some(k=>!Object.hasOwn(capture,k))||capture.protocol!==1||capture.purpose!=='native-model-inventory'||capture.team!==t.id||capture.collector!==c.actor.slice(10))fail('inventory-capture-binding-required');
 digest(capture.descriptor_digest);digest(capture.metadata_scope_digest);const expiry=Date.parse(capture.expires_at);if(!Number.isFinite(expiry)||expiry-measured!==INVENTORY_TTL_MS)fail('inventory-original-expiry-required');
 // Revalidate the sanitized projection by reconstructing only allowlisted fields.
 const projected=object(capture.projected);if(projected.schema!==SCHEMA||!SOURCES[projected.harness]||projected.complete!==true||projected.source?.method!==SOURCES[projected.harness].method||projected.source?.url!==SOURCES[projected.harness].url||Buffer.byteLength(JSON.stringify(capture))>MAX_BYTES+4096)fail('inventory-sanitized-snapshot-required');
 validateProjected(projected);
 if(capture.metadata_scope_digest!==routingDigest({schema:SCHEMA,descriptor_digest:capture.descriptor_digest,source:projected.source,filters:projected.filters}))fail('inventory-scope-digest-required');
 const rows=projected.candidates;
 if(previous.snapshot?.nonce===nonce){if(JSON.stringify(previous.snapshot)!==JSON.stringify(capture))fail('inventory-immutable-observation-required');return {handled:true,result:{inventory:true,duplicate:true,candidates:rows.length,protected_roles_granted:false}};}
 const removed=previous.snapshot?.metadata_scope_digest===capture.metadata_scope_digest?previous.snapshot.projected.candidates.filter(old=>!rows.some(row=>row.id===old.id)).map(row=>row.id):[];
 t.model_inventory[p.id]={snapshot:structuredClone(capture),attempt:{nonce,at,started_at:new Date(started).toISOString(),status:'complete',blocker:null,complete:true}};
 return {handled:true,result:{inventory:true,candidates:rows.length,advertised_zero:rows.filter(x=>x.price_hint.kind==='advertised-zero').length,removed:removed.length,expires_at:capture.expires_at,protected_roles_granted:false}};
}
