// Pure task-aware proposals. Only a trusted collector can supply the evidence
// map; the CLI never imports participant-supplied qualification or price JSON.
// A proposal is not an invocation grant or proof of runtime budget enforcement.
import { createHash } from 'node:crypto';
import { rankParticipant, validatePolicy } from './team.mjs';
const RISKS = ['architecture', 'security', 'migration', 'publication', 'data_loss'];
function fail(code) { throw new Error(code); }
function str(x, name, max = 256) { if (typeof x !== 'string' || !x || x.length > max || /[\x00-\x1f]/.test(x)) fail('routing-invalid-' + name); return x; }
function count(x, name, max = 10000000) { if (!Number.isSafeInteger(x) || x < 0 || x > max) fail('routing-invalid-' + name); return x; }
function money(x) { if (typeof x !== 'string' || !/^(0|[1-9][0-9]{0,17})$/.test(x)) fail('routing-integer-money-required'); return BigInt(x); }
function stable(x) { if (Array.isArray(x)) return '[' + x.map(stable).join(',') + ']'; if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + stable(x[k])).join(',') + '}'; return JSON.stringify(x); }
const digest = x => createHash('sha256').update(stable(x)).digest('hex');
export function validateManifest(raw) {
 const m = structuredClone(raw);
 if (!m || m.protocol !== 1 || Buffer.byteLength(JSON.stringify(m)) > 32768) fail('routing-manifest-protocol-or-budget');
 for (const name of ['goal', 'base', 'domain', 'task_class']) str(m[name], name, name === 'goal' ? 8192 : 256);
 if (!/^[a-f0-9]{64}$/.test(m.criteria_digest || '')) fail('routing-criteria-digest-required');
 if (!Array.isArray(m.paths) || !m.paths.length || m.paths.length > 128 || m.paths.some(p => typeof p !== 'string' || !p || p.length > 4096 || p.startsWith('/') || /^[a-z]:/i.test(p) || p.split('/').some(x => !x || x === '.' || x === '..') || p.split('/')[0] === '.git' || /[\\\x00-\x1f*?]/.test(p))) fail('routing-concrete-scope-required');
 if (!Array.isArray(m.tools) || m.tools.length > 32 || m.tools.some(t => typeof t !== 'string' || !t || t.length > 128)) fail('routing-tools-required');
 if (!['worktree', 'read-only'].includes(m.isolation)) fail('routing-isolation-required');
 count(m.input_tokens, 'input-tokens'); count(m.output_tokens, 'output-tokens'); count(m.attempts, 'attempts', 4); if (!m.attempts) fail('routing-attempt-ceiling-required');
 str(m.budget?.currency, 'currency', 16); money(m.budget.max_units); money(m.budget.reserved_control_units);
 str(m.capability?.benchmark, 'benchmark'); str(m.capability?.revision, 'benchmark-revision');
 if (!/^[a-f0-9]{64}$/.test(m.capability?.criteria_digest || '')) fail('routing-capability-criteria-required');
 count(m.capability?.min_passes, 'capability-floor'); if (!m.capability.min_passes) fail('routing-capability-floor-required');
 if (!m.safety || typeof m.safety !== 'object') fail('routing-safety-required');
 return m;
}
export function classifyTask(raw, { policy_revision = 1 } = {}) {
 const manifest = validateManifest(raw);
 count(policy_revision, 'classifier-revision'); if (!policy_revision) fail('routing-classifier-revision-required');
 const reasons = [];
 if (manifest.safety.bounded !== true) reasons.push('scope-not-proven-bounded');
 if (manifest.safety.reversible !== true) reasons.push('reversibility-not-proven');
 for (const risk of RISKS) if (manifest.safety[risk] !== false) reasons.push('risk-or-unknown:' + risk);
 for (const key of Object.keys(manifest.safety)) if (!['bounded','reversible',...RISKS].includes(key)) reasons.push('unrecognized-risk:' + key);
 const complexity = reasons.length ? 'complex' : 'routine';
 return { protocol: 1, complexity, reasons, manifest_digest: digest(manifest), cache_key: digest({ manifest, policy_revision, capability: manifest.capability }), policy_revision };
}
function fresh(evidence, now, ttl) {
 const from = Date.parse(evidence?.observed_at), until = Date.parse(evidence?.expires_at);
 return Number.isFinite(from) && Number.isFinite(until) && from <= now && until > now && until > from && until - from <= ttl && typeof evidence.source === 'string' && Boolean(evidence.source);
}
const modelKey = m => JSON.stringify([m.provider, m.model_id, m.reasoning]);
function ceiling(tokens, rate) { return (BigInt(tokens) * money(rate) + 999999n) / 1000000n; }
export function proposeModelRoute({ manifest: raw, participants, policy, verifiedEvidence = new Map(), now = Date.now(), classifier_revision = 1 } = {}) {
 const manifest = validateManifest(raw), classification = classifyTask(manifest, { policy_revision: classifier_revision });
 policy = validatePolicy(policy);
 if (!Number.isFinite(now) || !Array.isArray(participants) || participants.length > 1024 || !(verifiedEvidence instanceof Map)) fail('routing-invalid-input');
 if (policy.domain !== manifest.domain) fail('routing-task-domain-mismatch');
 const blockers = [], eligible = [], evidenceFingerprints = [], evidenceExpirations = [];
 for (const p of participants) {
  try {
  str(p?.id, 'participant-id', 128);
  const reasons = [], rank = rankParticipant(p, policy, 'implement', { now });
  if (rank === null || p.revoked || p.availability !== 'ready') reasons.push('model-unqualified-or-unavailable');
  const e = verifiedEvidence.get(p.id);
  if (!e) reasons.push('trusted-collectors-unavailable');
  else {
   if (typeof e !== 'object' || Array.isArray(e) || Buffer.byteLength(JSON.stringify(e)) > 65536) fail('routing-collector-record-budget');
   evidenceFingerprints.push([p.id, digest(e)]);
   for (const kind of ['identity','qualification','price','quota','liability']) evidenceExpirations.push(Date.parse(e[kind]?.expires_at));
   if (e.participant !== p.id || e.incarnation !== p.incarnation || e.model_revision !== p.model?.model_revision || modelKey(e.model || {}) !== modelKey(p.model || {})) reasons.push('execution-identity-mismatch');
   if (!fresh(e.identity, now, 900000)) reasons.push('execution-identity-stale-or-unknown');
   const q = e.qualification;
   if (!fresh(q, now, 604800000) || q.task_class !== manifest.task_class || q.domain !== manifest.domain || q.benchmark !== manifest.capability.benchmark || q.revision !== manifest.capability.revision || q.criteria_digest !== manifest.capability.criteria_digest || !Number.isSafeInteger(q.total_trials) || !Number.isSafeInteger(q.passes) || q.passes > q.total_trials || q.passes < manifest.capability.min_passes) reasons.push('task-class-qualification-missing');
   if (!e.route?.endpoint || !e.route.account || !e.route.sku || !e.route.mode || !e.route.pool || modelKey(e.route.model || {}) !== modelKey(p.model || {})) reasons.push('billing-route-mismatch');
   if (!fresh(e.price, now, 86400000) || e.price.currency !== manifest.budget.currency || e.price.route_digest !== digest(e.route)) reasons.push('price-stale-unknown-or-route-mismatch');
   if (!fresh(e.quota, now, 60000) || e.quota.pool !== e.route?.pool || !Number.isSafeInteger(e.quota.available_calls) || e.quota.available_calls < manifest.attempts) reasons.push('shared-quota-unavailable');
   if (!Array.isArray(e.tools) || e.tools.length > 32 || e.tools.some(t => typeof t !== 'string') || manifest.tools.some(t => !e.tools.includes(t)) || e.isolation !== manifest.isolation) reasons.push('tools-or-isolation-unavailable');
   if (!fresh(e.liability, now, 60000) || e.liability.route_digest !== digest(e.route) || e.liability.all_charges_bounded !== true) reasons.push('maximum-liability-unproven');
  }
  if (reasons.length) { blockers.push({ participant: p.id, reasons }); continue; }
  try {
   const estimate = ceiling(manifest.input_tokens, e.price.input_units_per_million) + ceiling(manifest.output_tokens, e.price.output_units_per_million) + money(e.price.tool_max_units);
   const liability = money(e.liability.max_units_per_attempt);
   if (liability < estimate) { blockers.push({ participant: p.id, reasons: ['liability-below-estimated-charges'] }); continue; }
   const total = liability * BigInt(manifest.attempts) + money(manifest.budget.reserved_control_units);
   eligible.push({ participant: p.id, incarnation: p.incarnation, model_revision: p.model.model_revision, rank, total, route_digest: digest(e.route), evidence_digest: digest(e) });
  } catch { blockers.push({ participant: p.id, reasons: ['invalid-price-or-liability-units'] }); }
  } catch { blockers.push({ participant: typeof p?.id === 'string' ? p.id : '(invalid)', reasons: ['malformed-collector-or-participant-record'] }); }
 }
 // Determine the strongest capability cohort before filtering by cost. A cheap
 // weaker candidate cannot become "strongest" because the top is over budget.
 const strongest = Math.max(-1, ...participants.filter(p => p && !p.revoked && p.availability !== 'left').map(p => rankParticipant(p, policy, 'implement', { now }) ?? -1));
 const cohort = eligible.filter(x => classification.complexity === 'routine' || x.rank === strongest);
 const affordable = cohort.filter(x => x.total <= money(manifest.budget.max_units));
 for (const x of cohort.filter(x => x.total > money(manifest.budget.max_units))) blockers.push({ participant: x.participant, reasons: ['full-cycle-budget-insufficient'] });
 affordable.sort((a,b) => a.total < b.total ? -1 : a.total > b.total ? 1 : b.rank - a.rank || a.participant.localeCompare(b.participant));
 const choice = affordable[0];
 evidenceFingerprints.sort((a,b) => a[0].localeCompare(b[0]));
 classification.cache_key = digest({ manifest_key: classification.cache_key, policy_revision: policy.revision, evidence: evidenceFingerprints });
 classification.evidence_expires_at = new Date(Math.min(now + 60000, ...evidenceExpirations.map(t => Number.isFinite(t) ? t : now), policy.mode === 'automatic' ? Date.parse(policy.expires_at) : now + 60000)).toISOString();
 return { protocol: 1, proposal_only: true, classification, choice: choice ? { ...choice, total: choice.total.toString() } : null, blockers, dispatch_blocker: 'trusted-invocation-reservation-and-collector-not-installed' };
}
export { digest as routingDigest };
