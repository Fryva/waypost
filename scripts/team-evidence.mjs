// Trusted adapter collectors. No JSON import or participant attestation can mint
// a record: assembly accepts only values produced by these host-owned callbacks.
// This suite measures bounded text editing, never architectural/model strength.
import { randomUUID, createHash } from 'node:crypto';
import { routingDigest, validateManifest, proposeModelRoute } from './model-routing.mjs';
import { rankParticipant, updateReviewFloor, validatePolicy } from './team.mjs';
import { quotaEligible } from './team-quota.mjs';

const minted = new WeakMap();
const clock = () => Date.now();
const rawDigest = value => createHash('sha256').update(value).digest('hex');
const tuple = m => [m?.provider, m?.model_id, m?.reasoning];
const sameModel = (a, b) => JSON.stringify(tuple(a)) === JSON.stringify(tuple(b));
function fail(code) { throw new Error('evidence-' + code); }
function text(v, max = 256) { return typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x1f\x7f]/.test(v); }
function bounded(v, max = 65536) { if (!v || typeof v !== 'object' || Array.isArray(v) || Buffer.byteLength(JSON.stringify(v)) > max) fail('record-budget'); return structuredClone(v); }
function freeze(v) { if (v && typeof v === 'object') { for (const child of Object.values(v)) freeze(child); Object.freeze(v); } return v; }
function mint(v, kind, binding) { freeze(v); minted.set(v, { kind, binding }); return v; }
function own(v, kind) { const info = minted.get(v); if (info?.kind !== kind) fail('collector-provenance-required'); return info.binding; }
function time(now) { const ms = typeof now === 'function' ? now() : now; if (!Number.isFinite(ms)) fail('clock-required'); return ms; }
function stamp(source, ms, ttl) { return { source, observed_at: new Date(ms).toISOString(), expires_at: new Date(ms + ttl).toISOString() }; }
function fresh(v, ms, ttl) { const from = Date.parse(v?.observed_at), to = Date.parse(v?.expires_at); return text(v?.source, 1024) && Number.isFinite(from) && Number.isFinite(to) && from <= ms && to > ms && to > from && to - from <= ttl; }
function actual(result, participant) {
 const m = result?.actualModel;
 if (!tuple(m).every(x => text(x) && x !== 'unknown') || !sameModel(m, participant.model)) fail('runtime-model-mismatch-or-unknown');
 if (!text(result.native_id)) fail('native-id-required');
 const ctx = bounded(result.context_manifest, 8192);
 if (ctx.model_provider_is_billing_route === true || m.provider_kind === 'billing-route') fail('model-authorship-unverified');
 if (!text(ctx.id) || ctx.read_only !== true || ctx.fresh !== true || !Array.isArray(ctx.tools) || ctx.tools.length > 32 || ctx.tools.some(t => !text(t, 128)) || !['read-only', 'worktree'].includes(ctx.isolation)) fail('isolated-read-only-context-required');
 // Adapter manifests refer to native contexts; merely minting another id cannot
 // turn an already used author's context into an independent critic.
 if (ctx.native_id !== result.native_id || ctx.fresh_review_verified === false || ctx.author_history_inherited === true || !Array.isArray(ctx.author_contexts) || ctx.author_contexts.length || ctx.provenance !== 'adapter-isolated') fail('native-context-provenance-required');
 return { model: { provider: m.provider, model_id: m.model_id, reasoning: m.reasoning }, context: ctx };
}
function usage(raw, harness) {
 if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
 // Codex totals are cumulative across turns; only `last` is a turn measurement.
 // Cache read/create and reasoning are distinct; absence never implies zero.
 let fields = raw;
 if (harness === 'codex' && (raw.total || raw.last)) {
  if (!raw.last) return { scope: 'unavailable-per-turn', cumulative_usage_digest: routingDigest(raw) };
  fields = { input_tokens: raw.last.inputTokens, output_tokens: raw.last.outputTokens, reasoning_tokens: raw.last.reasoningOutputTokens, cached_tokens: raw.last.cachedInputTokens, total_tokens: raw.last.totalTokens };
 } else if (harness === 'opencode') fields = { input_tokens: raw.input, output_tokens: raw.output, reasoning_tokens: raw.reasoning, cache_read_tokens: raw.cache?.read, cache_creation_tokens: raw.cache?.write };
 const out = {};
 for (const k of ['input_tokens','output_tokens','reasoning_tokens','cached_tokens','total_tokens','cache_read_tokens','cache_creation_tokens','cache_read_input_tokens','cache_creation_input_tokens']) if (fields[k] !== undefined) {
  if (!Number.isSafeInteger(fields[k]) || fields[k] < 0) fail('invalid-observed-usage'); out[k] = fields[k];
 }
 return out;
}
async function invoke(native, prompt, purpose) {
 if (typeof native?.send !== 'function') fail('native-collector-unavailable');
 const result = await native.send(prompt, { id: randomUUID(), purpose, max_output_chars: 8192, read_only: true });
 return normalizeResult(result);
}
function normalizeResult(result) {
 if (!result || typeof result!=='object' || Array.isArray(result)) fail('native-answer-required');
 if ((result.text!==undefined&&typeof result.text!=='string') || (result.output!==undefined&&typeof result.output!=='string') || (typeof result.text==='string'&&typeof result.output==='string'&&result.text!==result.output)) fail('native-answer-fields-conflict');
 const text=result.output??result.text;
 if (typeof text!=='string' || Buffer.byteLength(text)>8192) fail('native-answer-budget');
 return {...result,text};
}
function runtimeRecord(participant,result,observedMs) {
 const {model,context}=actual(result,participant);
 const binding=routingDigest({participant:participant.id,incarnation:participant.incarnation,revision:participant.model.model_revision,model,native_id:result.native_id,context:context.id});
 return mint({protocol:1,participant:participant.id,incarnation:participant.incarnation,model_revision:participant.model.model_revision,model,native_id:result.native_id,context,tools:context.tools,isolation:context.isolation,identity:stamp('native:'+result.native_id,observedMs,900000),usage:usage(result.usage,context.harness),receipt_digest:rawDigest(result.text),...(result.invocation_id?{invocation_id:result.invocation_id}:{})},'runtime',binding);
}
function validParticipant(participant) {
 if (!text(participant?.id) || !text(participant?.incarnation) || !Number.isSafeInteger(participant.model?.model_revision) || participant.model.model_revision<1) fail('participant-required');
}

const cases = [
 ['Preserve zero: replace || with ?? in the fallback.', 'const count = input.count || 10;', 'const count = input.count ?? 10;'],
 ['Include the upper endpoint: change < to <=.', 'for (let i = 0; i < max; i++) visit(i);', 'for (let i = 0; i <= max; i++) visit(i);'],
 ['Do not mutate the input array; copy it before sorting.', 'const ordered = values.sort();', 'const ordered = [...values].sort();'],
 ['Treat only null and undefined as absent; preserve false.', 'const absent = !value;', 'const absent = value == null;'],
 ['Avoid string coercion: require strict equality.', 'const match = actual == expected;', 'const match = actual === expected;'],
 ['Preserve the first matching index including zero.', 'const found = index > 0;', 'const found = index >= 0;'],
 ['Check an own property rather than a truthy value.', 'const present = Boolean(record[key]);', 'const present = Object.hasOwn(record, key);'],
 ['Await both promises, preserve result order.', 'const results = promises.map(p => p);', 'const results = await Promise.all(promises);'],
].map(([instruction, input, expected], i) => ({ id: 'edit-' + (i + 1), instruction, input, expected }));
export const TASK_CLASS_SUITE = freeze({ benchmark: 'waypost-bounded-text-edit', revision: '1', domain: 'coding', task_class: 'bounded-edit', cases });
export const TASK_CLASS_CRITERIA_DIGEST = routingDigest(TASK_CLASS_SUITE);

export async function collectRuntimeEvidence({ participant, native, now = clock } = {}) {
 validParticipant(participant);
 const nonce = randomUUID();
 const result = await invoke(native, 'Return exactly this token: ' + nonce, 'identity-inspection');
 if (result.text.trim() !== nonce) fail('identity-receipt-mismatch');
 return runtimeRecord(participant,result,time(now));
}

// Conversion of a previously budgeted adapter receipt. `observe` is a host-owned
// lookup callback, never a JSON parameter or a callback that invokes inference.
// The original receipt clock is preserved, so reads cannot extend identity TTL.
export async function collectRuntimeObservation({participant,observe,now=clock}={}) {
 validParticipant(participant);
 if (typeof observe!=='function') fail('trusted-runtime-observer-required');
 const result=normalizeResult(await observe({participant:participant.id,incarnation:participant.incarnation,model_revision:participant.model.model_revision}));
 const correlation=bounded(result.correlation,4096),ms=time(now),observed=Date.parse(result.observed_at);
 if (!text(correlation.nonce,128) || !text(correlation.invocation_id,128) || result.invocation_id!==correlation.invocation_id || result.text.trim()!==correlation.nonce) fail('runtime-observation-correlation-required');
 if (typeof result.observed_at!=='string' || !Number.isFinite(observed) || observed>ms || ms-observed>30000 || (result.actualModel?.observed_at!==undefined&&Date.parse(result.actualModel.observed_at)!==observed)) fail('runtime-observation-stale-or-clock-mismatch');
 return runtimeRecord(participant,result,observed);
}

export async function collectTaskQualification({ runtime, native, reviewNative, reviewer, participants, policy, reviewFloor = null, now = clock } = {}) {
 const binding = own(runtime, 'runtime'), start = time(now);
 if (!fresh(runtime.identity, start, 900000)) fail('runtime-stale');
 if (!Array.isArray(participants) || participants.length > 1024 || policy?.domain !== TASK_CLASS_SUITE.domain) fail('review-cohort-required');
 const enrolled = participants.find(p => p.id === reviewer?.id && p.incarnation === reviewer?.incarnation && p.model?.model_revision === reviewer?.model?.model_revision && sameModel(p.model, reviewer.model));
 if (!enrolled || enrolled.revoked || enrolled.availability !== 'ready' || !quotaEligible(enrolled,start)) fail('independent-strongest-review-required');
 const floor = updateReviewFloor(reviewFloor, participants.filter(p=>quotaEligible(p,start)), policy, { now: start });
 if (floor === null || reviewer?.id === runtime.participant || reviewer?.incarnation === runtime.incarnation || reviewer?.revoked || reviewer?.availability !== 'ready' || (rankParticipant(reviewer, policy, 'review', { now: start }) ?? -1) < floor) fail('independent-strongest-review-required');
 const captures = [];
 const participant = { model: { ...runtime.model, model_revision: runtime.model_revision } };
 for (const item of TASK_CLASS_SUITE.cases) {
  const prompt = 'Apply only the requested edit. Return JSON with exactly one field "code" containing the full edited source, without markdown.\nInstruction: ' + item.instruction + '\nSource: ' + item.input;
  const result = await invoke(native, prompt, 'task-class-trial:' + item.id);
  const observed = actual(result, participant);
  if (result.native_id !== runtime.native_id || observed.context.id !== runtime.context.id) fail('trial-native-context-changed');
  let parsed; try { parsed = JSON.parse(result.text); } catch { parsed = null; }
  const pass = parsed && Object.keys(parsed).length === 1 && parsed.code === item.expected;
  captures.push({ id: item.id, prompt_digest: rawDigest(prompt), output: result.text, output_digest: rawDigest(result.text), pass: Boolean(pass), native_id: result.native_id, model: observed.model, usage: usage(result.usage, observed.context.harness) });
  if (Buffer.byteLength(JSON.stringify(captures)) > 32768) fail('trial-capture-budget');
 }
 const bundle = { suite: TASK_CLASS_SUITE, criteria_digest: TASK_CLASS_CRITERIA_DIGEST, participant: runtime.participant, model: runtime.model, native_id: runtime.native_id, captures };
 const target_digest = routingDigest(bundle);
 const review = await invoke(reviewNative, 'Independently check the exact captured answers against the pinned suite. This measures bounded text editing only, not architectural strength. Return only JSON {"accepted":true|false,"target_digest":"' + target_digest + '"}. Reject if captured deterministic verdicts or identity are inconsistent.\n' + JSON.stringify(bundle), 'independent-task-class-review');
 const observedReview = actual(review, reviewer), end = time(now);
 if (review.native_id === runtime.native_id || observedReview.context.id === runtime.context.id || observedReview.context.author_contexts.length || !fresh(runtime.identity, end, 900000) || (rankParticipant(reviewer, policy, 'review', { now: end }) ?? -1) < floor) fail('review-context-or-policy-stale');
 let verdict; try { verdict = JSON.parse(review.text); } catch { fail('review-verdict-required'); }
 if (verdict?.accepted !== true || verdict.target_digest !== target_digest || Object.keys(verdict).some(k => !['accepted','target_digest'].includes(k))) fail('independent-review-rejected');
 const passes = captures.filter(c => c.pass).length, confidence = wilson(passes, captures.length);
 return mint({ ...stamp('task-class:' + target_digest, end, 604800000), task_class: TASK_CLASS_SUITE.task_class, domain: TASK_CLASS_SUITE.domain, benchmark: TASK_CLASS_SUITE.benchmark, revision: TASK_CLASS_SUITE.revision, criteria_digest: TASK_CLASS_CRITERIA_DIGEST, passes, total_trials: captures.length, confidence: { ...confidence, method: 'wilson-95', limitation: 'Fixed bounded-edit fixtures; neither randomized trials nor architectural strength.' }, captures, target_digest, review: { participant: reviewer.id, incarnation: reviewer.incarnation, native_id: review.native_id, context: observedReview.context, model: observedReview.model, floor, policy_revision: policy.revision, output: review.text, output_digest: rawDigest(review.text), usage: usage(review.usage, observedReview.context.harness) } }, 'qualification', binding);
}

function wilson(passes, total) {
 const z = 1.959963984540054, p = passes / total, d = 1 + z * z / total;
 const center = (p + z * z / (2 * total)) / d, half = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / d;
 return { score: p, lower: Math.max(0, center - half), upper: Math.min(1, center + half) };
}
function money(v) { if (typeof v !== 'string' || !/^(0|[1-9][0-9]{0,17})$/.test(v)) fail('integer-money-required'); return v; }

export async function collectBillingEvidence({ runtime, billing, manifest: raw, now = clock } = {}) {
 const binding = own(runtime, 'runtime'), manifest = validateManifest(raw);
 const blockers = [];
 if (!billing || ['inspectRoute', 'collectPrice', 'collectQuota', 'quoteLiability'].some(k => typeof billing[k] !== 'function')) return mint({ strict: false, blockers: ['trusted-billing-adapter-unavailable'] }, 'billing', binding);
 // These callbacks belong to the adapter/host, never to model output or a tool
 // parameter. A supplied API tariff cannot establish subscription CLI prices.
 const route = bounded(await billing.inspectRoute({ native_id: runtime.native_id, model: runtime.model }), 8192);
 for (const k of ['endpoint','account','sku','mode','pool']) if (!text(route[k], 1024)) fail('billing-route-required');
 let url; try { url = new URL(route.endpoint); } catch { fail('billing-endpoint-required'); }
 if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['api','subscription','free'].includes(route.mode) || !sameModel(route.model, runtime.model)) fail('billing-route-mismatch');
 const route_digest = routingDigest(route), request = { route, route_digest, manifest, native_id: runtime.native_id };
 const price = bounded(await billing.collectPrice(request), 8192);
 const quota = bounded(await billing.collectQuota(request), 8192);
 const liability = bounded(await billing.quoteLiability(request), 8192), ms = time(now);
 if (!fresh(runtime.identity, ms, 900000)) blockers.push('runtime-stale');
 if (!fresh(price, ms, 86400000) || price.route_digest !== route_digest || price.currency !== manifest.budget.currency) blockers.push('price-stale-or-route-mismatch');
 for (const k of ['input_units_per_million','output_units_per_million','tool_max_units']) money(price[k]);
 if (!fresh(quota, ms, 60000) || quota.pool !== route.pool || quota.currency !== manifest.budget.currency || !Number.isSafeInteger(quota.available_calls) || quota.available_calls < manifest.attempts || quota.scope !== 'project-authority' || quota.exclusive_allocation !== true || !text(quota.allocation_id)) blockers.push('exclusive-shared-quota-allocation-unproven');
 if (quota.pool_allocation === undefined) blockers.push('exclusive-pool-money-allocation-unproven');
 else money(quota.pool_allocation);
 if (!fresh(liability, ms, 60000) || liability.route_digest !== route_digest || liability.manifest_digest !== routingDigest(manifest) || liability.currency !== manifest.budget.currency || liability.all_charges_bounded !== true || liability.inflight_charges_bounded !== true || liability.enforced_by_provider !== true || !text(liability.quote_id)) blockers.push('maximum-liability-unproven');
 money(liability.max_units_per_attempt);
 return mint({ strict: blockers.length === 0, route, price, quota, liability, blockers, manifest_digest: routingDigest(manifest), budget_scope: 'project-authority' }, 'billing', binding);
}

export function assembleRoutingEvidence({ runtime, qualification, billing, now = clock } = {}) {
 const binding = own(runtime, 'runtime');
 if (own(qualification, 'qualification') !== binding || own(billing, 'billing') !== binding) fail('collector-binding-mismatch');
 if (!billing.strict) return { verifiedEvidence: new Map(), blockers: [...billing.blockers] };
 const ms = time(now);
 for (const [record, ttl] of [[runtime.identity,900000],[qualification,604800000],[billing.price,86400000],[billing.quota,60000],[billing.liability,60000]]) if (!fresh(record, ms, ttl)) fail('assembly-stale');
 const value = { participant: runtime.participant, incarnation: runtime.incarnation, model_revision: runtime.model_revision, model: runtime.model, identity: runtime.identity, qualification, tools: runtime.tools, isolation: runtime.isolation, route: billing.route, price: billing.price, quota: billing.quota, liability: billing.liability };
 bounded(value);
 const record = mint(value, 'routing-record', binding);
 return { verifiedEvidence: mintMap(new Map([[runtime.participant, record]]), billing.manifest_digest), blockers: [] };
}

function mapDigest(map) { return routingDigest([...map.entries()].sort(([a],[b]) => a.localeCompare(b))); }
function mintMap(map, manifest_digest) {
 minted.set(map, { kind: 'routing-map', binding: mapDigest(map), manifest_digest });
 return map;
}
function checkedMap(map) {
 const proof = minted.get(map);
 if (!(map instanceof Map) || map.size < 1 || map.size > 1024 || proof?.kind !== 'routing-map' || proof.binding !== mapDigest(map)) fail('routing-map-provenance-or-content-mismatch');
 for (const [id, record] of map) if (record.participant !== id || minted.get(record)?.kind !== 'routing-record') fail('routing-record-provenance-required');
 return proof;
}
export function mergeVerifiedEvidence(...maps) {
 if (!maps.length || maps.length > 1024) fail('routing-maps-required');
 const out = new Map(); let manifest_digest;
 for (const map of maps) {
  const proof = checkedMap(map);
  if (manifest_digest && manifest_digest !== proof.manifest_digest) fail('routing-manifest-binding-mismatch');
  manifest_digest = proof.manifest_digest;
  for (const [id, record] of map) { if (out.has(id)) fail('routing-duplicate-participant'); out.set(id, record); }
 }
 if (out.size > 1024) fail('routing-record-budget');
 return mintMap(out, manifest_digest);
}

// Digest seals content, not caller authority. Only an authenticated host usage
// collector may install the serialized payload; the journal must then reserve
// funds and consume each attempt before dispatch. This function never dispatches.
export function createRoutingGrant({ manifest: raw, participants, policy, verifiedEvidence, epoch, quotaRevision = 0, reviewFloor = null, now = clock } = {}) {
 const ms = time(now), manifest = validateManifest(raw), proof = checkedMap(verifiedEvidence);
 if (!Number.isSafeInteger(epoch) || epoch < 1 || !Number.isSafeInteger(quotaRevision) || quotaRevision < 0) fail('routing-epoch-required');
 const manifest_digest = routingDigest(manifest);
 if (proof.manifest_digest !== manifest_digest) fail('routing-manifest-binding-mismatch');
 const available=participants.filter(p=>quotaEligible(p,ms));
 const proposal = proposeModelRoute({ manifest, participants:available, policy, verifiedEvidence, now: ms });
 if (!proposal.choice) fail('qualified-affordable-routing-unavailable');
 const choice = proposal.choice, record = verifiedEvidence.get(choice.participant), q = record.qualification;
 const reviewer = participants.find(p => p.id === q.review?.participant && p.incarnation === q.review?.incarnation && sameModel(p.model,q.review?.model));
 const floor = updateReviewFloor(reviewFloor, available, policy, { now: ms });
 if (!reviewer || reviewer.revoked || !quotaEligible(reviewer,ms) || floor === null || q.review.policy_revision !== policy.revision || (rankParticipant(reviewer, policy, 'review', { now: ms }) ?? -1) < floor) fail('qualification-review-floor-or-policy-changed');
 const liability = BigInt(money(record.liability.max_units_per_attempt)), pool_allocation = money(record.quota.pool_allocation);
 if (BigInt(pool_allocation) < liability * BigInt(manifest.attempts)) fail('pool-allocation-below-full-attempt-liability');
 const expires_at = new Date(Math.min(ms + 60000, ...['identity','qualification','price','quota','liability'].map(k => Date.parse(record[k].expires_at)), policy.mode === 'automatic' ? Date.parse(policy.expires_at) : ms + 60000)).toISOString();
 const grant = { protocol: 1, id: 'grant-' + randomUUID(), participant: choice.participant, incarnation: choice.incarnation, model_revision: choice.model_revision, model: record.model, epoch, quota_revision:quotaRevision, policy_revision: policy.revision, route_digest: choice.route_digest, manifest_digest, attempts: manifest.attempts, task_max_units: manifest.budget.max_units, reserved_control_units: manifest.budget.reserved_control_units, classification_digest: routingDigest(proposal.classification), qualification_digest: q.target_digest, quote_id: record.liability.quote_id, allocation_id: record.quota.allocation_id, expires_at };
 const evidence = { protocol: 1, pool: record.route.pool, currency: manifest.budget.currency, strict_bounded: true, max_units_per_attempt: liability.toString(), pool_allocation, expires_at, grant, route: record.route, price: record.price, quota: record.quota, liability: record.liability, identity: record.identity, qualification: q, budget_scope: 'project-authority' };
 bounded(evidence);
 const grant_digest = routingDigest(grant), evidence_digest = routingDigest(evidence);
 const payload={ evidence, evidence_digest, grant, grant_digest, manifest, records:[...verifiedEvidence], choice, classification: proposal.classification, dispatch_authorized: false, installation_required: 'authenticated-host-usage-collector', reservation_required: 'project-authority-consume-before-dispatch' };
 bounded(payload,196608);
 return mint(payload, 'routing-grant', evidence_digest);
}
export function serializeRoutingGrant(grant) {
 const digest = own(grant, 'routing-grant');
 if (digest !== routingDigest(grant.evidence) || grant.evidence_digest !== digest || grant.grant_digest !== routingDigest(grant.grant)) fail('routing-grant-content-mismatch');
 return structuredClone(grant);
}

// A paid control call is itself an invocation. Existing verified runtime data
// may authorize a refresh, but an unknown initial identity cannot bootstrap by
// running an unbudgeted collectRuntimeEvidence call. The host must acquire an
// independently verified nonbillable identity or report a bootstrap blocker.
export async function createControlGrant({ runtime, billing, manifest: raw, participants, policy, epoch, quotaRevision = 0, purpose, action, nonce, work_id, generation, target_digest, criteria_digest, tests_digest, review_target, reviewFloor = null, excludedContexts = [], authorParticipants = [], now = clock } = {}) {
 const binding = own(runtime, 'runtime'), ms = time(now), original = validateManifest(raw);
 policy=validatePolicy(policy);
 if (!fresh(runtime.identity, ms, 900000)) fail('control-runtime-bootstrap-or-refresh-required');
 if (!Number.isSafeInteger(quotaRevision) || quotaRevision < 0 || !Array.isArray(participants) || participants.length > 1024 || !['runtime','review','delivery'].includes(purpose) || !text(action,1024) || !text(nonce,128) || !Number.isSafeInteger(epoch) || epoch < 1 || !Number.isSafeInteger(policy?.revision) || policy.revision < 1 || policy.domain !== original.domain) fail('control-binding-required');
 const participant = participants.find(p => p.id === runtime.participant && p.incarnation === runtime.incarnation && p.model?.model_revision === runtime.model_revision && sameModel(p.model,runtime.model));
 if (!participant || participant.revoked || participant.availability === 'left' || !quotaEligible(participant,ms)) fail('control-participant-not-enrolled');
 const control = { purpose, action, nonce, participant:runtime.participant, incarnation:runtime.incarnation, model_revision:runtime.model_revision, model:runtime.model, native_id:runtime.native_id, context_id:runtime.context.id, epoch, quota_revision:quotaRevision, policy_revision:policy.revision };
 if (work_id !== undefined || generation !== undefined) {
  if (!text(work_id,128) || !Number.isSafeInteger(generation) || generation < 1) fail('control-work-binding-required');
  control.work_id=work_id;control.generation=generation;
 }
 if (purpose === 'review') {
  if (review_target!==undefined) {
   const target=bounded(review_target,4096);
   if (Object.keys(target).some(k=>!['target_digest','criteria_digest','tests_digest'].includes(k)) || [[target_digest,target.target_digest],[criteria_digest,target.criteria_digest],[tests_digest,target.tests_digest]].some(([a,b])=>a!==undefined&&a!==b)) fail('control-review-target-binding-required');
   ({target_digest,criteria_digest,tests_digest}=target);
  }
  if (!['review-context','independent-review'].includes(action) || !control.work_id || [target_digest,criteria_digest,tests_digest].some(x => !/^[a-f0-9]{64}$/.test(x || ''))) fail('control-review-target-binding-required');
  const floor=updateReviewFloor(reviewFloor,participants.filter(p=>quotaEligible(p,ms)),policy,{now:ms});
  for (const list of [excludedContexts,authorParticipants]) if (!Array.isArray(list) || list.length>128 || list.some(x=>!text(x,256))) fail('control-review-author-exclusions-required');
  if (excludedContexts.includes(runtime.context.id) || excludedContexts.includes(runtime.native_id) || authorParticipants.includes(runtime.participant)) fail('control-review-author-context-excluded');
  if (floor===null || (rankParticipant(participant,policy,'review',{now:ms}) ?? -1)<floor || runtime.context.fresh!==true || runtime.context.read_only!==true || runtime.context.author_contexts.length) fail('control-independent-strongest-review-required');
  Object.assign(control,{target_digest,criteria_digest,tests_digest,review_floor:floor,excluded_contexts:[...excludedContexts],author_participants:[...authorParticipants]});
 }
 const manifest={...original,attempts:1,control};
 const collected=await collectBillingEvidence({runtime,billing,manifest,now});
 if (own(collected,'billing')!==binding || !collected.strict) fail('control-bounded-billing-unavailable');
 const end=time(now);
 if (!fresh(runtime.identity,end,900000) || !fresh(collected.quota,end,60000) || !fresh(collected.liability,end,60000)) fail('control-evidence-expired');
 const units=BigInt(money(collected.liability.max_units_per_attempt));
 const estimate=(BigInt(manifest.input_tokens)*BigInt(collected.price.input_units_per_million)+999999n)/1000000n+(BigInt(manifest.output_tokens)*BigInt(collected.price.output_units_per_million)+999999n)/1000000n+BigInt(collected.price.tool_max_units);
 if (units<estimate || units>BigInt(original.budget.reserved_control_units) || units>BigInt(original.budget.max_units) || units>BigInt(collected.quota.pool_allocation)) fail('control-liability-outside-task-reserve');
 if (purpose==='review' && (rankParticipant(participant,policy,'review',{now:end}) ?? -1)<control.review_floor) fail('control-review-policy-expired');
 const expires_at=new Date(Math.min(end+60000,Date.parse(runtime.identity.expires_at),...['price','quota','liability'].map(k=>Date.parse(collected[k].expires_at)),policy.mode==='automatic'?Date.parse(policy.expires_at):end+60000)).toISOString();
 if (Date.parse(expires_at)<=end) fail('control-policy-expired');
 const grant={protocol:1,id:'control-'+randomUUID(),kind:'control',...control,route_digest:routingDigest(collected.route),manifest_digest:routingDigest(manifest),attempts:1,task_max_units:original.budget.max_units,reserved_control_units:original.budget.reserved_control_units,quote_id:collected.liability.quote_id,allocation_id:collected.quota.allocation_id,expires_at};
 const evidence={protocol:1,pool:collected.route.pool,currency:original.budget.currency,strict_bounded:true,max_units_per_attempt:units.toString(),pool_allocation:collected.quota.pool_allocation,expires_at,grant,route:collected.route,price:collected.price,quota:collected.quota,liability:collected.liability,identity:runtime.identity,context:runtime.context,budget_scope:'project-authority'};
 bounded(evidence);
 const value={evidence,evidence_digest:routingDigest(evidence),grant,grant_digest:routingDigest(grant),manifest,dispatch_authorized:false,installation_required:'authenticated-host-usage-collector',reservation_required:'owner-control-reserve-and-consume-before-dispatch'};
 return mint(value,'control-grant',value.evidence_digest);
}
export function serializeControlGrant(grant) {
 const digest=own(grant,'control-grant');
 if (digest!==routingDigest(grant.evidence) || grant.evidence_digest!==digest || grant.grant_digest!==routingDigest(grant.grant) || grant.grant.manifest_digest!==routingDigest(grant.manifest)) fail('control-grant-content-mismatch');
 return structuredClone(grant);
}

// A calibration on this finite suite is comparable only within its task class.
// It intentionally cannot populate the generic coding coordinator/reviewer ranks.
export function collectTaskClassCalibration({ qualifications, runtimes, cohort, now = clock } = {}) {
 if (!Array.isArray(qualifications) || !Array.isArray(runtimes) || qualifications.length < 2 || qualifications.length > 128 || qualifications.length !== runtimes.length || !text(cohort)) fail('calibration-cohort-required');
 const ms = time(now), seen = new Set(), rows = qualifications.map((q, i) => {
  if (own(q, 'qualification') !== own(runtimes[i], 'runtime') || !fresh(q, ms, 604800000)) fail('calibration-proof-stale-or-mismatched');
  const model = runtimes[i].model, key = JSON.stringify(tuple(model)); if (seen.has(key)) fail('calibration-duplicate-model'); seen.add(key);
  return { ...model, ...q.confidence, samples: q.total_trials, qualification_digest: q.target_digest };
 });
 return freeze({ protocol: 1, cohort, domain: 'coding', task_class: TASK_CLASS_SUITE.task_class, benchmark: TASK_CLASS_SUITE.benchmark, revision: TASK_CLASS_SUITE.revision, observed_at: new Date(ms).toISOString(), expires_at: new Date(Math.min(...qualifications.map(q => Date.parse(q.expires_at)))).toISOString(), rows, strength_scope: 'task-class-only', protected_role_blocker: 'architectural-coordination-review-calibration-unavailable' });
}
