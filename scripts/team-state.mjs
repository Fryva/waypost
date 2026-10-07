import { applyNativeProtocolQuota } from './team-native-quota.mjs';
// Deterministic team transitions. Authentication and file IO belong to the CLI/store.
import { validatePolicy, validateDescriptor, rankParticipant, selectCoordinator, selectProtocolReviewerCandidate, updateReviewFloor, policyStrengthShape } from './team.mjs';
import { proposeModelRoute } from './model-routing.mjs';
import { applyWorkflow } from './team-workflow.mjs';
import { applyModelInventory } from './team-model-inventory.mjs';
import { buildAuthenticatedCalibrationSummary } from './team-role-calibration.mjs';
import { compileCalibrationPolicyV2 } from './model-strength.mjs';
import { quotaEligible, effectiveReviewFloor } from './team-quota.mjs';
const clone = structuredClone;
const KINDS = new Set(['question', 'answer', 'progress', 'result', 'assignment', 'ack', 'quiesce', 'handover', 'review-request', 'review-result', 'cancel']);
const DEFERRED = new Set(['native-leader-resume-v2','native-protocol-quota-enable-v2','native-protocol-quota-capture-v2','native-protocol-quota-renew-v2','native-protocol-handover-stop-capture-v2','native-protocol-handover-prepare-v2','native-protocol-handover-enable-v2','native-protocol-handover-ack-capture-v2','native-protocol-review-enable-v2','native-protocol-review-capture-v2','native-protocol-control-enable-v2','native-protocol-delivery-enable-v2','native-action-profile-capture-v2','native-leader-ack-capture-v2','native-model-inventory-capture-v1','native-model-inventory-attempt-v1','native-policy-install-v2','subscription-accounting-enable-v2','subscription-allocation-update-v2','subscription-context-capture-v2','subscription-reserve-v2','subscription-consume-v2','subscription-accounting-enable-v1','subscription-allocation-update-v1','subscription-context-capture-v1','subscription-reserve-v1','subscription-consume-v1','participant-host-register-v1','quota-policy-enable-v1','quota-capture-v1','control-grant-capture-v1','control-invocation-reserve-v1','native-binding-v1','join','strength-check','policy','attest','availability','revoke','leader-ack','routing-enable','routing-enable-v2','routing-grant-capture-v1','assign-routed-v2','assign-routed-v1','assign','work-dispatch-ack-v1','work-ack','submit','supervise','cancel','close','collector-register-v1','collector-revoke-v1','delivery-consume-v1','runtime-request-v1','runtime-consume-v1','runtime-capture-v1','begin-handover-v1','quiesce-capture-v1','quiesce-ack-v1','adopt-work-v1','adoption-ack-v1','handover-accept-v1','material-capture-v1','review-context-v1','review-request-v1','review-consume-v1','review-capture-v1','revise-work-v1','integration-prepare-v1','integration-start-v1','integration-abort-v1','routing-evidence-v1','invocation-reserve-v1','invocation-consume-v1','invocation-abort-v1','close-v1']);
function fail(message) { throw new Error(message); }
function text(v, name, max = 256) { if (typeof v !== 'string' || !v || v.length > max || /[\x00-\x1f]/.test(v)) fail('invalid-' + name); return v; }
function id(v) { if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(v || '') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(v)) fail('invalid-team-id'); return v; }
function participant(t, value) { const p = t.participants[value]; if (!p || p.revoked || p.availability === 'left') fail('participant-unavailable'); return p; }
function owner(s, c) { if (c.actor !== 'owner:' + s.owner_hash) fail('owner-required'); }
function member(t, c) { const p = participant(t, c.actor); if (p.incarnation !== c.incarnation) fail('participant-incarnation-mismatch'); return p; }
function leader(t, c) { const p = member(t, c); if (t.status !== 'active' || t.leader !== p.id || c.epoch !== t.epoch) fail('current-acknowledged-leader-required'); return p; }
function qualified(t, p, role, c) {
  if(t.quota_policy?.automatic_redistribution && !quotaEligible(p,Date.parse(c.at)))fail('participant-quota-unavailable');
  const action = [c.type, t.id, p.id, p.incarnation, p.model.model_revision, t.policy.revision, c.request_key].join(':');
  if (rankParticipant(p, t.policy, role, { action, now: Date.parse(c.at) }) === null) fail('action-bound-model-evidence-required:' + action);
}
function floor(t, at) {
  if(t.policy?.protocol===2){nativeFloor(t,Date.parse(at));return;}
  // Policies can change score scales: preserve admitted identities, not raw scores.
  const ps = Object.values(t.participants);
  const oldRequired = t.required_review_models || [];
  const current = updateReviewFloor(null, ps, t.policy, { now: Date.parse(at) });
  const identities = (t.native_policy_bootstrap && current===null ? [] : ps).filter(p => rankParticipant(p, t.policy, 'review', { now: Date.parse(at) }) === current).map(p => [p.model.provider, p.model.model_id, p.model.reasoning]);
  t.required_review_models = [...new Map([...oldRequired, ...identities].map(x => [JSON.stringify(x), x])).values()];
  const historical = t.required_review_models.map(([provider, model_id, reasoning]) => t.policy.profiles.find(x => x.provider === provider && x.model_id === model_id && x.reasoning === reasoning));
  t.review_floor = historical.some(x => !x) ? null : Math.max(current ?? -1, ...historical.map(x => x.priorities.review));
  t.review_blocker = historical.some(x => !x) ? 'previous-review-model-unclassified' : t.review_floor < 0 ? 'no-qualified-review-model' : null;
  if(t.quota_policy?.automatic_redistribution){
    t.review_admissions ||= {};
    for(const p of ps.filter(p=>rankParticipant(p,t.policy,'review',{now:Date.parse(at)})!==null)){
      const model={provider:p.model.provider,model_id:p.model.model_id,reasoning:p.model.reasoning},key=JSON.stringify(Object.values(model));
      const admission={participant:p.id,incarnation:p.incarnation,model_revision:p.model.model_revision,model};
      const admissions=t.review_admissions[key] ||= [];
      if(!admissions.some(x=>JSON.stringify(x)===JSON.stringify(admission)))admissions.push(admission);
    }
    t.historical_review_floor=t.review_floor;t.historical_review_blocker=t.review_blocker;
    const effective=effectiveReviewFloor(t,Date.parse(at));t.review_floor=effective.floor;t.review_blocker=effective.blocked;t.quota_floor_evidence=effective;
    const binding=JSON.stringify([t.policy.revision,ps.map(p=>[p.id,p.incarnation,p.model.model_revision,p.model.provider,p.model.model_id,p.model.reasoning]),t.review_floor,t.review_blocker]);
    if(t.quota_binding_signature!==undefined && t.quota_binding_signature!==binding)t.quota_revision=(t.quota_revision||0)+1;
    t.quota_binding_signature=binding;
  }
}
function eligibleParticipants(t,now){return Object.values(t.participants).filter(p=>!t.quota_policy?.automatic_redistribution || quotaEligible(p,now));}
function propose(t, at) {
  const selected = selectCoordinator(eligibleParticipants(t,Date.parse(at)), t.policy, t.leader, { now: Date.parse(at), ...(t.policy?.protocol===2?{coverage:'waypost-protocol-coordinate'}:{}) });
  if (!selected) { t.status = 'paused'; t.candidate = null; if(t.policy?.protocol===2){t.review_candidate=null;t.review_candidate_blocker='protocol-coordinator-candidate-unavailable';} return; }
  if(t.policy?.protocol===2){
    t.review_candidate=t.review_blocker?null:selectProtocolReviewerCandidate(Object.values(t.participants),t.policy,t.review_floor,{coordinator:selected.id,now:Date.parse(at)})?.id??null;
    t.review_candidate_blocker=t.review_candidate?null:'strongest-independent-review-candidate-unavailable';
    if(selected.id===t.leader&&t.status==='active'&&!t.review_candidate){t.candidate=selected.id;t.status='paused';return;}
  }
  if (selected.id === t.leader && t.status === 'active') return;
  t.candidate = selected.id;
  t.status = t.leader ? 'handover' : 'forming';
}
function nativeFloor(t,now){
  const eligible=Object.values(t.participants).map(p=>({p,rank:rankParticipant(p,t.policy,'review',{now,coverage:'waypost-protocol-review'})})).filter(x=>x.rank!==null);
  const strongest=eligible.length?Math.max(...eligible.map(x=>x.rank)):null;
  const identities=[...(t.required_review_identities_v2||[]),...eligible.filter(x=>x.rank===strongest).map(x=>x.p.native_admission.identity)];
  t.required_review_identities_v2=[...new Map(identities.map(x=>[JSON.stringify(x),clone(x)])).values()];
  const rows=t.required_review_identities_v2.map(identity=>t.policy.profiles.find(p=>JSON.stringify(p.identity)===JSON.stringify(identity)));
  const missing=rows.some(p=>!p||p.priorities.review===null||!p.calibration.review?.current||now>=Date.parse(p.calibration.review.expires_at));
  t.review_floor=missing?null:Math.max(strongest??-1,...rows.map(p=>p.priorities.review));
  t.review_blocker=missing?'previous-native-review-profile-unclassified':t.review_floor<0?'no-qualified-review-model':null;
}
// A protocol 2 team that left `active` (its only critic or its leader flapped
// busy and back) has no way back through the election: the leader acknowledgement
// needs a forming team, and install needs no leader. The owner resumes it at the
// same epoch only when the unchanged election again selects the incumbent with an
// independent critic. Leader, epoch, audits and slots stay as they are.
function resumeNativeLeader(s,t,c){
  owner(s,c);
  if(Object.keys(c).some(k=>!['type','team','actor','at','request_key','incarnation','epoch'].includes(k)))fail('native-resume-selectors-only');
  if(t.policy?.protocol!==2||!t.leader||!['paused','handover'].includes(t.status)||c.epoch!==t.epoch)fail('native-resume-left-active-leader-required');
  if(t.handover||t.native_quota_freeze||t.native_protocol_handover&&t.native_protocol_handover.state!=='applied')fail('native-resume-quota-handover-pending');
  const leader=t.leader;floor(t,c.at);t.status='active';t.candidate=null;propose(t,c.at);
  if(t.status!=='active')fail(t.candidate===leader?'native-resume-independent-critic-required':'native-resume-incumbent-not-selected');
  return {resumed:true,leader,epoch:t.epoch,review_candidate:t.review_candidate,protected_actions_granted:false};
}
function installNativePolicy(s,t,c,authority,now){
  owner(s,c);
  const allowed=['type','team','actor','at','request_key','cohort_id','expected_policy_revision','scope','incarnation','epoch'];
  if(Object.keys(c).some(k=>!allowed.includes(k))||c.scope!=='waypost-protocol')fail('native-policy-selectors-only');
  if(c.expected_policy_revision!==t.policy.revision)fail('native-policy-revision-mismatch');
  if(!Number.isSafeInteger(authority.revision)||authority.revision<0)fail('store-authority-revision-required');
  if(t.leader||Object.values(t.work).some(w=>!['integrated','cancelled'].includes(w.status)))fail('native-policy-idle-migration-required');
  if(t.quota_policy?.automatic_redistribution)fail('native-policy-quota-migration-required');
  if(t.handover||Object.values(s.invocations||{}).some(x=>x.team===t.id&&!['settled','aborted'].includes(x.state)))fail('native-policy-pending-runtime-required');
  if(t.required_review_models?.length)fail('native-policy-legacy-history-bridge-required');
  if(Object.values(s.subscription_invocations||{}).some(x=>x.team===t.id&&!['settled','aborted','reconciled'].includes(x.state)))fail('unresolved-subscription-invocations');
  if(Object.values(t.runtime_requests||{}).some(x=>!x.captured&&!x.reconciled_stopped)||Object.values(t.review_requests||{}).some(x=>!x.output_digest&&!x.reconciled_stopped)||Object.values(t.deliveries||{}).some(x=>['dispatching','uncertain'].includes(x.state)))fail('native-policy-pending-runtime-required');
  const summary=buildAuthenticatedCalibrationSummary({teamId:t.id,cohortId:c.cohort_id,loaded:{state:s,revision:authority.revision},now});
  const proposal=compileCalibrationPolicyV2(summary,{revision:t.policy.revision+1,now});
  const policy=validatePolicy({...clone(proposal),mode:'automatic-calibration',activation:true,activation_scope:'waypost-protocol',installation:{request_key:c.request_key,cohort:c.cohort_id,previous_policy_revision:t.policy.revision}});
  const history=t.required_review_identities_v2||[];
  if(history.some(identity=>!policy.profiles.some(p=>JSON.stringify(p.identity)===JSON.stringify(identity)&&p.priorities.review!==null)))fail('native-policy-historical-frontier-uncovered');
  const captures=Object.values(t.native_calibration_cohorts[c.cohort_id].captures);
  // A cohort opened with an owner calibration validity admits until that time; else until its capture expires.
  const validity=t.native_calibration_cohorts[c.cohort_id].calibration_expires_at;
  const admissions={};
  for(const row of policy.profiles){
    const p=t.participants[row.participant];
    if(!p||p.revoked||p.availability==='left'||p.incarnation!==row.incarnation||p.model.model_revision!==row.model_revision||p.native_binding?.descriptor_digest!==row.descriptor_digest)continue;
    const capture=captures.filter(x=>x.measurement.profile_id===row.identity.profile_id&&s.subscription_invocations[x.invocation_id]?.participant===p.id&&x.incarnation===p.incarnation&&x.descriptor_digest===row.descriptor_digest&&x.collector==='collector:'+p.native_binding.collector_id).sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at)||a.invocation_id.localeCompare(b.invocation_id))[0];
    if(!capture||now>=Date.parse(validity??capture.expires_at))continue;
    admissions[p.id]={protocol:2,identity:clone(row.identity),observation_id:capture.observation_id,participant:p.id,incarnation:p.incarnation,model_revision:p.model.model_revision,descriptor_digest:row.descriptor_digest,collector:p.native_binding.collector_id,source_invocation:capture.invocation_id,observed_at:capture.observed_at,expires_at:validity??capture.expires_at};
  }
  t.policy=policy;
  for(const p of Object.values(t.participants)){delete p.native_admission;if(admissions[p.id])p.native_admission=admissions[p.id];}
  nativeFloor(t,now);propose(t,c.at);
  if(!t.candidate||t.review_floor===null||t.review_floor<0||t.review_blocker)fail('native-policy-qualified-coordinate-and-review-required');
  if(!t.review_candidate)fail('native-policy-qualified-independent-review-required');
  return {policy_revision:policy.revision,candidate:t.candidate,review_candidate:t.review_candidate,review_floor:t.review_floor,scope:'waypost-protocol',protected_roles_granted:false};
}
function envelope(t, c, sender, kind, to, payload, correlation = null) {
  const recipient = participant(t, to);
  const message = { id: text(c.message_id || c.request_key, 'message-id', 128), sender, recipient: to, incarnation: recipient.incarnation, epoch: t.epoch, kind, payload: clone(payload), correlation, reply_to: c.reply_to || null, at: c.at, ack: null };
  if (t.messages.some(m => m.id === message.id)) fail('duplicate-message-id');
  if (JSON.stringify(payload).length > 16384 || t.messages.length >= 10000) fail('message-limit');
  t.messages.push(message); return message;
}
export function reduceTeamEvent(previous, command, authority = {}) {
  let c = clone(command);
  if (authority.accepted_at) c.at = authority.accepted_at;
  const now = Date.parse(c.at); if (!Number.isFinite(now)) fail('invalid-event-time');
  let s = previous ? clone(previous) : { protocol: 1, owner_hash: c.owner_hash, teams: {}, task_bindings: {} };
  if (!previous && c.type !== 'create') fail('authority-not-created');
  text(s.owner_hash, 'owner-hash');
  let result;
  if (c.type === 'create') {
    owner(s, c); id(c.team); text(c.task, 'task', 4096);
    if (s.task_bindings[c.task]) fail('task-already-owned:' + s.task_bindings[c.task]);
    if (s.teams[c.team]) fail('team-already-exists');
    const policy = validatePolicy(c.policy);
    if(policy.protocol===2)fail('native-policy-reducer-install-required');
    if(c.native_policy_bootstrap!==undefined&&(c.native_policy_bootstrap!==true||c.quota_policy!==undefined))fail('invalid-native-policy-bootstrap');
    s.teams[c.team] = { id: c.team, task: c.task, policy, participants: {}, messages: [], work: {}, status: 'forming', epoch: 0, leader: null, candidate: null, review_floor: null, required_review_models: [], review_blocker: 'no-qualified-review-model' };
    if(c.native_policy_bootstrap===true)s.teams[c.team].native_policy_bootstrap=true;
    if(c.quota_policy!==undefined){
      if(c.quota_policy?.protocol!==1 || c.quota_policy.automatic_redistribution!==true || Object.keys(c.quota_policy).some(k=>!['protocol','automatic_redistribution'].includes(k)))fail('invalid-quota-policy');
      Object.assign(s.teams[c.team],{quota_policy:clone(c.quota_policy),quota_revision:0,review_admissions:{}});
    }
    s.task_bindings[c.task] = c.team; result = { team: c.team, status: 'forming' };
  } else {
    const t = s.teams[c.team]; if (!t || t.status === 'closed') fail('team-not-active');
    if(c.type==='deferred-discard-v1') {
      owner(s,c);if(s.publication_fence)fail('publication-still-in-progress');
      text(c.reason,'discard-reason',4096);
      const pending=s.deferred_commands?.find(x=>x.id===c.deferred_id && x.command.team===t.id);if(!pending)fail('deferred-command-not-found');
      s.deferred_commands=s.deferred_commands.filter(x=>x.id!==pending.id);
      return {state:s,result:{discarded:pending.id,reason:c.reason}};
    }
    if(c.type==='deferred-apply-v1') {
      owner(s,c);if(s.publication_fence)fail('publication-still-in-progress');
      const pending=s.deferred_commands?.find(x=>x.id===c.deferred_id && x.command.team===t.id);if(!pending)fail('deferred-command-not-found');
      s.deferred_commands=s.deferred_commands.filter(x=>x.id!==pending.id);
      c={...clone(pending.command),at:c.at,request_key:c.request_key};
    }
    if(s.publication_fence?.team===t.id && DEFERRED.has(c.type)) {
      if(c.actor.startsWith('owner:'))owner(s,c);else if(c.actor.startsWith('collector:')){const x=s.collectors?.[c.actor.slice(10)];if(!x || x.revoked || x.team!==t.id)fail('collector-required');}else member(t,c);
      s.deferred_commands ||= [];if(s.deferred_commands.length>=128)fail('deferred-command-limit');
      s.deferred_commands.push({id:c.request_key,command:clone(c)});
      return {state:s,result:{deferred:true,id:c.request_key,reason:'publication-fence'}};
    }
    if(t.native_quota_freeze&&['runtime-request-v1','runtime-consume-v1','delivery-consume-v1','review-request-v1','review-consume-v1','invocation-reserve-v1','invocation-consume-v1','control-invocation-reserve-v1'].includes(c.type))fail('native-quota-transition-frozen');
    if(t.policy?.protocol===2 && (['policy','leader-ack','assign','assign-routed-v1','work-ack','submit','supervise','cancel','routing-enable','quota-policy-enable-v1','begin-handover-v1','quiesce-capture-v1','quiesce-ack-v1','adopt-work-v1','adoption-ack-v1','handover-accept-v1'].includes(c.type)||/^(review-|integration-|revise-work|assign-routed|work-dispatch|routing-enable-v2)/.test(c.type)||c.type==='strength-check'&&c.policy))fail('native-policy-protected-action-admission-required');
    if(c.type==='native-policy-install-v2'){result=installNativePolicy(s,t,c,authority,now);}
    else if(c.type==='native-leader-resume-v2'){result=resumeNativeLeader(s,t,c);}
    else if (c.type === 'join') {
      owner(s, c); const p = clone(c.participant);
      if((t.native_policy_bootstrap||t.policy?.protocol===2)&&p.native_admission!==undefined)fail('native-admission-reducer-only');
      if((t.native_policy_bootstrap||t.policy?.protocol===2)&&['native_protocol_quota','native_account_exclusions'].some(k=>Object.hasOwn(p,k)))fail('native-quota-reducer-only');
      id(p.id); text(p.incarnation, 'incarnation'); text(p.session, 'session'); text(p.harness, 'harness'); text(p.root, 'root', 4096);
      p.model = validateDescriptor(p.model);
      if (p.surface !== undefined && !['cli','desktop','desktop-code','desktop-chat','web','unknown'].includes(p.surface)) fail('invalid-participant-surface');
      if (t.participants[p.id]) fail('participant-already-exists');
      if (p.model.evidence.kind === 'owner-attested' && p.model.evidence.action !== 'join') fail('join-attestation-required');
      text(p.credential_hash, 'credential-hash'); p.revoked = false; p.availability = 'ready';
      t.participants[p.id] = p; floor(t, c.at); propose(t, c.at);
      result = { participant: p.id, incarnation: p.incarnation, candidate: t.candidate, epoch: t.epoch };
    } else if (c.type === 'strength-check') {
      owner(s, c);
      t.strength_check = clone(c.check);
      if (JSON.stringify(t.strength_check).length > 262144) fail('strength-evidence-too-large');
      if (c.policy) {
        const policy = validatePolicy(c.policy);
        if(policy.protocol===2)fail('native-policy-reducer-install-required');
        if (policy.revision !== t.policy.revision || policyStrengthShape(policy) !== policyStrengthShape(t.policy)) fail('strength-refresh-cannot-change-priorities');
        if (policy.mode !== 'automatic' || Date.parse(policy.generated_at) > now || Date.parse(policy.expires_at) <= now) fail('fresh-automatic-policy-required');
        t.policy = policy;
      }
      if(t.policy?.protocol===2){floor(t,c.at);propose(t,c.at);}
      result = { checked: true, policy_revision: t.policy.revision };
    } else if (c.type === 'policy') {
      owner(s, c); const policy = validatePolicy(c.policy);
      if(policy.protocol===2)fail('native-policy-reducer-install-required');
      if (policy.revision <= t.policy.revision) fail('policy-revision-must-increase');
      t.policy = policy;
      if (c.check) t.strength_check = clone(c.check);
      for (const w of Object.values(t.work)) { w.reviews = []; if (w.status === 'reviewed') w.status = 'review-pending'; }
      floor(t, c.at); t.status = t.leader ? 'handover' : 'forming'; propose(t, c.at);
      result = { policy_revision: policy.revision, review_floor: t.review_floor, candidate: t.candidate };
    } else if (c.type === 'attest') {
      owner(s, c); const p = participant(t, c.participant_id); const model = validateDescriptor(c.model);
      if (model.model_revision < p.model.model_revision) fail('old-model-revision');
      const identityChanged = ['provider', 'model_id', 'reasoning'].some(k => model[k] !== p.model[k]);
      if (identityChanged && model.model_revision <= p.model.model_revision) fail('changed-model-requires-new-revision');
      p.model = model;
      if (identityChanged) { if (t.leader === p.id) t.status = 'handover'; for (const w of Object.values(t.work)) { w.reviews = []; if (w.worker === p.id && !['integrated','cancelled'].includes(w.status)) w.status = 'uncertain'; } }
      floor(t, c.at); propose(t, c.at); result = { participant: p.id, model_revision: model.model_revision };
    } else if (c.type === 'availability') {
      const p = member(t, c); if (!['ready', 'busy', 'unavailable', 'left'].includes(c.availability)) fail('invalid-availability');
      p.availability = c.availability; if(t.quota_policy?.automatic_redistribution||t.policy?.protocol===2)floor(t,c.at); propose(t, c.at); result = { availability: p.availability };
    } else if (c.type === 'revoke') {
      owner(s, c); const p = participant(t, c.participant_id); p.revoked = true;
      for (const w of Object.values(t.work)) if (w.worker === p.id && !['integrated','cancelled'].includes(w.status)) w.status = 'uncertain';
      if(t.quota_policy?.automatic_redistribution||t.policy?.protocol===2)floor(t,c.at); propose(t, c.at); result = { revoked: p.id };
    } else if (c.type === 'leader-ack') {
      const p = member(t, c); const best = selectCoordinator(eligibleParticipants(t,now), t.policy, t.leader, { now });
      if (!best || best.id !== p.id || t.candidate !== p.id) fail('strongest-candidate-required');
      // No implicit transfer of outstanding execution on leader change.
      if (Object.values(t.work).some(w => !['integrated', 'cancelled', 'blocked'].includes(w.status))) fail('outstanding-work-requires-handover-reconciliation');
      t.leader = p.id; t.candidate = null; t.epoch++; t.status = 'active';
      result = { leader: p.id, epoch: t.epoch };
    } else if (c.type === 'send') {
      const p = member(t, c); if (c.epoch !== t.epoch) fail('stale-epoch');
      if (!KINDS.has(c.kind) || ['assignment','result','review-request','review-result','quiesce','handover','cancel'].includes(c.kind)) fail('use-protected-work-command');
      if (c.reply_to && !t.messages.some(m => m.id === c.reply_to && m.recipient === p.id)) fail('invalid-reply-correlation');
      result = envelope(t, c, p.id, c.kind, c.to, c.payload ?? {}, c.correlation || null);
    } else if (c.type === 'ack') {
      const p = member(t, c); const m = t.messages.find(x => x.id === c.message);
      if (!m || m.recipient !== p.id || m.incarnation !== p.incarnation) fail('wrong-message-recipient');
      if (m.epoch !== t.epoch || c.epoch !== t.epoch) fail('stale-epoch');
      m.ack = { participant: p.id, at: c.at }; result = { acknowledged: m.id };
    } else if (c.type === 'routing-enable') {
      owner(s, c);
      if(t.accounting?.mode==='subscription-tokens')fail('subscription-mode-migration-required');
      if (t.routing?.required) fail('routing-already-required');
      if (Object.values(t.work).some(w => !['integrated','cancelled'].includes(w.status))) fail('outstanding-work-requires-routing-migration');
      t.routing = { protocol: 1, required: true, enabled_at: c.at };
      result = { routing_required: true, dispatch: 'blocked-until-trusted-collectors' };
    } else if (c.type === 'assign-routed-v1') {
      const p = leader(t, c); qualified(t, p, 'coordinate', c);
      if (!t.routing?.required) fail('enable-routing-first');
      const proposal = proposeModelRoute({ manifest: c.manifest, participants: Object.values(t.participants), policy: t.policy, now });
      // Future adapters must install collector-owned evidence, reserve liability
      // and consume an invocation before dispatch. A JSON request grants none.
      if (!proposal.choice) fail('trusted-routing-collectors-unavailable');
      fail(proposal.dispatch_blocker);
    } else if (c.type === 'assign') {
      if (t.routing?.required) fail('routed-assignment-required');
      const p = leader(t, c); qualified(t, p, 'coordinate', c); const w = clone(c.work);
      id(w.id); if (t.work[w.id]) fail('work-already-assigned'); const worker = participant(t, w.worker);
      if(t.quota_policy?.automatic_redistribution && !quotaEligible(worker,now))fail('worker-quota-unavailable');
      if (rankParticipant(worker, t.policy, 'implement', { now }) === null) fail('worker-model-unclassified');
      text(w.base, 'work-base', 128); text(w.goal, 'goal', 8192);
      if (!Array.isArray(w.paths) || !w.paths.length || w.paths.some(x => typeof x !== 'string' || x.startsWith('/') || x.includes('..') || x.includes('\\') || /[\x00-\x1f*?]/.test(x))) fail('concrete-relative-paths-required');
      w.dependencies ||= [];
      if (!Array.isArray(w.dependencies) || w.dependencies.some(x => !t.work[x] || t.work[x].status !== 'integrated')) fail('unresolved-work-dependency');
      for (const other of Object.values(t.work)) if (!['integrated','cancelled'].includes(other.status) && other.paths.some(x => w.paths.includes(x))) fail('edit-scope-conflict');
      if (!w.criteria || !w.criteria_digest) fail('acceptance-evidence-required');
      Object.assign(w, { generation: 1, epoch: t.epoch, model_revision: worker.model.model_revision, policy_revision: t.policy.revision, status: 'assigned', reviews: [] });
      t.work[w.id] = w; result = envelope(t, c, p.id, 'assignment', worker.id, w, w.id);
    } else if (c.type === 'work-ack') {
      const p = member(t, c); const w = t.work[c.work_id];
      if (t.routing?.required && w?.routing) fail('trusted-invocation-grant-required');
      if (!w || w.worker !== p.id || w.epoch !== t.epoch || c.epoch !== t.epoch || w.status !== 'assigned') fail('invalid-assignment-ack');
      w.status = 'running'; result = { work: w.id, status: w.status };
    } else if (c.type === 'submit') {
      const p = member(t, c); qualified(t, p, 'implement', c); const w = t.work[c.work_id];
      if (!w || w.worker !== p.id || c.epoch !== t.epoch || w.epoch !== t.epoch || w.status !== 'running') fail('invalid-assignment-result');
      if (w.model_revision !== p.model.model_revision || w.policy_revision !== t.policy.revision) fail('assignment-identity-changed');
      const e = c.evidence; if (!e || e.base !== w.base || !/^[a-f0-9]{64}$/.test(e.target_digest || '') || !Array.isArray(e.paths) || e.paths.some(x => !w.paths.includes(x))) fail('result-evidence-mismatch');
      w.result = clone(e); w.status = 'submitted'; result = envelope(t, c, p.id, 'result', t.leader, e, w.id);
    } else if (c.type === 'supervise') {
      const p = leader(t, c); qualified(t, p, 'coordinate', c); const w = t.work[c.work_id];
      if (!w || w.status !== 'submitted' || c.target_digest !== w.result.target_digest || !c.findings) fail('diff-supervision-required');
      w.supervision = { participant: p.id, target_digest: c.target_digest, findings: clone(c.findings) }; w.status = 'review-pending'; result = { work: w.id, status: w.status };
    } else if (c.type === 'cancel') {
      const p = leader(t, c); const w = t.work[c.work_id]; if (!w || w.status === 'integrated') fail('invalid-cancel');
      // Running editors must acknowledge a stop before overlapping scope is reusable.
      w.status = ['assigned','blocked'].includes(w.status) ? 'cancelled' : 'uncertain'; result = { work: w.id, status: w.status, requested_by: p.id };
    } else if (c.type === 'close') {
      if(Object.values(s.subscription_invocations||{}).some(x=>x.team===t.id&&!['settled','aborted','reconciled'].includes(x.state)))fail('unresolved-subscription-invocations');
      owner(s, c); if (Object.values(t.work).some(w => w.status !== 'integrated' && w.status !== 'cancelled')) fail('unfinished-team-work');
      if (Object.keys(t.work).length) fail('reviewed-integration-not-implemented');
      t.status = 'closed'; delete s.task_bindings[t.task]; result = { closed: t.id };
    } else {
      const nativeQuota=applyNativeProtocolQuota(s,t,c,now,{owner,floor});
      const inventory=nativeQuota||applyModelInventory(s,t,c,now);
      const advanced=inventory.handled?inventory:applyWorkflow(s,t,c,now,{owner,member,leader,qualified,participant,selectCoordinator:(ps,policy,current,opts)=>selectCoordinator(ps.filter(p=>!t.quota_policy?.automatic_redistribution || quotaEligible(p,opts.now)),policy,current,opts),envelope,floor,propose});
      if(!advanced.handled)fail('unsupported-team-transition');result=advanced.result;
      if(t.policy?.protocol===2&&c.type==='collector-revoke-v1'){
        for(const p of Object.values(t.participants))if(p.native_admission?.collector===c.collector_id)delete p.native_admission;
        floor(t,c.at);propose(t,c.at);
      }
    }
  }
  return { state: s, result };
}
export function authorizeActor(state, teamId, credential) {
  if (!credential || typeof credential.token_hash !== 'string') fail('credential-required');
  if (!state) { if(credential.role!=='owner')fail('owner-required');return 'owner:' + credential.token_hash; }
  if (credential.role === 'owner' && credential.token_hash === state.owner_hash) return 'owner:' + state.owner_hash;
  if(credential.role==='collector') {
    const x=state.collectors?.[credential.collector];
    if(!x || x.revoked || x.team!==teamId || x.credential_hash!==credential.token_hash)fail('invalid-collector-credential');
    return 'collector:'+x.id;
  }
  const t = state.teams[teamId], p = t?.participants[credential.participant];
  if (!p || p.revoked || p.availability === 'left' || p.credential_hash !== credential.token_hash || p.incarnation !== credential.incarnation) fail('invalid-participant-credential');
  return p.id;
}
