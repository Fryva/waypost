import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {protocolHostFixture} from './helpers/native-protocol-host.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {readWorkInputs,workInputsDigest} from '../scripts/team-integration.mjs';

// Contract 28, slice 7 (owner, 2026-10-11): the leader decomposes an owner goal from the listed files of a pinned base on its
// own Host; the owner reads the exact proposal and installs it whole; one work of it then runs as any other.
const git=(cwd,...args)=>{const r=spawnSync('git',['-C',cwd,...args],{encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'t@t',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:'t@t'}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const identity={name:'Owner',email:'owner@example.com',date:'1791331200 +0000'};
const goal='Make the sum correct and add a product';
const team=f=>f.load().state.teams.team;
async function planned(t,options={}){
 const f=await protocolHostFixture(t,{ownerAssigned:{executors:['peer-d']},...options});
 git(f.root,'init','-q');mkdirSync(join(f.root,'src'));
 writeFileSync(join(f.root,'src/sum.js'),'export const sum=(a,b)=>a-b;\n');writeFileSync(join(f.root,'secret.js'),'export const secret="not in the plan scope";\n');
 git(f.root,'add','src/sum.js','secret.js');git(f.root,'commit','-q','-m','base');
 const base=git(f.root,'rev-parse','HEAD');
 // A later commit changes the listed file: the leader must still see the pinned base.
 writeFileSync(join(f.root,'src/sum.js'),'export const sum=(a,b)=>"head moved";\n');git(f.root,'commit','-q','-am','head moved');
 const ack=await f.host.acknowledgeProtocolLeadership({actionId:'leader',nonce:'leader',estimateTokens:'40'});assert.equal(ack.leader_acknowledged,true,ack.action_blocker);
 const allocation=f.load().state.subscription_allocations[routingDigest(f.unit)];
 f.host.enableNativeWork({revision:1,policy:{kind:'protocol-work',executor:'owner-assigned',allow_unknown_quota:true,max_attempts:2,timeout_ms:1000,expires_at:f.expiry,ceilings:{execution:{max_calls:3,max_estimate_tokens:'40'},review:{max_calls:3,max_estimate_tokens:'40'},plan:{max_calls:4,max_estimate_tokens:'40'}},unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:options.cap||'300',allocation_revision:allocation.revision}]}});
 return {...f,base};
}
const ask=(f,over={})=>f.host.requestWorkPlan({planId:'p1',goal,base:f.base,scope:['src/sum.js','src/mul.js'],forbiddenActions:['network'],maxWorks:2,...over});
const answer=works=>JSON.stringify({works});
// The scope is sorted: index 0 is src/mul.js, index 1 is src/sum.js.
const good=answer([{goal:'Fix the sum',criteria:['sum returns a+b'],paths:[1]},{goal:'Add a product function',criteria:['mul returns a*b','mul is exported'],paths:[0]}]);
const planCall=(f,id='p1',nonce)=>f.host.planNativeWork({planId:id,estimateTokens:'40',...(nonce?{nonce}:{})});

test('the leader decomposes from the pinned listed files, the owner installs the exact proposal, and one work then publishes as any other',async t=>{
 const f=await planned(t),inputs=readWorkInputs({projectRoot:f.root,base:f.base,paths:['src/mul.js','src/sum.js']});
 f.options.planAnswer=()=>good;
 const asked=ask(f);assert.equal(asked.protected_actions_granted,false);
 const plan=()=>team(f).work_plans.p1;
 assert.equal(plan().inputs_digest,workInputsDigest(inputs),'the request pins the digest of the files read from the base');
 assert.equal(ask(f).unchanged,true,'a retry after a lost response finds the request');assert.throws(()=>ask(f,{goal:'other'}),/native-work-plan-already-exists/);
 assert.equal(plan().state,'requested');assert.equal(Object.keys(team(f).work).length,0);
 const r=await planCall(f);assert.equal(r.work_plan_captured,true,JSON.stringify(r));assert.equal(r.protected_actions_granted,false);assert.equal(r.work_plan.state,'proposed');
 const x=Object.values(f.load().state.subscription_invocations).find(i=>i.action?.kind==='protocol-work-plan'),req=x.action.request;
 assert.equal(x.participant,team(f).leader);assert.equal(req.inputs_digest,plan().inputs_digest);assert.equal(req.label,'owner-assigned-plan');assert.equal(x.control_policy_kind,'protocol-work-plan');
 const sent=f.prompts.find(p=>p.prompt.includes('Decompose one owner goal')).prompt,[head,suffix]=[sent.slice(0,sent.lastIndexOf('\n')),sent.slice(sent.lastIndexOf('\n')+1)];
 assert.deepEqual(JSON.parse(suffix),{base:f.base,files:[{path:'src/mul.js',content:null},{path:'src/sum.js',content:'export const sum=(a,b)=>a-b;\n'}].sort((a,b)=>a.path<b.path?-1:1)},'file contents from the base, listed paths only');
 assert.doesNotMatch(sent,/not in the plan scope|head moved/);assert.ok(head.includes('"index":1,"path":"src/sum.js"'));
 const p=plan();assert.equal(p.state,'proposed');assert.equal(p.proposal.checks.ok,true);assert.deepEqual(p.proposal.works.map(w=>w.resolved_paths),[['src/sum.js'],['src/mul.js']]);
 assert.equal(x.work_plan.digest,p.proposal.digest);assert.equal(x.work_plan.state,'proposed');
 assert.equal(Object.keys(team(f).work).length,0,'the capture grants nothing');
 await assert.rejects(()=>planCall(f),/native-work-plan-request-required/,'asked once per plan');
 assert.throws(()=>f.host.installWorkPlan({planId:'p1',digest:'d'.repeat(64),reason:'x'}),/native-work-plan-digest-mismatch/);
 const done=f.host.installWorkPlan({planId:'p1',digest:p.proposal.digest,reason:'reviewed the exact plan'});
 assert.deepEqual(done.installed.map(w=>w.work),['p1-1','p1-2']);assert.equal(f.host.installWorkPlan({planId:'p1',digest:p.proposal.digest,reason:'again'}).unchanged,true);
 const w1=team(f).work['p1-1'],w2=team(f).work['p1-2'];
 assert.equal(w1.worker,'peer-d');assert.equal(w1.plan.plan_id,'p1');assert.equal(w1.plan.proposal_digest,p.proposal.digest);assert.deepEqual(w1.manifest.paths,['src/sum.js']);assert.deepEqual(w2.manifest.paths,['src/mul.js']);assert.equal(w1.manifest.base,f.base);assert.deepEqual(w1.manifest.forbidden_actions,['network']);
 await f.hostFor('peer-d').executeNativeWork({workId:'p1-1',estimateTokens:'40'});f.hostFor('peer-d').captureNativeWork({workId:'p1-1'});
 const rev=await f.hostFor('peer-b').reviewNativeWork({workId:'p1-1',estimateTokens:'40'});assert.equal(rev.work_review_captured,true,JSON.stringify(rev));
 const pub=await f.host.publishNativeWork({workId:'p1-1',message:'Fix sum',story:'WP-20/story-x',commitIdentity:identity});
 assert.equal(team(f).work['p1-1'].status,'integrated');assert.equal(pub.commit,team(f).work['p1-1'].commit);assert.equal(team(f).work['p1-2'].status,'manifest','the other work of the plan is untouched');
});
test('a plan the whole-plan checks refuse is kept with its named codes and cannot be installed; a refusal is kept too',async t=>{
 const f=await planned(t);
 f.options.planAnswer=()=>answer([{goal:'a',criteria:['c'],paths:[0,1]},{goal:'b',criteria:['c'],paths:[1,7]},{goal:'c',criteria:['c'],paths:[0]}]);
 ask(f,{maxWorks:2});const r=await planCall(f);
 assert.equal(r.work_plan.state,'rejected');
 const p=team(f).work_plans.p1;assert.equal(p.state,'rejected');assert.deepEqual(p.proposal.checks.codes,['native-work-plan-path-outside-scope','native-work-plan-path-overlap','native-work-plan-too-many-works']);assert.equal(p.proposal.checks.ok,false);
 assert.throws(()=>f.host.installWorkPlan({planId:'p1',digest:p.proposal.digest,reason:'x'}),/native-work-plan-proposal-required/);assert.equal(Object.keys(team(f).work).length,0);
 f.options.planAnswer=()=>JSON.stringify({refusals:['the goal needs a design decision first']});
 ask(f,{planId:'p2'});const q=await planCall(f,'p2');assert.equal(q.work_plan.state,'refused');
 assert.deepEqual(team(f).work_plans.p2.proposal.refusals,['the goal needs a design decision first']);assert.equal(team(f).work_plans.p2.proposal.works,undefined);
 f.options.planAnswer=()=>answer([{goal:'fix'+String.fromCharCode(0x202e)+'sum',criteria:['c'],paths:[0]}]);
 ask(f,{planId:'p3'});const bad=await planCall(f,'p3');
 assert.equal(bad.work_plan_captured,false,'a malformed answer is not captured');assert.equal(team(f).work_plans.p3.state,'requested');assert.equal(team(f).work_plans.p3.proposal,undefined);
 f.options.planAnswer=()=>'{}';ask(f,{planId:'p4'});assert.equal((await planCall(f,'p4')).work_plan_captured,false);
});
test('only the current confirmed leader asks, and only after the owner opened a request within a plan ceiling',async t=>{
 const f=await planned(t);f.options.planAnswer=()=>good;
 await assert.rejects(()=>planCall(f),/native-work-plan-request-required/,'no request yet');
 ask(f);
 await assert.rejects(()=>f.hostFor('peer-b').planNativeWork({planId:'p1',estimateTokens:'40'}),/host-native-work-plan-leader-endpoint-required/,'another participant is not asked');
 assert.throws(()=>ask(f,{planId:'p9',scope:['src/sum.js','../x']}),/invalid-path/);
 assert.throws(()=>ask(f,{planId:'p9',base:'f'.repeat(40)}),/integration-git-failed|work-input-base-commit-required/,'the base must be a commit of this repository');
 assert.throws(()=>ask(f,{planId:'p9',scope:['src']}),/work-input-plain-file-required/,'a listed path is a file, not a tree');
 const big='x'.repeat(30000);writeFileSync(join(f.root,'big1.js'),big);writeFileSync(join(f.root,'big2.js'),big);git(f.root,'add','big1.js','big2.js');git(f.root,'commit','-q','-m','big');
 assert.throws(()=>ask(f,{planId:'p9',base:git(f.root,'rev-parse','HEAD'),scope:['big1.js','big2.js']}),/work-input-too-large/,'inputs over the work limit are refused');
 assert.equal(Object.keys(team(f).work_plans).length,1);
});
test('a proposal whose work could not be reviewed is refused at install, and nothing is installed',async t=>{
 const f=await planned(t);
 writeFileSync(join(f.root,'big.js'),'y'.repeat(30000));git(f.root,'add','big.js');git(f.root,'commit','-q','-m','a large file');
 f.options.planAnswer=()=>answer([{goal:'a',criteria:['c'],paths:[0]},{goal:'b',criteria:['c'],paths:[1]}]);
 ask(f,{base:git(f.root,'rev-parse','HEAD'),scope:['big.js','src/sum.js'],maxWorks:2});
 const r=await planCall(f);assert.equal(r.work_plan.state,'proposed');
 const p=team(f).work_plans.p1;
 assert.throws(()=>f.host.installWorkPlan({planId:'p1',digest:p.proposal.digest,reason:'x'}),/native-work-plan-review-prompt-would-not-fit/);
 assert.equal(Object.keys(team(f).work).length,0);assert.equal(team(f).work_plans.p1.state,'proposed');
});
test('the plan call shares the per-unit token cap with execution and review, and has its own call ceiling',async t=>{
 const f=await planned(t,{cap:'60'});f.options.planAnswer=()=>good;
 ask(f);assert.equal((await planCall(f)).work_plan.state,'proposed');
 const p=team(f).work_plans.p1;f.host.installWorkPlan({planId:'p1',digest:p.proposal.digest,reason:'ok'});
 await assert.rejects(()=>f.hostFor('peer-d').executeNativeWork({workId:'p1-1',estimateTokens:'40'}),/native-work-owner-ceiling-exceeded/,'30 charged to the plan call + 40 reserved > 60');
 const g=await planned(t);g.options.planAnswer=()=>good;
 for(const id of ['a','b','c','d']){ask(g,{planId:id});await planCall(g,id);}
 ask(g,{planId:'e'});await assert.rejects(()=>planCall(g,'e'),/control-ceiling-exceeded/,'the fifth call is over the ceiling of four');
});
