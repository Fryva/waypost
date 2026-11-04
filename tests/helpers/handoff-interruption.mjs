// Deterministic transport surrogate, not a native provider/accounting integration.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { prepareHandoffDelivery, deliverHandoff } from '../../scripts/handoff-delivery.mjs';
import { routingDigest } from '../../scripts/model-routing.mjs';

const [root, boundary, mode] = process.argv.slice(2);
const read = name => JSON.parse(readFileSync(join(root, name), 'utf8'));
const write = (name, value) => { writeFileSync(join(root, name + '.tmp'), JSON.stringify(value)); renameSync(join(root, name + '.tmp'), join(root, name)); };
const pause = async stage => {
  if (stage !== boundary) return;
  process.send({ boundary: stage });
  setInterval(() => {}, 1000);
  await new Promise(() => {});
};
const previous = mode === 'resume' ? read('delivery.json') : null;
const prepared = previous?.prepared ?? prepareHandoffDelivery(root, 'packet.json', { task: 'Continue' });
const route = { team: 'surrogate', sender: 'sender', receiver: 'receiver' };
const question = { id: 'stable-question', sender: 'sender', recipient: 'receiver', epoch: 0 };
try {
  const state = await deliverHandoff(prepared, { route, previous,
    persist: async state => { write('delivery.json', state); await pause(state.stage); },
    send: async (_payload, key) => {
      const t = read('transport.json');
      if (t.key && t.key !== key) throw Error('surrogate-key-changed');
      if (!t.key) { t.key = key; t.questions++; write('transport.json', t); }
      return question;
    },
    relay: async () => {
      const t = read('transport.json');
      if (t.phase === 'consumed') throw Error('surrogate-consumed-unknown');
      if (!t.phase) {
        t.phase = 'consumed'; t.inferences++; t.reserved = 100; write('transport.json', t);
        await pause('consumed');
        t.text = JSON.stringify({ challenge: prepared.payload.challenge, packet_sha256: prepared.payload.packet.sha256, answer: 'surrogate-answer' });
        t.phase = 'received'; write('transport.json', t); await pause('received');
      }
      t.phase = 'forwarded'; t.reserved = 0; write('transport.json', t);
      return { results: [{ message_id: question.id, forwarded: true, stand_in: true, nonce: 'surrogate-proof', output_digest: routingDigest(t.text) }] };
    },
    poll: async () => ({ messages: [{ id: 'answer', kind: 'answer', sender: 'receiver', recipient: 'sender', epoch: 0, reply_to: question.id,
      payload: { stand_in: true, delivery_nonce: 'surrogate-proof', text: read('transport.json').text } }] }) });
  process.send({ done: true, stage: state.stage });
} catch (error) { process.send({ error: error.message }); process.exitCode = 1; }
process.disconnect();
