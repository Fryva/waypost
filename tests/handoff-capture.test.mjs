import "./env.mjs";
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, mkdirSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { captureCommand, handleCapture } from '../bin/cli/handoff-capture.mjs';
import { parseCaptureArgs, reserveCapturePacket, validateCaptureReceipt, CAPTURE_LIMITS } from '../scripts/handoff-capture.mjs';
import { createPacket, inspectPacket, validatePacket } from '../scripts/handoff.mjs';

const roots = [];
after(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })));
const input = extra => ({ goal: 'Inspect selected inputs', next_step: 'Read the receipt', ...extra });
function fixture(extra = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'waypost-capture-'))); roots.push(root);
  writeFileSync(join(root, 'input.json'), JSON.stringify(input(extra)));
  return { root, input: join(root, 'input.json'), outputDir: 'capture', argv: [process.execPath, '-e', ''], timeoutMs: 3000, maxLogBytes: 65536 };
}
const read = (f, name) => readFileSync(join(f.root, f.outputDir, name));
const digest = b => createHash('sha256').update(b).digest('hex');

test('success retains raw binary/empty streams, independent status and v1 packet roundtrip', async () => {
  const f = fixture({ files: ['source'] }); writeFileSync(join(f.root, 'source'), 'same');
  f.argv = [process.execPath, '-e', 'process.stdout.write(Buffer.from([0,255,13,10]))'];
  const r = await captureCommand(f);
  assert.equal(r.status, 0); assert.equal(r.receipt.capture.complete, true);
  assert.equal(r.receipt.inputs_unchanged, true); assert.equal(r.receipt.cwd, '.');
  assert.deepEqual(read(f, 'stdout.log'), Buffer.from([0, 255, 13, 10]));
  assert.equal(read(f, 'stderr.log').length, 0);
  assert.equal(r.receipt.logs.stdout.sha256, digest(read(f, 'stdout.log')));
  assert.equal(r.receipt.logs.stderr.sha256, digest(Buffer.alloc(0)));
  validateCaptureReceipt(JSON.parse(read(f, 'capture.json')));
  validatePacket(JSON.parse(read(f, 'packet.json')));
  assert.equal(inspectPacket(f.root, r.packet).snapshot_matches, true);
  assert.equal(r.packet.evidence.length, 3);
});

test('nonzero complete command status propagates without claiming incomplete capture', async () => {
  const f = fixture(); f.argv = [process.execPath, '-e', 'process.stderr.write("failed");process.exitCode=7'];
  const r = await captureCommand(f);
  assert.equal(r.status, 7); assert.equal(r.receipt.command.exit_code, 7);
  assert.equal(r.receipt.capture.complete, true); assert.equal(r.receipt.inputs_unchanged, null);
  assert.equal(read(f, 'stderr.log').toString(), 'failed');
});

test('selected changed, missing and appeared sources are retained before/after', async () => {
  const f = fixture({ files: ['changed', 'missing', 'appeared'] });
  writeFileSync(join(f.root, 'changed'), 'before'); writeFileSync(join(f.root, 'missing'), 'gone');
  f.argv = [process.execPath, '-e', 'const fs=require("fs");fs.writeFileSync("changed","after");fs.unlinkSync("missing");fs.writeFileSync("appeared","new")'];
  const r = await captureCommand(f);
  assert.equal(r.status, 0); assert.equal(r.receipt.inputs_unchanged, false);
  assert.deepEqual(r.receipt.before.files.map(e => e.state), ['file', 'file', 'missing']);
  assert.deepEqual(r.receipt.after.files.map(e => e.state), ['file', 'missing', 'file']);
  assert.notEqual(r.receipt.before.files[0].sha256, r.receipt.after.files[0].sha256);
});

test('post-command snapshot failures mark incomplete and keep diagnostics', async () => {
  const f = fixture({ files: ['source'] }); writeFileSync(join(f.root, 'source'), 'before');
  f.argv = [process.execPath, '-e', 'const fs=require("fs");fs.unlinkSync("source");fs.mkdirSync("source")'];
  const r = await captureCommand(f);
  assert.equal(r.status, 1); assert.equal(r.receipt.capture.complete, false);
  assert.equal(r.receipt.after, null); assert.equal(r.receipt.inputs_unchanged, null);
  assert.ok(r.receipt.after_error);
  assert.equal(inspectPacket(f.root, r.packet).snapshot_matches, false);
});

test('timeout kills a direct child ignoring TERM within bounded time', async () => {
  const f = fixture(); f.timeoutMs = 100;
  f.argv = [process.execPath, '-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'];
  const start = Date.now(), r = await captureCommand(f);
  assert.ok(Date.now() - start < 4000); assert.equal(r.status, 124);
  assert.equal(r.receipt.capture.complete, false); assert.equal(r.receipt.capture.reason, 'capture-timeout');
});

test('inherited pipes have an independent bounded drain deadline', async () => {
  const f = fixture();
  f.argv = [process.execPath, '-e', 'require("child_process").spawn(process.execPath,["-e","setTimeout(()=>{},2600)"],{stdio:["ignore",1,2]}).unref()'];
  const r = await captureCommand(f);
  assert.equal(r.status, 1); assert.equal(r.receipt.command.exit_code, 0);
  assert.equal(r.receipt.capture.reason, 'capture-pipe-drain-timeout');
});

test('log bound retains a bounded raw prefix and marks incomplete', async () => {
  const f = fixture(); f.maxLogBytes = 8;
  f.argv = [process.execPath, '-e', 'process.stdout.write(Buffer.alloc(100,255))'];
  const r = await captureCommand(f);
  assert.equal(r.status, 1); assert.equal(r.receipt.capture.reason, 'capture-log-limit');
  assert.deepEqual(read(f, 'stdout.log'), Buffer.alloc(8, 255));
});

test('actual log writer failures terminate the child and cannot claim complete', async () => {
  const f = fixture(); f.argv = [process.execPath, '-e', 'process.stdout.write("hello");setInterval(()=>{},1000)'];
  const r = await captureCommand(f, { write() { throw Object.assign(new Error('disk'), { code: 'ENOSPC' }); } });
  assert.equal(r.status, 1); assert.equal(r.receipt.capture.complete, false);
  assert.equal(r.receipt.capture.reason, 'ENOSPC');
});

test('spawn error status is separate from capture completeness', async () => {
  const f = fixture(); f.argv = [join(f.root, 'no-executable')];
  const r = await captureCommand(f);
  assert.equal(r.status, 1); assert.equal(r.receipt.command.spawn_error, 'ENOENT');
  assert.equal(r.receipt.command.exit_code, null); assert.equal(r.receipt.command.signal, null);
  assert.equal(r.receipt.capture.complete, false);
});

test('packet publication failure marks own receipt incomplete and preserves foreign bytes', async () => {
  const f = fixture();
  f.argv = [process.execPath, '-e', 'require("fs").writeFileSync("capture/packet.json","foreign")'];
  await assert.rejects(captureCommand(f), /EEXIST/);
  assert.equal(read(f, 'packet.json').toString(), 'foreign');
  const receipt = JSON.parse(read(f, 'capture.json'));
  assert.equal(receipt.capture.complete, false);
  assert.equal(receipt.capture.reason, 'capture-publication-error');
});

test('malformed or hostile input is inert and rejected before spawn/reservation', async () => {
  for (const value of ['{', JSON.stringify(input({ extra: 'execute me' })), JSON.stringify(input({ files: ['../outside'] }))]) {
    const f = fixture(); writeFileSync(f.input, value);
    let spawned = false;
    await assert.rejects(captureCommand(f, { spawn() { spawned = true; throw new Error('unexpected'); } }));
    assert.equal(spawned, false); assert.equal(existsSync(join(f.root, 'capture')), false);
  }
  const f = fixture({ goal: '$(touch executed)', next_step: '`touch executed`' });
  await captureCommand(f); assert.equal(existsSync(join(f.root, 'executed')), false);
});

test('source/evidence/output/ancestor/case/input collisions never clobber', async () => {
  for (const extra of [{ files: ['capture'] }, { files: ['CAPTURE/child'] }, { evidence: [{ path: 'capture/log', description: 'selected' }] }]) {
    const f = fixture(extra); await assert.rejects(captureCommand(f), /capture-output-collision|handoff-path-collision/);
    assert.equal(existsSync(join(f.root, 'capture')), false);
  }
  const f = fixture(); mkdirSync(join(f.root, 'capture')); writeFileSync(join(f.root, 'capture', 'keep'), 'keep');
  await assert.rejects(captureCommand(f), /capture-output-exists/);
  assert.equal(readFileSync(join(f.root, 'capture', 'keep'), 'utf8'), 'keep');
  const g = fixture(); g.outputDir = 'input.json'; await assert.rejects(captureCommand(g));
  const h = fixture(); mkdirSync(join(h.root, 'Capture')); await assert.rejects(captureCommand(h), /capture-output-exists/);
});

test('symlink output parents and missing parents reject before spawn', async t => {
  const f = fixture(); f.outputDir = 'missing/out'; await assert.rejects(captureCommand(f));
  try { symlinkSync(f.root, join(f.root, 'link'), 'dir'); }
  catch (e) { if (e.code === 'EPERM') return t.skip('symlink unavailable'); throw e; }
  f.outputDir = 'link/out'; await assert.rejects(captureCommand(f), /capture-parent-symlink-or-type/);
});

test('argv/options are bounded and batch targets unsupported on every OS', () => {
  const base = ['--input', 'input', '--output-dir', 'out'];
  for (const tail of [[], ['--', 'tool.cmd'], ['--', 'TOOL.BAT'], ['--', 'x\0'], ['--', ...Array(129).fill('x')], ['--', 'x'.repeat(16385)]]) {
    assert.throws(() => parseCaptureArgs([...base, ...tail]), /capture-/);
  }
  for (const more of [['--timeout-ms', '300001'], ['--max-log-bytes', '4194305'], ['--timeout-ms', '0'], ['--wat', '1'], ['--input', 'again']]) {
    assert.throws(() => parseCaptureArgs([...base, ...more, '--', 'tool']), /capture-/);
  }
});

test('reserved evidence counts, byte budget and worst-case JSON fail preflight', () => {
  const f = fixture();
  const packet = createPacket(f.root, input({ evidence: Array.from({ length: 30 }, (_, i) => ({ path: `log${i}`, description: 'old' })) }));
  assert.throws(() => reserveCapturePacket(packet, 'capture', 8), /capture-references/);
  const refs = Array.from({ length: 126 }, (_, i) => `missing${i}`);
  assert.throws(() => reserveCapturePacket(createPacket(f.root, input({ files: refs })), 'capture', 8), /capture-references/);
  const long = Array.from({ length: 100 }, (_, i) => `missing${i}/${Array(10).fill('x'.repeat(51)).join('/')}`);
  assert.throws(() => reserveCapturePacket(createPacket(f.root, input({ files: long })), 'capture', 8), /capture-json-limit/);
  const big = createPacket(f.root, input({ files: ['a', 'b', 'c', 'd'] }));
  big.files = big.files.map(e => ({ ...e, state: 'file', bytes: 8 * 1024 * 1024, sha256: 'a'.repeat(64) }));
  assert.throws(() => reserveCapturePacket(big, 'capture', 8), /capture-size-limit/);
});

test('receipt rejects malformed command/capture/log metadata', async () => {
  const r = await captureCommand(fixture());
  for (const patch of [{ version: 2 }, { inputs_unchanged: 'yes' }, { cwd: '/private' },
    { inputs_unchanged: true }, { argv: [''] }, { after_error: 42 }, { extra: true },
    { finished_at: '2000-01-01T00:00:00.000Z' },
    { command: { exit_code: '0', signal: null, spawn_error: null } },
    { command: { exit_code: 0, signal: 'SIGTERM', spawn_error: null } },
    { command: { ...r.receipt.command, extra: true } },
    { capture: { complete: true, reason: 'failed' } }, { logs: { stdout: { bytes: -1 }, stderr: {} } }]) {
    assert.throws(() => validateCaptureReceipt({ ...r.receipt, ...patch }), /capture-/);
  }
  assert.equal(CAPTURE_LIMITS.receipt, 262144);
});

test('post-command replaced/grown log is bounded and makes capture incomplete', async () => {
  for (const body of [
    'fs.writeFileSync("capture/stdout.log",Buffer.alloc(100))',
    'fs.unlinkSync("capture/stdout.log");fs.mkdirSync("capture/stdout.log")',
  ]) {
    const f = fixture(); f.maxLogBytes = 8;
    f.argv = [process.execPath, '-e', `const fs=require("fs");${body}`];
    // A directory also makes the final evidence packet invalid, but the receipt
    // remains an explicit incomplete diagnostic. A grown regular log is retained.
    try {
      const r = await captureCommand(f); assert.equal(r.status, 1);
    } catch (e) { assert.match(e.message, /handoff-/); }
    const receipt = JSON.parse(read(f, 'capture.json'));
    assert.equal(receipt.capture.complete, false);
    assert.equal(receipt.logs.stdout.sha256, null);
  }
});

test('routing preserves getter reads, bare callbacks, heavy scope and refusal', async () => {
  const f = fixture(), other = fixture();
  const originalCwd = process.cwd(), originalCode = process.exitCode;
  writeFileSync(join(other.root, 'shell-input'), JSON.stringify(input()));
  let calls = 0, rootReads = 0, runnerReads = 0;
  const events = [];
  try {
    process.chdir(other.root);
    await handleCapture(['--input', 'shell-input', '--output-dir', 'capture', '--', process.execPath, '-e', ''], {
      get projectRoot() {
        events.push('root-read'); rootReads++;
        if (rootReads === 1) return () => { throw new Error('first root value must not be called'); };
        return function () { assert.equal(this, undefined); events.push('root-call'); return f.root; };
      },
      get handleRun() {
        events.push('runner-read'); runnerReads++;
        if (runnerReads === 1) return () => { throw new Error('first runner value must not be called'); };
        return async function (args) {
          assert.equal(this, undefined); events.push('runner-call'); calls++;
          assert.equal(process.cwd(), f.root);
          assert.deepEqual(args.slice(0, 3), ['--heavy', '--', process.execPath]);
          assert.equal(args[args.indexOf('--input') + 1], join(other.root, 'shell-input'));
          assert.equal(args[args.indexOf('--root') + 1], f.root);
          process.exitCode = 75;
        };
      },
    });
    assert.equal(calls, 1); assert.equal(rootReads, 2); assert.equal(runnerReads, 2);
    assert.deepEqual(events, ['root-read', 'root-read', 'root-call', 'runner-read', 'runner-read', 'runner-call']);
    assert.equal(process.exitCode, 75); assert.equal(process.cwd(), other.root);
    assert.equal(existsSync(join(f.root, 'capture')), false, 'admission refusal cannot reserve output or run command');
  } finally { process.chdir(originalCwd); process.exitCode = originalCode; }
});

test('capture preflight and dependency exceptions restore cwd without launching work', async () => {
  const originalCwd = process.cwd(), originalCode = process.exitCode;
  try {
    for (const phase of ['preflight', 'root-getter', 'runner-getter', 'runner-call']) {
      const f = fixture(), other = fixture();
      writeFileSync(join(other.root, 'shell-input'), JSON.stringify(input()));
      if (phase === 'preflight') mkdirSync(join(f.root, 'capture'));
      let runnerReads = 0, runnerCalls = 0;
      process.chdir(other.root); process.exitCode = undefined;
      await handleCapture(['--input', 'shell-input', '--output-dir', 'capture', '--', process.execPath, '-e', ''], {
        get projectRoot() {
          if (phase === 'root-getter') throw new Error('injected root getter');
          return () => f.root;
        },
        get handleRun() {
          runnerReads++;
          if (phase === 'runner-getter') throw new Error('injected runner getter');
          return async function () {
            runnerCalls++; assert.equal(this, undefined); assert.equal(process.cwd(), f.root);
            throw new Error('injected runner call');
          };
        },
      });
      assert.equal(process.exitCode, 1); assert.equal(process.cwd(), other.root);
      assert.equal(runnerReads, ['preflight', 'root-getter'].includes(phase) ? 0 : phase === 'runner-getter' ? 1 : 2);
      assert.equal(runnerCalls, phase === 'runner-call' ? 1 : 0);
      assert.equal(existsSync(join(f.root, 'capture', 'capture.json')), false);
    }
  } finally { process.chdir(originalCwd); process.exitCode = originalCode; }
});
