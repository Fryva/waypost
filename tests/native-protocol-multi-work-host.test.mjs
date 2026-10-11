import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {protocolHostFixture} from './helpers/native-protocol-host.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';
import * as integration from '../scripts/team-integration.mjs';

const {treeDiff}=integration;
// WP-20, several protocol 2 works (owner decisions 2026-10-11): dependent work is built from a published commit,
// and works on separate paths run side by side.
const git=(cwd,...args)=>{const r=spawnSync('git',['-C',cwd,...args],{encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'t@t',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:'t@t'}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const owner='owner:'+createHash('sha256').update('fixture-owner-token-'.repeat(4)).digest('hex');
const identity={name:'Owner',email:'owner@example.com',date:'1791331200 +0000'};
async function fixture(t,options={}){
 const f=await protocolHostFixture(t,options);
 git(f.root,'init','-q');mkdirSync(join(f.root,'src'));writeFileSync(join(f.root,'src/sum.js'),'export const sum=(a,b)=>a-b;\n');for(const n of ['c','x1','x2','x3'])writeFileSync(join(f.root,'src/'+n+'.js'),'export const '+n+'=1;\n');git(f.root,'add','src');git(f.root,'commit','-q','-m','base');
 const base=git(f.root,'rev-parse','HEAD'),head=base;
 const ack=await f.host.acknowledgeProtocolLeadership({actionId:'leader',nonce:'leader',estimateTokens:'40'});assert.equal(ack.leader_acknowledged,true,ack.action_blocker);
 const allocation=f.load().state.subscription_allocations[routingDigest(f.unit)];
 f.host.enableNativeWork({revision:1,policy:{kind:'protocol-work',executor:'leader-baseline',allow_unknown_quota:true,max_attempts:2,timeout_ms:1000,expires_at:f.expiry,ceilings:{execution:{max_calls:6,max_estimate_tokens:'400'},review:{max_calls:6,max_estimate_tokens:'400'}},unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:options.workMaxTokens||'400',allocation_revision:allocation.revision}]}});
 return {...f,base,head};
}
const criteria=['c'];
const install=(f,workId,paths,base,extra={})=>f.host.installWorkManifest({workId,manifest:{protocol:2,goal:'GOAL-'+workId,criteria,criteria_digest:routingDigest(criteria),paths,base,forbidden_actions:[],...extra}});
const work=(f,id)=>f.load().state.teams.team.work[id];
const publish=(f,workId)=>f.host.publishNativeWork({workId,message:'Work '+workId,story:'WP-20/story-x',commitIdentity:identity});
const reviewOf=async(f,workId)=>{const critic=f.load().state.teams.team.review_candidate,r=await f.hostFor(critic).reviewNativeWork({workId,estimateTokens:'40'});assert.equal(r.work_review_captured,true,JSON.stringify(r));};
// Execution, capture, review and publication of one installed work, as the leader and the critic Hosts.
async function finish(f,workId){
 assert.equal((await f.host.executeNativeWork({workId,estimateTokens:'40'})).status,'sealed');f.host.captureNativeWork({workId});
 await reviewOf(f,workId);
 return publish(f,workId);
}
// Answers by the goal marker in the prompt: A makes the sum add, B appends a comment to what A published, others rewrite their own file.
const answers=prompt=>{const id=/GOAL-([a-z0-9]+)/.exec(prompt)[1];return JSON.stringify({files:[id==='b'?{path:'src/sum.js',content:'export const sum=(a,b)=>a+b;\n// by B\n'}:id==='a'?{path:'src/sum.js',content:'export const sum=(a,b)=>a+b;\n'}:{path:'src/'+id+'.js',content:'export const '+id+'=2;\n'}]});};
const close=f=>{const v=f.load();return reduceTeamEvent(structuredClone(v.state),{type:'close-v1',team:'team',actor:owner,at:new Date().toISOString(),request_key:'close-'+Math.random()},{revision:v.revision});};
const codeOf=(promise,code)=>assert.rejects(promise,error=>{assert.equal(error.code??error.message,code);return true;});
const throwsCode=(fn,code)=>assert.throws(fn,error=>{assert.equal(error.code??error.message,code);return true;});

test('a work that depends on a published one is built from its commit on a private ref, and the owner HEAD stays where it was',async t=>{
 const f=await fixture(t,{workAnswer:answers});
 install(f,'a',['src/sum.js'],f.base);const pa=await finish(f,'a'),commitA=work(f,'a').commit;assert.equal(pa.commit,commitA);
 // The reducer, not the Host, checks the base: the dependency is integrated, so B is accepted from its commit only.
 assert.throws(()=>install(f,'b',['src/sum.js'],f.base,{depends_on:['a']}),/native-work-dependency-base-required/);
 install(f,'b',['src/sum.js'],commitA,{depends_on:['a']});assert.deepEqual(work(f,'b').manifest.depends_on,['a']);
 const begin=f.prompts.length;
 assert.equal((await f.host.executeNativeWork({workId:'b',estimateTokens:'40'})).status,'sealed');
 const prompt=f.prompts.slice(begin).find(p=>p.prompt.includes('GOAL-b')).prompt;assert.ok(prompt.includes('a+b'),'the prompt of B carries the content A published');assert.equal(prompt.includes('a-b'),false);
 f.host.captureNativeWork({workId:'b'});
 const w=work(f,'b'),checkout=join(f.root,'authority','integrations','team','b','checkout');
 assert.equal(w.result.base,commitA);assert.equal(git(checkout,'rev-parse','HEAD'),commitA,'the checkout of B starts at the commit of A');
 const diff=treeDiff({projectRoot:f.root,base:w.result.base,tree:w.result.tree});assert.ok(diff.includes('+// by B'));assert.equal(diff.includes('a-b'),false,'the diff shows only the change of B');
 await reviewOf(f,'b');
 const pb=await publish(f,'b'),x=f.load().state.teams.team.native_integration;
 assert.equal(work(f,'b').status,'integrated');assert.equal(git(f.root,'show','-s','--format=%P',pb.commit),commitA);
 git(f.root,'merge-base','--is-ancestor',commitA,pb.commit);assert.equal(git(f.root,'rev-parse',x.checkout_ref),pb.commit);
 assert.equal(git(f.root,'rev-parse','HEAD'),f.head,'the owner HEAD is untouched');assert.equal(git(f.root,'status','--porcelain','--','src'),'');
 assert.equal(close(f).result.closed,'team');
});

// Step 2 (owner decision 2026-10-11): several unfinished works whose paths do not overlap.
test('two works on separate paths alternate until publication, each on its own checkout and private ref from the base of the owner',async t=>{
 const f=await fixture(t,{workAnswer:answers});
 install(f,'a',['src/sum.js'],f.base);install(f,'c',['src/c.js'],f.base);
 assert.throws(()=>install(f,'dup',['src/sum.js'],f.base),/native-work-path-overlap/);assert.throws(()=>install(f,'dir',['src'],f.base),/native-work-path-overlap/);
 assert.equal((await f.host.executeNativeWork({workId:'a',estimateTokens:'40'})).status,'sealed');assert.equal((await f.host.executeNativeWork({workId:'c',estimateTokens:'40'})).status,'sealed');
 f.host.captureNativeWork({workId:'c'});f.host.captureNativeWork({workId:'a'});
 await reviewOf(f,'c');await reviewOf(f,'a');
 assert.deepEqual([work(f,'a').status,work(f,'c').status],['approved','approved']);
 const pa=await publish(f,'a'),pc=await publish(f,'c');
 assert.notEqual(pa.ref,pc.ref);assert.equal(git(f.root,'rev-parse',pa.ref),pa.commit);assert.equal(git(f.root,'rev-parse',pc.ref),pc.commit);
 for(const p of [pa,pc])assert.equal(git(f.root,'show','-s','--format=%P',p.commit),f.base,'both are built from the base of the owner');
 assert.equal(git(f.root,'show',pa.commit+':src/c.js'),'export const c=1;','A does not carry the change of C');assert.equal(git(f.root,'rev-parse','HEAD'),f.head);
 assert.equal(close(f).result.closed,'team');
});
test('publications go one at a time: another work cannot publish while a reservation is prepared, and both publish once it resumes',async t=>{
 const f=await fixture(t,{workAnswer:answers,interruptStart:true});
 install(f,'a',['src/sum.js'],f.base);install(f,'c',['src/c.js'],f.base);
 for(const id of ['a','c']){await f.host.executeNativeWork({workId:id,estimateTokens:'40'});f.host.captureNativeWork({workId:id});await reviewOf(f,id);}
 await assert.rejects(publish(f,'a'),/fixture interrupted publication start/);
 const x=f.load().state.teams.team.native_integration;assert.equal(x.state,'prepared');assert.equal(x.work_id,'a');
 const before=f.calls.length;
 await assert.rejects(publish(f,'c'),error=>{assert.equal(error.code,'host-native-publication-other-work-reserved');assert.equal(error.reservation_id,x.id);assert.equal(error.work_id,'a');return true;});
 assert.equal(f.calls.slice(before).includes('native-integration-prepare-v2'),false);assert.equal(f.load().state.teams.team.native_integration.id,x.id);
 assert.equal((await publish(f,'a')).integrated,'a');assert.equal(work(f,'a').status,'integrated');
 assert.equal((await publish(f,'c')).integrated,'c');assert.equal(close(f).result.closed,'team');
});
test('while a publication fence is held, execute, capture, review and a new manifest of another work are refused without any authority write',async t=>{
 let fault='after-ref';
 const f=await fixture(t,{workAnswer:answers,integration:{publishWorkCommit:options=>integration.publishWorkCommit({...options,fault:at=>{if(at===fault){fault=null;throw Error('fixture interrupted publication');}}})}});
 for(const [id,file] of [['a','sum'],['x1','x1'],['x2','x2'],['x3','x3']])install(f,id,['src/'+file+'.js'],f.base);
 for(const id of ['a','x2','x3'])await f.host.executeNativeWork({workId:id,estimateTokens:'40'});
 for(const id of ['a','x3'])f.host.captureNativeWork({workId:id});
 await reviewOf(f,'a');
 await assert.rejects(publish(f,'a'),/fixture interrupted publication/);
 assert.equal(f.load().state.publication_fence.team,'team');
 const critic=f.load().state.teams.team.review_candidate,revision=f.load().revision,begin=f.calls.length;
 await codeOf(f.host.executeNativeWork({workId:'x1',estimateTokens:'40'}),'host-native-publication-fence-held');
 throwsCode(()=>f.host.captureNativeWork({workId:'x2'}),'host-native-publication-fence-held');
 await codeOf(f.hostFor(critic).reviewNativeWork({workId:'x3',estimateTokens:'40'}),'host-native-publication-fence-held');
 throwsCode(()=>install(f,'x4',['src/x4.js'],f.base),'host-native-publication-fence-held');
 assert.deepEqual(f.calls.slice(begin),[],'nothing reached the authority or a native process');assert.equal(f.load().revision,revision);assert.equal(f.load().state.deferred_commands,undefined);
 f.host.recoverNativePublication({gitChildStopped:true});assert.equal(work(f,'a').status,'integrated');assert.equal(f.load().state.publication_fence,undefined);
 // The refused steps now continue.
 f.host.captureNativeWork({workId:'x2'});assert.equal((await f.host.executeNativeWork({workId:'x1',estimateTokens:'40'})).status,'sealed');await reviewOf(f,'x3');assert.equal(work(f,'x3').status,'approved');
});
test('the token ceiling is shared by the works of a policy revision: a second work stops at it',async t=>{
 const f=await fixture(t,{workAnswer:answers,workMaxTokens:'80'});
 install(f,'a',['src/sum.js'],f.base);install(f,'c',['src/c.js'],f.base);
 await f.host.executeNativeWork({workId:'a',estimateTokens:'40'});f.host.captureNativeWork({workId:'a'});await reviewOf(f,'a');
 // 25 (execution) + 30 (review) of A, so the 40 of C exceed the cap of 80.
 await codeOf(f.host.executeNativeWork({workId:'c',estimateTokens:'40'}),'native-work-owner-ceiling-exceeded');
 assert.equal(work(f,'c').status,'manifest');
});
