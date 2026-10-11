import test from 'node:test';
import assert from 'node:assert/strict';
import { authorityFixture, at, now, expiry } from './helpers/native-calibration.mjs';
import { reduceTeamEvent } from '../scripts/team-state.mjs';
import { routingDigest } from '../scripts/model-routing.mjs';
import { implementGate, rankParticipant } from '../scripts/team.mjs';
import { workManifestDigest } from '../scripts/team-native-work.mjs';

const legacy={protocol:1,revision:1,domain:'coding',mode:'automatic',generated_at:at,expires_at:expiry,sources:[{id:'fixture',url:'https://example.org/fixture',retrieved_at:at}],evidence_floor:['adapter-observed'],profiles:[]};
let shared;
// A protocol 2 team whose installed policy elected a leader and an independent critic (fixture activation, no ACK minted).
async function activeTeam(){
 shared??=authorityFixture();const f=await shared,s=structuredClone(f.state);
 Object.assign(s,{protocol:1,owner_hash:'fixture',task_bindings:{task:'team'}});Object.assign(s.teams.team,{task:'task',policy:legacy,messages:[],work:{},status:'forming',leader:null,candidate:null,required_review_models:[],native_policy_bootstrap:true});
 const state=reduceTeamEvent(s,{type:'native-policy-install-v2',team:'team',actor:'owner:fixture',at,request_key:'install',cohort_id:'cohort',expected_policy_revision:1,scope:'waypost-protocol'},{revision:f.revision}).state,t=state.teams.team;
 t.leader=t.candidate;t.candidate=null;t.status='active';
 return {state,unit:Object.keys(state.subscription_allocations)[0]};
}
const send=(state,type,fields={},actor='owner:fixture')=>reduceTeamEvent(state,{type,team:'team',actor,at,request_key:type+'-'+Math.random(),epoch:state.teams.team.epoch,...fields});
const workPolicy=(unit,state,patch={})=>({kind:'protocol-work',executor:'leader-baseline',allow_unknown_quota:true,max_attempts:2,timeout_ms:60000,expires_at:expiry,ceilings:{execution:{max_calls:2,max_estimate_tokens:'8000'},review:{max_calls:2,max_estimate_tokens:'8000'}},unit_allocations:[{unit_digest:unit,max_tokens:'50000',allocation_revision:state.subscription_allocations[unit].revision}],...patch});
const criteria=['The function returns the sum'];
const manifest=(patch={})=>({protocol:2,goal:'Fix the sum function',criteria,criteria_digest:routingDigest(criteria),paths:['src/sum.js'],base:'a'.repeat(40),forbidden_actions:['network'],...patch});
async function enabled(){const {state,unit}=await activeTeam();return {state:send(state,'native-work-enable-v2',{revision:1,policy:workPolicy(unit,state)}).state,unit};}

test('an owner work ceiling admits leader-baseline or a calibrated executor with pinned allocations, and a manifest records unqualified leader work',async()=>{
 const {state,unit}=await activeTeam();
 // Without a waypost-bounded-edit gate the calibrated mode enables but no executor qualifies.
 const calibratedOn=send(state,'native-work-enable-v2',{revision:1,policy:workPolicy(unit,state,{executor:'calibrated-bounded-edit'})}).state;
 assert.throws(()=>send(calibratedOn,'native-work-manifest-v2',{work_id:'w1',manifest:manifest({forbidden_actions:[],executor_participant:'peer-b'})}),/native-work-implementation-coverage-required/);
 assert.throws(()=>send(state,'native-work-enable-v2',{revision:1,policy:workPolicy(unit,state,{unit_allocations:[{unit_digest:unit,max_tokens:'50000',allocation_revision:99}]})}),/existing-work-unit-allocation-required/);
 assert.throws(()=>send(state,'native-work-enable-v2',{revision:1,policy:workPolicy(unit,state,{expires_at:new Date(Date.parse(expiry)+1).toISOString()})}),/bounded-owner-work-ceiling-required/);
 assert.throws(()=>send(state,'native-work-enable-v2',{revision:1,policy:workPolicy(unit,state)},'peer-a'),/owner-required/);
 const on=send(state,'native-work-enable-v2',{revision:1,policy:workPolicy(unit,state)}).state;
 const r=send(on,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()}),w=r.state.teams.team.work.w1;
 assert.equal(w.protocol,2);assert.equal(w.status,'manifest');assert.equal(w.worker,on.teams.team.leader);assert.equal(w.label,'unqualified-strongest-baseline');assert.equal(r.result.protected_actions_granted,false);
});
test('a manifest refuses unsafe paths, a wrong criteria digest or base, a second work in flight, an inactive team and a negative audit of the current leader',async()=>{
 const {state}=await enabled();
 for(const [name,patch,code] of [['absolute',{paths:['/etc/x']},/invalid-path/],['dot-dot',{paths:['a/../b']},/invalid-path/],['git',{paths:['.git/config']},/invalid-path/],['colon',{paths:['a:b']},/invalid-path/],['case collision',{paths:['A.js','a.js']},/path-collision/],['not NFC',{paths:['café.js']},/invalid-path/],['criteria digest',{criteria_digest:'0'.repeat(64)},/criteria-digest/],['base',{base:'HEAD'},/base-commit/],['dependencies',{dependencies:[]},/exact-object/]])
  assert.throws(()=>send(state,'native-work-manifest-v2',{work_id:'w1',manifest:manifest(patch)}),code,name);
 assert.throws(()=>send(state,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()},'peer-a'),/owner-required/);
 const one=send(state,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()}).state;
 assert.throws(()=>send(one,'native-work-manifest-v2',{work_id:'w2',manifest:manifest()}),/native-work-one-at-a-time/);
 const paused=structuredClone(state);paused.teams.team.status='paused';assert.throws(()=>send(paused,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()}),/active-leader-required/);
 const frozen=structuredClone(state);frozen.teams.team.native_quota_freeze={};assert.throws(()=>send(frozen,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()}),/quota-handover-pending/);
 const audited=structuredClone(state),t=audited.teams.team;audited.subscription_invocations.ack={id:'ack',team:'team',action_ack:{leader:t.leader,epoch:t.epoch}};t.native_protocol_reviews={x:{unresolved_negative:true,records:[{source_invocation_id:'ack'}]}};
 assert.throws(()=>send(audited,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()}),/unresolved-negative-leadership-audit/);
 const noPolicy=(await activeTeam()).state;assert.throws(()=>send(noPolicy,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()}),/owner-ceiling-required/);
});
test('the owner cancels unfinished work in any status, but not while a call for it is consumed',async()=>{
 const {state}=await enabled(),one=send(state,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()}).state;
 const paused=structuredClone(one);paused.teams.team.status='paused';
 const r=send(paused,'native-work-cancel-v2',{work_id:'w1',reason:'critic gone'});assert.equal(r.state.teams.team.work.w1.status,'cancelled');
 assert.throws(()=>send(r.state,'native-work-cancel-v2',{work_id:'w1',reason:'again'}),/unfinished-work-required/);
 const busy=structuredClone(one);busy.subscription_invocations.call={id:'call',team:'team',state:'consumed',work:{work_id:'w1'}};
 assert.throws(()=>send(busy,'native-work-cancel-v2',{work_id:'w1',reason:'x'}),/reconciled-closure-required/);
 const activeCancel=send(one,'native-work-cancel-v2',{work_id:'w1',reason:'replan'}).state,next=send(activeCancel,'native-work-manifest-v2',{work_id:'w2',manifest:manifest()});assert.equal(next.state.teams.team.work.w2.status,'manifest','a cancelled work no longer blocks the next');
});
test('pending v2 work blocks a new ceiling; protocol 1 rewrites leave it alone; a publication fence defers the owner events',async()=>{
 const {state,unit}=await enabled(),one=send(state,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()}).state;
 assert.throws(()=>send(one,'native-work-enable-v2',{revision:2,policy:workPolicy(unit,one)}),/unfinished-policy-migration/);
 const leader=one.teams.team.leader,revoked=send(one,'revoke',{participant_id:leader});assert.equal(revoked.state.teams.team.work.w1.status,'manifest');
 const fenced=structuredClone(state);fenced.publication_fence={team:'team'};const d=send(fenced,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()});assert.equal(d.result.deferred,true);assert.equal(d.state.teams.team.work.w1,undefined);
});
test('the manifest gate re-selects at this time: a critic that lapsed since the cached election blocks it, and an admitted Codex leader is accepted',async()=>{
 const {state}=await enabled(),t=state.teams.team;
 const lapsed=structuredClone(state);for(const p of Object.values(lapsed.teams.team.participants))if(p.id!==t.leader)p.availability='busy';
 assert.equal(lapsed.teams.team.review_candidate!==null,true,'the cached election still names a critic');
 assert.throws(()=>send(lapsed,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()}),/native-work-active-leader-required/);
 // An admitted Codex leader is no longer refused: admission needs a verified tool surface.
 const codex=structuredClone(state);codex.teams.team.participants[t.leader].harness='codex';
 assert.equal(send(codex,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()}).state.teams.team.work.w1.worker,t.leader);
 assert.throws(()=>send(state,'native-work-manifest-v2',{work_id:'w1',manifest:manifest(),extra:1}),/command-fields-required/);
});
test('only an unresolved negative audit of the current acknowledgement blocks; approvals and other acknowledgements do not',async()=>{
 const {state}=await enabled(),t=state.teams.team;
 const approve=structuredClone(state);approve.subscription_invocations.ack={id:'ack',team:'team',action_ack:{leader:t.leader,epoch:t.epoch}};approve.teams.team.native_protocol_reviews={x:{unresolved_negative:false,records:[{source_invocation_id:'ack'}]}};
 assert.equal(send(approve,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()}).state.teams.team.work.w1.status,'manifest');
 const other=structuredClone(state);other.subscription_invocations.old={id:'old',team:'team',action_ack:{leader:t.leader,epoch:t.epoch-1}};other.teams.team.native_protocol_reviews={x:{unresolved_negative:true,records:[{source_invocation_id:'old'}]}};
 assert.equal(send(other,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()}).state.teams.team.work.w1.status,'manifest');
});
test('cancel refuses while a call for the work is uncertain',async()=>{
 const {state}=await enabled(),one=send(state,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()}).state;
 one.subscription_invocations.call={id:'call',team:'team',state:'uncertain',work:{work_id:'w1'}};
 assert.throws(()=>send(one,'native-work-cancel-v2',{work_id:'w1',reason:'x'}),/reconciled-closure-required/);
});

// Contract 29(b), slice 4: a team whose policy carries the waypost-bounded-edit gate.
let sharedImplement;
async function implementTeam(){
 sharedImplement??=authorityFixture({roles:['coordinate','review','implement']});const f=await sharedImplement,s=structuredClone(f.state);
 Object.assign(s,{protocol:1,owner_hash:'fixture',task_bindings:{task:'team'}});Object.assign(s.teams.team,{task:'task',policy:legacy,messages:[],work:{},status:'forming',leader:null,candidate:null,required_review_models:[],native_policy_bootstrap:true});
 const state=reduceTeamEvent(s,{type:'native-policy-install-v2',team:'team',actor:'owner:fixture',at,request_key:'install',cohort_id:'cohort',expected_policy_revision:1,scope:'waypost-protocol'},{revision:f.revision}).state,t=state.teams.team;
 t.leader=t.candidate;t.candidate=null;t.status='active';
 const unit=Object.keys(state.subscription_allocations)[0];
 return {state:send(state,'native-work-enable-v2',{revision:1,policy:workPolicy(unit,state,{executor:'calibrated-bounded-edit'})}).state};
}
test('implementGate admits only a current admission with the bounded-edit coverage',async()=>{
 const {state}=await implementTeam(),t=state.teams.team;
 for(const p of Object.values(t.participants))assert.equal(implementGate(p,t.policy,now),true,p.id);
 const changed=structuredClone(t.participants['peer-a']);changed.incarnation='other';assert.equal(implementGate(changed,t.policy,now),false);
 assert.equal(implementGate(t.participants['peer-a'],t.policy,Date.parse(t.policy.expires_at)),false);
 assert.equal(rankParticipant(t.participants['peer-a'],t.policy,'implement',{coverage:'waypost-bounded-edit',now}),null);
});
test('a calibrated manifest pins the executor and is refused when no independent critic remains without it (O10)',async()=>{
 const {state}=await implementTeam(),t=state.teams.team,executor=t.review_candidate;
 const calibratedManifest=manifest({forbidden_actions:[],executor_participant:executor});
 const r=send(state,'native-work-manifest-v2',{work_id:'w1',manifest:calibratedManifest}),w=r.state.teams.team.work.w1;
 assert.equal(w.worker,executor);assert.equal(w.executor,'calibrated-bounded-edit');assert.equal(w.label,'calibrated-bounded-edit');
 const alone=structuredClone(state);for(const p of Object.values(alone.teams.team.participants))if(![t.leader,executor].includes(p.id))p.availability='busy';
 assert.throws(()=>send(alone,'native-work-manifest-v2',{work_id:'w1',manifest:calibratedManifest}),/native-work-strongest-independent-review-unavailable/);
 const codex=structuredClone(state);codex.teams.team.participants[executor].harness='codex';
 assert.equal(send(codex,'native-work-manifest-v2',{work_id:'w1',manifest:calibratedManifest}).state.teams.team.work.w1.worker,executor);
 const revisable=structuredClone(r.state);Object.assign(revisable.teams.team.work.w1,{status:'changes-requested',result:{}});
 assert.throws(()=>send(revisable,'native-work-revise-v2',{work_id:'w1',generation:1,findings_digest:'0'.repeat(64),reason:'again'}),/native-work-calibrated-revision-unsupported/);
});
test('an unnamed calibrated manifest is refused when no executor passes every gate, and a foreign counter unit excludes one',async()=>{
 const {state}=await implementTeam(),t=state.teams.team,unnamed=manifest({forbidden_actions:[]});
 const alone=structuredClone(state);for(const p of Object.values(alone.teams.team.participants))alone.subscription_invocations[p.native_admission.source_invocation].unit_digest='f'.repeat(64);
 assert.throws(()=>send(alone,'native-work-manifest-v2',{work_id:'w1',manifest:unnamed}),/native-work-no-eligible-executor/);
 const foreign=structuredClone(state),p=foreign.teams.team.participants[t.review_candidate];foreign.subscription_invocations[p.native_admission.source_invocation].unit_digest='f'.repeat(64);
 assert.throws(()=>send(foreign,'native-work-manifest-v2',{work_id:'w1',manifest:manifest({forbidden_actions:[],executor_participant:p.id})}),/native-work-unit-allocation-required/);
 assert.ok(!send(foreign,'native-work-manifest-v2',{work_id:'w1',manifest:unnamed}).state.teams.team.work.w1.assignment.candidates.includes(p.id));
 // The strongest critic is picked only as the sole candidate.
 const sole=structuredClone(state);for(const q of Object.values(sole.teams.team.participants))if(q.id!==t.review_candidate)sole.subscription_invocations[q.native_admission.source_invocation].unit_digest='f'.repeat(64);
 const w=send(sole,'native-work-manifest-v2',{work_id:'w1',manifest:unnamed}).state.teams.team.work.w1;
 assert.deepEqual(w.assignment.candidates,[t.review_candidate]);assert.equal(w.worker,t.review_candidate);
 assert.throws(()=>send(state,'native-work-manifest-v2',{work_id:'w1',manifest:manifest({forbidden_actions:[],executor_participant:[t.review_candidate]})}),/native-work-ready-executor-required/);
});

// Dependent work (owner decisions 2026-10-11): `depends_on` names integrated protocol 2 work; the base is the tip of a chain of them.
const A='a1'.repeat(20),B='b2'.repeat(20),C='c3'.repeat(20);
const integrated=(state,id,commit,base,patch={})=>{const s=structuredClone(state);s.teams.team.work[id]={protocol:2,id,status:'integrated',commit,manifest:{base},integrated_evidence:{protocol:2,commit},...patch};return s;};
const dependent=(state,deps,base,id='w9')=>send(state,'native-work-manifest-v2',{work_id:id,manifest:manifest({base,depends_on:deps})});
test('a dependent manifest refuses a malformed depends_on, and a dependency that is not integrated protocol 2 work with evidence of its commit',async()=>{
 const {state}=await enabled(),done=integrated(state,'wa',A,'f'.repeat(40));
 for(const [name,deps] of [['empty',[]],['not an array','wa'],['duplicate',['wa','wa']],['bad id',['../x']],['not a string',[1]],['too many',Array.from({length:17},(_,i)=>'w'+i)]])assert.throws(()=>dependent(done,deps,A),/native-work-dependencies-invalid/,name);
 for(const [name,deps] of [['unknown',['nobody']],['the work itself',['w9']]])assert.throws(()=>dependent(done,deps,A),/native-work-dependency-not-integrated/,name);
 for(const [name,patch] of [['unfinished',{status:'approved'}],['cancelled',{status:'cancelled'}],['protocol 1 forged as 2',{integrated_evidence:{protocol:1,commit:A}}],['evidence of another commit',{integrated_evidence:{protocol:2,commit:B}}],['no commit',{commit:undefined}],['protocol 1',{protocol:1}]])
  assert.throws(()=>dependent(integrated(state,'wa',A,'f'.repeat(40),patch),['wa'],A),/native-work-dependency-not-integrated/,name);
});
test('the base of a dependent manifest is the commit of its tip, and several dependencies are accepted only as a chain',async()=>{
 const {state}=await enabled();let s=integrated(state,'wa',A,'f'.repeat(40));
 assert.throws(()=>dependent(s,['wa'],'f'.repeat(40)),/native-work-dependency-base-required/,'the base is not a dependency commit');
 const one=dependent(s,['wa'],A).state.teams.team.work.w9;assert.deepEqual(one.manifest.depends_on,['wa']);assert.equal(one.manifest_digest,workManifestDigest(one.manifest));
 assert.notEqual(one.manifest_digest,workManifestDigest({...one.manifest,depends_on:undefined}),'depends_on is covered by the digest');
 s=integrated(s,'wb',B,A);
 assert.throws(()=>dependent(s,['wb'],A),/native-work-dependency-base-required/,'the base names a work that is not listed');
 assert.equal(dependent(s,['wa','wb'],B).state.teams.team.work.w9.worker,s.teams.team.leader,'a chain [A, B] built from the commit of B');
 assert.equal(dependent(s,['wb','wa'],B).result.work,'w9','the order of the list does not matter');
 assert.throws(()=>dependent(s,['wa','wb'],A),/native-work-dependency-chain-required/,'B is not behind the tip A');
 // A sister of B on the same base is not in the chain of B.
 s=integrated(s,'wc',C,A);
 assert.throws(()=>dependent(s,['wb','wc'],C),/native-work-dependency-chain-required/);assert.throws(()=>dependent(s,['wb','wc'],B),/native-work-dependency-chain-required/);
 assert.equal(dependent(s,['wa','wc'],C).result.work,'w9');
});
test('a manifest without depends_on is unchanged and carries no such key',async()=>{
 const {state}=await enabled(),w=send(state,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()}).state.teams.team.work.w1;
 assert.equal(Object.hasOwn(w.manifest,'depends_on'),false);assert.equal(w.manifest_digest,workManifestDigest(manifest()));assert.equal(Object.hasOwn(w,'depends_on'),false);
});
