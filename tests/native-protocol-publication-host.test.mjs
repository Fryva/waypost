import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {protocolHostFixture} from './helpers/native-protocol-host.mjs';
import {routingDigest} from '../scripts/model-routing.mjs';
import {reduceTeamEvent} from '../scripts/team-state.mjs';
import * as integration from '../scripts/team-integration.mjs';
import {nativePublicationGate} from '../scripts/team-native-integration.mjs';
import {createTeamHost} from '../scripts/team-host.mjs';

const git=(cwd,...args)=>{const r=spawnSync('git',['-C',cwd,...args],{encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'t@t',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:'t@t'}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const owner='owner:'+createHash('sha256').update('fixture-owner-token-'.repeat(4)).digest('hex');
const identity={name:'Owner',email:'owner@example.com',date:'1791331200 +0000'};
async function approved(t,options={}){
 const f=await protocolHostFixture(t,options);
 git(f.root,'init','-q');mkdirSync(join(f.root,'src'));writeFileSync(join(f.root,'src/sum.js'),'export const sum=(a,b)=>a-b;\n');git(f.root,'add','src/sum.js');git(f.root,'commit','-q','-m','base');
 const base=git(f.root,'rev-parse','HEAD');
 const ack=await f.host.acknowledgeProtocolLeadership({actionId:'leader',nonce:'leader',estimateTokens:'40'});assert.equal(ack.leader_acknowledged,true,ack.action_blocker);
 const allocation=f.load().state.subscription_allocations[routingDigest(f.unit)];
 f.host.enableNativeWork({revision:1,policy:{kind:'protocol-work',executor:'leader-baseline',allow_unknown_quota:true,max_attempts:2,timeout_ms:1000,expires_at:f.expiry,ceilings:{execution:{max_calls:3,max_estimate_tokens:'40'},review:{max_calls:2,max_estimate_tokens:'40'}},unit_allocations:[{unit_digest:routingDigest(f.unit),max_tokens:'120',allocation_revision:allocation.revision}]}});
 const criteria=['sum returns a+b'];
 f.host.installWorkManifest({workId:'fix-sum',manifest:{protocol:2,goal:'Fix sum',criteria,criteria_digest:routingDigest(criteria),paths:['src/sum.js'],base,forbidden_actions:['network']}});
 await f.host.executeNativeWork({workId:'fix-sum',estimateTokens:'40'});f.host.captureNativeWork({workId:'fix-sum'});
 const critic=f.load().state.teams.team.review_candidate,r=await f.hostFor(critic).reviewNativeWork({workId:'fix-sum',estimateTokens:'40'});
 assert.equal(r.work_review_captured,true,JSON.stringify(r));
 return {...f,base,critic,branch:git(f.root,'rev-parse','HEAD')};
}
const work=f=>f.load().state.teams.team.work['fix-sum'];
const rejectsCode=(fn,code)=>assert.throws(fn,error=>{assert.equal(error.code??error.message,code);return true;});
const rejectsAsync=(fn,code)=>assert.rejects(fn,error=>{assert.equal(error.code??error.message,code);return true;});
const close=f=>{const v=f.load();return reduceTeamEvent(structuredClone(v.state),{type:'close-v1',team:'team',actor:owner,at:new Date().toISOString(),request_key:'close-'+Math.random()},{revision:v.revision});};

test('approved work is published by the leader Host as one pinned commit on the private ref of its checkout, and the team then closes',async t=>{
 const f=await approved(t),w0=work(f);
 assert.equal(w0.status,'approved');
 await rejectsAsync(()=>f.hostFor(f.critic).publishNativeWork({workId:'fix-sum',message:'Fix sum',story:'WP-20/story-x',commitIdentity:identity}),'host-native-publication-leader-endpoint-required');
 rejectsCode(()=>close(f),'unfinished-reviewed-team-work');
 const r=(await f.host.publishNativeWork({workId:'fix-sum',message:'Fix sum',story:'WP-20/story-x',commitIdentity:identity}));
 const w=work(f),x=f.load().state.teams.team.native_integration;
 assert.equal(w.status,'integrated');assert.equal(r.commit,w.commit);assert.equal(x.state,'acknowledged');assert.equal(f.load().state.publication_fence,undefined);
 assert.equal(git(f.root,'rev-parse',x.checkout_ref),w.commit);
 assert.equal(git(f.root,'show','-s','--format=%T %P',w.commit),w.result.tree+' '+f.base);
 const body=git(f.root,'show','-s','--format=%B',w.commit);
 for(const line of ['Waypost-Team: team','Waypost-Work: fix-sum','Waypost-Tests: not-run','Waypost-Label: unqualified-strongest-baseline','Waypost-Reservation: '+x.id,'Waypost-Review: '+x.reviews.join(',')])assert.ok(body.split('\n').includes(line),line);
 assert.equal(git(f.root,'rev-parse','HEAD'),f.branch,'the user branch is untouched');
 assert.equal(w.integrated_evidence.reviewer.participant,f.critic);assert.equal(w.integrated_evidence.tests_status,'not-run');
 assert.equal((await f.host.publishNativeWork({workId:'fix-sum',message:'Fix sum',story:'WP-20/story-x',commitIdentity:identity})).unchanged,true);
 assert.equal(close(f).result.closed,'team');
});
test('only approved work with a standing approval is published: candidates and negatives are refused before any reservation',async t=>{
 const f=await approved(t,{workReviewVerdict:'changes-requested',workReviewFindings:[{path:'src/sum.js',severity:'major',text:'still subtracts'}]});
 assert.equal(work(f).status,'changes-requested');
 await rejectsAsync(()=>f.host.publishNativeWork({workId:'fix-sum',message:'Fix sum',story:'WP-20/story-x',commitIdentity:identity}),'native-integration-approved-work-required');
 assert.equal(f.load().state.teams.team.native_integration,undefined);
});
test('a publication interrupted after the ref moved is acknowledged on recovery; one interrupted before it releases the fence',async t=>{
 let fault='after-ref';
 const f=await approved(t,{integration:{publishWorkCommit:options=>integration.publishWorkCommit({...options,fault:at=>{if(at===fault){fault=null;throw Error('fixture interrupted publication');}}})}});
 await assert.rejects(()=>f.host.publishNativeWork({workId:'fix-sum',message:'Fix sum',story:'WP-20/story-x',commitIdentity:identity}),/fixture interrupted publication/);
 const x=f.load().state.teams.team.native_integration;assert.equal(x.state,'publishing');assert.equal(f.load().state.publication_fence.reservation,x.id);
 // Owner events wait behind the fence.
 assert.throws(()=>f.host.cancelNativeWork({workId:'fix-sum',reason:'stop'}),/host-command-deferred-no-external-dispatch/);assert.equal(f.load().state.deferred_commands.at(-1).command.type,'native-work-cancel-v2');
 await rejectsAsync(()=>f.host.publishNativeWork({workId:'fix-sum',message:'Fix sum',story:'WP-20/story-x',commitIdentity:identity}),'host-native-publication-reserved-recover-required');
 rejectsCode(()=>f.host.recoverNativePublication(),'integration-child-stop-proof-required');
 const r=f.host.recoverNativePublication({gitChildStopped:true});
 assert.equal(r.integrated,'fix-sum');assert.equal(work(f).commit,x.commit);assert.equal(git(f.root,'rev-parse',x.checkout_ref),x.commit);assert.equal(f.load().state.publication_fence,undefined);
});
test('a publication interrupted before the ref moved is reconciled at its base and can be published again',async t=>{
 let fault='before-ref';
 const f=await approved(t,{integration:{publishWorkCommit:options=>integration.publishWorkCommit({...options,fault:at=>{if(at===fault){fault=null;throw Error('fixture interrupted publication');}}})}});
 await assert.rejects(()=>f.host.publishNativeWork({workId:'fix-sum',message:'Fix sum',story:'WP-20/story-x',commitIdentity:identity}),/fixture interrupted publication/);
 const x=f.load().state.teams.team.native_integration;
 const r=f.host.recoverNativePublication({gitChildStopped:true});
 assert.equal(r.aborted,x.id);assert.equal(f.load().state.publication_fence,undefined);assert.equal(work(f).status,'approved');
 assert.equal(git(f.root,'rev-parse',x.checkout_ref),f.base);
 const again=(await f.host.publishNativeWork({workId:'fix-sum',message:'Fix sum',story:'WP-20/story-x',commitIdentity:identity}));
 assert.equal(again.integrated,'fix-sum');assert.equal(close(f).result.closed,'team');
});
test('the publication reducer pins every gate field, the receipt matches the pinned commit, and a prepared reservation blocks cancel until aborted',async t=>{
 const f=await approved(t),v=f.load(),w=v.state.teams.team.work['fix-sum'],team=v.state.teams.team;
 const reviews=Object.values(team.native_work_reviews)[0].records.map(r=>r.invocation_id),reviewer=Object.values(team.native_work_reviews)[0].records[0];
 const checkoutRef=JSON.parse((await import('node:fs')).readFileSync(join(f.hostDir,'work-fix-sum.json'),'utf8')).checkout.ref;
 const reservation={id:'native-integration-00000000-0000-4000-8000-000000000000',work_id:'fix-sum',generation:w.generation,base:w.result.base,tree:w.result.tree,paths:[...w.result.paths],candidate_digest:w.result.candidate_digest,manifest_digest:w.manifest_digest,criteria_digest:w.manifest.criteria_digest,target_digest:Object.keys(team.native_work_reviews)[0],tests_digest:w.result.tests_digest,tests_status:'not-run',reviews,reviewer:{participant:reviewer.participant,incarnation:reviewer.incarnation,profile:reviewer.profile,calibration_digest:reviewer.calibration_digest},label:'unqualified-strongest-baseline',checkout_ref:checkoutRef,commit:'a'.repeat(40),commit_message_digest:'b'.repeat(64),commit_identity:identity,collector:'collector:'+team.participants[team.leader].native_binding.collector_id};
 const cmd=(c,state=v)=>reduceTeamEvent(structuredClone(state.state),{team:'team',at:new Date().toISOString(),request_key:'k'+Math.random(),actor:owner,...c},{revision:state.revision});
 const prepared=cmd({type:'native-integration-prepare-v2',reservation});
 assert.equal(prepared.state.teams.team.native_integration.state,'prepared');
 for(const [k,value] of [['tree','c'.repeat(40)],['reviews',[]],['tests_status','passed'],['label','qualified'],['checkout_ref','refs/heads/main'],['commit',w.result.base]])assert.throws(()=>cmd({type:'native-integration-prepare-v2',reservation:{...reservation,[k]:value}}),/native-integration-(reservation-mismatch|publication-binding-required)/,k);
 assert.throws(()=>cmd({type:'native-integration-prepare-v2',reservation:{...reservation,extra:1}}),/native-integration-reservation-fields-required/);
 const at={state:prepared.state,revision:v.revision+1};
 assert.throws(()=>cmd({type:'native-work-cancel-v2',work_id:'fix-sum',reason:'stop'},at),/native-work-cancel-integration-abort-required/);
 const aborted=cmd({type:'native-integration-abort-v2',reservation_id:reservation.id},at);assert.equal(aborted.state.teams.team.native_integration.state,'aborted');
 const started=cmd({type:'native-integration-start-v2',reservation_id:reservation.id},at);assert.equal(started.state.publication_fence.protocol,2);
 const s={state:started.state,revision:v.revision+2},collector=reservation.collector,other=Object.keys(v.state.collectors).map(id=>'collector:'+id).find(id=>id!==collector);
 assert.ok(other);assert.throws(()=>cmd({type:'native-integration-ack-v2',actor:other,reservation_id:reservation.id,commit:reservation.commit,ref:checkoutRef},s),/native-integration-bound-collector-required/);
 assert.throws(()=>cmd({type:'native-integration-reconcile-v2',actor:other,reservation_id:reservation.id,git_child_stopped:true,ref_at_base:true,evidence_digest:'e'.repeat(64)},s),/native-integration-bound-collector-required/);
 assert.throws(()=>cmd({type:'native-integration-ack-v2',actor:collector,reservation_id:reservation.id,commit:'d'.repeat(40),ref:checkoutRef},s),/native-integration-receipt-mismatch/);
 assert.throws(()=>cmd({type:'native-integration-ack-v2',actor:owner,reservation_id:reservation.id,commit:reservation.commit,ref:checkoutRef},s),/native-integration-bound-collector-required/);
 assert.throws(()=>cmd({type:'native-integration-reconcile-v2',actor:collector,reservation_id:reservation.id,git_child_stopped:false,ref_at_base:true,evidence_digest:'e'.repeat(64)},s),/native-integration-stopped-unchanged-proof-required/);
 const acked=cmd({type:'native-integration-ack-v2',actor:collector,reservation_id:reservation.id,commit:reservation.commit,ref:checkoutRef},s);
 assert.equal(acked.state.teams.team.work['fix-sum'].status,'integrated');assert.equal(acked.state.publication_fence,undefined);
});

// ---- Gate, resume, conflict, lease, abort and trailer coverage (slice 1, increment 5).
const publishArgs={workId:'fix-sum',message:'Fix sum',story:'WP-20/story-x',commitIdentity:identity};
const publish=(f,host=f.host)=>host.publishNativeWork(publishArgs);
const checkoutOf=f=>JSON.parse(readFileSync(join(f.hostDir,'work-fix-sum.json'),'utf8')).checkout;
// A clone of the authority view with `fn(state,team)` applied.
const edited=(f,fn,view=f.load())=>{const state=structuredClone(view.state);fn(state,state.teams.team);return {state,revision:view.revision};};
const run=(c,view)=>reduceTeamEvent(structuredClone(view.state),{team:'team',at:new Date().toISOString(),request_key:'k'+Math.random(),actor:owner,...c},{revision:view.revision});
const reservationOf=(f,view=f.load())=>({id:'native-integration-00000000-0000-4000-8000-000000000000',work_id:'fix-sum',...nativePublicationGate(view.state,view.state.teams.team,view.state.teams.team.work['fix-sum'],Date.now()),checkout_ref:'refs/waypost/teams/team/fix-sum/'+'0'.repeat(16),commit:'a'.repeat(40),commit_message_digest:'b'.repeat(64),commit_identity:identity});
const prepare=(f,view=f.load())=>run({type:'native-integration-prepare-v2',reservation:reservationOf(f,view)},view);
const approver=t=>t.participants[Object.values(t.native_work_reviews)[0].records.at(-1).participant];
const gateCases={
 'the approving critic is revoked':(s,t)=>{approver(t).revoked=true;},
 'the approving critic changes incarnation':(s,t)=>{const p=approver(t);p.incarnation=p.incarnation+'-new';},
 'the approving critic changes model revision':(s,t)=>{const p=approver(t);p.model.model_revision=(p.model.model_revision??0)+1000;},
 // The two independent critics share a rank, so a higher floor shows as the approval having been given under a lower one.
 'the review floor rose since the approval':(s,t)=>{Object.values(t.native_work_reviews)[0].records.at(-1).review_floor=t.review_floor-1;},
 // The approval pinned the digest of the review calibration it was given under; a profile whose calibration differs from it no longer matches.
 'the calibration digest of the review profile differs from the approval':(s,t)=>{Object.values(t.native_work_reviews)[0].records.at(-1).calibration_digest='e'.repeat(64);}
};
test('the publication gate refuses a reservation whose approving critic changed, whose floor rose or whose calibration changed',async t=>{
 const f=await approved(t),v=f.load();
 assert.equal(prepare(f).state.teams.team.native_integration.state,'prepared');
 const reservation=reservationOf(f);
 for(const [name,change] of Object.entries(gateCases))assert.throws(()=>run({type:'native-integration-prepare-v2',reservation},edited(f,change)),error=>{assert.equal(error.code??error.message,'native-integration-approving-critic-changed',name);return true;});
 rejectsCode(()=>run({type:'native-integration-prepare-v2',reservation},edited(f,(s,t)=>{t.review_floor=1000;})),'native-work-active-leader-required');
 // Recalibrating the profile itself also drops the critic from the leader's frontier before the approval is compared.
 rejectsCode(()=>run({type:'native-integration-prepare-v2',reservation},edited(f,(s,t)=>{const profile=t.policy.profiles.find(x=>x.identity.profile_id===approver(t).native_admission.identity.profile_id);profile.calibration.review={...profile.calibration.review,note:'recalibrated'};})),'native-work-active-leader-required');
 assert.equal(f.load().revision,v.revision);
});
test('the publication gate names a lapsed critic lease, an unresolved call for the work and a negative audit of the current acknowledgement',async t=>{
 const f=await approved(t),reservation=reservationOf(f);
 // The critic's quota proof expired.
 rejectsCode(()=>run({type:'native-integration-prepare-v2',reservation},edited(f,(s,team)=>{const p=team.participants[f.critic];p.native_protocol_quota={binding:{incarnation:p.incarnation,model_revision:p.model.model_revision,descriptor_digest:p.native_binding.descriptor_digest,profile:structuredClone(p.native_admission.identity),billing:{}},proof:{status:'available',expires_at:new Date(Date.now()-60000).toISOString()}};})),'native-integration-approving-critic-quota-ineligible');
 // A call for the work is still consumed or uncertain.
 for(const state of ['consumed','uncertain'])rejectsCode(()=>run({type:'native-integration-prepare-v2',reservation},edited(f,s=>{s.subscription_invocations['call-'+state]={id:'call-'+state,team:'team',state,work:{work_id:'fix-sum'}};})),'native-integration-unresolved-call');
 // A settled call does not block.
 assert.equal(run({type:'native-integration-prepare-v2',reservation},edited(f,s=>{s.subscription_invocations.done={id:'done',team:'team',state:'settled',work:{work_id:'fix-sum'}};})).state.teams.team.native_integration.state,'prepared');
 // An unresolved negative audit of the ACK the current leader holds.
 const ack=Object.values(f.load().state.subscription_invocations).find(x=>x.team==='team'&&x.action_ack?.leader===f.load().state.teams.team.leader&&x.action_ack.epoch===f.load().state.teams.team.epoch);assert.ok(ack);
 rejectsCode(()=>run({type:'native-integration-prepare-v2',reservation},edited(f,(s,team)=>{team.native_protocol_reviews={audit:{unresolved_negative:true,records:[{source_invocation_id:ack.id}]}};})),'native-work-negative-leadership-audit');
 // An unrelated work is not affected by an unresolved call for another work.
 assert.equal(run({type:'native-integration-prepare-v2',reservation},edited(f,s=>{s.subscription_invocations.other={id:'other',team:'team',state:'consumed',work:{work_id:'elsewhere'}};})).state.teams.team.native_integration.state,'prepared');
});
test('a change between prepare and start is refused at start and a fence of another team blocks it',async t=>{
 const f=await approved(t),prepared=prepare(f),at={state:prepared.state,revision:f.load().revision+1};
 const start={type:'native-integration-start-v2',reservation_id:reservationOf(f).id};
 assert.equal(run(start,at).state.publication_fence.protocol,2);
 for(const [name,change] of Object.entries(gateCases))assert.throws(()=>run(start,edited(f,change,at)),error=>{assert.equal(error.code??error.message,'native-integration-approving-critic-changed',name);return true;});
 rejectsCode(()=>run(start,edited(f,(s,team)=>{team.quota_revision=(team.quota_revision||0)+1;},at)),'native-integration-approval-changed');
 rejectsCode(()=>run(start,edited(f,s=>{s.subscription_invocations.late={id:'late',team:'team',state:'uncertain',work:{work_id:'fix-sum'}};},at)),'native-integration-unresolved-call');
 rejectsCode(()=>run(start,edited(f,s=>{s.publication_fence={team:'other',reservation:'native-integration-other',work:'elsewhere',protocol:2};},at)),'project-publication-in-progress');
 rejectsCode(()=>run({type:'native-integration-start-v2',reservation_id:'native-integration-11111111-1111-4111-8111-111111111111'},at),'native-integration-prepared-reservation-required');
 rejectsCode(()=>run(start,{state:run(start,at).state,revision:at.revision+1}),'native-integration-prepared-reservation-required');
});
test('the Host refuses at the gate before any reservation, record or fence: stale critic, held fence',async t=>{
 const f=await approved(t),view=f.load(),base=git(f.root,'rev-parse',checkoutOf(f).ref);
 const hostOn=change=>createTeamHost(f.config,{...f.dependencies,load:()=>edited(f,change,view)});
 await rejectsAsync(()=>publish(f,hostOn(gateCases['the approving critic is revoked'])),'native-integration-approving-critic-changed');
 await rejectsAsync(()=>publish(f,hostOn(gateCases['the review floor rose since the approval'])),'native-integration-approving-critic-changed');
 await rejectsAsync(()=>publish(f,hostOn(s=>{s.publication_fence={team:'other',reservation:'native-integration-other',work:'elsewhere',protocol:2};})),'host-native-publication-fence-held');
 assert.equal(f.load().revision,view.revision);assert.equal(f.load().state.teams.team.native_integration,undefined);assert.equal(git(f.root,'rev-parse',checkoutOf(f).ref),base);
});
test('close refuses forged protocol 2 evidence of an integrated work, one field at a time',async t=>{
 const f=await approved(t);await publish(f);
 const closeOn=change=>{const v=edited(f,(s,team)=>change(team.work['fix-sum'].integrated_evidence,team.work['fix-sum'],team));return reduceTeamEvent(v.state,{type:'close-v1',team:'team',actor:owner,at:new Date().toISOString(),request_key:'close-'+Math.random()},{revision:v.revision});};
 assert.equal(closeOn(()=>{}).result.closed,'team');
 const w=work(f);
 for(const [name,change] of Object.entries({
  commit:e=>{e.commit='f'.repeat(40);},tree:e=>{e.tree='c'.repeat(40);},base:e=>{e.base='d'.repeat(40);},tests_status:e=>{e.tests_status='passed';},
  candidate_digest:e=>{e.candidate_digest='e'.repeat(64);},criteria_digest:e=>{e.criteria_digest='e'.repeat(64);},manifest_digest:e=>{e.manifest_digest='e'.repeat(64);},tests_digest:e=>{e.tests_digest='e'.repeat(64);},target_digest:e=>{e.target_digest='e'.repeat(64);},
  protocol:e=>{e.protocol=1;},'no reviews':e=>{e.reviews=[];},'unknown review':e=>{e.reviews=['no-such-invocation'];},'evidence removed':(e,x)=>{delete x.integrated_evidence;},
  'work commit differs':(e,x)=>{x.commit='f'.repeat(40);},'negative review stands':(e,x,team)=>{Object.values(team.native_work_reviews)[0].unresolved_negative=true;},
  'review no longer approves':(e,x,team)=>{for(const r of Object.values(team.native_work_reviews)[0].records)r.verdict='changes-requested';}
 }))rejectsCode(()=>closeOn(change),'unfinished-reviewed-team-work');
 assert.equal(work(f).commit,w.commit);
});
test('a reservation left prepared by an interrupted start is resumed with the same id and commit',async t=>{
 const f=await approved(t,{interruptStart:true});
 await assert.rejects(()=>publish(f),/fixture interrupted publication start/);
 const x=f.load().state.teams.team.native_integration;assert.equal(x.state,'prepared');assert.equal(f.load().state.publication_fence,undefined);
 // Nothing moved the private ref: publishWorkCommit has not been called.
 assert.equal(git(f.root,'rev-parse',x.checkout_ref),f.base);
 const r=await publish(f);
 const y=f.load().state.teams.team.native_integration;
 assert.equal(y.id,x.id);assert.equal(y.commit,x.commit);assert.equal(y.state,'acknowledged');assert.equal(r.commit,x.commit);assert.equal(work(f).status,'integrated');
 assert.equal(git(f.root,'rev-parse',x.checkout_ref),x.commit);assert.equal(f.load().state.publication_fence,undefined);
 assert.equal(close(f).result.closed,'team');
});
test('a resumed reservation is refused before start when a foreign lease appeared or the private ref moved',async t=>{
 let leases=[];const f=await approved(t,{interruptStart:true,checkLeases:()=>leases});
 await assert.rejects(()=>publish(f),/fixture interrupted publication start/);
 const x=f.load().state.teams.team.native_integration;
 leases=['src/sum.js'];await rejectsAsync(()=>publish(f),'host-publication-foreign-live-lease');
 leases=[];const third=git(f.root,'commit-tree',x.tree,'-p',f.base,'-m','other');git(f.root,'update-ref',x.checkout_ref,third,f.base);
 await rejectsAsync(()=>publish(f),'integration-publication-conflict');
 assert.equal(f.load().state.teams.team.native_integration.state,'prepared');assert.equal(f.load().state.publication_fence,undefined);
 git(f.root,'update-ref',x.checkout_ref,f.base,third);
 assert.equal((await publish(f)).integrated,'fix-sum');
});
test('recovery aborts a prepared reservation and the Host abort is idempotent',async t=>{
 const f=await approved(t,{interruptStart:true});
 await assert.rejects(()=>publish(f),/fixture interrupted publication start/);
 const x=f.load().state.teams.team.native_integration;
 rejectsCode(()=>f.host.abortNativePublication({reservationId:'native-integration-11111111-1111-4111-8111-111111111111'}),'native-integration-reservation-required');
 const r=f.host.recoverNativePublication();
 assert.equal(r.aborted,x.id);assert.equal(f.load().state.teams.team.native_integration.state,'aborted');assert.equal(work(f).status,'approved');
 assert.equal(f.host.recoverNativePublication().unchanged,true);
 const again=await publish(f);assert.equal(again.integrated,'fix-sum');assert.notEqual(f.load().state.teams.team.native_integration.id,x.id);
});
test('Host abort of a prepared reservation aborts it once, then reports it unchanged',async t=>{
 const f=await approved(t,{interruptStart:true});
 await assert.rejects(()=>publish(f),/fixture interrupted publication start/);
 const x=f.load().state.teams.team.native_integration,revision=f.load().revision;
 assert.equal(f.host.abortNativePublication({reservationId:x.id}).aborted,x.id);assert.equal(f.load().state.teams.team.native_integration.state,'aborted');assert.equal(f.load().state.publication_fence,undefined);assert.equal(work(f).status,'approved');
 const after=f.load().revision;assert.ok(after>revision);
 assert.deepEqual(f.host.abortNativePublication({reservationId:x.id}),{aborted:x.id,unchanged:true});assert.equal(f.load().revision,after);
 // An acknowledged reservation cannot be aborted.
 await publish(f);const y=f.load().state.teams.team.native_integration;
 rejectsCode(()=>f.host.abortNativePublication({reservationId:y.id}),'native-integration-reservation-closed');
});
test('a private ref moved to a third commit is refused before any reservation, and a conflict found at recovery keeps the fence',async t=>{
 const f=await approved(t),checkout=checkoutOf(f),third=git(f.root,'commit-tree',f.base+'^{tree}','-p',f.base,'-m','third');
 git(f.root,'update-ref',checkout.ref,third,f.base);
 await rejectsAsync(()=>publish(f),'integration-publication-conflict');
 assert.equal(f.load().state.teams.team.native_integration,undefined);assert.equal(f.load().state.publication_fence,undefined);assert.equal(git(f.root,'rev-parse',checkout.ref),third);
 const g=await approved(t,{integration:{publishWorkCommit:options=>integration.publishWorkCommit({...options,fault:at=>{if(at==='before-ref')throw Error('fixture interrupted publication');}})}});
 await assert.rejects(()=>publish(g),/fixture interrupted publication/);
 const x=g.load().state.teams.team.native_integration,other=git(g.root,'commit-tree',g.base+'^{tree}','-p',g.base,'-m','third');
 assert.equal(x.state,'publishing');git(g.root,'update-ref',x.checkout_ref,other,g.base);
 rejectsCode(()=>g.host.recoverNativePublication({gitChildStopped:true}),'integration-publication-conflict');
 rejectsCode(()=>g.host.abortNativePublication({reservationId:x.id}),'native-integration-reconciliation-required');
 assert.equal(g.load().state.teams.team.native_integration.state,'publishing');assert.equal(g.load().state.publication_fence.reservation,x.id);assert.equal(git(g.root,'rev-parse',x.checkout_ref),other);
});
test('a live lease of another session on a work path refuses publication before any reservation, after the ref check',async t=>{
 const f=await approved(t,{checkLeases:paths=>{assert.deepEqual(paths,['src/sum.js']);return ['src/sum.js'];}}),checkout=checkoutOf(f),third=git(f.root,'commit-tree',f.base+'^{tree}','-p',f.base,'-m','third');
 git(f.root,'update-ref',checkout.ref,third,f.base);
 await rejectsAsync(()=>publish(f),'integration-publication-conflict');
 git(f.root,'update-ref',checkout.ref,f.base,third);
 await rejectsAsync(()=>publish(f),'host-publication-foreign-live-lease');
 assert.equal(f.load().state.teams.team.native_integration,undefined);assert.equal(f.load().state.publication_fence,undefined);assert.equal(git(f.root,'rev-parse',checkout.ref),f.base);
});
test('the published commit carries the story, the leader and critic as contributors, and the leader harness, session and provider',async t=>{
 const f=await approved(t);
 // The fixture leader records no harness or session: the trailers then say so.
 await publish(f);
 const team=f.load().state.teams.team,w=work(f),body=git(f.root,'show','-s','--format=%B',w.commit).split('\n');
 assert.equal(team.leader,f.participant);assert.notEqual(f.critic,team.leader);
 for(const line of ['Waypost-Story: WP-20/story-x','Waypost-Contributors: '+team.leader+', '+f.critic,'Waypost-Harness: unrecorded','Waypost-Session: unrecorded','Waypost-Provider: '+team.participants[team.leader].model.provider])assert.ok(body.includes(line),line+'\n'+body.join('\n'));
 // A leader that records them carries them into the commit (the Host reads them from the loaded team).
 const g=await approved(t),recorded=createTeamHost(g.config,{...g.dependencies,load:()=>edited(g,(s,team)=>{Object.assign(team.participants[team.leader],{harness:'codex',session:'session-leader'});})});
 await publish(g,recorded);
 const text=git(g.root,'show','-s','--format=%B',work(g).commit).split('\n');
 for(const line of ['Waypost-Harness: codex','Waypost-Session: session-leader','Waypost-Story: WP-20/story-x','Waypost-Contributors: '+team.leader+', '+g.critic])assert.ok(text.includes(line),line+'\n'+text.join('\n'));
 assert.equal(body.filter(l=>/^Waypost-(Story|Contributors|Harness|Session|Provider):/.test(l)).length,5);
 assert.equal(git(f.root,'show','-s','--format=%an <%ae> %ad',w.commit,'--date=raw'),'Owner <owner@example.com> 1791331200 +0000');
});
