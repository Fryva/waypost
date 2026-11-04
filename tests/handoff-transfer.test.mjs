import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync, mkdirSync, realpathSync, lstatSync, symlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPacket, inspectPacket } from '../scripts/handoff.mjs';
import { buildTransfer, parseTransfer, applyTransfer, availabilityReport, collectTransferStore, validateAvailability, readTransferFile, writeTransferFile, TRANSFER_LIMITS } from '../scripts/handoff-transfer.mjs';
import './env.mjs';
const roots = []; after(() => roots.forEach(root => rmSync(root, { recursive: true, force: true })));
const sha = value => createHash('sha256').update(value).digest('hex');
const scope = { team: 'team', epoch: 1, sender: 'sender', sender_incarnation: 's-inc', receiver: 'receiver', receiver_incarnation: 'r-inc' };
// These fixtures model already-replayed authority; they are not authentication evidence.
function authority(payload = null) {
  return { teams: { team: { epoch: 1, participants: { sender: { id: 'sender', incarnation: 's-inc' }, receiver: { id: 'receiver', incarnation: 'r-inc' } },
    messages: payload ? [{ id: 'availability', sender: 'receiver', recipient: 'sender', incarnation: 's-inc', epoch: 1, kind: 'ack', payload }] : [] } } };
}
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'waypost-transfer-'))); roots.push(root);
  writeFileSync(join(root, 'stable'), 'stable data\n'.repeat(1000)); writeFileSync(join(root, 'changed'), 'before\n'); writeFileSync(join(root, 'deleted'), 'old\n');
  const include = ['stable', 'changed', 'deleted', 'absent'];
  function packet(paths = include) {
    const value = createPacket(root, { goal: 'Continue explicit work', next_step: 'Read selected context', files: paths });
    writeFileSync(join(root, 'packet.json'), JSON.stringify(value)); return value;
  }
  packet();
  const full = buildTransfer(root, 'packet.json', { scope, include }), store = join(root, 'store');
  return { root, store, full, packet, include };
}
function deltaFixture() {
  const f = fixture(); applyTransfer(f.store, f.full, { scope });
  const report = availabilityReport(f.store, f.full.manifest_sha256, scope), state = authority(report);
  writeFileSync(join(f.root, 'changed'), 'after\n'); unlinkSync(join(f.root, 'deleted'));
  f.packet(['stable', 'changed', 'absent']);
  const delta = buildTransfer(f.root, 'packet.json', { scope, include: ['stable', 'changed', 'absent'], base: f.full.manifest, availabilityId: 'availability', authority: state });
  return { ...f, state, report, delta };
}
test('full then one-object change transfers fewer bytes and relocates an exact selected snapshot', () => {
  const f = deltaFixture(), target = join(f.root, 'fresh');
  assert.equal(f.delta.mode, 'delta'); assert.deepEqual(f.delta.deletions, ['deleted']);
  assert.equal(f.delta.objects.length, 2); // Changed object plus current packet, stable object omitted.
  assert.ok(Buffer.byteLength(JSON.stringify(f.delta)) < Buffer.byteLength(JSON.stringify(f.full)) / 2);
  const result = applyTransfer(f.store, f.delta, { scope, authority: f.state, materialize: target });
  assert.equal(result.stage, 'applied'); assert.equal(result.model_input_tokens, null);
  assert.equal(result.object_bytes, f.delta.objects.reduce((n, o) => n + o.bytes, 0));
  assert.equal(result.serialized_transfer_bytes, Buffer.byteLength(JSON.stringify(f.delta)));
  const packet = JSON.parse(readFileSync(join(target, 'packet.json')));
  assert.equal(inspectPacket(target, packet).snapshot_matches, true);
  assert.equal(readFileSync(join(target, 'stable'), 'utf8'), 'stable data\n'.repeat(1000));
  assert.equal(existsSync(join(target, 'deleted')), false); assert.equal(existsSync(join(target, 'absent')), false);
  assert.throws(() => applyTransfer(f.store, f.delta, { scope, authority: f.state, materialize: target }), /EEXIST/);
});
test('an availability document alone, wrong sender/receiver/incarnation/epoch and stale reports never authorize a delta', () => {
  const f = deltaFixture(), args = [scope, f.full.manifest_sha256, f.full.transfer_id, 'availability'];
  assert.throws(() => validateAvailability(f.report, ...args), /availability/);
  for (const mutate of [s => { s.teams.team.messages = []; }, s => { s.teams.team.messages[0].kind = 'answer'; },
    s => { s.teams.team.messages[0].sender = 'sender'; }, s => { s.teams.team.messages[0].recipient = 'receiver'; },
    s => { s.teams.team.messages[0].incarnation = 'old'; }, s => { s.teams.team.messages[0].epoch = 0; },
    s => { s.teams.team.participants.receiver.incarnation = 'new'; }, s => { s.teams.team.participants.sender.incarnation = 'new'; },
    s => { s.teams.team.messages[0].payload.manifest_sha256 = '0'.repeat(64); }, s => { s.teams.team.messages[0].payload.transfer_id = '0'.repeat(64); }]) {
    const state = structuredClone(f.state); mutate(state);
    assert.throws(() => validateAvailability(state, ...args), /availability/);
    assert.throws(() => applyTransfer(f.store, f.delta, { scope, authority: state }), /availability/);
  }
  assert.throws(() => buildTransfer(f.root, 'packet.json', { scope, include: ['stable'], base: f.full.manifest, availabilityId: 'forged', authority: f.state }), /availability/);
  assert.equal(existsSync(join(f.store, f.delta.manifest_sha256 + '.manifest')), false);
});
test('after-report eviction or corruption requires full transfer and publishes no partial snapshot', () => {
  for (const corrupt of [false, true]) {
    const f = deltaFixture(), object = f.full.manifest.entries.find(e => e.path === 'stable');
    if (corrupt) writeFileSync(join(f.store, object.sha256 + '.obj'), 'corrupt', { mode: 0o600 });
    else unlinkSync(join(f.store, object.sha256 + '.obj'));
    const result = applyTransfer(f.store, f.delta, { scope, authority: f.state });
    assert.equal(result.stage, 'needs-full'); assert.equal(existsSync(join(f.store, f.delta.manifest_sha256 + '.manifest')), false);
    assert.throws(() => availabilityReport(f.store, f.full.manifest_sha256, scope));
    const full = buildTransfer(f.root, 'packet.json', { scope, include: ['stable', 'changed', 'absent'] });
    assert.equal(applyTransfer(f.store, full, { scope }).stage, 'applied');
    assert.equal(availabilityReport(f.store, full.manifest_sha256, scope).manifest_sha256, full.manifest_sha256);
  }
});
test('interruption before manifest publication leaves no available target; exact full replay completes', () => {
  const f = fixture();
  assert.throws(() => applyTransfer(f.store, f.full, { scope, beforePublish: () => { throw new Error('power-loss'); } }), /power-loss/);
  assert.equal(existsSync(join(f.store, f.full.manifest_sha256 + '.manifest')), false);
  assert.throws(() => availabilityReport(f.store, f.full.manifest_sha256, scope));
  assert.equal(applyTransfer(f.store, f.full, { scope }).stage, 'applied');
  const added = applyTransfer(f.store, f.full, { scope }).stored_bytes_added; assert.equal(added, 0);
  if (process.platform !== 'win32') {
    assert.equal(lstatSync(f.store).mode & 0o777, 0o700);
    for (const name of readdirSync(f.store)) assert.equal(lstatSync(join(f.store, name)).mode & 0o777, 0o600);
  }
});
test('quota refusal creates no target and explicit GC removes only recorded store-owned files', () => {
  const f = fixture();
  assert.throws(() => applyTransfer(f.store, f.full, { scope, quotaBytes: 1000 }), /store-quota/);
  assert.equal(existsSync(join(f.store, f.full.manifest_sha256 + '.manifest')), false);
  applyTransfer(f.store, f.full, { scope });
  const foreign = join(f.store, sha('foreign') + '.obj'); writeFileSync(foreign, 'foreign', { mode: 0o600 });
  assert.deepEqual(collectTransferStore(f.store, scope, { keep: [f.full.manifest_sha256] }), { removed: 0, bytes: 0 });
  const collected = collectTransferStore(f.store, scope); assert.ok(collected.removed > 0); assert.ok(collected.bytes > 0);
  assert.equal(readFileSync(foreign, 'utf8'), 'foreign'); assert.equal(existsSync(join(f.store, 'owner.json')), true);
  assert.throws(() => availabilityReport(f.store, f.full.manifest_sha256, scope));
});
test('strict envelope types, paths, hashes, canonical base64 and aggregate sizes fail before store creation', () => {
  const f = fixture();
  const mutations = [v => { v.extra = true; }, v => { v.version = 2; }, v => { v.objects[0].bytes = '10'; },
    v => { v.objects[0].data += '\n'; }, v => { v.objects[0].data = '===='; }, v => { v.objects[0].bytes = 0; },
    v => { v.objects[0].sha256 = '0'.repeat(64); }, v => { v.objects.push(v.objects[0]); }, v => { v.objects = []; },
    v => { v.manifest.entries[0].path = '../outside'; }, v => { v.manifest.entries[0].path = '/outside'; },
    v => { v.manifest.entries[0].path = 'packet.json/child'; }, v => { v.manifest.entries[0].state = 'symlink'; },
    v => { v.manifest.packet.bytes = 65537; }, v => { v.scope.epoch = '1'; }, v => { v.deletions = ['../outside']; },
    v => { v.objects[0].bytes = TRANSFER_LIMITS.object + 1; }, v => { v.manifest_sha256 = '0'.repeat(64); }];
  for (const mutate of mutations) {
    const value = structuredClone(f.full); mutate(value); assert.throws(() => applyTransfer(f.store, value, { scope }));
    assert.equal(existsSync(f.store), false);
  }
  assert.throws(() => parseTransfer(Buffer.alloc(TRANSFER_LIMITS.envelope + 1)), /envelope-limit/);
  assert.throws(() => parseTransfer(Buffer.from([0xff])), /json/);
});
test('packet object must match manifest references even if envelope hashes are recomputed', () => {
  const f = fixture(), value = structuredClone(f.full);
  const selected = value.manifest.entries.find(entry => entry.state === 'file');
  selected.state = 'missing'; delete selected.bytes; delete selected.sha256;
  value.manifest_sha256 = sha(JSON.stringify(value.manifest)); value.transfer_id = sha(JSON.stringify({ scope, manifest: value.manifest_sha256 }));
  // Drop the now-unreferenced object so packet-reference binding, not object allowlisting, rejects it.
  const refs = [value.manifest.packet, ...value.manifest.entries]; value.objects = value.objects.filter(o => refs.some(r => r.sha256 === o.sha256));
  assert.throws(() => applyTransfer(f.store, value, { scope }), /packet-reference/); assert.equal(existsSync(f.store), false);
});
test('missing path appearance, selection duplication and packet ancestor collisions refuse export', () => {
  const f = fixture(); writeFileSync(join(f.root, 'absent'), 'appeared');
  assert.throws(() => buildTransfer(f.root, 'packet.json', { scope, include: ['absent'] }), /stale/);
  assert.throws(() => buildTransfer(f.root, 'packet.json', { scope, include: ['stable', 'stable'] }), /include/);
  assert.throws(() => buildTransfer(f.root, 'packet.json', { scope, include: ['unlisted'] }), /include/);
});
test('foreign stores, receiver identity, store symlinks and foreign object clobbering are refused', () => {
  const f = fixture(); mkdirSync(f.store, { mode: 0o700 }); writeFileSync(join(f.store, 'foreign'), 'untouched');
  assert.throws(() => applyTransfer(f.store, f.full, { scope })); assert.equal(readFileSync(join(f.store, 'foreign'), 'utf8'), 'untouched');
  const own = join(f.root, 'owned'); applyTransfer(own, f.full, { scope });
  assert.throws(() => availabilityReport(own, f.full.manifest_sha256, { ...scope, receiver_incarnation: 'different' }), /store-owner/);
  assert.throws(() => applyTransfer(own, f.full, { scope: { ...scope, receiver: 'different' } }), /scope/);
  const link = join(f.root, 'link'); symlinkSync(own, link, 'dir'); assert.throws(() => applyTransfer(link, f.full, { scope }), /store-path/);
  const fresh = join(f.root, 'fresh-store'); applyTransfer(fresh, f.full, { scope }); collectTransferStore(fresh, scope);
  const object = f.full.objects[0], path = join(fresh, object.sha256 + '.obj'); writeFileSync(path, 'foreign', { mode: 0o600 });
  assert.throws(() => applyTransfer(fresh, f.full, { scope }), /store-corrupt/); assert.equal(readFileSync(path, 'utf8'), 'foreign');
});
test('transfer files are bounded and published atomically without overwriting an existing output', () => {
  const f = fixture(), path = join(f.root, 'export.json'); writeTransferFile(path, f.full);
  assert.deepEqual(parseTransfer(readTransferFile(path)).envelope, f.full);
  assert.throws(() => writeTransferFile(path, f.full), /output-exists/);
  assert.equal(readdirSync(f.root).filter(name => name.startsWith('.transfer-')).length, 0);
});
test('an exact base digest and explicit deletion list are checked before target publication', () => {
  const f = deltaFixture(), changed = structuredClone(f.delta); changed.deletions = [];
  assert.throws(() => applyTransfer(f.store, changed, { scope, authority: f.state }), /deletions/);
  const different = structuredClone(f.delta); different.base.manifest_sha256 = '0'.repeat(64);
  assert.throws(() => applyTransfer(f.store, different, { scope, authority: f.state }), /base/);
  assert.equal(existsSync(join(f.store, f.delta.manifest_sha256 + '.manifest')), false);
});
