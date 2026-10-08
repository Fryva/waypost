import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {protocolHostFixture} from './helpers/native-protocol-host.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {formatBoundedEditHead,promptFor} from '../scripts/team-implement-suite.mjs';
import * as integration from '../scripts/team-integration.mjs';

// Contract 29(b), slice 4: a participant with the waypost-bounded-edit gate
// executes in the calibration wire format on its own Host; the leader publishes.
const git=(cwd,...args)=>{const r=spawnSync('git',['-C',cwd,...args],{encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'t@t',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:'t@t'}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const identity={name:'Owner',email:'owner@example.com',date:'1791331200 +0000'};
const rejectsAsync=(fn,code)=>assert.rejects(fn,error=>{assert.equal(error.code??error.message,code);return true;});
const criteria=['sum returns a+b'];
const manifestFor=(base,executor,patch={})=>({protocol:2,goal:'Fix sum',criteria,criteria_digest:routingDigest(criteria),paths:['src/sum.js'],base,forbidden_actions:[],executor_participant:executor,...patch});
async function calibrated(t,{workAnswer,content='export const sum=(a,b)=>a-b;\n'}={}){
 const f=await protocolHostFixture(t,{roles:['coordinate','review','implement'],...(workAnswer?{workAnswer}:{})});
 git(f.root,'init','-q');mkdirSync(join(f.root,'src'));writeFileSync(join(f.root,'src/sum.js'),content);git(f.root,'add','src/sum.js');git(f.root,'commit','-q','-m','base');
 const base=git(f.root,'rev-parse','HEAD');
 const ack=await f.host.acknowledgeProtocolLeadership({actionId:'leader',nonce:'leader',estimateTokens:'40'});assert.equal(ack.leader_acknowledged,true,ack.action_blocker);
 const allocation=f.load().state.subscription_allocations[routingDigest(f.unit)];
 f.host.enableNativeWork({revision:1,policy:{kind:'protocol-work',executor:'calibrated-bounded-edit',allow_unknown_quota:true,max_attempts:2,timeout_ms:1000,expires_at:f.expiry,ceilings:{execution:{max_calls:3,max_estimate_tokens:'40'},review:{max_calls:2,max_estimate_tokens:'40'}},unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:'120',allocation_revision:allocation.revision}]}});
 const team=f.load().state.teams.team,critic=team.review_candidate,executor=Object.keys(team.participants).find(id=>![team.leader,critic].includes(id));
 return {...f,base,critic,executor,leader:team.leader};
}
const work=f=>f.load().state.teams.team.work['fix-sum'];

test('a calibrated executor runs the measured prompt on its own Host, a critic reviews and the leader publishes with the author trailers',async t=>{
 const f=await calibrated(t);
 assert.notEqual(f.executor,f.leader);
 const installed=f.host.installWorkManifest({workId:'fix-sum',manifest:manifestFor(f.base,f.executor)});
 assert.equal(installed.worker,f.executor);assert.equal(installed.label,'calibrated-bounded-edit');
 await rejectsAsync(()=>f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'}),'host-native-work-executor-endpoint-required');
 const executorHost=f.hostFor(f.executor),run=await executorHost.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});
 assert.equal(run.status,'sealed',JSON.stringify(run));
 const sent=f.prompts.filter(p=>p.purpose==='protocol-work').at(-1).prompt;
 assert.equal(sent,promptFor({goal:'Fix sum',criteria,assigned:[{path:'src/sum.js',content:'export const sum=(a,b)=>a-b;\n'}],context:[]}));
 assert.ok(sent.startsWith(formatBoundedEditHead()+'\n'));
 executorHost.captureNativeWork({workId:'fix-sum'});
 assert.equal(work(f).supervision.mode,'calibrated-bounded-edit-deterministic');
 const r=await f.hostFor(f.critic).reviewNativeWork({workId:'fix-sum',estimateTokens:'40'});assert.equal(r.work_review_captured,true,JSON.stringify(r));
 assert.throws(()=>f.host.reviseNativeWork({workId:'fix-sum',reason:'again'}),/native-work-calibrated-revision-unsupported/);
 const published=await f.host.publishNativeWork({workId:'fix-sum',message:'Fix sum',story:'WP-20/story-x',commitIdentity:identity});
 const w=work(f),body=git(f.root,'show','-s','--format=%B',published.commit).split('\n');
 assert.equal(w.status,'integrated');
 for(const line of ['Waypost-Label: calibrated-bounded-edit','Waypost-Contributors: '+[f.executor,f.leader,f.critic].join(', ')])assert.ok(body.includes(line),line);
});

for(const [name,answer,failure] of [['a scope refusal',()=>'{"refusal":"scope-amendment-required"}','native-work-scope-amendment-required'],['a write outside the assigned paths',()=>JSON.stringify({files:[{path:'src/other.js',content:'x\n'}]}),'native-work-unassigned-path'],['an answer over 8 KiB',()=>JSON.stringify({files:[{path:'src/sum.js',content:'x'.repeat(8200)}]}),'native-work-answer-too-large']])test(name+' settles as a named outcome and the work waits for an owner cancel',async t=>{
 const f=await calibrated(t,{workAnswer:answer});
 f.host.installWorkManifest({workId:'fix-sum',manifest:manifestFor(f.base,f.executor)});
 const executorHost=f.hostFor(f.executor),run=await executorHost.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});
 assert.equal(run.status,'execution-refused');assert.equal(run.dispatch.failure,failure);assert.equal(run.actual_tokens!==null,true);
 await rejectsAsync(()=>executorHost.executeNativeWork({workId:'fix-sum',estimateTokens:'40'}),'host-native-work-not-dispatchable');
 assert.equal(f.host.cancelNativeWork({workId:'fix-sum',reason:'refused'}).cancelled,'fix-sum');
});

test('a missing final newline is added as the gate graded it, so the sealed file keeps its LF',async t=>{
 const f=await calibrated(t,{workAnswer:()=>JSON.stringify({files:[{path:'src/sum.js',content:'export const sum=(a,b)=>a+b;'}]})});
 f.host.installWorkManifest({workId:'fix-sum',manifest:manifestFor(f.base,f.executor)});
 const run=await f.hostFor(f.executor).executeNativeWork({workId:'fix-sum',estimateTokens:'40'});
 assert.equal(run.status,'sealed');
 assert.deepEqual(integration.readSealedPatch({projectRoot:f.root,ref:run.dispatch.patch_ref}).files,[{path:'src/sum.js',content:'export const sum=(a,b)=>a+b;\n'}]);
});

for(const [name,content] of [['a tab','export const sum=(a,b)=>a-b;\t\n'],['no final newline','export const sum=(a,b)=>a-b;'],['a trailing space','export const sum=(a,b)=>a-b; \n'],['41 lines','x\n'.repeat(41)],['over 1.5 KiB','x'.repeat(1600)+'\n']])test('inputs outside the measured class ('+name+') are refused on the Host before any reservation',async t=>{
 const f=await calibrated(t,{content});
 f.host.installWorkManifest({workId:'fix-sum',manifest:manifestFor(f.base,f.executor)});
 const before=f.calls.length;
 await rejectsAsync(()=>f.hostFor(f.executor).executeNativeWork({workId:'fix-sum',estimateTokens:'40'}),'native-work-size-class-exceeded');
 assert.equal(f.calls.slice(before).includes('subscription-reserve-v2'),false);
});

test('a calibrated manifest is refused outside the measured class or for an executor without the gate',async t=>{
 const f=await calibrated(t);
 for(const [patch,code] of [[{forbidden_actions:['network']},/size-class-exceeded/],[{paths:['a.js','b.js','c.js']},/size-class-exceeded/],[{goal:'x'.repeat(601)},/size-class-exceeded/],[{goal:'Fix sum — now'},/size-class-exceeded/],[{criteria:['a','b','c'],criteria_digest:routingDigest(['a','b','c'])},/size-class-exceeded/],[{executor_participant:'nobody'},/ready-executor-required/]])
  assert.throws(()=>f.host.installWorkManifest({workId:'fix-sum',manifest:manifestFor(f.base,f.executor,patch)}),code,JSON.stringify(patch));
 const {executor_participant,...leaderBaseline}=manifestFor(f.base,f.executor);
 assert.throws(()=>f.host.installWorkManifest({workId:'fix-sum',manifest:leaderBaseline}),/command-fields|exact/);
 const allocation=f.load().state.subscription_allocations[routingDigest(f.unit)];
 f.host.enableNativeWork({revision:2,policy:{kind:'protocol-work',executor:'leader-baseline',allow_unknown_quota:true,max_attempts:2,timeout_ms:1000,expires_at:f.expiry,ceilings:{execution:{max_calls:3,max_estimate_tokens:'40'},review:{max_calls:2,max_estimate_tokens:'40'}},unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:'120',allocation_revision:allocation.revision}]}});
 assert.throws(()=>f.host.installWorkManifest({workId:'fix-sum',manifest:manifestFor(f.base,f.executor,{forbidden_actions:['network']})}),/command-fields|exact/);
});
