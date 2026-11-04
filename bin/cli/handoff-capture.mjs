// Writer boundary. Importing this module performs no filesystem operations.
import { lstatSync, realpathSync, readdirSync, mkdirSync, openSync, writeSync, closeSync, writeFileSync, ftruncateSync } from 'node:fs';
import { resolve, join, sep, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as osConstants } from 'node:os';
import { createPacket, readHandoffJson, readHandoffFile, validatePacket } from '../../scripts/handoff.mjs';
import { CAPTURE_LIMITS, parseCaptureArgs, reserveCapturePacket, captureEvidence, compareCaptureInputs, validateCaptureReceipt } from '../../scripts/handoff-capture.mjs';

const fail = message => { throw new Error(message); };
const bytes = value => JSON.stringify(value, null, 2) + '\n';
function overlaps(a, b) {
  a = a.toLowerCase(); b = b.toLowerCase();
  return a === b || a.startsWith(b + sep) || b.startsWith(a + sep);
}
function newDestination(root, relativeDestination) {
  let current = root;
  const parts = relativeDestination.split('/');
  for (const [i, part] of parts.entries()) {
    const match = readdirSync(current).find(name => name.toLowerCase() === part.toLowerCase());
    if (i === parts.length - 1) {
      if (match) fail('capture-output-exists');
      return join(current, part);
    }
    if (match !== part) fail('capture-parent-missing-or-case-collision');
    current = join(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory() || realpathSync(current) !== current) fail('capture-parent-symlink-or-type');
  }
}
export function preflightCapture(options) {
  const root = realpathSync(resolve(options.root));
  if (root !== options.root || !isAbsolute(options.root) || !lstatSync(root).isDirectory()) fail('capture-root');
  const inputPath = resolve(options.input);
  const input = readHandoffJson(inputPath);
  const before = createPacket(root, input);
  reserveCapturePacket(before, options.outputDir, options.maxLogBytes);
  const output = newDestination(root, options.outputDir);
  const refs = [...before.files, ...before.evidence].map(e => join(root, e.path));
  if ([inputPath, realpathSync(inputPath), ...refs].some(source => overlaps(output, source))) fail('capture-output-collision');
  return { root, input, before, output };
}
function exclusiveWrite(path, value) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, value); } finally { closeSync(fd); }
}

// Only the explicit caller argv is executable. Selected JSON is inert data.
export async function captureCommand(options, dependencies = {}) {
  // Re-parse even direct library calls: injected writers do not relax CLI bounds.
  options = parseCaptureArgs(['--root', options.root, '--input', options.input, '--output-dir', options.outputDir,
    '--timeout-ms', String(options.timeoutMs ?? CAPTURE_LIMITS.timeout), '--max-log-bytes', String(options.maxLogBytes ?? CAPTURE_LIMITS.logs), '--', ...options.argv], true);
  const { root, input, before, output } = preflightCapture(options);
  mkdirSync(output, { mode: 0o700 }); // Exclusive reservation; parent must already exist.
  const started_at = new Date().toISOString();
  const command = { exit_code: null, signal: null, spawn_error: null };
  let reason = null, timedOut = false, child, total = 0;
  const logs = {}, fds = {};
  const recordError = error => { reason ||= String(error?.code || error?.message || error).slice(0, 512); };
  try {
    for (const name of ['stdout', 'stderr']) {
      fds[name] = openSync(join(output, `${name}.log`), 'wx', 0o600);
      logs[name] = { path: `${options.outputDir}/${name}.log`, bytes: 0, sha256: null };
    }
  } catch (e) {
    for (const fd of Object.values(fds)) { try { closeSync(fd); } catch {} }
    throw e; // No command was started; never publish a success packet.
  }
  let timer, killTimer, drainTimer;
  await new Promise(done => {
    let settled = false, exited = false;
    const finish = () => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(killTimer); clearTimeout(drainTimer); done();
    };
    const boundDrain = () => {
      if (drainTimer) return;
      drainTimer = setTimeout(() => {
        recordError('capture-pipe-drain-timeout');
        child?.stdout?.destroy(); child?.stderr?.destroy();
        finish();
      }, 2000);
    };
    const terminate = () => {
      if (!child) return;
      try { child.kill('SIGTERM'); } catch (e) { recordError(e); }
      if (!killTimer && !exited) killTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (e) { recordError(e); }
      }, 500);
      boundDrain();
    };
    const write = dependencies.write || writeSync;
    try {
      child = (dependencies.spawn || spawn)(options.argv[0], options.argv.slice(1), { cwd: root, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      for (const name of ['stdout', 'stderr']) {
        child[name].on('error', e => { recordError(e); terminate(); });
        child[name].on('data', chunk => {
          if (settled || reason) return;
          const allowed = Math.min(chunk.length, options.maxLogBytes - total);
          try {
            let offset = 0;
            while (offset < allowed) {
              const n = write(fds[name], chunk, offset, allowed - offset);
              if (!Number.isSafeInteger(n) || n <= 0 || n > allowed - offset) fail('capture-log-write');
              offset += n; total += n; logs[name].bytes += n;
            }
          } catch (e) { recordError(e); terminate(); return; }
          if (allowed < chunk.length) { recordError('capture-log-limit'); terminate(); }
        });
      }
      child.once('error', e => { command.spawn_error = String(e.code || e.message).slice(0, 512); recordError('capture-spawn-error'); terminate(); });
      child.once('exit', (code, signal) => {
        exited = true; command.exit_code = Number.isSafeInteger(code) && code >= 0 ? code : null;
        command.signal = signal;
        clearTimeout(timer); clearTimeout(killTimer); boundDrain();
      });
      child.once('close', (code, signal) => {
        command.exit_code = Number.isSafeInteger(code) && code >= 0 ? code : null;
        command.signal = signal; finish();
      });
      timer = setTimeout(() => { timedOut = true; recordError('capture-timeout'); terminate(); }, options.timeoutMs);
    } catch (e) { command.spawn_error = String(e.code || e.message).slice(0, 512); recordError('capture-spawn-error'); finish(); }
  });
  for (const [name, fd] of Object.entries(fds)) {
    try { closeSync(fd); } catch (e) { recordError(e); }
    try {
      const data = readHandoffFile(root, `${options.outputDir}/${name}.log`, options.maxLogBytes);
      logs[name].bytes = data.length;
      logs[name].sha256 = createHash('sha256').update(data).digest('hex');
    } catch (e) { recordError(e); }
  }
  let after = null, inputs_unchanged = null, after_error = null;
  try { after = createPacket(root, input); inputs_unchanged = compareCaptureInputs(before, after); }
  catch (e) { after_error = String(e.code || e.message).slice(0, 512); recordError('capture-after-snapshot'); }
  const receipt = { kind: 'waypost-command-capture', version: 1, argv: options.argv, cwd: '.', started_at,
    finished_at: new Date().toISOString(), before, after, after_error, inputs_unchanged, command,
    capture: { complete: reason === null, reason }, logs };
  // Finalize receipt before its packet evidence hash. A failure leaves diagnostics,
  // never a packet that falsely says a writer completed.
  validateCaptureReceipt(receipt);
  const receiptFd = openSync(join(output, 'capture.json'), 'wx', 0o600);
  let packet;
  try {
    writeFileSync(receiptFd, bytes(receipt));
    const outputs = createPacket(root, { ...input, files: [], evidence: captureEvidence(options.outputDir) });
    packet = validatePacket({ ...before, evidence: [...before.evidence, ...outputs.evidence] });
    exclusiveWrite(join(output, 'packet.json'), bytes(packet));
  } catch (e) {
    receipt.capture = { complete: false, reason: 'capture-publication-error' };
    // Use only our still-open inode, never reopen a possibly foreign pathname.
    try {
      const data = Buffer.from(bytes(receipt));
      let offset = 0;
      while (offset < data.length) offset += writeSync(receiptFd, data, offset, data.length - offset, offset);
      ftruncateSync(receiptFd, data.length);
    } catch { /* The storage failure itself can prevent even partial diagnostics. */ }
    throw e;
  } finally { closeSync(receiptFd); }
  const status = timedOut ? 124 : reason ? 1 : command.signal ? 128 + (osConstants.signals[command.signal] || 0) : command.exit_code ?? 1;
  return { status, receipt, packet, output };
}

export async function handleCapture(rest, dependencies = {}) {
  const cwd = process.cwd();
  try {
    const options = parseCaptureArgs(rest);
    const resolveCaptureRoot = (dependencies['projectRoot'] ? dependencies : await import('./core.mjs'))['projectRoot'];
    const root = realpathSync(resolve(resolveCaptureRoot()));
    options.root = root; options.input = resolve(cwd, options.input);
    preflightCapture(options); // Reject malformed/colliding inputs even before admission.
    const runCaptureCommand = (dependencies['handleRun'] ? dependencies : await import('./run.mjs'))['handleRun'];
    process.chdir(root);
    await runCaptureCommand(['--heavy', '--', process.execPath, fileURLToPath(import.meta.url), '--root', root,
      '--input', options.input, '--output-dir', options.outputDir, '--timeout-ms', String(options.timeoutMs),
      '--max-log-bytes', String(options.maxLogBytes), '--', ...options.argv]);
  } catch (e) { process.stderr.write(`waypost handoff capture: ${e.message}\n`); process.exitCode = 1; }
  finally { process.chdir(cwd); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await captureCommand(parseCaptureArgs(process.argv.slice(2), true));
    process.stdout.write(`captured ${result.receipt.capture.complete ? 'complete' : 'incomplete'} command: ${result.receipt.command.exit_code ?? result.receipt.command.signal ?? 'unavailable'} (${result.output})\n`);
    process.exitCode = result.status;
  } catch (e) { process.stderr.write(`waypost handoff capture: ${e.message}\n`); process.exitCode = 1; }
}
