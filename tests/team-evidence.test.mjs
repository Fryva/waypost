import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { collectRuntimeEvidence, collectRuntimeObservation, collectTaskQualification, collectBillingEvidence, assembleRoutingEvidence, collectTaskClassCalibration, createRoutingGrant, serializeRoutingGrant, createControlGrant, serializeControlGrant, mergeVerifiedEvidence, TASK_CLASS_SUITE, TASK_CLASS_CRITERIA_DIGEST } from '../scripts/team-evidence.mjs';
import { routingDigest, proposeModelRoute } from '../scripts/model-routing.mjs';

const now = Date.parse('2026-10-01T12:00:00Z');
const observed_at = new Date(now - 1000).toISOString();
const model = id => ({ provider: 'fixture', model_id: id, reasoning: 'none', model_revision: 1, resolved: true, evidence: { kind: 'adapter-observed', source: 'fixture-native', observed_at } });
const worker = { id: 'worker', incarnation: 'worker-inc', model: model('fixture-small'), availability: 'ready', revoked: false };
const reviewer = { id: 'critic', incarnation: 'critic-inc', model: model('fixture-large'), availability: 'ready', revoked: false };
const participants = [worker, reviewer];
const policy = { protocol: 1, mode: 'manual', revision: 1, domain: 'coding', approved_by: 'fixture-owner', approved_at: observed_at, profiles: participants.map((p, i) => ({ provider: p.model.provider, model_id: p.model.model_id, reasoning: p.model.reasoning, priorities: { implement: i + 1, coordinate: i + 1, review: i + 1 }, source: 'fixture', date: '2026-10-01' })) };
const manifest = { protocol: 1, goal: 'Bounded fixture edit', base: 'fixture-base', domain: 'coding', task_class: TASK_CLASS_SUITE.task_class, criteria_digest: 'a'.repeat(64), paths: ['fixture.mjs'], tools: [], isolation: 'read-only', input_tokens: 1000, output_tokens: 1000, attempts: 2, budget: { currency: 'fixture-micro', max_units: '1000', reserved_control_units: '100' }, capability: { benchmark: TASK_CLASS_SUITE.benchmark, revision: TASK_CLASS_SUITE.revision, criteria_digest: TASK_CLASS_CRITERIA_DIGEST, min_passes: 8 }, safety: { bounded: true, reversible: true, architecture: false, security: false, migration: false, publication: false, data_loss: false } };
function native(p, edits = {}) {
 let calls = 0;
 const instance = { calls: () => calls, async send(prompt, invocation) {
  assert.equal(typeof prompt, 'string'); assert.ok(invocation.id); assert.equal(invocation.read_only, true);
  const request = { prompt, ...invocation };
  calls++;
  let answer;
  if (request.purpose === 'identity-inspection') answer = request.prompt.slice('Return exactly this token: '.length);
  else if (request.purpose.startsWith('task-class-trial:')) {
   const item = TASK_CLASS_SUITE.cases.find(c => request.purpose.endsWith(c.id));
   answer = JSON.stringify({ code: item.expected });
  } else answer = JSON.stringify({ accepted: true, target_digest: /"target_digest":"([a-f0-9]+)"/.exec(request.prompt)[1] });
  return { text: answer, native_id: p.id + '-native', actualModel: { provider: p.model.provider, model_id: p.model.model_id, reasoning: p.model.reasoning }, usage: { input_tokens: 100, output_tokens: 20 }, context_manifest: { id: p.id + '-context', native_id: p.id + '-native', fresh: true, read_only: true, tools: [], isolation: 'read-only', author_contexts: [], provenance: 'adapter-isolated' }, ...edits };
 } };
 return instance;
}
async function qualify(p = worker) {
 const executor = native(p), critic = native(reviewer);
 const runtime = await collectRuntimeEvidence({ participant: p, native: executor, now });
 const qualification = await collectTaskQualification({ runtime, native: executor, reviewNative: critic, reviewer, participants, policy, now });
 return { runtime, qualification, executor, critic };
}
function billingAdapter() {
 const stamp = ttl => ({ source: 'fixture-provider-collector', observed_at: new Date(now).toISOString(), expires_at: new Date(now + ttl).toISOString() });
 return {
  async inspectRoute({ model }) { return { endpoint: 'https://fixture.example/execute', account: 'opaque-fixture-account', sku: 'fixture-sku', mode: 'free', pool: 'fixture-allocated-pool', model }; },
  async collectPrice({ route_digest }) { return { ...stamp(86400000), route_digest, currency: manifest.budget.currency, input_units_per_million: '0', output_units_per_million: '0', tool_max_units: '0' }; },
  async collectQuota({ route }) { return { ...stamp(60000), pool: route.pool, currency: manifest.budget.currency, pool_allocation: '1000', available_calls: 2, scope: 'project-authority', exclusive_allocation: true, allocation_id: 'provider-allocation' }; },
  async quoteLiability({ route_digest, manifest: m }) { return { ...stamp(60000), route_digest, manifest_digest: routingDigest(m), currency: m.budget.currency, all_charges_bounded: true, inflight_charges_bounded: true, enforced_by_provider: true, quote_id: 'fixture-quote', max_units_per_attempt: '0' }; },
 };
}

test('trusted collectors capture fixed trials and strongest independent review before routing', async () => {
 const { runtime, qualification, executor, critic } = await qualify();
 assert.equal(executor.calls(), 9); assert.equal(critic.calls(), 1);
 assert.equal(qualification.total_trials, 8); assert.equal(qualification.passes, 8);
 assert.equal(qualification.review.model.model_id, reviewer.model.model_id);
 assert.equal(qualification.review.floor, 2);
 assert.ok(qualification.captures.every(c => c.output_digest === createHash('sha256').update(c.output).digest('hex')));
 assert.ok(qualification.confidence.lower < qualification.confidence.score);
 const billing = await collectBillingEvidence({ runtime, billing: billingAdapter(), manifest, now });
 const assembled = assembleRoutingEvidence({ runtime, qualification, billing, now });
 const route = proposeModelRoute({ manifest, participants, policy, verifiedEvidence: assembled.verifiedEvidence, now });
 assert.equal(route.choice.participant, worker.id); assert.equal(route.choice.total, '100');
 assert.equal(route.proposal_only, true);
 assert.throws(() => { qualification.captures[0].output = 'edited'; }, TypeError);
});
test('handwritten or copied qualification and billing records cannot enter trusted map', async () => {
 const { runtime, qualification } = await qualify();
 const billing = await collectBillingEvidence({ runtime, billing: billingAdapter(), manifest, now });
 assert.throws(() => assembleRoutingEvidence({ runtime, qualification: structuredClone(qualification), billing, now }), /collector-provenance/);
 assert.throws(() => assembleRoutingEvidence({ runtime: structuredClone(runtime), qualification, billing, now }), /collector-provenance/);
 assert.throws(() => assembleRoutingEvidence({ runtime, qualification, billing: structuredClone(billing), now }), /collector-provenance/);
 const other = await collectRuntimeEvidence({ participant: { ...worker, incarnation: 'new-inc' }, native: native(worker), now });
 assert.throws(() => assembleRoutingEvidence({ runtime: other, qualification, billing, now }), /binding-mismatch/);
});
test('actual model, reasoning and native context changes invalidate identity or qualification', async () => {
 for (const changes of [ { actualModel: { provider: 'fixture', model_id: 'fallback', reasoning: 'none' } }, { actualModel: { provider: 'fixture', model_id: 'fixture-small', reasoning: 'unknown' } }, { context_manifest: { id: 'arbitrary', fresh: true, read_only: true, tools: [], isolation: 'read-only', native_id: 'worker-native', author_contexts: [], provenance: 'model-supplied' } } ]) {
  await assert.rejects(collectRuntimeEvidence({ participant: worker, native: native(worker, changes), now }), /runtime-model|native-context/);
 }
 const n = native(worker), runtime = await collectRuntimeEvidence({ participant: worker, native: n, now });
 await assert.rejects(collectTaskQualification({ runtime, native: native(worker, { native_id: 'wrong-native' }), reviewNative: native(reviewer), reviewer, participants, policy, now }), /native-context/);
});
test('weak, unavailable, self or reused critic contexts cannot qualify a worker', async () => {
 const n = native(worker), runtime = await collectRuntimeEvidence({ participant: worker, native: n, now });
 for (const r of [worker, { ...reviewer, availability: 'busy' }, { ...reviewer, model: worker.model }, { ...reviewer, incarnation: worker.incarnation }]) {
  await assert.rejects(collectTaskQualification({ runtime, native: n, reviewNative: native(r), reviewer: r, participants, policy, now }), /independent-strongest/);
 }
 await assert.rejects(collectTaskQualification({ runtime, native: n, reviewNative: native(reviewer, { context_manifest: { id: runtime.context.id, native_id: 'critic-native', fresh: true, read_only: true, tools: [], isolation: 'read-only', author_contexts: [], provenance: 'adapter-isolated' } }), reviewer, participants, policy, now }), /review-context/);
});
test('captured incorrect answers remain unchanged and cannot pass required floor', async () => {
 const n = native(worker), runtime = await collectRuntimeEvidence({ participant: worker, native: n, now });
 const qualification = await collectTaskQualification({ runtime, native: native(worker, { text: '{"code":"wrong"}' }), reviewNative: native(reviewer), reviewer, participants, policy, now });
 assert.equal(qualification.passes, 0); assert.equal(qualification.captures[0].output, '{"code":"wrong"}');
 const billing = await collectBillingEvidence({ runtime, billing: billingAdapter(), manifest, now });
 const assembled = assembleRoutingEvidence({ runtime, qualification, billing, now });
 assert.equal(proposeModelRoute({ manifest, participants, policy, verifiedEvidence: assembled.verifiedEvidence, now }).choice, null);
});
test('independent rejection or modified review target never creates qualification', async () => {
 const n = native(worker), runtime = await collectRuntimeEvidence({ participant: worker, native: n, now });
 for (const output of ['{"accepted":false,"target_digest":"a"}', '{"accepted":true,"target_digest":"' + 'a'.repeat(64) + '"}', 'not json']) {
  await assert.rejects(collectTaskQualification({ runtime, native: n, reviewNative: native(reviewer, { text: output }), reviewer, participants, policy, now }), /review/);
 }
});
test('unsupported subscriptions and unproven inflight liability remain advisory', async () => {
 const { runtime, qualification } = await qualify();
 const unsupported = await collectBillingEvidence({ runtime, manifest, now });
 assert.equal(unsupported.strict, false); assert.equal(assembleRoutingEvidence({ runtime, qualification, billing: unsupported, now }).verifiedEvidence.size, 0);
 for (const field of ['inflight_charges_bounded', 'enforced_by_provider']) {
  const adapter = billingAdapter(), original = adapter.quoteLiability;
  adapter.quoteLiability = async request => ({ ...await original(request), [field]: false });
  const proof = await collectBillingEvidence({ runtime, billing: adapter, manifest, now });
  assert.equal(proof.strict, false); assert.ok(proof.blockers.includes('maximum-liability-unproven'));
 }
});
test('billing route, currency, quota allocation and independent expiry bind strict evidence', async () => {
 const { runtime, qualification } = await qualify();
 const valid = await collectBillingEvidence({ runtime, billing: billingAdapter(), manifest, now });
 assert.throws(() => assembleRoutingEvidence({ runtime, qualification, billing: valid, now: now + 60000 }), /assembly-stale/);
 for (const [method, field, value] of [['collectPrice','currency','other'],['collectQuota','exclusive_allocation',false],['collectQuota','available_calls',1],['quoteLiability','manifest_digest','wrong'],['collectPrice','expires_at',new Date(now).toISOString()]]) {
  const adapter = billingAdapter(), original = adapter[method]; adapter[method] = async request => ({ ...await original(request), [field]: value });
  assert.equal((await collectBillingEvidence({ runtime, billing: adapter, manifest, now })).strict, false);
 }
 const adapter = billingAdapter(), original = adapter.inspectRoute; adapter.inspectRoute = async r => ({ ...await original(r), endpoint: 'https://secret:credential@fixture.example' });
 await assert.rejects(collectBillingEvidence({ runtime, billing: adapter, manifest, now }), /billing-route/);
});
test('qualification expires without being renewed by reading or assembly', async () => {
 const { runtime, qualification } = await qualify();
 const original = qualification.expires_at;
 await assert.rejects(collectTaskQualification({ runtime, native: native(worker), reviewNative: native(reviewer), reviewer, participants, policy, now: now + 900000 }), /runtime-stale/);
 assert.equal(qualification.expires_at, original);
});
test('unknown identities gain only comparable task-class evidence, not coordinator ranks', async () => {
 const a = await qualify();
 const unknown = { ...worker, id: 'unknown', incarnation: 'unknown-inc', model: model('unlisted-free-model') };
 const b = await qualify(unknown);
 const calibration = collectTaskClassCalibration({ qualifications: [a.qualification, b.qualification], runtimes: [a.runtime,b.runtime], cohort: 'fixture-cohort', now });
 assert.equal(calibration.strength_scope, 'task-class-only'); assert.equal(calibration.rows.length, 2);
 assert.ok(calibration.protected_role_blocker); assert.equal(calibration.rows[0].samples, 8);
 assert.throws(() => collectTaskClassCalibration({ qualifications: [a.qualification,a.qualification], runtimes: [a.runtime,a.runtime], cohort: 'fixture-cohort', now }), /duplicate-model/);
});
test('native manifests never promote unknown freshness, tools or sandbox into critic proof', async () => {
 const base = { id: 'worker-context', native_id: 'worker-native', fresh: true, read_only: true, tools: [], isolation: 'read-only', author_contexts: [], provenance: 'adapter-isolated' };
 for (const changes of [{fresh:false},{read_only:false},{tools:null},{isolation:'managed-context'},{fresh_review_verified:false},{author_history_inherited:true},{author_contexts:['author']},{provenance:'descriptor-attested'}]) {
  await assert.rejects(collectRuntimeEvidence({ participant: worker, native: native(worker, {context_manifest:{...base,...changes}}), now }), /isolated-read-only|native-context/);
 }
});
test('OpenCode billing provider id does not establish model authorship even with known reasoning', async () => {
 const context_manifest = { id: 'worker-context', native_id: 'worker-native', harness: 'opencode', fresh: true, read_only: true, tools: [], isolation: 'read-only', author_contexts: [], provenance: 'adapter-isolated', model_provider_is_billing_route: true };
 await assert.rejects(collectRuntimeEvidence({ participant: worker, native: native(worker, {context_manifest}), now }), /model-authorship-unverified/);
});
test('provider-native usage preserves exact turn counters and absence never becomes zero', async () => {
 const base = { id: 'worker-context', native_id: 'worker-native', fresh: true, read_only: true, tools: [], isolation: 'read-only', author_contexts: [], provenance: 'adapter-isolated' };
 const codex = await collectRuntimeEvidence({ participant: worker, native: native(worker, {context_manifest:{...base,harness:'codex'},usage:{total:{inputTokens:900},last:{inputTokens:10,outputTokens:5,cachedInputTokens:3,reasoningOutputTokens:1}}}), now });
 assert.deepEqual(codex.usage,{input_tokens:10,output_tokens:5,reasoning_tokens:1,cached_tokens:3});
 const cumulative = await collectRuntimeEvidence({ participant: worker, native: native(worker, {context_manifest:{...base,harness:'codex'},usage:{total:{inputTokens:900}}}), now });
 assert.equal(cumulative.usage.scope,'unavailable-per-turn'); assert.equal(cumulative.usage.input_tokens,undefined);
 const opencode = await collectRuntimeEvidence({ participant: worker, native: native(worker, {context_manifest:{...base,harness:'opencode'},usage:{input:12,output:4,cache:{read:3,write:2}}}), now });
 assert.deepEqual(opencode.usage,{input_tokens:12,output_tokens:4,cache_read_tokens:3,cache_creation_tokens:2}); assert.equal(opencode.usage.reasoning_tokens,undefined);
 const claude = await collectRuntimeEvidence({ participant: worker, native: native(worker, {context_manifest:{...base,harness:'claude'},usage:{input_tokens:2,output_tokens:5,cache_read_input_tokens:10,cache_creation_input_tokens:8}}), now });
 assert.deepEqual(claude.usage,{input_tokens:2,output_tokens:5,cache_read_input_tokens:10,cache_creation_input_tokens:8});
});
async function grantMap(p = worker, cost = '10', customManifest = manifest, allocation = '1000') {
 const { runtime, qualification } = await qualify(p), adapter = billingAdapter();
 const quote = adapter.quoteLiability, quota = adapter.collectQuota;
 adapter.quoteLiability = async r => ({ ...await quote(r), max_units_per_attempt: cost });
 adapter.collectQuota = async r => ({ ...await quota(r), pool_allocation: allocation });
 const billing = await collectBillingEvidence({ runtime, billing: adapter, manifest: customManifest, now });
 return assembleRoutingEvidence({ runtime, qualification, billing, now }).verifiedEvidence;
}
test('collector-sealed grant pins invocation and full task budget without dispatching', async () => {
 const verifiedEvidence = await grantMap();
 const result = createRoutingGrant({ manifest, participants, policy, verifiedEvidence, epoch: 4, now });
 assert.equal(result.grant.participant, worker.id); assert.equal(result.grant.epoch, 4);
 assert.equal(result.grant.policy_revision, 1); assert.equal(result.grant.attempts, 2);
 assert.equal(result.grant.manifest_digest, routingDigest(manifest));
 assert.equal(result.grant.task_max_units, '1000'); assert.equal(result.grant.reserved_control_units, '100');
 assert.equal(result.evidence.pool_allocation, '1000'); assert.equal(result.evidence.strict_bounded, true);
 assert.equal(result.evidence.max_units_per_attempt, '10'); assert.equal(result.dispatch_authorized, false);
 assert.equal(result.evidence_digest, routingDigest(result.evidence)); assert.equal(result.grant_digest, routingDigest(result.grant));
 assert.deepEqual(serializeRoutingGrant(result), structuredClone(result));
 assert.throws(() => serializeRoutingGrant(structuredClone(result)), /collector-provenance/);
});
test('copied, altered or mixed manifest maps cannot mint authenticated routing payloads', async () => {
 const original = await grantMap();
 assert.throws(() => createRoutingGrant({ manifest, participants, policy, verifiedEvidence: new Map(original), epoch:1, now }), /routing-map-provenance/);
 assert.throws(() => createRoutingGrant({ manifest:{...manifest,base:'changed'}, participants, policy, verifiedEvidence:original, epoch:1, now }), /manifest-binding/);
 original.set('forged', structuredClone(original.get(worker.id)));
 assert.throws(() => createRoutingGrant({ manifest, participants, policy, verifiedEvidence:original, epoch:1, now }), /routing-map-provenance/);
 const second = await grantMap(), changed = await grantMap({...worker,id:'different',incarnation:'different-inc'},'10',{...manifest,base:'other'});
 assert.throws(() => mergeVerifiedEvidence(second,changed), /manifest-binding/);
});
test('cheap routine grant and strongest complex grant come from merged collector maps', async () => {
 const strong = {...reviewer,id:'strong-executor',incarnation:'strong-executor-inc'};
 const cohort = [...participants,strong];
 const simpleMap = mergeVerifiedEvidence(await grantMap(),await grantMap(strong,'100'));
 assert.equal(createRoutingGrant({ manifest, participants:cohort, policy, verifiedEvidence:simpleMap, epoch:1, now }).grant.participant,worker.id);
 const complex = {...manifest,safety:{...manifest.safety,architecture:true}};
 const complexMap = mergeVerifiedEvidence(await grantMap(worker,'10',complex),await grantMap(strong,'100',complex));
 assert.equal(createRoutingGrant({ manifest:complex, participants:cohort, policy, verifiedEvidence:complexMap, epoch:1, now }).grant.participant,strong.id);
 assert.throws(() => mergeVerifiedEvidence(simpleMap,simpleMap), /duplicate-participant/);
});
test('grant never renews evidence, weakens review floor or fabricates pool money', async () => {
 const map = await grantMap();
 assert.throws(() => createRoutingGrant({ manifest, participants, policy, verifiedEvidence:map, epoch:0, now }), /epoch-required/);
 assert.throws(() => createRoutingGrant({ manifest, participants, policy, verifiedEvidence:map, epoch:1, reviewFloor:3, now }), /review-floor/);
 assert.throws(() => createRoutingGrant({ manifest, participants, policy:{...policy,revision:2}, verifiedEvidence:map, epoch:1, now }), /review-floor/);
 assert.throws(() => createRoutingGrant({ manifest, participants, policy, verifiedEvidence:map, epoch:1, now:now+60000 }), /routing-unavailable/);
 const lowPool = await grantMap(worker,'10',manifest,'19');
 assert.throws(() => createRoutingGrant({ manifest, participants, policy, verifiedEvidence:lowPool, epoch:1, now }), /pool-allocation-below/);
 const {runtime} = await qualify(), adapter = billingAdapter(), original = adapter.collectQuota;
 adapter.collectQuota = async r => {const q=await original(r);delete q.pool_allocation;return q;};
 const unsupported = await collectBillingEvidence({runtime,billing:adapter,manifest,now});
 assert.equal(unsupported.strict,false); assert.ok(unsupported.blockers.includes('exclusive-pool-money-allocation-unproven'));
});
test('runtime and delivery control calls have provider quoted exact envelopes before dispatch', async () => {
 const runtime=await collectRuntimeEvidence({participant:worker,native:native(worker),now});
 for (const purpose of ['runtime','delivery']) {
  const adapter=billingAdapter(),original=adapter.quoteLiability; let quoted;
  adapter.quoteLiability=async r=>{quoted=r.manifest;return {...await original(r),max_units_per_attempt:'25'};};
  const value=await createControlGrant({runtime,billing:adapter,manifest,participants,policy,epoch:3,purpose,action:purpose==='delivery'?'message-42':'inspect-model',nonce:'control-nonce',now});
  assert.equal(value.grant.kind,'control');assert.equal(value.grant.purpose,purpose);assert.equal(value.grant.epoch,3);
  assert.equal(value.grant.native_id,runtime.native_id);assert.equal(value.grant.context_id,runtime.context.id);
  assert.equal(value.manifest.attempts,1);assert.deepEqual(value.manifest,quoted);
  assert.equal(value.grant.manifest_digest,routingDigest(quoted));assert.equal(value.grant.reserved_control_units,'100');
  assert.equal(value.evidence.max_units_per_attempt,'25');assert.equal(value.dispatch_authorized,false);
  assert.deepEqual(serializeControlGrant(value),structuredClone(value));
  assert.throws(()=>serializeControlGrant(structuredClone(value)),/collector-provenance/);
 }
});
test('strongest fresh review control quote pins immutable work generation and target evidence', async () => {
 const runtime=await collectRuntimeEvidence({participant:reviewer,native:native(reviewer),now});
 const args={runtime,billing:billingAdapter(),manifest,participants,policy,epoch:1,purpose:'review',action:'independent-review',nonce:'review-nonce',work_id:'work-1',generation:2,target_digest:'a'.repeat(64),criteria_digest:'b'.repeat(64),tests_digest:'c'.repeat(64),excludedContexts:['worker-context'],authorParticipants:['worker'],now};
 const value=await createControlGrant(args);
 assert.equal(value.grant.review_floor,2);assert.equal(value.grant.work_id,'work-1');assert.equal(value.grant.generation,2);
 assert.equal(value.grant.target_digest,args.target_digest);assert.deepEqual(value.grant.author_participants,['worker']);
 const alias=await createControlGrant({...args,target_digest:undefined,criteria_digest:undefined,tests_digest:undefined,review_target:{target_digest:args.target_digest,criteria_digest:args.criteria_digest,tests_digest:args.tests_digest}});
 assert.equal(alias.grant.target_digest,args.target_digest);
 await assert.rejects(createControlGrant({...args,review_target:{target_digest:'f'.repeat(64),criteria_digest:args.criteria_digest,tests_digest:args.tests_digest}}),/target-binding/);
 await assert.rejects(createControlGrant({...args,authorParticipants:['critic']}),/author-context-excluded/);
 await assert.rejects(createControlGrant({...args,excludedContexts:['critic-context']}),/author-context-excluded/);
 await assert.rejects(createControlGrant({...args,target_digest:undefined}),/target-binding/);
 await assert.rejects(createControlGrant({...args,reviewFloor:3}),/strongest-review/);
 const weakRuntime=await collectRuntimeEvidence({participant:worker,native:native(worker),now});
 await assert.rejects(createControlGrant({...args,runtime:weakRuntime,authorParticipants:[],excludedContexts:[]}),/strongest-review/);
});
test('control reserve never borrows worker money or invents unsupported subscription liability', async () => {
 const runtime=await collectRuntimeEvidence({participant:worker,native:native(worker),now});
 const args={runtime,manifest,participants,policy,epoch:1,purpose:'runtime',action:'inspect-model',nonce:'nonce',now};
 await assert.rejects(createControlGrant({...args,billing:undefined}),/bounded-billing/);
 const adapter=billingAdapter(),original=adapter.quoteLiability;
 adapter.quoteLiability=async r=>({...await original(r),max_units_per_attempt:'101'});
 await assert.rejects(createControlGrant({...args,billing:adapter}),/outside-task-reserve/);
 adapter.quoteLiability=async r=>({...await original(r),max_units_per_attempt:'1',inflight_charges_bounded:false});
 await assert.rejects(createControlGrant({...args,billing:adapter}),/bounded-billing/);
});
test('unverified initial identity and stale runtime cannot bootstrap a paid control grant', async () => {
 const runtime=await collectRuntimeEvidence({participant:worker,native:native(worker),now});
 const args={runtime,billing:billingAdapter(),manifest,participants,policy,epoch:1,purpose:'runtime',action:'inspect-model',nonce:'nonce',now};
 await assert.rejects(createControlGrant({...args,runtime:structuredClone(runtime)}),/collector-provenance/);
 await assert.rejects(createControlGrant({...args,now:now+900000}),/bootstrap-or-refresh/);
 await assert.rejects(createControlGrant({...args,participants:[{...worker,model:{...worker.model,model_revision:2}},reviewer]}),/participant-not-enrolled/);
 await assert.rejects(createControlGrant({...args,purpose:'hidden-retry'}),/control-binding/);
});
test('runtime observation converts a budgeted owned receipt without another model call or TTL renewal', async () => {
 const receipt={output:'observed-nonce',native_id:'worker-native',invocation_id:'paid-identity-1',observed_at:new Date(now-1000).toISOString(),correlation:{nonce:'observed-nonce',invocation_id:'paid-identity-1'},actualModel:{provider:worker.model.provider,model_id:worker.model.model_id,reasoning:worker.model.reasoning,observed_at:new Date(now-1000).toISOString()},context_manifest:{id:'worker-context',native_id:'worker-native',fresh:true,read_only:true,tools:[],isolation:'read-only',author_contexts:[],provenance:'adapter-isolated'}};
 let lookups=0;
 const observe=async request=>{lookups++;assert.equal(request.participant,'worker');return receipt;};
 const first=await collectRuntimeObservation({participant:worker,observe,now});
 const second=await collectRuntimeObservation({participant:worker,observe,now:now+1000});
 assert.equal(lookups,2);assert.equal(first.identity.observed_at,receipt.observed_at);
 assert.equal(first.identity.expires_at,second.identity.expires_at);assert.equal(first.invocation_id,'paid-identity-1');
 const control=await createControlGrant({runtime:first,billing:billingAdapter(),manifest,participants,policy,epoch:1,purpose:'runtime',action:'inspect-model',nonce:'next-inspection',now});
 assert.equal(control.grant.context_id,'worker-context');
 await assert.rejects(collectRuntimeObservation({participant:worker,observe:receipt,now}),/trusted-runtime-observer/);
});
test('runtime observer refuses old clocks, wrong correlation and model fallbacks without rewriting receipts', async () => {
 const base={text:'nonce',native_id:'worker-native',invocation_id:'inv',observed_at:new Date(now).toISOString(),correlation:{nonce:'nonce',invocation_id:'inv'},actualModel:{provider:worker.model.provider,model_id:worker.model.model_id,reasoning:worker.model.reasoning,observed_at:new Date(now).toISOString()},context_manifest:{id:'worker-context',native_id:'worker-native',fresh:true,read_only:true,tools:[],isolation:'read-only',author_contexts:[],provenance:'adapter-isolated'}};
 const newline=await collectRuntimeObservation({participant:worker,observe:async()=>({...base,text:'nonce\n'}),now});
 assert.notEqual(newline.receipt_digest,(await collectRuntimeObservation({participant:worker,observe:async()=>base,now})).receipt_digest);
 for (const change of [{text:'nonce extra'},{invocation_id:'another'},{correlation:{nonce:'wrong',invocation_id:'inv'}},{observed_at:new Date(now-30001).toISOString()},{observed_at:new Date(now+1).toISOString()},{actualModel:{...base.actualModel,model_id:'fallback'}},{actualModel:{...base.actualModel,observed_at:new Date(now-1).toISOString()}}]) {
  await assert.rejects(collectRuntimeObservation({participant:worker,observe:async()=>({...base,...change}),now}),/correlation|clock-mismatch|runtime-model/);
 }
 assert.equal(base.text,'nonce');
});
test('native output-only frames are accepted but conflicting output/text can never qualify', async () => {
 const source=native(worker);
 const outputOnly={async send(prompt,invocation){const r=await source.send(prompt,invocation);const {text,...other}=r;return {...other,output:text};}};
 const runtime=await collectRuntimeEvidence({participant:worker,native:outputOnly,now});
 assert.equal(runtime.participant,worker.id);
 const bad={async send(prompt,invocation){const r=await source.send(prompt,invocation);return {...r,output:'conflicting'};}};
 await assert.rejects(collectRuntimeEvidence({participant:worker,native:bad,now}),/fields-conflict/);
});
