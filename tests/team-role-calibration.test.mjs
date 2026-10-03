import test from 'node:test';
import assert from 'node:assert/strict';
import { applySubscriptionAccounting } from '../scripts/team-subscription.mjs';
import { applyProtocolCalibration } from '../scripts/team-role-calibration.mjs';
import { createProtocolRoleSuite,formatProtocolTrial } from '../scripts/team-role-suite.mjs';
import { collectNativeModelProfile,collectNativeMeasurementProfile,serializeNativeModelProfile } from '../scripts/native-model-profile.mjs';
import { routingDigest } from '../scripts/model-routing.mjs';
const at='2026-10-03T12:00:00.000Z',initialNow=Date.parse(at),hash='a'.repeat(64);
const H={owner:(_s,c)=>{if(c.actor!=='owner:fixture')throw Error('owner-required');}};
async function fixture({cap='1000'}={}){
 let now=initialNow;
 const p={id:'peer',incarnation:'incarnation',model:{model_revision:1,resolved:false},availability:'ready',revoked:false,native_binding:{collector_id:'native',descriptor_digest:hash}};
 const t={id:'team',epoch:1,quota_revision:0,participants:{peer:p}},s={teams:{team:t},collectors:{native:{id:'native',team:'team',purposes:['runtime','usage'],revoked:false}}};
 const unit={scope:'team-native-counter',team:'team',counter_schema:'fixture-counter'},unit_digest=routingDigest(unit);
 const billing={provider:null,origin:null,account:null,sku:null,mode:'unknown',paid_fallback:'unknown',provenance:'unavailable',auth_method:null,credit_availability:'unknown',observed_at:at,account_generation:0,consistent:true};
 const actualModel={provider:'route',model_id:'model',reasoning:'unknown',observed_at:at};
 const manifest={id:'b'.repeat(64),native_id:'native-session',harness:'opencode',cwd:'/fixture',version:'1.18.33',version_provenance:'native-health',provenance:'adapter-isolated',read_only:true,fresh:true,fresh_review_verified:true,author_history_inherited:false,author_contexts:[],tools:[],isolation:'read-only',model_provider_is_billing_route:true};
 const options={participant:p,adapter_revision:'native-profile-v1',requested_configuration:{reasoning:'high'},execution_environment:{platform:'fixture'},now:()=>now};
 const baseline=await collectNativeModelProfile({...options,observe:async()=>({native_id:manifest.native_id,invocation_id:'bootstrap',output:'token',observed_at:at,actualModel,context_manifest:manifest,correlation:{participant:p.id,incarnation:p.incarnation,model_revision:1,native_id:manifest.native_id,context_id:manifest.id,nonce:'token',invocation_id:'bootstrap'}})});
 const suite=createProtocolRoleSuite({seed:'seed',cohort:'cohort',profiles:[baseline.profile_id]}),trial=suite.trials.find(c=>c.role==='coordinate'&&c.variant===0);
 const measurement={kind:'objective-role-trial',cohort_id:'cohort',role:trial.role,case_id:trial.id,profile_id:baseline.profile_id,suite_digest:suite.suite_digest,criteria_digest:suite.grading_digest,prompt_digest:routingDigest(formatProtocolTrial(suite,trial.id))};
 const send=(type,data={},actor='owner:fixture')=>applySubscriptionAccounting(s,t,{type,actor,at,...data},now,H);
 send('subscription-accounting-enable-v2',{revision:1,policy:{bootstrap:true,billing_policy:'inherited-native'}});
 send('subscription-allocation-update-v2',{unit_scope:unit,max_tokens:'1000',revision:1});
 send('subscription-context-capture-v2',{participant_id:p.id,context:{id:'ledger-context',native_id:manifest.native_id,descriptor_digest:hash,incarnation:p.incarnation,unit_scope:unit,billing_observation:billing,observed_model:{provider:'route',model_id:'model',reasoning:'unknown'},observed_at:at,expires_at:new Date(now+300000).toISOString(),read_only:true,owned:true}},'collector:native');
 const cohort={id:'cohort',seed:'seed',members:[{participant:p.id,incarnation:p.incarnation,model_revision:1,descriptor_digest:hash,profile_id:baseline.profile_id}],roles:['coordinate','review'],unit_allocations:[{unit_digest,max_tokens:cap,allocation_revision:1}],suite_digest:suite.suite_digest,criteria_digest:suite.grading_digest,expires_at:new Date(now+600000).toISOString()};
 const open=(change={},actor)=>send('native-calibration-cohort-open-v2',{cohort:{...cohort,...change}},actor);
 const reserve=(nonce='nonce-one',change={})=>send('subscription-reserve-v2',{reservation:{id:'subscription-'+nonce,nonce,participant:p.id,incarnation:p.incarnation,context_id:'ledger-context',purpose:'calibration',requested_model:{provider:'route',model_id:'model',reasoning:'unknown'},suite_digest:suite.suite_digest,max_calls:1,timeout_ms:1000,estimate_tokens:'40',epoch:t.epoch,quota_revision:t.quota_revision,mode_revision:t.accounting.revision,allocation_revision:1,measurement,...change}});
 const consume=(nonce='nonce-one',change={})=>send('subscription-consume-v2',{invocation_id:'subscription-'+nonce,nonce,prompt_digest:measurement.prompt_digest,...change},'collector:native');
 const output=JSON.stringify(trial.answer_key);
 const nativeReceipt=(nonce='nonce-one',raw=output)=>({invocation_id:nonce,native_id:manifest.native_id,usage_span:{protocol:1,schema:unit.counter_schema,native_id:manifest.native_id,turn_id:'turn-'+nonce,coverage:'complete',before:'0',after:'30',actual_tokens:'30'},actualModel,context_manifest:manifest,output:raw});
 const terminal=(nonce='nonce-one',change={},sealChange={})=>{
  const native=nativeReceipt(nonce),seal={...measurement,original_output:output,output_digest:routingDigest(output),native_receipt_digest:routingDigest(native),native_receipt:native,outcome:'completed',observed_at:at,...sealChange};
  return send('subscription-usage-v2',{invocation_id:'subscription-'+nonce,nonce,receipt:{nonce,context_id:'ledger-context',native_id:manifest.native_id,incarnation:p.incarnation,unit_scope:unit,counter_schema:unit.counter_schema,turn_id:'turn-'+nonce,billing_before:billing,billing_after:billing,observed_model:{provider:'route',model_id:'model',reasoning:'unknown'},coverage:'complete',before:'0',after:'30',actual_tokens:'30',isolation_verified:true,measurement:seal,...change}},'collector:native');
 };
 const makeCapture=async(nonce='nonce-one')=>{
  const x=s.subscription_invocations['subscription-'+nonce],seal=x.measurement_seal,native=seal.native_receipt;
  const admission={purpose:'calibration',state:'settled',context_quarantined:false,billing_policy:'inherited-native',nonce,invocation_id:x.id,participant:p.id,incarnation:p.incarnation,model_revision:1,native_id:manifest.native_id,actual_tokens:x.charged_tokens,measurement:x.measurement,output_digest:seal.output_digest,native_receipt_digest:seal.native_receipt_digest,observed_at:seal.observed_at};
  const observed=await collectNativeMeasurementProfile({...options,suite,trial_id:trial.id,observe:async()=>({...native,observed_at:at,admission,correlation:{participant:p.id,incarnation:p.incarnation,model_revision:1,native_id:manifest.native_id,context_id:manifest.id,nonce,invocation_id:nonce}})});
  const audit=serializeNativeModelProfile(observed,{now});
  return {measurement:x.measurement,original_output:seal.original_output,output_digest:seal.output_digest,native_receipt_digest:seal.native_receipt_digest,native_id:manifest.native_id,context_id:'ledger-context',turn_id:seal.turn_id,incarnation:p.incarnation,descriptor_digest:hash,observed_at:audit.observed_at,expires_at:cohort.expires_at,profile_digest:audit.profile_digest,profile_snapshot_digest:routingDigest(audit.profile),context_snapshot_digest:routingDigest(native.context_manifest),observation_id:audit.observation_id,native_profile:audit};
 };
 const capture=(value,actor='collector:native')=>send('subscription-measurement-capture-v2',{invocation_id:'subscription-nonce-one',nonce:'nonce-one',capture:value},actor);
 return {s,t,p,suite,trial,measurement,cohort,unit,unit_digest,billing,send,open,reserve,consume,terminal,makeCapture,capture,nativeReceipt,setNow:value=>{now=value;}};
}

test('opened cohort, consumed slot and sealed output permit only locally graded historical capture',async()=>{
 const f=await fixture();const model=structuredClone(f.p.model);f.open();f.reserve();f.consume();assert.equal(Object.keys(f.t.native_calibration_cohorts.cohort.slots).length,1);
 assert.equal(f.terminal().result.actual_tokens,'30');const captured=await f.makeCapture();assert.equal(f.capture(captured).result.pass,true);assert.deepEqual(f.p.model,model);
 assert.equal(f.capture(captured).result.unchanged,true);assert.equal(f.t.leader,undefined);assert.equal(f.t.review_floor,undefined);
 assert.throws(()=>f.reserve('new-nonce'),/trial-slot/);
 assert.equal(applyProtocolCalibration(f.s,f.t,{type:'other'},initialNow,H),null);
});
test('owner fixes installed digests, membership and per-unit budgets without raising allocations',async()=>{
 for(const modify of [c=>{c.members[0].model_revision=2;},c=>{c.members[0].descriptor_digest='c'.repeat(64);},c=>{c.unit_allocations[0].max_tokens='1001';},c=>{c.suite_digest='d'.repeat(64);},c=>{c.answer_keys={};}]){
  const f=await fixture(),c=structuredClone(f.cohort),before=structuredClone(f.s.subscription_allocations);modify(c);assert.throws(()=>f.open(c));assert.deepEqual(f.s.subscription_allocations,before);assert.equal(f.t.native_calibration_cohorts,undefined);
 }
 const f=await fixture();assert.throws(()=>f.open({},'collector:native'),/owner/);f.open();assert.equal(f.open().result.unchanged,true);assert.throws(()=>f.open({seed:'different'}),/installed-suite-binding|immutable/);
});
test('typed reservation and consume require immutable installed prompt and one slot across nonces',async()=>{
 const f=await fixture();f.open();
 for(const change of [{purpose:'identity'},{measurement:{...f.measurement,prompt_digest:'e'.repeat(64)}},{measurement:{...f.measurement,score:1}},{measurement:{...f.measurement,profile_id:'foreign'}}])assert.throws(()=>f.reserve('bad',change));
 f.reserve();assert.throws(()=>f.consume('nonce-one',{prompt_digest:'f'.repeat(64)}),/installed-prompt/);assert.equal(f.s.subscription_invocations['subscription-nonce-one'].state,'prepared');assert.equal(Object.keys(f.t.native_calibration_cohorts.cohort.slots).length,0);
 f.consume();assert.throws(()=>f.consume(),/already-consumed/);assert.throws(()=>f.reserve('retry'),/trial-slot/);
});
test('partial hold and failed measured output never mint captures or permit a retry',async()=>{
 const partial=await fixture();partial.open();partial.reserve();partial.consume();partial.terminal('nonce-one',{coverage:'partial',measurement:undefined});
 assert.equal(partial.s.subscription_invocations['subscription-nonce-one'].state,'uncertain');assert.throws(()=>partial.capture({}),/complete-sealed/);assert.throws(()=>partial.reserve('retry'),/uncertain|trial-slot/);
 const failed=await fixture();failed.open();failed.reserve();failed.consume();failed.terminal('nonce-one',{}, {outcome:'failed'});assert.equal(failed.s.subscription_invocations['subscription-nonce-one'].charged_tokens,'30');assert.throws(()=>failed.capture({}),/sealed-capture/);assert.throws(()=>failed.reserve('retry'),/trial-slot/);
});
test('different trial slots cannot reuse a consumed native context including prepared races',async()=>{
 const f=await fixture();f.open();f.reserve();
 const trial=f.suite.trials.find(x=>x.id!==f.trial.id&&x.role===f.trial.role);
 const measurement={...f.measurement,case_id:trial.id,prompt_digest:routingDigest(formatProtocolTrial(f.suite,trial.id))};
 f.reserve('second',{measurement});f.consume();
 assert.throws(()=>f.consume('second',{prompt_digest:measurement.prompt_digest}),/single-call-fresh-native-context/);
 assert.equal(f.s.subscription_invocations['subscription-second'].state,'prepared');
 f.send('subscription-abort-v2',{invocation_id:'subscription-second',nonce:'second'});
 f.terminal();assert.throws(()=>f.reserve('third',{measurement}),/single-call-fresh-native-context/);
 const changedHash='c'.repeat(64);f.p.native_binding.descriptor_digest=changedHash;f.t.subscription_contexts['ledger-context'].descriptor_digest=changedHash;
 f.t.native_calibration_cohorts.cohort.members[0].descriptor_digest=changedHash;
 assert.throws(()=>f.reserve('rebound',{measurement}),/single-call-fresh-native-context/);
});
test('invalid optional seals preserve exact-bound known usage without captures or retries',async()=>{
 for(const change of [{original_output:'changed'},{native_receipt_digest:'c'.repeat(64)},{observed_at:new Date(initialNow-30001).toISOString()}]){
  const f=await fixture();f.open();f.reserve();f.consume();const result=f.terminal('nonce-one',{},change);
  const x=f.s.subscription_invocations['subscription-nonce-one'];assert.equal(x.state,'settled');assert.equal(x.charged_tokens,'30');assert.equal(x.measurement_seal,undefined);assert.ok(result.result.measurement_blocker);
  assert.throws(()=>f.capture({}),/complete-sealed/);assert.throws(()=>f.reserve('retry'),/trial-slot/);
 }
 const f=await fixture();f.open();f.reserve();f.consume();const native=f.nativeReceipt();native.invocation_id='foreign';
 const result=f.terminal('nonce-one',{}, {native_receipt:native,native_receipt_digest:routingDigest(native)});
 assert.match(result.result.measurement_blocker,/projection-binding/);assert.equal(f.s.subscription_invocations['subscription-nonce-one'].charged_tokens,'30');
});
test('capture requires original sealed answer and exact actor, incarnation and profile snapshot',async()=>{
 const f=await fixture();f.open();f.reserve();f.consume();f.terminal();const value=await f.makeCapture();
 assert.throws(()=>f.capture(value,'owner:fixture'),/collector/);
 for(const change of [{original_output:'changed'},{score:1},{native_id:'foreign'},{context_id:'foreign'},{profile_digest:'d'.repeat(64)},{observation_id:'different'},{observed_at:new Date(initialNow+1).toISOString()}])assert.throws(()=>f.capture({...value,...change}));
 f.p.model.model_revision=2;assert.throws(()=>f.capture(value),/member-binding/);f.p.model.model_revision=1;
 assert.equal(f.capture(value).result.pass,true);
});
test('retirement permits recovery of sealed original evidence without renewing clocks or execution',async()=>{
 const f=await fixture();f.open();f.reserve();f.consume();f.terminal();const value=await f.makeCapture();
 f.send('subscription-context-retire-v2',{participant_id:f.p.id,participant_incarnation:f.p.incarnation,native_id:'native-session',descriptor_digest:hash},'collector:native');f.setNow(initialNow+1000000);
 assert.equal(f.capture(value).result.pass,true);assert.equal(f.capture(value).result.unchanged,true);
 const stored=Object.values(f.t.native_calibration_cohorts.cohort.captures)[0];assert.equal(stored.observed_at,at);assert.equal(stored.expires_at,f.cohort.expires_at);assert.throws(()=>f.reserve('retry'),/retired|current|expired/);
});
test('known usage survives quarantine but cannot become calibrated evidence',async()=>{
 const f=await fixture();f.open();f.reserve();f.consume();const result=f.terminal('nonce-one',{isolation_verified:false});assert.equal(result.result.actual_tokens,'30');assert.equal(result.result.context_quarantined,true);assert.throws(()=>f.capture({}),/nonquarantined/);
});
test('whole cohort budget is independent of larger native allocation and schemas are not summed',async()=>{
 const f=await fixture({cap:'39'});f.open();assert.throws(()=>f.reserve(),/cohort-token-allocation/);assert.equal(f.s.subscription_allocations[f.unit_digest].max_tokens,'1000');
 const bad=await fixture();const other={scope:'team-native-counter',team:'team',counter_schema:'other-counter'};bad.send('subscription-allocation-update-v2',{unit_scope:other,max_tokens:'1000',revision:1});
 bad.open({unit_allocations:[{unit_digest:routingDigest(other),max_tokens:'1000',allocation_revision:1}]});
 assert.throws(()=>bad.reserve(),/cohort-unit-allocation-required/); // Another schema cannot pay this native counter's reservation.
});
