import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {protocolHostFixture} from './helpers/native-protocol-host.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';
import {treeDiff} from '../scripts/team-integration.mjs';

// WP-20, several protocol 2 works (owner decisions 2026-10-11): dependent work is built from a published commit.
const git=(cwd,...args)=>{const r=spawnSync('git',['-C',cwd,...args],{encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'t@t',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:'t@t'}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const owner='owner:'+createHash('sha256').update('fixture-owner-token-'.repeat(4)).digest('hex');
const identity={name:'Owner',email:'owner@example.com',date:'1791331200 +0000'};
async function fixture(t,options={}){
 const f=await protocolHostFixture(t,options);
 git(f.root,'init','-q');mkdirSync(join(f.root,'src'));writeFileSync(join(f.root,'src/sum.js'),'export const sum=(a,b)=>a-b;\n');git(f.root,'add','src/sum.js');git(f.root,'commit','-q','-m','base');
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
// Execution, capture, review and publication of one installed work, as the leader and the critic Hosts.
async function finish(f,workId){
 assert.equal((await f.host.executeNativeWork({workId,estimateTokens:'40'})).status,'sealed');f.host.captureNativeWork({workId});
 const critic=f.load().state.teams.team.review_candidate,r=await f.hostFor(critic).reviewNativeWork({workId,estimateTokens:'40'});assert.equal(r.work_review_captured,true,JSON.stringify(r));
 return publish(f,workId);
}
// Answers by the goal marker in the prompt: A makes the sum add, B appends a comment to what A published.
const answers=prompt=>JSON.stringify({files:[prompt.includes('GOAL-b')?{path:'src/sum.js',content:'export const sum=(a,b)=>a+b;\n// by B\n'}:{path:'src/sum.js',content:'export const sum=(a,b)=>a+b;\n'}]});
const close=f=>{const v=f.load();return reduceTeamEvent(structuredClone(v.state),{type:'close-v1',team:'team',actor:owner,at:new Date().toISOString(),request_key:'close-'+Math.random()},{revision:v.revision});};

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
 const critic=f.load().state.teams.team.review_candidate,r=await f.hostFor(critic).reviewNativeWork({workId:'b',estimateTokens:'40'});assert.equal(r.work_review_captured,true,JSON.stringify(r));
 const pb=await publish(f,'b'),x=f.load().state.teams.team.native_integration;
 assert.equal(work(f,'b').status,'integrated');assert.equal(git(f.root,'show','-s','--format=%P',pb.commit),commitA);
 git(f.root,'merge-base','--is-ancestor',commitA,pb.commit);assert.equal(git(f.root,'rev-parse',x.checkout_ref),pb.commit);
 assert.equal(git(f.root,'rev-parse','HEAD'),f.head,'the owner HEAD is untouched');assert.equal(git(f.root,'status','--porcelain','--','src'),'');
 assert.equal(close(f).result.closed,'team');
});
