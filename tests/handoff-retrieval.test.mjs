import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createPacket } from '../scripts/handoff.mjs';
import { routingDigest } from '../scripts/model-routing.mjs';
import { prepareHandoffRetrieval, rebuildHandoffRetrieval, readHandoffRequests, prepareRetrievalRound, continueHandoff, RETRIEVAL_LIMITS } from '../scripts/handoff-retrieval.mjs';
import './env.mjs';
const roots = []; after(() => roots.forEach(p => rmSync(p, { recursive: true, force: true })));
function fixture(source = 'one\r\ntwo\nthree') {
  const root = mkdtempSync(join(tmpdir(), 'waypost-retrieval-')); roots.push(root);
  writeFileSync(join(root, 'source'), source);
  writeFileSync(join(root, 'packet.json'), JSON.stringify(createPacket(root, { goal: 'Read selected source', next_step: 'Answer the task', files: ['source', 'absent'] })));
  return prepareHandoffRetrieval(root, 'packet.json', { task: 'Explain the source', challenge: 'a'.repeat(32) });
}
const request = (path = 'source', start_line = 1, end_line = 2) => ({ kind: 'handoff-data-request', requests: [{ path, start_line, end_line }] });
// Transport is a local protocol surrogate, never evidence of native isolation.
function transport(answer = (_payload, round) => round === 0 ? request() : { done: true }) {
  const route = { team: 'team', sender: 'sender', receiver: 'receiver' }, messages = new Map(), snapshots = [], calls = [];
  let active, inference = 0;
  const deps = { route, persist: async state => snapshots.push(structuredClone(state)),
    send: async (payload, key) => {
      calls.push(['send', key]);
      if (!messages.has(key)) {
        const index = messages.size, id = 'message-' + index;
        const text = JSON.stringify({ challenge: payload.challenge, packet_sha256: payload.packet.sha256, answer: answer(payload, index) });
        messages.set(key, { payload: structuredClone(payload), id, text, inferred: false });
      }
      active = messages.get(key);
      assert.deepEqual(active.payload, payload);
      return { id: active.id, sender: 'sender', recipient: 'receiver', epoch: 1 };
    },
    relay: async id => {
      calls.push(['relay', id]); if (!active.inferred) { active.inferred = true; inference++; }
      return { results: [{ message_id: id, forwarded: true, stand_in: true, nonce: 'receipt-' + id, output_digest: routingDigest(active.text) }] };
    },
    poll: async () => { calls.push(['poll', active.id]); return { messages: [{ id: 'reply-' + active.id, kind: 'answer', sender: 'receiver', recipient: 'sender', epoch: 1, reply_to: active.id,
      payload: { stand_in: true, delivery_nonce: 'receipt-' + active.id, text: active.text } }] }; } };
  return { deps, snapshots, calls, messages, inference: () => inference };
}
test('strict packet allowlist and inclusive LF ranges preserve source bytes', () => {
  const base = fixture();
  assert.equal(readHandoffRequests(base, request())[0].text, 'one\r\ntwo\n');
  assert.equal(readHandoffRequests(base, request('source', 3, 3))[0].text, 'three');
  assert.equal(readHandoffRequests(base, { result: 'final' }), null);
  for (const path of ['../source', '/source', 'SOURCE', 'absent', 'packet.json']) assert.throws(() => readHandoffRequests(base, request(path)), /path/);
  for (const [start, end] of [[0, 1], [2, 1], [1.2, 2], [1, 201], [1, 4], [NaN, 2]]) assert.throws(() => readHandoffRequests(base, request('source', start, end)), /range/);
  for (const value of [{ ...request(), extra: true }, { kind: 'handoff-data-request', requests: [] }, { kind: 'handoff-data-request', requests: Array(5).fill(request().requests[0]) }, { kind: 'handoff-data-request', requests: [{ ...request().requests[0], shell: 'anything' }] }]) assert.throws(() => readHandoffRequests(base, value), /request|range/);
});
test('UTF-8, fragment byte ceiling and BOM are checked without truncation', () => {
  assert.throws(() => readHandoffRequests(fixture(Buffer.from([0xff])), request('source', 1, 1)), /utf8/);
  assert.throws(() => readHandoffRequests(fixture('é'.repeat(4097)), request('source', 1, 1)), /fragment-limit/);
  assert.equal(readHandoffRequests(fixture('\ufeffx\n'), request('source', 1, 1))[0].text, '\ufeffx\n');
  assert.equal(Buffer.byteLength(readHandoffRequests(fixture('é'.repeat(4096)), request('source', 1, 1))[0].text), 8192);
});
test('source and prepared context mutations refuse before retrieval', () => {
  const base = fixture(); const changed = structuredClone(base); changed.payload.context += 'mutated';
  assert.throws(() => rebuildHandoffRetrieval(changed), /resume-context/);
  writeFileSync(join(base.root, 'source'), 'replaced');
  assert.throws(() => readHandoffRequests(base, request()), /stale/);
});
test('round identity binds root, packet, previous raw digest, message and data', () => {
  const base = fixture(), fragments = readHandoffRequests(base, request()), prior = { message_id: 'm', output_digest: 'b'.repeat(64) };
  const next = prepareRetrievalRound(base, 1, prior, fragments);
  assert.deepEqual(next, prepareRetrievalRound(base, 1, prior, fragments));
  assert.equal(next.payload.packet.sha256, base.payload.packet.sha256);
  assert.equal(next.payload.continuation.root_challenge, base.payload.challenge);
  assert.notEqual(next.payload.challenge, prepareRetrievalRound(base, 1, { ...prior, output_digest: 'c'.repeat(64) }, fragments).payload.challenge);
  assert.notEqual(next.payload.challenge, prepareRetrievalRound(base, 1, prior, [{ ...fragments[0], text: 'altered' }]).payload.challenge);
  assert.throws(() => prepareRetrievalRound(base, 3, prior, fragments), /round/);
  assert.throws(() => prepareRetrievalRound(base, 1, prior, [{ text: 'x'.repeat(16384) }]), /payload-limit/);
});
test('two rounds replay authoritative answers under the same keys without new inference or payload charges', async () => {
  const base = fixture(), t = transport(), first = await continueHandoff(base, t.deps);
  assert.equal(first.stage, 'answered'); assert.equal(first.rounds.length, 2); assert.equal(t.inference(), 2);
  const n = t.calls.length;
  // Cached answer is deliberately false: resume must re-read authoritative poll.
  first.answer = { forged: true };
  const replay = await continueHandoff(base, { ...t.deps, previous: first });
  assert.deepEqual(replay.answer.answer, { done: true }); assert.equal(t.inference(), 2);
  assert.equal(replay.cumulative_payload_bytes, first.cumulative_payload_bytes);
  assert.deepEqual(t.calls.slice(n).filter(c => c[0] === 'send').map(c => c[1]), first.rounds.map(r => r.request_key));
  assert.equal(replay.cumulative_payload_bytes, [...t.messages.values()].reduce((n, m) => n + Buffer.byteLength(JSON.stringify(m.payload)), 0));
  assert.ok(replay.cumulative_payload_bytes <= RETRIEVAL_LIMITS.cumulative);
  assert.ok(Buffer.byteLength(JSON.stringify(replay, null, 2)) < 65536);
});
test('checkpoint between verified response and next inference resumes the durable identity', async () => {
  const base = fixture(), t = transport(); let interrupted = false;
  await assert.rejects(continueHandoff(base, { ...t.deps, persist: async state => {
    await t.deps.persist(state);
    if (!interrupted && state.rounds.length === 2 && !state.rounds[1].delivery) { interrupted = true; throw new Error('power-loss'); }
  } }), /power-loss/);
  const saved = t.snapshots.at(-1); assert.equal(t.inference(), 1);
  const key = saved.rounds[1].request_key;
  const done = await continueHandoff(base, { ...t.deps, previous: saved });
  assert.equal(done.stage, 'answered'); assert.equal(done.rounds[1].request_key, key); assert.equal(t.inference(), 2);
});
test('unknown consumed round refuses without inventing a fresh question', async () => {
  const base = fixture(), t = transport(), relay = t.deps.relay;
  t.deps.relay = async id => { await relay(id); throw new Error('consumed-uncertain'); };
  await assert.rejects(continueHandoff(base, t.deps), /consumed-uncertain/);
  const first = t.snapshots.at(-1), key = first.rounds[0].request_key;
  await assert.rejects(continueHandoff(base, { ...t.deps, previous: first }), /consumed-uncertain/);
  assert.equal(t.messages.size, 1); assert.equal(t.inference(), 1); assert.ok(t.calls.filter(c => c[0] === 'send').every(c => c[1] === key));
});
test('round ceiling and changed resume identity reject rather than bypass admission', async () => {
  const base = fixture(), t = transport(() => request());
  await assert.rejects(continueHandoff(base, t.deps), /round-limit/); assert.equal(t.messages.size, 3);
  const saved = t.snapshots.at(-1);
  for (const mutate of [s => { s.rounds[0].identity.payload_sha256 = '0'.repeat(64); }, s => { s.rounds[0].request_key += 'x'; }, s => { s.cumulative_payload_bytes++; }]) {
    const bad = structuredClone(saved); mutate(bad);
    await assert.rejects(continueHandoff(base, { ...t.deps, previous: bad }), /resume-/);
  }
  assert.equal(t.inference(), 3);
});
test('authoritative request changes and post-answer source mutation reject', async () => {
  const base = fixture(), t = transport(); const done = await continueHandoff(base, t.deps);
  const first = [...t.messages.values()][0], parsed = JSON.parse(first.text); parsed.answer = request('source', 2, 2); first.text = JSON.stringify(parsed);
  await assert.rejects(continueHandoff(base, { ...t.deps, previous: done }), /resume-request/);
  const fresh = fixture(), u = transport(() => ({ done: true })), poll = u.deps.poll;
  u.deps.poll = async () => { const answer = await poll(); writeFileSync(join(fresh.root, 'source'), 'changed'); return answer; };
  await assert.rejects(continueHandoff(fresh, u.deps), /stale/);
});
test('cached success cannot replace a missing authoritative response', async () => {
  const base = fixture(), t = transport(() => ({ done: true }));
  const done = await continueHandoff(base, t.deps);
  await assert.rejects(continueHandoff(base, { ...t.deps, previous: done, poll: async () => ({ messages: [], cursor: null }) }), /correlated-answer-required/);
  assert.equal(t.inference(), 1); assert.equal(t.messages.size, 1);
});
test('overall deadline remains fixed across rounds and resume', async () => {
  const base = fixture(), t = transport(); let now = 1000;
  const first = await continueHandoff(base, { ...t.deps, wallClock: () => now, timeoutMs: 100, deadlineAt: 1100 });
  assert.ok(first.rounds.every(r => r.delivery.deadline_at === 1100));
  now = 1101;
  const sends = t.calls.filter(c => c[0] === 'send').length;
  await assert.rejects(continueHandoff(base, { ...t.deps, previous: first, wallClock: () => now, timeoutMs: 300000, deadlineAt: now + 300000 }), /deadline/);
  assert.equal(t.calls.filter(c => c[0] === 'send').length, sends);
});

test('fresh later rounds retain earlier verified fragments and replay exactly the same context', async () => {
  const base = fixture('first\nsecond\nthird\n');
  const t = transport((payload, round) => {
    if (round === 0) return request('source', 1, 1);
    if (round === 1) {
      assert.deepEqual(payload.continuation.fragments.map(f => f.text), ['first\n']);
      return request('source', 2, 2);
    }
    assert.deepEqual(payload.continuation.fragments.map(f => f.text), ['first\n', 'second\n']);
    return { combined: 'first second' };
  });
  const done = await continueHandoff(base, t.deps);
  assert.equal(done.rounds.length, 3); assert.equal(t.inference(), 3);
  assert.deepEqual(done.answer.answer, { combined: 'first second' });
  const again = await continueHandoff(base, { ...t.deps, previous: done });
  assert.equal(t.inference(), 3); assert.equal(again.cumulative_payload_bytes, done.cumulative_payload_bytes);
});


test('three Unicode rounds retain exact UTF-8 size and digest identities on replay', async () => {
  const base = fixture('Привет 😀 "quoted"\\\r\n' + 'é'.repeat(1000) + '\nthird\n');
  base.payload.task = 'Прочитать 😀';
  const t = transport((_payload, round) => round < 2 ? request('source', round + 1, round + 1) : { done: true });
  const done = await continueHandoff(base, t.deps);
  assert.equal(done.rounds.length, 3);
  let total = 0;
  const payloads = [...t.messages.values()].map(m => m.payload);
  for (let i = 0; i < payloads.length; i++) {
    const json = JSON.stringify(payloads[i]), size = Buffer.byteLength(json);
    assert.ok(size > json.length, 'Unicode requires UTF-8 byte accounting');
    assert.equal(done.rounds[i].identity.payload_bytes, size);
    assert.equal(done.rounds[i].identity.payload_sha256, createHash('sha256').update(json).digest('hex'));
    assert.equal(done.rounds[i].identity.challenge, payloads[i].challenge);
    total += size;
  }
  assert.equal(done.cumulative_payload_bytes, total);
  const replay = await continueHandoff(base, { ...t.deps, previous: done });
  assert.deepEqual(replay.rounds.map(r => r.identity), done.rounds.map(r => r.identity));
  assert.deepEqual(replay.rounds.map(r => r.request_key), done.rounds.map(r => r.request_key));
  assert.equal(replay.cumulative_payload_bytes, total);
  assert.equal(t.inference(), 3);
});
