// Dedicated integration Git plumbing. Called only after the authority persists its fence.
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve, join, parse } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

function fail(code) { const e = new Error(code); e.code = code; throw e; }
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function safe(p) {
  p = resolve(p); let at = parse(p).root;
  for (const part of p.slice(at.length).split(/[\\/]/).filter(Boolean)) {
    at = join(at, part);
    try { if (lstatSync(at).isSymbolicLink()) fail('integration-symlink'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return p;
}
function id(v) { if (typeof v !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(v)) fail('integration-invalid-id'); return v; }
function oid(v) { if (typeof v !== 'string' || !/^[a-f0-9]{40,64}$/.test(v)) fail('integration-invalid-oid'); return v; }
function paths(values) {
  if (!Array.isArray(values) || !values.length || values.length > 512) fail('integration-invalid-scope');
  for (const p of values) if (typeof p !== 'string' || p.length > 4096 || p.startsWith('/') || /[\\\0\r\n:*?\[\]]/.test(p) || p.split('/').some(s => !s || s === '.' || s === '..' || s.toLowerCase() === '.git')) fail('integration-invalid-path');
  return [...new Set(values)].sort();
}
function env(extra = {}) {
  const e = { ...process.env };
  for (const key of Object.keys(e)) if (key.startsWith('GIT_')) delete e[key];
  return { ...e, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', ...extra };
}
function git(cwd, args, extra = {}, input) {
  const r = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-C', cwd, ...args], { env: env(extra), input, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  if (r.error || r.status !== 0) { const e = new Error('integration-git-failed: ' + String(r.stderr || r.error?.message || '').slice(0, 500)); e.code = 'integration-git-failed'; throw e; }
  return r.stdout.trimEnd();
}
function check(checkout) {
  if (!checkout || typeof checkout !== 'object') fail('integration-checkout-required');
  safe(checkout.record); safe(checkout.path);
  if (lstatSync(checkout.record).size > 16384) fail('integration-record-too-large');
  const stored = JSON.parse(readFileSync(checkout.record, 'utf8'));
  if (hash(stored) !== hash(checkout) || stored.protocol !== 1 || !/^[a-f0-9]{64}$/.test(stored.capability)) fail('integration-ownership-mismatch');
  if (realpathSync(stored.path) !== stored.path || resolve(git(stored.path, ['rev-parse', '--git-common-dir'])) !== stored.common_dir) {
    // Git reports linked common dirs relative to cwd on some versions.
    if (resolve(stored.path, git(stored.path, ['rev-parse', '--git-common-dir'])) !== stored.common_dir) fail('integration-repository-mismatch');
  }
  if (git(stored.path, ['symbolic-ref', 'HEAD']) !== stored.ref) fail('integration-head-not-owned');
  if (/^filter\./m.test(git(stored.path, ['config', '--local', '--list']))) fail('integration-repository-filters-unsupported');
  safe(stored.index); return stored;
}
function changed(checkout) {
  return [...new Set([
    ...git(checkout.path, ['diff', '--name-only', '-z', checkout.base]).split('\0'),
    ...git(checkout.path, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0')
  ].filter(Boolean))].sort();
}
export function createIntegrationCheckout({ projectRoot, authorityDir, teamId, workId, base }) {
  projectRoot = realpathSync(safe(projectRoot)); authorityDir = safe(authorityDir);
  teamId = id(teamId); workId = id(workId); base = oid(base || git(projectRoot, ['rev-parse', 'HEAD']));
  // Checkout/add must not execute arbitrary repository-configured clean/smudge helpers.
  if (/^filter\./m.test(git(projectRoot, ['config', '--local', '--list']))) fail('integration-repository-filters-unsupported');
  const directory = safe(join(authorityDir, 'integrations', teamId, workId));
  if (existsSync(directory)) fail('integration-already-exists');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const checkout = { protocol: 1, team_id: teamId, work_id: workId, base, path: join(directory, 'checkout'), index: join(directory, 'index'), record: join(directory, 'ownership.json'), capability: randomBytes(32).toString('hex'), common_dir: realpathSync(resolve(projectRoot, git(projectRoot, ['rev-parse', '--git-common-dir']))), ref: `refs/waypost/teams/${teamId}/${workId}/${randomBytes(8).toString('hex')}` };
  git(projectRoot, ['worktree', 'add', '--detach', checkout.path, base]);
  git(checkout.path, ['update-ref', checkout.ref, base, '0'.repeat(base.length)]);
  git(checkout.path, ['symbolic-ref', 'HEAD', checkout.ref]);
  writeFileSync(checkout.record, JSON.stringify(checkout) + '\n', { flag: 'wx', mode: 0o600 });
  return checkout;
}
export function collectCandidate({ checkout, scope, testDigests = [], reconcile }) {
  checkout = check(checkout); scope = paths(scope);
  if (git(checkout.path, ['rev-parse', 'HEAD']) !== checkout.base) fail('integration-base-changed');
  if (git(checkout.path, ['diff', '--cached', '--name-only'])) fail('integration-unrelated-staged');
  // Reconcile belongs to the dispatcher, before pinning; the callback is trusted host code.
  if (reconcile !== undefined && typeof reconcile !== 'function') fail('integration-invalid-reconciler');
  const reconciliation = reconcile ? reconcile(checkout.path) : { required: false };
  if ((existsSync(join(checkout.path, '.waypost', 'projectstore.json')) || existsSync(join(checkout.path, '.claude', 'projectstore.json'))) && !reconcile) fail('integration-reconciler-required');
  if (reconciliation?.then) fail('integration-async-reconciler');
  if (!reconciliation || reconciliation.ok === false) fail('integration-reconcile-failed');
  const actual = changed(checkout);
  if (!actual.length) fail('integration-empty-candidate');
  if (actual.some(p => !scope.includes(p))) fail('integration-outside-scope');
  for (const p of actual) safe(join(checkout.path, p));
  if (!Array.isArray(testDigests) || testDigests.length > 128 || testDigests.some(d => typeof d !== 'string' || !/^[a-f0-9]{64}$/.test(d))) fail('integration-invalid-test-digest');
  const indexEnv = { GIT_INDEX_FILE: checkout.index };
  git(checkout.path, ['read-tree', checkout.base], indexEnv);
  git(checkout.path, ['add', '-A', '--', ...actual], indexEnv);
  const tree = git(checkout.path, ['write-tree'], indexEnv);
  const candidate = { protocol: 1, team_id: checkout.team_id, work_id: checkout.work_id, checkout_capability: checkout.capability, base: checkout.base, parents: [checkout.base], tree, paths: actual, test_digests: [...testDigests].sort(), reconciliation_digest: hash(reconciliation) };
  return { ...candidate, digest: hash(candidate) };
}
function verify(checkout, candidate, reservation) {
  checkout = check(checkout);
  const { digest, ...body } = candidate || {};
  if (digest !== hash(body) || candidate.checkout_capability !== checkout.capability || candidate.base !== checkout.base || candidate.team_id !== checkout.team_id || candidate.work_id !== checkout.work_id) fail('integration-candidate-mismatch');
  oid(candidate.tree); paths(candidate.paths);
  if (!reservation || reservation.state !== 'publishing' || !reservation.id || reservation.candidate_digest !== digest || reservation.expected_head !== candidate.base || reservation.tree !== candidate.tree || JSON.stringify(reservation.parents) !== JSON.stringify(candidate.parents) || !Array.isArray(reservation.reviews) || !reservation.reviews.length) fail('integration-reservation-mismatch');
  return checkout;
}
function commitText(message, trailers, checkout, reservation) {
  if (typeof message !== 'string' || !message.trim() || message.length > 16384) fail('integration-invalid-message');
  const fields = { ...trailers, Team: checkout.team_id, Work: checkout.work_id, Review: reservation.reviews.join(','), Reservation: reservation.id };
  for (const name of ['Harness', 'Session', 'Provider', 'Story', 'Contributors', 'Team', 'Work', 'Review', 'Reservation']) if (typeof fields[name] !== 'string' || !fields[name] || /[\r\n\0]/.test(fields[name]) || fields[name].length > 4096) fail('integration-invalid-trailers');
  return message.trim() + '\n\n' + Object.entries(fields).filter(([k]) => ['Harness','Session','Provider','Story','Contributors','Team','Work','Review','Reservation'].includes(k)).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `Waypost-${k}: ${v}`).join('\n') + '\n';
}
export function publicationMessageDigest({ checkout, reservation, message, trailers }) {
  checkout = check(checkout);
  return hash(commitText(message, trailers, checkout, reservation));
}
export function publishCandidate({ checkout, candidate, reservation, message, trailers, fault }) {
  checkout = verify(checkout, candidate, reservation);
  if (git(checkout.path, ['rev-parse', checkout.ref]) !== reservation.expected_head) fail('integration-head-changed');
  // Re-stage only the approved paths in the private index and compare the entire tree.
  const current = collectCandidate({ checkout, scope: candidate.paths, testDigests: candidate.test_digests, reconcile: () => ({ required: false }) });
  if (current.tree !== candidate.tree) fail('integration-tree-changed');
  const text = commitText(message, trailers, checkout, reservation);
  if (reservation.commit_message_digest !== hash(text)) fail('integration-message-not-pinned');
  const identity = reservation.commit_identity;
  if (!identity || !/^[^\r\n<>]{1,200}$/.test(identity.name || '') || !/^[^\s<>]{1,200}@[^\s<>]{1,200}$/.test(identity.email || '') || !/^\d{10} \+0000$/.test(identity.date || '')) fail('integration-invalid-commit-identity');
  const commit = git(checkout.path, ['commit-tree', candidate.tree, '-p', candidate.base], { GIT_AUTHOR_NAME: identity.name, GIT_AUTHOR_EMAIL: identity.email, GIT_AUTHOR_DATE: identity.date, GIT_COMMITTER_NAME: identity.name, GIT_COMMITTER_EMAIL: identity.email, GIT_COMMITTER_DATE: identity.date }, text);
  fault?.('before-ref', commit);
  git(checkout.path, ['update-ref', checkout.ref, commit, reservation.expected_head]);
  fault?.('after-ref', commit);
  // This is the owned checkout's ordinary index, never the caller's staging area.
  git(checkout.path, ['read-tree', candidate.tree]);
  return { commit, tree: candidate.tree, parents: candidate.parents, ref: checkout.ref, state: 'published' };
}
export function reconcilePublication({ checkout, candidate, reservation, gitChildStopped = false }) {
  checkout = verify(checkout, candidate, reservation);
  if (gitChildStopped !== true) fail('integration-child-stop-proof-required');
  const commit = git(checkout.path, ['rev-parse', checkout.ref]);
  if (commit === reservation.expected_head) return { state: 'not-published', ref: checkout.ref };
  const tree = git(checkout.path, ['show', '-s', '--format=%T', commit]);
  const parents = git(checkout.path, ['show', '-s', '--format=%P', commit]).split(' ');
  const body = git(checkout.path, ['show', '-s', '--format=%B', commit]);
  const lines = body.split('\n');
  if (hash(body.trimEnd() + '\n') !== reservation.commit_message_digest) fail('integration-publication-message-conflict');
  if (tree !== candidate.tree || JSON.stringify(parents) !== JSON.stringify(candidate.parents) || !lines.includes(`Waypost-Team: ${checkout.team_id}`) || !lines.includes(`Waypost-Work: ${checkout.work_id}`) || !lines.includes(`Waypost-Review: ${reservation.reviews.join(',')}`) || !lines.includes(`Waypost-Reservation: ${reservation.id}`)) fail('integration-publication-conflict');
  git(checkout.path, ['read-tree', candidate.tree]);
  return { state: 'published', commit, tree, parents, ref: checkout.ref, recovered: true };
}
