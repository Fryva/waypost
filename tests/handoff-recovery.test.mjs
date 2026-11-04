import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPacket } from '../scripts/handoff.mjs';
import { runHandoffCommand } from '../bin/cli/handoff-process.mjs';
import './env.mjs';
const roots = []; after(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })));
const driver = fileURLToPath(new URL('./helpers/handoff-interruption.mjs', import.meta.url));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'waypost-recovery-')); roots.push(root);
  writeFileSync(join(root, 'source'), 'surrogate source');
  writeFileSync(join(root, 'packet.json'), JSON.stringify(createPacket(root, { goal: 'Continue', next_step: 'Inspect', files: ['source'] })));
  writeFileSync(join(root, 'transport.json'), JSON.stringify({ questions: 0, inferences: 0, reserved: 0 }));
  return root;
}
function run(root, boundary, mode) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [driver, root, boundary, mode], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let message, stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(Error('surrogate-test-timeout')); }, 10000);
    child.stderr.on('data', data => { stderr += data; });
    child.on('message', value => { message = value; if (value.boundary) child.kill('SIGKILL'); });
    child.once('error', reject);
    child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, message, stderr }); });
  });
}
for (const boundary of ['prepared', 'sent', 'consumed', 'received', 'answered']) {
  test(`actual SIGKILL at ${boundary} preserves surrogate identity and recovery authority`, async () => {
    const root = fixture(), first = await run(root, boundary, 'start');
    assert.equal(first.signal, 'SIGKILL', first.stderr); assert.equal(first.message.boundary, boundary);
    const read = name => JSON.parse(readFileSync(join(root, name), 'utf8'));
    const before = read('delivery.json'), ledgerBefore = read('transport.json');
    const next = await run(root, 'none', 'resume'), state = read('delivery.json'), ledger = read('transport.json');
    assert.equal(state.request_key, before.request_key); assert.equal(state.challenge, before.challenge);
    assert.equal(state.deadline_at, before.deadline_at);
    if (before.message_id) assert.equal(state.message_id, before.message_id);
    assert.equal(ledger.questions, 1); assert.equal(ledger.inferences, 1);
    if (boundary === 'consumed') {
      assert.equal(next.code, 1); assert.equal(state.error, 'surrogate-consumed-unknown');
      assert.equal(ledger.reserved, 100); assert.deepEqual(ledger, ledgerBefore);
    } else {
      assert.equal(next.code, 0, next.stderr); assert.equal(state.stage, 'answered');
      assert.equal(state.answer.answer, 'surrogate-answer'); assert.equal(ledger.reserved, 0);
    }
  });
}
const execute = (source, options = {}) => runHandoffCommand(process.execPath, ['-e', source], { deadlineAt: Date.now() + 5000, ...options });
test('bounded command runner parses normal output and rejects failed exit and malformed JSON', async () => {
  assert.deepEqual(await execute('console.log(JSON.stringify({ok:true}))'), { ok: true });
  await assert.rejects(execute('process.exit(4)'), /command-failed:4/);
  await assert.rejects(execute('console.log("invalid")'), /command-json/);
  await assert.rejects(runHandoffCommand('/no-such-waypost-executable', [], { deadlineAt: Date.now() + 1000 }), /command-failed:ENOENT/);
});
test('command deadline stops its held child within cleanup grace and leaves native closure unknown', async () => {
  const started = Date.now();
  await assert.rejects(execute('process.on("SIGTERM",()=>{});setInterval(()=>{},1000)', { deadlineAt: Date.now() + 200, cleanupGraceMs: 200 }), error => {
    assert.equal(error.message, 'handoff-delivery-deadline');
    assert.equal(error.command_cleanup.process_closed, true);
    assert.equal(error.command_cleanup.native_closure, 'unknown'); return true;
  });
  assert.ok(Date.now() - started < 3000);
});
test('command output caps stdout and stderr together and closes the owned child', async () => {
  for (const stream of ['stdout', 'stderr']) {
    await assert.rejects(execute(`process.${stream}.write("x".repeat(4096));setInterval(()=>{},1000)`, { maxBytes: 128, cleanupGraceMs: 200 }), error => {
      assert.equal(error.message, 'handoff-team-command-output-limit'); assert.equal(error.command_cleanup.process_closed, true); return true;
    });
  }
});
