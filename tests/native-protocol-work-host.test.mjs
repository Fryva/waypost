import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {protocolHostFixture} from './helpers/native-protocol-host.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {readSealedPatch} from '../scripts/team-integration.mjs';

const git=(cwd,...args)=>{const r=spawnSync('git',['-C',cwd,...args],{encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'t@t',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:'t@t'}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
async function fixture(t,options={}){
 const f=await protocolHostFixture(t,options);
 git(f.root,'init','-q');mkdirSync(join(f.root,'src'));writeFileSync(join(f.root,'src/sum.js'),'export const sum=(a,b)=>a-b;\n');git(f.root,'add','src/sum.js');git(f.root,'commit','-q','-m','base');
 const base=git(f.root,'rev-parse','HEAD');
 const ack=await f.host.acknowledgeProtocolLeadership({actionId:'leader',nonce:'leader',estimateTokens:'40'});assert.equal(ack.leader_acknowledged,true,ack.action_blocker);
 const allocation=f.load().state.subscription_allocations[routingDigest(f.unit)];
 f.host.enableNativeWork({revision:1,policy:{kind:'protocol-work',executor:'leader-baseline',allow_unknown_quota:true,max_attempts:2,timeout_ms:1000,expires_at:f.expiry,ceilings:{execution:{max_calls:3,max_estimate_tokens:'40'},review:{max_calls:2,max_estimate_tokens:'40'}},unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:'80',allocation_revision:allocation.revision}]}});
 const criteria=['sum returns a+b'];
 f.host.installWorkManifest({workId:'fix-sum',manifest:{protocol:2,goal:'Fix sum',criteria,criteria_digest:routingDigest(criteria),paths:['src/sum.js'],base,forbidden_actions:['network']}});
 return {...f,base};
}
const work=f=>f.load().state.teams.team.work['fix-sum'];
test('the leader executes a manifest once in a fresh owned context and its validated patch is sealed as a private ref before settlement',async t=>{
 const f=await fixture(t),begin=f.calls.length,head=git(f.root,'rev-parse','HEAD');
 const r=await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});
 assert.equal(r.status,'sealed',JSON.stringify(r));assert.equal(r.protected_actions_granted,false);
 const calls=f.calls.slice(begin);assert.equal(calls.filter(c=>c==='native-work').length,1);assert.ok(calls.indexOf('subscription-consume-v2')<calls.indexOf('native-work'));
 const d=Object.values(work(f).dispatches)[0];assert.equal(d.state,'sealed');assert.deepEqual(d.paths,['src/sum.js']);
 const patch=readSealedPatch({projectRoot:f.root,ref:d.patch_ref});assert.equal(routingDigest(patch),d.patch_digest);assert.equal(patch.files[0].content,'export const sum=(a,b)=>a+b;\n');
 assert.equal(git(f.root,'rev-parse','HEAD'),head,'the project HEAD is untouched');assert.equal(git(f.root,'status','--porcelain','--','src'),'','the working tree is untouched');
 await assert.rejects(f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'}),/host-native-work-not-dispatchable/);
});
test('an invalid patch settles its tokens and fails the attempt with a named reason; a second attempt is allowed up to the ceiling',async t=>{
 let answer='not json';const f=await fixture(t,{workAnswer:()=>answer});
 const first=await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});assert.equal(first.status,'attempt-failed');assert.equal(first.dispatch.failure,'native-work-invalid-patch');
 assert.equal(Object.values(f.load().state.subscription_invocations).find(x=>x.purpose==='work').state,'settled');
 answer=JSON.stringify({files:[{path:'src/other.js',content:'x'}]});const second=await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});assert.equal(second.dispatch.failure,'native-work-invalid-patch','a path outside the manifest is refused');
 await assert.rejects(f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'}),/host-native-work-not-dispatchable/);
});
test('a lost execution is reconciled from its owned closure, fails the attempt, and the work can then be cancelled',async t=>{
 const f=await fixture(t,{failSend:(_created,invocation)=>invocation.purpose==='protocol-work'});
 await assert.rejects(f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'}),/native-outcome-uncertain/);
 const x=Object.values(f.load().state.subscription_invocations).find(y=>y.purpose==='work');assert.equal(x.state,'uncertain');assert.equal(work(f).status,'uncertain');
 assert.throws(()=>f.host.cancelNativeWork({workId:'fix-sum',reason:'lost'}),/reconciled-closure-required/);
 f.host.reconcileProtocolControl({invocationId:x.id});assert.equal(work(f).status,'attempt-failed');assert.equal(Object.values(work(f).dispatches)[0].state,'stopped');
 assert.equal(f.host.cancelNativeWork({workId:'fix-sum',reason:'lost'}).cancelled,'fix-sum');
});
test('a manifest path that differs only in case from a base file is refused before any native call',async t=>{
 const f=await fixture(t);
 // A case-insensitive file system cannot hold both names, so the colliding entry is written into the index directly.
 const blob=spawnSync('git',['-C',f.root,'hash-object','-w','--stdin'],{input:'x',encoding:'utf8'}).stdout.trim();git(f.root,'update-index','--add','--cacheinfo','100644,'+blob+',src/Sum.js');git(f.root,'commit','-q','-m','case');
 const base=git(f.root,'rev-parse','HEAD'),criteria=['x'];f.host.cancelNativeWork({workId:'fix-sum',reason:'replan'});
 f.host.installWorkManifest({workId:'case',manifest:{protocol:2,goal:'g',criteria,criteria_digest:routingDigest(criteria),paths:['src/sum.js'],base,forbidden_actions:[]}});
 const begin=f.calls.length;await assert.rejects(f.host.executeNativeWork({workId:'case',estimateTokens:'40'}),/work-input-case-collision/);assert.equal(f.calls.slice(begin).includes('native-work'),false);
});

function newManifest(f,workId,paths,base=git(f.root,'rev-parse','HEAD')){const criteria=['c'];f.host.installWorkManifest({workId,manifest:{protocol:2,goal:'g',criteria,criteria_digest:routingDigest(criteria),paths,base,forbidden_actions:[]}});}
test('a patch of about 20 KiB is sealed, and the prompt carries the base content even when the working tree differs',async t=>{
 let seen='';const f=await fixture(t,{workAnswer:prompt=>{seen=prompt;return JSON.stringify({files:[{path:'src/sum.js',content:'// '+'x'.repeat(20000)+'\n'}]});}});
 writeFileSync(join(f.root,'src/sum.js'),'WORKING TREE EDIT\n');
 const r=await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});assert.equal(r.status,'sealed',JSON.stringify(r));
 assert.ok(seen.includes('a-b'),'the base content is in the prompt');assert.equal(seen.includes('WORKING TREE EDIT'),false,'the working tree is never read');
});
test('a symlinked parent, oversized inputs and an empty patch are refused with named reasons',async t=>{
 const f=await fixture(t);f.host.cancelNativeWork({workId:'fix-sum',reason:'replan'});
 const link=spawnSync('git',['-C',f.root,'hash-object','-w','--stdin'],{input:'/etc',encoding:'utf8'}).stdout.trim();git(f.root,'update-index','--add','--cacheinfo','120000,'+link+',lib');git(f.root,'commit','-q','-m','link');
 newManifest(f,'via-link',['lib/passwd']);const begin=f.calls.length;
 await assert.rejects(f.host.executeNativeWork({workId:'via-link',estimateTokens:'40'}),/work-input-parent-not-directory/);assert.equal(f.calls.slice(begin).includes('native-work'),false);
 f.host.cancelNativeWork({workId:'via-link',reason:'x'});
 for(const name of ['a.txt','b.txt']){const blob=spawnSync('git',['-C',f.root,'hash-object','-w','--stdin'],{input:'y'.repeat(30000),encoding:'utf8'}).stdout.trim();git(f.root,'update-index','--add','--cacheinfo','100644,'+blob+',big/'+name);}
 git(f.root,'commit','-q','-m','big');newManifest(f,'big',['big/a.txt','big/b.txt']);
 await assert.rejects(f.host.executeNativeWork({workId:'big',estimateTokens:'40'}),/work-input-too-large/);
});
test('an empty patch fails the attempt as empty, and a failed seal write still settles the tokens',async t=>{
 let answer=JSON.stringify({files:[]});const f=await fixture(t,{workAnswer:()=>answer});
 const empty=await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});assert.equal(empty.dispatch.failure,'native-work-empty-patch');
 f.dependencies.integration={writeSealedPatch:()=>{throw Object.assign(Error('locked'),{code:'integration-git-failed'});}};answer=JSON.stringify({files:[{path:'src/sum.js',content:'ok\n'}]});
 const host=f.hostFor(f.participant),r=await host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});
 assert.equal(r.dispatch.failure,'native-work-seal-write-failed');assert.equal(Object.values(f.load().state.subscription_invocations).filter(x=>x.purpose==='work').every(x=>x.state==='settled'),true);
});
