// Opt-in bounded rounds over the existing authenticated team commands.
import { openSync, closeSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { projectRoot, ROOT } from './core.mjs';
import { readHandoffJson, readHandoffFile } from '../../scripts/handoff.mjs';
import { assertDeliveryDestination, DELIVERY_DEFAULT_TIMEOUT_MS, DELIVERY_MAX_TIMEOUT_MS } from '../../scripts/handoff-delivery.mjs';
import { prepareHandoffRetrieval, rebuildHandoffRetrieval, continueHandoff } from '../../scripts/handoff-retrieval.mjs';
import { writeDeliveryState } from './handoff-delivery.mjs';
import { runHandoffCommand } from './handoff-process.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
function routeConfig(value) {
  const keys = ['team', 'sender', 'receiver', 'sender_credential', 'receiver_credential', 'owner_credential', 'collector_credential', 'endpoint'];
  if (!value || Object.keys(value).sort().join() !== keys.sort().join() || keys.some(k => typeof value[k] !== 'string' || !value[k] || value[k].length > 4096 || /[\x00-\x1f\x7f]/.test(value[k]))) throw new Error('handoff-delivery-route');
  for (const name of ['sender_credential', 'receiver_credential', 'owner_credential', 'collector_credential', 'endpoint']) value[name] = resolve(value[name]);
  return value;
}
export async function handleRetrieval(rest) {
  const started = performance.now(), wallStarted = Date.now();
  let scratch;
  try {
    const options = {};
    for (let i = 0; i < rest.length; i += 2) {
      const [key, value] = rest.slice(i, i + 2);
      if (!['--packet', '--task', '--config', '--state', '--resume', '--timeout-ms'].includes(key) || Object.hasOwn(options, key) || !value || value.startsWith('--')) throw new Error('handoff-retrieval-arguments');
      options[key] = value;
    }
    const resuming = Object.hasOwn(options, '--resume');
    if (!options['--config'] || (resuming ? Object.keys(options).length !== 2 : !options['--packet'] || !options['--task'] || !options['--state'] || Object.keys(options).length !== (options['--timeout-ms'] ? 5 : 4))) throw new Error('usage: handoff continue --packet <relative-json> --task <json> --config <route-json> --state <new-json> [--timeout-ms <1..300000>]; or --config <route-json> --resume <state-json>');
    const timeoutMs = options['--timeout-ms'] === undefined ? DELIVERY_DEFAULT_TIMEOUT_MS : Number(options['--timeout-ms']);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > DELIVERY_MAX_TIMEOUT_MS) throw new Error('handoff-retrieval-timeout');
    const route = routeConfig(readHandoffJson(resolve(options['--config'])));
    const selected = resolve(options[resuming ? '--resume' : '--state']);
    const statePath = join(realpathSync(dirname(selected)), basename(selected));
    let prepared, previous = null, expected;
    if (resuming) {
      const data = readHandoffFile(dirname(statePath), basename(statePath), 65536);
      previous = JSON.parse(data); expected = sha(data); prepared = previous.prepared;
      if (prepared?.root !== realpathSync(resolve(projectRoot()))) throw new Error('handoff-retrieval-resume-root');
      prepared = rebuildHandoffRetrieval(prepared);
    } else {
      const task = readHandoffJson(resolve(options['--task']));
      if (!task || Object.keys(task).some(k => !['task', 'include', 'outline'].includes(k)) ||
          (Object.hasOwn(task, 'outline') && typeof task.outline !== 'boolean')) throw new Error('handoff-retrieval-task');
      prepared = prepareHandoffRetrieval(projectRoot(), options['--packet'], task);
    }
    assertDeliveryDestination(prepared, statePath);
    if (!resuming) { const fd = openSync(statePath, 'wx', 0o600); closeSync(fd); expected = sha(''); }
    scratch = mkdtempSync(join(tmpdir(), 'waypost-handoff-retrieval-'));
    const request = join(scratch, 'request.json');
    const entry = join(ROOT, 'bin', 'waypost.mjs');
    const command = (args, context) => runHandoffCommand(process.execPath, [entry, '--project', prepared.root, 'team', ...args], {
      ...context, env: { ...process.env, WAYPOST_NO_BEAT: '1' } });
    const state = await continueHandoff(prepared, { route, previous, timeoutMs, deadlineAt: wallStarted + timeoutMs,
      prepareMs: performance.now() - started,
      persist: value => { expected = writeDeliveryState(statePath, value, expected); },
      send: async (payload, key, context) => {
        const fd = openSync(request, 'w', 0o600);
        try { writeFileSync(fd, JSON.stringify({ payload }) + '\n'); } finally { closeSync(fd); }
        return (await command(['send', route.team, '--credential', route.sender_credential, '--to', route.receiver, '--kind', 'question', '--request-key', key, '--request-file', request], context)).result;
      },
      relay: (id, context) => command(['host', route.team, '--operation', 'relay', '--participant', route.receiver, '--credential', route.receiver_credential,
        '--owner-credential', route.owner_credential, '--collector-credential', route.collector_credential, '--endpoint-file', route.endpoint, '--limit', '1', '--message-id', id], context),
      poll: (cursor, context) => command(['poll', route.team, '--credential', route.sender_credential, ...(cursor ? ['--cursor', cursor] : [])], context) });
    process.stdout.write(JSON.stringify({ stage: state.stage, answer: state.answer, rounds: state.rounds.length,
      cumulative_payload_bytes: state.cumulative_payload_bytes, deadline_at: state.deadline_at, state: statePath }, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`waypost handoff continue: ${error.message}\n`); process.exitCode = 1;
  } finally { if (scratch) rmSync(scratch, { recursive: true, force: true }); }
}
