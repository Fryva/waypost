import test from 'node:test';
import assert from 'node:assert/strict';
import {authorityFixture,now,at} from './helpers/native-calibration.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {listedReviewer} from '../scripts/team.mjs';
import {collectNativeProtocolQuota,serializeNativeProtocolQuota,selectNativeQuotaFrontier} from '../scripts/team-native-quota.mjs';
import {createProtocolHandoverAckRequest} from '../scripts/team-native-action.mjs';

// ADR owner-assigned-team-roles, slice 5: what happens when a listed participant loses its role, and the quota hand-over.
const legacy={protocol:1,revision:1,domain:'coding',mode:'automatic',generated_at:at,expires_at:new Date(now+600000).toISOString(),sources:[{id:'fixture',url:'https://example.org/fixture',retrieved_at:at}],evidence_floor:['adapter-observed'],profiles:[]};
const until=new Date(now+86400000).toISOString(),expiry=new Date(now+600000).toISOString(),clone=structuredClone;
const billing=name=>({provider:'route',origin:'https://provider.fixture',account:routingDigest('quota-account-'+name),sku:'fixture-subscription',mode:'subscription',paid_fallback:false,provenance:'native-runtime',auth_method:'native-fixture',credit_availability:'unavailable',observed_at:at,account_generation:0,consistent:true});
let shared;
const crit=['The function returns the sum'];
const manifest=(patch={})=>({protocol:2,goal:'Fix the sum function',criteria:crit,criteria_digest:routingDigest(crit),paths:['src/sum.js'],base:'a'.repeat(40),forbidden_actions:[],...patch});
let seq=0;
const send=(state,type,fields={},actor='owner:fixture',clock=at)=>reduceTeamEvent(state,{type,team:'team',actor,at:clock,request_key:type+'-'+(++seq),epoch:state.teams.team.epoch,...fields});
// An active owner-assigned team: peer-a coordinates (peer-b is the alternate), peer-b and peer-c review, peer-d executes.
async function team({coordinator=['peer-a','peer-b'],reviewers=['peer-b','peer-c'],work=true,executors=['peer-d'],second=false}={}){
 shared??=authorityFixture({identityOnly:{},billing:name=>billing('peer-'+name)});const f=await shared,s=clone(f.state);
 Object.assign(s,{protocol:1,owner_hash:'fixture',task_bindings:{task:'team'}});Object.assign(s.teams.team,{task:'task',policy:legacy,messages:[],work:{},status:'forming',leader:null,candidate:null,required_review_models:[],native_policy_bootstrap:true});
 let state=reduceTeamEvent(s,{type:'native-policy-assign-v2',team:'team',actor:'owner:fixture',at,request_key:'assign',expected_policy_revision:1,coordinator,reviewers,executors,reason:'the owner chose these roles',expires_at:until,issued_by:{harness:'claude',session:'session-1'}}).state;
 const t=state.teams.team;t.leader=t.candidate;t.candidate=null;t.status='active';
 const unit=Object.keys(state.subscription_allocations)[0];
 if(work){
  state=send(state,'native-work-enable-v2',{revision:1,policy:{kind:'protocol-work',executor:'owner-assigned',allow_unknown_quota:true,max_attempts:2,timeout_ms:60000,expires_at:until,ceilings:{execution:{max_calls:2,max_estimate_tokens:'8000'},review:{max_calls:2,max_estimate_tokens:'8000'}},unit_allocations:[{unit_digest:unit,max_tokens:'100000',allocation_revision:state.subscription_allocations[unit].revision}]}}).state;
  state=send(state,'native-work-manifest-v2',{work_id:'w1',manifest:manifest({executor_participant:'peer-d'})}).state;
  // Several works (owner, 2026-10-11): a second one on another path, by another executor.
  if(second)state=send(state,'native-work-manifest-v2',{work_id:'w2',manifest:manifest({paths:['src/other.js'],executor_participant:'peer-c'})}).state;
 }
 return state;
}
const T=s=>s.teams.team;
const revoke=(s,id)=>send(s,'revoke',{participant_id:id}).state;
const leave=(s,id)=>send(s,'availability',{availability:'left',incarnation:T(s).participants[id].incarnation},id).state;
const descriptor=(m,revision,action)=>({provider:m.provider,model_id:m.model_id,reasoning:m.reasoning,model_revision:revision,resolved:true,evidence:{kind:'owner-attested',source:'fixture',observed_at:at,action}});
const rebind=(s,id)=>{const m=T(s).participants[id].model;return send(s,'attest',{participant_id:id,model:descriptor(m,m.model_revision+1,'attest')}).state;};
const collectorRevoke=(s,id)=>send(s,'collector-revoke-v1',{collector_id:T(s).participants[id].native_binding.collector_id}).state;
const LOSSES={revoked:revoke,left:leave,rebound:rebind,'collector revoked':collectorRevoke};
const busy=(s,id)=>send(s,'availability',{availability:'busy',incarnation:T(s).participants[id].incarnation},id).state;

test('a leader who loses the role latches the assignment: paused, nobody elected, its cancellable work cancelled, no resume, close passes',async()=>{
 for(const [name,lose] of Object.entries(LOSSES)){
  const s0=await team();assert.equal(T(s0).assignment_lost,undefined,name);assert.equal(T(s0).work.w1.status,'manifest');
  const s=lose(s0,'peer-a'),t=T(s);
  assert.equal(t.assignment_lost.participant,'peer-a',name);assert.equal(t.assignment_lost.at,at);assert.ok(t.assignment_lost.reason,name);
  assert.equal(t.status,'paused',name);assert.equal(t.candidate,null,name);assert.equal(t.review_candidate,null,name);
  assert.equal(t.work.w1.status,'cancelled',name);assert.equal(t.work.w1.cancel_reason,'owner-assigned-role-lost');assert.equal(t.work.w1.cancelled_at,at);
  assert.throws(()=>send(s,'native-leader-resume-v2'),/native-resume-assignment-lost/,name);
  // Later events elect nobody, even with the alternate ready and holding its role.
  const later=busy(s,'peer-c');
  assert.equal(T(later).status,'paused',name);assert.equal(T(later).candidate,null,name);assert.equal(T(later).assignment_lost.participant,'peer-a',name);
  const closed=send(later,'close-v1');
  assert.deepEqual(closed.result,{closed:'team'},name);assert.equal(T(closed.state).status,'closed',name);
 }
});
test('a team whose leader holds the role is not touched, and a newcomer takes no role',async()=>{
 const s=await team(),t=T(s);
 const joined=send(s,'join',{participant:{id:'peer-e',incarnation:'inc-e',session:'s-e',harness:'opencode',root:'/fixture',credential_hash:'x'.repeat(8),model:descriptor({...t.participants['peer-d'].model,model_id:'model-e'},1,'join')}}).state,u=T(joined);
 assert.equal(u.assignment_lost,undefined);assert.equal(u.status,'active');assert.equal(u.leader,'peer-a');assert.equal(u.work.w1.status,'manifest');
 assert.equal(u.participants['peer-e'].native_admission,undefined);
 assert.equal(u.policy.profiles.some(r=>r.participant==='peer-e'),false);
 assert.equal(listedReviewer(Object.values(u.participants),u.policy,{excluded:['peer-a'],now}).reviewer.id,'peer-b','the newcomer reviews nothing');
});
test('an executor who loses the role loses its work; the team goes on',async()=>{
 for(const [name,lose] of Object.entries(LOSSES)){
  const s=lose(await team(),'peer-d'),t=T(s);
  assert.equal(t.work.w1.status,'cancelled',name);assert.equal(t.work.w1.cancel_reason,'owner-assigned-role-lost');
  assert.equal(t.assignment_lost,undefined,name);assert.equal(t.status,'active',name);assert.equal(t.leader,'peer-a',name);
 }
});
test('losing one executor cancels only its works; losing the coordinator cancels every work (owner, 2026-10-11)',async()=>{
 for(const [name,lose] of Object.entries(LOSSES)){
  const s0=await team({executors:['peer-d','peer-c'],second:true});assert.equal(T(s0).work.w2.worker,'peer-c',name);
  const executor=T(lose(s0,'peer-d')),other=T(lose(s0,'peer-c'));
  assert.deepEqual([executor.work.w1.status,executor.work.w2.status],['cancelled','manifest'],name);assert.equal(executor.work.w1.cancel_reason,'owner-assigned-role-lost');assert.equal(executor.status,'active',name);
  assert.deepEqual([other.work.w1.status,other.work.w2.status],['manifest','cancelled'],name);
  const leader=T(lose(s0,'peer-a'));assert.deepEqual([leader.work.w1.status,leader.work.w2.status],['cancelled','cancelled'],name);assert.equal(leader.assignment_lost.participant,'peer-a',name);
 }
});
test('a work with a consumed call or an open publication is left alone and cancelled on a later event',async()=>{
 const s0=await team(),s=clone(s0);s.subscription_invocations.held={id:'held',team:'team',work:{work_id:'w1'},state:'consumed'};
 const lost=revoke(s,'peer-a');
 assert.equal(T(lost).assignment_lost.participant,'peer-a');assert.equal(T(lost).work.w1.status,'manifest','the consumed call needs its reconciled closure first');
 const settled=clone(lost);settled.subscription_invocations.held.state='reconciled';
 assert.equal(T(busy(settled,'peer-c')).work.w1.status,'cancelled','retried on the next event');
 const open=clone(s0);T(open).native_integration={work_id:'w1',state:'prepared'};
 assert.equal(T(revoke(open,'peer-d')).work.w1.status,'manifest','an open publication is aborted by the owner first');
});
test('a reviewer who loses the role is out; the next listed reviewer is the top, nothing else changes',async()=>{
 for(const [name,lose] of Object.entries(LOSSES)){
  const s0=await team(),all=u=>Object.values(T(u).participants);
  assert.equal(listedReviewer(all(s0),T(s0).policy,{excluded:['peer-a'],now}).reviewer.id,'peer-b');
  const s=lose(s0,'peer-b'),t=T(s);
  assert.equal(t.assignment_lost,undefined,name);assert.equal(t.status,'active',name);assert.equal(t.work.w1.status,'manifest',name);
  const top=listedReviewer(all(s),t.policy,{excluded:['peer-a'],now});assert.equal(top.reviewer.id,'peer-c',name);assert.equal(top.floor,1,name);
 }
});

const exhausted=async(s,id,clock=now)=>{
 const t=T(s),p=t.participants[id],record=await collectNativeProtocolQuota({state:s,team:t,participant:p,sourceInvocationId:'subscription-'+id.slice(-1)+'-identity',now:clock,observe:async b=>({protocol:2,observation_id:'provider-'+id,status:'exhausted',reason:'provider-quota-exhausted',source:'https://provider.fixture/quota',method:'GET /quota',evidence_kind:'provider-quota',provider_code:'subscription_exhausted',scope:'provider-account',documentation:'https://provider.fixture/docs/quota',provider_confirmed:true,billing_digest:routingDigest(b.billing),observed_at:new Date(clock).toISOString(),expires_at:new Date(clock+60000).toISOString()})});
 return send(s,'native-protocol-quota-capture-v2',{observation:serializeNativeProtocolQuota(record)},'collector:'+p.native_binding.collector_id,new Date(clock).toISOString());
};
const enableQuota=s=>send(s,'native-protocol-quota-enable-v2',{revision:1,policy:{automatic_handover:true,expires_at:expiry,source_rules:['available','exhausted'].flatMap(status=>['a','b','c','d'].map(n=>({status,documentation:'https://provider.fixture/docs/quota',collector_id:'collector-'+n,source:'https://provider.fixture/quota',method:'GET /quota',evidence_kind:'provider-quota',provider_code:'subscription_'+status,scope:'provider-account'})))}}).state;
test('the quota hands over to the next listed coordinator with its own reviewer, and never back to the primary',async()=>{
 const s0=enableQuota(await team({work:false})),{state:s,result}=await exhausted(s0,'peer-a'),t=T(s);
 assert.equal(t.assignment_lost,undefined);assert.equal(result.candidate,'peer-b');assert.equal(t.candidate,'peer-b');assert.equal(t.status,'handover');assert.equal(t.review_candidate,'peer-c','the reviewer is the listed one next to the new coordinator');
 assert.equal(selectNativeQuotaFrontier(t,now).candidate,'peer-b');
 // The next event keeps the election instead of falling back to the sitting leader.
 const kept=T(busy(s,'peer-d'));assert.equal(kept.candidate,'peer-b');assert.equal(kept.status,'handover');
 // Once the alternate sits, the primary's returning quota does not take the seat back.
 const seated=clone(s),st=T(seated);Object.assign(st,{leader:'peer-b',candidate:null,status:'active',epoch:st.epoch+1});delete st.native_quota_freeze;st.native_protocol_handover.state='applied';
 const frontier=selectNativeQuotaFrontier(st,now);assert.equal(frontier.candidate,'peer-b');assert.equal(frontier.reviewer,'peer-c');assert.equal(frontier.blocker,null);
});
test('the quota hand-over request pins the assignment digests of the alternate and its reviewer',async()=>{
 const {state:s}=await exhausted(enableQuota(await team({work:false})),'peer-a'),fenced=clone(s),ft=T(fenced);
 Object.assign(ft.native_protocol_handover,{state:'prepared',candidate:'peer-b',reviewer:'peer-c',old_leader:'peer-a',old_epoch:ft.epoch,target_epoch:ft.epoch+1,quota_revision:ft.native_quota_revision,policy_revision:ft.policy.revision,policy_digest:routingDigest(ft.policy),trigger_digest:ft.native_quota_freeze.trigger_digest,roster_digest:routingDigest(Object.values(ft.participants).map(p=>[p.id,p.incarnation,p.model?.model_revision,p.native_binding?.descriptor_digest,p.native_admission?.identity,p.availability,p.revoked,p.native_protocol_quota??null,p.native_account_exclusions??null]))});
 const req=createProtocolHandoverAckRequest(fenced,ft,{actionId:'handover',now}).request;
 assert.equal(req.participant,'peer-b');assert.ok(req.assignment_digest);assert.equal(req.calibration_digest,undefined);assert.equal(req.review_candidate.participant,'peer-c');assert.ok(req.review_candidate.assignment_digest);assert.equal(req.review_candidate.calibration_digest,undefined);
 assert.ok(!JSON.stringify(req).includes('undefined'));
});
test('no listed alternate with an independent reviewer: the quota latches the assignment',async()=>{
 const {state:s}=await exhausted(enableQuota(await team({coordinator:['peer-a'],work:false})),'peer-a'),t=T(s);
 assert.equal(t.assignment_lost.participant,'peer-a');assert.equal(t.assignment_lost.reason,'quota-no-listed-alternate');assert.equal(t.status,'paused');assert.equal(t.candidate,null);assert.equal(t.review_candidate,null);
 assert.throws(()=>send(s,'native-leader-resume-v2'),/native-resume-assignment-lost/);
});
