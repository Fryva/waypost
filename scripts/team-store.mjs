// Host-local immutable authority. Snapshots are caches; replay is authoritative.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, openSync, closeSync, writeSync, fsyncSync, renameSync, unlinkSync, rmdirSync, realpathSync } from 'node:fs';
import { resolve, dirname, join, parse } from 'node:path';
import { hostname } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { storageOf } from './presence.mjs';

const PROTOCOL = 1;
const MAX_COMMAND = 256 * 1024;
const MAX_EVENT = 4 * 1024 * 1024;
const ZERO = '0'.repeat(64);
function fail(code, details = {}) { const e = new Error(code); e.code = code; Object.assign(e, details); throw e; }
function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
}
const digest = value => createHash('sha256').update(stable(value)).digest('hex');
function bounded(value, limit, code) {
  const json = JSON.stringify(value);
  if (!json || Buffer.byteLength(json) > limit) fail(code);
  // Normalize to precisely the serializable value which will be replayed.
  return JSON.parse(json);
}
function safePath(path) {
  const absolute = resolve(path);
  let p = parse(absolute).root;
  for (const part of absolute.slice(p.length).split(/[\\/]/).filter(Boolean)) {
    p = join(p, part);
    try { if (lstatSync(p).isSymbolicLink()) fail('authority-symlink', { path: p }); }
    catch (e) { if (e.code === 'ENOENT') break; throw e; }
  }
  return absolute;
}
function directory(path) {
  safePath(path);
  if (!lstatSync(path).isDirectory()) fail('authority-not-directory', { path });
}
function file(path) {
  safePath(path);
  if (!lstatSync(path).isFile()) fail('authority-not-file', { path });
}
function flushDir(path) {
  // Windows Node does not expose directory fsync; report the limitation explicitly.
  if (process.platform === 'win32') return false;
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
  return true;
}
function writeNew(path, value) {
  safePath(path);
  const fd = openSync(path, 'wx', 0o600);
  try { const bytes = Buffer.from(JSON.stringify(value) + '\n'); let n = 0; while (n < bytes.length) n += writeSync(fd, bytes, n); fsyncSync(fd); }
  finally { closeSync(fd); }
}
function jsonFile(path, max = MAX_EVENT) {
  file(path);
  if (lstatSync(path).size > max) fail('authority-file-too-large', { path });
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { fail('authority-corrupt-json', { path }); }
}
function locality(root) {
  const storage = storageOf(root);
  if (storage.kind !== 'local') fail('authority-nonlocal', { storage });
  return storage;
}
function identity(root, host) {
  const p = join(root, 'identity.json');
  const id = jsonFile(p);
  if (id.protocol !== PROTOCOL || id.root !== realpathSync(root)) fail('authority-identity-mismatch');
  if (host !== undefined && id.host !== host) fail('authority-host-mismatch', { pinned_host: id.host });
  return id;
}
function eventName(seq) { return String(seq).padStart(12, '0') + '.json'; }

// Verified replay prefixes, per authority root, for this process only. An entry
// is the outcome of a complete read: the reducer it ran, the identity it
// checked and a SHA-256 of every verified event file's raw bytes. Every read
// still re-reads and re-hashes the whole log; an unchanged prefix only skips
// re-running the reducer over it. Anything else falls back to full replay.
const REPLAY_CACHE = new Map();
const REPLAY_CACHE_LIMIT = 4;
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const v of Object.values(value)) deepFreeze(v); }
  return value;
}
function eventBytes(path) {
  // The events directory and its ancestors were checked once by the caller.
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) fail('authority-symlink', { path });
  if (!stat.isFile()) fail('authority-not-file', { path });
  if (stat.size > MAX_EVENT) fail('authority-file-too-large', { path });
  return readFileSync(path);
}
function replay(root, reducer, options) {
  root = safePath(root);
  // A failed read leaves no entry: the next one starts over from the first event.
  try { return replayAt(root, reducer, options); } catch (e) { REPLAY_CACHE.delete(root); throw e; }
}
function replayAt(root, reducer, { cached = true } = {}) {
  const evict = () => REPLAY_CACHE.delete(root);
  if (!existsSync(root)) { evict(); return { revision: 0, state: null, requests: [] }; }
  directory(root);
  for (const name of ['lock', 'state.json', 'identity.json', 'events']) safePath(join(root, name));
  const events = join(root, 'events');
  if (!existsSync(events)) {
    evict();
    // A lock may remain from interrupted initial creation; it is not history.
    if (existsSync(join(root, 'identity.json'))) identity(root);
    if (existsSync(join(root, 'state.json'))) safePath(join(root, 'state.json'));
    return { revision: 0, state: null, requests: [] };
  }
  directory(events);
  const id = identity(root);
  if (existsSync(join(root, 'state.json'))) safePath(join(root, 'state.json'));
  const names = readdirSync(events).sort();
  let entry = cached ? REPLAY_CACHE.get(root) : undefined;
  if (entry && (entry.reducer !== reducer || entry.host !== id.host || entry.digests.length > names.length)) entry = undefined;
  // Built locally; published only after the whole read succeeded.
  let state = null, revision = 0, previous = ZERO, requests = [], seen = new Set(), digests = [];
  const files = names.map((name, i) => {
    if (!/^\d{12}\.json$/.test(name) || name !== eventName(i + 1)) fail('authority-log-gap', { name, revision: i });
    return eventBytes(join(events, name));
  });
  if (entry) {
    for (let i = 0; i < entry.digests.length; i++) {
      if (createHash('sha256').update(files[i]).digest('hex') !== entry.digests[i]) { entry = undefined; break; }
    }
  }
  if (entry) {
    ({ state, revision, previous } = entry);
    // The reducer may edit its input; a published entry is never edited.
    if (revision < files.length) state = structuredClone(state);
    requests = entry.requests.slice(); seen = new Set(entry.seen); digests = entry.digests.slice();
  }
  for (let i = revision; i < files.length; i++) {
    let e;
    try { e = JSON.parse(files[i].toString('utf8')); } catch { fail('authority-corrupt-json', { path: join(events, names[i]) }); }
    if (e?.protocol !== PROTOCOL) fail('authority-unknown-protocol', { revision });
    const { hash, ...body } = e;
    if (e.seq !== revision + 1 || e.previous !== previous || e.host !== id.host || hash !== digest(body)) fail('authority-log-integrity', { revision });
    if (typeof e.actor !== 'string' || typeof e.key !== 'string' || e.request_digest !== digest({ actor: e.actor, command: e.command })) fail('authority-request-integrity', { revision });
    const requestId = JSON.stringify([e.actor, e.key]);
    if (seen.has(requestId)) fail('authority-duplicate-request', { revision });
    if (!Number.isFinite(Date.parse(e.accepted_at))) fail('authority-invalid-event-time', { revision });
    if(e.command.type?.startsWith('native-model-inventory-')&&e.command.request_key!==e.key)fail('inventory-store-request-key-mismatch');
    // The previous state came from the JSON round trip below and is referenced
    // nowhere else, so the reducer may consume it without a defensive clone.
    const next = bounded(reducer(state, structuredClone(e.command), { accepted_at: e.accepted_at, revision }), MAX_EVENT, 'authority-state-too-large');
    if (!next || !Object.hasOwn(next, 'state') || !Object.hasOwn(next, 'result') || digest(next.state) !== e.state_digest || digest(next.result) !== digest(e.result)) fail('authority-replay-mismatch', { revision });
    state = next.state; revision = e.seq; previous = hash; seen.add(requestId);
    digests.push(createHash('sha256').update(files[i]).digest('hex'));
    requests.push(deepFreeze({ actor: e.actor, key: e.key, digest: e.request_digest, revision, result: e.result }));
  }
  if (cached) {
    REPLAY_CACHE.delete(root);
    REPLAY_CACHE.set(root, { reducer, host: id.host, state, revision, previous, requests, seen, digests });
    while (REPLAY_CACHE.size > REPLAY_CACHE_LIMIT) REPLAY_CACHE.delete(REPLAY_CACHE.keys().next().value);
  }
  return { revision, state: structuredClone(state), requests: requests.slice() };
}

export function readAuthority(root, reducer) { return replay(root, reducer); }
// Full replay from the first event that never reads or publishes a cache entry
// (a failed read still evicts one).
// Tests compare it with readAuthority to catch an impure reducer.
export function replayAuthorityUncached(root, reducer) { return replay(root, reducer, { cached: false }); }

export function mutateAuthority(root, request, reducer, { host = hostname(), confirmedLocal = false, fault, authorize, validateNew } = {}) {
  root = safePath(root);
  locality(root);
  const { key, actor, expected_revision } = request;
  if (typeof key !== 'string' || !/^[\w.-]{1,128}$/.test(key) || typeof actor !== 'string' || !/^[\w:@.-]{1,256}$/.test(actor)) fail('authority-invalid-request');
  if (!Number.isSafeInteger(expected_revision) || expected_revision < 0) fail('authority-invalid-revision');
  const command = bounded(request.command, MAX_COMMAND, 'authority-command-too-large');
  const requestDigest = digest({ actor, command });
  if (!existsSync(root)) {
    if (!confirmedLocal) fail('authority-locality-confirmation-required');
    mkdirSync(root, { recursive: true, mode: 0o700 });
    safePath(root);
  }
  directory(root);
  for (const name of ['lock', 'state.json', 'identity.json', 'events']) safePath(join(root, name));
  if (existsSync(join(root, 'identity.json'))) identity(root, host);
  else if (!confirmedLocal) fail('authority-locality-confirmation-required');
  const lock = join(root, 'lock');
  safePath(lock);
  try { mkdirSync(lock, { mode: 0o700 }); }
  catch (e) { if (e.code === 'EEXIST') fail('authority-locked', { recovery: 'inspect recovery and confirm stopped command; never steal by age' }); throw e; }
  const nonce = randomUUID();
  let simulatedCrash = false;
  function boundary(stage) {
    if (!fault) return;
    try { fault(stage); } catch (e) { simulatedCrash = true; throw e; }
  }
  try {
    writeNew(join(lock, 'owner.json'), { protocol: PROTOCOL, nonce, host, pid: process.pid, process_started: performance.timeOrigin, command: key, actor });
    flushDir(lock); flushDir(root);
    boundary('after-lock');
    // Check again under the one mutex; initialization is part of serialization.
    locality(root);
    if (!existsSync(join(root, 'identity.json'))) {
      const tmp = join(root, '.identity-' + nonce);
      writeNew(tmp, { protocol: PROTOCOL, host, root: realpathSync(root), locality: 'owner-confirmed', directory_flush: process.platform !== 'win32' });
      renameSync(tmp, join(root, 'identity.json')); flushDir(root);
    }
    identity(root, host);
    const events = join(root, 'events');
    if (!existsSync(events)) { mkdirSync(events, { mode: 0o700 }); flushDir(root); }
    directory(events);
    const current = readAuthority(root, reducer);
    // Recheck credentials under the serialization boundary, including retries.
    // A credential revoked after the CLI read cannot recover a cached result.
    if (authorize) authorize(structuredClone(current.state));
    const completed = current.requests.find(r => r.actor === actor && r.key === key);
    if (completed) {
      if (completed.digest !== requestDigest) fail('authority-request-key-reused', { revision: current.revision });
      return { revision: completed.revision, result: structuredClone(completed.result), replayed: true };
    }
    if (expected_revision !== current.revision) fail('authority-stale-revision', { revision: current.revision, refresh: 'read authority state and resend under the same request key' });
    if(command.type?.startsWith('native-model-inventory-')&&command.request_key!==key)fail('inventory-store-request-key-mismatch');
    if (validateNew) validateNew(structuredClone(current.state), structuredClone(command));
    // New timed transitions use the host clock; replay remains anchored to the
    // accepted event time. A caller cannot backdate an action to bypass expiry.
    if (Object.hasOwn(command, 'at') && (!Number.isFinite(Date.parse(command.at)) || Math.abs(Date.now() - Date.parse(command.at)) > 30000)) fail('authority-invalid-action-time');
    const accepted_at = new Date().toISOString();
    const next = bounded(reducer(structuredClone(current.state), structuredClone(command), { accepted_at, revision: current.revision }), MAX_EVENT, 'authority-state-too-large');
    if (!next || !Object.hasOwn(next, 'state') || !Object.hasOwn(next, 'result')) fail('authority-invalid-reducer-output');
    const revision = current.revision + 1;
    const previous = revision === 1 ? ZERO : jsonFile(join(events, eventName(revision - 1))).hash;
    const body = { protocol: PROTOCOL, seq: revision, host, previous, actor, key, request_digest: requestDigest, command, accepted_at, result: next.result, state_digest: digest(next.state) };
    const event = bounded({ ...body, hash: digest(body) }, MAX_EVENT, 'authority-event-too-large');
    const temp = join(root, '.event-' + nonce);
    writeNew(temp, event);
    boundary('after-temp-flush');
    const target = join(events, eventName(revision));
    if (existsSync(target)) fail('authority-event-exists');
    renameSync(temp, target); flushDir(events); flushDir(root);
    boundary('after-publication');
    const snapshot = join(root, 'state.json'); safePath(snapshot);
    const snapTemp = join(root, '.state-' + nonce);
    writeNew(snapTemp, { protocol: PROTOCOL, revision, state: next.state, event_hash: event.hash });
    renameSync(snapTemp, snapshot); flushDir(root);
    boundary('after-snapshot'); boundary('before-reply');
    return { revision, result: next.result, replayed: false };
  } finally {
    if (!simulatedCrash) {
      // Never remove an exchanged lock or files from another command.
      const own = jsonFile(join(lock, 'owner.json'), 4096);
      if (own.nonce !== nonce) fail('authority-lock-owner-changed');
      unlinkSync(join(lock, 'owner.json')); rmdirSync(lock); flushDir(root);
      for (const kind of ['identity', 'event', 'state']) {
        const p = join(root, '.' + kind + '-' + nonce);
        if (existsSync(p)) { safePath(p); unlinkSync(p); }
      }
    }
  }
}

export function explainRecovery(root) {
  root = safePath(root);
  const lock = join(root, 'lock'); safePath(lock);
  if (!existsSync(lock)) return { locked: false };
  directory(lock);
  let owner = null, corrupt = false;
  try { if (existsSync(join(lock, 'owner.json'))) owner = jsonFile(join(lock, 'owner.json'), 4096); }
  catch (e) { if (e.code === 'authority-symlink') throw e; corrupt = true; }
  return { locked: true, owner, corrupt, requires: 'explicit owner confirmation command and any children stopped', ttl_recovery: false };
}
// Serialize a legacy write with team creation. No event is necessary for an
// operation which is refused while the artifact is bound to an active team.
export function withAuthorityGate(root, reducer, callback) {
  root=safePath(root);
  // Teams cannot be created on nonlocal storage; legacy advisory workflows
  // there remain usable when no authority exists.
  if(!existsSync(root) && storageOf(root).kind!=='local')return callback(null);
  locality(root);
  if(!existsSync(root))mkdirSync(root,{recursive:true,mode:0o700});
  directory(root);
  if(existsSync(join(root,'identity.json')))identity(root,hostname());
  const lock=join(root,'lock'),nonce=randomUUID();
  try{mkdirSync(lock,{mode:0o700});}catch(e){if(e.code==='EEXIST')fail('authority-locked');throw e;}
  try{
    writeNew(join(lock,'owner.json'),{protocol:PROTOCOL,nonce,host:hostname(),pid:process.pid,command:'legacy-gate',actor:'legacy'});
    flushDir(lock);flushDir(root);
    const result=callback(readAuthority(root,reducer).state);
    if(result?.then)fail('authority-gate-must-be-synchronous');
    return result;
  }finally{
    const own=jsonFile(join(lock,'owner.json'),4096);if(own.nonce!==nonce)fail('authority-lock-owner-changed');
    unlinkSync(join(lock,'owner.json'));rmdirSync(lock);flushDir(root);
  }
}
export function recoverLock(root, { ownerConfirmedStopped = false, host = hostname() } = {}) {
  root = safePath(root); locality(root);
  const status = explainRecovery(root);
  if (!status.locked) return { recovered: false };
  if (!ownerConfirmedStopped) fail('authority-recovery-confirmation-required');
  if (existsSync(join(root, 'identity.json'))) identity(root, host);
  if (status.owner?.host && status.owner.host !== host) fail('authority-foreign-lock');
  const lock = join(root, 'lock');
  if (readdirSync(lock).some(n => n !== 'owner.json')) fail('authority-unknown-lock-files');
  // Preserve lock evidence in a recovery archive; do not edit or skip events.
  const archive = join(root, 'recovered-lock-' + randomUUID());
  renameSync(lock, archive); flushDir(root);
  return { recovered: true, evidence: archive };
}
