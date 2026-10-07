import test from 'node:test';
import assert from 'node:assert/strict';
import { authorityFixture, at, now, expiry } from './helpers/native-calibration.mjs';
import { reduceTeamEvent } from '../scripts/team-state.mjs';
import { routingDigest } from '../scripts/model-routing.mjs';

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

test('an owner work ceiling admits only leader-baseline with pinned allocations, and a manifest records unqualified leader work',async()=>{
 const {state,unit}=await activeTeam();
 assert.throws(()=>send(state,'native-work-enable-v2',{revision:1,policy:workPolicy(unit,state,{executor:'calibrated-bounded-edit'})}),/native-work-implementation-coverage-required/);
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
test('the manifest gate re-selects at this time: a critic that lapsed since the cached election blocks it, and a Codex leader is refused',async()=>{
 const {state}=await enabled(),t=state.teams.team;
 const lapsed=structuredClone(state);for(const p of Object.values(lapsed.teams.team.participants))if(p.id!==t.leader)p.availability='busy';
 assert.equal(lapsed.teams.team.review_candidate!==null,true,'the cached election still names a critic');
 assert.throws(()=>send(lapsed,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()}),/native-work-active-leader-required/);
 const codex=structuredClone(state);codex.teams.team.participants[t.leader].harness='codex';
 assert.throws(()=>send(codex,'native-work-manifest-v2',{work_id:'w1',manifest:manifest()}),/no-tools-context-required/);
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
