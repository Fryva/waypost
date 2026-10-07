// Dedicated integration Git plumbing. Called only after the authority persists its fence.
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync, realpathSync, openSync, writeSync, closeSync, renameSync, unlinkSync, constants } from 'node:fs';
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

// ---- Protocol 2 leader-baseline work (slice 1): inputs come from Git objects of
// the manifest's base commit only, never the working tree; the executor's patch
// is checked as a whole and kept as an unpublished private ref to a blob, so
// recovery reads it from Git rather than from Host files.
export const WORK_PATCH_REF = /^refs\/waypost\/patches\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[0-9]+-[0-9]+-[A-Za-z0-9_]+$/;
const WORK_FILE_LIMIT = 32768, WORK_PATCH_LIMIT = 65536, WORK_INPUT_LIMIT = 49152;
const foldKey = name => name.normalize('NFC').toLowerCase();
function utf8Text(buffer) { const text = buffer.toString('utf8'); if (text.includes('\0') || !Buffer.from(text, 'utf8').equals(buffer)) fail('work-input-not-utf8-text'); return text; }
// Every listed path is resolved from the top of the base tree, one directory at a
// time: each existing parent must be a directory (not a symlink, file or
// submodule), no sibling may differ only by case or Unicode normalisation, and
// an existing path must be a plain file. Only the parent directories are listed.
export function readWorkInputs({ projectRoot, base, paths }) {
  const root = safe(projectRoot); oid(base);
  if (git(root, ['rev-parse', '--verify', '--quiet', base + '^{commit}']) !== base) fail('work-input-base-commit-required');
  const listings = new Map();
  const list = dir => { if (!listings.has(dir)) listings.set(dir, git(root, ['ls-tree', '-z', '--full-tree', base, ...(dir ? ['--', dir + '/'] : [])]).split('\0').filter(Boolean).map(entry => { const tab = entry.indexOf('\t'), meta = entry.slice(0, tab), name = entry.slice(tab + 1), [mode, type, blob] = meta.split(' '); return { mode, type, blob, name }; })); return listings.get(dir); };
  const files = []; let total = 0;
  for (const path of paths) {
    const parts = path.split('/'); let found = null;
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join('/'), entries = list(parts.slice(0, i - 1).join('/'));
      if (entries.some(e => e.name !== prefix && foldKey(e.name) === foldKey(prefix))) fail('work-input-case-collision');
      const entry = entries.find(e => e.name === prefix);
      if (!entry) break;
      if (i < parts.length) { if (entry.mode !== '040000' || entry.type !== 'tree') fail('work-input-parent-not-directory'); continue; }
      if (entry.mode !== '100644' || entry.type !== 'blob') fail('work-input-plain-file-required');
      found = entry;
    }
    if (!found) { files.push({ path, blob_oid: null, content: null }); continue; }
    const r = spawnSync('git', ['-C', root, 'cat-file', 'blob', found.blob], { env: env(), timeout: 30000, maxBuffer: WORK_FILE_LIMIT + 1 });
    if (r.error || r.status !== 0 || r.stdout.length > WORK_FILE_LIMIT) fail('work-input-too-large');
    total += r.stdout.length; if (total > WORK_INPUT_LIMIT) fail('work-input-too-large');
    files.push({ path, blob_oid: found.blob, content: utf8Text(r.stdout) });
  }
  return { base, files };
}
export function workInputsDigest(inputs) { return createHash('sha256').update(JSON.stringify({ base: inputs.base, files: inputs.files.map(f => ({ path: f.path, blob_oid: f.blob_oid })) })).digest('hex'); }
// Strict whole-patch validation: {"files":[{"path","content"}]}, listed paths
// only, unique, bounded UTF-8 text without NUL. Returns files sorted by path.
export function validateWorkPatch(raw, paths, parseStrict) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > WORK_PATCH_LIMIT) fail('work-patch-too-large');
  let value; try { value = parseStrict(raw.trim(), WORK_PATCH_LIMIT); } catch { fail('work-patch-json-required'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value)) !== '["files"]' || !Array.isArray(value.files) || value.files.length > paths.length) fail('work-patch-shape-required');
  if (!value.files.length) fail('work-patch-empty');
  const seen = new Set();
  for (const f of value.files) {
    if (!f || typeof f !== 'object' || JSON.stringify(Object.keys(f).sort()) !== '["content","path"]' || !paths.includes(f.path) || seen.has(f.path) || typeof f.content !== 'string' || f.content.includes('\0') || (typeof f.content.isWellFormed === 'function' && !f.content.isWellFormed()) || Buffer.byteLength(f.content) > WORK_FILE_LIMIT) fail('work-patch-file-invalid');
    seen.add(f.path);
  }
  return { files: [...value.files].sort((a, b) => a.path < b.path ? -1 : 1) };
}
export function writeSealedPatch({ projectRoot, ref, patch }) {
  const root = safe(projectRoot);
  if (!WORK_PATCH_REF.test(ref)) fail('work-patch-ref-invalid');
  const blob = git(root, ['hash-object', '-w', '--stdin'], {}, JSON.stringify(patch));
  git(root, ['update-ref', ref, blob, '0'.repeat(blob.length)]);
  return { ref, blob };
}
// The caller checks the sealed patch digest recorded by the authority.
export function readSealedPatch({ projectRoot, ref }) {
  const root = safe(projectRoot);
  if (!WORK_PATCH_REF.test(ref) || git(root, ['cat-file', '-t', ref]) !== 'blob') fail('work-patch-ref-invalid');
  return JSON.parse(git(root, ['cat-file', 'blob', ref]));
}
// Applies a sealed patch to the dedicated checkout of its base, idempotently per
// file: a target must hold its base blob (or be absent) or already hold the
// patched content (a rerun after an interruption); blobs are compared with the
// repository's own conversions. Each file is written to a fresh sibling and
// renamed over the target, so a crash never leaves a half-written file and a
// link in the target's place is replaced rather than followed.
export function applySealedPatch({ checkout, patch, paths: scope }) {
  checkout = check(checkout); scope = paths(scope);
  if (git(checkout.path, ['rev-parse', 'HEAD']) !== checkout.base) fail('integration-base-changed');
  const applied = [];
  for (const f of patch.files) {
    if (!scope.includes(f.path)) fail('integration-outside-scope');
    const target = safe(join(checkout.path, f.path));
    let baseBlob = null; try { baseBlob = git(checkout.path, ['rev-parse', '--verify', '--quiet', checkout.base + ':' + f.path]); } catch { baseBlob = null; }
    const wanted = git(checkout.path, ['hash-object', '--stdin', '--path=' + f.path], {}, f.content);
    const current = existsSync(target) ? git(checkout.path, ['hash-object', '--', f.path]) : null;
    if (current === wanted) continue;
    if ((baseBlob || null) !== current) fail('integration-target-changed');
    mkdirSync(safe(resolve(target, '..')), { recursive: true, mode: 0o755 });
    // The sibling lives in the integration directory (same file system, outside
    // the checkout), so a leftover never appears in the candidate's status.
    const temp = safe(join(resolve(checkout.index, '..'), 'apply-' + randomBytes(8).toString('hex')));
    let renamed = false;
    try {
      const fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o644);
      try { writeSync(fd, f.content); } finally { closeSync(fd); }
      renameSync(temp, safe(target)); renamed = true;
    } finally { if (!renamed) try { unlinkSync(temp); } catch {} }
    applied.push(f.path);
  }
  return { applied };
}
// Before a later generation's patch is applied, every manifest path in the
// dedicated checkout returns to the base: paths the base lacks are unlinked
// first, then `git checkout <base> --` restores `.gitattributes` files and then
// the rest (it reads attributes from the working tree, so the rejected
// generation's attribute files go first; no symlink is followed). Idempotent,
// so a rerun after a crash converges.
export function resetWorkPaths({ checkout, paths: scope }) {
  checkout = check(checkout); scope = paths(scope);
  if (git(checkout.path, ['rev-parse', 'HEAD']) !== checkout.base) fail('integration-base-changed');
  const present = [], absent = [];
  for (const p of scope) { let blob = null; try { blob = git(checkout.path, ['rev-parse', '--verify', '--quiet', checkout.base + ':' + p]); } catch { blob = null; } (blob ? present : absent).push(p); }
  for (const p of absent) {
    const target = safe(join(checkout.path, p));
    let stat = null; try { stat = lstatSync(target); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (stat?.isDirectory()) fail('integration-reset-directory');
    if (stat) unlinkSync(target);
  }
  const attributes = present.filter(p => p.split('/').at(-1) === '.gitattributes'), rest = present.filter(p => !attributes.includes(p));
  for (const group of [attributes, rest]) if (group.length) git(checkout.path, ['checkout', checkout.base, '--', ...group]);
  return { restored: present, removed: absent };
}
// Keeps the candidate tree reachable (an index file does not protect it from gc).
export function pinCandidateTree({ checkout, tree, ref }) {
  checkout = check(checkout); oid(tree);
  if (!/^refs\/waypost\/candidates\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[0-9]+-[0-9]+$/.test(ref)) fail('integration-candidate-ref-invalid');
  let existing = null; try { existing = git(checkout.path, ['rev-parse', '--verify', '--quiet', ref]); } catch { existing = null; }
  if (existing && existing !== tree) fail('integration-candidate-ref-conflict');
  if (!existing) git(checkout.path, ['update-ref', ref, tree, '0'.repeat(tree.length)]);
  return { ref, tree };
}
// The diff a reviewer reads, with every presentation setting pinned (full object
// ids, context, inter-hunk context, no order file, quoted paths), computed from
// Git objects of the shared repository so capture and review agree on it.
export function treeDiff({ projectRoot, base, tree }) {
  const root = safe(projectRoot); oid(base); oid(tree);
  return git(root, ['-c', 'core.quotePath=true', '-c', 'diff.suppressBlankEmpty=false', 'diff', '-O/dev/null', '--text', '--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '--full-index', '-U3', '--inter-hunk-context=0', '--indent-heuristic', '--diff-algorithm=myers', '--src-prefix=a/', '--dst-prefix=b/', base, tree]);
}

// ---- Protocol 2 publication (contract 32, slice 1): one commit of the approved
// tree on the base, with the owner's message and fixed Waypost trailers, written
// without hooks or signing so its id is known before the compare-and-swap of the
// checkout's private ref; the owner merges that ref.
export function workCommitText({ message, teamId, workId, reservationId, reviews, label, harness, session, provider, story, contributors, generation = 1 }) {
  if (typeof message !== 'string' || !message.trim() || message.length > 16384 || message.includes('\0')) fail('integration-invalid-message');
  const fields = { Contributors: contributors, Harness: harness, Label: label, Provider: provider, Reservation: reservationId, Review: reviews.join(','), Session: session, Story: story, Team: teamId, Tests: 'not-run', Work: workId, ...(generation > 1 ? { Generation: String(generation) } : {}) };
  if (Object.values(fields).some(v => typeof v !== 'string' || !v || /[\r\n\0]/.test(v) || v.length > 4096)) fail('integration-invalid-trailers');
  return message.trim() + '\n\n' + Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `Waypost-${k}: ${v}`).join('\n') + '\n';
}
export function workCommitMessageDigest(text) { return hash(text); }
export function workCommit({ checkout, base, tree, text, identity }) {
  checkout = check(checkout); oid(base); oid(tree);
  if (checkout.base !== base) fail('integration-base-changed');
  if (git(checkout.path, ['cat-file', '-t', tree]) !== 'tree') fail('integration-tree-required');
  if (!identity || [identity.name, identity.email, identity.date].some(v => typeof v !== 'string') || !/^[^\r\n<>]{1,200}$/.test(identity.name) || !/^[^\s<>]{1,200}@[^\s<>]{1,200}$/.test(identity.email) || !/^\d{10} \+0000$/.test(identity.date)) fail('integration-invalid-commit-identity');
  return git(checkout.path, ['commit-tree', '--no-gpg-sign', tree, '-p', base], { GIT_AUTHOR_NAME: identity.name, GIT_AUTHOR_EMAIL: identity.email, GIT_AUTHOR_DATE: identity.date, GIT_COMMITTER_NAME: identity.name, GIT_COMMITTER_EMAIL: identity.email, GIT_COMMITTER_DATE: identity.date }, text);
}
// Rewrites the same commit (its id must not change) and moves the private ref
// from the base to it; a ref already at the commit is the same publication.
export function publishWorkCommit({ checkout, base, tree, commit, text, identity, fault }) {
  if (workCommit({ checkout, base, tree, text, identity }) !== commit) fail('integration-commit-changed');
  const current = git(checkout.path, ['rev-parse', checkout.ref]);
  if (current !== commit) {
    if (current !== base) fail('integration-head-changed');
    fault?.('before-ref', commit);
    git(checkout.path, ['update-ref', checkout.ref, commit, base]);
    fault?.('after-ref', commit);
  }
  git(checkout.path, ['read-tree', tree]);
  return { state: 'published', commit, ref: checkout.ref, unchanged: current === commit };
}
// Best effort after a recovered publication: the checkout index follows its HEAD.
export function syncCheckoutIndex({ checkout, tree }) {
  try { checkout = check(checkout); git(checkout.path, ['read-tree', oid(tree)]); return true; } catch { return false; }
}
export function workPublicationState({ checkout, base, commit }) {
  checkout = check(checkout);
  const current = git(checkout.path, ['rev-parse', checkout.ref]);
  if (current === commit) return { state: 'published', ref: checkout.ref, value: current };
  if (current === base) return { state: 'not-published', ref: checkout.ref, value: current };
  fail('integration-publication-conflict');
}
