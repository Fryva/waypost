import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {authorityFixture,now,at,expiry} from './helpers/native-calibration.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';
import {mutateAuthority,readAuthority} from '../scripts/team-store.mjs';
import {collectModelInventory} from '../scripts/team-model-inventory.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
const directories=[];after(()=>directories.forEach(p=>rmSync(p,{recursive:true,force:true})));
const cli=fileURLToPath(new URL('../scripts/team-cli.mjs',import.meta.url));
const stateModule=new URL('../scripts/team-state.mjs',import.meta.url).href;
let shared;
function seedReducer(seed){return (state,command,context)=>command.type==='fixture-initialize'?{state:structuredClone(seed),result:{fixture:true}}:reduceTeamEvent(state,command,context);}
async function fixture(){
 shared??=authorityFixture();const f=await shared,s=structuredClone(f.state);
 const root=realpathSync(mkdtempSync(join(tmpdir(),'waypost-inventory-cli-')));directories.push(root);
 mkdirSync(join(root,'.waypost'));mkdirSync(join(root,'vault'));writeFileSync(join(root,'.waypost/projectstore.json'),JSON.stringify({vault_path:'vault',coordination_dir:'coordination',layout:'engineering'}));
 const token='fixture-owner-token-'.repeat(4),hash=createHash('sha256').update(token).digest('hex');
 writeFileSync(join(root,'.waypost/team-owner.json'),JSON.stringify({protocol:1,role:'owner',token}));
 Object.assign(s,{protocol:1,owner_hash:hash,task_bindings:{task:'team'}});
 Object.assign(s.teams.team,{task:'task',policy:{protocol:1,revision:1,mode:'automatic',domain:'coding',generated_at:at,expires_at:expiry,sources:[{id:'fixture',url:'https://example.org/fixture',retrieved_at:at}],profiles:[],evidence_floor:['adapter-observed']},messages:[],work:{},status:'forming',leader:null,candidate:null,required_review_models:[],native_policy_bootstrap:true});
 let state=reduceTeamEvent(s,{type:'native-policy-install-v2',team:'team',actor:'owner:'+hash,at,request_key:'install',cohort_id:'cohort',expected_policy_revision:1,scope:'waypost-protocol'},{revision:f.revision}).state;
 const descriptor={managed:true,harness:'opencode',cwd:root,mode:'read-only',spawn_server:true};
 const raw={protocol:1,harness:'opencode',source:{method:'GET /provider',url:'https://opencode.ai/docs/server/'},version:'1.18.33',version_provenance:'native-health',pages:1,complete:true,filters:{providers:'all',connected:true},response:{all:[{id:'route',models:{free:{id:'free',cost:{input:0,output:0}},paid:{id:'paid',cost:{input:1,output:2}}}}],default:{route:'free'},connected:['route']}};
 // Catalog binding is independent of a calibrated admission. This fixture
 // deliberately changes descriptors after installation, without minting rank.
 for(const id of Object.keys(state.teams.team.participants)){
  const p=state.teams.team.participants[id];
  p.native_binding.descriptor_digest=routingDigest(descriptor);
  p.native_binding.collector_file=join(root,'never-collector.json');p.native_binding.endpoint_file=join(root,'never-endpoint.json');
  const nonce='catalogue-'+p.id,capture=await collectModelInventory({transport:{listModelConfigurations:async()=>raw},team:'team',participant:p,descriptor,collector:p.native_binding.collector_id,nonce,startedAt:now,now});
  state=reduceTeamEvent(state,{type:'native-model-inventory-capture-v1',team:'team',actor:'collector:'+p.native_binding.collector_id,at,request_key:'inventory-'+nonce,capture},{revision:f.revision+1}).state;
 }
 const authority=join(root,'coordination/teams/authority'),reducer=seedReducer(state);
 mutateAuthority(authority,{actor:'owner:'+hash,key:'fixture',expected_revision:0,command:{type:'fixture-initialize'}},reducer,{confirmedLocal:true});
 const seedPath=join(root,'seed.json');writeFileSync(seedPath,JSON.stringify(state));
 const loader=join(root,'loader.mjs'),preload=join(root,'preload.mjs'),marker=join(root,'forbidden-native-call');
 writeFileSync(loader,`import {readFileSync} from 'node:fs';
const target=${JSON.stringify(stateModule)};
export async function load(url,context,next){const result=await next(url,context);if(url!==target)return result;const source=String(result.source).replace('export function reduceTeamEvent(','function originalReduceTeamEvent(');return {...result,source:source+'\\nexport function reduceTeamEvent(s,c,a){return c.type==="fixture-initialize"?{state:JSON.parse(readFixture()),result:{fixture:true}}:originalReduceTeamEvent(s,c,a); }\\nfunction readFixture(){return fixtureRead(process.env.INVENTORY_TEST_SEED); }\\nimport {readFileSync as fixtureRead} from "node:fs";'};}
export async function resolve(specifier,context,next){if(context.parentURL===${JSON.stringify(pathToFileURL(cli).href)}&&['./model-strength.mjs','./team-host.mjs'].includes(specifier)){const resolved=await next(specifier,context);const name=specifier.includes('strength')?'discoverStrength':'createTeamHost';const body='export * from '+JSON.stringify(resolved.url)+';import {writeFileSync} from "node:fs";export function '+name+'(){writeFileSync(process.env.INVENTORY_TEST_MARKER,"forbidden");throw Error("unexpected-native-or-strength-call");}';return {url:'data:text/javascript,'+encodeURIComponent(body),shortCircuit:true};}return next(specifier,context);}`);
 writeFileSync(preload,`import {register} from 'node:module';register(${JSON.stringify(pathToFileURL(loader).href)},import.meta.url);const Original=Date,clock=Number(process.env.INVENTORY_TEST_CLOCK);globalThis.Date=class extends Original{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};globalThis.fetch=()=>{throw Error('network-forbidden');};`);
 function run(args,clock=now+1000){return spawnSync(process.execPath,['--import',preload,cli,...args],{cwd:root,encoding:'utf8',env:{...process.env,WAYPOST_PROJECT_DIR:root,WAYPOST_NO_BEAT:'1',INVENTORY_TEST_SEED:seedPath,INVENTORY_TEST_MARKER:marker,INVENTORY_TEST_CLOCK:String(clock)}});}
 function ok(args,clock){const result=run(args,clock);assert.equal(result.status,0,result.stderr||result.stdout);return JSON.parse(result.stdout);}
 return {root,authority,reducer,state,marker,ok};
}
test('actual CLI status summarizes candidates by default and exposes only projected detail on request',async()=>{
 const f=await fixture(),before=readAuthority(f.authority,f.reducer),summary=f.ok(['status','team']),detail=f.ok(['status','team','--model-inventory']);
 for(const [id,entry] of Object.entries(summary.teams[0].model_inventory)){
  assert.equal(entry.snapshot.projected.candidate_count,2);assert.equal(Object.hasOwn(entry.snapshot.projected,'candidates'),false);
  const rows=detail.teams[0].model_inventory[id].snapshot.projected.candidates;assert.equal(rows.length,2);assert.equal(rows.find(r=>r.native_model_id==='free').price_hint.kind,'advertised-zero');assert.ok(rows.every(r=>r.rank_eligible===false&&r.roles.length===0));
 }
 assert.deepEqual(readAuthority(f.authority,f.reducer),before);assert.equal(existsSync(f.marker),false);
});
test('protocol2 CLI refresh neither inspects native identity nor discovers strength nor renews clocks',async()=>{
 const f=await fixture(),policy=structuredClone(f.state.teams.team.policy),inventory=structuredClone(f.state.teams.team.model_inventory);
 const fresh=f.ok(['refresh','team']);assert.equal(fresh.refreshed,false);assert.equal(fresh.calibration_renewed,false);assert.deepEqual(fresh.inventory_inspections,[]);assert.equal(existsSync(f.marker),false);
 const saved=readAuthority(f.authority,f.reducer);assert.deepEqual(saved.state.teams.team.policy,policy);assert.deepEqual(saved.state.teams.team.model_inventory,inventory);assert.deepEqual(saved.state.teams.team.strength_check.native_inspections,[]);
 const expired=f.ok(['refresh','team'],Date.parse(expiry));assert.equal(expired.calibration_renewed,false);const terminal=readAuthority(f.authority,f.reducer).state.teams.team;
 assert.equal(terminal.policy.expires_at,policy.expires_at);assert.deepEqual(terminal.policy,policy);assert.deepEqual(terminal.model_inventory,inventory);assert.deepEqual(terminal.strength_check.blockers,['native-calibration-expired-new-measurement-required']);assert.equal(terminal.candidate,null);assert.equal(terminal.review_candidate,null);assert.equal(existsSync(f.marker),false);
});
