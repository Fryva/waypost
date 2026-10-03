import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCalibrationPolicyV2 } from '../scripts/model-strength.mjs';
import { collectAuthenticatedCalibrationSummary } from '../scripts/team-role-calibration.mjs';
import { routingDigest } from '../scripts/model-routing.mjs';
import { rankParticipant,validatePolicy } from '../scripts/team.mjs';
const now=Date.parse('2026-10-03T12:00:00Z'),at=new Date(now).toISOString();
const expiry=new Date(now+600000).toISOString();
import { authorityFixture } from './helpers/native-calibration.mjs';
let fixturePromise;
async function fixture(){fixturePromise??=authorityFixture();const f=await fixturePromise;return {...f,state:structuredClone(f.state)};}
async function trusted(f,clock=now){return collectAuthenticatedCalibrationSummary({teamId:'team',cohortId:'cohort',readAuthority:async()=>({state:f.state,revision:f.revision}),now:()=>clock});}

// These fixtures execute the installed reducers and pure profile factories. No
// provider, native process or caller-supplied score participates in calibration.
test('compiler accepts only authenticated summaries and emits an immutable diagnostic proposal',async()=>{
 const f=await fixture(),summary=await trusted(f),policy=compileCalibrationPolicyV2(summary,{now:()=>now,revision:3});
 assert.equal(policy.protocol,2);assert.equal(policy.mode,'automatic-calibration-proposal');assert.equal(policy.revision,3);assert.equal(policy.activation,false);assert.equal(policy.authority_granted,false);
 assert.equal(policy.provenance.summary_digest,routingDigest(summary));assert.equal(policy.provenance.authority_revision,f.revision);assert.equal(policy.provenance.captures_digest,summary.captures_digest);
 assert.throws(()=>{policy.profiles[0].priorities.coordinate=100;},TypeError);
 for(const forged of [{...summary},structuredClone(summary),JSON.parse(JSON.stringify(summary)),{protocol:2,profiles:[]}])assert.throws(()=>compileCalibrationPolicyV2(forged,{now}),/authenticated-summary-provenance/);
 assert.throws(()=>compileCalibrationPolicyV2(summary,{now,revision:0}),/revision/);
 assert.throws(()=>compileCalibrationPolicyV2(summary,{now:()=>NaN}),/clock/);
});
test('coordinate and review require their own qualified coverage; implement always remains null',async()=>{
 const f=await fixture(),summary=await trusted(f),policy=compileCalibrationPolicyV2(summary,{now});
 const byParticipant=Object.fromEntries(policy.profiles.map(p=>[p.participant,p]));
 assert.ok(byParticipant['peer-a'].priorities.coordinate>0);assert.equal(byParticipant['peer-a'].priorities.review,null);
 assert.ok(byParticipant['peer-b'].priorities.coordinate>0);assert.ok(byParticipant['peer-b'].priorities.review>0);
 assert.equal(byParticipant['peer-c'].priorities.coordinate,null);assert.ok(byParticipant['peer-c'].priorities.review>0);
 assert.equal(byParticipant['peer-d'].priorities.coordinate,null);assert.equal(byParticipant['peer-d'].calibration.coordinate.passes,22);assert.equal(byParticipant['peer-d'].calibration.coordinate.qualified,false);
 for(const p of policy.profiles){assert.equal(p.priorities.implement,null);assert.deepEqual(p.role_coverage.implement,[]);assert.equal(p.identity.kind,'native-configuration');assert.equal(Object.hasOwn(p,'provider'),false);assert.equal(Object.hasOwn(p,'model_id'),false);}
 assert.deepEqual(byParticipant['peer-a'].role_coverage.review,[]);assert.deepEqual(byParticipant['peer-d'].role_coverage.coordinate,[]);
 assert.equal(policy.scales.coordinate.cohort,summary.cohort);assert.equal(policy.scales.review.criteria_digest,summary.criteria_digest);
});
test('overlapping Wilson intervals stay on the strongest frontier without ordering by raw success',async()=>{
 const f=await fixture(),policy=compileCalibrationPolicyV2(await trusted(f),{now});
 const a=policy.profiles.find(p=>p.participant==='peer-a'),b=policy.profiles.find(p=>p.participant==='peer-b'),c=policy.profiles.find(p=>p.participant==='peer-c');
 assert.equal(a.calibration.coordinate.passes,24);assert.equal(b.calibration.coordinate.passes,22);assert.ok(a.calibration.coordinate.confidence.lower<b.calibration.coordinate.confidence.upper);assert.equal(a.priorities.coordinate,b.priorities.coordinate);
 assert.equal(b.calibration.review.passes,24);assert.equal(c.calibration.review.passes,22);assert.equal(b.priorities.review,c.priorities.review);
 assert.match(policy.limitations,/uncertainty frontier/);assert.equal(policy.scales.coordinate.comparison,'strict-disjoint-interval-partial-order');
});
test('recompilation and authority rereading preserve original measurement clocks and expiry',async()=>{
 const f=await fixture(),summary=await trusted(f),first=compileCalibrationPolicyV2(summary,{now}),later=compileCalibrationPolicyV2(summary,{now:()=>now+5000});
 assert.deepEqual(later,first);assert.equal(first.expires_at,expiry);
 const reread=compileCalibrationPolicyV2(await trusted(f,now+10000),{now:now+10000});assert.equal(reread.expires_at,first.expires_at);
 for(const p of reread.profiles)for(const role of ['coordinate','review']){assert.equal(p.calibration[role].observed_at,at);assert.equal(p.calibration[role].expires_at,expiry);}
 assert.throws(()=>compileCalibrationPolicyV2(summary,{now:Date.parse(expiry)}),/current-summary-required/);
});
test('changed enrollment removes proposal coverage while stored captures keep their original diagnostics',async()=>{
 const f=await fixture();f.state.teams.team.participants['peer-b'].model.model_revision=2;
 const policy=compileCalibrationPolicyV2(await trusted(f),{now}),b=policy.profiles.find(p=>p.participant==='peer-b');
 assert.equal(b.priorities.coordinate,null);assert.equal(b.priorities.review,null);assert.equal(b.calibration.review.passes,24);assert.equal(b.calibration.review.current,false);assert.deepEqual(b.role_coverage.review,[]);
});
test('capture score or answer tampering cannot enter the trusted summary; legacy ranks cannot borrow the proposal',async()=>{
 const f=await fixture(),capture=Object.values(f.state.teams.team.native_calibration_cohorts.cohort.captures)[0];capture.grade.pass=!capture.grade.pass;
 await assert.rejects(trusted(f),/authenticated-capture-snapshot/);
 const valid=await fixture(),proposal=compileCalibrationPolicyV2(await trusted(valid),{now});
 assert.throws(()=>validatePolicy(proposal));
 assert.equal(rankParticipant(valid.state.teams.team.participants['peer-a'],proposal,'coordinate',{now}),null);
 const forged=JSON.parse(JSON.stringify(await trusted(valid)));forged.profiles[0].roles[0].confidence={lower:1,score:1,upper:1,method:'wilson-95'};assert.throws(()=>compileCalibrationPolicyV2(forged,{now}),/provenance/);
});
test('unchanged grades cannot hide tampered original output, native counters, snapshots or clocks',async()=>{
 const mutations=[
  capture=>{capture.original_output+=' ';},
  (_capture,invocation)=>{invocation.measurement_seal.native_receipt.usage_span.actual_tokens='31';},
  capture=>{capture.native_profile.profile.execution_scope.cwd='/foreign';},
  capture=>{capture.observed_at=new Date(now+1000).toISOString();}
 ];
 for(const mutate of mutations){
  const f=await fixture(),capture=Object.values(f.state.teams.team.native_calibration_cohorts.cohort.captures)[0],invocation=f.state.subscription_invocations[capture.invocation_id];
  const originalGrade=structuredClone(capture.grade);
  mutate(capture,invocation);
  assert.deepEqual(capture.grade,originalGrade);
  await assert.rejects(trusted(f),/authenticated-capture-snapshot|native-receipt|original-native-seal|actual-profile-snapshot|sealed-capture-binding|immutable-observation/);
 }
 // Every mutation operates on a separate authority clone. Genuine originals
 // remain usable; rejection never rewrites an answer or manufactures a score.
 assert.equal(compileCalibrationPolicyV2(await trusted(await fixture()),{now}).activation,false);
});
