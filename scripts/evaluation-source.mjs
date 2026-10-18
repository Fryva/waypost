// Source bytes are untrusted data, never instructions. No filesystem writes or CLI entry.
import { constants, lstatSync, realpathSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { resolve, join, dirname, parse } from 'node:path';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const fail = (code, message = code) => { throw Object.assign(new Error(message), { code }); };
const defaults = Object.freeze({ maxFiles: 256, maxFileBytes: 1048576, maxTotalBytes: 8388608,
  maxCallbacks: 64, maxInputBytes: 4096, maxOutputBytes: 32768, totalInputBytes: 65536,
  totalOutputBytes: 262144, maxReadLines: 200, maxQueryBytes: 256, maxSearchResults: 100 });
const compare = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function keys(value, required, optional = []) {
  if (!plain(value) || required.some(k => !Object.hasOwn(value, k)) || Object.keys(value).some(k => !required.includes(k) && !optional.includes(k))) fail('source-schema');
}
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (plain(value)) return '{' + Object.keys(value).sort(compare).map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  fail('source-schema');
}
export function evaluationInputDigest(name, args) { return hash(canonical({ name, arguments: args })); }
function portable(path) {
  if (typeof path !== 'string' || !path || path.length > 1024 || path !== path.normalize('NFC') || path.includes('\\') || /[\x00-\x1f\x7f<>:"|?*]/u.test(path)) fail('source-path');
  const parts = path.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[ .]$/.test(p) || p.toLowerCase() === '.git' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) fail('source-path');
  return parts;
}
function immutable(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(immutable); Object.freeze(value); }
  return value;
}
function positive(value) { return Number.isSafeInteger(value) && value > 0; }

/** Seal once before inference. All callbacks thereafter use only the verified buffers. */
export function sealEvaluationSource({ root, manifest, limits = {} }) {
  keys(limits, [], Object.keys(defaults));
  const caps = Object.freeze({ ...defaults, ...limits });
  if (Object.values(caps).some(v => !positive(v))) fail('source-limits');
  if (typeof root !== 'string' || !root || !Array.isArray(manifest) || !manifest.length || manifest.length > caps.maxFiles) fail('source-manifest');
  const base = resolve(root);
  // Reject symlinked roots and linked worktrees, including ancestors containing git files.
  if (realpathSync(base) !== base || !lstatSync(base).isDirectory()) fail('source-root');
  for (let dir = base; ; dir = dirname(dir)) {
    const git = join(dir, '.git');
    try { const stat = lstatSync(git); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('source-git-indirection'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (dir === parse(dir).root) break;
  }
  const entries = manifest.map(entry => {
    keys(entry, ['path', 'sha256']); portable(entry.path);
    if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail('source-manifest');
    return { path: entry.path, sha256: entry.sha256 };
  }).sort((a, b) => compare(a.path, b.path));
  const seen = new Map(), files = new Map(); let total = 0;
  for (const entry of entries) {
    const partsForCollision = entry.path.split('/');
    for (let i = 1; i <= partsForCollision.length; i++) {
      const prefix = partsForCollision.slice(0, i).join('/'), folded = prefix.toLowerCase();
      if (seen.has(folded) && (seen.get(folded) !== prefix || i === partsForCollision.length)) fail('source-case-collision');
      seen.set(folded, prefix);
    }
    let target = base;
    const parts = portable(entry.path);
    for (const [index, part] of parts.entries()) {
      target = join(target, part); const stat = lstatSync(target);
      if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) fail('source-symlink-or-type');
    }
    if (realpathSync(target) !== target) fail('source-root-escape');
    const fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0)); let buffer;
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > caps.maxFileBytes || stat.size + total > caps.maxTotalBytes) fail('source-size-limit');
      buffer = Buffer.alloc(stat.size + 1); let count = 0;
      while (count < buffer.length) { const n = readSync(fd, buffer, count, buffer.length - count, count); if (!n) break; count += n; }
      if (count !== stat.size || realpathSync(target) !== target) fail('source-changed-during-seal');
      buffer = buffer.subarray(0, count);
      if (hash(buffer) !== entry.sha256) fail('source-hash');
    } finally { closeSync(fd); }
    total += buffer.length;
    let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { fail('source-encoding'); }
    // A final newline terminates the previous line rather than creating a phantom one.
    const lines = text.split('\n'); if (lines.at(-1) === '') lines.pop();
    files.set(entry.path, { lines });
  }
  const sealedManifest = immutable(entries), manifestDigest = hash(canonical(entries));
  let owner = null, closed = null, callbacks = 0, inputBytes = 0, outputBytes = 0;
  const recorded = new Map(), log = [];
  const stop = code => { closed ||= code; fail(code); };
  function read(args) {
    keys(args, ['path', 'start_line', 'end_line']); portable(args.path);
    const file = files.get(args.path); if (!file) fail('source-not-manifest');
    if (!positive(args.start_line) || !positive(args.end_line) || args.end_line < args.start_line || args.end_line - args.start_line + 1 > caps.maxReadLines) fail('source-range');
    const end = Math.min(args.end_line, file.lines.length), selected = [];
    // Reserve enough envelope space, then cap at complete lines. Never split UTF-8.
    const result = { kind: 'source-data', manifest_digest: manifestDigest, path: args.path, start_line: args.start_line, end_line: args.start_line - 1, text: '', truncated: false, next_line: null };
    for (let i = args.start_line - 1; i < end; i++) {
      const text = [...selected, file.lines[i]].join('\n');
      if (bytes({ ...result, text, end_line: i + 1, truncated: true, next_line: i + 2 }) > caps.maxOutputBytes) break;
      selected.push(file.lines[i]); result.end_line = i + 1;
    }
    if (args.start_line <= end && !selected.length) stop('source-output-limit');
    result.text = selected.join('\n'); result.truncated = result.end_line < end;
    result.next_line = result.truncated ? result.end_line + 1 : null;
    return result;
  }
  function search(args) {
    keys(args, ['query'], ['cursor', 'limit']);
    if (typeof args.query !== 'string' || !args.query || /[\r\n\x00]/.test(args.query) || Buffer.byteLength(args.query) > caps.maxQueryBytes) fail('source-query');
    const limit = args.limit ?? caps.maxSearchResults;
    if (!positive(limit) || limit > caps.maxSearchResults) fail('source-search-limit');
    const binding = hash(canonical({ manifest: manifestDigest, query: args.query })); let position = 0;
    if (args.cursor !== undefined) {
      if (typeof args.cursor !== 'string' || args.cursor.length > 1024) fail('source-cursor');
      try {
        const decoded = JSON.parse(Buffer.from(args.cursor, 'base64url').toString('utf8'));
        keys(decoded, ['binding', 'position']);
        if (decoded.binding !== binding || !Number.isSafeInteger(decoded.position) || decoded.position < 0) fail('source-cursor');
        position = decoded.position;
      } catch { fail('source-cursor'); }
    }
    const hits = [];
    for (const [path, file] of files) for (const [index, line] of file.lines.entries()) if (line.includes(args.query)) hits.push({ path, line: index + 1 });
    if (position > hits.length) fail('source-cursor');
    const result = { kind: 'source-data', manifest_digest: manifestDigest, query: args.query, results: [], truncated: false, cursor: null };
    const cursorAt = p => Buffer.from(canonical({ binding, position: p })).toString('base64url');
    while (position < hits.length && result.results.length < limit) {
      if (bytes({ ...result, results: [...result.results, hits[position]], truncated: true, cursor: cursorAt(position + 1) }) > caps.maxOutputBytes) break;
      result.results.push(hits[position++]);
    }
    if (position < hits.length && !result.results.length) stop('source-output-limit');
    result.truncated = position < hits.length; result.cursor = result.truncated ? cursorAt(position) : null;
    return result;
  }
  return Object.freeze({
    manifestDigest, manifest: sealedManifest, limits: caps,
    bind(binding) {
      if (closed) fail('source-closed'); keys(binding, ['threadId', 'turnId']);
      if (owner || Object.values(binding).some(v => typeof v !== 'string' || !v || v.length > 256)) fail('source-binding');
      owner = Object.freeze({ ...binding }); return true;
    },
    callback(request) {
      if (closed) fail('source-closed');
      callbacks++; if (callbacks > caps.maxCallbacks) stop('source-callback-limit');
      keys(request, ['threadId', 'turnId', 'callId', 'name', 'arguments', 'inputDigest']);
      const size = Buffer.byteLength(canonical(request)); inputBytes += size;
      if (callbacks > caps.maxCallbacks || size > caps.maxInputBytes || inputBytes > caps.totalInputBytes) stop('source-callback-limit');
      if (!owner || request.threadId !== owner.threadId || request.turnId !== owner.turnId || typeof request.callId !== 'string' || !request.callId || request.callId.length > 256) stop('source-foreign-call');
      const digest = evaluationInputDigest(request.name, request.arguments);
      if (request.inputDigest !== digest) stop('source-input-digest');
      const previous = recorded.get(request.callId);
      if (previous && previous.inputDigest !== digest) stop('source-replay');
      const result = previous?.result ?? immutable(request.name === 'snapshot.read' ? read(request.arguments) : request.name === 'snapshot.search' ? search(request.arguments) : fail('source-tool'));
      const length = bytes(result); outputBytes += length;
      if (length > caps.maxOutputBytes || outputBytes > caps.totalOutputBytes) stop('source-output-limit');
      if (!previous) recorded.set(request.callId, { inputDigest: digest, result });
      log.push(immutable({ ...owner, callId: request.callId, name: request.name, inputDigest: digest, outputDigest: hash(canonical(result)), inputBytes: size, outputBytes: length, duplicate: !!previous }));
      return result;
    },
    close(reason = 'terminal') { closed ||= String(reason); return true; },
    evidence() { return immutable({ manifestDigest, sourceBytes: total, owner, closed, callbacks, inputBytes, outputBytes, calls: [...log] }); },
  });
}
