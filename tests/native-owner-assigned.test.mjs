import test from 'node:test';
import assert from 'node:assert/strict';
import { authorityFixture,now,at } from './helpers/native-calibration.mjs';
import { reduceTeamEvent } from '../scripts/team-state.mjs';
import { applySubscriptionAccounting } from '../scripts/team-subscription.mjs';
import { validatePolicy,rankParticipant,listedReviewer,selectCoordinator,policyRow,OWNER_ASSIGNED_LIMITATIONS } from '../scripts/team.mjs';
import { createProtocolLeaderAckRequest,createProtocolLeadershipAuditRequest,createProtocolHandoverAckRequest } from '../scripts/team-native-action.mjs';
import { routingDigest } from '../scripts/model-routing.mjs';
const legacy={protocol:1,revision:1,domain:'coding',mode:'automatic',generated_at:at,expires_at:new Date(now+600000).toISOString(),sources:[{id:'fixture',url:'https://example.org/fixture',retrieved_at:at}],evidence_floor:['adapter-observed'],profiles:[]};
const day=86400000,until=new Date(now+day).toISOString();
let shared,sharedUncaptured;
const clone=structuredClone,fork=g=>({...g,state:clone(g.state)});
// A bootstrap team (protocol-1 placeholder policy) whose peers each made one identity call; no cohort exists.
function prepare(f){const s=clone(f.state);Object.assign(s,{protocol:1,owner_hash:'fixture',task_bindings:{task:'team'}});Object.assign(s.teams.team,{task:'task',policy:legacy,messages:[],work:{},status:'forming',leader:null,candidate:null,required_review_models:[],native_policy_bootstrap:true});return {...f,state:s};}
async function fixture(){shared??=authorityFixture({identityOnly:{}});return prepare(await shared);}
async function uncaptured(){sharedUncaptured??=authorityFixture({identityOnly:{capture:false}});return prepare(await sharedUncaptured);}
const assign=(fields={})=>({type:'native-policy-assign-v2',team:'team',actor:'owner:fixture',at,request_key:'assign',expected_policy_revision:1,coordinator:['peer-a'],reviewers:['peer-b','peer-c'],executors:['peer-d'],reason:'the owner chose these roles',expires_at:until,issued_by:{harness:'claude',session:'session-1'},...fields});
const run=(f,fields)=>reduceTeamEvent(f.state,assign(fields));
const team=(f,fields)=>run(f,fields).state.teams.team;
// Re-derive the observation digests after a forged change, so only the checked binding can refuse it.
function forge(profile,mutate){const q=clone(profile);mutate(q.profile);q.profile_digest=routingDigest(q.profile);q.profile_id='native-profile-'+q.profile_digest;const {observation_id,...body}=q;q.observation_id='native-observation-'+routingDigest(body);return q;}
const capture=(f,peer,profile,actor)=>applySubscriptionAccounting(f.state.teams.team&&f.state,f.state.teams.team,{type:'native-identity-capture-v2',actor:actor??peer.identity.actor,at,invocation_id:peer.identity.invocation_id,nonce:peer.identity.nonce,profile:profile??peer.identity.profile},now,{owner:()=>{}});

test('an identity call settles into a collector-observed, immutable identity observation and replays unchanged',async()=>{
 const f=await fixture(),invocations=f.state.subscription_invocations;
 for(const name of ['a','b','c','d']){
  const x=invocations['subscription-'+name+'-identity'],o=x.identity_observation;
  assert.equal(x.state,'settled');assert.equal(x.identity_blocker,undefined);assert.equal(o.participant,'peer-'+name);assert.equal(o.collector,'collector-'+name);assert.equal(o.source_invocation,x.id);
  assert.equal(o.identity.kind,'native-configuration');assert.equal(o.identity.profile_id,'native-profile-'+o.identity.profile_digest);assert.equal(o.expires_at,new Date(now+900000).toISOString());
 }
 const g=await uncaptured(),peer=g.peers[0],clean=clone(g.state);
 assert.equal(g.state.subscription_invocations['subscription-a-identity'].identity_observation,undefined);
 const first=capture(g,peer);assert.equal(first.result.protected_actions_granted,false);assert.equal(g.state.teams.team.policy.protocol,1);
 const recorded=clone(g.state.subscription_invocations['subscription-a-identity'].identity_observation);
 assert.deepEqual(capture(g,peer).result,{captured:'subscription-a-identity',unchanged:true,protected_actions_granted:false});assert.deepEqual(g.state.subscription_invocations['subscription-a-identity'].identity_observation,recorded);
 g.state=clean;
});
test('an identity capture refuses a foreign collector, a wrong token, a changed scope, quarantine and expiry',async()=>{
 const g=await uncaptured(),peer=g.peers[0];
 const refuse=(re,profile,actor,mutate)=>{const copy=fork(g);if(mutate)mutate(copy.state);assert.throws(()=>capture(copy,peer,profile,actor),re);assert.equal(copy.state.subscription_invocations['subscription-a-identity'].identity_observation,undefined);};
 refuse(/bound-identity-collector-required/,undefined,'collector:collector-b');
 refuse(/bound-identity-collector-required/,undefined,'owner:fixture');
 refuse(/bound-identity-collector-required/,undefined,undefined,s=>{s.collectors['collector-a'].revoked=true;});
 refuse(/identity-profile-binding/,{...clone(peer.identity.profile),nonce:'WAYPOST_PROBE_other'});
 refuse(/identity-profile-binding/,{...clone(peer.identity.profile),participant:'peer-b'});
 refuse(/identity-profile-binding/,{...clone(peer.identity.profile),model_revision:2});
 refuse(/profile-scope-changed/,forge(peer.identity.profile,p=>{p.execution_scope.permissions.rules_digest='b'.repeat(64);}));
 refuse(/profile-scope-changed/,forge(peer.identity.profile,p=>{p.version='9.9.9';}));
 refuse(/isolated-action-profile-required/,forge(peer.identity.profile,p=>{p.native_model_id='another-model';}));
 refuse(/bounded-fields-required/,{...clone(peer.identity.profile),admission_id:'x'});
 refuse(/nonquarantined/,undefined,undefined,s=>{s.subscription_invocations['subscription-a-identity'].binding_changes={isolation:true};});
 refuse(/nonquarantined/,undefined,undefined,s=>{for(const ctx of Object.values(s.teams.team.subscription_contexts))if(ctx.collector==='collector:collector-a')ctx.quarantined=true;});
 refuse(/original-sealed-identity-required/,undefined,undefined,s=>{s.subscription_invocations['subscription-a-identity'].identity_seal.turn_id='forged';});
 refuse(/complete-sealed-identity-required/,undefined,undefined,s=>{delete s.subscription_invocations['subscription-a-identity'].identity_seal;});
 refuse(/complete-sealed-identity-required/,undefined,undefined,s=>{s.subscription_invocations['subscription-a-identity'].purpose='calibration';});
 const late=fork(g);assert.throws(()=>applySubscriptionAccounting(late.state,late.state.teams.team,{type:'native-identity-capture-v2',actor:peer.identity.actor,at,invocation_id:peer.identity.invocation_id,nonce:peer.identity.nonce,profile:peer.identity.profile},now+900000,{owner:()=>{}}),/identity-observation-expired/);
 // A captured observation never changes, whatever a later call says.
 const done=fork(g);capture(done,peer);const other=forge(peer.identity.profile,p=>{p.execution_scope.cwd='/elsewhere';});
 assert.throws(()=>capture(done,peer,other),/identity|profile/);
});
test('an identity seal rides only an identity reservation and is never required elsewhere',async()=>{
 const g=await uncaptured();
 const x=g.state.subscription_invocations['subscription-a-identity'];assert.equal(x.identity_seal.outcome,'completed');assert.equal(x.identity_seal.context_id,'ledger-a-identity');assert.equal(x.identity_seal.original_output,'WAYPOST_PROBE_a-identity');
});

test('assign derives every binding from state and elects the primary coordinator with the top independent reviewer',async()=>{
 const f=await fixture(),original=clone(f.state),r=run(f),t=r.state.teams.team;
 assert.deepEqual(f.state,original);
 assert.equal(t.policy.protocol,2);assert.equal(t.policy.mode,'owner-assigned');assert.equal(t.policy.revision,2);assert.equal(t.policy.approved_by,'owner:fixture');assert.equal(t.policy.limitations,OWNER_ASSIGNED_LIMITATIONS);assert.equal(t.policy.provenance,undefined);assert.equal(t.policy.scales,undefined);
 assert.deepEqual(t.policy.assignment,{coordinator:['peer-a'],reviewers:['peer-b','peer-c'],executors:['peer-d'],reason:'the owner chose these roles',issued_by:{harness:'claude',session:'session-1'}});
 assert.equal(t.candidate,'peer-a');assert.equal(t.review_candidate,'peer-b');assert.equal(t.review_floor,2);assert.equal(t.review_blocker,null);assert.equal(t.status,'forming');assert.equal(t.leader,null);assert.deepEqual(t.required_review_models,[]);assert.equal(t.required_review_identities_v2,undefined);
 assert.deepEqual(r.result,{policy_revision:2,mode:'owner-assigned',candidate:'peer-a',review_candidate:'peer-b',review_floor:2,scope:'waypost-protocol',protected_actions_granted:false});
 for(const row of t.policy.profiles)assert.deepEqual(Object.keys(row).sort(),['collector','descriptor_digest','identity','incarnation','model_revision','participant','priorities']);
 const a=t.participants['peer-a'];assert.deepEqual(Object.keys(a.native_admission).sort(),['collector','descriptor_digest','expires_at','identity','incarnation','model_revision','observation_id','observed_at','participant','protocol','source_invocation']);
 assert.equal(a.native_admission.expires_at,until);assert.equal(a.native_admission.source_invocation,'subscription-a-identity');assert.equal(a.native_admission.collector,'collector-a');
 assert.deepEqual(Object.values(t.participants).map(p=>p.native_admission.identity),Object.values(f.state.subscription_invocations).map(x=>x.identity_observation.identity));
 assert.deepEqual(validatePolicy(t.policy),t.policy);
});
test('ranks follow the owner order, an unlisted role is null and a later arrival has no role',async()=>{
 const t=team(await fixture(),{coordinator:['peer-a','peer-b'],reviewers:['peer-c','peer-b','peer-d'],executors:['peer-d','peer-a']});
 const rank=(id,role)=>rankParticipant(t.participants[id],t.policy,role,{now,coverage:'waypost-protocol-'+role});
 assert.deepEqual(['peer-a','peer-b','peer-c','peer-d'].map(id=>rank(id,'coordinate')),[2,1,null,null]);
 assert.deepEqual(['peer-a','peer-b','peer-c','peer-d'].map(id=>rank(id,'review')),[null,2,3,1]);
 assert.deepEqual(t.policy.profiles.map(r=>r.priorities.implement),[1,null,null,2]);
 assert.equal(rankParticipant(t.participants['peer-d'],t.policy,'implement',{now,coverage:'waypost-protocol-implement'}),null,'the executor rank is a later slice');
 assert.equal(rankParticipant(t.participants['peer-a'],t.policy,'coordinate',{now,coverage:'waypost-protocol-coordinate',action:'dispatch'}),null);
 assert.equal(rankParticipant(t.participants['peer-a'],t.policy,'coordinate',{now:Date.parse(until),coverage:'waypost-protocol-coordinate'}),null,'an expired assignment ranks nobody');
 assert.equal(t.candidate,'peer-a');assert.equal(t.review_candidate,'peer-c');assert.equal(t.review_floor,3);
 const join={type:'join',team:'team',actor:'owner:fixture',at,request_key:'join',participant:{id:'peer-e',incarnation:'inc-e',session:'session',harness:'fixture',root:'/fixture',credential_hash:'hash',model:{provider:'unknown',model_id:'unknown',reasoning:'unknown',model_revision:1,resolved:false,evidence:{kind:'unknown',source:'fixture',observed_at:at}}}};
 const state={protocol:1,owner_hash:'fixture',task_bindings:{task:'team'},teams:{team:t},collectors:{}},joined=reduceTeamEvent(state,join).state.teams.team;
 assert.equal(rankParticipant(joined.participants['peer-e'],joined.policy,'coordinate',{now,coverage:'waypost-protocol-coordinate'}),null);assert.equal(rankParticipant(joined.participants['peer-e'],joined.policy,'review',{now,coverage:'waypost-protocol-review'}),null);
 assert.equal(joined.candidate,'peer-a');assert.equal(joined.review_floor,3);assert.throws(()=>reduceTeamEvent(state,{...join,request_key:'join2',participant:{...join.participant,id:'peer-f',native_admission:{}}}),/reducer-only/);
});
test('a busy primary pauses the team: no alternate is promoted, and a busy reviewer keeps the floor, a departed one passes it on',async()=>{
 const t=team(await fixture(),{coordinator:['peer-a','peer-b'],reviewers:['peer-c','peer-d'],executors:[]}),state={protocol:1,owner_hash:'fixture',task_bindings:{task:'team'},teams:{team:t},collectors:{}};
 assert.equal(t.candidate,'peer-a');
 const avail=(s,id,availability)=>reduceTeamEvent(s,{type:'availability',team:'team',actor:id,incarnation:s.teams.team.participants[id].incarnation,availability,at,request_key:id+availability}).state;
 const busy=avail(state,'peer-a','busy').teams.team;assert.equal(busy.status,'paused');assert.equal(busy.candidate,null);assert.equal(busy.review_candidate,null);assert.equal(busy.leader,null);
 const back=avail(avail(state,'peer-a','busy'),'peer-a','ready').teams.team;assert.equal(back.candidate,'peer-a');assert.equal(back.status,'forming');
 const reviewerBusy=avail(state,'peer-c','busy').teams.team;assert.equal(reviewerBusy.review_floor,2,'a busy higher reviewer keeps the floor');assert.equal(reviewerBusy.review_candidate,null);assert.equal(reviewerBusy.candidate,'peer-a');
 const gone=reduceTeamEvent(state,{type:'revoke',team:'team',actor:'owner:fixture',participant_id:'peer-c',at,request_key:'revoke'}).state.teams.team;assert.equal(gone.review_floor,1,'a revoked reviewer is out: the next listed one is the top');assert.equal(gone.review_candidate,'peer-d');
 const left=avail(state,'peer-c','left').teams.team;assert.equal(left.review_floor,1);assert.equal(left.review_candidate,'peer-d');
});
test('a reviewer may share the coordinator configuration, never the executor configuration',async()=>{
 const f=await fixture(),same=(from,to)=>{const g=prepare(f);const o=id=>Object.values(g.state.subscription_invocations).find(x=>x.participant===id).identity_observation;o(from).identity=clone(o(to).identity);return g;};
 const shared=same('peer-b','peer-a'),ok=team(shared,{coordinator:['peer-a'],reviewers:['peer-b'],executors:[]});
 assert.equal(ok.review_candidate,'peer-b');assert.equal(ok.participants['peer-b'].native_admission.identity.profile_id,ok.participants['peer-a'].native_admission.identity.profile_id);
 assert.equal(policyRow(ok.policy,ok.participants['peer-a']).participant,'peer-a');assert.equal(policyRow(ok.policy,ok.participants['peer-b']).participant,'peer-b','two participants of one configuration keep their own rows');
 assert.equal(rankParticipant(ok.participants['peer-b'],ok.policy,'review',{now,coverage:'waypost-protocol-review'}),1);assert.equal(rankParticipant(ok.participants['peer-a'],ok.policy,'coordinate',{now,coverage:'waypost-protocol-coordinate'}),1);
 const request=createProtocolLeaderAckRequest(ok,{actionId:'ack-shared',now}).request;assert.equal(request.review_candidate.participant,'peer-b');
 const exec=same('peer-c','peer-d');
 assert.throws(()=>run(exec,{coordinator:['peer-a'],reviewers:['peer-c'],executors:['peer-d']}),/independent-reviewer-required/);
 const second=team(exec,{coordinator:['peer-a'],reviewers:['peer-c','peer-b'],executors:['peer-d']});assert.equal(second.review_floor,2);assert.equal(second.review_candidate,'peer-c','the listed order decides; the executor rule is the bidi check');
 const tied=prepare(exec);
 const t=team(tied,{coordinator:['peer-a'],reviewers:['peer-b','peer-c'],executors:['peer-d']});
 assert.equal(listedReviewer(Object.values(t.participants),t.policy,{excluded:['peer-d','peer-a'],profiles:[t.participants['peer-d'].native_admission.identity.profile_id],now}).reviewer.id,'peer-b','the executor-side reviewer skips the executor configuration');
 assert.equal(listedReviewer(Object.values(t.participants),t.policy,{excluded:['peer-d','peer-b'],profiles:[t.participants['peer-d'].native_admission.identity.profile_id],now}).floor,null,'peer-c shares the executor configuration, so nobody is left');
 assert.deepEqual(listedReviewer(Object.values(t.participants),t.policy,{excluded:[],now}),{floor:null,reviewer:null});
});
test('assign carries selectors only and refuses caller bindings, a missing role and a lone coordinator-reviewer',async()=>{
 const f=await fixture();
 for(const fields of [{coordinator:[{id:'peer-a'}]},{reviewers:[{participant:'peer-b',priorities:{review:9}}]},{executors:[null]},{coordinator:'peer-a'},{coordinator:['peer-a','peer-a']},{policy:{}},{profiles:[]},{admissions:{}},{summary:{}},{native_admission:{}},{scope:'waypost-protocol'},{coordinator:['peer-a'],approved_by:'owner:other'},{issued_by:{harness:'claude',session:'s',role:'owner'}},{issued_by:{harness:'claude'}},{issued_by:null}])assert.throws(()=>run(f,fields),/selectors-only|issuer-required/,JSON.stringify(fields));
 assert.throws(()=>run(f,{coordinator:[]}),/coordinator-and-reviewer-required/);assert.throws(()=>run(f,{reviewers:[]}),/coordinator-and-reviewer-required/);
 assert.throws(()=>run(f,{reason:''}),/invalid-assign-reason/);assert.throws(()=>run(f,{reason:'x'.repeat(4097)}),/invalid-assign-reason/);
 assert.throws(()=>run(f,{coordinator:['peer-a'],reviewers:['peer-a'],executors:[]}),/independent-reviewer-required/);
 assert.throws(()=>run(f,{coordinator:['peer-a','peer-b'],reviewers:['peer-b'],executors:[]}),/independent-reviewer-required/,'an alternate with no independent reviewer');
 assert.throws(()=>run(f,{coordinator:['peer-a'],reviewers:['peer-b'],executors:['peer-b']}),/independent-reviewer-required/,'the executor is the only reviewer');
 assert.throws(()=>run(f,{coordinator:['peer-a'],reviewers:['peer-a','peer-b'],executors:['peer-b']}),/independent-reviewer-required/,'the primary coordinator is no reviewer of an executor');
 assert.throws(()=>run(f,{coordinator:['peer-nobody']}),/participant-unavailable/);
 assert.throws(()=>run(f,{expected_policy_revision:2}),/policy-revision-mismatch/);
 assert.throws(()=>run(f,{actor:'peer-a',incarnation:'inc-a'}),/owner-required/);assert.throws(()=>run(f,{actor:'collector:collector-a'}),/owner-required/);
 for(const mutate of [s=>{s.teams.team.participants['peer-b'].revoked=true;},s=>{s.teams.team.participants['peer-b'].availability='left';}]){const g=prepare(f);mutate(g.state);assert.throws(()=>run(g),/participant-unavailable/);}
});
test('assign needs a fresh, current identity observation for every listed participant',async()=>{
 const f=await fixture();
 assert.throws(()=>reduceTeamEvent(f.state,assign({at:new Date(now+900000).toISOString()})),/fresh-identity-required/,'the observation expired');
 const stale=(mutate)=>{const g=prepare(f);mutate(g.state);assert.throws(()=>run(g),/fresh-identity-required/);};
 stale(s=>{s.teams.team.participants['peer-a'].incarnation='inc-new';});
 stale(s=>{s.teams.team.participants['peer-b'].model.model_revision=2;});
 stale(s=>{s.teams.team.participants['peer-c'].native_binding.descriptor_digest='f'.repeat(64);});
 stale(s=>{s.collectors['collector-a'].revoked=true;});
 stale(s=>{s.subscription_invocations['subscription-b-identity'].binding_changes={billing_before:true};});
 stale(s=>{for(const ctx of Object.values(s.teams.team.subscription_contexts))if(ctx.collector==='collector:collector-c')ctx.quarantined=true;});
 stale(s=>{s.subscription_invocations['subscription-a-identity'].identity_observation.collector='collector-b';});
 const missing=prepare(await authorityFixture({identityOnly:{skip:['d']}}));assert.throws(()=>run(missing),/fresh-identity-required/);assert.equal(team(missing,{executors:[]}).policy.profiles.length,3,'a participant outside every list needs no identity');
 const old=prepare(f);Object.assign(old.state.subscription_invocations['subscription-a-identity'].identity_observation,{observed_at:new Date(now-8*day).toISOString(),expires_at:new Date(now-8*day+900000).toISOString()});assert.throws(()=>run(old),/fresh-identity-required/);
});
test('assign bounds the expiry by now and by seven days after the oldest observation',async()=>{
 const f=await fixture();
 for(const expires_at of [at,new Date(now-1000).toISOString(),'tomorrow',42,null,new Date(now+day).toISOString().replace('.000Z','Z'),new Date(now+7*day+1).toISOString()])assert.throws(()=>run(f,{expires_at}),/assign-expiry/,String(expires_at));
 const edge=team(f,{expires_at:new Date(now+7*day).toISOString()});assert.equal(edge.policy.expires_at,new Date(now+7*day).toISOString());assert.equal(edge.participants['peer-b'].native_admission.expires_at,edge.policy.expires_at);
 const older=prepare(f);older.state.subscription_invocations['subscription-a-identity'].identity_observation.observed_at=new Date(now-1000).toISOString();
 assert.throws(()=>run(older,{expires_at:new Date(now+7*day).toISOString()}),/expiry-too-long/);assert.equal(team(older,{expires_at:new Date(now+7*day-1000).toISOString()}).policy.generated_at,at);
});
test('one team keeps one mode for its whole life',async()=>{
 const f=await fixture(),assigned=run(f).state;
 assert.throws(()=>reduceTeamEvent(assigned,assign({expected_policy_revision:2,request_key:'again'})),/already-assigned/);
 assert.throws(()=>reduceTeamEvent(assigned,{type:'native-policy-install-v2',team:'team',actor:'owner:fixture',at,request_key:'install',cohort_id:'cohort',expected_policy_revision:2,scope:'waypost-protocol'},{revision:9}),/mode-switch-refused/);
 const calibrated=prepare(await authorityFixture()),installed=reduceTeamEvent(calibrated.state,{type:'native-policy-install-v2',team:'team',actor:'owner:fixture',at,request_key:'install',cohort_id:'cohort',expected_policy_revision:1,scope:'waypost-protocol'},{revision:calibrated.revision}).state;
 assert.equal(installed.teams.team.policy.mode,'automatic-calibration');assert.throws(()=>reduceTeamEvent(installed,assign({expected_policy_revision:2})),/mode-switch-refused/);
 for(const patch of [{leader:'peer-a'},{work:{w:{status:'running'}}},{quota_policy:{automatic_redistribution:true}},{required_review_models:[['route','model-a','unknown']]},{runtime_requests:{r:{consumed:false}}},{handover:{}}]){const g=prepare(f);Object.assign(g.state.teams.team,patch);assert.throws(()=>run(g),/native-policy-(idle|quota|legacy|pending)/,JSON.stringify(patch));}
 const pending=prepare(f);pending.state.subscription_invocations['subscription-a-identity'].state='prepared';assert.throws(()=>run(pending),/unresolved-subscription-invocations/);
});
test('a publication fence defers the assignment and the deferred apply restarts it',async()=>{
 const f=await fixture();f.state.publication_fence={team:'team'};const r=run(f);
 assert.equal(r.result.deferred,true);assert.equal(r.result.id,'assign');assert.equal(r.state.teams.team.policy.protocol,1);assert.equal(r.state.teams.team.participants['peer-a'].native_admission,undefined);
 const queued=run(f,{actor:'peer-a',incarnation:'inc-a',request_key:'nonowner'});assert.equal(queued.result.deferred,true);queued.state.publication_fence=null;assert.throws(()=>reduceTeamEvent(queued.state,{type:'deferred-apply-v1',team:'team',actor:'owner:fixture',at,request_key:'apply',deferred_id:'nonowner'}),/owner-required/);
 const held=r.state;held.publication_fence=null;
 const applied=reduceTeamEvent(held,{type:'deferred-apply-v1',team:'team',actor:'owner:fixture',at,request_key:'apply',deferred_id:'assign'}).state.teams.team;
 assert.equal(applied.policy.mode,'owner-assigned');assert.equal(applied.candidate,'peer-a');
 const fenced=clone(held);fenced.publication_fence={team:'team'};assert.throws(()=>reduceTeamEvent(fenced,{type:'deferred-apply-v1',team:'team',actor:'owner:fixture',at,request_key:'apply',deferred_id:'assign'}),/publication-still-in-progress/);
});
test('the leader ACK request pins the assignment digest and no calibration digest',async()=>{
 const t=team(await fixture()),r=createProtocolLeaderAckRequest(t,{actionId:'ack-1',now}),q=r.request;
 assert.equal(q.participant,'peer-a');assert.equal(q.review_candidate.participant,'peer-b');assert.equal(q.calibration_digest,undefined);assert.equal(q.review_candidate.calibration_digest,undefined);
 assert.equal(q.assignment_digest,routingDigest(policyRow(t.policy,t.participants['peer-a'])));assert.equal(q.review_candidate.assignment_digest,routingDigest(policyRow(t.policy,t.participants['peer-b'])));
 assert.equal(q.policy_digest,routingDigest(t.policy));assert.deepEqual(q.profile,t.participants['peer-a'].native_admission.identity);assert.equal(r.request_digest,routingDigest(q));
 assert.ok(!JSON.stringify(q).includes('undefined'));
 const other=team(await fixture(),{reviewers:['peer-c','peer-b']});assert.notEqual(createProtocolLeaderAckRequest(other,{actionId:'ack-1',now}).request.review_candidate.assignment_digest,q.review_candidate.assignment_digest,'the digest follows the owner order');
 const busy=clone(t);busy.participants['peer-b'].availability='busy';assert.throws(()=>createProtocolLeaderAckRequest(busy,{actionId:'ack-1',now}),/strongest-independent-critic-required/);
 const late=clone(t);assert.throws(()=>createProtocolLeaderAckRequest(late,{actionId:'ack-1',now:Date.parse(until)}),/strongest-current-candidate-required/);
});
test('an owner-assigned team refuses every unfinished later-slice mode with a named guard, not a TypeError',async()=>{
 const t=team(await fixture()),state={protocol:1,owner_hash:'fixture',task_bindings:{task:'team'},teams:{team:t},collectors:{}};
 const owner=(type,fields={})=>reduceTeamEvent(state,{type,team:'team',actor:'owner:fixture',at,request_key:type,...fields});
 assert.throws(()=>owner('native-protocol-quota-enable-v2',{revision:1,policy:{automatic_handover:true,expires_at:until,source_rules:[]}}),/owner-assigned-quota-unsupported/);
 const active=clone(t);Object.assign(active,{status:'active',leader:'peer-a',candidate:null});
 assert.throws(()=>createProtocolLeadershipAuditRequest(state,active,{actionId:'audit',sourceInvocationId:'x',now}),/owner-assigned-audit-unsupported/);
 assert.throws(()=>createProtocolHandoverAckRequest(state,active,{actionId:'handover',now}),/owner-assigned-handover-unsupported/);
 for(const type of ['policy','leader-ack','assign'])assert.throws(()=>reduceTeamEvent(state,{type,team:'team',actor:'peer-a',incarnation:'inc-a',at,request_key:type,policy:legacy}),/protected-action-admission-required/);
});
test('invalid owner-assigned policies are rejected', async()=>{
 const t=team(await fixture()),good=t.policy;assert.deepEqual(validatePolicy(clone(good)),good);
 const mutations=[p=>p.mode='owner-assigned-extra',p=>p.activation=false,p=>p.authority_granted=true,p=>p.activation_scope='architecture',p=>p.extra=true,p=>p.provenance={},p=>p.scales={},p=>delete p.approved_by,p=>p.approved_by='peer-a',p=>p.approved_by='owner:',p=>delete p.approved_at,p=>p.approved_at='yesterday',
  p=>p.expires_at=p.generated_at,p=>p.expires_at=new Date(Date.parse(p.generated_at)+7*day+1000).toISOString(),p=>p.revision=3,p=>p.installation.previous_policy_revision=2,p=>p.installation.cohort='cohort',p=>delete p.installation.request_key,p=>p.limitations='measured',
  p=>p.assignment.coordinator=[],p=>p.assignment.reviewers=[],p=>p.assignment.executors=null,p=>p.assignment.reviewers=['peer-b','peer-b'],p=>p.assignment.coordinator=[{id:'peer-a'}],p=>p.assignment.reason='',p=>p.assignment.issued_by={harness:'claude'},p=>p.assignment.extra=1,
  p=>p.profiles=[],p=>p.profiles.pop(),p=>p.profiles.push(clone(p.profiles[0])),p=>p.profiles[0].participant='peer-z',p=>p.profiles[1].participant=p.profiles[0].participant,p=>p.profiles[0].priorities.review=1,p=>p.profiles[0].priorities.coordinate=null,p=>p.profiles[1].priorities.coordinate=0,p=>p.profiles[0].priorities.extra=1,p=>delete p.profiles[0].priorities.implement,
  p=>p.profiles[0].calibration={},p=>p.profiles[0].role_coverage={},p=>delete p.profiles[0].collector,p=>p.profiles[0].collector='',p=>p.profiles[0].descriptor_digest='x',p=>p.profiles[0].model_revision=0,p=>p.profiles[0].identity.profile_digest='0'.repeat(64),p=>p.profiles[0].identity.profile_revision=2,p=>p.profiles[0].incarnation=''];
 for(const mutate of mutations){const p=clone(good);mutate(p);assert.throws(()=>validatePolicy(p),undefined,String(mutate));}
 const spread=clone(good);spread.assignment.reviewers=['peer-b'];spread.profiles=spread.profiles.filter(r=>r.participant!=='peer-c');spread.profiles.find(r=>r.participant==='peer-b').priorities.review=1;
 const ok=clone(good);assert.deepEqual(validatePolicy(ok),ok);
 assert.ok(!JSON.stringify(good).includes('undefined'));
});
test('the stored policy and the admissions stay bound: foreign rows and shared-configuration rows do not cross',async()=>{
 const t=team(await fixture()),a=clone(t.participants['peer-a']),b=t.participants['peer-b'];
 const swapped=clone(t);swapped.policy.profiles.find(r=>r.participant==='peer-b').identity=clone(swapped.policy.profiles.find(r=>r.participant==='peer-a').identity);
 assert.equal(rankParticipant(swapped.participants['peer-b'],swapped.policy,'review',{now,coverage:'waypost-protocol-review'}),null,'the row identity must match the admitted identity');
 a.native_admission.participant='peer-b';assert.equal(rankParticipant(a,t.policy,'coordinate',{now,coverage:'waypost-protocol-coordinate'}),null);
 assert.equal(selectCoordinator(Object.values(t.participants),t.policy,null,{now,coverage:'waypost-protocol-coordinate'}).id,'peer-a');
 assert.equal(rankParticipant(b,t.policy,'review',{now:now-1,coverage:'waypost-protocol-review'}),null);
});
