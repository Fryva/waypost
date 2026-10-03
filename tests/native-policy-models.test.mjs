import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePolicy, rankParticipant, selectCoordinator, selectReviewer, selectProtocolReviewerCandidate, policyStrengthShape } from '../scripts/team.mjs';
import { createProtocolRoleSuite, summarizeProtocolRole } from '../scripts/team-role-suite.mjs';
import { routingDigest } from '../scripts/model-routing.mjs';

const now=Date.parse('2026-10-03T12:00:00Z'),at=new Date(now).toISOString(),expires=new Date(now+600000).toISOString();
function fixture(){
 const profile_digest=routingDigest('fixture-native'),identity={kind:'native-configuration',profile_id:'native-profile-'+profile_digest,profile_digest,profile_revision:1};
 const suite=createProtocolRoleSuite({seed:'validator-fixture',cohort:'cohort',profiles:[identity.profile_id]});
 const calibration=Object.fromEntries(['coordinate','review'].map(role=>[role,{...summarizeProtocolRole(suite,role,suite.trials.filter(t=>t.role===role).map(t=>({trial_id:t.id,raw_answer:JSON.stringify(t.answer_key)}))),current:true,qualification_candidate:true,observed_at:at,expires_at:expires}]));
 const descriptor_digest=routingDigest('descriptor'),priorities={coordinate:1,review:1,implement:null},role_coverage={coordinate:['waypost-protocol-coordinate'],review:['waypost-protocol-review'],implement:[]};
 const provenance={kind:'authenticated-calibration-summary',team:'team',cohort:'cohort',authority_revision:10,suite_digest:suite.suite_digest,criteria_digest:suite.grading_digest,captures_digest:routingDigest('captures'),summary_digest:routingDigest('summary')};
 const scales=Object.fromEntries(['coordinate','review'].map(role=>[role,{benchmark:'waypost-protocol-roles',revision:'1',cohort:'cohort',suite_digest:suite.suite_digest,criteria_digest:suite.grading_digest,confidence:'wilson-95',comparison:'strict-disjoint-interval-partial-order',eligible_profiles:[identity.profile_id]}]));
 const policy={protocol:2,mode:'automatic-calibration',revision:1,generated_at:at,expires_at:expires,provenance,scales,profiles:[{identity,participant:'measured-original',incarnation:'original-inc',model_revision:1,descriptor_digest,priorities,role_coverage,calibration}],activation:true,authority_granted:false,activation_scope:'waypost-protocol',installation:{request_key:'request',cohort:'cohort',previous_policy_revision:0},limitations:'Finite installed protocol calibration only.'};
 const participant={id:'current-peer',incarnation:'current-inc',availability:'ready',revoked:false,model:{model_revision:7,resolved:false},native_binding:{collector_id:'collector',descriptor_digest},native_admission:{protocol:2,identity:structuredClone(identity),observation_id:'observation',participant:'current-peer',incarnation:'current-inc',model_revision:7,descriptor_digest,collector:'collector',source_invocation:'subscription-nonce',observed_at:at,expires_at:expires},context:{id:'legacy-context',fresh:true,read_only:true,evidence:{kind:'owner-attested',source:'owner',observed_at:at}}};
 return {policy:structuredClone(policy),participant};
}
const options={coverage:'waypost-protocol-coordinate',now};
test('active native policy admits only explicit finite coverage with a current bound admission',()=>{
 const {policy,participant}=fixture();assert.deepEqual(validatePolicy(policy),policy);
 assert.equal(rankParticipant(participant,policy,'coordinate',options),1);
 assert.equal(rankParticipant(participant,policy,'review',{coverage:'waypost-protocol-review',now}),1);
 assert.equal(rankParticipant(participant,policy,'coordinate',{now}),null);
 assert.equal(rankParticipant(participant,policy,'coordinate',{...options,coverage:'architecture'}),null);
 assert.equal(rankParticipant(participant,policy,'implement',{coverage:'waypost-protocol-implement',now}),null);
 assert.equal(rankParticipant(participant,policy,'coordinate',{...options,action:'dispatch'}),null);
 assert.equal(selectCoordinator([participant],policy,null,options),participant);
 assert.equal(selectCoordinator([participant],policy,null,{now}),null);
 assert.equal(selectReviewer([participant],policy,1,{now}),null);
});
test('policy row enrollment is historical provenance while current admission binding is mandatory',()=>{
 const {policy,participant}=fixture();assert.notEqual(policy.profiles[0].participant,participant.id);
 assert.equal(rankParticipant(participant,policy,'coordinate',options),1);
 const mutations=[p=>delete p.native_admission,p=>p.native_admission.participant='foreign',p=>p.native_admission.incarnation='old',p=>p.native_admission.model_revision=6,p=>p.native_admission.descriptor_digest=routingDigest('foreign'),p=>p.native_admission.collector='foreign',p=>p.native_admission.identity.profile_id='native-profile-'+routingDigest('foreign'),p=>p.native_admission.identity.profile_revision=2,p=>p.revoked=true,p=>p.availability='left',p=>p.native_binding=null];
 for(const mutate of mutations){const p=structuredClone(participant);mutate(p);assert.equal(rankParticipant(p,policy,'coordinate',options),null);}
});
test('policy, calibration and observation freshness all fail closed independently',()=>{
 for(const path of ['policy','calibration','admission']){
  const {policy,participant}=fixture(),target=path==='policy'?policy:path==='calibration'?policy.profiles[0].calibration.coordinate:participant.native_admission;
  target.expires_at=at;assert.equal(rankParticipant(participant,policy,'coordinate',options),null);
 }
 const {policy,participant}=fixture();assert.equal(rankParticipant(participant,policy,'coordinate',{...options,now:now-1}),null);assert.equal(rankParticipant(participant,policy,'coordinate',{...options,now:Date.parse(expires)}),null);
 participant.native_admission.observed_at=new Date(now+1).toISOString();assert.equal(rankParticipant(participant,policy,'coordinate',options),null);
});
test('proposal copies, broad activation and malformed scales or qualification are rejected',()=>{
 const mutations=[p=>p.mode='automatic-calibration-proposal',p=>p.activation=false,p=>p.authority_granted=true,p=>p.activation_scope='architecture',p=>p.extra=true,p=>p.installation.previous_policy_revision=1,p=>p.scales.coordinate.criteria_digest=routingDigest('foreign'),p=>p.scales.coordinate.eligible_profiles=[],p=>p.profiles[0].priorities.implement=1,p=>p.profiles[0].role_coverage.coordinate=[],p=>p.profiles[0].calibration.coordinate.current=false,p=>p.profiles[0].calibration.coordinate.qualified=false,p=>p.profiles[0].calibration.coordinate.confidence.lower=0.1,p=>p.profiles[0].identity.profile_digest=routingDigest('foreign'),p=>p.profiles.push(structuredClone(p.profiles[0]))];
 for(const mutate of mutations){const {policy}=fixture();mutate(policy);assert.throws(()=>validatePolicy(policy));}
});
test('missing coverage remains unranked and strength fingerprints bind typed identities and scales',()=>{
 const {policy,participant}=fixture(),original=policyStrengthShape(policy);
 policy.profiles[0].priorities.review=null;policy.profiles[0].role_coverage.review=[];policy.scales.review.eligible_profiles=[];
 assert.equal(validatePolicy(policy).profiles[0].priorities.review,null);assert.equal(rankParticipant(participant,policy,'review',{coverage:'waypost-protocol-review',now}),null);assert.notEqual(policyStrengthShape(policy),original);
 const dated=structuredClone(policy);dated.generated_at=new Date(now+1000).toISOString();assert.equal(policyStrengthShape(dated),policyStrengthShape(policy));
 const scoped=structuredClone(policy);scoped.scales.coordinate.cohort='another';assert.notEqual(policyStrengthShape(scoped),policyStrengthShape(policy));
});
test('legacy exact model policy ranking is unchanged and cannot borrow native profile identity',()=>{
 const model={provider:'vendor',model_id:'model',reasoning:'high',model_revision:1,resolved:true,evidence:{kind:'owner-attested',source:'owner',observed_at:at}};
 const policy={protocol:1,revision:1,domain:'coding',approved_by:'owner',approved_at:at,profiles:[{provider:'vendor',model_id:'model',reasoning:'high',priorities:{coordinate:3,review:2,implement:1},source:'manual',date:at}]};
 const p={id:'legacy',model,revoked:false,availability:'ready'};assert.equal(rankParticipant(p,policy,'coordinate',{now}),3);p.model.resolved=false;assert.equal(rankParticipant(p,policy,'coordinate',options),null);
 const fresh=fixture();assert.equal(rankParticipant({...fresh.participant,native_admission:undefined},fresh.policy,'coordinate',options),null);
});

test('protocol critic candidate is strongest, available and a different participant; it grants no context',()=>{
 const {policy,participant}=fixture(),peer=structuredClone(participant);peer.id='other';peer.native_admission.participant='other';
 assert.equal(selectProtocolReviewerCandidate([participant],policy,1,{coordinator:participant.id,now}),null);
 assert.equal(selectProtocolReviewerCandidate([participant,peer],policy,1,{coordinator:participant.id,now}),peer);
 const tied=structuredClone(peer);tied.id='zzz';tied.native_admission.participant='zzz';
 assert.equal(selectProtocolReviewerCandidate([tied,participant,peer],policy,1,{coordinator:participant.id,now}),peer);
 assert.equal(selectProtocolReviewerCandidate([participant,peer],policy,2,{coordinator:participant.id,now}),null);
 peer.availability='busy';assert.equal(selectProtocolReviewerCandidate([participant,peer],policy,1,{coordinator:participant.id,now}),null);
 assert.equal(selectReviewer([participant,peer],policy,1,{now}),null);
});
