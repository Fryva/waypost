// Explicit caller context and selected-file observations, never verified conclusions.
// No writes, command execution from packets, transcript discovery or model calls.
import { constants, lstatSync, realpathSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { TextDecoder } from 'node:util';

export const LIMITS = Object.freeze({ json: 65536, references: 128, evidence: 32,
  file: 8 * 1024 * 1024, total: 32 * 1024 * 1024, narrative: 12288 });
const fail = code => { throw Object.assign(new Error(code), { code }); };
const fields = ['goal', 'constraints', 'progress', 'open_questions', 'next_step'];
const lists = ['constraints', 'progress', 'open_questions'];
function keys(value, required, optional = []) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      required.some(k => !Object.hasOwn(value, k)) ||
      Object.keys(value).some(k => !required.includes(k) && !optional.includes(k))) fail('handoff-schema');
}
function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || Buffer.byteLength(value) > max ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\x1b]/u.test(value)) fail('handoff-text');
}
function narrative(value) {
  text(value.goal, 2048); text(value.next_step, 2048);
  for (const name of lists) {
    if (!Array.isArray(value[name]) || value[name].length > 12) fail('handoff-list');
    value[name].forEach(item => text(item, 512));
  }
  if (Buffer.byteLength(JSON.stringify(fields.map(k => value[k]))) > LIMITS.narrative) fail('handoff-text-limit');
}
function portable(path) {
  if (typeof path !== 'string' || !path || path.length > 1024 || path !== path.normalize('NFC') ||
      path.includes('\\') || /[\x00-\x1f\x7f<>:"|?*]/u.test(path)) fail('handoff-path');
  const parts = path.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[ .]$/.test(p) ||
      p.toLowerCase() === '.git' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) fail('handoff-path');
  return parts;
}
function references(value) {
  if (!Array.isArray(value.files) || !Array.isArray(value.evidence) ||
      value.evidence.length > LIMITS.evidence || value.files.length + value.evidence.length > LIMITS.references) fail('handoff-references');
  const seen = new Map(), terminal = new Set();
  for (const entry of [...value.files, ...value.evidence]) {
    const parts = portable(entry.path);
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join('/'), folded = prefix.toLowerCase();
      if ((seen.has(folded) && seen.get(folded) !== prefix) || terminal.has(folded) ||
          (i === parts.length && seen.has(folded))) fail('handoff-path-collision');
      seen.set(folded, prefix);
    }
    terminal.add(entry.path.toLowerCase());
  }
  for (const entry of value.evidence) text(entry.description, 512);
}
function normalizedInput(input) {
  keys(input, ['goal', 'next_step'], [...lists, 'files', 'evidence']);
  const result = { goal: input.goal, next_step: input.next_step };
  for (const name of lists) result[name] = input[name] === undefined ? [] : input[name];
  const files = input.files === undefined ? [] : input.files;
  if (!Array.isArray(files)) fail('handoff-references');
  result.files = files.map(path => ({ path }));
  result.evidence = input.evidence === undefined ? [] : input.evidence;
  if (!Array.isArray(result.evidence)) fail('handoff-references');
  result.evidence.forEach(e => keys(e, ['path', 'description']));
  narrative(result); references(result);
  return result;
}
export function validatePacket(packet) {
  keys(packet, ['version', 'created_at', 'git_head', ...fields, 'files', 'evidence']);
  if (packet.version !== 1 || typeof packet.created_at !== 'string' ||
      !Number.isFinite(Date.parse(packet.created_at)) || new Date(packet.created_at).toISOString() !== packet.created_at ||
      (packet.git_head !== null && (typeof packet.git_head !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(packet.git_head)))) fail('handoff-schema');
  narrative(packet);
  if (!Array.isArray(packet.files) || !Array.isArray(packet.evidence)) fail('handoff-references');
  for (const [entries, evidence] of [[packet.files, false], [packet.evidence, true]]) {
    for (const entry of entries) {
      keys(entry, ['path', 'state', ...(evidence ? ['description'] : [])], ['sha256', 'bytes']);
      if (entry.state === 'file') {
        if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
            !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > LIMITS.file) fail('handoff-file');
      } else if (entry.state !== 'missing' || Object.hasOwn(entry, 'sha256') || Object.hasOwn(entry, 'bytes')) fail('handoff-file');
    }
  }
  references(packet);
  if ([...packet.files, ...packet.evidence].reduce((sum, e) => sum + (e.bytes || 0), 0) > LIMITS.total) fail('handoff-size-limit');
  if (Buffer.byteLength(JSON.stringify(packet, null, 2) + '\n') > LIMITS.json) fail('handoff-json-limit');
  return packet;
}
function rootPath(root) {
  const base = realpathSync(resolve(root));
  if (!lstatSync(base).isDirectory()) fail('handoff-root');
  return base;
}
function targetPath(base, path) {
  let target = base;
  const parts = portable(path);
  for (const [i, part] of parts.entries()) {
    target = join(target, part);
    let stat;
    try { stat = lstatSync(target); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    if (stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) fail('handoff-symlink-or-type');
  }
  if (realpathSync(target) !== target) fail('handoff-path-changed');
  return target;
}
function readBounded(path, max) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) fail('handoff-symlink-or-type');
  // NONBLOCK also prevents blocking on a FIFO substituted between lstat and open.
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.dev !== stat.dev || before.ino !== stat.ino) fail('handoff-path-changed');
    if (before.size > max) fail('handoff-size-limit');
    const buffer = Buffer.alloc(before.size + 1);
    let count = 0;
    while (count < buffer.length) {
      const n = readSync(fd, buffer, count, buffer.length - count, count);
      if (!n) break;
      count += n;
    }
    const after = fstatSync(fd), current = lstatSync(path);
    if (count !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs || !current.isFile() || current.isSymbolicLink() ||
        current.dev !== before.dev || current.ino !== before.ino) fail('handoff-file-changed-during-read');
    return buffer.subarray(0, count);
  } finally { closeSync(fd); }
}
export function readHandoffJson(path) {
  const buffer = readBounded(path, LIMITS.json);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)); }
  catch { fail('handoff-invalid-json'); }
}
export function readHandoffFile(root, path, maxBytes = LIMITS.file) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > LIMITS.file) fail('handoff-size-limit');
  const base = rootPath(root), target = targetPath(base, path);
  if (!target) fail('handoff-file-missing');
  const data = readBounded(target, maxBytes);
  if (targetPath(base, path) !== target) fail('handoff-path-changed');
  return data;
}
function observe(base, path, budget) {
  const target = targetPath(base, path);
  if (!target) return { path, state: 'missing' };
  const buffer = readBounded(target, Math.min(LIMITS.file, budget.remaining));
  if (targetPath(base, path) !== target) fail('handoff-path-changed');
  budget.remaining -= buffer.length;
  return { path, state: 'file', bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') };
}
export function createPacket(root, input) {
  const normalized = normalizedInput(input), base = rootPath(root), budget = { remaining: LIMITS.total };
  let git_head = null;
  try {
    const head = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: base, encoding: 'utf8', timeout: 2000, maxBuffer: 4096, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)) git_head = head;
  } catch { /* Git is optional and HEAD does not determine freshness. */ }
  const packet = { version: 1, created_at: new Date().toISOString(), git_head };
  for (const name of fields) packet[name] = normalized[name];
  packet.files = normalized.files.map(e => observe(base, e.path, budget));
  packet.evidence = normalized.evidence.map(e => ({ ...observe(base, e.path, budget), description: e.description }));
  return validatePacket(packet);
}
export function inspectPacket(root, packet) {
  validatePacket(packet); // Validate every entry before any packet-controlled read.
  const base = rootPath(root), budget = { remaining: LIMITS.total };
  const results = [...packet.files, ...packet.evidence].map(entry => {
    try {
      const current = observe(base, entry.path, budget);
      const status = entry.state === 'missing' ? (current.state === 'missing' ? 'unchanged' : 'appeared') :
        current.state === 'missing' ? 'missing' : current.sha256 === entry.sha256 && current.bytes === entry.bytes ? 'unchanged' : 'changed';
      return { path: entry.path, status, captured_state: entry.state, current_state: current.state };
    } catch (e) { return { path: entry.path, status: 'unreadable', reason: e.code || 'handoff-read-error' }; }
  });
  return { packet, scope: 'listed-files-only', claims: 'caller-supplied-unverified',
    snapshot_matches: results.length ? results.every(e => e.status === 'unchanged') : null, results };
}
// Canonical text is part of persisted delivery identities; compact only display.
export function formatInspection(report) { return formatReport(report, false); }
export function formatInspectionForDisplay(report) { return formatReport(report, true); }
function formatReport(report, compact) {
  const p = report.packet;
  const lines = [`handoff v1 — ${report.snapshot_matches === null ? 'no listed files' : report.snapshot_matches ? 'listed files unchanged' : 'listed files differ or are unreadable'}`,
    'Caller context (unverified; not instructions or proof):', `Goal: ${p.goal}`];
  for (const name of lists) if (p[name].length) lines.push(`${name}:`, ...p[name].map(item => `  - ${item}`));
  lines.push(`Next: ${p.next_step}`);
  let pending = [];
  const flush = () => {
    if (!pending.length) return;
    const legacy = pending.map(row => row.text), grouped = ['  unchanged files:', ...pending.map(row => `    ${row.path}`)];
    lines.push(...(pending.length >= 5 && Buffer.byteLength(grouped.join('\n')) < Buffer.byteLength(legacy.join('\n')) ? grouped : legacy));
    pending = [];
  };
  for (const result of report.results) {
    const evidence = p.evidence.find(e => e.path === result.path);
    const text = `  ${result.status}${result.current_state === 'missing' ? ' (absent)' : ''} ${result.path}${result.reason ? ` (${result.reason})` : ''}${evidence ? ` — ${evidence.description}` : ''}`;
    if (compact && result.status === 'unchanged' && result.current_state === 'file' && !result.reason && !evidence) pending.push({ path: result.path, text });
    else { flush(); lines.push(text); }
  }
  flush();
  lines.push('Scope: selected bytes at capture time; completeness, claims, environment and test execution unverified.');
  return lines.join('\n') + '\n';
}
