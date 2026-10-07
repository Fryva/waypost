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
async function captured(t,options){const f=await fixture(t,options);await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});f.host.captureNativeWork({workId:'fix-sum'});return f;}
test('the strongest independent critic approves the exact diff of a candidate on its own Host, after its profile and owned closure',async t=>{
 const f=await captured(t),team=f.load().state.teams.team,critic=team.review_candidate;
 assert.notEqual(critic,team.leader);
 await assert.rejects(f.host.reviewNativeWork({workId:'fix-sum',estimateTokens:'40'}),/host-native-work-review-endpoint-required/);
 const r=await f.hostFor(critic).reviewNativeWork({workId:'fix-sum',estimateTokens:'40'});
 assert.equal(r.work_review_captured,true,JSON.stringify(r));assert.equal(r.work_review.verdict,'approve');assert.equal(r.work_review.label,'unqualified-strongest-protocol-review-baseline');assert.equal(r.protected_actions_granted,false);
 const w=work(f);assert.equal(w.status,'approved');assert.equal(w.reviews.length,1);
 const x=f.load().state.subscription_invocations[r.invocation_id];assert.equal(x.action.request.participant,critic);assert.ok(x.action.request.excluded_participants.includes(team.leader));
});
test('a negative verdict stays: the work is changes-requested and no later approval of the same target clears it',async t=>{
 const f=await captured(t,{workReviewVerdict:'changes-requested',workReviewFindings:[{path:'src/sum.js',severity:'major',text:'Subtraction is still used.'}]}),critic=f.load().state.teams.team.review_candidate;
 const r=await f.hostFor(critic).reviewNativeWork({workId:'fix-sum',estimateTokens:'40'});assert.equal(r.work_review.verdict,'changes-requested');
 assert.equal(work(f).status,'changes-requested');const target=Object.values(f.load().state.teams.team.native_work_reviews)[0];assert.equal(target.unresolved_negative,true);
 await assert.rejects(f.hostFor(critic).reviewNativeWork({workId:'fix-sum',estimateTokens:'40'}),/candidate-required/,'no second review of a work that is no longer a candidate');
 assert.equal(f.host.cancelNativeWork({workId:'fix-sum',reason:'rejected'}).cancelled,'fix-sum');
});
test('a review refuses a diff that no longer matches the captured digest, and an approval with findings',async t=>{
 const {readWorkReview}=await import('../scripts/team-native-work-review.mjs');
 const f=await captured(t),critic=f.load().state.teams.team.review_candidate,original=f.dependencies.integration;
 f.dependencies.integration={treeDiff:()=>'tampered diff'};
 await assert.rejects(f.hostFor(critic).reviewNativeWork({workId:'fix-sum',estimateTokens:'40'}),/host-native-work-review-diff-mismatch/);f.dependencies.integration=original;
 const action={action_id:'a',request_digest:'r',request:{target_digest:'g',target:{paths:['src/sum.js']}}};
 assert.throws(()=>readWorkReview(JSON.stringify({verdict:'approve',action_id:'a',request_digest:'r',target_digest:'g',findings:[{path:'src/sum.js',severity:'minor',text:'x'}]}),action),/approval-needs-no-findings/);
 assert.throws(()=>readWorkReview(JSON.stringify({verdict:'approve',action_id:'a',request_digest:'r',target_digest:'g',findings:[],extra:1}),action),/exact-work-review-required/);
 assert.throws(()=>readWorkReview(JSON.stringify({verdict:'changes-requested',action_id:'a',request_digest:'r',target_digest:'g',findings:[{path:'other.js',severity:'minor',text:'x'}]}),action),/finding-required/);
});
const rejectsCode=(promise,code)=>assert.rejects(promise,error=>{assert.equal(error.code??error.message,code);return true;});
const reviewInvocations=f=>Object.values(f.load().state.subscription_invocations).filter(x=>x.action?.kind==='protocol-work-review');
test('the critic prompt is the frozen head followed by the exact diff as data, with no verdict suggested',async t=>{
 const {formatProtocolAction}=await import('../scripts/team-native-action.mjs'),{treeDiff}=await import('../scripts/team-integration.mjs');
 const f=await captured(t),critic=f.load().state.teams.team.review_candidate;
 const r=await f.hostFor(critic).reviewNativeWork({workId:'fix-sum',estimateTokens:'40'});assert.equal(r.work_review_captured,true,JSON.stringify(r));
 const x=f.load().state.subscription_invocations[r.invocation_id],target=x.action.request.target,diff=treeDiff({projectRoot:f.root,base:target.base,tree:target.tree});
 assert.equal(routingDigest(diff),target.diff_digest);
 const prompts=f.prompts.filter(p=>p.purpose==='protocol-control'&&p.prompt.includes('"kind":"protocol-work-review"'));assert.equal(prompts.length,1);const prompt=prompts[0].prompt,head=formatProtocolAction(x.action);
 assert.ok(prompt.startsWith(head));assert.ok(prompt.endsWith('\n'+JSON.stringify({diff})));assert.equal(prompt,head+'\n'+JSON.stringify({diff}),'nothing sits between the head and the diff');
 assert.ok(head.includes('response_schema'));assert.equal(head.includes('"verdict":"approve"'),false,'no ready-made answer is offered');assert.equal(head.includes('"diff"'),false,'the diff is only in the suffix');
});
test('a blocked verdict blocks the work and leaves the target with an unresolved negative',async t=>{
 const f=await captured(t,{workReviewVerdict:'blocked',workReviewFindings:[{path:'',severity:'blocker',text:'The change is unsafe.'}]}),critic=f.load().state.teams.team.review_candidate;
 const r=await f.hostFor(critic).reviewNativeWork({workId:'fix-sum',estimateTokens:'40'});assert.equal(r.work_review.verdict,'blocked');assert.equal(r.work_review.work_status,'blocked');assert.equal(r.work_review.unresolved_negative,true);
 assert.equal(work(f).status,'blocked');assert.equal(Object.values(f.load().state.teams.team.native_work_reviews)[0].unresolved_negative,true);
});
test('the same critic cannot review the same target twice in one epoch, and the first verdict is still recoverable',async t=>{
 const f=await captured(t,{interruptWorkReview:true}),critic=f.load().state.teams.team.review_candidate,host=f.hostFor(critic);
 await assert.rejects(host.reviewNativeWork({workId:'fix-sum',estimateTokens:'40'}),/interrupted work review capture/);
 const [x]=reviewInvocations(f);assert.equal(x.state,'settled');assert.equal(x.work_review,undefined);
 const sends=f.calls.filter(c=>c==='native-send').length;
 await rejectsCode(host.reviewNativeWork({workId:'fix-sum',estimateTokens:'40'}),'native-action-action-slot-already-reserved-or-consumed');
 assert.equal(reviewInvocations(f).length,1);assert.equal(f.calls.filter(c=>c==='native-send').length,sends);assert.equal(work(f).status,'candidate');
 assert.equal((await host.recoverWorkReview({invocationId:x.id})).work_review_captured,true);assert.equal(work(f).status,'approved');
});
test('another critic is refused while the first review of the target is neither recorded nor released',async t=>{
 const {validateProtocolAction,actionPromptDigest}=await import('../scripts/team-native-action.mjs'),{createProtocolWorkReviewRequest}=await import('../scripts/team-native-work-review.mjs');
 const f=await captured(t,{interruptWorkReview:true}),critic=f.load().state.teams.team.review_candidate;
 await assert.rejects(f.hostFor(critic).reviewNativeWork({workId:'fix-sum',estimateTokens:'40'}),/interrupted work review capture/);
 const [x]=reviewInvocations(f);assert.equal(x.work_review,undefined);
 // A later epoch gives the next review its own slot, so only the one-review-per-target rule can stop it.
 const attempt=mutate=>{const s=structuredClone(f.load().state),team=s.teams.team;team.epoch+=1;mutate?.(s.subscription_invocations[x.id]);
  const core=createProtocolWorkReviewRequest(s,team,{actionId:'second',workId:'fix-sum'}),action={...core,prompt_digest:actionPromptDigest(core),operation_id:'2b3a8c1e-5d4f-4a6b-8c7d-9e0f1a2b3c4d'};
  return validateProtocolAction(s,team,{purpose:'protocol-control',incarnation:core.request.incarnation,max_calls:1,estimate_tokens:'40',timeout_ms:1000,suite_digest:action.prompt_digest,action},team.participants[core.request.participant],{descriptor_digest:core.request.descriptor_digest,native_id:'native-second',id:'context-second'},Date.now());};
 assert.throws(()=>attempt(),error=>{assert.match(error.code??error.message,/native-work-review-pending-for-target/);return true;});
 for(const [name,mutate] of [['recorded',y=>{y.work_review={verdict:'approve'};}],['aborted',y=>{y.state='aborted';}],['reconciled and released',y=>{y.state='reconciled';y.slot_released=true;}]])
  try{attempt(mutate);}catch(error){assert.doesNotMatch(error.code??error.message,/pending-for-target/,name);}
});
test('a second review is also refused while the first call is uncertain, until it is reconciled',async t=>{
 let lose=false;const f=await captured(t,{failSend:()=>lose}),critic=f.load().state.teams.team.review_candidate,host=f.hostFor(critic);
 lose=true;await host.reviewNativeWork({workId:'fix-sum',estimateTokens:'40'}).catch(()=>{});lose=false;
 const [x]=reviewInvocations(f);assert.equal(x.state,'uncertain');assert.equal(x.work_review,undefined);
 await rejectsCode(host.reviewNativeWork({workId:'fix-sum',estimateTokens:'40'}),'subscription-uncertain-usage-blocks-admission');
 assert.equal(reviewInvocations(f).length,1);assert.equal(work(f).status,'candidate');
});
test('a target whose strongest independent critic is Codex is refused rather than weakened',async t=>{
 const {createProtocolWorkReviewRequest}=await import('../scripts/team-native-work-review.mjs');
 const f=await captured(t),v=f.load(),critic=v.state.teams.team.review_candidate;
 assert.ok(createProtocolWorkReviewRequest(v.state,v.state.teams.team,{actionId:'ok',workId:'fix-sum'}),'the unmodified team selects its critic');
 const state=structuredClone(v.state),team=state.teams.team;team.participants[critic].harness='codex';
 assert.throws(()=>createProtocolWorkReviewRequest(state,team,{actionId:'codex',workId:'fix-sum'}),{message:'native-work-strongest-independent-review-unavailable'});
 for(const p of Object.values(team.participants))if(p.id!==team.leader)p.harness='codex';
 assert.throws(()=>createProtocolWorkReviewRequest(state,team,{actionId:'codex',workId:'fix-sum'}),{message:'native-work-strongest-independent-review-unavailable'});
});
test('a review prompt over 64 KiB is refused before any reservation',async t=>{
 const f=await fixture(t,{workAnswer:()=>JSON.stringify({files:['src/sum.js','src/b.js'].map(path=>({path,content:'// '+'x'.repeat(32000)+'\n'}))})});
 f.host.cancelNativeWork({workId:'fix-sum',reason:'replan'});writeFileSync(join(f.root,'src/b.js'),'export const b=1;\n');git(f.root,'add','src/b.js');git(f.root,'commit','-q','-m','b');newManifest(f,'big',['src/sum.js','src/b.js']);
 const r=await f.host.executeNativeWork({workId:'big',estimateTokens:'40'});assert.equal(r.status,'sealed',JSON.stringify(r));f.host.captureNativeWork({workId:'big'});
 const critic=f.load().state.teams.team.review_candidate,before=Object.keys(f.load().state.subscription_invocations),sends=f.calls.filter(c=>c==='native-send').length;
 await rejectsCode(f.hostFor(critic).reviewNativeWork({workId:'big',estimateTokens:'40'}),'host-native-work-review-prompt-too-large');
 assert.deepEqual(Object.keys(f.load().state.subscription_invocations),before);assert.equal(f.calls.filter(c=>c==='native-send').length,sends);assert.equal(f.load().state.teams.team.work.big.status,'candidate');
});
test('the work review capture reducer binds the collector and the closure, and an applied verdict is immutable',async t=>{
 const {reduceTeamEvent}=await import('../scripts/team-state.mjs'),{collectOwnedRuntimeCompletion,serializeOwnedRuntimeCompletion}=await import('../scripts/team-owned-runtime.mjs');
 const f=await captured(t,{interruptWorkReview:true}),critic=f.load().state.teams.team.review_candidate;
 await assert.rejects(f.hostFor(critic).reviewNativeWork({workId:'fix-sum',estimateTokens:'40'}),/interrupted work review capture/);
 const before=f.load(),[x]=reviewInvocations(f);assert.equal(x.state,'settled');assert.ok(x.action_observation);assert.equal(x.work_review,undefined);
 const completion=serializeOwnedRuntimeCompletion(collectOwnedRuntimeCompletion({directory:join(f.configFor(critic).hostDir,'runtime'),team:'team',participant:x.participant,incarnation:x.incarnation,epoch:x.epoch,descriptorDigest:x.descriptor_digest,operation:x.action.operation_id,invocation_id:x.id,nonce:x.nonce,native_id:x.context.native_id}));
 const cmd=(patch={},state=before)=>reduceTeamEvent(structuredClone(state.state),{type:'native-work-review-capture-v2',team:'team',actor:x.collector,at:new Date().toISOString(),request_key:'k'+Math.random(),invocation_id:x.id,nonce:x.nonce,completion,...patch},{revision:state.revision});
 assert.equal(cmd().state.teams.team.work['fix-sum'].status,'approved');
 const other=Object.values(before.state.collectors).find(c=>'collector:'+c.id!==x.collector);
 for(const [name,patch,code] of [
  ['another collector',{actor:'collector:'+other.id},/bound-action-collector-required/],
  ['closure kind',{completion:{...completion,kind:'subscription-bootstrap'}},/exact-owned-operation-completion-required/],
  ['closure operation',{completion:{...completion,operation:'another'}},/exact-owned-operation-completion-required/],
  ['closure epoch',{completion:{...completion,scope:{...completion.scope,epoch:completion.scope.epoch+1}}},/exact-owned-operation-completion-required/],
  ['another invocation',{completion:{...completion,invocation_id:'other'}},/exact-owned-operation-completion-required/],
  ['a nonce that is not the call\'s',{nonce:'other'},/stored-action-required/]])
  assert.throws(()=>cmd(patch),code,name);
 const done=cmd().state;const after={state:done,revision:before.revision+1};
 assert.equal(cmd({},after).result.unchanged,true,'the same completion is idempotent');assert.equal(cmd({},after).result.verdict,'approve');
 assert.throws(()=>cmd({completion:{...completion,evidence_digest:'f'.repeat(64)}},after),/work-review-immutable/);
 const moved=structuredClone(before);moved.state.teams.team.work['fix-sum'].status='cancelled';assert.throws(()=>cmd({},moved),/native-work-review-candidate-required/);
});
test('an interrupted work review capture is recovered from the original sealed verdict without another native call',async t=>{
 const f=await captured(t,{interruptWorkReview:true}),critic=f.load().state.teams.team.review_candidate,host=f.hostFor(critic);
 await assert.rejects(host.reviewNativeWork({workId:'fix-sum',estimateTokens:'40'}),/interrupted work review capture/);
 const [x]=reviewInvocations(f),sends=f.calls.filter(c=>c==='native-send').length;assert.equal(x.work_review,undefined);assert.equal(work(f).status,'candidate');
 const recovered=await host.recoverWorkReview({invocationId:x.id});assert.equal(recovered.work_review_captured,true,JSON.stringify(recovered));assert.equal(recovered.work_review.verdict,'approve');
 assert.equal(f.calls.filter(c=>c==='native-send').length,sends);assert.equal(work(f).status,'approved');assert.equal(f.load().state.subscription_invocations[x.id].work_review.verdict,'approve');
 const again=await host.recoverWorkReview({invocationId:x.id});assert.equal(again.work_review_captured,true);assert.equal(again.replayed,true);assert.equal(work(f).reviews.length,1);
 await rejectsCode(host.recoverWorkReview({invocationId:'missing'}),'host-protocol-recovery-source-required');
});
for(const [name,option,state] of [['malformed','workReviewMalformed','settled'],['partial','workReviewPartial','uncertain']])test('a '+name+' critic reply is not applied: the work stays a candidate and the spent slot stays on the ledger',async t=>{
 const f=await captured(t,{[option]:true}),critic=f.load().state.teams.team.review_candidate;
 const r=await f.hostFor(critic).reviewNativeWork({workId:'fix-sum',estimateTokens:'40'});assert.notEqual(r.work_review_captured,true,JSON.stringify(r));assert.equal(r.protected_actions_granted,false);
 assert.equal(work(f).status,'candidate');assert.equal(work(f).reviews,undefined);assert.equal(f.load().state.teams.team.native_work_reviews,undefined);
 const invocations=reviewInvocations(f);assert.equal(invocations.length,1);assert.equal(invocations[0].work_review,undefined);assert.equal(invocations[0].state,state);
 const slots=Object.values(f.load().state.teams.team.native_control_slots).filter(s=>s.invocation_id===invocations[0].id);assert.equal(slots.length,1,'the slot of the spent call is on the ledger');assert.notEqual(slots[0].applied,true);
 assert.equal(invocations[0].charged_tokens,state==='settled'?'30':undefined);
 await rejectsCode(f.hostFor(critic).reviewNativeWork({workId:'fix-sum',estimateTokens:'40'}),state==='settled'?'native-action-action-slot-already-reserved-or-consumed':'subscription-uncertain-usage-blocks-admission');
 assert.equal(reviewInvocations(f).length,1,'no further critic call was reserved');
});
test('a critic finding with a control character in its text is refused by the parser',async t=>{
 const {readWorkReview}=await import('../scripts/team-native-work-review.mjs');
 const action={action_id:'a',request_digest:'r',request:{target_digest:'g',target:{paths:['src/sum.js']}}},reply=text=>JSON.stringify({verdict:'blocked',action_id:'a',request_digest:'r',target_digest:'g',findings:[{path:'src/sum.js',severity:'major',text}]});
 assert.equal(readWorkReview(reply('plain text'),action).findings[0].text,'plain text');
 for(const text of ['line\nbreak','nul\u0000byte','tab\there','esc\u001b[31m','del\u007f','c1\u0085','x'.repeat(241),'   '])assert.throws(()=>readWorkReview(reply(text),action),{message:'exact-work-review-finding-required'},JSON.stringify(text));
});
