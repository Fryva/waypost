// waypost — scripts/team-native-work.mjs
// Protocol 2 work, slice 1 (owner decisions 2026-10-06): an owner-written work
// manifest, an owner work ceiling and an owner cancel. The acknowledged leader is
// the only executor (`leader-baseline`, recorded as unqualified), one unfinished
// work at a time, and nothing here calls a model or grants a protected role.
import { routingDigest } from './model-routing.mjs';
import { selectNativeQuotaFrontier } from './team-native-quota.mjs';

const clone = structuredClone;
function fail(message) { throw new Error(message); }
function integer(value) { if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,17})$/.test(value)) fail('native-work-token-count-required'); return BigInt(value); }
function keys(c, extra) { if (Object.keys(c).some(k => !['type', 'team', 'actor', 'at', 'request_key', 'incarnation', 'epoch', ...extra].includes(k))) fail('native-work-command-fields-required'); }
function exact(value, keys) { if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail('native-work-exact-object-required'); return value; }
function text(value, max) { if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b-\x1f]/.test(value)) fail('native-work-bounded-text-required'); return value; }
const terminal = w => ['integrated', 'cancelled'].includes(w.status);

export const WORK_LABEL = 'unqualified-strongest-baseline';
// Relative, normalised paths inside the project; no Git metadata, no case-insensitive duplicates.
export function workPaths(values) {
  if (!Array.isArray(values) || !values.length || values.length > 64) fail('native-work-paths-required');
  const seen = new Set();
  for (const p of values) {
    if (typeof p !== 'string' || !p || p.length > 1024 || p !== p.normalize('NFC') || p.startsWith('/') || /[\\\0\r\n:*?\[\]]/.test(p) || p.split('/').some(s => !s || s === '.' || s === '..' || s.toLowerCase() === '.git')) fail('native-work-invalid-path');
    const key = p.toLowerCase(); if (seen.has(key)) fail('native-work-path-collision'); seen.add(key);
  }
  return [...values].sort();
}
export function workManifestDigest(manifest) { return routingDigest({ revision: 1, manifest }); }

function unfinishedWork(t) { return Object.values(t.work || {}).filter(w => w.protocol === 2 && !terminal(w)); }
// The leader may act only while the team is active under a current policy and,
// re-selected read-only at this time (leases and admissions lapse with the
// clock), is still the coordinator with an independent critic available.
export function activeNativeLeader(t, now) {
  if (t.policy?.protocol !== 2 || t.status !== 'active' || !t.leader || !(Date.parse(t.policy.expires_at) > now)) fail('native-work-active-leader-required');
  if (t.native_quota_freeze || t.handover || t.native_protocol_handover && t.native_protocol_handover.state !== 'applied') fail('native-work-quota-handover-pending');
  const frontier = selectNativeQuotaFrontier(t, now);
  if (t.review_blocker || frontier.blocker || frontier.candidate !== t.leader || !frontier.reviewer) fail('native-work-active-leader-required');
  return t.participants[t.leader];
}
export function currentWorkPolicy(t, now) {
  const p = t.native_work_policy;
  if (!p || !(Date.parse(p.expires_at) > now) || Date.parse(p.expires_at) > Date.parse(t.policy.expires_at)) fail('native-work-owner-ceiling-required');
  return p;
}
// An unresolved negative leadership audit of the current acknowledgement blocks new work.
function negativeAuditOfCurrentAck(s, t) {
  const acks = new Set(Object.values(s.subscription_invocations || {}).filter(x => x.team === t.id && ((x.action_ack && x.action_ack.leader === t.leader && x.action_ack.epoch === t.epoch) || (x.protocol_handover_ack && x.protocol_handover_ack.leader === t.leader && x.protocol_handover_ack.epoch === t.epoch))).map(x => x.id));
  return Object.values(t.native_protocol_reviews || {}).some(a => a.unresolved_negative && a.records.some(r => acks.has(r.source_invocation_id)));
}

export function applyNativeWork(s, t, c, now, H) {
  if (!['native-work-enable-v2', 'native-work-manifest-v2', 'native-work-cancel-v2'].includes(c.type)) return null;
  H.owner(s, c);
  keys(c, c.type === 'native-work-enable-v2' ? ['revision', 'policy'] : c.type === 'native-work-manifest-v2' ? ['work_id', 'manifest'] : ['work_id', 'reason']);
  if (t.policy?.protocol !== 2 || t.accounting?.protocol !== 2 || t.accounting.billing_policy !== 'inherited-native') fail('native-work-protocol-2-subscription-required');
  let result;
  if (c.type === 'native-work-enable-v2') {
    const policy = exact(c.policy, ['kind', 'executor', 'allow_unknown_quota', 'max_attempts', 'timeout_ms', 'expires_at', 'ceilings', 'unit_allocations']);
    if (policy.executor === 'calibrated-bounded-edit') fail('native-work-implementation-coverage-required');
    if (policy.kind !== 'protocol-work' || policy.executor !== 'leader-baseline' || typeof policy.allow_unknown_quota !== 'boolean' || !Number.isSafeInteger(policy.max_attempts) || policy.max_attempts < 1 || policy.max_attempts > 8 || !Number.isSafeInteger(policy.timeout_ms) || policy.timeout_ms < 100 || policy.timeout_ms > 300000 || typeof policy.expires_at !== 'string' || !Number.isFinite(Date.parse(policy.expires_at)) || Date.parse(policy.expires_at) <= now || Date.parse(policy.expires_at) > Date.parse(t.policy.expires_at) || !Number.isSafeInteger(c.revision) || c.revision < 1 || c.revision <= (t.native_work_policy?.revision || 0)) fail('bounded-owner-work-ceiling-required');
    exact(policy.ceilings, ['execution', 'review']);
    for (const kind of ['execution', 'review']) { const k = exact(policy.ceilings[kind], ['max_calls', 'max_estimate_tokens']); if (!Number.isSafeInteger(k.max_calls) || k.max_calls < 1 || k.max_calls > 64 || integer(k.max_estimate_tokens) <= 0n) fail('bounded-owner-work-ceiling-required'); }
    if (!Array.isArray(policy.unit_allocations) || !policy.unit_allocations.length || policy.unit_allocations.length > 128 || new Set(policy.unit_allocations.map(u => u.unit_digest)).size !== policy.unit_allocations.length) fail('bounded-owner-work-ceiling-required');
    for (const u of policy.unit_allocations) { exact(u, ['unit_digest', 'max_tokens', 'allocation_revision']); const allocation = s.subscription_allocations?.[u.unit_digest]; if (allocation?.protocol !== 2 || allocation.unit_scope?.team !== t.id || allocation.revision !== u.allocation_revision || integer(u.max_tokens) <= 0n || integer(u.max_tokens) > integer(allocation.max_tokens)) fail('existing-work-unit-allocation-required'); }
    if (unfinishedWork(t).length) fail('native-work-unfinished-policy-migration');
    t.native_work_policy = { ...clone(policy), protocol: 2, revision: c.revision, enabled_at: c.at };
    result = { enabled: true, revision: c.revision, protected_actions_granted: false };
  } else if (c.type === 'native-work-manifest-v2') {
    const workId = c.work_id; if (typeof workId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(workId)) fail('native-work-invalid-id');
    if (t.work?.[workId]) fail('native-work-already-exists');
    const manifest = exact(c.manifest, ['protocol', 'goal', 'criteria', 'criteria_digest', 'paths', 'base', 'forbidden_actions']);
    if (Buffer.byteLength(JSON.stringify(manifest)) > 32768) fail('native-work-manifest-too-large');
    if (manifest.protocol !== 2) fail('native-work-manifest-protocol-required');
    text(manifest.goal, 4000);
    if (!Array.isArray(manifest.criteria) || !manifest.criteria.length || manifest.criteria.length > 64) fail('native-work-criteria-required');
    manifest.criteria.forEach(x => text(x, 1000));
    if (manifest.criteria_digest !== routingDigest(manifest.criteria)) fail('native-work-criteria-digest-required');
    if (typeof manifest.base !== 'string' || !/^[a-f0-9]{40,64}$/.test(manifest.base)) fail('native-work-base-commit-required');
    if (!Array.isArray(manifest.forbidden_actions) || manifest.forbidden_actions.length > 32) fail('native-work-forbidden-actions-required');
    manifest.forbidden_actions.forEach(x => text(x, 500));
    const paths = workPaths(manifest.paths);
    const policy = currentWorkPolicy(t, now), leader = activeNativeLeader(t, now);
    if (leader.harness === 'codex') fail('native-work-no-tools-context-required');
    if (unfinishedWork(t).length) fail('native-work-one-at-a-time');
    if (negativeAuditOfCurrentAck(s, t)) fail('native-work-unresolved-negative-leadership-audit');
    t.work ||= {};
    t.work[workId] = { protocol: 2, id: workId, manifest: clone(manifest), manifest_digest: workManifestDigest(manifest), paths, generation: 1, attempts: 0, epoch: t.epoch, worker: t.leader, worker_incarnation: leader.incarnation, worker_model_revision: leader.model?.model_revision ?? null, worker_identity: clone(leader.native_admission?.identity ?? null), policy_revision: t.policy.revision, status: 'manifest', label: WORK_LABEL, work_policy_revision: policy.revision, created_at: c.at };
    result = { work: workId, manifest_digest: t.work[workId].manifest_digest, worker: t.leader, label: WORK_LABEL, protected_actions_granted: false };
  } else {
    const w = t.work?.[c.work_id];
    if (!w || w.protocol !== 2 || terminal(w)) fail('native-work-unfinished-work-required');
    text(c.reason, 500);
    // A consumed or uncertain call for this work needs its reconciled closure first.
    if (Object.values(s.subscription_invocations || {}).some(x => x.team === t.id && x.work?.work_id === w.id && ['consumed', 'uncertain'].includes(x.state))) fail('native-work-cancel-reconciled-closure-required');
    w.status = 'cancelled'; w.cancelled_at = c.at; w.cancel_reason = c.reason;
    result = { cancelled: w.id, protected_actions_granted: false };
  }
  return { handled: true, result };
}
