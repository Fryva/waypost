import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { writeDeliveryState } from '../bin/cli/handoff-delivery.mjs';
import { routingDigest } from '../scripts/model-routing.mjs';
import { createPacket } from '../scripts/handoff.mjs';
import { prepareHandoffDelivery, assertDeliveryFresh, assertDeliveryDestination, validateHandoffAnswer, deliverHandoff } from '../scripts/handoff-delivery.mjs';
import './env.mjs';
const roots = []; after(() => roots.forEach(p => rmSync(p, { recursive: true, force: true })));
const sha = value => createHash('sha256').update(value).digest('hex');
function fixture(data = 'source bytes') {
  const root = mkdtempSync(join(tmpdir(), 'waypost-delivery-')); roots.push(root);
  writeFileSync(join(root, 'source'), data);
  const packet = createPacket(root, { goal: 'Continue the task', next_step: 'Inspect the evidence', files: ['source'] });
  writeFileSync(join(root, 'packet.json'), JSON.stringify(packet));
  const prepare = options => prepareHandoffDelivery(root, 'packet.json', { task: 'Return the source status', include: ['source'], ...options });
  return { root, packet, prepare };
}
function transport(prepared, options = {}) {
  const route = { team: 'team', sender: 'sender', receiver: 'receiver' }, writes = [], calls = [];
  const message = { id: 'question', sender: route.sender, recipient: route.receiver, epoch: 0 };
  const reply = () => ({ id: 'reply', kind: 'answer', sender: 'receiver', recipient: 'sender', epoch: 0, reply_to: 'question',
    payload: { stand_in: true, delivery_nonce: 'native-receipt', text: JSON.stringify({ challenge: prepared.payload.challenge, packet_sha256: prepared.payload.packet.sha256, answer: { result: 'ok' } }) } });
  const deps = { route, persist: async s => writes.push(structuredClone(s)),
    send: async (_p, key) => { calls.push(['send', key]); return message; },
    relay: async id => { calls.push(['relay', id]); return { delivered: 1, results: [{ message_id: id, forwarded: true, stand_in: true, nonce: 'native-receipt', output_digest: routingDigest(reply().payload.text) }] }; },
    poll: async () => { calls.push(['poll']); return { messages: [reply()] }; }, ...options };
  return { deps, writes, calls, reply };
}

test('hydrates only explicit packet references, verifies bytes and treats binary as unsupported', () => {
  const f = fixture(), prepared = f.prepare();
  assert.equal(prepared.payload.documents[0].text, 'source bytes');
  assert.equal(prepared.payload.documents[0].sha256, f.packet.files[0].sha256);
  assert.match(prepared.payload.context, /unverified/); assert.equal(assertDeliveryFresh(prepared), true);
  assert.throws(() => f.prepare({ include: ['not-listed'] }), /document/);
  assert.throws(() => f.prepare({ include: ['source', 'source'] }), /options/);
  assert.throws(() => f.prepare({ task: 'x'.repeat(4097) }), /text/);
  const b = fixture(Buffer.from([255])); assert.throws(() => b.prepare(), /utf8/);
});
test('stale inputs, changed packet bytes, unchecked and oversized hydration reject before send', () => {
  const f = fixture(), prepared = f.prepare(); writeFileSync(join(f.root, 'source'), 'changed');
  assert.throws(() => f.prepare(), /stale/); assert.throws(() => assertDeliveryFresh(prepared), /stale/);
  const g = fixture(), p = g.prepare(); writeFileSync(join(g.root, 'packet.json'), JSON.stringify(g.packet, null, 2));
  assert.throws(() => assertDeliveryFresh(p), /stale/);
  const h = fixture('x'.repeat(8193)); assert.throws(() => h.prepare(), /document/);
  const empty = createPacket(g.root, { goal: 'State only', next_step: 'Continue' });
  writeFileSync(join(g.root, 'packet.json'), JSON.stringify(empty)); assert.throws(() => g.prepare({ include: [] }), /stale/);
});
test('answer JSON binds challenge and exact packet digest without trusting its task answer', () => {
  const p = fixture().prepare(), valid = { challenge: p.payload.challenge, packet_sha256: p.payload.packet.sha256, answer: null };
  assert.deepEqual(validateHandoffAnswer(JSON.stringify(valid), p), valid);
  for (const value of ['```json\n{}\n```', JSON.stringify({ ...valid, challenge: 'wrong' }), JSON.stringify({ ...valid, packet_sha256: 'f'.repeat(64) }), JSON.stringify({ ...valid, extra: true })]) assert.throws(() => validateHandoffAnswer(value, p), /answer/);
});
test('one-shot delivery targets its own question and requires correlated managed answer', async () => {
  const p = fixture().prepare(), t = transport(p), state = await deliverHandoff(p, t.deps);
  assert.equal(state.stage, 'answered'); assert.equal(state.message_id, 'question'); assert.equal(t.calls[1][1], 'question');
  assert.equal(t.writes[0].stage, 'prepared'); assert.equal(t.writes[1].stage, 'sent');
  assert.deepEqual(state.answer.answer, { result: 'ok' });
});
test('interruption retains request key and question ID; resume recovers the same send', async () => {
  const p = fixture().prepare(), t = transport(p, { relay: async () => { throw new Error('interrupted'); } });
  await assert.rejects(deliverHandoff(p, t.deps), /interrupted/);
  const previous = t.writes.at(-1); assert.equal(previous.stage, 'sent'); assert.equal(previous.message_id, 'question');
  const next = transport(p); const done = await deliverHandoff(p, { ...next.deps, previous });
  assert.equal(done.stage, 'answered'); assert.equal(next.calls[0][1], previous.request_key);
  await assert.rejects(deliverHandoff(p, { ...next.deps, previous: { ...previous, request_key: 'other' } }), /resume-binding/);
});
test('wrong correlation, ordinary non-stand-in answers and wrong challenge cannot succeed', async () => {
  for (const patch of [{ reply_to: 'other' }, { sender: 'other' }, { epoch: 1 }, { payload: { stand_in: false, text: '{}' } }, { payload: { stand_in: true, text: '{}' } }]) {
    const p = fixture().prepare(), t = transport(p); t.deps.poll = async () => ({ messages: [{ ...t.reply(), ...patch }] });
    await assert.rejects(deliverHandoff(p, t.deps), /answer|managed-receipt/);
    assert.notEqual(t.writes.at(-1).stage, 'answered');
  }
});
test('changed source after reply is retained as stale-result, not reusable success', async () => {
  const f = fixture(), p = f.prepare(), t = transport(p);
  t.deps.poll = async () => { writeFileSync(join(f.root, 'source'), 'changed'); return { messages: [t.reply()] }; };
  await assert.rejects(deliverHandoff(p, t.deps), /stale/);
  assert.equal(t.writes.at(-1).error, 'handoff-delivery-stale');
});
test('oversized combined inline payload is rejected without silently truncating', () => {
  const f = fixture('x'.repeat(8192));
  const input = { goal: 'x'.repeat(2048), next_step: 'y'.repeat(2048), progress: Array(12).fill('p'.repeat(512)), files: ['source'] };
  writeFileSync(join(f.root, 'packet.json'), JSON.stringify(createPacket(f.root, input)));
  assert.throws(() => f.prepare({ task: 't'.repeat(4096) }), /payload-limit/);
});
test('delivery state retains private mode, bounds and concurrent content checks', () => {
  const f = fixture(), path = join(f.root, 'state.json'); writeFileSync(path, '', { mode: 0o600 });
  const digest = writeDeliveryState(path, { stage: 'prepared' }, sha(''));
  assert.equal(digest, sha(readFileSync(path)));
  if (process.platform !== 'win32') assert.equal(statSync(path).mode & 0o777, 0o600);
  writeFileSync(path, 'foreign');
  assert.throws(() => writeDeliveryState(path, { stage: 'sent' }, digest), /state-changed/);
  assert.equal(readFileSync(path, 'utf8'), 'foreign');
  assert.throws(() => writeDeliveryState(path, { text: 'x'.repeat(65537) }, sha('foreign')), /state-limit/);
  assert.equal(readdirSync(f.root).some(name => name.endsWith('.tmp')), false);
});
test('state output cannot change selected absences or overlap the packet', () => {
  const f = fixture();
  f.packet.files.push({ path: 'future/child', state: 'missing' });
  writeFileSync(join(f.root, 'packet.json'), JSON.stringify(f.packet));
  const p = f.prepare();
  for (const name of ['source', 'SOURCE', 'packet.json', 'future']) assert.throws(() => assertDeliveryDestination(p, join(p.root, name)), /collision/);
  assert.doesNotThrow(() => assertDeliveryDestination(p, join(p.root, 'future-other.json')));
});
test('a peer-supplied stand-in flag alone does not prove a managed native receipt', async () => {
  const p = fixture().prepare(), t = transport(p, { relay: async () => ({ delivered: 0, results: [] }) });
  await assert.rejects(deliverHandoff(p, t.deps), /managed-receipt-required/);
  assert.notEqual(t.writes.at(-1).stage, 'answered');
});
test('cursor paging reaches a reply beyond 100 messages and resume rereads its page', async () => {
  const p = fixture().prepare(), t = transport(p), seen = [];
  const history = Array.from({ length: 205 }, (_, i) => ({ id: 'unrelated-' + i, kind: 'question' }));
  history.push(t.reply());
  t.deps.poll = async cursor => {
    const start = cursor === null ? 0 : Number(cursor); seen.push(start);
    const end = Math.min(start + 100, history.length);
    return { messages: history.slice(start, end), cursor: String(end) };
  };
  const state = await deliverHandoff(p, t.deps);
  assert.deepEqual(seen, [0, 100, 200]); assert.equal(state.poll_cursor, '200');
  seen.length = 0; await deliverHandoff(p, { ...t.deps, previous: state });
  assert.deepEqual(seen, [200]);
});
test('bounded pagination persists progress without asking for a second native question', async () => {
  const p = fixture().prepare(), t = transport(p);
  t.deps.poll = async cursor => ({ messages: [], cursor: String(Number(cursor ?? 0) + 100) });
  await assert.rejects(deliverHandoff(p, t.deps), /poll-limit/);
  const state = t.writes.at(-1); assert.equal(state.poll_cursor, '1600');
  assert.equal(state.message_id, 'question'); assert.equal(t.calls.filter(c => c[0] === 'send').length, 1);
});

test('monotonic attempt timing measures each operation, including a failed relay and resume', async () => {
  const p = fixture().prepare(), t = transport(p); let now = 0;
  const wrap = (name, ms) => { const operation = t.deps[name]; t.deps[name] = async (...args) => { now += ms; return operation(...args); }; };
  wrap('send', 3); wrap('relay', 7); wrap('poll', 2);
  const first = await deliverHandoff(p, { ...t.deps, prepareMs: 5, clock: () => now });
  assert.deepEqual(first.timings, { protocol: 1, scope: 'current-attempt', prepare_ms: 5, send_ms: 3, relay_ms: 7, poll_ms: 2, orchestration_ms: 12, total_ms: 17 });
  assert.deepEqual(t.writes.at(-1).timings, first.timings);
  const broken = transport(p, { relay: async () => { now += 11; throw Error('relay-stopped'); } });
  await assert.rejects(deliverHandoff(p, { ...broken.deps, prepareMs: 4, clock: () => now }), /relay-stopped/);
  const previous = broken.writes.at(-1);
  assert.equal(previous.timings.relay_ms, 11); assert.equal(previous.timings.poll_ms, null); assert.equal(previous.timings.total_ms, 15);
  const next = transport(p), resumed = await deliverHandoff(p, { ...next.deps, previous, clock: () => now });
  assert.equal(resumed.request_key, previous.request_key);
  assert.equal(resumed.timings.scope, 'current-attempt'); assert.equal(resumed.timings.relay_ms, 0);
  assert.equal(resumed.timings.prepare_ms, null); assert.equal(resumed.timings.total_ms, null);
  assert.equal(resumed.timings.orchestration_ms, 0);
});
test('poll timing aggregates pages without inventing a preparation duration', async () => {
  const p = fixture().prepare(), t = transport(p); let now = 0, pages = 0;
  t.deps.poll = async () => { now += 4; return ++pages === 1 ? { messages: [], cursor: 'next' } : { messages: [t.reply()] }; };
  const state = await deliverHandoff(p, { ...t.deps, clock: () => now });
  assert.equal(state.timings.poll_ms, 8); assert.equal(state.timings.orchestration_ms, 8);
  assert.equal(state.timings.prepare_ms, null); assert.equal(state.timings.total_ms, null);
  await assert.rejects(deliverHandoff(p, { ...t.deps, prepareMs: -1 }), /prepare-time/);
});

test('overall deadline persists across resume and expires without another send', async () => {
  const p = fixture().prepare(), t = transport(p); let now = 1000;
  t.deps.relay = async () => { now += 21; throw Error('interrupted'); };
  await assert.rejects(deliverHandoff(p, { ...t.deps, timeoutMs: 20, wallClock: () => now }), /interrupted/);
  const previous = t.writes.at(-1), next = transport(p);
  assert.equal(previous.deadline_at, 1020);
  await assert.rejects(deliverHandoff(p, { ...next.deps, previous, timeoutMs: 300000, wallClock: () => now }), /deadline/);
  assert.equal(next.calls.length, 0); assert.equal(next.writes.at(-1).deadline_at, 1020);
});
test('callback boundaries share remaining deadline and preserve last acknowledged stage on overrun', async () => {
  const p = fixture().prepare(), t = transport(p); let now = 1000, mono = 0;
  t.deps.relay = async (_id, context) => {
    assert.deepEqual(context, { deadlineAt: 1010, remainingMs: 10 });
    now = 1011; mono = 11; return { results: [] };
  };
  await assert.rejects(deliverHandoff(p, { ...t.deps, timeoutMs: 10, wallClock: () => now, clock: () => mono }), /deadline/);
  const state = t.writes.at(-1);
  assert.equal(state.stage, 'sent'); assert.equal(state.timings.relay_ms, 11);
  assert.equal(state.error, 'handoff-delivery-deadline');
});
test('legacy state receives one deadline without rebinding its question; timeout inputs are bounded', async () => {
  const p = fixture().prepare(), t = transport(p), initial = await deliverHandoff(p, t.deps);
  delete initial.deadline_at;
  const next = transport(p), state = await deliverHandoff(p, { ...next.deps, previous: initial, wallClock: () => 1000, timeoutMs: 100 });
  assert.equal(state.deadline_at, 1100); assert.equal(state.request_key, initial.request_key);
  for (const timeoutMs of [0, -1, 300001, 1.5, NaN]) await assert.rejects(deliverHandoff(p, { ...t.deps, timeoutMs }), /timeout/);
});

test('after the deadline a relayed question is recovered without relaying again; deadline_at stays', async () => {
  const p = fixture().prepare(), t = transport(p); let now = 1000;
  t.deps.poll = async () => { throw Error('interrupted'); };
  await assert.rejects(deliverHandoff(p, { ...t.deps, timeoutMs: 20, wallClock: () => now }), /interrupted/);
  const previous = t.writes.at(-1); assert.equal(previous.stage, 'relayed'); assert.equal(previous.deadline_at, 1020);
  now = 5000; const next = transport(p), state = await deliverHandoff(p, { ...next.deps, previous, wallClock: () => now });
  assert.equal(state.stage, 'answered'); assert.equal(state.deadline_at, 1020); assert.equal(state.timings.recovery, true);
  assert.deepEqual(next.calls.map(c => c[0]), ['send', 'poll']);
  assert.equal(next.writes.every(w => w.stage !== 'sent'), true);
  await assert.rejects(deliverHandoff(p, { ...transport(p).deps, previous: state, wallClock: () => now }), /deadline/);
});
test('recovery needs a relayed question and expires after its own window', async () => {
  const p = fixture().prepare(), t = transport(p); let now = 1000;
  t.deps.relay = async () => { throw Error('interrupted'); };
  await assert.rejects(deliverHandoff(p, { ...t.deps, timeoutMs: 20, wallClock: () => now }), /interrupted/);
  now = 5000; const sent = transport(p);
  await assert.rejects(deliverHandoff(p, { ...sent.deps, previous: t.writes.at(-1), wallClock: () => now }), /deadline/);
  assert.equal(sent.calls.length, 0);
  const u = transport(p); u.deps.poll = async () => { throw Error('interrupted'); };
  await assert.rejects(deliverHandoff(p, { ...u.deps, timeoutMs: 20, wallClock: () => 1000 }), /interrupted/);
  const previous = u.writes.at(-1), slow = transport(p); now = 5000;
  slow.deps.poll = async () => { now += 60001; return { messages: [] }; };
  await assert.rejects(deliverHandoff(p, { ...slow.deps, previous, wallClock: () => now }), /deadline/);
  assert.equal(slow.calls.some(c => c[0] === 'relay'), false); assert.equal(slow.writes.at(-1).deadline_at, 1020);
});

test('an interrupted resume before the deadline does not downgrade a relayed stage', async () => {
  const p = fixture().prepare(), t = transport(p); let now = 1000;
  t.deps.poll = async () => { throw Error('interrupted'); };
  await assert.rejects(deliverHandoff(p, { ...t.deps, timeoutMs: 1000, wallClock: () => now }), /interrupted/);
  const previous = t.writes.at(-1), next = transport(p);
  next.deps.relay = async () => { throw Error('stopped-again'); };
  await assert.rejects(deliverHandoff(p, { ...next.deps, previous, wallClock: () => now }), /stopped-again/);
  const again = next.writes.at(-1); assert.equal(again.stage, 'relayed'); assert.ok(again.relay);
  now = 5000; const last = transport(p), state = await deliverHandoff(p, { ...last.deps, previous: again, wallClock: () => now });
  assert.equal(state.stage, 'answered'); assert.equal(last.calls.some(c => c[0] === 'relay'), false);
});

test('one-shot state with a nested answer within the answer limit persists and resumes from the file', async () => {
  const f = fixture('y'.repeat(8192)), prepared = f.prepare(), path = join(f.root, 'state.json');
  writeFileSync(path, '', { mode: 0o600 }); let expected = sha('');
  const answer = Array(1023).fill([[[1]]]);
  assert.ok(Buffer.byteLength(JSON.stringify(answer)) <= 8192);
  const text = JSON.stringify({ challenge: prepared.payload.challenge, packet_sha256: prepared.payload.packet.sha256, answer });
  const t = transport(prepared, { persist: async s => { expected = writeDeliveryState(path, s, expected); },
    relay: async id => ({ delivered: 1, results: [{ message_id: id, forwarded: true, stand_in: true, nonce: 'native-receipt', output_digest: routingDigest(text) }] }),
    poll: async () => ({ messages: [{ id: 'reply', kind: 'answer', sender: 'receiver', recipient: 'sender', epoch: 0, reply_to: 'question', payload: { stand_in: true, delivery_nonce: 'native-receipt', text } }] }) });
  const state = await deliverHandoff(prepared, t.deps);
  assert.equal(state.stage, 'answered');
  assert.ok(Buffer.byteLength(JSON.stringify(state, null, 2)) > 65536);
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  assert.deepEqual(saved.answer.answer, answer);
  const replay = await deliverHandoff(prepared, { ...t.deps, previous: saved });
  assert.equal(replay.stage, 'answered'); assert.ok(statSync(path).size <= 65536);
});
