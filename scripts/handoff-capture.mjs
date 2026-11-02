// Pure bounds and selected-observation comparisons for command capture.
import { validatePacket, LIMITS } from './handoff.mjs';

export const CAPTURE_LIMITS = Object.freeze({ timeout: 120000, maxTimeout: 300000,
  logs: 4 * 1024 * 1024, receipt: 256 * 1024, argv: 16384, arguments: 128 });
const fail = code => { throw new Error(code); };
export function portableCapturePath(path) {
  if (typeof path !== 'string' || !path || path.length > 1024 || path !== path.normalize('NFC') ||
      path.includes('\\') || /[\x00-\x1f\x7f<>:"|?*]/u.test(path) ||
      path.split('/').some(p => !p || p === '.' || p === '..' || /[ .]$/.test(p) ||
        p.toLowerCase() === '.git' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) fail('capture-path');
  return path;
}
export function parseCaptureArgs(args, worker = false) {
  const split = args.indexOf('--');
  if (split < 0) fail('capture-arguments');
  const head = args.slice(0, split), argv = args.slice(split + 1), options = {};
  const allowed = ['--input', '--output-dir', '--timeout-ms', '--max-log-bytes', ...(worker ? ['--root'] : [])];
  for (let i = 0; i < head.length; i += 2) {
    const key = head[i], value = head[i + 1];
    if (!allowed.includes(key) || Object.hasOwn(options, key) || !value || value.startsWith('--')) fail('capture-arguments');
    options[key] = value;
  }
  if (!options['--input'] || !options['--output-dir'] || (worker && !options['--root'])) fail('capture-arguments');
  if (!argv.length || argv.length > CAPTURE_LIMITS.arguments || !argv[0] ||
      argv.some(a => typeof a !== 'string' || a.includes('\0')) ||
      argv.reduce((n, a) => n + Buffer.byteLength(a) + 1, 0) > CAPTURE_LIMITS.argv) fail('capture-argv');
  if (/\.(cmd|bat)$/i.test(argv[0])) fail('capture-batch-unsupported');
  portableCapturePath(options['--output-dir']);
  const number = (key, fallback, max) => {
    if (!Object.hasOwn(options, key)) return fallback;
    const text = options[key], n = Number(text);
    if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(n) || n > max) fail('capture-limit');
    return n;
  };
  return { input: options['--input'], outputDir: options['--output-dir'], root: options['--root'], argv,
    timeoutMs: number('--timeout-ms', CAPTURE_LIMITS.timeout, CAPTURE_LIMITS.maxTimeout),
    maxLogBytes: number('--max-log-bytes', CAPTURE_LIMITS.logs, CAPTURE_LIMITS.logs) };
}
export function captureEvidence(outputDir) {
  return ['stdout.log', 'stderr.log', 'capture.json'].map(name => ({ path: `${outputDir}/${name}`,
    description: name === 'capture.json' ? 'Selected sequential observations and command status; unverified receipt' : `Raw command ${name}` }));
}
export function reserveCapturePacket(before, outputDir, maxLogBytes) {
  validatePacket(before);
  if (before.evidence.length + 3 > LIMITS.evidence || before.files.length + before.evidence.length + 3 > LIMITS.references) fail('capture-references');
  // Missing inputs may appear after execution: reserve the largest legal metadata.
  const worst = e => ({ ...e, state: 'file', sha256: 'f'.repeat(64), bytes: LIMITS.file });
  const extra = captureEvidence(outputDir).map((e, i) => ({ ...e, state: 'file', sha256: 'f'.repeat(64), bytes: i === 2 ? CAPTURE_LIMITS.receipt : maxLogBytes }));
  const packet = { ...before, git_head: 'f'.repeat(64), files: before.files.map(worst), evidence: [...before.evidence.map(worst), ...extra] };
  // JSON budget is independent of the actual selected bytes budget.
  if (Buffer.byteLength(JSON.stringify(packet, null, 2) + '\n') > LIMITS.json) fail('capture-json-limit');
  const total = [...before.files, ...before.evidence].reduce((n, e) => n + (e.bytes || 0), 0);
  if (total + maxLogBytes + CAPTURE_LIMITS.receipt > LIMITS.total) fail('capture-size-limit');
  // Reuse the v1 collision validator without charging placeholder bytes.
  validatePacket({ ...packet, files: packet.files.map(e => ({ ...e, bytes: 0 })), evidence: packet.evidence.map(e => ({ ...e, bytes: 0 })) });
}
export function compareCaptureInputs(before, after) {
  validatePacket(before); validatePacket(after);
  const a = [...before.files, ...before.evidence], b = [...after.files, ...after.evidence];
  if (!a.length) return null;
  return a.length === b.length && a.every((e, i) => e.path === b[i].path && e.state === b[i].state && e.bytes === b[i].bytes && e.sha256 === b[i].sha256);
}
export function validateCaptureReceipt(receipt) {
  const exact = (value, names) => {
    if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== names.length ||
        names.some(name => !Object.hasOwn(value, name))) fail('capture-receipt-schema');
  };
  exact(receipt, ['kind', 'version', 'argv', 'cwd', 'started_at', 'finished_at', 'before', 'after', 'after_error',
    'inputs_unchanged', 'command', 'capture', 'logs']);
  exact(receipt.command, ['exit_code', 'signal', 'spawn_error']);
  exact(receipt.capture, ['complete', 'reason']);
  exact(receipt.logs, ['stdout', 'stderr']);
  if (!receipt || receipt.kind !== 'waypost-command-capture' || receipt.version !== 1 || receipt.cwd !== '.' ||
      !Array.isArray(receipt.argv) || !receipt.argv.length || receipt.argv.length > CAPTURE_LIMITS.arguments ||
      !receipt.argv[0] ||
      receipt.argv.some(a => typeof a !== 'string' || a.includes('\0')) ||
      receipt.argv.reduce((n, a) => n + Buffer.byteLength(a) + 1, 0) > CAPTURE_LIMITS.argv || !receipt.command || !receipt.capture ||
      typeof receipt.capture.complete !== 'boolean' || ![true, false, null].includes(receipt.inputs_unchanged) ||
      ![receipt.started_at, receipt.finished_at].every(t => typeof t === 'string' && Number.isFinite(Date.parse(t))) ||
      Date.parse(receipt.finished_at) < Date.parse(receipt.started_at) ||
      !(receipt.after_error === null || typeof receipt.after_error === 'string' && receipt.after_error.length <= 512)) fail('capture-receipt-schema');
  validatePacket(receipt.before);
  if (receipt.after !== null) validatePacket(receipt.after);
  if (receipt.inputs_unchanged !== (receipt.after === null ? null : compareCaptureInputs(receipt.before, receipt.after))) fail('capture-receipt-schema');
  const command = receipt.command;
  if (!(command.exit_code === null || Number.isSafeInteger(command.exit_code) && command.exit_code >= 0) ||
      !(command.signal === null || typeof command.signal === 'string' && /^SIG[A-Z0-9]+$/.test(command.signal)) ||
      !(command.spawn_error === null || typeof command.spawn_error === 'string' && command.spawn_error.length <= 512) ||
      !(receipt.capture.reason === null || typeof receipt.capture.reason === 'string' && receipt.capture.reason.length <= 512) ||
      command.exit_code !== null && command.signal !== null ||
      receipt.capture.complete !== (receipt.capture.reason === null) || !receipt.logs) fail('capture-receipt-schema');
  for (const name of ['stdout', 'stderr']) {
    const log = receipt.logs[name];
    exact(log, ['path', 'bytes', 'sha256']);
    if (!log || !Number.isSafeInteger(log.bytes) || log.bytes < 0 || log.bytes > CAPTURE_LIMITS.logs ||
        !(log.sha256 === null || typeof log.sha256 === 'string' && /^[a-f0-9]{64}$/.test(log.sha256))) fail('capture-receipt-schema');
    portableCapturePath(log.path);
    if (receipt.capture.complete && log.sha256 === null) fail('capture-receipt-schema');
  }
  if (receipt.logs.stdout.bytes + receipt.logs.stderr.bytes > CAPTURE_LIMITS.logs) fail('capture-receipt-schema');
  if (receipt.capture.complete && (receipt.after === null || command.spawn_error !== null ||
      receipt.after_error !== null || command.exit_code === null && command.signal === null)) fail('capture-receipt-schema');
  if (Buffer.byteLength(JSON.stringify(receipt, null, 2) + '\n') > CAPTURE_LIMITS.receipt) fail('capture-receipt-limit');
  return receipt;
}
