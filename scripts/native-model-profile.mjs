// Additive native-configuration evidence. No inference, JSON importer, scores or
// authorization: only an installed host's lookup of an already budgeted receipt.
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

const minted = new WeakMap();
const TTL = 15 * 60 * 1000;
const fail = code => { throw new Error('native-profile-' + code); };
const text = (value,max=256) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const known = value => text(value) && value !== 'unknown';
const clock = now => { const ms = typeof now === 'function' ? now() : now; if (!Number.isSafeInteger(ms) || ms < 0 || ms > 8640000000000000 - TTL) fail('clock-required'); return ms; };
function canonical(value, depth=0, budget={nodes:0}) {
  if (depth > 16 || ++budget.nodes > 4096) fail('structure-budget');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string' && value.length <= 8192 && !value.includes('\0')) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value) && value.length <= 256) return value.map(v=>canonical(v,depth+1,budget));
  if (value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length <= 256) {
    return Object.fromEntries(Object.keys(value).sort().map(key=>{
      if (!text(key,256)) fail('invalid-structure');
      return [key,canonical(value[key],depth+1,budget)];
    }));
  }
  fail('invalid-structure');
}
function boundedObject(value,max=16384) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('object-required');
  const copy = canonical(value);
  if (Buffer.byteLength(JSON.stringify(copy)) > max) fail('structure-budget');
  return copy;
}
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function freeze(value) { if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); Object.freeze(value); } return value; }
function participantBinding(participant) {
  if (!text(participant?.id) || !text(participant?.incarnation) || !Number.isSafeInteger(participant.model?.model_revision) || participant.model.model_revision < 1) fail('participant-required');
  return {participant:participant.id,incarnation:participant.incarnation,model_revision:participant.model.model_revision};
}
function receiptContext(result) {
  const ctx = boundedObject(result.context_manifest,8192);
  if (!text(result.native_id) || !text(ctx.id) || ctx.native_id !== result.native_id || !text(ctx.harness,128) || !text(ctx.cwd,4096) || !isAbsolute(ctx.cwd)) fail('native-context-binding-required');
  if (ctx.provenance !== 'adapter-isolated' || ctx.read_only !== true || ctx.fresh !== true || ctx.fresh_review_verified !== true || ctx.author_history_inherited !== false || !['read-only','worktree'].includes(ctx.isolation) || !Array.isArray(ctx.tools) || ctx.tools.length || !Array.isArray(ctx.author_contexts) || ctx.author_contexts.length) fail('isolated-empty-author-context-required');
  return ctx;
}

export async function collectNativeModelProfile({participant,observe,adapter_revision,requested_configuration,execution_environment,now=Date.now}={}) {
  const binding = participantBinding(participant);
  if (typeof observe !== 'function') fail('trusted-observer-required');
  if (!text(adapter_revision,128)) fail('adapter-revision-required');
  // These two values come from the trusted host, not participant configuration.
  // Only digests are retained; neither requests nor environment prove effectiveness.
  const requested = boundedObject(requested_configuration), environment = boundedObject(execution_environment);
  const result = boundedObject(await observe(Object.freeze({...binding})),32768);
  const ctx = receiptContext(result), correlation = boundedObject(result.correlation,4096);
  const expected = {...binding,native_id:result.native_id,context_id:ctx.id};
  if (Object.entries(expected).some(([key,value])=>correlation[key] !== value) || !text(correlation.nonce,128) || !text(correlation.invocation_id,128) || result.invocation_id !== correlation.invocation_id) fail('observation-binding-mismatch');
  if ((result.text !== undefined && typeof result.text !== 'string') || (result.output !== undefined && typeof result.output !== 'string') || (result.text !== undefined && result.output !== undefined && result.text !== result.output) || typeof (result.output ?? result.text) !== 'string' || (result.output ?? result.text).trim() !== correlation.nonce) fail('nonce-receipt-mismatch');
  const ms = clock(now), observed = Date.parse(result.observed_at);
  if (!text(result.observed_at,64) || !Number.isFinite(observed) || observed > ms || ms - observed > 30000 || (result.actualModel?.observed_at !== undefined && Date.parse(result.actualModel.observed_at) !== observed)) fail('stale-or-clock-mismatch');
  const actual = result.actualModel;
  if (!known(actual?.provider) || !known(actual?.model_id)) fail('native-route-model-required');
  const routeOnly = ctx.model_provider_is_billing_route === true || actual.provider_kind === 'billing-route';
  const effective_reasoning = !routeOnly && known(actual.reasoning) ? actual.reasoning : 'unknown';
  const version = ctx.version_provenance === 'native-health' && known(ctx.version) ? ctx.version : 'unknown';
  const profile = {
    identity_kind:'native-configuration',revision:1,harness:ctx.harness,
    version,version_provenance:version === 'unknown' ? 'unknown' : 'native-health',adapter_revision,
    native_routing_id:actual.provider,native_model_id:actual.model_id,
    requested_configuration_digest:digest(requested),
    observed:{effective_reasoning,backend_author:'unknown',native_variant:routeOnly && known(actual.reasoning) ? actual.reasoning : 'unknown'},
    execution_scope:{cwd:ctx.cwd,isolation:ctx.isolation,read_only:true,tools:[],
      permissions:{rules_digest:typeof ctx.rules_digest === 'string' && /^[a-f0-9]{64}$/.test(ctx.rules_digest) ? ctx.rules_digest : null,read_only_evidence:text(ctx.read_only_evidence,256) ? ctx.read_only_evidence : 'unknown'},
      context:{fresh:true,author_history_inherited:false,initial_instructions_digest:typeof ctx.initial_instructions_digest === 'string' && /^[a-f0-9]{64}$/.test(ctx.initial_instructions_digest) ? ctx.initial_instructions_digest : null},
      environment_digest:digest(environment)}
  };
  const profile_digest = digest(profile);
  const observation = {
    protocol:2,identity_kind:'native-configuration',profile_id:'native-profile-'+profile_digest,profile_digest,profile,
    ...binding,native_id:result.native_id,context_id:ctx.id,nonce:correlation.nonce,invocation_id:correlation.invocation_id,
    observed_at:new Date(observed).toISOString(),expires_at:new Date(observed+TTL).toISOString(),
    receipt_digest:digest({invocation_id:result.invocation_id,output:result.output ?? result.text,actualModel:actual,context_manifest:ctx}),
    provenance:'trusted-host-budgeted-native-receipt',roles:[],rank_eligible:false,
    limitations:['Observed native configuration is not proof of a stable hidden backend, effective requested settings, authored model, billing or role qualification.']
  };
  observation.observation_id='native-observation-'+digest(observation);
  freeze(observation);
  minted.set(observation,digest(observation));
  return observation;
}

export function verifyNativeModelProfile(observation,{participant,invocation_id,nonce,native_id,context_id,now=Date.now}={}) {
  if (!minted.has(observation) || minted.get(observation) !== digest(observation)) fail('collector-provenance-required');
  const ms=clock(now), from=Date.parse(observation.observed_at), to=Date.parse(observation.expires_at);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > ms || to <= ms || to <= from || to-from > TTL) fail('observation-expired');
  if (participant && Object.entries(participantBinding(participant)).some(([key,value])=>observation[key] !== value)) fail('observation-binding-mismatch');
  for (const [key,value] of Object.entries({invocation_id,nonce,native_id,context_id})) if (value !== undefined && observation[key] !== value) fail('observation-binding-mismatch');
  return true;
}

// Serialization preserves timestamps and is an audit snapshot, not a trust
// importer. The detached result cannot pass verification or be serialized again.
export function serializeNativeModelProfile(observation,options={}) {
  verifyNativeModelProfile(observation,options);
  return structuredClone(observation);
}
