import test from 'node:test';
import assert from 'node:assert/strict';
import {projectNativeInventory,collectModelInventory,applyModelInventory,inventoryDue,INVENTORY_REFRESH_MS,INVENTORY_TTL_MS,metadataDescriptor} from '../scripts/team-model-inventory.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
const now=Date.parse('2026-10-03T12:00:00Z'),at=new Date(now).toISOString();
const descriptor={managed:true,harness:'opencode',cwd:'/fixture',mode:'read-only',spawn_server:true,model_id:'selected-model',provider_id:'selected-route'};
function native(){return {protocol:1,harness:'opencode',source:{method:'GET /provider',url:'https://opencode.ai/docs/server/'},version:'1.18.33',version_provenance:'native-health',pages:1,complete:true,filters:{providers:'all',connected:true},response:{all:[{id:'route',options:{apiKey:'SECRET'},env:['SECRET'],models:{free:{id:'free',cost:{input:0,output:0,cache_read:5},variants:{quick:{apiKey:'SECRET'}},modalities:{input:['text']}},'unpriced:free':{id:'unpriced:free'}}},{id:'disconnected',models:{other:{id:'other',cost:{input:1,output:2}}}}],connected:['route'],default:{route:'free'}}};}
function fixture(){const p={id:'peer',incarnation:'inc',availability:'ready',revoked:false,native_binding:{collector_id:'collector',descriptor_digest:routingDigest(descriptor)}};const t={id:'team',participants:{peer:p},policy:{revision:1},candidate:'unchanged',required_review_models:[['real','strong','high']],review_floor:7};return {p,t,s:{collectors:{collector:{id:'collector',team:'team',purposes:['runtime'],revoked:false}}}};}
async function capture(f,raw=native(),clock=now,nonce='one',startedAt=clock){return collectModelInventory({transport:{listModelConfigurations:async()=>raw},team:'team',participant:f.p,descriptor,collector:'collector',nonce,startedAt,now:clock});}
const command=capture=>({type:'native-model-inventory-capture-v1',actor:'collector:collector',request_key:'inventory-'+capture.nonce,at:capture.observed_at,capture});
test('native projection keeps routing/prices/options advisory and drops all secrets',()=>{
 const x=projectNativeInventory(native());assert.equal(JSON.stringify(x).includes('SECRET'),false);assert.equal(x.candidates.length,3);
 const free=x.candidates.find(x=>x.native_model_id==='free');assert.equal(free.price_hint.kind,'advertised-zero');assert.equal(free.price_hint.currency,'unknown');assert.deepEqual(free.price_hint.coverage,['input','output']);assert.equal(free.availability,'connected-advertised');assert.equal(free.backend_author,'unknown');assert.equal(free.effective_reasoning,'unknown');assert.equal(free.rank_eligible,false);assert.deepEqual(free.roles,[]);assert.deepEqual(free.requested_options,[{kind:'variant',value:'quick'}]);
 assert.equal(x.candidates.find(x=>x.native_model_id==='unpriced:free').price_hint.kind,'unknown');assert.equal(x.candidates.find(x=>x.native_model_id==='other').availability,'advertised');
 assert.deepEqual(metadataDescriptor(descriptor),{managed:true,harness:'opencode',cwd:'/fixture',mode:'read-only',spawn_server:true});
});
test('Codex options remain advertised arbitrary reasoning labels without authorship or execution claims',()=>{
 const x={...native(),harness:'codex',source:{method:'model/list',url:'https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/schema/json/v2/ModelListResponse.json'},filters:{includeHidden:true},response:{nextCursor:null,data:[{id:'picker',model:'model',hidden:false,isDefault:true,defaultReasoningEffort:'future-effort',supportedReasoningEfforts:[{reasoningEffort:'future-effort',description:'secret text ignored'}]}]}};
 const row=projectNativeInventory(x).candidates[0];assert.equal(row.default_requested_option,'future-effort');assert.equal(row.effective_reasoning,'unknown');assert.equal(row.backend_author,'unknown');assert.equal(row.price_hint.kind,'unknown');
});
test('partial, invalid row, duplicate configuration, disconnected projection and limits cannot imply removal',()=>{
 const variants=[x=>x.complete=false,x=>x.response.all[0].models.free.id='mismatch',x=>x.response.connected.push('missing'),x=>x.response.all.push(x.response.all[0]),x=>x.response.all[0].models.free.cost.input=-1];
 for(const mutate of variants){const x=native();mutate(x);assert.throws(()=>projectNativeInventory(x));}
});
test('bound immutable catalogue capture changes neither calibration nor authority; failure never renews expiry',async()=>{
 const f=fixture(),c=await capture(f),policy=structuredClone(f.t.policy),history=structuredClone(f.t.required_review_models);const result=applyModelInventory(f.s,f.t,command(c),now);
 assert.equal(result.result.inventory,true);assert.equal(result.result.advertised_zero,1);assert.equal(f.t.candidate,'unchanged');assert.deepEqual(f.t.policy,policy);assert.deepEqual(f.t.required_review_models,history);assert.equal(f.t.review_floor,7);
 const saved=structuredClone(f.t.model_inventory.peer.snapshot),later=now+1000;
 applyModelInventory(f.s,f.t,{type:'native-model-inventory-attempt-v1',actor:'collector:collector',participant_id:'peer',participant_incarnation:'inc',descriptor_digest:routingDigest(descriptor),nonce:'failure',request_key:'inventory-failure-failure',started_at:at,at:new Date(later).toISOString(),blocker:'native-inventory-page-limit'},later);
 assert.deepEqual(f.t.model_inventory.peer.snapshot,saved);assert.equal(f.t.model_inventory.peer.attempt.complete,false);assert.equal(Date.parse(saved.expires_at),now+INVENTORY_TTL_MS);
 assert.equal(inventoryDue(f.t.model_inventory.peer,later+1000),false);assert.equal(inventoryDue(f.t.model_inventory.peer,later+INVENTORY_REFRESH_MS),true);
});
test('capture rejects raw fields, role claims, stale bindings, out-of-order responses and renewed old nonce',async()=>{
 const f=fixture(),original=await capture(f);for(const mutate of [x=>x.projected.candidates[0].apiKey='SECRET',x=>x.projected.candidates[0].rank_eligible=true,x=>x.projected.source.password='SECRET',x=>x.descriptor_digest='a'.repeat(64),x=>x.expires_at=new Date(now+INVENTORY_TTL_MS+1).toISOString(),x=>x.metadata_scope_digest='a'.repeat(64)]){const c=structuredClone(original);mutate(c);assert.throws(()=>applyModelInventory(f.s,f.t,command(c),now));}
 assert.throws(()=>applyModelInventory(f.s,f.t,{...command(original),actor:'owner:fixture'},now),/collector/);
 applyModelInventory(f.s,f.t,command(original),now);assert.equal(applyModelInventory(f.s,f.t,command(original),now).result.duplicate,true);
 const renewed=await capture(f,native(),now+1000,'one');assert.throws(()=>applyModelInventory(f.s,f.t,command(renewed),now+1000),/immutable/);
 const newer=await capture(f,native(),now+2000,'newer',now+1500);applyModelInventory(f.s,f.t,command(newer),now+2000);
 const old=await capture(f,native(),now+3000,'old',now+1000);assert.throws(()=>applyModelInventory(f.s,f.t,command(old),now+3000),/out-of-order-request/);
});
test('only complete snapshots in the same metadata scope establish catalogue removals',async()=>{
 const f=fixture();applyModelInventory(f.s,f.t,command(await capture(f)),now);
 const x=native();delete x.response.all[0].models.free;const c=await capture(f,x,now+1000,'next');const r=applyModelInventory(f.s,f.t,command(c),now+1000);assert.equal(r.result.removed,1);assert.deepEqual(f.t.required_review_models,[['real','strong','high']]);
});

test('native option ordering cannot manufacture a removed catalogue configuration',()=>{
 const a=native();a.response.all[0].models.free.variants={slow:{},quick:{}};const b=structuredClone(a);b.response.all[0].models.free.variants={quick:{},slow:{}};
 assert.deepEqual(projectNativeInventory(a),projectNativeInventory(b));
});


test('capture aliases and noncanonical request keys cannot rebind an authenticated observation',async()=>{
 const f=fixture(),c=await capture(f);
 for(const fields of [{participant_id:'peer'},{participant_incarnation:'inc'},{descriptor_digest:routingDigest(descriptor)},{nonce:'alias'},{started_at:at},{request_key:'different'}])assert.throws(()=>applyModelInventory(f.s,f.t,{...command(c),...fields},now),/alias-forbidden|request-key-required/);
});

function claudeNative(){return {protocol:1,harness:'claude',source:{method:'initialize/models',url:'https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/_internal/query.py'},version:'unknown',version_provenance:'unknown',pages:1,complete:true,filters:{models:'advertised'},response:{models:[{value:'default',resolvedModel:'SECRET',supportedEffortLevels:['future','high'],account:'SECRET'},{value:'opus',resolvedModel:'SECRET',cost:{input:0,output:0}}],account:'SECRET'}};}
test('Claude advertisements retain selectors and only advertised efforts, never resolved backend or price',async()=>{
 const raw=claudeNative(),projected=projectNativeInventory(raw);assert.equal(JSON.stringify(projected).includes('SECRET'),false);assert.equal(projected.candidates.length,2);
 const row=projected.candidates.find(x=>x.native_model_id==='default');assert.equal(row.native_catalogue_id,'default');assert.equal(row.native_route_id,null);assert.equal(row.is_default,true);assert.equal(row.hidden,null);assert.equal(row.default_requested_option,null);assert.deepEqual(row.requested_options,[{kind:'reasoning',value:'future'},{kind:'reasoning',value:'high'}]);assert.equal(row.backend_author,'unknown');assert.equal(row.effective_reasoning,'unknown');assert.equal(row.price_hint.kind,'unknown');assert.equal(row.rank_eligible,false);assert.deepEqual(row.roles,[]);
 const f=fixture(),c=await capture(f,raw),original=structuredClone(f.t.policy),r=applyModelInventory(f.s,f.t,command(c),now);assert.equal(r.result.advertised_zero,0);assert.equal(r.result.protected_roles_granted,false);assert.deepEqual(f.t.policy,original);assert.equal(f.t.review_floor,7);assert.equal(f.t.candidate,'unchanged');
});
test('Claude missing catalogues, duplicate selectors/options and unbounded input reject complete snapshots',()=>{
 for(const mutate of [x=>delete x.response.models,x=>x.response.models=null,x=>x.response.models.push(x.response.models[0]),x=>x.response.models[0].supportedEffortLevels=['high','high'],x=>x.response.models[0].value='\n',x=>x.response.models=Array.from({length:1001},(_,i)=>({value:'m'+i})),x=>x.filters={models:'selected'},x=>x.pages=2]){const raw=claudeNative();mutate(raw);assert.throws(()=>projectNativeInventory(raw));}
});
test('Claude effort order is stable and sanitized captures cannot claim hidden backend, pricing or rankings',async()=>{
 const first=claudeNative(),second=structuredClone(first);second.response.models[0].supportedEffortLevels.reverse();assert.deepEqual(projectNativeInventory(first),projectNativeInventory(second));
 const f=fixture(),original=await capture(f,first);
 for(const modify of [c=>c.projected.candidates[0].backend_author='anthropic',c=>c.projected.candidates[0].rank_eligible=true,c=>c.projected.candidates[0].native_route_id='anthropic',c=>c.projected.candidates[0].default_requested_option='high',c=>c.projected.candidates[0].resolvedModel='SECRET',c=>c.projected.version='2.1.286']){const c=structuredClone(original);modify(c);assert.throws(()=>applyModelInventory(f.s,f.t,command(c),now));}
});

test('empty Claude captures still enforce original single-page unknown version provenance',async()=>{
 const f=fixture(),raw=claudeNative();raw.response.models=[];const original=await capture(f,raw);
 for(const change of [x=>x.pages=2,x=>x.version='2.1.286',x=>x.version_provenance='native-initialize']){
  const native=structuredClone(raw);change(native);assert.throws(()=>projectNativeInventory(native));
  const c=structuredClone(original);change(c.projected);assert.throws(()=>applyModelInventory(f.s,f.t,command(c),now),/claude-advertisement/);
 }
 assert.equal(applyModelInventory(f.s,f.t,command(original),now).result.candidates,0);
});
