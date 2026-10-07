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
test('a sealed patch becomes a candidate on the dedicated checkout of its base after the executor closed, idempotently, without touching the project',async t=>{
 const f=await fixture(t);
 assert.throws(()=>f.host.captureNativeWork({workId:'fix-sum'}),/host-native-work-sealed-call-required/);
 await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});
 const r=f.host.captureNativeWork({workId:'fix-sum'});assert.equal(r.captured,'fix-sum');assert.equal(r.protected_actions_granted,false);
 const w=work(f);assert.equal(w.status,'candidate');assert.notEqual(w.result.tree,git(f.root,'rev-parse',f.base+'^{tree}'));assert.equal(git(f.root,'rev-parse','refs/waypost/candidates/team/fix-sum/1-1'),w.result.tree,'the candidate tree is pinned');assert.deepEqual(w.result.paths,['src/sum.js']);assert.equal(w.result.tests_status,'not-run');assert.equal(w.supervision.mode,'leader-baseline-deterministic');
 assert.equal(w.author_contexts.length,1);
 assert.equal(git(f.root,'show',w.result.tree+':src/sum.js'),'export const sum=(a,b)=>a+b;');
 assert.equal(git(f.root,'status','--porcelain','--','src'),'','the project tree is untouched');assert.equal(git(f.root,'rev-parse','HEAD'),f.base);
 assert.equal(f.host.captureNativeWork({workId:'fix-sum'}).unchanged,true);
});
test('applying a sealed patch refuses a target that changed in the checkout and a symlinked parent',async t=>{
 const {createIntegrationCheckout,applySealedPatch}=await import('../scripts/team-integration.mjs'),{symlinkSync}=await import('node:fs');
 const f=await fixture(t),checkout=createIntegrationCheckout({projectRoot:f.root,authorityDir:join(f.root,'authority'),teamId:'team',workId:'manual',base:f.base});
 writeFileSync(join(checkout.path,'src/sum.js'),'tampered\n');
 assert.throws(()=>applySealedPatch({checkout,patch:{files:[{path:'src/sum.js',content:'x'}]},paths:['src/sum.js']}),/integration-target-changed/);
 symlinkSync('/tmp',join(checkout.path,'linked'));
 assert.throws(()=>applySealedPatch({checkout,patch:{files:[{path:'linked/x.js',content:'x'}]},paths:['linked/x.js']}),/integration-symlink/);
});

test('capture reruns after a lost capture write and after an apply whose marker was never written',async t=>{
 const {createHash}=await import('node:crypto'),{rmSync}=await import('node:fs');
 const f=await fixture(t),original=f.dependencies.mutate;let lost=false;
 await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});
 f.dependencies.mutate=(path,request,...rest)=>{if(!lost&&request.command.type==='native-work-material-capture-v2'){lost=true;throw Object.assign(Error('fixture lost write'),{code:'fixture-lost-write'});}return original(path,request,...rest);};
 assert.throws(()=>f.host.captureNativeWork({workId:'fix-sum'}),{code:'fixture-lost-write'});assert.equal(work(f).status,'sealed');
 rmSync(join(f.hostDir,'work-applied-'+createHash('sha256').update('fix-sum').digest('hex').slice(0,40)+'.json'));
 const r=f.host.captureNativeWork({workId:'fix-sum'});assert.equal(r.captured,'fix-sum');assert.equal(work(f).status,'candidate');
});
test('files echoed back unchanged are dropped at sealing, and a patch that changes nothing fails the attempt as empty',async t=>{
 let answer;const f=await fixture(t,{workAnswer:()=>answer});f.host.cancelNativeWork({workId:'fix-sum',reason:'two files'});
 writeFileSync(join(f.root,'src/other.js'),'export const other=1;\n');git(f.root,'add','src/other.js');git(f.root,'commit','-q','-m','other');
 newManifest(f,'two',['src/other.js','src/sum.js']);
 answer=JSON.stringify({files:[{path:'src/sum.js',content:'export const sum=(a,b)=>a-b;\n'},{path:'src/other.js',content:'export const other=1;\n'}]});
 const none=await f.host.executeNativeWork({workId:'two',estimateTokens:'40'});assert.equal(none.dispatch.failure,'native-work-empty-patch');
 answer=JSON.stringify({files:[{path:'src/sum.js',content:'export const sum=(a,b)=>a+b;\n'},{path:'src/other.js',content:'export const other=1;\n'}]});
 const one=await f.host.executeNativeWork({workId:'two',estimateTokens:'40'});assert.equal(one.status,'sealed');assert.deepEqual(one.dispatch.paths,['src/sum.js']);
 assert.equal(f.host.captureNativeWork({workId:'two'}).captured,'two');
});
test('a target under an eol=crlf attribute is recognised as its base blob and the capture succeeds',async t=>{
 const f=await fixture(t);f.host.cancelNativeWork({workId:'fix-sum',reason:'attributes'});
 writeFileSync(join(f.root,'.gitattributes'),'*.bat text eol=crlf\n');writeFileSync(join(f.root,'run.bat'),'echo old\n');git(f.root,'add','.gitattributes','run.bat');git(f.root,'commit','-q','-m','crlf');
 newManifest(f,'bat',['run.bat']);f.options.workAnswer=()=>JSON.stringify({files:[{path:'run.bat',content:'echo new\n'}]});
 const r=await f.host.executeNativeWork({workId:'bat',estimateTokens:'40'});assert.equal(r.status,'sealed',JSON.stringify(r));
 assert.equal(f.host.captureNativeWork({workId:'bat'}).captured,'bat');
});
test('the material capture reducer binds the bound collector, the execution closure and every evidence field',async t=>{
 const {reduceTeamEvent}=await import('../scripts/team-state.mjs'),{collectOwnedRuntimeCompletion,serializeOwnedRuntimeCompletion}=await import('../scripts/team-owned-runtime.mjs');
 const f=await fixture(t);await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});
 const before=f.load(),w0=before.state.teams.team.work['fix-sum'],x=before.state.subscription_invocations[w0.dispatches[w0.sealed_dispatch].invocation_id];
 f.host.captureNativeWork({workId:'fix-sum'});const after=f.load(),evidence=after.state.teams.team.work['fix-sum'].result;
 const completion=serializeOwnedRuntimeCompletion(collectOwnedRuntimeCompletion({directory:join(f.hostDir,'runtime'),team:'team',participant:x.participant,incarnation:x.incarnation,epoch:x.epoch,descriptorDigest:x.descriptor_digest,operation:x.operation_id,invocation_id:x.id,nonce:x.nonce,native_id:x.context.native_id}));
 const cmd=(patch={},state=before)=>reduceTeamEvent(structuredClone(state.state),{type:'native-work-material-capture-v2',team:'team',actor:x.collector,at:new Date().toISOString(),request_key:'k'+Math.random(),work_id:'fix-sum',generation:1,attempt:x.work.attempt,invocation_id:x.id,nonce:x.nonce,completion,evidence,...patch},{revision:state.revision});
 assert.equal(cmd().state.teams.team.work['fix-sum'].status,'candidate');
 const other=Object.values(before.state.collectors).find(c=>'collector:'+c.id!==x.collector);
 for(const [name,patch,code] of [
  ['another collector',{actor:'collector:'+other.id},/bound-collector-required/],
  ['closure kind',{completion:{...completion,kind:'subscription-bootstrap'}},/exact-owned-operation-completion-required/],
  ['closure operation',{completion:{...completion,operation:'another'}},/exact-owned-operation-completion-required/],
  ['closure epoch',{completion:{...completion,scope:{...completion.scope,epoch:completion.scope.epoch+1}}},/exact-owned-operation-completion-required/],
  ['stale attempt',{attempt:x.work.attempt+1},/sealed-call-required/],
  ['generation',{generation:2},/sealed-call-required/],
  ...['base','paths','patch_digest','patch_ref','tests_digest','tests_status'].map(k=>['evidence '+k,{evidence:{...evidence,[k]:k==='paths'?['src/other.js']:k==='tests_status'?'passed':'0'.repeat(40)}},/material-evidence-mismatch/])])
  assert.throws(()=>cmd(patch),code,name);
 const revoked=structuredClone(before);revoked.state.collectors[x.collector.replace(/^collector:/,'')].revoked=true;assert.throws(()=>cmd({},revoked),/bound-collector-required/);
 assert.equal(cmd({},after).result.unchanged,true);assert.throws(()=>cmd({evidence:{...evidence,diff_digest:'f'.repeat(64)}},after),/material-conflict/);
 const paused=structuredClone(before);paused.state.teams.team.status='paused';paused.state.teams.team.native_quota_freeze={};assert.equal(cmd({},paused).state.teams.team.work['fix-sum'].status,'candidate','allowed while paused or frozen');
 const fenced=structuredClone(before);fenced.state.publication_fence={team:'team'};assert.equal(cmd({},fenced).result.deferred,true);
});
