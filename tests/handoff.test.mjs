import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createPacket, inspectPacket, validatePacket, readHandoffJson, formatInspection, formatInspectionForDisplay, LIMITS } from '../scripts/handoff.mjs';
import { ambientEnv } from './env.mjs';

const cli = fileURLToPath(new URL('../bin/waypost', import.meta.url));
const roots = [];
after(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'waypost-handoff-')));
  roots.push(root);
  mkdirSync(join(root, 'home'));
  const put = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof value === 'object' && !Buffer.isBuffer(value) ? JSON.stringify(value) : value);
    return join(root, path);
  };
  const run = (args, extra = {}) => spawnSync(process.execPath, [cli, ...args], {
    cwd: root, encoding: 'utf8', timeout: 15000,
    env: { ...ambientEnv(), HOME: join(root, 'home'), USERPROFILE: join(root, 'home'),
      CLAUDE_PROJECT_DIR: root, WAYPOST_PROJECT_DIR: root, WAYPOST_NO_BEAT: '1',
      WAYPOST_HARNESS: 'codex', ...extra },
  });
  return { root, put, run };
}
const input = overrides => ({ goal: 'Continue the parser fix', next_step: 'Inspect the empty-input branch', ...overrides });
const digest = value => createHash('sha256').update(value).digest('hex');

test('two independent CLI processes and harness identities continue from a portable packet', () => {
  const a = fixture(), b = fixture();
  for (const f of [a, b]) { f.put('src/parser.mjs', 'export const parse = () => [];\n'); f.put('logs/check.txt', '1 pass, 0 fail\n'); }
  a.put('input.json', input({ constraints: ['Preserve the API'], progress: ['Located branch'],
    open_questions: ['Runtime scenario untested'], files: ['src/parser.mjs', 'removed.mjs'],
    evidence: [{ path: 'logs/check.txt', description: 'Caller-reported log, not execution proof' }] }));
  const create = a.run(['handoff', 'create', '--input', 'input.json', '--output', 'packet.json'], { WAYPOST_SESSION_ID: 'writer', WAYPOST_HARNESS: 'claude' });
  assert.equal(create.status, 0, create.stderr);
  const packet = readHandoffJson(join(a.root, 'packet.json'));
  assert.equal(packet.version, 1); assert.equal(packet.git_head, null);
  assert.equal(packet.files[0].sha256, digest('export const parse = () => [];\n'));
  assert.deepEqual(packet.files[1], { path: 'removed.mjs', state: 'missing' });
  b.put('packet.json', readFileSync(join(a.root, 'packet.json')));
  const show = b.run(['--project', b.root, 'handoff', 'show', 'packet.json', '--json'], { WAYPOST_SESSION_ID: 'reader', WAYPOST_HARNESS: 'opencode', WAYPOST_PROJECT_DIR: '/does-not-exist' });
  assert.equal(show.status, 0, show.stderr);
  const report = JSON.parse(show.stdout);
  assert.equal(report.snapshot_matches, true); assert.equal(report.claims, 'caller-supplied-unverified');
  assert.equal(report.scope, 'listed-files-only'); assert.equal(report.results.length, 3);
  assert.ok(report.results.every(row => row.status === 'unchanged'));
  assert.deepEqual(report.packet, packet);
  assert.equal(existsSync(join(b.root, '.waypost')), false, 'no vault setup required');
  const human = b.run(['handoff', 'show', 'packet.json']);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /unchanged \(absent\) removed.mjs/);
  assert.match(human.stdout, /Caller context \(unverified/);
  assert.ok(Buffer.byteLength(human.stdout) < 1600, 'representative default output stays compact');
  assert.doesNotMatch(human.stdout, /1 pass, 0 fail/, 'full log is not injected');
  if (process.platform !== 'win32') assert.equal(statSync(join(a.root, 'packet.json')).mode & 0o777, 0o600);
});

test('content changes, deletion, appearance and changed evidence are reported together', () => {
  const f = fixture(); f.put('changed', 'one'); f.put('deleted', 'gone'); f.put('log', 'old');
  const packet = createPacket(f.root, input({ files: ['changed', 'deleted', 'new'], evidence: [{ path: 'log', description: 'Original log' }] }));
  f.put('changed', 'two'); rmSync(join(f.root, 'deleted')); f.put('new', 'appeared'); f.put('log', 'updated');
  const report = inspectPacket(f.root, packet);
  assert.equal(report.snapshot_matches, false);
  assert.deepEqual(report.results.map(e => e.status), ['changed', 'missing', 'appeared', 'changed']);
  f.put('packet.json', packet);
  const result = f.run(['handoff', 'show', 'packet.json', '--json']);
  assert.equal(result.status, 2, result.stderr); assert.equal(JSON.parse(result.stdout).results.length, 4);
});

test('byte freshness detects uncommitted changes independently of a constant real Git HEAD', () => {
  const f = fixture(); f.put('source', 'old');
  const git = args => {
    const r = spawnSync('git', ['-c', 'core.hooksPath=disabled-hooks', ...args], { cwd: f.root, encoding: 'utf8', input: '', env: { ...ambientEnv(), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(f.root, 'no-config') } });
    assert.equal(r.status, 0, r.stderr); return r.stdout.trim();
  };
  mkdirSync(join(f.root, 'empty-template'));
  git(['init', '--template=empty-template', '--quiet']);
  const tree = git(['mktree']);
  // Use a raw commit object: no user identity, commit hooks or global Git settings.
  const payload = `tree ${tree}\nauthor Fixture <fixture@example.invalid> 1 +0000\ncommitter Fixture <fixture@example.invalid> 1 +0000\n\nfixture\n`;
  const commit = spawnSync('git', ['hash-object', '-t', 'commit', '-w', '--stdin'], { cwd: f.root, input: payload, encoding: 'utf8' });
  assert.equal(commit.status, 0, commit.stderr); git(['update-ref', 'HEAD', commit.stdout.trim()]);
  const packet = createPacket(f.root, input({ files: ['source'] }));
  assert.equal(packet.git_head, commit.stdout.trim());
  f.put('source', 'new');
  assert.equal(git(['rev-parse', 'HEAD']), packet.git_head);
  assert.equal(inspectPacket(f.root, packet).snapshot_matches, false);
});

test('binary, empty and CRLF files use raw bytes and missing-to-missing is explicit', () => {
  const f = fixture(), bytes = Buffer.from([0, 255, 13, 10]);
  f.put('binary', bytes); f.put('empty', ''); f.put('crlf', 'a\r\n');
  const packet = createPacket(f.root, input({ files: ['binary', 'empty', 'crlf', 'missing/child'] }));
  assert.deepEqual(packet.files.slice(0, 3).map(e => e.sha256), [digest(bytes), digest(''), digest('a\r\n')]);
  assert.equal(inspectPacket(f.root, packet).snapshot_matches, true);
  f.put('crlf', 'a\n'); assert.equal(inspectPacket(f.root, packet).results[2].status, 'changed');
});

test('a state-only packet is unchecked and show exits 2', () => {
  const f = fixture(), packet = createPacket(f.root, input()); f.put('packet', packet);
  const report = inspectPacket(f.root, packet);
  assert.equal(report.snapshot_matches, null); assert.deepEqual(report.results, []);
  assert.match(formatInspection(report), /no listed files/);
  const result = f.run(['handoff', 'show', 'packet', '--json']);
  assert.equal(result.status, 2); assert.equal(JSON.parse(result.stdout).snapshot_matches, null);
});

test('exclusive output and input/source/evidence aliases never overwrite existing bytes', () => {
  const f = fixture(); f.put('input', input({ files: ['not-yet-created'] })); f.put('existing', 'keep');
  for (const output of ['input', 'existing', 'not-yet-created']) {
    const result = f.run(['handoff', 'create', '--input', 'input', '--output', output]);
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
  }
  assert.equal(readFileSync(join(f.root, 'existing'), 'utf8'), 'keep');
  assert.equal(existsSync(join(f.root, 'not-yet-created')), false);
  const result = f.run(['handoff', 'create', '--input', 'input', '--output', 'new-packet']); assert.equal(result.status, 0, result.stderr);
  const original = readFileSync(join(f.root, 'new-packet'));
  assert.equal(f.run(['handoff', 'create', '--input', 'input', '--output', 'new-packet']).status, 1);
  assert.deepEqual(readFileSync(join(f.root, 'new-packet')), original);
  f.put('evidence-input', input({ evidence: [{ path: 'new-log', description: 'Missing log' }] }));
  assert.equal(f.run(['handoff', 'create', '--input', 'evidence-input', '--output', 'new-log']).status, 1);
});

test('output cannot become a missing reference ancestor for files or evidence', () => {
  const f = fixture();
  for (const overrides of [
    { files: ['packet.json/child'] },
    { evidence: [{ path: 'packet.json/child', description: 'Missing evidence' }] },
    { files: ['PACKET.JSON/child'] },
  ]) {
    f.put('input', input(overrides));
    const result = f.run(['handoff', 'create', '--input', 'input', '--output', 'packet.json']);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /handoff-output-collision/);
    assert.equal(existsSync(join(f.root, 'packet.json')), false);
  }
  // Component boundaries matter: an unrelated prefix remains valid.
  f.put('input', input({ files: ['packet.json-other/child'] }));
  const create = f.run(['handoff', 'create', '--input', 'input', '--output', 'packet.json']);
  assert.equal(create.status, 0, create.stderr);
  assert.equal(f.run(['handoff', 'show', 'packet.json']).status, 0);
});

test('portable path and prefix collisions are rejected before observing files', () => {
  const f = fixture();
  for (const path of ['../outside', '/absolute', 'C:/file', 'a\\b', 'a//b', './a', 'a/../b', '.git/config', 'a/.GIT/x', 'a\u0000', 'CON', 'x/nul.txt', 'x.', 'x ', 'a?b', 'e\u0301']) {
    assert.throws(() => createPacket(f.root, input({ files: [path] })), /handoff-path/, path);
  }
  for (const files of [['a', 'a'], ['Dir/a', 'dir/b'], ['file', 'file/child'], ['file/child', 'file']]) {
    assert.throws(() => createPacket(f.root, input({ files })), /handoff-path-collision/);
  }
  assert.throws(() => createPacket(f.root, input({ files: ['same'], evidence: [{ path: 'SAME', description: 'duplicate' }] })), /handoff-path-collision/);
});

test('strict input and packet validation rejects unsupported and inconsistent metadata', () => {
  const f = fixture(), base = createPacket(f.root, input({ files: ['missing'] }));
  for (const value of [null, [], {}, input({ extra: true }), input({ goal: '' }), input({ progress: null }), input({ constraints: [''] }), input({ evidence: [null] }), input({ files: [null] })]) {
    assert.throws(() => createPacket(f.root, value), /handoff-/);
  }
  for (const patch of [{ version: 2 }, { created_at: 'yesterday' }, { git_head: 'not-a-sha' }, { extra: true },
    { files: null }, { files: [{ path: 'missing', state: 'missing', bytes: 0 }] },
    { files: [{ path: 'missing', state: 'file', bytes: 1, sha256: 'bad' }] },
    { files: [{ path: 'missing', state: 'file', bytes: -1, sha256: 'a'.repeat(64) }] }]) {
    assert.throws(() => validatePacket({ ...base, ...patch }), /handoff-/);
  }
  f.put('truncated', '{"version":');
  const result = f.run(['handoff', 'show', 'truncated']); assert.equal(result.status, 1); assert.equal(result.stdout, '');
  f.put('invalid-utf8', Buffer.from([0xff])); assert.throws(() => readHandoffJson(join(f.root, 'invalid-utf8')), /handoff-invalid-json/);
});

test('JSON, reference, text, per-file and total-read limits are enforced', () => {
  const f = fixture(); f.put('oversized-json', ' '.repeat(LIMITS.json + 1));
  assert.throws(() => readHandoffJson(join(f.root, 'oversized-json')), /handoff-size-limit/);
  assert.throws(() => createPacket(f.root, input({ files: Array.from({ length: 129 }, (_, i) => `file-${i}`) })), /handoff-references/);
  assert.throws(() => createPacket(f.root, input({ evidence: Array.from({ length: 33 }, (_, i) => ({ path: `log-${i}`, description: 'log' })) })), /handoff-references/);
  assert.throws(() => createPacket(f.root, input({ goal: 'x'.repeat(2049) })), /handoff-text/);
  assert.throws(() => createPacket(f.root, input({ progress: Array(13).fill('item') })), /handoff-list/);
  assert.throws(() => createPacket(f.root, input(Object.fromEntries(['constraints', 'progress', 'open_questions'].map(k => [k, Array(12).fill('x'.repeat(512))])))), /handoff-text-limit/);
  const packet = createPacket(f.root, input({ files: ['too-large'] }));
  f.put('too-large', Buffer.alloc(LIMITS.file + 1));
  assert.throws(() => createPacket(f.root, input({ files: ['too-large'] })), /handoff-size-limit/);
  assert.equal(inspectPacket(f.root, packet).results[0].status, 'unreadable');
  const chunk = Buffer.alloc(LIMITS.file);
  const files = Array.from({ length: 5 }, (_, i) => `chunk-${i}`); files.forEach(path => f.put(path, chunk));
  assert.throws(() => createPacket(f.root, input({ files })), /handoff-size-limit/);
});

test('all schema entries are validated before the first packet-controlled file read', () => {
  const f = fixture(), packet = createPacket(f.root, input({ files: ['first'] }));
  // If validation were interleaved with reads, first would return unreadable.
  mkdirSync(join(f.root, 'first')); packet.files.push({ path: '../outside', state: 'missing' });
  assert.throws(() => inspectPacket(f.root, packet), /handoff-path/);
});

test('symlink files, ancestors, broken links and output aliases are rejected', t => {
  const f = fixture(), other = fixture(); other.put('secret', 'outside');
  try { symlinkSync(other.root, join(f.root, 'link'), 'dir'); }
  catch (e) { if (e.code === 'EPERM') return t.skip('symlinks unavailable'); throw e; }
  symlinkSync(join(other.root, 'secret'), join(f.root, 'file-link'));
  symlinkSync(join(other.root, 'absent'), join(f.root, 'broken'));
  for (const path of ['link/secret', 'link/missing', 'file-link', 'broken']) {
    assert.throws(() => createPacket(f.root, input({ files: [path] })), /handoff-symlink-or-type/);
  }
  const packet = createPacket(f.root, input({ files: ['ancestor/absent'] }));
  symlinkSync(other.root, join(f.root, 'ancestor'), 'dir');
  assert.equal(inspectPacket(f.root, packet).results[0].status, 'unreadable');
  f.put('input', input()); symlinkSync(join(f.root, 'input'), join(f.root, 'output-link'));
  const before = readFileSync(join(f.root, 'input'));
  assert.equal(f.run(['handoff', 'create', '--input', 'input', '--output', 'output-link']).status, 1);
  assert.deepEqual(readFileSync(join(f.root, 'input')), before);
});

test('directories, non-directory ancestors and FIFOs cannot be captured as files', () => {
  const f = fixture(); mkdirSync(join(f.root, 'directory')); f.put('file', 'x');
  for (const path of ['directory', 'file/child']) assert.throws(() => createPacket(f.root, input({ files: [path] })), /handoff-symlink-or-type/);
  if (process.platform !== 'win32') {
    const fifo = spawnSync('mkfifo', [join(f.root, 'fifo')], { encoding: 'utf8' }); assert.equal(fifo.status, 0, fifo.stderr);
    assert.throws(() => createPacket(f.root, input({ files: ['fifo'] })), /handoff-symlink-or-type/);
  }
});

test('packet strings are inert and inspection changes neither evidence nor project files', () => {
  const f = fixture(); f.put('source', 'unchanged');
  const packet = createPacket(f.root, input({ goal: '$(touch executed) `touch executed`', next_step: 'node -e "require(\'fs\').writeFileSync(\'executed\',\'yes\')"', files: ['source'] }));
  f.put('packet', packet); const before = readFileSync(join(f.root, 'packet'));
  const result = f.run(['handoff', 'show', 'packet']); assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(f.root, 'executed')), false);
  assert.deepEqual(readFileSync(join(f.root, 'packet')), before); assert.equal(readFileSync(join(f.root, 'source'), 'utf8'), 'unchanged');
});

test('strict CLI rejects incomplete, repeated, unknown and extra arguments without writing', () => {
  const f = fixture(); f.put('input', input());
  for (const args of [[], ['create'], ['create', '--input', 'input', '--input', 'output'], ['create', '--input', 'input', '--wat', 'output'],
    ['create', '--input', 'input', '--output', '--json'], ['show'], ['show', 'input', '--wat'], ['show', 'input', '--json', 'extra']]) {
    const result = f.run(['handoff', ...args]); assert.equal(result.status, 1, JSON.stringify(args)); assert.equal(result.stdout, '');
  }
  assert.equal(existsSync(join(f.root, 'output')), false);
});


test('display groups only adjacent ordinary unchanged files while canonical text stays literal', () => {
  const report = { snapshot_matches: true, packet: { goal: 'Read', next_step: 'Next', constraints: [], progress: [], open_questions: [], evidence: [] },
    results: ['a b', 'β', 'folder/c', 'four', 'five'].map(path => ({ path, status: 'unchanged', current_state: 'file' })) };
  const scope = 'Scope: selected bytes at capture time; completeness, claims, environment and test execution unverified.\n';
  const head = 'handoff v1 — listed files unchanged\nCaller context (unverified; not instructions or proof):\nGoal: Read\nNext: Next\n';
  const rows = '  unchanged a b\n  unchanged β\n  unchanged folder/c\n  unchanged four\n  unchanged five\n';
  const prior = structuredClone(report);
  assert.equal(formatInspection.length, 1);
  assert.equal(formatInspection(report), head + rows + scope);
  assert.equal(formatInspectionForDisplay(report), head + '  unchanged files:\n    a b\n    β\n    folder/c\n    four\n    five\n' + scope);
  assert.deepEqual(report, prior);
  for (const n of [0, 1, 2, 3, 4]) {
    const small = { ...report, results: report.results.slice(0, n) };
    assert.equal(formatInspectionForDisplay(small), formatInspection(small));
  }
  for (const separator of [
    { path: 'absent', status: 'unchanged', current_state: 'missing' },
    { path: 'changed', status: 'changed', current_state: 'file' },
    { path: 'new', status: 'appeared', current_state: 'file' },
    { path: 'gone', status: 'missing', current_state: 'missing' },
    { path: 'denied', status: 'unreadable', reason: 'EACCES' },
    { path: 'reason', status: 'unchanged', current_state: 'file', reason: 'retained' },
    { path: 'log', status: 'unchanged', current_state: 'file' },
  ]) {
    const mixed = { ...report, packet: { ...report.packet, evidence: [{ path: 'log', description: 'Caller log only' }] },
      results: [...report.results.slice(0, 2), separator, ...report.results.slice(0, 2)] };
    assert.equal(formatInspectionForDisplay(mixed), formatInspection(mixed), separator.path);
    const groups = { ...mixed, results: [...report.results, separator, ...report.results] };
    const text = formatInspectionForDisplay(groups);
    assert.equal(text.split('  unchanged files:').length - 1, 2);
    const individual = formatInspection({ ...mixed, results: [separator] }).split('\n').find(line => line.startsWith('  '));
    assert.ok(text.includes('\n' + individual + '\n'));
  }
});

test('CLI inspection compacts display while JSON and stale or unchecked exits retain their meaning', () => {
  const f = fixture(), paths = ['a b', 'β', 'folder/c', 'four', 'five'];
  for (const path of paths) f.put(path, 'original');
  const packet = createPacket(f.root, input({ files: [...paths, 'absent'] })); f.put('packet', packet);
  for (const stale of [false, true]) {
    if (stale) f.put(paths[0], 'changed');
    const report = inspectPacket(f.root, packet), text = f.run(['handoff', 'show', 'packet']), json = f.run(['handoff', 'show', 'packet', '--json']);
    assert.equal(text.status, stale ? 2 : 0, text.stderr); assert.equal(json.status, text.status, json.stderr);
    assert.equal(text.stdout, formatInspectionForDisplay(report));
    assert.deepEqual(JSON.parse(json.stdout), report);
    assert.match(text.stdout, /unchanged \(absent\) absent/);
  }
  f.put('empty-packet', createPacket(f.root, input()));
  const empty = f.run(['handoff', 'show', 'empty-packet']); assert.equal(empty.status, 2); assert.match(empty.stdout, /no listed files/);
});
