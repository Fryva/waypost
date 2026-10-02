import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceTeamEvent } from '../scripts/team-state.mjs';
import { currentReview, workflowDigest } from '../scripts/team-workflow.mjs';
const at='2026-10-01T12:00:00Z',now=Date.parse(at),d='a'.repeat(64);
const profile=(model_id,rank)=>({provider:'fixture',model_id,reasoning:'none',priorities:{coordinate:rank,implement:rank,review:rank},source:'fixture',date:'2026-10-01'});
function fixture(){
 const policy={protocol:1,mode:'manual',revision:1,domain:'coding',approved_by:'fixture',approved_at:at,profiles:[profile('strong',3),profile('weak',2)]};
 let s=reduceTeamEvent(null,{type:'create',actor:'owner:owner',owner_hash:'owner',team:'team',task:'task.md',policy,at}).state;
 for(const [id,model_id]of [['strong','strong'],['weak','weak'],['critic','weak']]){
  const model={provider:'fixture',model_id,reasoning:'none',model_revision:1,resolved:true,evidence:{kind:'adapter-observed',source:'fixture',observed_at:at}};
  s=reduceTeamEvent(s,command(s,'join',{participant:{id,incarnation:id+'-inc',model,session:id,harness:'fixture',root:'/fixture',credential_hash:d}})).state;
 }
 const t=s.teams.team;t.status='active';t.leader='strong';t.candidate=null;t.epoch=1;
 s.collectors={host:{id:'host',team:'team',credential_hash:d,purposes:['usage','review','dispatch','material','runtime']}};
 return s;
}
function command(s,type,extra={},actor='owner:owner'){
 const c={type,actor,team:'team',epoch:s.teams.team.epoch,incarnation:actor+'-inc',request_key:type+'-'+Object.keys(s.teams.team.work).length,at,...extra};
 const p=s.teams.team.participants[actor];if(p)p.model.evidence.action=[type,'team',actor,p.incarnation,p.model.model_revision,s.teams.team.policy.revision,c.request_key].join(':');
 return c;
}
function enable(s){return reduceTeamEvent(s,command(s,'quota-policy-enable-v1')).state;}
function observation(s,id,status='exhausted',time=at){
 const p=s.teams.team.participants[id],model={provider:p.model.provider,model_id:p.model.model_id,reasoning:p.model.reasoning};
 return {protocol:1,observation_id:id+'-'+status+'-'+Date.parse(time),participant:id,incarnation:p.incarnation,model_revision:p.model.model_revision,model,route:{endpoint:'https://fixture.invalid/quota',account:'account',sku:'sku',mode:'api',pool:'pool',model},scope:'provider-account-model',reason:status==='exhausted'?'provider-quota-exhausted':'provider-quota-available',status,available_calls:status==='exhausted'?0:10,provider_confirmed:true,evidence_kind:'provider-quota',source:'https://fixture.invalid/quota',observed_at:time,expires_at:new Date(Date.parse(time)+60000).toISOString()};
}
function capture(s,id,status='exhausted',time=at){return reduceTeamEvent(s,command(s,'quota-capture-v1',{participant_id:id,observation:observation(s,id,status,time),at:time},'collector:host')).state;}
test('positive renewal before expiry retains quota revision and role bindings',()=>{
 let s=capture(enable(fixture()),'strong','available');const revision=s.teams.team.quota_revision;
 for(const seconds of [30,60,90,120]){
  s=capture(s,'strong','available',new Date(now+seconds*1000).toISOString());
  assert.equal(s.teams.team.quota_revision,revision);assert.equal(s.teams.team.leader,'strong');
 }
});
test('opt-in quota evidence chooses strongest remaining leader and preserves historical floor',()=>{
 const legacy=fixture();assert.equal(legacy.teams.team.quota_revision,undefined);
 let s=enable(legacy),t=s.teams.team;assert.equal(t.review_floor,3);assert.equal(Object.keys(t.review_admissions).length,2);
 s=capture(s,'strong');t=s.teams.team;assert.ok(['weak','critic'].includes(t.candidate));assert.equal(t.status,'handover');assert.equal(t.historical_review_floor,3);assert.equal(t.review_floor,2);assert.ok(t.quota_revision>1);
 s=capture(s,'weak');s=capture(s,'critic');t=s.teams.team;assert.equal(t.candidate,null);assert.equal(t.status,'paused');assert.equal(t.review_floor,null);assert.equal(t.review_blocker,'all-qualified-review-models-quota-exhausted');
});
test('provider proof is collector-owned, ordered, and cannot treat local allocation as exhaustion',()=>{
 let s=enable(fixture());const o=observation(s,'strong');
 assert.throws(()=>reduceTeamEvent(s,command(s,'quota-capture-v1',{participant_id:'strong',observation:o})),/bound-collector/);
 assert.throws(()=>reduceTeamEvent(s,command(s,'quota-capture-v1',{participant_id:'strong',observation:{...o,scope:'project-authority'}},'collector:host')),/provider-quota/);
 s=capture(s,'strong');const later='2026-10-01T12:00:01Z';s=capture(s,'strong','available',later);assert.equal(s.teams.team.review_floor,3);
 assert.throws(()=>reduceTeamEvent(s,command(s,'quota-capture-v1',{participant_id:'strong',observation:o,at:later},'collector:host')),/order-conflict/);
 const conflicting={...observation(s,'strong','available',later),available_calls:11};assert.throws(()=>reduceTeamEvent(s,command(s,'quota-capture-v1',{participant_id:'strong',observation:conflicting,at:later},'collector:host')),/order-conflict/);
});
test('model change keeps non-vacuous historical admission and cannot wash away its floor',()=>{
 let s=capture(enable(fixture()),'strong'),t=s.teams.team;assert.equal(t.review_floor,2);
 const model={...t.participants.strong.model,model_id:'weak',model_revision:2};
 s=reduceTeamEvent(s,command(s,'attest',{participant_id:'strong',model})).state;t=s.teams.team;
 assert.equal(t.historical_review_floor,3);assert.equal(t.review_floor,3);assert.equal(t.review_admissions[JSON.stringify(['fixture','strong','none'])][0].model_revision,1);
});
test('quota changes fence late review capture, prepared publication, and retain settled history',()=>{
 let s=enable(fixture()),t=s.teams.team;
 t.work.w={id:'w',worker:'weak',status:'reviewed',generation:1,epoch:1,base:'b'.repeat(40),paths:['a.mjs'],criteria_digest:d,result:{target_digest:d,tree:'c'.repeat(40),tests_digest:d,paths:['a.mjs']},supervision:{target_digest:d},reviews:[{nonce:'r',reviewer:'strong',verdict:'approve',epoch:1,generation:1,policy_revision:1,model_revision:1,quota_revision:t.quota_revision,target_digest:d,criteria_digest:d,tests_digest:d,rank:3}]};
 assert.ok(currentReview(t,t.work.w,now));
 t.review_requests={late:{...t.work.w.reviews[0],nonce:'late',work:'w',consumed:true,collector:'collector:host',manifest:{context_id:'ctx'}}};
 t.integration={id:'pub',work:'w',state:'prepared',epoch:1,generation:1,model_revision:1,policy_revision:1,quota_revision:t.quota_revision,candidate_digest:d,tree:t.work.w.result.tree,review:'r'};
 s.invocations={paid:{team:'team',state:'settled',actual_units:'10',max_units:'20'}};
 s=capture(s,'strong');t=s.teams.team;assert.equal(t.work.w.status,'review-pending');assert.equal(s.invocations.paid.actual_units,'10');
 const output=JSON.stringify({verdict:'approve',findings:[]});
 assert.throws(()=>reduceTeamEvent(s,command(s,'review-capture-v1',{nonce:'late',context_id:'ctx',actual_model:{provider:'fixture',model_id:'strong',reasoning:'none'},output,output_digest:workflowDigest(output)},'collector:host')),/stale-review/);
 t.status='active';t.leader='weak';t.candidate=null;
 assert.throws(()=>reduceTeamEvent(s,command(s,'integration-start-v1',{reservation_id:'pub'},'weak')),/publication-approval-changed/);
});
test('quota observations are deferred while publication owns the project fence',()=>{
 const s=enable(fixture());s.publication_fence={team:'team',reservation:'pub'};
 const next=reduceTeamEvent(s,command(s,'quota-capture-v1',{participant_id:'strong',observation:observation(s,'strong')},'collector:host'));
 assert.equal(next.result.deferred,true);assert.equal(next.state.teams.team.participants.strong.quota_observation,undefined);
});

test('departure or revocation cannot keep a previously waived historical floor cached',()=>{
 for(const type of ['availability','revoke']){
  let s=capture(enable(fixture()),'strong');const revision=s.teams.team.quota_revision;assert.equal(s.teams.team.review_floor,2);
  const c=type==='availability'?command(s,type,{availability:'left'},'strong'):command(s,type,{participant_id:'strong'});
  s=reduceTeamEvent(s,c).state;assert.equal(s.teams.team.review_floor,3);assert.ok(s.teams.team.quota_revision>revision);
 }
});
test('quota opt-in refuses outstanding legacy reviews rather than stranding them',()=>{
 const s=fixture();s.teams.team.work.work={id:'work',status:'reviewed',reviews:[]};
 assert.throws(()=>enable(s),/outstanding-work-requires-quota-migration/);
 assert.equal(s.teams.team.quota_policy,undefined);
});
