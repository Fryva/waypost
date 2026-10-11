#!/usr/bin/env node
import { inventoryDue } from './team-model-inventory.mjs';
// Team CLI. The caller owns credentials; the immutable store owns accepted state.
import { existsSync, readFileSync, writeFileSync, mkdirSync, lstatSync, realpathSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readConfig, projectRoot, parseFrontmatter, pathUnder, sessionId } from './lib.mjs';
import { coordinationDirs } from './presence.mjs';
import { claimsOf } from './sessions.mjs';
import { detectHarness } from './agents.mjs';
import { createParticipant, validatePolicy, policyStrengthShape } from './team.mjs';
import { reduceTeamEvent, authorizeActor } from './team-state.mjs';
import { readAuthority, mutateAuthority, explainRecovery, recoverLock } from './team-store.mjs';
import { proposeModelRoute } from './model-routing.mjs';
import { consent } from './cleanup.mjs';
import { nativeVersionStatus } from './team-transport.mjs';
import { buildAuthenticatedCalibrationSummary } from './team-role-calibration.mjs';
import { workPlanListing } from './team-native-work-plan.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
export function nativeInspectionDue(participant, now = Date.now()) {
  return Boolean(participant.native_binding && !participant.revoked && participant.availability !== 'left' &&
    (!Number.isFinite(Date.parse(participant.identity_checked_at)) || now - Date.parse(participant.identity_checked_at) >= 900000));
}
function json(path) {
  if (!path || lstatSync(path).isSymbolicLink() || lstatSync(path).size > 256 * 1024) throw new Error('safe-bounded-json-file-required');
  return JSON.parse(readFileSync(path, 'utf8'));
}
function writeCredential(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 });
}
function ownerCredential(path) {
  if (!existsSync(path)) writeCredential(path, { protocol: 1, role: 'owner', token: randomBytes(32).toString('hex') });
  return loadCredential(path);
}
function loadCredential(path) {
  const c = json(path); if (c.protocol !== 1 || typeof c.token !== 'string' || c.token.length < 32) throw new Error('invalid-credential-file');
  return { ...c, token_hash: sha(c.token) };
}
function bootPolicy(now) {
  return validatePolicy({ protocol: 1, revision: 1, domain: 'coding', mode: 'automatic', generated_at: now, expires_at: new Date(Date.parse(now) + 3600000).toISOString(), sources: [{ id: 'arena-agent', url: 'https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset', retrieved_at: now }], profiles: [] });
}
function taskKey(input, cfg) {
  const p = existsSync(resolve(projectRoot(), input)) ? resolve(projectRoot(), input) : resolve(cfg.vault_path, input);
  const actual = realpathSync(p), vault = realpathSync(cfg.vault_path);
  if (pathUnder(actual, vault) === null || !actual.endsWith('.md')) throw new Error('bound-vault-artifact-required');
  const fm = parseFrontmatter(readFileSync(actual, 'utf8')).data;
  if (!fm?.type || !fm?.id) throw new Error('artifact-type-and-id-required');
  return relative(vault, actual).replace(/\\/g, '/');
}
// Owner-assigned roles (ADR owner-assigned-team-roles): the latest settled identity observation of a participant, as the owner reads it.
export function latestIdentity(s, t, p) {
  const x = Object.values(s.subscription_invocations || {}).filter(x => x.team === t.id && x.purpose === 'identity' && x.participant === p.id && x.state === 'settled' && x.identity_observation)
    .sort((a, b) => Date.parse(b.identity_observation.observed_at) - Date.parse(a.identity_observation.observed_at))[0];
  if (!x) return null;
  const o = x.identity_observation, n = x.identity_seal?.native_receipt;
  return { profile_id: o.identity.profile_id, native_model: n?.actualModel?.model_id ?? null, reasoning: n?.actualModel?.reasoning ?? null, version: n?.context_manifest?.version ?? null, tool_surface: n?.context_manifest?.tools ?? null, observed_at: o.observed_at, expires_at: o.expires_at, expired: Date.now() >= Date.parse(o.expires_at) };
}
// The installed binary behind a participant's bound endpoint, checked with `--version` (no session).
export function participantBinary(p, status = nativeVersionStatus) {
  const file = p.native_binding?.endpoint_file; if (!file) return null;
  let d; try { d = JSON.parse(readFileSync(file, 'utf8')).descriptor; } catch { return { version: null, verified: false, blocker: 'endpoint-file-unreadable' }; }
  return status(d);
}
export function rolesListing(s, t, hints = null, binary = participantBinary) {
  const a = t.policy.mode === 'owner-assigned' ? t.policy.assignment : null;
  return { team: t.id, policy: { mode: t.policy.mode, revision: t.policy.revision, expires_at: t.policy.expires_at, expired: Date.now() >= Date.parse(t.policy.expires_at), ...(a ? { assignment: { coordinator: a.coordinator, reviewers: a.reviewers, executors: a.executors, reason: a.reason, issued_by: a.issued_by } } : {}) },
    participants: Object.values(t.participants).map(p => ({ participant: p.id, harness: p.harness, model: p.model && { provider: p.model.provider, model_id: p.model.model_id, reasoning: p.model.reasoning }, surface: p.surface ?? 'unknown', revoked: Boolean(p.revoked), availability: p.availability, identity: latestIdentity(s, t, p), binary: binary(p), ...(hints ? { calibration_hint: hints[p.id] ?? null } : {}) })),
    note: 'calibration_hint is advisory only; the owner assigns roles with `team roles --assign`' };
}
const idList = v => (v ? v.split(',').map(x => x.trim()).filter(Boolean) : []);
// The selectors-only assign command: ids, reason, expiry and issuer; the reducer derives every binding.
export function ownerAssignFields(s, t, { coordinator, reviewers, executors, reason, expiresAt, issuedBy, now = Date.now() }) {
  const lists = { coordinator: idList(coordinator), reviewers: idList(reviewers), executors: idList(executors) };
  const ids = [...new Set(Object.values(lists).flat())];
  const unknown = ids.filter(id => !t.participants[id]);
  if (unknown.length) throw new Error('unknown-participant:' + unknown.join(','));
  let expires_at = expiresAt;
  if (!expires_at) {
    const seen = ids.map(id => [id, latestIdentity(s, t, t.participants[id])]), missing = seen.filter(([, o]) => !o).map(([id]) => id);
    if (missing.length) throw new Error('identity-observation-required:' + missing.join(','));
    const stale = seen.filter(([, o]) => now >= Date.parse(o.expires_at)).map(([id]) => id);
    if (stale.length) throw new Error('identity-observation-expired:' + stale.join(','));
    expires_at = new Date(Math.min(...seen.map(([, o]) => Date.parse(o.observed_at))) + 604800000).toISOString();
  }
  return { ...lists, reason, expires_at, issued_by: issuedBy, expected_policy_revision: t.policy.revision };
}
function publicTeam(t, includeInventory = false) {
  const result = structuredClone(t);
  for (const p of Object.values(result.participants)) {
    delete p.credential_hash;
    p.surface ??= 'unknown';
    p.delivery_capabilities = { native_session_binding: p.native_binding ? 'managed-endpoint-bound' : 'unverified', send_existing: 'unsupported', wake: 'unverified', inspect_model: p.identity_checked_at ? (p.model.resolved ? 'adapter-observed' : 'partial-observation') : 'unverified', desktop_delivery:'unverified' };
  }
  if(!includeInventory)for(const entry of Object.values(result.model_inventory||{}))if(entry.snapshot){entry.snapshot.projected.candidate_count=entry.snapshot.projected.candidates.length;delete entry.snapshot.projected.candidates;}
  result.policy_stale = ['automatic','automatic-calibration','owner-assigned'].includes(result.policy.mode) && Date.now() >= Date.parse(result.policy.expires_at);
  result.delivery = 'cooperative inboxes (including MCP) and explicitly managed native endpoints; desktop native binding and wake unverified';
  if(t.accounting?.mode==='subscription-tokens')result.accounting_capabilities={mode:'subscription-tokens',ledger:t.accounting.protocol===2?'bootstrap-and-fixed-calibration-trials':'bootstrap-only',billing_policy:t.accounting.billing_policy||'verified-route-v1',default_execution_context_collector:t.accounting.protocol===2?'codex-claude-opencode-owned-native-counter':'unavailable',native_dispatch:t.accounting.protocol===2?'bounded-codex-claude-opencode-identity-and-fixed-trials':'blocked',calibration_policy_activation:t.policy.protocol===2,scoped_native_leadership_ack:Boolean(t.native_control_policy),protected_native_actions:false,provider_enforced_spend:false,exclusive_provider_quota:false};
  return result;
}
export async function main(argv = process.argv.slice(2)) {
  let [mode, target] = argv;
  let assignFields;
  const flag = key => argv.includes(key);
  const opt = key => { const i = argv.indexOf(key); if (i < 0) return undefined; if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('missing-value:' + key); return argv[i + 1]; };
  const cfg = readConfig(); if (!cfg?.vault_path) throw new Error('bind-a-vault-before-team-commands');
  const root = join(coordinationDirs(cfg.vault_path).primary, 'teams', 'authority');
  const loaded = () => readAuthority(root, reduceTeamEvent);
  const defaultOwner = join(projectRoot(), '.waypost', 'team-owner.json');
  const print = value => process.stdout.write(JSON.stringify(value, null, flag('--compact') ? 0 : 2) + '\n');
  const hostOf = async () => {
    const { createTeamHost } = await import('./team-host.mjs');
    const directory = join(root, 'host', target || '');
    return createTeamHost({ authorityRoot: root, projectRoot: projectRoot(), vaultPath:cfg.vault_path, team: target,
      hostDir: directory, ownerCredential: resolve(opt('--owner-credential') || defaultOwner),
      collectorPath: resolve(opt('--collector-credential') || join(directory, 'collector.json')),
      endpointPath: resolve(opt('--endpoint-file') || join(directory, opt('--participant') ? 'endpoint-' + opt('--participant') + '.json' : 'endpoint.json')),
      participant: opt('--participant'), leaderCredential:opt('--leader-credential') ? resolve(opt('--leader-credential')) : undefined, leaderEndpointPath: opt('--leader-endpoint-file') ? resolve(opt('--leader-endpoint-file')) : undefined, participantCredential: opt('--credential') ? resolve(opt('--credential')) : undefined,
      dispatcher: resolve(dirname(fileURLToPath(import.meta.url)), '../bin/waypost') });
  };
  if (mode === 'host') {
    const operation = opt('--operation');
    const host = await hostOf();
    if (operation === 'bootstrap') print(await host.bootstrap({ participant: opt('--participant'), descriptor: opt('--descriptor-file') ? json(resolve(opt('--descriptor-file'))) : undefined }));
    else if (operation === 'subscription-bootstrap') print(await host.subscriptionBootstrap({nonce:opt('--nonce'),estimateTokens:opt('--estimate-tokens')||'16000',maxTokens:opt('--max-tokens')||'20000'}));
    else if (operation === 'calibration-cohort-open') print(host.openCalibrationCohort(json(resolve(opt('--request-file') || ''))));
    else if (operation === 'calibration-trial') print(await host.subscriptionCalibrationTrial({cohortId:opt('--cohort'),caseId:opt('--case'),nonce:opt('--nonce'),estimateTokens:opt('--estimate-tokens')||'16000'}));
    else if (operation === 'calibration-summary') print(host.calibrationSummary({cohortId:opt('--cohort')}));
    else if(operation==='protocol-control-enable')print(host.enableProtocolControl(json(resolve(opt('--request-file')||''))));
    else if(operation==='protocol-review-enable')print(host.enableProtocolReview(json(resolve(opt('--request-file')||''))));
    else if(operation==='native-quota-enable')print(host.enableNativeProtocolQuota(json(resolve(opt('--request-file')||''))));
    else if(operation==='native-handover-enable')print(host.enableNativeProtocolHandover(json(resolve(opt('--request-file')||''))));
    else if(operation==='native-quota-observe')print(await host.observeNativeProtocolQuota({sourceInvocationId:opt('--source-invocation'),drive:!flag('--no-drive')}));
    else if(operation==='native-quota-handover')print(await host.driveNativeProtocolQuotaHandover({actionId:opt('--action-id'),nonce:opt('--nonce'),estimateTokens:opt('--estimate-tokens')}));
    else if(operation==='native-handover-ack')print(await host.acknowledgeNativeProtocolHandover({actionId:opt('--action-id'),nonce:opt('--nonce'),estimateTokens:opt('--estimate-tokens')||'16000'}));
    else if(operation==='native-work-enable')print(host.enableNativeWork(json(resolve(opt('--request-file')||''))));
    else if(operation==='native-work-manifest')print(host.installWorkManifest(json(resolve(opt('--request-file')||''))));
    else if(operation==='native-work-execute')print(await host.executeNativeWork({workId:opt('--work'),estimateTokens:opt('--estimate-tokens')}));
    else if(operation==='native-work-capture')print(host.captureNativeWork({workId:opt('--work')}));
    else if(operation==='native-work-revise')print(host.reviseNativeWork({workId:opt('--work'),reason:opt('--reason')}));
    else if(operation==='native-work-publish'){const request=json(resolve(opt('--request-file')||''));print(await host.publishNativeWork({workId:opt('--work'),message:request.message,story:request.story,commitIdentity:request.commit_identity}));}
    else if(operation==='native-work-publish-recover')print(host.recoverNativePublication({gitChildStopped:flag('--git-child-confirmed-stopped')}));
    else if(operation==='native-work-publish-abort')print(host.abortNativePublication({reservationId:opt('--reservation')}));
    else if(operation==='native-work-review')print(await host.reviewNativeWork({workId:opt('--work'),nonce:opt('--nonce'),actionId:opt('--action-id'),estimateTokens:opt('--estimate-tokens')}));
    else if(operation==='native-work-review-recover')print(await host.recoverWorkReview({invocationId:opt('--invocation')}));
    else if(operation==='native-work-plan')print(await host.planNativeWork({planId:opt('--plan-id'),nonce:opt('--nonce'),actionId:opt('--action-id'),estimateTokens:opt('--estimate-tokens')}));
    else if(operation==='native-work-plan-recover')print(await host.recoverWorkPlan({invocationId:opt('--invocation')}));
    else if(operation==='native-work-plan-review')print(await host.reviewNativeWorkPlan({planId:opt('--plan-id'),nonce:opt('--nonce'),actionId:opt('--action-id'),estimateTokens:opt('--estimate-tokens')}));
    else if(operation==='native-work-plan-review-recover')print(await host.recoverWorkPlanReview({invocationId:opt('--invocation')}));
    else if(operation==='native-work-cancel')print(host.cancelNativeWork({workId:opt('--work'),reason:opt('--reason')}));
    else if(operation==='native-leader-resume')print(host.resumeProtocolLeadership());
    else if(operation==='native-control-reconcile')print(host.reconcileProtocolControl({invocationId:opt('--invocation')}));
    else if(operation==='unknown-usage-accept')print(host.acceptUnknownUsage({invocationId:opt('--invocation'),chargedTokens:opt('--charged-tokens')}));
    else if(operation==='native-handover-recover')print(await host.recoverProtocolHandover({invocationId:opt('--invocation')}));
    else if(operation==='native-leader-ack')print(await host.acknowledgeProtocolLeadership({actionId:opt('--action-id'),nonce:opt('--nonce'),estimateTokens:opt('--estimate-tokens')||'16000'}));
    else if(operation==='native-leader-ack-recover')print(await host.recoverProtocolLeadership({invocationId:opt('--invocation')}));
    else if(operation==='native-leadership-audit')print(await host.auditProtocolLeadership({actionId:opt('--action-id'),sourceInvocationId:opt('--source-invocation'),nonce:opt('--nonce'),estimateTokens:opt('--estimate-tokens')||'16000'}));
    else if(operation==='native-leadership-audit-recover')print(await host.recoverProtocolAudit({invocationId:opt('--invocation')}));
    else if (operation === 'model-inventory') print(await host.observeModelInventory());
    else if (operation === 'native-policy-install') print(await host.installNativePolicy({cohortId:opt('--cohort'),expectedPolicyRevision:Number(opt('--policy-revision'))}));
    else if (operation === 'calibration-policy-proposal') print(await host.calibrationPolicyProposal({cohortId:opt('--cohort'),revision:Number(opt('--revision')||1)}));
    else if (operation === 'register-participant-host') print(await host.registerParticipantHost());
    else if (operation === 'inspect') print(await host.inspect({ action: opt('--action'), ...(opt('--nonce') ? { nonce: opt('--nonce') } : {}) }));
    else if (operation === 'relay') print(await host.relay({ limit: Number(opt('--limit') || 10), pollMs: Number(opt('--poll-ms') || 1000), maxPolls: Number(opt('--max-polls') || 1), estimateTokens: opt('--estimate-tokens') }));
    else if (operation === 'native-delivery-enable') print(host.enableNativeDelivery(json(resolve(opt('--request-file') || ''))));
    else if (operation === 'review') print(await host.review({ workId: opt('--work'), ...(opt('--nonce') ? { nonce: opt('--nonce') } : {}) }));
    else if (operation === 'checkout') print(await host.checkout({ workId: opt('--work') }));
    else if (operation === 'candidate') print(await host.candidate({ workId: opt('--work') }));
    else if (operation === 'dispatch') print(await host.dispatchRouted({ workId:opt('--work'),attempt:Number(opt('--attempt') || 1),...(opt('--invocation')?{invocationId:opt('--invocation')}:{}),...(opt('--request-key')?{reserveKey:opt('--request-key')}: {}) }));
    else if (operation === 'publish') {
      const request = json(resolve(opt('--request-file') || ''));
      print(await host.publish({ workId: opt('--work'), message: request.message, trailers: request.trailers, commitIdentity: request.commit_identity }));
    } else if (operation === 'observe-quota') print(await host.observeQuota());
    else if (operation === 'redistribute') print(await host.driveQuotaHandover());
    else if (operation === 'recover-publication') print(host.recoverPublication({ gitChildStopped: flag('--git-child-confirmed-stopped') }));
    else throw new Error('host-operation-required:native-work-revise|native-work-publish|native-work-publish-recover|native-work-publish-abort|native-work-review|native-work-review-recover|native-work-plan|native-work-plan-recover|native-work-plan-review|native-work-plan-review-recover|native-work-capture|native-work-execute|native-work-enable|native-work-manifest|native-work-cancel|native-leader-resume|native-delivery-enable|native-control-reconcile|unknown-usage-accept|native-quota-enable|native-handover-enable|native-quota-observe|native-quota-handover|native-handover-ack|native-handover-recover|bootstrap|subscription-bootstrap|calibration-cohort-open|calibration-trial|calibration-summary|calibration-policy-proposal|native-policy-install|model-inventory|protocol-control-enable|protocol-review-enable|native-leader-ack|native-leader-ack-recover|native-leadership-audit|native-leadership-audit-recover|register-participant-host|inspect|relay|review|checkout|candidate|dispatch|publish|recover-publication');
    return;
  }
  // Slice 7 (owner, 2026-10-11): the owner opens a plan request, reads the leader's exact proposal and installs it whole.
  if (mode === 'plan') {
    const v = loaded(), t = v.state?.teams[target]; if (!t) throw new Error('team-not-found');
    if (flag('--request')) {
      print(await (await hostOf()).requestWorkPlan({ planId: opt('--plan-id'), goal: opt('--goal'), base: opt('--base'), scope: idList(opt('--scope')), forbiddenActions: idList(opt('--forbidden')), maxWorks: Number(opt('--max-works')), ...(flag('--critic') ? { critic: true } : {}) }));
    } else if (flag('--install')) {
      const c = consent({ yes: flag('--yes'), reason: opt('--reason') });
      if (!c.ok) throw new Error('owner-consent-required: pass --yes and --reason "<why>"');
      print(await (await hostOf()).installWorkPlan({ planId: opt('--plan-id'), digest: opt('--digest'), reason: c.reason }));
    } else print({ revision: v.revision, team: t.id, plans: workPlanListing(t) });
    return;
  }
  if (mode === 'status') {
    const v = loaded(); const t = v.state?.teams[target];
    if (target && !t) throw new Error('team-not-found');
    print({ revision: v.revision, authority: root, teams: t ? [publicTeam(t,flag('--model-inventory'))] : Object.values(v.state?.teams || {}).map(team=>publicTeam(team,flag('--model-inventory'))) }); return;
  }
  if (mode === 'roles') {
    const v = loaded(); const t = v.state?.teams[target];
    if (!t) throw new Error('team-not-found');
    if (!flag('--assign')) {
      let hints = null, hintError = null;
      if (opt('--cohort')) try { const sum = buildAuthenticatedCalibrationSummary({ teamId: target, cohortId: opt('--cohort'), loaded: v }); hints = Object.fromEntries(sum.profiles.map(p => [p.participant, p.roles.map(r => ({ role: r.role, qualified: Boolean(r.qualification_candidate), current: Boolean(r.current) }))])); } catch (error) { hints = {}; hintError = error.code || error.message; }
      const out = { ...rolesListing(v.state, t, hints), ...(hintError ? { hint_error: hintError } : {}) };
      if (flag('--json')) { print(out); return; }
      const w = process.stdout.write.bind(process.stdout);
      w(`team ${out.team}: policy ${out.policy.mode} r${out.policy.revision}, expires ${out.policy.expires_at}${out.policy.expired ? ' (EXPIRED)' : ''}\n`);
      if (out.hint_error) w(`  calibration hint unavailable: ${out.hint_error}\n`);
      if (out.policy.assignment) { const a = out.policy.assignment; w(`  assigned: coordinator ${a.coordinator.join(',')} | reviewers ${a.reviewers.join(',')} | executors ${a.executors.join(',') || '-'}\n  reason: ${a.reason}\n`); }
      for (const p of out.participants) {
        const i = p.identity;
        w(`${p.participant}  ${p.harness}  ${p.model?.provider}/${p.model?.model_id} (${p.model?.reasoning})  surface ${p.surface}${p.revoked ? '  REVOKED' : ''}\n`);
        w(i ? `    identity ${i.profile_id.slice(0, 27)}  native-model ${i.native_model}  reasoning ${i.reasoning}  version ${i.version}  tools ${JSON.stringify(i.tool_surface)}  observed ${i.observed_at}  expires ${i.expires_at}${i.expired ? ' (EXPIRED)' : ''}\n` : '    identity none observed (run `team host --operation subscription-bootstrap`)\n');
        if (p.binary) w(p.binary.verified === false ? `    binary ${p.binary.version ?? 'unknown'} UNVERIFIED (${p.binary.blocker}): re-probe before assigning\n` : `    binary ${p.binary.version ?? 'unknown'} ${p.binary.verified ? 'verified' : 'not pinned'}\n`);
        if (p.calibration_hint) w(`    hint (advisory): ${p.calibration_hint.map(r => r.role + (r.qualified ? ' qualified' : ' not qualified')).join(', ')}\n`);
      }
      w('assign: waypost team roles ' + target + ' --assign --coordinator a,b --reviewers c,d [--executors e] --reason "<why>" --yes\n');
      return;
    }
    // A binary this transport has not verified would fail at the first native call; say so now.
    const unverified = [...new Set(['--coordinator', '--reviewers', '--executors'].flatMap(k => idList(opt(k))))].filter(id => t.participants[id] && participantBinary(t.participants[id])?.verified === false);
    if (unverified.length) throw new Error('native-binary-unverified:' + unverified.map(id => id + '(' + participantBinary(t.participants[id]).blocker + ')').join(','));
    const c = consent({ yes: flag('--yes'), reason: opt('--reason') });
    if (!c.ok) throw new Error('owner-consent-required: pass --yes and --reason "<why>"');
    assignFields = ownerAssignFields(v.state, t, { coordinator: opt('--coordinator'), reviewers: opt('--reviewers'), executors: opt('--executors'), reason: c.reason, expiresAt: opt('--expires-at'), issuedBy: { harness: detectHarness(), session: sessionId() } });
    mode = 'native-policy-assign-v2';
  }
  if (mode === 'route') {
    const v = loaded(), t = v.state?.teams[target]; if (!t) throw new Error('team-not-found');
    const manifest = json(resolve(opt('--request-file') || ''));
    // Collector installation is intentionally required. No --evidence-file or
    // client-supplied trusted:true assertion can authorize economical execution.
    print({ revision: v.revision, ...proposeModelRoute({ manifest, participants: Object.values(t.participants), policy: t.policy }) }); return;
  }
  if (mode === 'recover') {
    if (!flag('--owner-confirmed-stopped')) { print(explainRecovery(root)); return; }
    const v = loaded(), proof=explainRecovery(root).owner;
    if(!v.state && proof?.actor==='legacy') {
      if(!Number.isSafeInteger(proof.pid))throw new Error('legacy-lock-process-proof-required');
      try {process.kill(proof.pid,0);throw new Error('legacy-lock-process-still-running');}
      catch(e){if(e.code!=='ESRCH')throw e;}
      print(recoverLock(root,{ownerConfirmedStopped:true}));return;
    }
    const cred = loadCredential(resolve(opt('--owner-credential') || defaultOwner));
    if (v.state) {
      if (authorizeActor(v.state, target, cred) !== 'owner:' + v.state.owner_hash) throw new Error('owner-required');
    } else {
      if(cred.role!=='owner' || proof?.actor!=='owner:'+cred.token_hash)throw new Error('initialization-owner-proof-required');
    }
    print(recoverLock(root, { ownerConfirmedStopped: true })); return;
  }
  if (mode === 'poll') {
    const v = loaded(), cred = loadCredential(resolve(opt('--credential') || ''));
    const actor = authorizeActor(v.state, target, cred), t = v.state.teams[target];
    if (actor.startsWith('owner:')) throw new Error('participant-credential-required');
    let cursor = { team: target, participant: actor, incarnation: cred.incarnation, offset: 0 };
    if (opt('--cursor')) cursor = JSON.parse(Buffer.from(opt('--cursor'), 'base64url').toString('utf8'));
    if (cursor.team !== target || cursor.participant !== actor || cursor.incarnation !== cred.incarnation || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > t.messages.length) throw new Error('invalid-addressed-cursor');
    const byteLimit = Number(opt('--max-bytes') || 1048576);
    if (!Number.isSafeInteger(byteLimit) || byteLimit < 262144 || byteLimit > 1048576) throw new Error('poll-byte-limit-must-be-262144-to-1048576');
    let end = cursor.offset, bytes = 0; const messages = [];
    while (end < Math.min(cursor.offset + 100, t.messages.length)) {
      const m = t.messages[end];
      if (m.recipient === actor && m.incarnation === cred.incarnation) {
        const size = Buffer.byteLength(JSON.stringify(m));
        if (bytes + size > byteLimit) { if (!messages.length) throw new Error('message-exceeds-poll-byte-limit'); break; }
        messages.push(m); bytes += size;
      }
      end++;
    }
    print({ revision: v.revision, epoch: t.epoch, messages, cursor: Buffer.from(JSON.stringify({ ...cursor, offset: end })).toString('base64url') }); return;
  }
  if (mode === 'refresh' || mode === 'watch') {
    const interval = Number(opt('--interval') || 300); if (!Number.isFinite(interval) || interval < 5 || interval > 86400) throw new Error('interval-must-be-5-to-86400-seconds');
    const { discoverStrength } = await import('./model-strength.mjs');
    const config = json(join(dirname(dirname(fileURLToPath(import.meta.url))), 'models', 'strength-sources.json'));
    let cache = loaded().state?.teams[target]?.strength_check?.cache || null;
    let stopped = false, lastNativeCheck = 0, lastNativeDigest = null;
    const stop = () => { stopped = true; };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try {
      do {
        const passStart = Date.now();
        let v = loaded(), t = v.state?.teams[target]; if (!t) throw new Error('team-not-found');
        const cred = loadCredential(resolve(opt('--owner-credential') || defaultOwner));
        const actor = authorizeActor(v.state, target, cred); if (!actor.startsWith('owner:')) throw new Error('owner-required');
        const inventoryInspections=[],inventoryScopes=new Set();
        for(const p of Object.values(t.participants).filter(p=>p.native_binding&&!p.revoked&&p.availability!=='left'&&inventoryDue(t.model_inventory?.[p.id]))){if(stopped)break;
          const {createTeamHost}=await import('./team-host.mjs'),b=p.native_binding;
          if(inventoryScopes.has(b.descriptor_digest))continue;
          inventoryScopes.add(b.descriptor_digest);
          try{
            const host=createTeamHost({authorityRoot:root,projectRoot:projectRoot(),vaultPath:cfg.vault_path,team:target,hostDir:join(root,'host',target),ownerCredential:resolve(opt('--owner-credential')||defaultOwner),collectorPath:b.collector_file,endpointPath:b.endpoint_file,participant:p.id});
            const observation=await host.observeModelInventory();inventoryInspections.push({participant:p.id,...observation});
          }catch{inventoryInspections.push({participant:p.id,inventory:false,blocker:'inventory-host-unavailable'});}
        }
        v=loaded();t=v.state.teams[target];
        const quotaInspections=[];
        if(t.quota_policy?.automatic_redistribution){
          const {createTeamHost}=await import('./team-host.mjs');
          for(const p of Object.values(t.participants).filter(p=>p.native_binding&&!p.revoked&&p.availability!=='left')){if(stopped)break;
            const b=p.native_binding;
            try{
              const host=createTeamHost({authorityRoot:root,projectRoot:projectRoot(),vaultPath:cfg.vault_path,team:target,hostDir:join(root,'host',target),ownerCredential:resolve(opt('--owner-credential')||defaultOwner),collectorPath:b.collector_file,endpointPath:b.endpoint_file,participant:p.id});
              const receipt=await host.observeQuota();quotaInspections.push({participant:p.id,verified:true,...receipt});
            }catch(error){quotaInspections.push({participant:p.id,verified:false,blocker:String(error.code||error.message).slice(0,256)});}
          }
          v=loaded();t=v.state.teams[target];
        }
        const inspections = [];
        for (const p of Object.values(t.participants).filter(p => t.policy.protocol!==2 && nativeInspectionDue(p))) {if(stopped)break;
          // A strict budget needs a provider-backed control reservation. Never
          // turn a periodic freshness check into an unaccounted paid call.
          if (t.routing?.required) { inspections.push({ participant:p.id, verified:false, blocker:'bounded-control-invocation-required' }); continue; }
          const { createTeamHost } = await import('./team-host.mjs');
          const b = p.native_binding;
          try {
            const host = createTeamHost({ authorityRoot:root, projectRoot:projectRoot(), vaultPath:cfg.vault_path,
              team:target, hostDir:join(root,'host',target), ownerCredential:resolve(opt('--owner-credential') || defaultOwner),
              collectorPath:b.collector_file, endpointPath:b.endpoint_file, participant:p.id,
              dispatcher:resolve(dirname(fileURLToPath(import.meta.url)),'../bin/waypost') });
            const receipt = await host.inspect({ action:'periodic-identity:'+target+':'+p.id+':'+randomUUID() });
            inspections.push({ participant:p.id, verified:true, nonce:receipt.nonce });
          } catch (error) {
            inspections.push({ participant:p.id, verified:false, blocker:String(error.code || error.message).slice(0,256) });
          }
        }
        v=loaded(); t=v.state.teams[target];
        // A provider-account lease lasts at most 60s; each bound Host renews its
        // own one when it is due, so idle participants stay eligible.
        const nativeQuotaInspections=[];
        if(t.policy.protocol===2&&t.native_quota_policy){
          const {createTeamHost}=await import('./team-host.mjs');
          for(const p of Object.values(t.participants).filter(p=>p.native_binding&&!p.revoked&&p.availability!=='left'&&p.native_protocol_quota?.proof.status==='available')){if(stopped)break;
            const b=p.native_binding;
            try{
              const host=createTeamHost({authorityRoot:root,projectRoot:projectRoot(),vaultPath:cfg.vault_path,team:target,hostDir:join(root,'host',target),ownerCredential:resolve(opt('--owner-credential')||defaultOwner),collectorPath:b.collector_file,endpointPath:b.endpoint_file,participant:p.id});
              nativeQuotaInspections.push({participant:p.id,...await host.maintainNativeQuotaLease()});
            }catch(error){nativeQuotaInspections.push({participant:p.id,renewed:false,blocker:typeof error.code==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(error.code)?error.code:'native-quota-host-unavailable'});}
          }
          v=loaded();t=v.state.teams[target];
        }
        if(t.policy.protocol===2){
          const at=new Date().toISOString(),expired=Date.now()>=Date.parse(t.policy.expires_at);
          // With a native quota policy, renewal runs every pass; the owner check is
          // written at the owner's interval, or at once when what a pass found
          // (other than routine renewals) differs from the last written check.
          const digest=JSON.stringify(nativeQuotaInspections.filter(x=>x.renewed!==true&&!['not-due','renewed-concurrently'].includes(x.reason)).map(x=>[x.participant,x.reason||null,x.blocker||null,x.status||null]));
          const notable=inventoryInspections.length||digest!==lastNativeDigest;
          // Under the team's own publication fence the check would only queue as deferred.
          const fenced=mode==='watch'&&v.state.publication_fence?.team===target;
          if(fenced||mode==='watch'&&t.native_quota_policy&&lastNativeCheck&&!notable&&!expired&&Date.now()-lastNativeCheck<interval*1000){
            print({refreshed:false,checked:false,...(fenced?{reason:'publication-fence'}:{}),native_quota_inspections:nativeQuotaInspections});
            for(let elapsed=0;elapsed<Math.max(1,30-Math.floor((Date.now()-passStart)/1000))&&!stopped;elapsed++)await sleep(1000);
            continue;
          }
          const check={at,ok:!expired,kind:'native-calibration',blockers:expired?[t.policy.mode==='owner-assigned'?'owner-assignment-expired':'native-calibration-expired-new-measurement-required']:[],inventory_inspections:inventoryInspections,native_inspections:inspections,native_quota_inspections:nativeQuotaInspections};
          if(Buffer.byteLength(JSON.stringify(check))>200000)throw new Error('strength-evidence-exceeds-authority-budget');
          const command={type:'strength-check',team:target,actor,at,check};
          try{
            const out=mutateAuthority(root,{key:randomUUID(),actor,expected_revision:v.revision,command},reduceTeamEvent,{authorize:state=>{if(authorizeActor(state,target,cred)!==actor)throw new Error('owner-changed');}});
            lastNativeCheck=Date.now();lastNativeDigest=digest;
            print({refreshed:false,calibration_renewed:false,inventory_inspections:inventoryInspections,native_quota_inspections:nativeQuotaInspections,...out});
          }catch(error){if(mode!=='watch'||!['authority-stale-revision','authority-locked'].includes(error.code))throw error;print({refreshed:false,retry:error.code});}
          if(mode!=='watch')break;
          const wait=t.native_quota_policy?Math.max(1,30-Math.floor((Date.now()-passStart)/1000)):Math.min(interval,60);
          for(let elapsed=0;elapsed<wait&&!stopped;elapsed++)await sleep(1000);
          continue;
        }
        const historical = (t.required_review_models || []).map(([provider, model_id, reasoning]) => ({ provider, model_id, reasoning }));
        const result = await discoverStrength({ participants: [...Object.values(t.participants), ...historical], domain: t.policy.domain, config, cache, now: Date.now() });
        cache = result.cache;
        const latest = loaded();
        const currentTeam = latest.state?.teams[target];
        const cohort = team => JSON.stringify([team?.policy, team?.participants, team?.required_review_models]);
        if (cohort(currentTeam) !== cohort(t)) {
          print({ refreshed: false, retry: 'cohort-changed-during-discovery' });
          if (mode !== 'watch') break;
          await sleep(1000); continue;
        }
        v = latest; t = currentTeam;
        const at = new Date().toISOString();
        const check = { at, ok: result.ok, blockers: result.blockers, unclassified: result.unclassified, profile_proofs: result.profile_proofs || [], native_inspections:inspections, quota_inspections:quotaInspections, inventory_inspections:inventoryInspections, cache };
        if (Buffer.byteLength(JSON.stringify(check)) > 200000) throw new Error('strength-evidence-exceeds-authority-budget');
        let command = { type: 'strength-check', actor, team: target, at, check };
        let changed = false;
        if (result.ok && (!result.unclassified?.length || !Object.keys(t.participants).length)) {
          const policy = validatePolicy({ ...result.policy, revision: t.policy.revision });
          changed = policyStrengthShape(policy) !== policyStrengthShape(t.policy);
          if (changed) policy.revision++;
          command = { ...command, type: changed ? 'policy' : 'strength-check', policy };
        }
        let out;
        try { out = mutateAuthority(root, { key: randomUUID(), actor, expected_revision: v.revision, command }, reduceTeamEvent, {authorize: state => { if(authorizeActor(state,target,cred)!==actor)throw new Error('owner-changed'); }}); }
        catch (error) {
          if (mode !== 'watch' || !['authority-stale-revision', 'authority-locked'].includes(error.code)) throw error;
          print({ refreshed: false, retry: error.code });
          await sleep(1000); continue;
        }
        print({ refreshed: Boolean(command.policy), priorities_changed: changed, ...out, blockers: result.blockers, unclassified: result.unclassified, native_inspections:inspections, quota_inspections:quotaInspections, inventory_inspections:inventoryInspections, identity_inspection: 'managed bound endpoints checked when due; unbound sessions remain unverified' });
        if (mode !== 'watch') break;
        // Provider permission lasts at most 60s. Renew before expiry, independently
        // of the owner's longer strength polling interval (discovery uses cache).
        const delay=t.quota_policy?.automatic_redistribution?Math.min(interval,30):Math.min(interval,60);
        for (let elapsed = 0; elapsed < delay && !stopped; elapsed++) await sleep(1000);
      } while (!stopped);
    } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
    return;
  }
  const v = loaded(); const at = new Date().toISOString();
  let cred, command, team = target;
  if (opt('--request-file') && opt('--request-json')) throw new Error('choose-one-request-input');
  const inline = opt('--request-json');
  if (inline && Buffer.byteLength(inline) > 65536) throw new Error('request-json-too-large');
  const supplied = inline ? JSON.parse(inline) : opt('--request-file') ? json(resolve(opt('--request-file'))) : {};
  const key = opt('--request-key') || supplied.request_key || randomUUID();
  if (mode === 'create') {
    cred = ownerCredential(resolve(opt('--owner-credential') || defaultOwner));
    const task = taskKey(target, cfg); team = opt('--id') || 'team-' + randomUUID();
    const foreign = claimsOf(cfg.vault_path).filter(x => x.session !== sessionId() && x.story && task.endsWith(x.story.split('/').at(-1) + '.md'));
    if (foreign.length) throw new Error('foreign-story-claim-requires-handoff');
    command = { type: 'create', team, task, owner_hash: cred.token_hash, ...(argv.includes('--native-policy-bootstrap')?{native_policy_bootstrap:true}:{quota_policy:{protocol:1,automatic_redistribution:true}}), policy: opt('--policy') ? json(resolve(opt('--policy'))) : bootPolicy(at) };
  } else if (mode === 'join') {
    cred = loadCredential(resolve(opt('--owner-credential') || defaultOwner));
    const path = opt('--credential'); if (!path) throw new Error('join-needs-credential-output-path');
    let seed;
    if (existsSync(resolve(path))) { seed = json(resolve(path)); if (seed.team !== team || !seed.join_command) throw new Error('credential-file-already-used'); command = seed.join_command; }
    else {
      const model = json(resolve(opt('--model') || ''));
      const p = createParticipant({ session: sessionId(), harness: opt('--harness') || detectHarness(), root: projectRoot(), model });
      if (opt('--surface')) p.surface = opt('--surface');
      const token = randomBytes(32).toString('hex'); p.credential_hash = sha(token);
      command = { type: 'join', team, participant: p, epoch: v.state?.teams[team]?.epoch ?? 0 };
      seed = { protocol: 1, role: 'participant', token, team, participant: p.id, incarnation: p.incarnation, request_key: key, join_command: command, join_at: at };
      writeCredential(resolve(path), seed);
    }
    command = { ...command, request_key: seed.request_key, at: seed.join_at }; 
  } else {
    const ownerModes = new Set(['subscription-accounting-enable-v2','subscription-allocation-update-v2','subscription-reserve-v2','subscription-abort-v2','subscription-accounting-enable-v1','subscription-allocation-update-v1','subscription-reserve-v1','subscription-abort-v1','participant-host-register-v1','quota-policy-enable-v1','policy','attest','revoke','close','routing-enable','routing-enable-v2','collector-register-v1','collector-revoke-v1','control-invocation-reserve-v1','native-binding-v1','native-policy-assign-v2','runtime-request-v1','begin-handover-v1','deferred-apply-v1','deferred-discard-v1','close-v1']);
    cred = loadCredential(resolve(opt(ownerModes.has(mode) ? '--owner-credential' : '--credential') || (ownerModes.has(mode) ? defaultOwner : '')));
    command = { ...supplied, type: mode, team };
    if (assignFields) Object.assign(command, assignFields);
    if (mode === 'policy') command.policy = json(resolve(opt('--policy') || ''));
    if (mode === 'attest') { command.participant_id = opt('--participant'); command.model = json(resolve(opt('--model') || '')); }
    if (mode === 'revoke') command.participant_id = opt('--participant');
    if (mode === 'send') Object.assign(command, { to: opt('--to') || supplied.to, kind: opt('--kind') || supplied.kind, payload: supplied.payload ?? {}, reply_to: supplied.reply_to });
    if (mode === 'ack') command.message = opt('--message') || supplied.message;
    if (mode === 'availability') command.availability = opt('--availability');
    if (['submit','work-ack','supervise','cancel'].includes(mode)) command.work_id = opt('--work') || supplied.work_id;
  }
  const actor = authorizeActor(v.state, team, cred);
  command = { ...command, actor, incarnation: cred.incarnation || null, epoch: command.epoch ?? supplied.epoch ?? Number(opt('--epoch') ?? v.state?.teams[team]?.epoch ?? 0), request_key: command.request_key || key, at: command.at || supplied.at || at };
  const revision = Number(opt('--revision') ?? v.revision);
  print(mutateAuthority(root, { key: command.request_key, actor, expected_revision: revision, command }, reduceTeamEvent, {
    confirmedLocal: flag('--confirm-local'),
    authorize: state => {if(authorizeActor(state,team,cred)!==actor)throw new Error('authority-actor-changed');},
    validateNew: (_state,c) => {
      if(c.type==='create' && claimsOf(cfg.vault_path).some(x=>x.session!==sessionId() && x.story && c.task.endsWith(x.story.split('/').at(-1)+'.md')))throw new Error('foreign-story-claim-requires-handoff');
    },
  }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { process.stderr.write('waypost team: ' + e.message + '\n'); process.exitCode = 1; });
}
