import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {protocolHostFixture} from './helpers/native-protocol-host.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';
import {formatWorkPromptHead} from '../scripts/team-native-work.mjs';

const git=(cwd,...args)=>{const r=spawnSync('git',['-C',cwd,...args],{encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'t@t',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:'t@t'}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const owner='owner:'+createHash('sha256').update('fixture-owner-token-'.repeat(4)).digest('hex');
const findings=[{path:'src/sum.js',severity:'major',text:'still subtracts'}];
async function rejected(t,options={},policy={}){
 const f=await protocolHostFixture(t,{workReviewVerdict:'changes-requested',workReviewFindings:findings,...options});
 git(f.root,'init','-q');mkdirSync(join(f.root,'src'));writeFileSync(join(f.root,'src/sum.js'),'export const sum=(a,b)=>a-b;\n');git(f.root,'add','src/sum.js');git(f.root,'commit','-q','-m','base');
 const base=git(f.root,'rev-parse','HEAD');
 const ack=await f.host.acknowledgeProtocolLeadership({actionId:'leader',nonce:'leader',estimateTokens:'40'});assert.equal(ack.leader_acknowledged,true,ack.action_blocker);
 const allocation=f.load().state.subscription_allocations[routingDigest(f.unit)];
 f.host.enableNativeWork({revision:1,policy:{kind:'protocol-work',executor:'leader-baseline',allow_unknown_quota:true,max_attempts:policy.max_attempts??3,timeout_ms:1000,expires_at:f.expiry,ceilings:{execution:{max_calls:3,max_estimate_tokens:'40'},review:{max_calls:policy.review_calls??3,max_estimate_tokens:'40'}},unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:'400',allocation_revision:allocation.revision}]}});
 const criteria=['sum returns a+b'];
 f.host.installWorkManifest({workId:'fix-sum',manifest:{protocol:2,goal:'Fix sum',criteria,criteria_digest:routingDigest(criteria),paths:['src/sum.js'],base,forbidden_actions:['network']}});
 await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});f.host.captureNativeWork({workId:'fix-sum'});
 const critic=f.load().state.teams.team.review_candidate,r=await f.hostFor(critic).reviewNativeWork({workId:'fix-sum',estimateTokens:'40'});
 assert.equal(r.work_review.verdict,options.workReviewVerdict||'changes-requested');
 return {...f,base,critic};
}
const work=f=>f.load().state.teams.team.work['fix-sum'];
const cmd=(f,c,v=f.load())=>reduceTeamEvent(structuredClone(v.state),{team:'team',at:new Date().toISOString(),request_key:'k'+Math.random(),actor:owner,...c},{revision:v.revision});

test('the owner revises rejected work: the generation is archived, its negative stays, and the next generation runs on template 2 with the findings',async t=>{
 const f=await rejected(t),w1=work(f),target=w1.reviews.at(-1).target_digest;
 const r=f.host.reviseNativeWork({workId:'fix-sum',reason:'address the finding'});
 assert.equal(r.generation,2);assert.equal(r.source_verdict,'changes-requested');
 const w=work(f),team=f.load().state.teams.team;
 assert.equal(w.status,'manifest');assert.equal(w.generation,2);assert.equal(w.attempts,1);
 assert.equal(w.result,undefined);assert.equal(w.author_contexts,undefined);
 assert.equal(w.generations.length,1);assert.equal(w.generations[0].target_digest,target);assert.equal(w.generations[0].verdict,'changes-requested');assert.deepEqual(w.generations[0].result,w1.result);
 assert.deepEqual(w.revision.findings,findings);assert.equal(w.revision.from_target_digest,target);assert.equal(w.revision.findings_digest,routingDigest(findings));
 assert.equal(team.native_work_reviews[target].unresolved_negative,true,'the old target keeps its negative');
 const g=w.generations[0];assert.deepEqual(g.reviews,[w1.reviews.at(-1).invocation_id]);assert.equal(g.sealed_dispatch,w1.sealed_dispatch);assert.deepEqual(g.author_contexts,w1.author_contexts);assert.equal(g.captured_at,w1.captured_at);
 for(const k of ['supervision','sealed_dispatch','captured_at'])assert.equal(w[k],undefined,k);
 assert.deepEqual(w.dispatches,w1.dispatches);assert.deepEqual(w.reviews,w1.reviews);
 assert.equal(w.revision.reason,'address the finding');assert.equal(w.revision.from_generation,1);assert.equal(w.revision.source_invocation,w1.reviews.at(-1).invocation_id);
 assert.equal(f.host.reviseNativeWork({workId:'fix-sum',reason:'address the finding'}).unchanged,true);
 f.prompts.length=0;
 const x=await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});
 assert.equal(x.attempt,2);assert.equal(x.status,'sealed');assert.match(x.dispatch.patch_ref,/\/fix-sum\/2-2-/);
 const prompt=f.prompts.find(p=>p.purpose==='protocol-work').prompt;
 assert.ok(prompt.startsWith(formatWorkPromptHead(w.manifest,w.revision)+'\n'));assert.ok(prompt.includes('a-b'),'the executor sees the base, not the rejected candidate');assert.ok(prompt.includes('"revision":{"generation":2,"findings":'));assert.ok(prompt.includes('unverified claims'));
});
test('revise refuses other statuses, a stale generation or findings digest, an unresolved call, no attempts or calls left, and waits behind a fence',async t=>{
 const f=await rejected(t),w=work(f),digest=routingDigest(findings),ok={type:'native-work-revise-v2',work_id:'fix-sum',generation:1,findings_digest:digest,reason:'again'};
 assert.equal(cmd(f,ok).state.teams.team.work['fix-sum'].generation,2);
 assert.throws(()=>cmd(f,{...ok,generation:2}),/native-work-revise-generation-required/);
 assert.throws(()=>cmd(f,{...ok,findings_digest:'0'.repeat(64)}),/native-work-revise-findings-required/);
 assert.throws(()=>cmd(f,{...ok,extra:1}),/native-work-command-fields-required/);
 assert.throws(()=>cmd(f,{...ok,actor:'collector:x'}),/owner/);
 const v=f.load(),edit=fn=>{const c=structuredClone(v);fn(c.state);return c;};
 for(const status of ['candidate','approved','sealed','manifest','cancelled','integrated'])assert.throws(()=>cmd(f,ok,edit(s=>{s.teams.team.work['fix-sum'].status=status;})),/native-work-revisable-work-required/,status);
 assert.throws(()=>cmd(f,ok,edit(s=>{s.teams.team.work['fix-sum'].attempts=3;})),/native-work-attempts-exhausted/);
 assert.throws(()=>cmd(f,ok,edit(s=>{s.teams.team.native_work_policy.ceilings.review.max_calls=1;})),/native-work-owner-ceiling-exhausted/);
 const call=Object.values(v.state.subscription_invocations).find(x=>x.purpose==='work');
 for(const state of ['prepared','consumed','uncertain'])assert.throws(()=>cmd(f,ok,edit(s=>{s.subscription_invocations[call.id].state=state;})),/native-work-unresolved-call/,state);
 assert.throws(()=>cmd(f,ok,edit(s=>{for(const a of Object.values(s.teams.team.native_work_reviews))a.unresolved_negative=false;})),/native-work-negative-review-required/);
 for(const [k,value] of [['worker_incarnation','other'],['worker_model_revision',99],['worker_identity',{kind:'native-configuration',profile_id:'other'}]])assert.throws(()=>cmd(f,ok,edit(s=>{s.teams.team.work['fix-sum'][k]=value;})),/^Error: native-work-worker-identity-changed$/,k);
 assert.throws(()=>cmd(f,ok,edit(s=>{s.teams.team.native_work_policy.ceilings.execution.max_calls=1;})),/native-work-owner-ceiling-exhausted/);
 const review=Object.values(v.state.subscription_invocations).find(x=>x.action?.kind==='protocol-work-review');
 for(const state of ['prepared','consumed','uncertain'])assert.throws(()=>cmd(f,ok,edit(s=>{s.subscription_invocations[review.id].state=state;})),/native-work-unresolved-call/,'review '+state);
 const ack=Object.values(v.state.subscription_invocations).find(x=>x.action_ack);
 assert.throws(()=>cmd(f,ok,edit(s=>{s.teams.team.native_protocol_reviews={audit:{unresolved_negative:true,records:[{source_invocation_id:ack.id}]}};})),/native-work-unresolved-negative-leadership-audit/);
 assert.throws(()=>cmd(f,ok,edit(s=>{s.teams.team.native_integration={work_id:'fix-sum',state:'prepared'};})),/native-work-revise-integration-open/);
 const fenced=cmd(f,ok,edit(s=>{s.publication_fence={team:'team',reservation:'r',work:'other',protocol:2};}));
 assert.equal(fenced.result.deferred,true);assert.equal(fenced.state.teams.team.work['fix-sum'].generation,1);
 assert.equal(work(f).status,'changes-requested');
});
test('a blocked verdict may be revised and the source verdict is recorded; revised work can still be cancelled and the team closed',async t=>{
 const f=await rejected(t,{workReviewVerdict:'blocked'});
 assert.equal(work(f).status,'blocked');
 assert.equal(f.host.reviseNativeWork({workId:'fix-sum',reason:'try again'}).source_verdict,'blocked');
 assert.equal(work(f).generations[0].verdict,'blocked');
 assert.equal(f.host.cancelNativeWork({workId:'fix-sum',reason:'stop'}).cancelled,'fix-sum');
 assert.equal(cmd(f,{type:'close-v1'}).result.closed,'team');
});
const answer=files=>JSON.stringify({files:Object.entries(files).map(([path,content])=>({path,content}))});
async function loop(t,{second,third}={}){
 let executions=0;
 const f=await protocolHostFixture(t,{
  workAnswer:()=>{executions++;return answer(executions===1?{'src/sum.js':'export const sum=(a,b)=>a*b;\n','src/extra.js':'export const x=1;\n'}:executions===2?second:third);},
  workReviewVerdict:action=>action.request.target.generation===1?'changes-requested':'approve',
  workReviewFindings:action=>action.request.target.generation===1?findings:[]});
 git(f.root,'init','-q');mkdirSync(join(f.root,'src'));writeFileSync(join(f.root,'src/sum.js'),'export const sum=(a,b)=>a-b;\n');git(f.root,'add','src/sum.js');git(f.root,'commit','-q','-m','base');
 const base=git(f.root,'rev-parse','HEAD');
 await f.host.acknowledgeProtocolLeadership({actionId:'leader',nonce:'leader',estimateTokens:'40'});
 const allocation=f.load().state.subscription_allocations[routingDigest(f.unit)];
 f.host.enableNativeWork({revision:1,policy:{kind:'protocol-work',executor:'leader-baseline',allow_unknown_quota:true,max_attempts:3,timeout_ms:1000,expires_at:f.expiry,ceilings:{execution:{max_calls:3,max_estimate_tokens:'40'},review:{max_calls:3,max_estimate_tokens:'40'}},unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:'400',allocation_revision:allocation.revision}]}});
 const criteria=['sum returns a+b'];
 f.host.installWorkManifest({workId:'fix-sum',manifest:{protocol:2,goal:'Fix sum',criteria,criteria_digest:routingDigest(criteria),paths:['src/extra.js','src/sum.js'],base,forbidden_actions:['network']}});
 await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});f.host.captureNativeWork({workId:'fix-sum'});
 const critic=f.load().state.teams.team.review_candidate;await f.hostFor(critic).reviewNativeWork({workId:'fix-sum',estimateTokens:'40'});
 assert.equal(work(f).status,'changes-requested');
 f.host.reviseNativeWork({workId:'fix-sum',reason:'fix the operator'});
 return {...f,base,critic};
}
test('a revised generation starts again from the base, is reviewed with the prior findings to check, and publishes with its generation',async t=>{
 const f=await loop(t,{second:{'src/sum.js':'export const sum=(a,b)=>a+b;\n'}});
 await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});
 assert.equal(f.host.captureNativeWork({workId:'fix-sum'}).captured,'fix-sum');
 const w=work(f);assert.equal(w.status,'candidate');assert.equal(w.generation,2);
 assert.deepEqual(w.result.paths,['src/sum.js'],'the file only the rejected generation created is gone');
 assert.equal(git(f.root,'show',w.result.tree+':src/sum.js'),'export const sum=(a,b)=>a+b;');
 f.prompts.length=0;
 const r=await f.hostFor(f.critic).reviewNativeWork({workId:'fix-sum',estimateTokens:'40'});
 assert.equal(r.work_review.verdict,'approve');assert.equal(work(f).status,'approved');
 const x=f.load().state.subscription_invocations[r.invocation_id];assert.deepEqual(x.action.request.prior.findings,findings);assert.equal(x.action.request.prior.from_target_digest,w.revision.from_target_digest);
 const prompt=f.prompts.find(p=>p.purpose==='protocol-control').prompt;assert.ok(prompt.includes('request.prior lists findings an earlier reviewer raised'));
 const published=await f.host.publishNativeWork({workId:'fix-sum',message:'Fix sum',story:'WP-20/story-x',commitIdentity:{name:'Owner',email:'owner@example.com',date:'1791331200 +0000'}});
 const body=git(f.root,'show','-s','--format=%B',published.commit);
 assert.ok(body.split('\n').includes('Waypost-Generation: 2'));
 assert.equal(cmd(f,{type:'close-v1'}).result.closed,'team');
});
test('a later generation that returns the rejected tree fails its attempt by name and is never reviewed; another attempt can still pass',async t=>{
 const rejectedFiles={'src/sum.js':'export const sum=(a,b)=>a*b;\n','src/extra.js':'export const x=1;\n'};
 const f=await loop(t,{second:rejectedFiles,third:{'src/sum.js':'export const sum=(a,b)=>a+b;\n'}});
 await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});
 const r=f.host.captureNativeWork({workId:'fix-sum'});
 assert.equal(r.failure,'native-work-rejected-candidate-repeated');assert.equal(work(f).status,'attempt-failed');assert.equal(work(f).result,undefined);assert.equal(work(f).sealed_dispatch,undefined);
 const failed=Object.values(work(f).dispatches).find(d=>d.attempt===2);assert.equal(failed.state,'failed');assert.equal(failed.failure,'native-work-rejected-candidate-repeated');
 await assert.rejects(f.hostFor(f.critic).reviewNativeWork({workId:'fix-sum',estimateTokens:'40'}),/native-work-review-candidate-required/);
 await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});
 assert.equal(f.host.captureNativeWork({workId:'fix-sum'}).captured,'fix-sum');
 assert.equal(work(f).status,'candidate');assert.equal(work(f).attempts,3);
});
test('revise refuses manifest paths that contain one another, so a reset never meets a leftover directory',async t=>{
 const f=await rejected(t),v=f.load(),c=structuredClone(v);c.state.teams.team.work['fix-sum'].paths=['src/sum.js','src/sum.js/x'];
 assert.throws(()=>cmd(f,{type:'native-work-revise-v2',work_id:'fix-sum',generation:1,findings_digest:routingDigest(findings),reason:'again'},c),/native-work-path-prefix/);
});
test('line separators in findings are escaped in both template-2 prompts, while template 1 heads keep their bytes',async t=>{
 const {formatWorkReview}=await import('../scripts/team-native-work-review.mjs');
 const odd=[{path:'',severity:'minor',text:'one\u2028two\u2029three'}];
 const head=formatWorkPromptHead({goal:'g',criteria:['c'],paths:['a'],forbidden_actions:[]},{generation:2,findings:odd});
 assert.ok(!/[\u2028\u2029]/.test(head));assert.ok(head.includes('one\\u2028two\\u2029three'));
 const f=await rejected(t),v=f.load(),x=Object.values(v.state.subscription_invocations).find(y=>y.action?.kind==='protocol-work-review');
 const core={kind:x.action.kind,action_id:x.action.action_id,request_digest:x.action.request_digest,request:x.action.request};
 assert.equal(formatWorkReview(core).includes('request.prior'),false);
 const request={...core.request,prior:{from_target_digest:'0'.repeat(64),findings_digest:routingDigest(odd),findings:odd}},action={...core,request,request_digest:routingDigest(request)};
 const review=formatWorkReview(action);assert.ok(!/[\u2028\u2029]/.test(review));assert.ok(review.includes('request.prior lists findings'));
});

test('the Host refuses a revise whose template-2 execution prompt would not fit 64 KiB, before any authority write',async t=>{
 const integration=await import('../scripts/team-integration.mjs');let pad=0;
 const f=await rejected(t,{integration:{readWorkInputs:o=>{const r=integration.readWorkInputs(o);return {...r,files:r.files.map(x=>({...x,content:x.content+'x'.repeat(pad)}))};}}});
 const w=work(f),inputs=integration.readWorkInputs({projectRoot:f.root,base:w.manifest.base,paths:w.paths});
 const one=Buffer.byteLength(formatWorkPromptHead(w.manifest)+'\n'+JSON.stringify({base:inputs.base,files:inputs.files.map(x=>({path:x.path,content:x.content}))}));
 pad=65536-one-8;
 const revision=f.load().revision;
 assert.throws(()=>f.host.reviseNativeWork({workId:'fix-sum',reason:'again'}),/host-native-work-revise-prompt-too-large/);
 assert.equal(f.load().revision,revision);assert.equal(work(f).generation,1);
});
