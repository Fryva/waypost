// One-shot orchestration over existing team commands. No new authority or grants.
import { writeFileSync, openSync, closeSync, mkdtempSync, rmSync, realpathSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runHandoffCommand } from './handoff-process.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { projectRoot, ROOT } from './core.mjs';
import { readHandoffJson, readHandoffFile } from '../../scripts/handoff.mjs';
import { prepareHandoffDelivery, deliverHandoff, assertDeliveryDestination, DELIVERY_DEFAULT_TIMEOUT_MS, DELIVERY_MAX_TIMEOUT_MS } from '../../scripts/handoff-delivery.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
export function writeDeliveryState(path, state, expected) {
  const read = () => readHandoffFile(dirname(path), basename(path), 65536);
  // Compact, like every limit it is bounded by; indentation multiplies nested answers. Readers accept older pretty files.
  const text = JSON.stringify(state) + '\n';
  if (Buffer.byteLength(text) > 65536) throw new Error('handoff-delivery-state-limit');
  if (sha(read()) !== expected) throw new Error('handoff-delivery-state-changed');
  const temp = path + '.' + randomUUID() + '.tmp';
  const fd = openSync(temp, 'wx', 0o600);
  let renamed = false;
  try {
    try { writeFileSync(fd, text); } finally { closeSync(fd); }
    if (sha(read()) !== expected) throw new Error('handoff-delivery-state-changed');
    renameSync(temp, path); renamed = true;
    return sha(text);
  } finally { if (!renamed) unlinkSync(temp); }
}
function routeConfig(value) {
  const keys = ['team', 'sender', 'receiver', 'sender_credential', 'receiver_credential', 'owner_credential', 'collector_credential', 'endpoint'];
  if (!value || Object.keys(value).sort().join() !== keys.sort().join() || keys.some(k => typeof value[k] !== 'string' || !value[k] || value[k].length > 4096 || /[\x00-\x1f\x7f]/.test(value[k]))) throw new Error('handoff-delivery-route');
  for (const name of ['sender_credential', 'receiver_credential', 'owner_credential', 'collector_credential', 'endpoint']) value[name] = resolve(value[name]);
  return value;
}
export async function handleDelivery(rest) {
  const preparationStarted = performance.now(), executionStarted = Date.now();
  let scratch;
  try {
    const options = {};
    for (let i = 0; i < rest.length; i += 2) {
      const [key, value] = rest.slice(i, i + 2);
      if (!['--packet', '--task', '--config', '--state', '--resume', '--timeout-ms'].includes(key) || Object.hasOwn(options, key) || !value || value.startsWith('--')) throw new Error('handoff-delivery-arguments');
      options[key] = value;
    }
    const resuming = Object.hasOwn(options, '--resume');
    if (!options['--config'] || (resuming ? Object.keys(options).length !== 2 : !options['--packet'] || !options['--task'] || !options['--state'] || Object.keys(options).length !== (options['--timeout-ms'] ? 5 : 4))) throw new Error('usage: handoff deliver --packet <relative-json> --task <json> --config <route-json> --state <new-json> [--timeout-ms <1..300000>]; or --config <route-json> --resume <state-json>');
    const timeoutMs = options['--timeout-ms'] === undefined ? DELIVERY_DEFAULT_TIMEOUT_MS : Number(options['--timeout-ms']);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > DELIVERY_MAX_TIMEOUT_MS) throw new Error('handoff-delivery-timeout');
    const route = routeConfig(readHandoffJson(resolve(options['--config']))), selectedState = resolve(options[resuming ? '--resume' : '--state']);
    const statePath = join(realpathSync(dirname(selectedState)), basename(selectedState));
    let previous = null, prepared, expected;
    const readState = () => readHandoffFile(dirname(statePath), basename(statePath), 65536);
    if (resuming) {
      const bytes = readState();
      previous = JSON.parse(bytes); prepared = previous.prepared; expected = sha(bytes);
      if (!prepared || prepared.root !== realpathSync(resolve(projectRoot()))) throw new Error('handoff-delivery-resume-root');
      const rebuilt = prepareHandoffDelivery(projectRoot(), prepared.packetPath, { task: prepared.payload?.task,
        include: prepared.payload?.documents?.map(e => e.path), challenge: prepared.payload?.challenge });
      if (JSON.stringify(rebuilt) !== JSON.stringify(prepared)) throw new Error('handoff-delivery-resume-context');
      assertDeliveryDestination(prepared, statePath);
    } else {
      const task = readHandoffJson(resolve(options['--task']));
      if (!task || Object.keys(task).some(k => !['task', 'include'].includes(k))) throw new Error('handoff-delivery-task');
      prepared = prepareHandoffDelivery(projectRoot(), options['--packet'], task);
      assertDeliveryDestination(prepared, statePath);
      const fd = openSync(statePath, 'wx', 0o600); closeSync(fd);
      expected = sha('');
    }
    const entry = join(ROOT, 'bin', 'waypost.mjs');
    const command = (args, context) => runHandoffCommand(process.execPath, [entry, '--project', prepared.root, 'team', ...args], {
      ...context, env: { ...process.env, WAYPOST_NO_BEAT: '1' } });
    const persist = state => {
      expected = writeDeliveryState(statePath, state, expected);
    };
    // Request file is deterministic and local; it contains payload, never credentials.
    scratch = mkdtempSync(join(tmpdir(), 'waypost-handoff-request-'));
    const request = join(scratch, 'request.json');
    const fd = openSync(request, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify({ payload: prepared.payload }) + '\n'); } finally { closeSync(fd); }
    const state = await deliverHandoff(prepared, { route, previous, persist, prepareMs: performance.now() - preparationStarted, timeoutMs, deadlineAt: executionStarted + timeoutMs,
      send: async (_payload, key, context) => (await command(['send', route.team, '--credential', route.sender_credential, '--to', route.receiver, '--kind', 'question', '--request-key', key, '--request-file', request], context)).result,
      relay: (id, context) => command(['host', route.team, '--operation', 'relay', '--participant', route.receiver, '--credential', route.receiver_credential,
        '--owner-credential', route.owner_credential, '--collector-credential', route.collector_credential, '--endpoint-file', route.endpoint, '--limit', '1', '--message-id', id], context),
      poll: (cursor, context) => command(['poll', route.team, '--credential', route.sender_credential, ...(cursor ? ['--cursor', cursor] : [])], context) });
    process.stdout.write(JSON.stringify({ stage: state.stage, message_id: state.message_id, challenge: state.challenge, answer: state.answer, timings: state.timings, deadline_at: state.deadline_at, state: statePath }, null, 2) + '\n');
  } catch (e) {
    process.stderr.write(`waypost handoff deliver: ${e.message}${e.delivery_state ? ` (stage ${e.delivery_state.stage}, message ${e.delivery_state.message_id || 'not-sent'})` : ''}\n`);
    process.exitCode = 1;
  } finally {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  }
}
