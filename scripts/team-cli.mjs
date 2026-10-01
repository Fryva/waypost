#!/usr/bin/env node
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
const sha = value => createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
function publicTeam(t) {
  const result = structuredClone(t);
  for (const p of Object.values(result.participants)) {
    delete p.credential_hash;
    p.surface ??= 'unknown';
    p.delivery_capabilities = { native_session_binding: 'unverified', send_existing: 'unverified', wake: 'unverified', inspect_model: 'unverified' };
  }
  result.policy_stale = result.policy.mode === 'automatic' && Date.now() >= Date.parse(result.policy.expires_at);
  result.delivery = 'cooperative; native delivery not yet verified';
  return result;
}
export async function main(argv = process.argv.slice(2)) {
  const [mode, target] = argv;
  const flag = key => argv.includes(key);
  const opt = key => { const i = argv.indexOf(key); if (i < 0) return undefined; if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('missing-value:' + key); return argv[i + 1]; };
  const cfg = readConfig(); if (!cfg?.vault_path) throw new Error('bind-a-vault-before-team-commands');
  const root = join(coordinationDirs(cfg.vault_path).primary, 'teams', 'authority');
  const loaded = () => readAuthority(root, reduceTeamEvent);
  const defaultOwner = join(projectRoot(), '.waypost', 'team-owner.json');
  const print = value => process.stdout.write(JSON.stringify(value, null, flag('--compact') ? 0 : 2) + '\n');
  if (mode === 'status') {
    const v = loaded(); const t = v.state?.teams[target];
    if (target && !t) throw new Error('team-not-found');
    print({ revision: v.revision, authority: root, teams: t ? [publicTeam(t)] : Object.values(v.state?.teams || {}).map(publicTeam) }); return;
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
    const v = loaded(), cred = loadCredential(resolve(opt('--owner-credential') || defaultOwner));
    if (authorizeActor(v.state, target, cred) !== 'owner:' + v.state.owner_hash) throw new Error('owner-required');
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
    let stopped = false;
    const stop = () => { stopped = true; };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try {
      do {
        let v = loaded(), t = v.state?.teams[target]; if (!t) throw new Error('team-not-found');
        const cred = loadCredential(resolve(opt('--owner-credential') || defaultOwner));
        const actor = authorizeActor(v.state, target, cred); if (!actor.startsWith('owner:')) throw new Error('owner-required');
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
        const check = { at, ok: result.ok, blockers: result.blockers, unclassified: result.unclassified, profile_proofs: result.profile_proofs || [], cache };
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
        try { out = mutateAuthority(root, { key: randomUUID(), actor, expected_revision: v.revision, command }, reduceTeamEvent); }
        catch (error) {
          if (mode !== 'watch' || !['authority-stale-revision', 'authority-locked'].includes(error.code)) throw error;
          print({ refreshed: false, retry: error.code });
          await sleep(1000); continue;
        }
        print({ refreshed: Boolean(command.policy), priorities_changed: changed, ...out, blockers: result.blockers, unclassified: result.unclassified, identity_inspection: 'unverified; refresh evaluates currently enrolled exact descriptors' });
        if (mode !== 'watch') break;
        for (let elapsed = 0; elapsed < interval && !stopped; elapsed++) await sleep(1000);
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
    command = { type: 'create', team, task, owner_hash: cred.token_hash, policy: opt('--policy') ? json(resolve(opt('--policy'))) : bootPolicy(at) };
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
    const ownerModes = new Set(['policy','attest','revoke','close','routing-enable']);
    cred = loadCredential(resolve(opt(ownerModes.has(mode) ? '--owner-credential' : '--credential') || (ownerModes.has(mode) ? defaultOwner : '')));
    command = { ...supplied, type: mode, team };
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
  print(mutateAuthority(root, { key: command.request_key, actor, expected_revision: revision, command }, reduceTeamEvent, { confirmedLocal: flag('--confirm-local') }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { process.stderr.write('waypost team: ' + e.message + '\n'); process.exitCode = 1; });
}
