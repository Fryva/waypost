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
 assert.equal(f.host.reviseNativeWork({workId:'fix-sum',reason:'address the finding'}).unchanged,true);
 f.prompts.length=0;
 const x=await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});
 assert.equal(x.attempt,2);assert.equal(x.status,'sealed');assert.match(x.dispatch.patch_ref,/\/fix-sum\/2-2-/);
 const prompt=f.prompts.find(p=>p.purpose==='protocol-work').prompt;
 assert.ok(prompt.startsWith(formatWorkPromptHead(w.manifest,w.revision)+'\n'));assert.ok(prompt.includes('"revision":{"generation":2,"findings":'));assert.ok(prompt.includes('unverified claims'));
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
 assert.throws(()=>cmd(f,ok,edit(s=>{s.teams.team.participants[s.teams.team.leader].incarnation='other';})),/native-work-(worker-identity-changed|active-leader-required)/);
 const fenced=cmd(f,ok,edit(s=>{s.publication_fence={team:'team',reservation:'r',work:'other',protocol:2};}));
 assert.equal(fenced.result.deferred,true);assert.equal(fenced.state.teams.team.work['fix-sum'].generation,1);
 assert.equal(w.status,'changes-requested');
});
test('a blocked verdict may be revised and the source verdict is recorded; revised work can still be cancelled and the team closed',async t=>{
 const f=await rejected(t,{workReviewVerdict:'blocked'});
 assert.equal(work(f).status,'blocked');
 assert.equal(f.host.reviseNativeWork({workId:'fix-sum',reason:'try again'}).source_verdict,'blocked');
 assert.equal(work(f).generations[0].verdict,'blocked');
 assert.equal(f.host.cancelNativeWork({workId:'fix-sum',reason:'stop'}).cancelled,'fix-sum');
 assert.equal(cmd(f,{type:'close-v1'}).result.closed,'team');
});
