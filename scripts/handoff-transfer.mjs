// Explicit receiver-local content objects. Availability is only a participant hint.
import { createHash, randomUUID } from 'node:crypto';
import { constants, lstatSync, realpathSync, mkdirSync, openSync, closeSync, readSync, fstatSync, writeFileSync, linkSync, unlinkSync, renameSync, readdirSync, rmSync, mkdtempSync, readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { resolve, dirname, basename, join } from 'node:path';
import { TextDecoder } from 'node:util';
import { validatePacket, readHandoffFile, inspectPacket, LIMITS } from './handoff.mjs';
export const TRANSFER_LIMITS = Object.freeze({ envelope: 64 * 1024 * 1024, quota: 64 * 1024 * 1024, total: LIMITS.total + LIMITS.json, object: LIMITS.file, manifest: 131072, files: 1024 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(JSON.stringify(value));
const fail = code => { throw new Error('handoff-transfer-' + code); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function keys(value, names) { if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).sort().join() !== names.slice().sort().join()) fail('shape'); }
export function validateTransferScope(value) {
  keys(value, ['team', 'epoch', 'sender', 'sender_incarnation', 'receiver', 'receiver_incarnation']);
  if (!Number.isSafeInteger(value.epoch) || value.epoch < 0) fail('scope');
  for (const key of ['team', 'sender', 'sender_incarnation', 'receiver', 'receiver_incarnation']) if (typeof value[key] !== 'string' || !value[key] || value[key].length > 256 || /[\x00-\x1f\x7f]/.test(value[key])) fail('scope');
  if (value.sender === value.receiver) fail('scope');
  return value;
}
function identity(scope, manifest) { return hash(json({ scope, manifest })); }
function manifestCheck(value) {
  keys(value, ['version', 'packet', 'entries']);
  if (value.version !== 1 || !Array.isArray(value.entries)) fail('manifest');
  keys(value.packet, ['path', 'state', 'sha256', 'bytes']);
  const packet = { version: 1, created_at: '2026-01-01T00:00:00.000Z', git_head: null, goal: 'Transfer', next_step: 'Verify', constraints: [], progress: [], open_questions: [], files: [{ ...value.packet, bytes: 0 }, ...value.entries], evidence: [] };
  validatePacket(packet);
  if (value.packet.state !== 'file' || !Number.isSafeInteger(value.packet.bytes) || value.packet.bytes < 0 || value.packet.bytes > LIMITS.json || json(value).length > TRANSFER_LIMITS.manifest) fail('manifest');
  if (!same(value.entries, [...value.entries].sort((a, b) => a.path.localeCompare(b.path, 'en')))) fail('manifest-order');
  return value;
}
function objectRefs(manifest) { return [manifest.packet, ...manifest.entries.filter(e => e.state === 'file')]; }
function decode(encoded, max) {
  if (typeof encoded !== 'string' || encoded.length > Math.ceil(max / 3) * 4 || encoded.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(encoded)) fail('base64');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > max || bytes.toString('base64') !== encoded) fail('object-size');
  return bytes;
}
function packetMatches(manifest, objects) {
  const data = objects.get(manifest.packet.sha256);
  let packet; try { packet = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); } catch { fail('packet'); }
  validatePacket(packet);
  const refs = [...packet.files, ...packet.evidence];
  for (const entry of manifest.entries) {
    const ref = refs.find(r => r.path === entry.path);
    if (!ref || !same(entry, Object.fromEntries(['path', 'state', ...(ref.state === 'file' ? ['sha256', 'bytes'] : [])].map(k => [k, ref[k]])))) fail('packet-reference');
  }
}
export function parseTransfer(input) {
  let value = input;
  if (Buffer.isBuffer(input) || typeof input === 'string') {
    if (Buffer.byteLength(input) > TRANSFER_LIMITS.envelope) fail('envelope-limit');
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(input))); } catch { fail('json'); }
  }
  if (json(value).length > TRANSFER_LIMITS.envelope) fail('envelope-limit');
  keys(value, ['version', 'kind', 'scope', 'mode', 'manifest', 'manifest_sha256', 'transfer_id', 'base', 'deletions', 'objects']);
  if (value.version !== 1 || value.kind !== 'waypost-handoff-transfer' || !['full', 'delta'].includes(value.mode)) fail('version');
  validateTransferScope(value.scope); manifestCheck(value.manifest);
  if (hash(json(value.manifest)) !== value.manifest_sha256 || identity(value.scope, value.manifest_sha256) !== value.transfer_id) fail('identity');
  if (!Array.isArray(value.deletions) || !Array.isArray(value.objects) || value.objects.length > LIMITS.references) fail('shape');
  if (value.mode === 'full') { if (value.base !== null || value.deletions.length) fail('base'); }
  else {
    keys(value.base, ['manifest_sha256', 'transfer_id', 'availability_id']);
    if (!digest(value.base.manifest_sha256) || identity(value.scope, value.base.manifest_sha256) !== value.base.transfer_id || typeof value.base.availability_id !== 'string' || !value.base.availability_id || value.base.availability_id.length > 128) fail('base');
  }
  const objects = new Map(), refs = objectRefs(value.manifest); let total = 0;
  for (const object of value.objects) {
    keys(object, ['sha256', 'bytes', 'data']);
    if (!digest(object.sha256) || !Number.isSafeInteger(object.bytes) || object.bytes < 0 || object.bytes > TRANSFER_LIMITS.object || objects.has(object.sha256) || !refs.some(r => r.sha256 === object.sha256 && r.bytes === object.bytes)) fail('object');
    const data = decode(object.data, object.bytes); total += data.length;
    if (data.length !== object.bytes || hash(data) !== object.sha256 || total > TRANSFER_LIMITS.total) fail('object-digest');
    objects.set(object.sha256, data);
  }
  if (value.mode === 'full' && refs.some(r => !objects.has(r.sha256))) fail('full-missing-object');
  if (objects.has(value.manifest.packet.sha256)) packetMatches(value.manifest, objects);
  // Reuse packet path grammar and collisions for deletion entries, independently.
  if (value.deletions.length) manifestCheck({ version: 1, packet: value.manifest.packet, entries: value.deletions.map(path => ({ path, state: 'missing' })) });
  return { envelope: value, objects };
}
// Only actual authority state may be supplied here, never an ACK JSON document.
export function validateAvailability(state, scope, manifestSha, transferId, messageId) {
  validateTransferScope(scope);
  const team = state?.teams?.[scope.team], receiver = team?.participants?.[scope.receiver], sender = team?.participants?.[scope.sender];
  const message = team?.messages?.find(m => m.id === messageId);
  if (!team || team.status === 'closed' || team.epoch !== scope.epoch || !receiver || !sender || receiver.revoked || sender.revoked || receiver.availability === 'left' || sender.availability === 'left' || receiver.incarnation !== scope.receiver_incarnation || sender.incarnation !== scope.sender_incarnation ||
      !message || message.kind !== 'ack' || message.sender !== scope.receiver || message.recipient !== scope.sender || message.incarnation !== scope.sender_incarnation || message.epoch !== scope.epoch ||
      !same(message.payload, { kind: 'waypost-handoff-availability', version: 1, scope, manifest_sha256: manifestSha, transfer_id: transferId })) fail('availability');
  return message;
}
export function buildTransfer(root, packetPath, { scope, include, base = null, availabilityId = null, authority = null }) {
  validateTransferScope(scope);
  const packetBytes = readHandoffFile(root, packetPath, LIMITS.json), packet = validatePacket(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(packetBytes)));
  if (!Array.isArray(include) || include.length > LIMITS.references - 1 || new Set(include).size !== include.length) fail('include');
  const entries = include.map(path => {
    const ref = [...packet.files, ...packet.evidence].find(r => r.path === path); if (!ref) fail('include');
    return Object.fromEntries(['path', 'state', ...(ref.state === 'file' ? ['sha256', 'bytes'] : [])].map(k => [k, ref[k]]));
  }).sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const manifest = manifestCheck({ version: 1, packet: { path: packetPath, state: 'file', sha256: hash(packetBytes), bytes: packetBytes.length }, entries });
  const objects = new Map([[hash(packetBytes), packetBytes]]);
  for (const ref of entries) {
    if (ref.state === 'missing') {
      if (inspectPacket(root, { ...packet, files: [ref], evidence: [] }).results?.some(r => r.status !== 'unchanged')) fail('stale');
      continue;
    }
    const data = readHandoffFile(root, ref.path);
    if (data.length !== ref.bytes || hash(data) !== ref.sha256) fail('stale');
    objects.set(ref.sha256, data);
  }
  let baseline = null, deletions = [], omitted = new Set();
  if (base) {
    manifestCheck(base);
    const baseSha = hash(json(base)), transferId = identity(scope, baseSha);
    validateAvailability(authority, scope, baseSha, transferId, availabilityId);
    baseline = { manifest_sha256: baseSha, transfer_id: transferId, availability_id: availabilityId };
    omitted = new Set(objectRefs(base).map(r => r.sha256));
    deletions = [base.packet, ...base.entries].filter(e => ![manifest.packet, ...entries].some(r => r.path === e.path)).map(e => e.path).sort((a, b) => a.localeCompare(b, 'en'));
  }
  const manifestSha = hash(json(manifest));
  const envelope = { version: 1, kind: 'waypost-handoff-transfer', scope, mode: base ? 'delta' : 'full', manifest, manifest_sha256: manifestSha, transfer_id: identity(scope, manifestSha), base: baseline, deletions,
    objects: [...objects].filter(([sha]) => !omitted.has(sha)).map(([sha, data]) => ({ sha256: sha, bytes: data.length, data: data.toString('base64') })) };
  parseTransfer(envelope); return envelope;
}
function safeDirectory(path) {
  const absolute = resolve(path); let current = absolute;
  while (true) { const stat = lstatSync(current); if (stat.isSymbolicLink() || !stat.isDirectory()) fail('store-path'); if (dirname(current) === current) break; current = dirname(current); }
  if (realpathSync(absolute) !== absolute) fail('store-path'); return absolute;
}
function readLocal(root, name, max = LIMITS.file) {
  if (process.platform !== 'win32' && (lstatSync(join(root, name)).mode & 0o077)) fail('store-permissions');
  return readHandoffFile(root, name, Math.min(max, LIMITS.file));
}
function publish(root, name, data) {
  const temp = '.transfer-' + randomUUID() + '.tmp', path = join(root, temp); let linked = false;
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
  try {
    try { writeFileSync(fd, data); } finally { closeSync(fd); }
    try { linkSync(path, join(root, name)); linked = true; }
    catch (error) { if (error.code !== 'EEXIST' || !readLocal(root, name, Math.max(1, data.length)).equals(data)) throw error; }
    return linked;
  } finally { unlinkSync(path); }
}
// A lock names its holder. Only a record from this host whose pid is certainly gone is broken;
// anything unreadable, foreign or alive keeps the old fail-closed EEXIST.
export function breakStaleLock(lock, { beforeRename = null } = {}) {
  let held;
  try {
    held = JSON.parse(readFileSync(lock, 'utf8'));
    if (!held || !Number.isSafeInteger(held.pid) || held.pid < 1 || held.host !== hostname() || typeof held.nonce !== 'string') return false;
    try { process.kill(held.pid, 0); return false; } catch (error) { if (error.code !== 'ESRCH') return false; }
  } catch { return false; }
  beforeRename?.();
  const stale = lock + '.stale-' + randomUUID();
  try { renameSync(lock, stale); } catch { return false; }
  try {
    let moved = null;
    try { moved = JSON.parse(readFileSync(stale, 'utf8')); } catch {}
    if (moved?.nonce === held.nonce) return true;
    // A live holder replaced the dead one between the read and the rename: give its lock back.
    try { linkSync(stale, lock); } catch {}
    return false;
  } finally { try { unlinkSync(stale); } catch {} }
}
function acquireLock(lock) {
  for (let attempt = 0; ; attempt++) {
    let fd;
    try { fd = openSync(lock, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST' && attempt === 0 && breakStaleLock(lock)) continue; throw error; }
    const nonce = randomUUID();
    try { writeFileSync(fd, JSON.stringify({ pid: process.pid, host: hostname(), started: new Date().toISOString(), nonce })); }
    catch (error) { closeSync(fd); try { unlinkSync(lock); } catch {} throw error; }
    return { fd, nonce };
  }
}
function withStore(path, scope, action, create = false) {
  validateTransferScope(scope);
  const absolute = resolve(path); safeDirectory(dirname(absolute));
  try { lstatSync(absolute); } catch (error) {
    if (error.code !== 'ENOENT' || !create) throw error;
    // Build the store beside its destination so a crash never leaves a directory without owner.json.
    const building = mkdtempSync(absolute + '.tmp-');
    try {
      publish(building, 'owner.json', json({ kind: 'waypost-handoff-store', version: 1, scope, owned: [] }));
      renameSync(building, absolute);
    } catch (e) {
      rmSync(building, { recursive: true, force: true });
      // Lost a creation race: POSIX says EEXIST/ENOTEMPTY, Windows EPERM.
      if (e.code !== 'EEXIST' && e.code !== 'ENOTEMPTY' && !(e.code === 'EPERM' && lstatSync(absolute, { throwIfNoEntry: false }))) throw e;
    }
  }
  const root = safeDirectory(absolute);
  if (process.platform !== 'win32' && (lstatSync(root).mode & 0o077)) fail('store-permissions');
  const lock = join(root, '.lock'), { fd, nonce } = acquireLock(lock);
  try {
    const owner = JSON.parse(readLocal(root, 'owner.json', TRANSFER_LIMITS.manifest));
    keys(owner, ['kind', 'version', 'scope', 'owned']);
    if (owner.kind !== 'waypost-handoff-store' || owner.version !== 1 || !same(owner.scope, scope) || !Array.isArray(owner.owned) || owner.owned.length > TRANSFER_LIMITS.files || owner.owned.some(n => !/^[a-f0-9]{64}\.(?:obj|manifest)$/.test(n)) || new Set(owner.owned).size !== owner.owned.length) fail('store-owner');
    const save = () => {
      const temp = '.transfer-' + randomUUID() + '.tmp'; publish(root, temp, json(owner));
      renameSync(join(root, temp), join(root, 'owner.json'));
    };
    return action(root, owner, save);
  } finally {
    closeSync(fd);
    // Release only our own lock: a stale-lock breaker may have replaced it.
    let held = null; try { held = JSON.parse(readFileSync(lock, 'utf8')); } catch {}
    if (held?.nonce === nonce) unlinkSync(lock);
  }
}
function verifyStored(root, sha, scope) {
  if (!digest(sha)) fail('digest');
  const record = JSON.parse(readLocal(root, sha + '.manifest', TRANSFER_LIMITS.manifest));
  keys(record, ['kind', 'scope', 'manifest']);
  if (record.kind !== 'waypost-handoff-snapshot' || !same(record.scope, scope)) fail('store-owner');
  manifestCheck(record.manifest);
  if (hash(json(record.manifest)) !== sha) fail('manifest-digest');
  const objects = new Map();
  for (const ref of objectRefs(record.manifest)) {
    const bytes = readLocal(root, ref.sha256 + '.obj', Math.max(1, ref.bytes));
    if (bytes.length !== ref.bytes || hash(bytes) !== ref.sha256) fail('store-corrupt'); objects.set(ref.sha256, bytes);
  }
  packetMatches(record.manifest, objects); return { manifest: record.manifest, objects };
}
export function availabilityReport(store, manifestSha, scope) {
  return withStore(store, scope, root => {
    verifyStored(root, manifestSha, scope);
    return { kind: 'waypost-handoff-availability', version: 1, scope, manifest_sha256: manifestSha, transfer_id: identity(scope, manifestSha) };
  });
}
export function applyTransfer(store, input, { scope, quotaBytes = TRANSFER_LIMITS.quota, materialize = null, beforePublish = null, authority = null } = {}) {
  const { envelope: value, objects } = parseTransfer(input);
  if (!same(validateTransferScope(scope), value.scope)) fail('scope');
  if (value.base) validateAvailability(authority, scope, value.base.manifest_sha256, value.base.transfer_id, value.base.availability_id);
  if (!Number.isSafeInteger(quotaBytes) || quotaBytes < 1 || quotaBytes > TRANSFER_LIMITS.quota) fail('quota');
  return withStore(store, scope, (root, owner, save) => {
    if (value.base) {
      let base;
      try { base = verifyStored(root, value.base.manifest_sha256, scope); } catch { return { stage: 'needs-full', manifest_sha256: value.manifest_sha256, reason: 'base-unavailable' }; }
      const expectedDeletes = [base.manifest.packet, ...base.manifest.entries].filter(e => ![value.manifest.packet, ...value.manifest.entries].some(r => r.path === e.path)).map(e => e.path).sort((a, b) => a.localeCompare(b, 'en'));
      if (!same(value.deletions, expectedDeletes)) fail('deletions');
      for (const [sha, bytes] of base.objects) if (!objects.has(sha)) objects.set(sha, bytes);
    }
    for (const ref of objectRefs(value.manifest)) if (!objects.has(ref.sha256) || objects.get(ref.sha256).length !== ref.bytes || hash(objects.get(ref.sha256)) !== ref.sha256) {
      if (value.mode === 'delta') return { stage: 'needs-full', manifest_sha256: value.manifest_sha256, reason: 'object-unavailable' };
      fail('object-digest');
    }
    packetMatches(value.manifest, objects);
    const record = json({ kind: 'waypost-handoff-snapshot', scope, manifest: value.manifest });
    const pending = new Map(objectRefs(value.manifest).map(r => [r.sha256 + '.obj', objects.get(r.sha256)]));
    pending.set(value.manifest_sha256 + '.manifest', record);
    const names = readdirSync(root); if (names.length + pending.size > TRANSFER_LIMITS.files) fail('store-file-limit');
    let usage = 0, replacedBytes = 0;
    for (const name of names) {
      const stat = lstatSync(join(root, name)); if (stat.isSymbolicLink() || !stat.isFile()) fail('store-path');
      usage += stat.size;
      if (pending.has(name)) {
        const bytes = pending.get(name);
        if (stat.size === bytes.length && readLocal(root, name, Math.max(1, bytes.length)).equals(bytes)) pending.delete(name);
        else {
          if (!owner.owned.includes(name) || value.mode !== 'full' || !name.endsWith('.obj')) fail('store-corrupt');
          replacedBytes += stat.size;
        }
      }
    }
    if (usage + [...pending.values()].reduce((n, b) => n + b.length, 0) + json(owner).length + pending.size * 90 > quotaBytes) fail('store-quota');
    // Durable provenance precedes objects; interrupted objects are owned but never a snapshot.
    owner.owned = [...new Set([...owner.owned, ...pending.keys()])]; save();
    for (const [name, bytes] of pending) if (name.endsWith('.obj')) {
      try { publish(root, name, bytes); } catch (error) {
        if (!owner.owned.includes(name) || value.mode !== 'full') throw error;
        const stat = lstatSync(join(root, name)); if (stat.isSymbolicLink() || !stat.isFile()) fail('store-path');
        // Explicit full fallback repairs only a pre-existing store-owned object.
        const temp = '.transfer-' + randomUUID() + '.tmp'; publish(root, temp, bytes);
        renameSync(join(root, temp), join(root, name));
      }
    }
    beforePublish?.();
    publish(root, value.manifest_sha256 + '.manifest', record);
    verifyStored(root, value.manifest_sha256, scope);
    if (materialize) materializeSnapshot(materialize, value.manifest, objects);
    return { stage: 'applied', manifest_sha256: value.manifest_sha256, transfer_id: value.transfer_id, object_bytes: value.objects.reduce((n, o) => n + o.bytes, 0), serialized_transfer_bytes: json(value).length, stored_bytes_added: [...pending.values()].reduce((n, b) => n + b.length, 0) - replacedBytes, model_input_tokens: null };
  }, true);
}
function materializeSnapshot(path, manifest, objects) {
  const target = resolve(path); safeDirectory(dirname(target)); mkdirSync(target, { mode: 0o700 });
  try {
    for (const ref of objectRefs(manifest)) {
      const destination = join(target, ref.path); mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      writeFileSync(destination, objects.get(ref.sha256), { flag: 'wx', mode: 0o600 });
    }
  } catch (error) { rmSync(target, { recursive: true, force: true }); throw error; }
}
export function collectTransferStore(store, scope, { keep = [] } = {}) {
  if (!Array.isArray(keep) || keep.length > TRANSFER_LIMITS.files || keep.some(d => !digest(d))) fail('gc-keep');
  return withStore(store, scope, (root, owner, save) => {
    const retained = new Set();
    for (const sha of keep) {
      const { manifest } = verifyStored(root, sha, scope); retained.add(sha + '.manifest');
      objectRefs(manifest).forEach(r => retained.add(r.sha256 + '.obj'));
    }
    let removed = 0, bytes = 0;
    // Orphans of a crashed publish; under the lock no live writer owns one.
    for (const name of readdirSync(root)) if (/^\.transfer-[a-f0-9-]+\.tmp$/.test(name)) {
      try { const stat = lstatSync(join(root, name)); if (stat.isFile()) { unlinkSync(join(root, name)); removed++; bytes += stat.size; } }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    for (const name of owner.owned) if (!retained.has(name)) {
      try { const stat = lstatSync(join(root, name)); if (stat.isSymbolicLink() || !stat.isFile()) fail('store-path'); unlinkSync(join(root, name)); removed++; bytes += stat.size; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    owner.owned = owner.owned.filter(name => retained.has(name)); save(); return { removed, bytes };
  });
}

export function readTransferFile(path) {
  const absolute = resolve(path); safeDirectory(dirname(absolute));
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > TRANSFER_LIMITS.envelope) fail('envelope-limit');
  const fd = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.ino !== stat.ino || before.dev !== stat.dev || before.size > TRANSFER_LIMITS.envelope) fail('envelope-path');
    const bytes = Buffer.alloc(before.size + 1); let count = 0;
    while (count < bytes.length) { const size = readSync(fd, bytes, count, bytes.length - count, count); if (!size) break; count += size; }
    const after = fstatSync(fd), current = lstatSync(absolute);
    if (count !== before.size || before.size !== after.size || before.ctimeMs !== after.ctimeMs || before.mtimeMs !== after.mtimeMs || current.ino !== before.ino || current.dev !== before.dev || current.isSymbolicLink()) fail('envelope-changed');
    return bytes.subarray(0, count);
  } finally { closeSync(fd); }
}
export function writeTransferFile(path, envelope) {
  parseTransfer(envelope); const absolute = resolve(path), parent = safeDirectory(dirname(absolute));
  try { lstatSync(absolute); fail('output-exists'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  publish(parent, basename(absolute), json(envelope)); return absolute;
}
