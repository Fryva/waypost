import test from 'node:test';
import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readAuthority,mutateAuthority} from '../scripts/team-store.mjs';
import assert from 'node:assert/strict';
import { authorityFixture,now,at,expiry } from './helpers/native-calibration.mjs';
import { reduceTeamEvent } from '../scripts/team-state.mjs';
import { rankParticipant } from '../scripts/team.mjs';
const legacy={protocol:1,revision:1,domain:'coding',mode:'automatic',generated_at:at,expires_at:expiry,sources:[{id:'fixture',url:'https://example.org/fixture',retrieved_at:at}],evidence_floor:['adapter-observed'],profiles:[]};
let shared;
async function fixture(){shared??=authorityFixture();const f=await shared;const s=structuredClone(f.state);Object.assign(s,{protocol:1,owner_hash:'fixture',task_bindings:{task:'team'}});Object.assign(s.teams.team,{task:'task',policy:legacy,messages:[],work:{},status:'forming',leader:null,candidate:null,required_review_models:[],native_policy_bootstrap:true});return {...f,state:s};}
const command=(fields={})=>({type:'native-policy-install-v2',team:'team',actor:'owner:fixture',at,request_key:'install',cohort_id:'cohort',expected_policy_revision:1,scope:'waypost-protocol',...fields});
const install=f=>reduceTeamEvent(f.state,command(),{revision:f.revision});
test('native install atomically compiles authenticated captures, admits identities and elects only a candidate',async()=>{
 const f=await fixture(),original=structuredClone(f.state),r=install(f),t=r.state.teams.team;
 assert.deepEqual(f.state,original);assert.equal(t.policy.protocol,2);assert.equal(t.policy.provenance.authority_revision,f.revision);assert.equal(t.policy.revision,2);
 assert.ok(['peer-a','peer-b'].includes(t.candidate));assert.ok(['peer-b','peer-c'].includes(t.review_candidate));assert.notEqual(t.review_candidate,t.candidate);assert.equal(t.leader,null);assert.equal(t.status,'forming');assert.equal(r.result.protected_roles_granted,false);
 assert.equal(t.required_review_identities_v2.length,2);assert.deepEqual(t.required_review_models,[]);
 assert.equal(t.participants['peer-b'].native_admission.collector,'collector-b');assert.equal(rankParticipant(t.participants['peer-b'],t.policy,'review',{now,coverage:'waypost-protocol-review'}),t.review_floor);
 assert.equal(rankParticipant(t.participants['peer-b'],t.policy,'coordinate',{now,coverage:'waypost-protocol-coordinate',action:'leader-ack'}),null);
 for(const c of [command({type:'policy',policy:legacy}),command({type:'strength-check',policy:legacy,check:{}}),command({type:'leader-ack',actor:'peer-b',incarnation:'inc-b'})])assert.throws(()=>reduceTeamEvent(r.state,c),/protected-action-admission/);
});
test('native install rejects caller authority, unresolved migration, missing revision and stale measurements',async()=>{
 const f=await fixture();for(const fields of [{policy:{}},{summary:{}},{scope:'architecture'},{expected_policy_revision:7},{actor:'peer-a'}])assert.throws(()=>reduceTeamEvent(f.state,command(fields),{revision:f.revision}));
 assert.throws(()=>reduceTeamEvent(f.state,command()),/store-authority-revision/);
 assert.throws(()=>reduceTeamEvent(f.state,command({at:expiry}),{revision:f.revision}),/current-summary/);
 for(const patch of [{leader:'peer-a'},{quota_policy:{automatic_redistribution:true}},{required_review_models:[['route','model-a','unknown']]},{runtime_requests:{r:{consumed:false}}}]){const copy={...f,state:structuredClone(f.state)};Object.assign(copy.state.teams.team,patch);assert.throws(()=>install(copy));}
 const copy={...f,state:structuredClone(f.state)};copy.state.teams.team.required_review_identities_v2=[{kind:'native-configuration',profile_id:'missing'}];assert.throws(()=>install(copy),/historical-frontier-uncovered/);
});
test('publication fence defers installation without policy or admission mutation',async()=>{
 const f=await fixture();f.state.publication_fence={team:'team'};const r=install(f);assert.equal(r.result.deferred,true);assert.equal(r.state.teams.team.policy.protocol,1);assert.equal(r.state.teams.team.participants['peer-a'].native_admission,undefined);
});
test('explicit native bootstrap avoids new unranked history while old event semantics and genuine history survive',()=>{
 const create={type:'create',team:'team',task:'task',actor:'owner:fixture',owner_hash:'fixture',at,request_key:'create',policy:legacy};
 const join={type:'join',team:'team',actor:'owner:fixture',at,request_key:'join',participant:{id:'peer',incarnation:'inc',session:'session',harness:'fixture',root:'/fixture',credential_hash:'hash',model:{provider:'unknown',model_id:'unknown',reasoning:'unknown',model_revision:1,resolved:false,evidence:{kind:'unknown',source:'fixture',observed_at:at}}}};
 const old=reduceTeamEvent(reduceTeamEvent(null,create).state,join).state;assert.equal(old.teams.team.required_review_models.length,1);
 const modern=reduceTeamEvent(reduceTeamEvent(null,{...create,native_policy_bootstrap:true}).state,join).state;assert.deepEqual(modern.teams.team.required_review_models,[]);
 const history=structuredClone(modern);history.teams.team.required_review_models=[['real','strong','high']];const next=reduceTeamEvent(history,{...join,participant:{...join.participant,id:'peer2'}}).state;assert.deepEqual(next.teams.team.required_review_models,[['real','strong','high']]);
 assert.throws(()=>reduceTeamEvent(modern,{...join,participant:{...join.participant,id:'injected',native_admission:{}}}),/reducer-only/);
});

test('store supplies the same pre-event revision at commit and immutable replay',async t=>{
 const f=await fixture(),dir=realpathSync(mkdtempSync(join(tmpdir(),'waypost-native-policy-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const root=join(dir,'authority');
 // Fixed pure fixture initialization isolates store revision transport from inference.
 const reducer=(state,c,a)=>c.type==='fixture-initialize'?{state:structuredClone(f.state),result:{fixture:true}}:reduceTeamEvent(state,c,{...a,accepted_at:at});
 mutateAuthority(root,{actor:'owner:fixture',key:'initialize',expected_revision:0,command:{type:'fixture-initialize'}},reducer,{confirmedLocal:true});
 const r=mutateAuthority(root,{actor:'owner:fixture',key:'install',expected_revision:1,command:command({at:new Date().toISOString()})},reducer,{confirmedLocal:true});
 assert.equal(r.result.policy_revision,2);const replay=readAuthority(root,reducer);assert.equal(replay.revision,2);assert.equal(replay.state.teams.team.policy.provenance.authority_revision,1);
 assert.deepEqual(readAuthority(root,reducer).state,replay.state);
});
test('reinstallation preserves typed review frontier and original clocks; revocation withdraws admission',async()=>{
 const f=await fixture(),first=install(f).state,t=first.teams.team;
 const next=reduceTeamEvent(first,command({expected_policy_revision:2,at:new Date(now+1000).toISOString(),request_key:'refresh'}),{revision:f.revision+1}).state.teams.team;
 assert.deepEqual(next.required_review_identities_v2,t.required_review_identities_v2);assert.equal(next.policy.expires_at,t.policy.expires_at);assert.equal(next.participants['peer-a'].native_admission.observed_at,at);
 const revoked=reduceTeamEvent(first,command({type:'collector-revoke-v1',collector_id:'collector-a'})).state.teams.team;
 assert.equal(revoked.participants['peer-a'].native_admission,undefined);assert.equal(revoked.candidate,'peer-b');assert.deepEqual(revoked.required_review_identities_v2,t.required_review_identities_v2);
});

test('calibrated coordinator cannot also become the independent critic candidate',async()=>{
 const f=await fixture();f.state.teams.team.participants['peer-a'].availability='busy';f.state.teams.team.participants['peer-c'].availability='busy';
 assert.throws(()=>install(f),/qualified-independent-review-required/);
 const first=install(await fixture()).state,t=first.teams.team;
 const without=reduceTeamEvent(first,{type:'availability',team:'team',actor:t.review_candidate,incarnation:t.participants[t.review_candidate].incarnation,availability:'busy',at,request_key:'critic-busy'}).state.teams.team;
 assert.notEqual(without.review_candidate,t.candidate);assert.deepEqual(without.required_review_identities_v2,t.required_review_identities_v2);
});
test('periodic native strength check withdraws both candidates after original expiry without erasing history',async()=>{
 const state=install(await fixture()).state,history=structuredClone(state.teams.team.required_review_identities_v2);
 const r=reduceTeamEvent(state,{type:'strength-check',team:'team',actor:'owner:fixture',at:expiry,request_key:'expiry-check',check:{status:'expired'}}).state.teams.team;
 assert.equal(r.candidate,null);assert.equal(r.review_candidate,null);assert.equal(r.status,'paused');assert.deepEqual(r.required_review_identities_v2,history);
 assert.equal(r.policy.expires_at,expiry);
});


test('active native incumbent recomputes critic eligibility and cannot retain a revoked or busy critic',async()=>{
 for(const mode of ['revoke','busy','expiry']){
  const state=install(await fixture()).state,t=state.teams.team,leader=t.candidate,oldCritic=t.review_candidate;
  // Fixture activation isolates selection refresh; no production ACK is minted.
  t.leader=leader;t.candidate=null;t.status='active';
  const history=structuredClone(t.required_review_identities_v2);
  const command=mode==='revoke'?{type:'revoke',actor:'owner:fixture',participant_id:oldCritic}:mode==='busy'?{type:'availability',actor:oldCritic,incarnation:t.participants[oldCritic].incarnation,availability:'busy'}:{type:'strength-check',actor:'owner:fixture',check:{ok:false}};
  const next=reduceTeamEvent(state,{...command,team:'team',at:mode==='expiry'?expiry:at,request_key:'refresh-critic'}).state.teams.team;
  assert.notEqual(next.review_candidate,oldCritic);assert.deepEqual(next.required_review_identities_v2,history);
  if(mode==='expiry'){assert.equal(next.status,'paused');assert.equal(next.review_candidate,null);}else if(next.review_candidate===null)assert.equal(next.status,'paused');
 }
});

const day=86400000;
async function validFixture(validity=new Date(now+day).toISOString()){const f=await authorityFixture({calibration_expires_at:validity});const s=structuredClone(f.state);Object.assign(s,{protocol:1,owner_hash:'fixture',task_bindings:{task:'team'}});Object.assign(s.teams.team,{task:'task',policy:legacy,messages:[],work:{},status:'forming',leader:null,candidate:null,required_review_models:[],native_policy_bootstrap:true});return {...f,state:s,validity};}
test('an owner calibration validity keeps admissions and ranks for up to 7 days while the old rule still expires with the cohort',async()=>{
 const f=await validFixture(),t=install(f).state.teams.team,later=new Date(now+3600000).toISOString();
 for(const p of Object.values(t.participants).filter(p=>p.native_admission)){assert.equal(p.native_admission.expires_at,f.validity);assert.ok(Date.parse(p.native_admission.observed_at)<=now);}
 assert.equal(t.policy.expires_at,f.validity);
 const b=t.participants['peer-b'];assert.notEqual(rankParticipant(b,t.policy,'review',{now:now+3600000,coverage:'waypost-protocol-review'}),null);assert.equal(rankParticipant(b,t.policy,'review',{now:Date.parse(f.validity),coverage:'waypost-protocol-review'}),null);
 const state=install(f).state,checked=reduceTeamEvent(state,{type:'strength-check',team:'team',actor:'owner:fixture',at:later,request_key:'later',check:{ok:true}}).state.teams.team;assert.ok(checked.candidate,'still electable an hour later');assert.ok(checked.review_candidate);assert.equal(checked.review_blocker,null);
 const stretched=structuredClone(b);stretched.native_admission.expires_at=new Date(Date.parse(stretched.native_admission.observed_at)+7*day+1).toISOString();assert.equal(rankParticipant(stretched,t.policy,'review',{now:now+3600000,coverage:'waypost-protocol-review'}),null,'an admission spanning more than 7 days never ranks');
 const old=install(await fixture()).state,oldChecked=reduceTeamEvent(old,{type:'strength-check',team:'team',actor:'owner:fixture',at:later,request_key:'later',check:{ok:true}}).state.teams.team;assert.equal(oldChecked.candidate,null,'the old rule still expires with its cohort');
});
test('a cohort calibration validity must be a date after the trial window and at most 7 days ahead',async()=>{
 for(const bad of [new Date(now+7*day+1).toISOString(),expiry,'tomorrow',42,'2026-10-04T12:00Z','Sun, 04 Oct 2026 12:00:00 GMT'])await assert.rejects(authorityFixture({calibration_expires_at:bad}),/cohort-validity-required/,String(bad));
 await authorityFixture({calibration_expires_at:new Date(now+7*day).toISOString()});
});
function activeFlap(state){
 const t=state.teams.team,leader=t.candidate;t.leader=leader;t.candidate=null;t.status='active';
 const critics=['peer-b','peer-c'].filter(x=>x!==leader),flap=critics.at(-1);let s=state;const avail=(id,availability,key)=>{s=reduceTeamEvent(s,{type:'availability',team:'team',actor:id,incarnation:s.teams.team.participants[id].incarnation,availability,at,request_key:key}).state;};
 critics.slice(0,-1).forEach((id,i)=>avail(id,'busy','busy-'+i));avail(flap,'busy','flap-busy');avail(flap,'ready','flap-ready');
 return {state:s,leader,flap};
}
const resume=(state,fields={})=>reduceTeamEvent(state,{type:'native-leader-resume-v2',team:'team',actor:'owner:fixture',at,request_key:'resume',epoch:state.teams.team.epoch,...fields});
test('a critic flap leaves the team stuck in handover to its own leader, and the owner resumes it at the same epoch',async()=>{
 const {state,leader,flap}=activeFlap(install(await fixture()).state),t=state.teams.team;
 assert.equal(t.status,'handover');assert.equal(t.candidate,leader,'the unchanged election selects the incumbent again');
 const r=resume(state),next=r.state.teams.team;assert.equal(next.status,'active');assert.equal(next.leader,leader);assert.equal(next.epoch,t.epoch);assert.equal(next.candidate,null);assert.equal(next.review_candidate,flap);assert.equal(r.result.protected_actions_granted,false);
});
test('the owner resume refuses other actors, extra fields, a stale epoch, an active or leaderless team and a still-missing critic',async()=>{
 const {state}=activeFlap(install(await fixture()).state);
 assert.throws(()=>resume(state,{actor:'peer-a'}),/owner-required/);
 assert.throws(()=>resume(state,{policy:{}}),/native-resume-selectors-only/);
 assert.throws(()=>resume(state,{epoch:state.teams.team.epoch+1}),/native-resume-left-active-leader-required/);
 const active=resume(state).state;assert.throws(()=>resume(active),/native-resume-left-active-leader-required/);
 const fresh=install(await fixture()).state;assert.throws(()=>resume(fresh),/native-resume-left-active-leader-required/);
 const busy=structuredClone(state),flap=['peer-b','peer-c'].filter(x=>x!==busy.teams.team.leader).at(-1);busy.teams.team.participants[flap].availability='busy';
 assert.throws(()=>resume(busy),/native-resume-independent-critic-required/);
 for(const change of ['revoked','left']){const gone=structuredClone(state),p=gone.teams.team.participants[gone.teams.team.leader];if(change==='revoked')p.revoked=true;else p.availability='left';assert.throws(()=>resume(gone),/native-resume-incumbent-not-selected/,change);}
 assert.throws(()=>reduceTeamEvent(state,{type:'native-leader-resume-v2',team:'team',actor:'owner:fixture',at:expiry,request_key:'late',epoch:state.teams.team.epoch}),/native-resume-incumbent-not-selected/,'the old-rule policy expired');
 const fenced=structuredClone(state);fenced.teams.team.native_protocol_handover={state:'prepared'};assert.throws(()=>resume(fenced),/quota-handover-pending/);
 const frozen=structuredClone(state);frozen.teams.team.native_quota_freeze={old_leader:frozen.teams.team.leader};assert.throws(()=>resume(frozen),/quota-handover-pending/);
});
test('a publication fence defers the owner resume',async()=>{
 const {state}=activeFlap(install(await fixture()).state);state.publication_fence={team:'team'};const r=resume(state);assert.equal(r.result.deferred,true);assert.equal(r.state.teams.team.status,'handover');
});
