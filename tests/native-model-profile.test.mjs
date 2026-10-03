import test from 'node:test';
import assert from 'node:assert/strict';
import { collectNativeModelProfile,verifyNativeModelProfile,serializeNativeModelProfile } from '../scripts/native-model-profile.mjs';
import { rankParticipant } from '../scripts/team.mjs';

const now=Date.parse('2026-10-03T12:00:00Z');
const participant={id:'peer',incarnation:'peer-inc',model:{model_revision:1,provider:'route',model_id:'native-model',reasoning:'unknown',resolved:false}};
function receipt() {
  const observed_at=new Date(now-1000).toISOString();
  return {native_id:'owned-native',invocation_id:'transport-invocation',output:'WAYPOST_PROBE_nonce',observed_at,
    correlation:{participant:'peer',incarnation:'peer-inc',model_revision:1,nonce:'WAYPOST_PROBE_nonce',invocation_id:'transport-invocation',native_id:'owned-native',context_id:'owned-context'},
    actualModel:{provider:'route',model_id:'native-model',reasoning:'high',observed_at},
    context_manifest:{id:'owned-context',native_id:'owned-native',harness:'opencode',cwd:'/fixture',version:'1.18.33',version_provenance:'native-health',provenance:'adapter-isolated',read_only:true,fresh:true,fresh_review_verified:true,author_history_inherited:false,author_contexts:[],tools:[],isolation:'read-only',model_provider_is_billing_route:true,rules_digest:'a'.repeat(64),initial_instructions_digest:'b'.repeat(64),read_only_evidence:'native-deny-config'}};
}
async function collect({mutate,requested_configuration={reasoning:'high',model:'native-model'},execution_environment={platform:'fixture',routing_config_digest:'c'.repeat(64)},adapter_revision='native-profile-v1',participant:peer=participant,clock=now}={}) {
  return collectNativeModelProfile({participant:peer,adapter_revision,requested_configuration,execution_environment,now:()=>clock,observe:async binding=>{
    assert.deepEqual(binding,{participant:peer.id,incarnation:peer.incarnation,model_revision:peer.model.model_revision});
    const result=receipt();mutate?.(result);return result;
  }});
}

test('trusted already budgeted observation retains unknown effort and does not rank or promote',async()=>{
  const before=structuredClone(participant),observation=await collect();
  assert.equal(observation.protocol,2);assert.equal(observation.profile.observed.effective_reasoning,'unknown');
  assert.equal(observation.profile.observed.native_variant,'high');assert.equal(observation.profile.observed.backend_author,'unknown');
  assert.equal(observation.rank_eligible,false);assert.deepEqual(observation.roles,[]);
  assert.equal(Date.parse(observation.expires_at)-Date.parse(observation.observed_at),900000);
  assert.equal(Date.parse(observation.observed_at),now-1000);assert.equal(verifyNativeModelProfile(observation,{participant,now}),true);
  assert.deepEqual(participant,before);
  assert.equal(rankParticipant(participant,{protocol:1,mode:'manual',revision:1,domain:'coding',approved_by:'owner',approved_at:new Date(now).toISOString(),profiles:[{provider:'route',model_id:'native-model',reasoning:'high',priorities:{coordinate:10,implement:10,review:10},source:'fixture',date:'2026-10-03'}]},'coordinate',{now}),null);
  assert.equal(Object.hasOwn(observation,'output'),false);
});

test('JSON, shallow/deep copies and serialized audit snapshots cannot mint trust',async()=>{
  const observation=await collect(),audit=serializeNativeModelProfile(observation,{now});
  for(const forged of [{...observation},structuredClone(observation),JSON.parse(JSON.stringify(observation)),audit,{}]){
    assert.throws(()=>verifyNativeModelProfile(forged,{now}),/collector-provenance-required/);
    assert.throws(()=>serializeNativeModelProfile(forged,{now}),/collector-provenance-required/);
  }
  audit.profile.native_model_id='changed';assert.equal(observation.profile.native_model_id,'native-model');
  assert.throws(()=>{observation.profile.native_model_id='changed';},TypeError);
});

test('receipt correlation binds every identity, native context, invocation and nonce',async()=>{
  for(const key of ['participant','incarnation','model_revision','native_id','context_id','invocation_id','nonce']){
    await assert.rejects(collect({mutate:r=>{r.correlation[key]=key==='model_revision'?2:'wrong';}}),/binding-mismatch|nonce-receipt-mismatch/);
    await assert.rejects(collect({mutate:r=>{delete r.correlation[key];}}),/binding-mismatch/);
  }
  const observation=await collect();
  for(const options of [{participant:{...participant,incarnation:'new'}},{participant:{...participant,model:{model_revision:2}}},{native_id:'foreign'},{context_id:'foreign'},{nonce:'foreign'},{invocation_id:'foreign'}])assert.throws(()=>verifyNativeModelProfile(observation,{...options,now}),/binding-mismatch/);
});

test('stale, future, conflicting clocks and expired evidence fail without renewing receipt time',async()=>{
  for(const timestamp of [now-30001,now+1])await assert.rejects(collect({mutate:r=>{r.observed_at=r.actualModel.observed_at=new Date(timestamp).toISOString();}}),/stale-or-clock-mismatch/);
  await assert.rejects(collect({mutate:r=>{r.actualModel.observed_at=new Date(now).toISOString();}}),/stale-or-clock-mismatch/);
  const observation=await collect();
  assert.throws(()=>verifyNativeModelProfile(observation,{now:now-1001}),/observation-expired/);
  assert.throws(()=>serializeNativeModelProfile(observation,{now:now-1000+900000}),/observation-expired/);
  const again=serializeNativeModelProfile(observation,{now:now+5000});assert.equal(again.observed_at,observation.observed_at);assert.equal(again.expires_at,observation.expires_at);
});

test('canonical profile changes with configuration, model, route, native version, adapter and scope',async()=>{
  const baseline=await collect();
  const variants=[
    {requested_configuration:{reasoning:'low',model:'native-model'}},
    {execution_environment:{platform:'other',routing_config_digest:'c'.repeat(64)}},
    {adapter_revision:'native-profile-v2'},
    {mutate:r=>{r.actualModel.model_id='changed';}},
    {mutate:r=>{r.actualModel.provider='other-route';}},
    {mutate:r=>{r.context_manifest.version='1.18.34';}},
    {mutate:r=>{r.context_manifest.cwd='/other';}},
    {mutate:r=>{r.context_manifest.rules_digest='d'.repeat(64);}},
    {mutate:r=>{r.context_manifest.initial_instructions_digest='e'.repeat(64);}}
  ];
  for(const variant of variants)assert.notEqual((await collect(variant)).profile_digest,baseline.profile_digest);
  const reordered=await collect({requested_configuration:{model:'native-model',reasoning:'high'},execution_environment:{routing_config_digest:'c'.repeat(64),platform:'fixture'},mutate:r=>{r.actualModel={observed_at:r.actualModel.observed_at,reasoning:'high',model_id:'native-model',provider:'route'};}});
  assert.equal(reordered.profile_digest,baseline.profile_digest);assert.equal(reordered.observation_id,baseline.observation_id);
});

test('same observable profile across contexts is not proof of the same hidden backend',async()=>{
  const baseline=await collect();
  const other=await collect({mutate:r=>{r.native_id=r.context_manifest.native_id=r.correlation.native_id='another-native';r.context_manifest.id=r.correlation.context_id='another-context';}});
  assert.equal(other.profile_digest,baseline.profile_digest);assert.notEqual(other.observation_id,baseline.observation_id);
  const otherParticipant={...participant,id:'another-peer',incarnation:'another-inc'};
  const otherBinding=await collect({participant:otherParticipant,mutate:r=>{r.correlation.participant='another-peer';r.correlation.incarnation='another-inc';}});
  assert.equal(otherBinding.profile_digest,baseline.profile_digest);assert.notEqual(otherBinding.observation_id,baseline.observation_id);
});

test('descriptor versions and requested effort do not become native observations',async()=>{
  const unknown=await collect({mutate:r=>{delete r.context_manifest.version_provenance;r.context_manifest.version='caller-version';r.actualModel.reasoning=null;}});
  assert.equal(unknown.profile.version,'unknown');assert.equal(unknown.profile.version_provenance,'unknown');assert.equal(unknown.profile.observed.effective_reasoning,'unknown');
  const effective=await collect({mutate:r=>{r.context_manifest.model_provider_is_billing_route=false;r.actualModel.reasoning='low';}});
  assert.equal(effective.profile.observed.effective_reasoning,'low');assert.equal(effective.profile.observed.native_variant,'unknown');
});

test('unisolated contexts, unknown routing/model IDs and invalid structures cannot mint observations',async()=>{
  for(const mutate of [r=>{r.context_manifest.tools=['bash'];},r=>{r.context_manifest.author_contexts=['author'];},r=>{r.context_manifest.author_history_inherited=true;},r=>{r.context_manifest.read_only=false;},r=>{r.context_manifest.fresh_review_verified=false;},r=>{r.context_manifest.native_id='foreign';},r=>{r.actualModel.provider='unknown';},r=>{r.actualModel.model_id='unknown';},r=>{r.output='wrong nonce';}])await assert.rejects(collect({mutate}),/native-profile-/);
  await assert.rejects(collect({requested_configuration:{model:()=>{}}}),/invalid-structure/);
  await assert.rejects(collectNativeModelProfile({participant,observe:{},adapter_revision:'x',requested_configuration:{},execution_environment:{},now}),/trusted-observer-required/);
});
