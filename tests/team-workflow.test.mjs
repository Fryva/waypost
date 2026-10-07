import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceTeamEvent, authorizeActor } from '../scripts/team-state.mjs';
import { currentReview, workflowDigest } from '../scripts/team-workflow.mjs';
const at='2026-10-01T12:00:00Z',now=Date.parse(at),d='a'.repeat(64);
function fixture(){
 const model={provider:'fixture',model_id:'strong',reasoning:'none',model_revision:1,resolved:true,evidence:{kind:'adapter-observed',source:'fixture',observed_at:at}};
 const policy={protocol:1,mode:'manual',revision:1,domain:'coding',approved_by:'fixture',approved_at:at,profiles:[{provider:'fixture',model_id:'strong',reasoning:'none',priorities:{coordinate:3,implement:3,review:3},source:'fixture',date:'2026-10-01'}]};
 const s=reduceTeamEvent(null,{type:'create',actor:'owner:owner',owner_hash:'owner',team:'fixture',task:'task.md',policy,at}).state;
 const t=s.teams.fixture;t.status='active';t.epoch=1;t.leader='leader';t.review_floor=3;t.review_blocker=null;
 for(const id of ['leader','worker','reviewer'])t.participants[id]={id,incarnation:id+'-inc',availability:'ready',revoked:false,model:structuredClone(model)};
 s.collectors={host:{id:'host',team:'fixture',credential_hash:d,purposes:['runtime','material','review','usage','dispatch']}};
 return s;
}
function command(s,type,extra={},actor='leader'){
 const key=type+'-key';const c={type,actor,team:'fixture',incarnation:actor+'-inc',epoch:s.teams.fixture.epoch,request_key:key,at,...extra};
 if(s.teams.fixture.participants[actor])s.teams.fixture.participants[actor].model.evidence.action=[type,'fixture',actor,actor+'-inc',1,1,key].join(':');
 return c;
}
function reviewed(s){const t=s.teams.fixture;const w={id:'w',worker:'worker',status:'reviewed',generation:1,epoch:1,base:'b'.repeat(40),paths:['a.mjs'],criteria_digest:d,result:{target_digest:d,tree:'c'.repeat(40),tests_digest:d,paths:['a.mjs']},supervision:{target_digest:d},reviews:[{nonce:'review',reviewer:'reviewer',verdict:'approve',epoch:1,generation:1,policy_revision:1,model_revision:1,target_digest:d,criteria_digest:d,tests_digest:d,rank:3}]};t.work.w=w;return w;}
test('review validity rejects revoked, changed tests, latest negative and pending review',()=>{
 const s=fixture(),t=s.teams.fixture,w=reviewed(s);assert.ok(currentReview(t,w,now));
 t.participants.reviewer.revoked=true;assert.equal(currentReview(t,w,now),undefined);t.participants.reviewer.revoked=false;
 w.result.tests_digest='b'.repeat(64);assert.equal(currentReview(t,w,now),undefined);w.result.tests_digest=d;
 w.reviews.push({...w.reviews[0],verdict:'blocked'});assert.equal(currentReview(t,w,now),undefined);w.reviews.pop();
 w.reviews.unshift({...w.reviews[0],verdict:'changes-requested'});assert.equal(currentReview(t,w,now),undefined);w.reviews.shift();
 t.review_requests={pending:{work:'w',generation:1}};assert.equal(currentReview(t,w,now),undefined);
});
test('strict routing fences native identity and review control calls without grants',()=>{
 const s=fixture();s.teams.fixture.routing={required:true};
 assert.throws(()=>reduceTeamEvent(s,command(s,'runtime-consume-v1',{nonce:'x'},'collector:host')),/budgeted-control/);
 assert.throws(()=>reduceTeamEvent(s,command(s,'review-consume-v1',{nonce:'x'},'collector:host')),/budgeted-review/);
});
test('close retains task ownership until consumed native operations have stopped',()=>{
 let s=fixture();s.teams.fixture.runtime_requests={live:{nonce:'live',consumed:true,collector:'collector:host',participant:'worker'}};
 assert.throws(()=>reduceTeamEvent(s,command(s,'close-v1',{},'owner:owner')),/unresolved-native/);
 assert.throws(()=>reduceTeamEvent(s,command(s,'native-operation-reconcile-v1',{operation:'runtime',nonce:'live',stopped:false,evidence_digest:d},'collector:host')),/explicit-native-stopped/);
 s=reduceTeamEvent(s,command(s,'native-operation-reconcile-v1',{operation:'runtime',nonce:'live',stopped:true,evidence_digest:d},'collector:host')).state;
 const closed=reduceTeamEvent(s,command(s,'close-v1',{},'owner:owner')).state;
 assert.equal(closed.teams.fixture.status,'closed');assert.equal(closed.task_bindings['task.md'],undefined);
});
test('a stale deferred command can be explicitly discarded without executing it',()=>{
 const s=fixture();s.deferred_commands=[{id:'stale',command:{team:'fixture',type:'revoke',actor:'revoked',incarnation:'old'}}];
 assert.throws(()=>reduceTeamEvent(s,command(s,'deferred-discard-v1',{deferred_id:'stale',reason:'Revoked actor'},'worker')),/owner-required/);
 const next=reduceTeamEvent(s,command(s,'deferred-discard-v1',{deferred_id:'stale',reason:'Revoked actor'},'owner:owner')).state;
 assert.equal(next.deferred_commands.length,0);assert.equal(next.teams.fixture.participants.worker.revoked,false);
});
test('publication cannot start after a negative review or generation change',()=>{
 const s=fixture(),w=reviewed(s),t=s.teams.fixture;
 t.integration={id:'publication',work:'w',state:'prepared',epoch:1,generation:1,model_revision:1,policy_revision:1,candidate_digest:d,tree:w.result.tree,review:'review'};
 const c=command(s,'integration-start-v1',{reservation_id:'publication'});
 assert.equal(reduceTeamEvent(s,c).state.publication_fence.reservation,'publication');
 w.status='changes-requested';assert.throws(()=>reduceTeamEvent(s,c),/publication-approval-changed/);
 w.status='reviewed';w.generation=2;assert.throws(()=>reduceTeamEvent(s,c),/publication-approval-changed/);
});
test('full quoted liability and settled spend stay charged against shared allocation',()=>{
 let s=fixture();s.teams.fixture.routing={required:true};
 const grant={participant:'worker',incarnation:'worker-inc',model_revision:1,model:{provider:'fixture',model_id:'strong',reasoning:'none'},epoch:1,policy_revision:1,route_digest:d,manifest_digest:d,attempts:2,task_max_units:'1000',reserved_control_units:'0'};
 const evidence={grant,pool:'pool',currency:'USD-micro',strict_bounded:true,max_units_per_attempt:'60',pool_allocation:'100',expires_at:'2026-10-01T12:00:30Z'};
 s=reduceTeamEvent(s,command(s,'routing-evidence-v1',{evidence,evidence_digest:workflowDigest(evidence)},'collector:host')).state;
 const invocation={id:'first',attempt:1,grant_digest:workflowDigest(grant),evidence_digest:workflowDigest(evidence),strict_bounded:true,max_units:'60',pool_allocation:'100',pool:'pool',currency:'USD-micro'};
 assert.throws(()=>reduceTeamEvent(s,command(s,'invocation-reserve-v1',{invocation:{...invocation,max_units:'0'}})),/trusted-routing-evidence/);
 s=reduceTeamEvent(s,command(s,'invocation-reserve-v1',{invocation})).state;
 s=reduceTeamEvent(s,command(s,'invocation-consume-v1',{invocation_id:'first'},'collector:host')).state;
 s=reduceTeamEvent(s,command(s,'invocation-settle-v1',{invocation_id:'first',actual_units:'50',provider_invocation_id:'provider-first'},'collector:host')).state;
 assert.throws(()=>reduceTeamEvent(s,command(s,'invocation-reserve-v1',{invocation:{...invocation,id:'second',attempt:2}})),/shared-pool-reservation-exhausted/);
});
test('dispatch rejects expired evidence and cannot abort an already consumed invocation',()=>{
 const s=fixture();s.teams.fixture.routing_evidence={[d]:{expires_at:at}};
 s.invocations={x:{id:'x',team:'fixture',state:'prepared',epoch:1,policy_revision:1,evidence_digest:d}};
 assert.throws(()=>reduceTeamEvent(s,command(s,'invocation-consume-v1',{invocation_id:'x'},'collector:host')),/expired-before-dispatch/);
 s.invocations.x.state='uncertain';assert.throws(()=>reduceTeamEvent(s,command(s,'invocation-abort-v1',{invocation_id:'x'})),/cannot-be-aborted/);
});
test('collector credentials are team-bound and initial authority requires owner role',()=>{
 const s=fixture();assert.equal(authorizeActor(s,'fixture',{role:'collector',collector:'host',token_hash:d}),'collector:host');
 assert.throws(()=>authorizeActor(s,'another',{role:'collector',collector:'host',token_hash:d}),/invalid-collector/);
 assert.throws(()=>authorizeActor(null,'fixture',{role:'participant',token_hash:d}),/owner-required/);
});
test('revoked previous leader requires explicit collector stop proof for handover',()=>{
 let s=fixture(),t=s.teams.fixture;t.status='handover';t.candidate='reviewer';t.participants.leader.revoked=true;
 s=reduceTeamEvent(s,command(s,'begin-handover-v1',{},'owner:owner')).state;
 assert.equal(s.teams.fixture.handover.acks.leader,undefined);
 assert.throws(()=>reduceTeamEvent(s,command(s,'quiesce-capture-v1',{participant_id:'leader',participant_incarnation:'leader-inc',stopped:false,evidence_digest:d},'collector:host')),/stopped-process/);
 s=reduceTeamEvent(s,command(s,'quiesce-capture-v1',{participant_id:'leader',participant_incarnation:'leader-inc',stopped:true,evidence_digest:d},'collector:host')).state;
 assert.equal(s.teams.fixture.handover.acks.leader.stopped,true);
});
test('unverified critic manifests cannot authorize independent review',()=>{
 const s=fixture();const manifest={fresh:true,read_only:true,inherited_author_context:false,context_id:'ctx',native_id:'native',initial_context_digest:d,tools:[],author_contexts:[],provenance:'adapter-isolated',fresh_review_verified:false};
 assert.throws(()=>reduceTeamEvent(s,command(s,'review-context-v1',{participant_id:'reviewer',manifest,native_id:'native'},'collector:host')),/verified-native-review-manifest/);
});
test('prepared integration can abort but a published fence requires stopped Git evidence',()=>{
 const s=fixture();s.teams.fixture.integration={id:'pub',state:'prepared'};
 assert.equal(reduceTeamEvent(s,command(s,'integration-abort-v1',{reservation_id:'pub'},'owner:owner')).state.teams.fixture.integration.state,'aborted');
 s.teams.fixture.integration.state='publishing';s.publication_fence={team:'fixture',reservation:'pub'};
 assert.throws(()=>reduceTeamEvent(s,command(s,'integration-reconcile-v1',{reservation_id:'pub'},'collector:host')),/stopped-unchanged-publication/);
});

test('material replacement cannot erase negative findings without explicit revision',()=>{
 const s=fixture(),w=reviewed(s);w.status='changes-requested';w.reviews.push({...w.reviews[0],verdict:'changes-requested',findings:['Fix acceptance']});
 assert.throws(()=>reduceTeamEvent(s,command(s,'material-capture-v1',{work_id:'w',evidence:{base:w.base,target_digest:d,tests_digest:d,paths:w.paths}},'collector:host')),/invalid-material-capture/);
 assert.equal(w.reviews.at(-1).verdict,'changes-requested');
});
test('parallel approve cannot hide a negative verdict or prevent explicit revision',()=>{
 let s=fixture(),t=s.teams.fixture,w=reviewed(s);w.status='review-pending';w.reviews=[];
 const manifest={context_id:'context',native_id:'review-native'};
 t.review_requests={negative:{nonce:'negative',work:'w',reviewer:'reviewer',manifest,epoch:1,generation:1,model_revision:1,policy_revision:1,target_digest:d,criteria_digest:d,tests_digest:d,consumed:true,collector:'collector:host'},approve:{nonce:'approve',work:'w',reviewer:'reviewer',manifest,epoch:1,generation:1,model_revision:1,policy_revision:1,target_digest:d,criteria_digest:d,tests_digest:d,consumed:true,collector:'collector:host'}};
 for(const [nonce,verdict,findings]of [['negative','changes-requested',['Fix acceptance']],['approve','approve',[]]]){
  const output=JSON.stringify({verdict,findings});s=reduceTeamEvent(s,command(s,'review-capture-v1',{nonce,context_id:'context',actual_model:{provider:'fixture',model_id:'strong',reasoning:'none'},output,output_digest:workflowDigest(output)},'collector:host')).state;
 }
 assert.equal(s.teams.fixture.work.w.status,'changes-requested');assert.equal(currentReview(s.teams.fixture,s.teams.fixture.work.w,now),undefined);
 s=reduceTeamEvent(s,command(s,'revise-work-v1',{work_id:'w',findings_resolution:['Addressed acceptance']})).state;
 assert.equal(s.teams.fixture.work.w.generation,2);assert.equal(s.teams.fixture.work.w.status,'assigned');
});
// Regression: a protocol 1 team closes work marked protocol 2 under the protocol 1 evidence rules.
test('close of a protocol 1 team judges integrated work marked protocol 2 by its protocol 1 evidence',()=>{
 const s=fixture(),t=s.teams.fixture,w=reviewed(s);
 const integrate=()=>{w.protocol=2;w.status='integrated';w.commit='f'.repeat(40);w.criteria_digest=d;w.result.target_digest=d;w.integrated_evidence={commit:w.commit,tree:w.result.tree,target_digest:d,criteria_digest:d,tests_digest:w.result.tests_digest,review:'receipt',review_receipt:{nonce:'receipt',verdict:'approve'}};};
 integrate();assert.equal(t.policy.protocol,1);
 assert.equal(reduceTeamEvent(structuredClone(s),command(s,'close-v1',{},'owner:owner')).state.teams.fixture.status,'closed');
 // The protocol 2 evidence shape is not what protocol 1 asks for, and a forged protocol 1 receipt still fails.
 for(const change of [e=>{e.commit='e'.repeat(40);},e=>{e.tree='e'.repeat(40);},e=>{e.review='other';},e=>{e.review_receipt.verdict='changes-requested';},e=>{e.tests_digest='e'.repeat(64);}]){
  const forged=structuredClone(s);change(forged.teams.fixture.work.w.integrated_evidence);
  assert.throws(()=>reduceTeamEvent(forged,command(forged,'close-v1',{},'owner:owner')),/unfinished-reviewed-team-work/);
 }
 const bare=structuredClone(s);bare.teams.fixture.work.w.integrated_evidence={protocol:2,commit:w.commit};
 assert.throws(()=>reduceTeamEvent(bare,command(bare,'close-v1',{},'owner:owner')),/unfinished-reviewed-team-work/);
});
