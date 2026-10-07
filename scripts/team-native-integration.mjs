// waypost — scripts/team-native-integration.mjs
// Protocol 2 publication (contract 32, slice 1, with the spec 6.4 amendment for
// leader-baseline work): the trusted Host on the acknowledged leader's endpoint
// publishes an approved candidate as one commit on the private ref of the work's
// dedicated checkout, by compare-and-swap from the base to a commit id pinned in
// the reservation. No model touches Git; the owner merges the ref. Protocol 1's
// fence and deferral apply; nothing here grants a protected role.
import { routingDigest } from './model-routing.mjs';
import { rankParticipant } from './team.mjs';
import { nativeParticipantQuotaEligible } from './team-native-quota.mjs';
import { activeNativeLeader, negativeAuditOfCurrentAck, WORK_TESTS_NOT_RUN_DIGEST, WORK_LABEL } from './team-native-work.mjs';
import { WORK_REVIEW_KIND, workReviewTarget, selectWorkReviewer } from './team-native-work-review.mjs';

const clone = structuredClone;
function fail(message) { throw new Error(message); }
function keys(c, extra) { if (Object.keys(c).some(k => !['type', 'team', 'actor', 'at', 'request_key', 'incarnation', 'epoch', ...extra].includes(k))) fail('native-integration-command-fields-required'); }
const same = (a, b) => routingDigest(a) === routingDigest(b);
const settledStates = ['settled', 'aborted', 'reconciled'];
const RESERVATION_KEYS = ['id', 'work_id', 'generation', 'base', 'tree', 'paths', 'candidate_digest', 'manifest_digest', 'criteria_digest', 'target_digest', 'tests_digest', 'tests_status', 'reviews', 'reviewer', 'label', 'checkout_ref', 'commit', 'commit_message_digest', 'commit_identity', 'collector'];
export const NATIVE_INTEGRATION_EVENTS = ['native-integration-prepare-v2', 'native-integration-start-v2', 'native-integration-ack-v2', 'native-integration-reconcile-v2', 'native-integration-abort-v2'];
const open = x => x && !['acknowledged', 'aborted'].includes(x.state);
export function nativeIntegrationOpen(t) { return open(t.native_integration); }

// The approval that admits publication, recomputed at this time: the leader is
// still active and acknowledged, no call for the work is unresolved, the work's
// current target has approvals and no negative, and the approving critic is
// still bound, at or above the floor, under the calibrated profile it reviewed
// with, and not outranked by a now stronger independent critic.
export function nativePublicationGate(s, t, w, now) {
  activeNativeLeader(t, now);
  if (negativeAuditOfCurrentAck(s, t)) fail('native-work-negative-leadership-audit');
  if (!w || w.protocol !== 2 || w.status !== 'approved' || !w.result) fail('native-integration-approved-work-required');
  if (Object.values(s.subscription_invocations || {}).some(x => x.team === t.id && (x.work?.work_id === w.id || x.action?.kind === WORK_REVIEW_KIND && x.action.request.target.work_id === w.id) && !settledStates.includes(x.state))) fail('native-integration-unresolved-call');
  const target = workReviewTarget(w), target_digest = routingDigest(target), aggregate = t.native_work_reviews?.[target_digest];
  const approvals = (aggregate?.records || []).filter(r => r.verdict === 'approve' && r.generation === w.generation && r.epoch === t.epoch && r.policy_revision === t.policy.revision);
  if (!aggregate || aggregate.unresolved_negative || !approvals.length) fail('native-integration-current-approval-required');
  const r = approvals.at(-1), p = t.participants[r.participant];
  if (!p || p.revoked || p.availability === 'left' || p.incarnation !== r.incarnation || p.model?.model_revision !== r.model_revision || p.native_binding?.descriptor_digest !== r.descriptor_digest) fail('native-integration-approving-critic-changed');
  // A lapsed lease is named: a live critic lease (or `team watch`) is needed to publish.
  if (!nativeParticipantQuotaEligible(p, now)) fail('native-integration-approving-critic-quota-ineligible');
  const rank = rankParticipant(p, t.policy, 'review', { coverage: 'waypost-protocol-review', now });
  const profile = t.policy.profiles.find(x => x.identity.profile_id === p.native_admission?.identity?.profile_id);
  if (rank === null || !Number.isSafeInteger(t.review_floor) || rank < t.review_floor || r.review_floor < t.review_floor || !profile || !same(profile.identity, r.profile) || routingDigest(profile.calibration.review) !== r.calibration_digest) fail('native-integration-approving-critic-changed');
  const strongest = selectWorkReviewer(t, w, now);
  if (!strongest) fail('native-work-strongest-independent-review-unavailable');
  if (rankParticipant(strongest, t.policy, 'review', { coverage: 'waypost-protocol-review', now }) > rank) fail('native-integration-stronger-review-required');
  return { generation: w.generation, base: w.result.base, tree: w.result.tree, paths: [...w.result.paths], candidate_digest: w.result.candidate_digest, manifest_digest: w.manifest_digest, criteria_digest: w.manifest.criteria_digest, target_digest, tests_digest: w.result.tests_digest, tests_status: w.result.tests_status, reviews: approvals.map(a => a.invocation_id), reviewer: { participant: r.participant, incarnation: r.incarnation, profile: clone(r.profile), calibration_digest: r.calibration_digest }, label: WORK_LABEL, collector: 'collector:' + t.participants[t.leader].native_binding.collector_id };
}
function reservation(s, t, value, now) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...RESERVATION_KEYS].sort()) || Buffer.byteLength(JSON.stringify(value)) > 32768) fail('native-integration-reservation-fields-required');
  if (typeof value.id !== 'string' || !/^native-integration-[a-f0-9-]{36}$/.test(value.id)) fail('native-integration-reservation-id-required');
  const w = t.work?.[value.work_id], gate = nativePublicationGate(s, t, w, now);
  if (Object.keys(gate).some(k => !same(gate[k], value[k]))) fail('native-integration-reservation-mismatch');
  const escaped = [t.id, w.id].map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const identity = value.commit_identity;
  if (!new RegExp(`^refs/waypost/teams/${escaped[0]}/${escaped[1]}/[a-f0-9]{16}$`).test(value.checkout_ref) || !/^[a-f0-9]{40,64}$/.test(value.commit) || value.commit === value.base || !/^[a-f0-9]{64}$/.test(value.commit_message_digest) || !identity || typeof identity !== 'object' || JSON.stringify(Object.keys(identity).sort()) !== '["date","email","name"]' || [identity.name, identity.email, identity.date].some(v => typeof v !== 'string') || !/^[^\r\n<>]{1,200}$/.test(identity.name) || !/^[^\s<>]{1,200}@[^\s<>]{1,200}$/.test(identity.email) || !/^\d{10} \+0000$/.test(identity.date)) fail('native-integration-publication-binding-required');
  return w;
}

export function applyNativeIntegration(s, t, c, now, H) {
  if (!NATIVE_INTEGRATION_EVENTS.includes(c.type)) return null;
  if (t.policy?.protocol !== 2 || t.accounting?.protocol !== 2) fail('native-integration-protocol-2-required');
  const x = t.native_integration; let result;
  if (c.type === 'native-integration-prepare-v2') {
    H.owner(s, c); keys(c, ['reservation']);
    if (open(x)) fail('native-integration-already-reserved');
    const w = reservation(s, t, c.reservation, now);
    t.native_integration = { protocol: 2, ...clone(c.reservation), state: 'prepared', epoch: t.epoch, policy_revision: t.policy.revision, quota_revision: t.quota_revision || 0, prepared_at: c.at };
    result = { reservation: c.reservation.id, work: w.id, commit: c.reservation.commit, protected_actions_granted: false };
  } else if (c.type === 'native-integration-start-v2') {
    H.owner(s, c); keys(c, ['reservation_id']);
    if (!x || x.state !== 'prepared' || x.id !== c.reservation_id) fail('native-integration-prepared-reservation-required');
    const { protocol, state, epoch, policy_revision, quota_revision, prepared_at, ...pinned } = x;
    reservation(s, t, pinned, now);
    if (epoch !== t.epoch || policy_revision !== t.policy.revision || quota_revision !== (t.quota_revision || 0)) fail('native-integration-approval-changed');
    if (s.publication_fence) fail('project-publication-in-progress');
    x.state = 'publishing'; x.started_at = c.at; s.publication_fence = { team: t.id, reservation: x.id, work: x.work_id, protocol: 2 };
    result = { publishing: x.id, protected_actions_granted: false };
  } else if (c.type === 'native-integration-abort-v2') {
    H.owner(s, c); keys(c, ['reservation_id']);
    if (!x || x.id !== c.reservation_id) fail('native-integration-reservation-required');
    if (x.state !== 'prepared') fail(x.state === 'publishing' ? 'native-integration-reconciliation-required' : 'native-integration-reservation-closed');
    x.state = 'aborted'; x.aborted_at = c.at; result = { aborted: x.id };
  } else {
    // Receipts come only from the leader's bound collector pinned at prepare, while the fence holds.
    const registered = s.collectors?.[c.actor?.replace(/^collector:/, '')];
    if (!x || c.actor !== x.collector || !registered || registered.revoked || registered.team !== t.id) fail('native-integration-bound-collector-required');
    if (!x || x.state !== 'publishing' || s.publication_fence?.reservation !== x.id) fail('native-integration-publishing-reservation-required');
    if (c.type === 'native-integration-ack-v2') {
      keys(c, ['reservation_id', 'commit', 'ref']);
      if (c.reservation_id !== x.id || c.commit !== x.commit || c.ref !== x.checkout_ref) fail('native-integration-receipt-mismatch');
      const w = t.work[x.work_id];
      x.state = 'acknowledged'; x.acknowledged_at = c.at; w.status = 'integrated'; w.commit = x.commit;
      w.integrated_evidence = { protocol: 2, reservation: x.id, reviews: [...x.reviews], reviewer: clone(x.reviewer), label: x.label, epoch: x.epoch, generation: x.generation, policy_revision: x.policy_revision, manifest_digest: x.manifest_digest, criteria_digest: x.criteria_digest, candidate_digest: x.candidate_digest, target_digest: x.target_digest, tests_digest: x.tests_digest, tests_status: x.tests_status, tree: x.tree, base: x.base, commit: x.commit, ref: x.checkout_ref, commit_message_digest: x.commit_message_digest, accepted_at: c.at };
      delete s.publication_fence;
      result = { integrated: w.id, commit: x.commit, ref: x.checkout_ref, pending_deferred: (s.deferred_commands || []).length, protected_actions_granted: false };
    } else {
      keys(c, ['reservation_id', 'git_child_stopped', 'ref_at_base', 'evidence_digest']);
      if (c.reservation_id !== x.id || c.git_child_stopped !== true || c.ref_at_base !== true || !/^[a-f0-9]{64}$/.test(c.evidence_digest || '')) fail('native-integration-stopped-unchanged-proof-required');
      x.state = 'aborted'; x.recovery_digest = c.evidence_digest; x.aborted_at = c.at; delete s.publication_fence;
      result = { aborted: x.id, pending_deferred: (s.deferred_commands || []).length };
    }
  }
  return { handled: true, result };
}

// close-v1 accepts protocol 2 integrated work only with its own evidence: the
// commit, tree and digests it was approved and published with, tests recorded as
// not run, and approvals that still stand with no negative for that target.
export function nativeIntegratedEvidenceValid(t, w) {
  const e = w.integrated_evidence, aggregate = e && t.native_work_reviews?.[e.target_digest];
  return !!(e && e.protocol === 2 && w.commit && e.commit === w.commit && e.tree === w.result?.tree && e.base === w.result?.base && e.candidate_digest === w.result?.candidate_digest && e.criteria_digest === w.manifest?.criteria_digest && e.manifest_digest === w.manifest_digest && e.tests_digest === w.result?.tests_digest && e.tests_digest === WORK_TESTS_NOT_RUN_DIGEST && e.tests_status === 'not-run' && e.target_digest === routingDigest(workReviewTarget(w)) && aggregate && !aggregate.unresolved_negative && e.reviews.length && e.reviews.every(id => aggregate.records.some(r => r.invocation_id === id && r.verdict === 'approve')));
}
