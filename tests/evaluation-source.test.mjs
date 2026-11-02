import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { sealEvaluationSource, evaluationInputDigest } from '../scripts/evaluation-source.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
function fixture(t, files = { 'a.mjs': 'alpha\nbeta alpha\ngamma\n', 'nested/b.mjs': 'alpha\nno hit\n' }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'waypost-sealed-source-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const manifest = Object.entries(files).map(([path, text]) => {
    mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text);
    return { path, sha256: sha(text) };
  });
  return { root, manifest };
}
function broker(f, limits) {
  const b = sealEvaluationSource({ ...f, limits }); b.bind({ threadId: 'thread', turnId: 'turn' }); return b;
}
function request(name, args, callId = 'call', extra = {}) {
  return { threadId: 'thread', turnId: 'turn', callId, name, arguments: args, inputDigest: evaluationInputDigest(name, args), ...extra };
}
const read = (b, args, id, extra) => b.callback(request('snapshot.read', args, id, extra));
const search = (b, args, id) => b.callback(request('snapshot.search', args, id));
const code = expected => error => error.code === expected;

test('sealed reads use verified immutable bytes after filesystem changes and deletion', t => {
  const f = fixture(t), b = broker(f);
  writeFileSync(join(f.root, 'a.mjs'), 'changed'); rmSync(join(f.root, 'nested/b.mjs'));
  const r = read(b, { path: 'a.mjs', start_line: 2, end_line: 9 });
  assert.equal(r.text, 'beta alpha\ngamma'); assert.equal(r.end_line, 3); assert.equal(r.truncated, false);
  assert.equal(search(b, { query: 'alpha' }, 'search').results.length, 3);
  assert.equal(r.kind, 'source-data'); assert.ok(Object.isFrozen(r));
  assert.throws(() => { b.manifest[0].path = 'elsewhere'; }, TypeError);
  assert.equal(b.evidence().sourceBytes, Buffer.byteLength('alpha\nbeta alpha\ngamma\nalpha\nno hit\n'));
});

test('manifest identity is canonical and rejects changed hashes, unsupported text and oversized sources', t => {
  const f = fixture(t), a = sealEvaluationSource(f), b = sealEvaluationSource({ ...f, manifest: [...f.manifest].reverse() });
  assert.equal(a.manifestDigest, b.manifestDigest);
  assert.throws(() => sealEvaluationSource({ ...f, manifest: [{ path: 'a.mjs', sha256: sha('wrong') }] }), code('source-hash'));
  assert.throws(() => sealEvaluationSource({ ...f, limits: { maxFileBytes: 2 } }), code('source-size-limit'));
  assert.throws(() => sealEvaluationSource({ ...f, limits: { maxTotalBytes: 4 } }), code('source-size-limit'));
  assert.throws(() => sealEvaluationSource({ ...f, limits: { maxFiles: 1 } }), code('source-manifest'));
  writeFileSync(join(f.root, 'binary'), Buffer.from([255]));
  assert.throws(() => sealEvaluationSource({ ...f, manifest: [{ path: 'binary', sha256: sha(Buffer.from([255])) }] }), code('source-encoding'));
});

for (const path of ['/absolute', '../outside', 'nested/../a.mjs', './a.mjs', 'a\\b', '.git/config', 'nested/.GiT/config', 'C:/private', 'aux.txt', 'a//b', 'trailing.']) {
  test('rejects nonportable or forbidden manifest path ' + path, t => {
    const f = fixture(t); assert.throws(() => sealEvaluationSource({ ...f, manifest: [{ path, sha256: sha('') }] }), code('source-path'));
  });
}

test('rejects symlink files, parent directories, symlink roots and linked-worktree git indirection', t => {
  const f = fixture(t);
  symlinkSync(join(f.root, 'a.mjs'), join(f.root, 'link'));
  assert.throws(() => sealEvaluationSource({ ...f, manifest: [{ path: 'link', sha256: sha('alpha\nbeta alpha\ngamma\n') }] }), code('source-symlink-or-type'));
  symlinkSync(join(f.root, 'nested'), join(f.root, 'dirlink'));
  assert.throws(() => sealEvaluationSource({ ...f, manifest: [{ path: 'dirlink/b.mjs', sha256: sha('alpha\nno hit\n') }] }), code('source-symlink-or-type'));
  symlinkSync(f.root, join(f.root, 'rootlink'));
  assert.throws(() => sealEvaluationSource({ ...f, root: join(f.root, 'rootlink') }), code('source-root'));
  writeFileSync(join(f.root, '.git'), 'gitdir: /operator/key');
  assert.throws(() => sealEvaluationSource(f), code('source-git-indirection'));
});

test('rejects manifest collisions before they can silently alias one file', t => {
  const f = fixture(t);
  assert.throws(() => sealEvaluationSource({ ...f, manifest: [f.manifest[0], { ...f.manifest[0], path: 'A.mjs' }] }), code('source-case-collision'));
});

for (const [name, paths] of [
  ['absent case variants', ['missing/A.mjs', 'missing/a.mjs']],
  ['absent duplicate entries', ['missing/a.mjs', 'missing/a.mjs']],
  ['case variants of a directory prefix', ['Missing/a.mjs', 'missing/b.mjs']],
  ['an earlier absent noncolliding file', ['0-missing.mjs', 'z/A.mjs', 'z/a.mjs']],
]) {
  test('collision preflight precedes manifest lookup with ' + name, t => {
    const f = fixture(t);
    for (const order of [paths, [...paths].reverse()]) {
      const manifest = order.map(path => ({ path, sha256: sha('absent') }));
      assert.throws(() => sealEvaluationSource({ ...f, manifest }), code('source-case-collision'));
    }
  });
}

test('collision preflight permits distinct files sharing an exact directory prefix', t => {
  const f = fixture(t, { 'nested/a.mjs': 'first', 'nested/b.mjs': 'second' });
  const b = sealEvaluationSource(f);
  assert.deepEqual(b.manifest, f.manifest);
  assert.equal(b.evidence().sourceBytes, Buffer.byteLength('firstsecond'));
});

test('literal search is sorted by path bytes and line and paginates without losing hits', t => {
  const f = fixture(t, { 'z': 'x\nx\n', 'a': 'x\nX\nx\n', 'literal': 'a.*b\n' }), b = broker(f);
  const first = search(b, { query: 'x', limit: 2 }, 'one');
  assert.deepEqual(first.results, [{ path: 'a', line: 1 }, { path: 'a', line: 3 }]);
  assert.equal(first.truncated, true); assert.equal(typeof first.cursor, 'string');
  const second = search(b, { query: 'x', limit: 2, cursor: first.cursor }, 'two');
  assert.deepEqual(second.results, [{ path: 'z', line: 1 }, { path: 'z', line: 2 }]);
  assert.equal(second.truncated, false); assert.equal(second.cursor, null);
  assert.deepEqual(search(b, { query: '.*' }, 'literal').results, [{ path: 'literal', line: 1 }]);
  assert.throws(() => search(b, { query: 'other', cursor: first.cursor }, 'foreign'), code('source-cursor'));
  const other = broker(fixture(t, { 'different': 'x\n' }));
  assert.throws(() => search(other, { query: 'x', cursor: first.cursor }), code('source-cursor'));
});

test('range reads explicitly truncate at whole lines and output bounds, with continuation', t => {
  const f = fixture(t, { 'a': ('x'.repeat(100) + '\n').repeat(8) }), b = broker(f, { maxOutputBytes: 450 });
  const r = read(b, { path: 'a', start_line: 1, end_line: 8 });
  assert.equal(r.truncated, true); assert.equal(r.next_line, r.end_line + 1);
  assert.ok(Buffer.byteLength(JSON.stringify(r)) <= 450); assert.ok(r.end_line > 0);
  const next = read(b, { path: 'a', start_line: r.next_line, end_line: 8 }, 'next');
  assert.equal(next.start_line, r.next_line);
  assert.throws(() => read(b, { path: 'a', start_line: 0, end_line: 1 }, 'invalid'), code('source-range'));
  assert.throws(() => read(b, { path: 'a', start_line: 1, end_line: 201 }, 'huge'), code('source-range'));
  assert.throws(() => read(b, { path: 'operator-key', start_line: 1, end_line: 1 }, 'key'), code('source-not-manifest'));
});

test('duplicates retain exact result pairing without rereads but count toward traffic limits', t => {
  const f = fixture(t), b = broker(f, { maxCallbacks: 2 }), args = { path: 'a.mjs', start_line: 1, end_line: 1 };
  const first = read(b, args); rmSync(join(f.root, 'a.mjs'));
  assert.equal(read(b, args), first); assert.equal(b.evidence().calls[1].duplicate, true);
  assert.equal(b.evidence().outputBytes, Buffer.byteLength(JSON.stringify(first)) * 2);
  assert.throws(() => read(b, args), code('source-callback-limit'));
  assert.throws(() => read(b, args), code('source-closed'));
});

test('changed-input replay, foreign ownership and digest mismatch close without source data', t => {
  const f = fixture(t), args = { path: 'a.mjs', start_line: 1, end_line: 1 };
  const a = broker(f); read(a, args);
  assert.throws(() => read(a, { ...args, end_line: 2 }), code('source-replay'));
  const b = broker(f); assert.throws(() => read(b, args, 'call', { turnId: 'other' }), code('source-foreign-call'));
  const c = broker(f); assert.throws(() => read(c, args, 'call', { threadId: 'other' }), code('source-foreign-call'));
  const d = broker(f); assert.throws(() => read(d, args, 'call', { inputDigest: sha('incorrect') }), code('source-input-digest'));
  for (const item of [a, b, c, d]) assert.throws(() => read(item, args), code('source-closed'));
});

test('terminal, stop and unbound callbacks fail closed', t => {
  const f = fixture(t), args = { path: 'a.mjs', start_line: 1, end_line: 1 };
  for (const reason of ['terminal', 'stop']) {
    const b = broker(f); b.close(reason);
    assert.throws(() => read(b, args), code('source-closed')); assert.equal(b.evidence().calls.length, 0);
    assert.throws(() => b.bind({ threadId: 'new', turnId: 'new' }), code('source-closed'));
  }
  assert.throws(() => read(sealEvaluationSource(f), args), code('source-foreign-call'));
});

test('schemas, queries and aggregate byte limits are bounded before returning source', t => {
  const f = fixture(t), args = { path: 'a.mjs', start_line: 1, end_line: 1 };
  assert.throws(() => read(broker(f), { ...args, shell: 'pwd' }), code('source-schema'));
  assert.throws(() => search(broker(f), { query: 'a'.repeat(257) }), code('source-query'));
  assert.throws(() => search(broker(f), { query: 'a', limit: 101 }), code('source-search-limit'));
  const input = broker(f, { maxInputBytes: 1 }); assert.throws(() => read(input, args), code('source-callback-limit'));
  const aggregateIn = broker(f, { totalInputBytes: 1 }); assert.throws(() => read(aggregateIn, args), code('source-callback-limit'));
  const aggregateOut = broker(f, { totalOutputBytes: 1 }); assert.throws(() => read(aggregateOut, args), code('source-output-limit'));
  assert.throws(() => sealEvaluationSource({ ...f, limits: { unknown: 1 } }), code('source-schema'));
  assert.throws(() => sealEvaluationSource({ ...f, limits: { maxCallbacks: 0 } }), code('source-limits'));
});

test('search pages reuse one query while retaining fresh immutable results and duplicate traffic', t => {
  const f = fixture(t), b = broker(f), other = broker(f);
  const original = String.prototype.includes; let scans = 0;
  t.mock.method(String.prototype, 'includes', function (needle, ...args) {
    if (['alpha', 'beta', 'absent', 'ALPHA'].includes(needle)) scans++;
    return original.call(this, needle, ...args);
  });
  const first = search(b, { query: 'alpha', limit: 1 }, 'one');
  assert.equal(scans, 5);
  const next = search(b, { query: 'alpha', cursor: first.cursor, limit: 2 }, 'two');
  assert.deepEqual(next.results, [{ path: 'a.mjs', line: 2 }, { path: 'nested/b.mjs', line: 1 }]);
  const repeated = search(b, { query: 'alpha', limit: 1 }, 'three');
  assert.equal(scans, 5);
  assert.deepEqual(repeated, first);
  assert.notEqual(repeated, first); assert.notEqual(repeated.results, first.results);
  assert.notEqual(repeated.results[0], first.results[0]);
  assert.ok(Object.isFrozen(repeated.results[0]));
  const priorBytes = b.evidence().outputBytes;
  assert.equal(search(b, { query: 'alpha', limit: 1 }, 'one'), first);
  assert.equal(scans, 5);
  assert.equal(b.evidence().outputBytes - priorBytes, Buffer.byteLength(JSON.stringify(first)));
  assert.equal(b.evidence().calls.at(-1).duplicate, true);
  search(other, { query: 'alpha' }, 'independent'); assert.equal(scans, 10);
  search(b, { query: 'beta' }, 'switch'); assert.equal(scans, 15);
  search(b, { query: 'alpha' }, 'back'); assert.equal(scans, 20);
  assert.deepEqual(search(b, { query: 'absent' }, 'none').results, []);
  search(b, { query: 'absent', limit: 1 }, 'none-again'); assert.equal(scans, 25);
  assert.deepEqual(search(b, { query: 'ALPHA' }, 'case').results, []); assert.equal(scans, 30);
  assert.equal(search(b, { query: 'alpha', limit: 1 }, 'one'), first, 'recorded replay survives index eviction');
  assert.equal(scans, 30);
});

test('search hit retention is bounded and large queries evict the prior index', t => {
  const original = String.prototype.includes; let scans = 0;
  t.mock.method(String.prototype, 'includes', function (needle, ...args) {
    if (needle === 'small' || needle === 'large') scans++;
    return original.call(this, needle, ...args);
  });
  const f = fixture(t, { 'hits': 'small large\n'.repeat(4096) + 'large\n' }), b = broker(f);
  search(b, { query: 'small', limit: 1 }, 'one'); assert.equal(scans, 4097);
  search(b, { query: 'small', limit: 1 }, 'two'); assert.equal(scans, 4097);
  search(b, { query: 'large', limit: 1 }, 'three'); assert.equal(scans, 8194);
  search(b, { query: 'large', limit: 1 }, 'four'); assert.equal(scans, 12291);
  search(b, { query: 'small', limit: 1 }, 'five'); assert.equal(scans, 16388);
});

test('a warm search index preserves validation and does not cache a rejected position', t => {
  const f = fixture(t), b = broker(f), original = String.prototype.includes; let scans = 0;
  t.mock.method(String.prototype, 'includes', function (needle, ...args) {
    if (needle === 'alpha' || needle === 'beta') scans++;
    return original.call(this, needle, ...args);
  });
  const first = search(b, { query: 'alpha', limit: 1 }, 'warm');
  assert.equal(scans, 5);
  for (const [args, reason] of [
    [{ query: '' }, 'source-query'], [{ query: 'alpha', limit: 0 }, 'source-search-limit'],
    [{ query: 'alpha', extra: true }, 'source-schema'], [{ query: 'alpha', cursor: false }, 'source-cursor'],
    [{ query: 'beta', cursor: first.cursor }, 'source-cursor'],
  ]) assert.throws(() => search(b, args, 'invalid-' + reason + JSON.stringify(args)), code(reason));
  assert.equal(scans, 5);
  const binding = sha(JSON.stringify({ manifest: b.manifestDigest, query: 'beta' }));
  const cursor = Buffer.from(JSON.stringify({ binding, position: 99 })).toString('base64url');
  assert.throws(() => search(b, { query: 'beta', cursor }, 'out-of-range'), code('source-cursor'));
  assert.equal(scans, 10);
  search(b, { query: 'beta' }, 'valid'); assert.equal(scans, 15);
  b.close(); assert.throws(() => search(b, { query: 'beta' }, 'closed'), code('source-closed'));
  assert.equal(scans, 15);
});

test('range byte checks retain escaped-text boundaries and the independent final output limit', t => {
  const lines = ['', 'quote" and \\ slash', 'Привет 😀', '\r\t\0', '\u2028', '\ufeffinside', 'end'];
  const f = fixture(t, { 'range': lines.join('\n') + '\n' });
  const args = { path: 'range', start_line: 1, end_line: lines.length };
  const whole = read(broker(f), args);
  assert.equal(whole.text, lines.join('\n'));
  for (let count = 1; count < lines.length; count++) {
    const preview = { ...whole, text: lines.slice(0, count).join('\n'), end_line: count,
      truncated: true, next_line: count + 1 };
    const cap = Buffer.byteLength(JSON.stringify(preview));
    for (const delta of [-1, 0, 1]) {
      const b = broker(f, { maxOutputBytes: cap + delta });
      if (count === 1 && delta === -1) {
        assert.throws(() => read(b, args), code('source-output-limit')); continue;
      }
      const result = read(b, args), expected = count - (delta === -1 ? 1 : 0);
      assert.equal(result.end_line, expected);
      assert.equal(result.text, lines.slice(0, expected).join('\n'));
      assert.equal(result.next_line, expected + 1);
      assert.equal(result.truncated, true);
    }
  }
  const previewSize = Buffer.byteLength(JSON.stringify({ ...whole, truncated: true, next_line: lines.length + 1 }));
  const finalSize = Buffer.byteLength(JSON.stringify(whole));
  assert.equal(finalSize - previewSize, 4);
  for (const cap of [previewSize, finalSize - 1]) {
    const b = broker(f, { maxOutputBytes: cap });
    assert.throws(() => read(b, args), code('source-output-limit'));
    assert.equal(b.evidence().outputBytes, finalSize);
    assert.equal(b.evidence().calls.length, 0);
    assert.equal(b.evidence().closed, 'source-output-limit');
  }
  assert.deepEqual(read(broker(f, { maxOutputBytes: finalSize }), args), whole);
});

test('range text is joined once for a complete two-hundred-line response', t => {
  const f = fixture(t, { 'range': ('x'.repeat(100) + '\n').repeat(200) }), b = broker(f);
  const original = Array.prototype.join; let joins = 0, result;
  Array.prototype.join = function (separator) {
    if (separator === '\n') joins++;
    return original.call(this, separator);
  };
  try { result = read(b, { path: 'range', start_line: 1, end_line: 200 }); }
  finally { Array.prototype.join = original; }
  assert.equal(joins, 1);
  assert.equal(result.end_line, 200); assert.equal(result.truncated, false);
  assert.equal(result.text, Array(200).fill('x'.repeat(100)).join('\n'));
});
