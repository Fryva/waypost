// Children spawned from this file never move a developer's real machine state.
import "./env.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {authorityFixture,now,at,expiry} from './helpers/native-calibration.mjs';
import {protocolHostFixture} from './helpers/native-protocol-host.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {formatWorkPromptHead,workPromptDigest} from '../scripts/team-native-work.mjs';
import {selectWorkReviewer,workReviewTarget} from '../scripts/team-native-work-review.mjs';
import {addsHiddenControls} from '../scripts/team-integration.mjs';

// ADR owner-assigned-team-roles, slice 3: the executor the owner listed runs the work on its own Host.
const legacy={protocol:1,revision:1,domain:'coding',mode:'automatic',generated_at:at,expires_at:expiry,sources:[{id:'fixture',url:'https://example.org/fixture',retrieved_at:at}],evidence_floor:['adapter-observed'],profiles:[]};
const until=new Date(now+86400000).toISOString(),clone=structuredClone;
let shared,sharedCalibrated;
async function team(executors=['peer-d']){
 shared??=authorityFixture({identityOnly:{}});const f=await shared,s=clone(f.state);
 Object.assign(s,{protocol:1,owner_hash:'fixture',task_bindings:{task:'team'}});Object.assign(s.teams.team,{task:'task',policy:legacy,messages:[],work:{},status:'forming',leader:null,candidate:null,required_review_models:[],native_policy_bootstrap:true});
 const state=reduceTeamEvent(s,{type:'native-policy-assign-v2',team:'team',actor:'owner:fixture',at,request_key:'assign',expected_policy_revision:1,coordinator:['peer-a'],reviewers:['peer-b','peer-c'],executors,reason:'the owner chose these roles',expires_at:until,issued_by:{harness:'claude',session:'session-1'}}).state,t=state.teams.team;
 t.leader=t.candidate;t.candidate=null;t.status='active';
 return {state,unit:Object.keys(state.subscription_allocations)[0]};
}
const send=(state,type,fields={},actor='owner:fixture')=>reduceTeamEvent(state,{type,team:'team',actor,at,request_key:type+'-'+Math.random(),epoch:state.teams.team.epoch,...fields});
const workPolicy=(unit,state,patch={})=>({kind:'protocol-work',executor:'owner-assigned',allow_unknown_quota:true,max_attempts:2,timeout_ms:60000,expires_at:until,ceilings:{execution:{max_calls:2,max_estimate_tokens:'8000'},review:{max_calls:2,max_estimate_tokens:'8000'}},unit_allocations:[{unit_digest:unit,max_tokens:'50000',allocation_revision:state.subscription_allocations[unit].revision}],...patch});
const criteria=['The function returns the sum'];
const manifest=(patch={})=>({protocol:2,goal:'Fix the sum function',criteria,criteria_digest:routingDigest(criteria),paths:['src/sum.js'],base:'a'.repeat(40),forbidden_actions:[],...patch});
async function enabled(executors){const {state,unit}=await team(executors);return {state:send(state,'native-work-enable-v2',{revision:1,policy:workPolicy(unit,state)}).state,unit};}
const install=(state,id,m)=>send(state,'native-work-manifest-v2',{work_id:id,manifest:m}).state.teams.team.work[id];

test('an owner-assigned team accepts only the owner-assigned executor, and no other team accepts it',async()=>{
 const {state,unit}=await team();
 for(const executor of ['leader-baseline','calibrated-bounded-edit'])assert.throws(()=>send(state,'native-work-enable-v2',{revision:1,policy:workPolicy(unit,state,{executor})}),/native-work-executor-mode-mismatch/,executor);
 assert.equal(send(state,'native-work-enable-v2',{revision:1,policy:workPolicy(unit,state)}).result.enabled,true);
 sharedCalibrated??=authorityFixture();const f=await sharedCalibrated,s=clone(f.state);
 Object.assign(s,{protocol:1,owner_hash:'fixture',task_bindings:{task:'team'}});Object.assign(s.teams.team,{task:'task',policy:legacy,messages:[],work:{},status:'forming',leader:null,candidate:null,required_review_models:[],native_policy_bootstrap:true});
 const calibrated=reduceTeamEvent(s,{type:'native-policy-install-v2',team:'team',actor:'owner:fixture',at,request_key:'install',cohort_id:'cohort',expected_policy_revision:1,scope:'waypost-protocol'},{revision:f.revision}).state,cu=Object.keys(calibrated.subscription_allocations)[0];
 calibrated.teams.team.leader=calibrated.teams.team.candidate;calibrated.teams.team.candidate=null;calibrated.teams.team.status='active';
 assert.throws(()=>send(calibrated,'native-work-enable-v2',{revision:1,policy:workPolicy(cu,calibrated,{expires_at:expiry})}),/native-work-executor-mode-mismatch/);
});
test('the executor is one the owner listed; without a name the first fit one in the owner order is picked',async()=>{
 const {state}=await enabled(['peer-d']);
 for(const [name,code] of [['peer-b',/owner-assigned-executor-required/],['peer-a',/owner-assigned-executor-required/],['nobody',/ready-executor-required/]])assert.throws(()=>install(state,'w1',manifest({executor_participant:name})),code,name);
 const named=install(state,'w1',manifest({executor_participant:'peer-d'}));
 assert.equal(named.worker,'peer-d');assert.equal(named.executor,'owner-assigned');assert.equal(named.label,'owner-assigned-unmeasured');assert.equal(named.assignment,undefined);
 assert.equal(install(state,'w1',manifest()).worker,'peer-d');
 const first=install((await enabled(['peer-c','peer-d'])).state,'w1',manifest());assert.equal(first.worker,'peer-c');assert.deepEqual(first.assignment,{mode:'owner-order',candidates:['peer-c','peer-d']});
 assert.equal(install((await enabled(['peer-d','peer-c'])).state,'w1',manifest()).worker,'peer-d');
 const busy=(await enabled(['peer-c','peer-d'])).state;busy.teams.team.participants['peer-c'].availability='busy';
 assert.deepEqual(install(busy,'w1',manifest()).assignment.candidates,['peer-d']);
 const none=(await enabled(['peer-c'])).state;none.teams.team.participants['peer-c'].availability='busy';assert.throws(()=>install(none,'w1',manifest()),/no-eligible-executor/);
});
test('without a named executor the pick works when every reviewer shares the leader configuration (live run 2026-10-11)',async()=>{
 const {state}=await enabled(['peer-d']),t=state.teams.team,row=id=>t.policy.profiles.find(r=>r.participant===id);
 for(const id of ['peer-b','peer-c']){row(id).identity=clone(row('peer-a').identity);t.participants[id].native_admission.identity=clone(row('peer-a').identity);}
 const w=install(state,'w1',manifest());assert.equal(w.worker,'peer-d');assert.deepEqual(w.assignment,{mode:'owner-order',candidates:['peer-d']});
});
test('a work larger than the measured class is accepted: several paths, a free forbidden list and a long goal',async()=>{
 const {state}=await enabled(),big=manifest({paths:['a.js','b.js','c/d.js'],forbidden_actions:['network','write outside the paths'],goal:'Fix the sum function — café. '.repeat(100),criteria:['a','b','c'],criteria_digest:routingDigest(['a','b','c']),executor_participant:'peer-d'});
 assert.equal(install(state,'w1',big).label,'owner-assigned-unmeasured');
 assert.throws(()=>install(state,'w1',{...big,paths:Array.from({length:65},(_,i)=>'f'+i+'.js')}),/native-work-paths-required/);
});
test('the work reviewer is a listed reviewer: not the executor, not the leader, not the executor\'s configuration, but possibly the leader\'s',async()=>{
 const {state}=await enabled(),t=state.teams.team,w={worker:'peer-d'};
 assert.equal(selectWorkReviewer(t,w,now)?.id,'peer-b');
 const sameAsExecutor=clone(t),row=id=>sameAsExecutor.policy.profiles.find(r=>r.participant===id);
 row('peer-b').identity=clone(row('peer-d').identity);sameAsExecutor.participants['peer-b'].native_admission.identity=clone(row('peer-d').identity);
 assert.equal(selectWorkReviewer(sameAsExecutor,w,now)?.id,'peer-c','the executor\'s configuration is out');
 const sameAsLeader=clone(t),lrow=id=>sameAsLeader.policy.profiles.find(r=>r.participant===id);
 lrow('peer-b').identity=clone(lrow('peer-a').identity);sameAsLeader.participants['peer-b'].native_admission.identity=clone(lrow('peer-a').identity);
 assert.equal(selectWorkReviewer(sameAsLeader,w,now)?.id,'peer-b','the coordinator\'s configuration may review');
 const asReviewer=clone(t);assert.equal(selectWorkReviewer(asReviewer,{worker:'peer-b'},now)?.id,'peer-c','a reviewer who executes is not their own reviewer');
 const leaderRuns=clone(t);assert.equal(selectWorkReviewer(leaderRuns,{worker:'peer-a'},now)?.id,'peer-b');
 const gone=clone(t);gone.participants['peer-b'].availability='busy';assert.equal(selectWorkReviewer(gone,w,now),null,'a busy higher reviewer keeps the floor');
});
test('revise reopens an owner-assigned work for its pinned executor, and refuses a changed executor',async()=>{
 const {state}=await enabled(),w=install(state,'w1',manifest({executor_participant:'peer-d'})),findings=[{path:'src/sum.js',severity:'major',text:'wrong sign'}];
 const rejected=clone(state),t=rejected.teams.team;t.work.w1=clone(w);
 Object.assign(t.work.w1,{status:'changes-requested',result:{base:w.manifest.base,tree:'b'.repeat(40),paths:['src/sum.js'],candidate_digest:'c'.repeat(64),diff_digest:'d'.repeat(64),patch_digest:'e'.repeat(64),patch_ref:'refs/x',tests_digest:'f'.repeat(64),tests_status:'not-run'},attempts:1});
 t.native_work_reviews={[routingDigest(workReviewTarget(t.work.w1))]:{unresolved_negative:true,records:[{verdict:'changes-requested',generation:1,findings,invocation_id:'review-1'}]}};
 const revise=s=>send(s,'native-work-revise-v2',{work_id:'w1',generation:1,findings_digest:routingDigest(findings),reason:'again'});
 const r=revise(rejected);assert.equal(r.result.generation,2);assert.equal(r.state.teams.team.work.w1.status,'manifest');assert.equal(r.state.teams.team.work.w1.worker,'peer-d');
 const moved=clone(rejected);moved.teams.team.participants['peer-d'].incarnation='other';assert.throws(()=>revise(moved),/native-work-worker-identity-changed|native-work-owner-assigned-executor-required/);
});
test('the prompt head names the executor and the legacy and calibrated heads keep their bytes',()=>{
 const m=manifest(),rev={generation:2,findings:[]};
 assert.match(formatWorkPromptHead(m),/^You are the coordinator executing one bounded work item\. File/);
 assert.match(formatWorkPromptHead(m,rev),/^You are the coordinator executing one bounded work item again/);
 for(const head of [formatWorkPromptHead(m,undefined,'owner-assigned'),formatWorkPromptHead(m,rev,'owner-assigned')])assert.doesNotMatch(head,/coordinator executing/);
 assert.match(formatWorkPromptHead(m,undefined,'owner-assigned'),/^You are the assigned executor executing one bounded work item\. File/);
 const d='1'.repeat(64);
 assert.equal(workPromptDigest(m,d),routingDigest({template:1,head:formatWorkPromptHead(m),inputs_digest:d}));
 assert.equal(workPromptDigest(m,d,rev),routingDigest({template:2,head:formatWorkPromptHead(m,rev),inputs_digest:d}));
 assert.equal(workPromptDigest(m,d,undefined,'owner-assigned'),routingDigest({template:'owner-assigned-1',head:formatWorkPromptHead(m,undefined,'owner-assigned'),inputs_digest:d}));
 assert.equal(workPromptDigest(m,d,rev,'owner-assigned'),routingDigest({template:'owner-assigned-2',head:formatWorkPromptHead(m,rev,'owner-assigned'),inputs_digest:d}));
});
test('addsHiddenControls counts invisible and bidirectional characters against the base',()=>{
 assert.equal(addsHiddenControls(null,'plain\n'),false);
 for(const c of ['​','‏','‪','‮','⁠','⁤','⁦','⁩','﻿'])assert.equal(addsHiddenControls(null,'a'+c+'b'),true,c.codePointAt(0).toString(16));
 assert.equal(addsHiddenControls('x​y','x​y!'),false,'already in the base');
 assert.equal(addsHiddenControls('x​y','x​​y'),true,'one more than the base');
 assert.equal(addsHiddenControls('x​y','x‎y'),true,'a different character in place of the old one');
 assert.equal(addsHiddenControls('x​y','xy'),false,'removing one is fine');
 assert.equal(addsHiddenControls(null,'tab\tnewline\n é '),false);
});

// ---- On the executor's own Host.
const git=(cwd,...args)=>{const r=spawnSync('git',['-C',cwd,...args],{encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'t@t',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:'t@t'}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const rejectsAsync=(fn,code)=>assert.rejects(fn,error=>{assert.equal(error.code??error.message,code);return true;});
const hostManifest=(base,patch={})=>({protocol:2,goal:'Fix sum',criteria,criteria_digest:routingDigest(criteria),paths:['src/sum.js'],base,forbidden_actions:[],...patch});
async function owned(t,{workAnswer,content='export const sum=(a,b)=>a-b;\n'}={}){
 const f=await protocolHostFixture(t,{ownerAssigned:{executors:['peer-d']},...(workAnswer?{workAnswer}:{})});
 git(f.root,'init','-q');mkdirSync(join(f.root,'src'));writeFileSync(join(f.root,'src/sum.js'),content);git(f.root,'add','src/sum.js');git(f.root,'commit','-q','-m','base');
 const base=git(f.root,'rev-parse','HEAD');
 const ack=await f.host.acknowledgeProtocolLeadership({actionId:'leader',nonce:'leader',estimateTokens:'40'});assert.equal(ack.leader_acknowledged,true,ack.action_blocker);
 const allocation=f.load().state.subscription_allocations[routingDigest(f.unit)];
 f.host.enableNativeWork({revision:1,policy:{kind:'protocol-work',executor:'owner-assigned',allow_unknown_quota:true,max_attempts:2,timeout_ms:1000,expires_at:f.expiry,ceilings:{execution:{max_calls:3,max_estimate_tokens:'40'},review:{max_calls:2,max_estimate_tokens:'40'}},unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:'120',allocation_revision:allocation.revision}]}});
 return {...f,base};
}
const work=f=>f.load().state.teams.team.work['fix-sum'];

test('the listed executor runs a work outside the measured class on its own Host and the candidate is captured',async t=>{
 const f=await owned(t);
 const installed=f.host.installWorkManifest({workId:'fix-sum',manifest:hostManifest(f.base,{forbidden_actions:['network'],goal:'Fix sum — and keep café'})});
 assert.equal(installed.worker,'peer-d');assert.equal(installed.label,'owner-assigned-unmeasured');
 await rejectsAsync(()=>f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'}),'host-native-work-executor-endpoint-required');
 const executorHost=f.hostFor('peer-d'),run=await executorHost.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});
 assert.equal(run.status,'sealed',JSON.stringify(run));
 const sent=f.prompts.filter(p=>p.purpose==='protocol-work').at(-1).prompt;assert.match(sent,/^You are the assigned executor executing one bounded work item/);assert.doesNotMatch(sent,/coordinator/);
 const reserved=f.load().state.subscription_invocations,call=Object.values(reserved).find(x=>x.purpose==='work');assert.equal(call.participant,'peer-d');
 executorHost.captureNativeWork({workId:'fix-sum'});
 const w=work(f);assert.equal(w.status,'candidate');assert.equal(w.supervision.mode,'owner-assigned-deterministic');assert.ok(w.result.tree);
});
test('a work whose review prompt could not fit 64 KiB is refused before any reservation',async t=>{
 const f=await owned(t,{content:('x'.repeat(99)+'\n').repeat(300)});
 f.host.installWorkManifest({workId:'fix-sum',manifest:hostManifest(f.base)});
 const before=f.calls.length;
 await rejectsAsync(()=>f.hostFor('peer-d').executeNativeWork({workId:'fix-sum',estimateTokens:'40'}),'native-work-review-prompt-would-not-fit');
 assert.equal(f.calls.slice(before).includes('subscription-reserve-v2'),false);assert.equal(f.calls.includes('native-work'),false);
});
test('an executor that adds an invisible or bidirectional character is refused; one already in the base is not',async t=>{
 const f=await owned(t,{workAnswer:()=>JSON.stringify({files:[{path:'src/sum.js',content:'export const sum=(a,b)=>a+b;‮\n'}]})});
 f.host.installWorkManifest({workId:'fix-sum',manifest:hostManifest(f.base)});
 const run=await f.hostFor('peer-d').executeNativeWork({workId:'fix-sum',estimateTokens:'40'});
 assert.equal(run.status,'attempt-failed');assert.equal(run.dispatch.failure,'native-work-hidden-controls-added');assert.equal(run.actual_tokens!==null,true);
 const g=await owned(t,{content:'// a​b\nexport const sum=(a,b)=>a-b;\n',workAnswer:()=>JSON.stringify({files:[{path:'src/sum.js',content:'// a​b\nexport const sum=(a,b)=>a+b;\n'}]})});
 g.host.installWorkManifest({workId:'fix-sum',manifest:hostManifest(g.base)});
 assert.equal((await g.hostFor('peer-d').executeNativeWork({workId:'fix-sum',estimateTokens:'40'})).status,'sealed');
});
test('a dependent manifest works with a selected and with a named executor (owner decisions 2026-10-11)',async()=>{
 const {state}=await enabled(['peer-c','peer-d']),A='a1'.repeat(20),s=clone(state);
 s.teams.team.work.wa={protocol:2,id:'wa',status:'integrated',commit:A,manifest:{base:'f'.repeat(40)},integrated_evidence:{protocol:2,commit:A}};
 const picked=install(s,'w1',manifest({base:A,depends_on:['wa']})),named=install(s,'w2',manifest({base:A,depends_on:['wa'],executor_participant:'peer-d'}));
 assert.equal(picked.worker,'peer-c');assert.deepEqual(picked.manifest.depends_on,['wa']);assert.equal(picked.assignment.mode,'owner-order');
 assert.equal(named.worker,'peer-d');assert.equal(named.assignment,undefined);assert.deepEqual(named.manifest.depends_on,['wa']);
 assert.throws(()=>install(s,'w3',manifest({base:A,depends_on:[]})),/native-work-dependencies-invalid/);assert.throws(()=>install(s,'w3',manifest({depends_on:['wa']})),/native-work-dependency-base-required/);
});
