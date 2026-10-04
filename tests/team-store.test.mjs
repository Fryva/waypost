import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readAuthority, replayAuthorityUncached, mutateAuthority, explainRecovery, recoverLock, withAuthorityGate } from '../scripts/team-store.mjs';

const reducer = (state, cmd) => ({ state: { count: (state?.count || 0) + cmd.add }, result: { count: (state?.count || 0) + cmd.add } });
const request = (key = 'one', expected_revision = 0, add = 1) => ({ key, actor: 'owner', expected_revision, command: { add } });
function fixture(t) { const temp = realpathSync(mkdtempSync(join(tmpdir(), 'waypost-authority-'))); t.after(() => rmSync(temp, { recursive: true, force: true })); return join(temp, 'authority'); }
const mutate = (root, req = request(), options = {}) => mutateAuthority(root, req, reducer, { confirmedLocal: true, ...options });

test('authorization runs under mutex before cached idempotent reply',t=>{
 const root=fixture(t);mutate(root);
 assert.throws(()=>mutate(root,request(),{authorize:()=>{throw new Error('revoked');}}),/revoked/);
 assert.equal(readAuthority(root,reducer).revision,1);
});
test('legacy gate serializes writes with initial authority creation',t=>{
 const root=fixture(t);
 withAuthorityGate(root,reducer,state=>{
  assert.equal(state,null);
  assert.throws(()=>mutate(root),/authority-locked/);
 });
 mutate(root);
 withAuthorityGate(root,reducer,state=>assert.equal(state.count,1));
 assert.equal(explainRecovery(root).locked,false);
});

test('authority serializes replay and stale authenticated idempotency keys', t => {
  const root = fixture(t);
  assert.deepEqual(readAuthority(root, reducer), { state: null, revision: 0, requests: [] });
  const first = mutate(root);
  assert.equal(first.replayed, false);
  mutate(root, request('two', 1, 3));
  assert.deepEqual(mutate(root), { ...first, replayed: true });
  assert.throws(() => mutate(root, request('one', 0, 7)), { code: 'authority-request-key-reused' });
  assert.throws(() => mutate(root, request('three')), { code: 'authority-stale-revision', revision: 2 });
  assert.equal(readAuthority(root, reducer).state.count, 4);
  assert.equal(readdirSync(join(root, 'events')).length, 2);
});

test('unknown locality needs explicit confirmation and known remote cannot override', t => {
  const root = fixture(t);
  assert.throws(() => mutateAuthority(root, request(), reducer), { code: 'authority-locality-confirmation-required' });
  assert.throws(() => mutate(join(root, 'Dropbox', 'authority')), { code: 'authority-nonlocal' });
  mutate(root);
  assert.throws(() => mutate(root, request('two', 1), { host: 'another-host' }), { code: 'authority-host-mismatch' });
});

test('snapshot corruption and stale state cannot authorize or prevent replay', t => {
  const root = fixture(t); mutate(root);
  writeFileSync(join(root, 'state.json'), 'not a snapshot');
  assert.equal(readAuthority(root, reducer).state.count, 1);
  mutate(root, request('two', 1));
  assert.equal(JSON.parse(readFileSync(join(root, 'state.json'))).revision, 2);
  unlinkSync(join(root, 'state.json'));
  assert.equal(readAuthority(root, reducer).revision, 2);
});

for (const stage of ['after-lock', 'after-temp-flush', 'after-publication', 'after-snapshot', 'before-reply']) {
  test('interrupted ' + stage + ' requires owner recovery and preserves committed outcome', t => {
    const root = fixture(t);
    assert.throws(() => mutate(root, request(), { fault: current => { if (current === stage) throw new Error('simulated crash'); } }), /simulated crash/);
    assert.equal(explainRecovery(root).locked, true);
    assert.throws(() => mutate(root), { code: 'authority-locked' });
    assert.throws(() => recoverLock(root), { code: 'authority-recovery-confirmation-required' });
    const recovered = recoverLock(root, { ownerConfirmedStopped: true });
    assert.equal(recovered.recovered, true);
    assert.equal(explainRecovery(root).locked, false);
    const published = ['after-publication', 'after-snapshot', 'before-reply'].includes(stage);
    const reply = mutate(root);
    assert.equal(reply.replayed, published);
    assert.equal(readAuthority(root, reducer).state.count, 1);
    assert.equal(readdirSync(join(root, 'events')).length, 1);
  });
}

for (const stage of ['after-lock', 'after-temp-flush', 'after-publication', 'after-snapshot', 'before-reply']) {
  test('interrupted ' + stage + ' after a cached read replays the committed outcome once', t => {
    const root = fixture(t); mutate(root); assert.equal(readAuthority(root, reducer).revision, 1);
    assert.throws(() => mutate(root, request('two', 1), { fault: current => { if (current === stage) throw new Error('simulated crash'); } }), /simulated crash/);
    recoverLock(root, { ownerConfirmedStopped: true });
    const published = ['after-publication', 'after-snapshot', 'before-reply'].includes(stage);
    assert.equal(readAuthority(root, reducer).revision, published ? 2 : 1);
    assert.equal(mutate(root, request('two', 1)).replayed, published);
    assert.deepEqual(readAuthority(root, reducer), replayAuthorityUncached(root, reducer));
    assert.equal(readAuthority(root, reducer).state.count, 2);
  });
}

const tampers = {
  command: (root, path) => { const e = JSON.parse(readFileSync(path)); e.command.add = 5; writeFileSync(path, JSON.stringify(e)); },
  hash: (root, path) => { const e = JSON.parse(readFileSync(path)); e.hash = 'f'.repeat(64); writeFileSync(path, JSON.stringify(e)); },
  'identity host': root => { const p = join(root, 'identity.json'), id = JSON.parse(readFileSync(p)); id.host = 'elsewhere'; writeFileSync(p, JSON.stringify(id)); },
  'symlink to identical bytes': (root, path) => { const copy = join(root, 'copy.json'); writeFileSync(copy, readFileSync(path)); unlinkSync(path); symlinkSync(copy, path); },
  'renamed prefix': (root, path) => { const bytes = readFileSync(path); unlinkSync(path); writeFileSync(join(root, 'events', '000000000004.json'), bytes); },
  'duplicated request': (root, path) => { writeFileSync(join(root, 'events', '000000000002.json'), readFileSync(path)); }
};
for (const [name, tamper] of Object.entries(tampers)) {
  test('cached read still refuses a ' + name + ' change on every later read', t => {
    const root = fixture(t); mutate(root); mutate(root, request('two', 1)); mutate(root, request('three', 2));
    assert.equal(readAuthority(root, reducer).revision, 3);
    tamper(root, join(root, 'events', '000000000001.json'));
    assert.throws(() => readAuthority(root, reducer), /authority-/);
    assert.throws(() => readAuthority(root, reducer), /authority-/);
    assert.throws(() => mutate(root, request('four', 3)), /authority-/);
  });
}

const stableJson = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? '[' + v.map(stableJson).join(',') + ']' : '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
const sha = v => createHash('sha256').update(stableJson(v)).digest('hex');
for (const tail of ['duplicate request', 'corrupt json']) {
  test('a ' + tail + ' tail after a warm read is refused on every read, warm or cold', t => {
    const root = fixture(t); mutate(root); mutate(root, request('two', 1)); mutate(root, request('three', 2));
    assert.equal(readAuthority(root, reducer).revision, 3);
    const path = join(root, 'events', '000000000004.json');
    if (tail === 'corrupt json') writeFileSync(path, '{not json');
    else {
      const third = JSON.parse(readFileSync(join(root, 'events', '000000000003.json'))), command = { add: 1 };
      const body = { protocol: third.protocol, seq: 4, host: third.host, previous: third.hash, actor: 'owner', key: 'one', request_digest: sha({ actor: 'owner', command }), command, accepted_at: new Date().toISOString(), result: { count: 4 }, state_digest: sha({ count: 4 }) };
      writeFileSync(path, JSON.stringify({ ...body, hash: sha(body) }));
    }
    const code = tail === 'corrupt json' ? 'authority-corrupt-json' : 'authority-duplicate-request';
    assert.throws(() => readAuthority(root, reducer), { code });
    assert.throws(() => readAuthority(root, reducer), { code });
    assert.throws(() => replayAuthorityUncached(root, reducer), { code });
  });
}

test('cached read follows truncation, rewritten bytes and foreign appends exactly like full replay', t => {
  const root = fixture(t); mutate(root); mutate(root, request('two', 1));
  assert.equal(readAuthority(root, reducer).revision, 2);
  const first = join(root, 'events', '000000000001.json');
  writeFileSync(first, JSON.stringify(JSON.parse(readFileSync(first)), null, 2));
  assert.deepEqual(readAuthority(root, reducer), replayAuthorityUncached(root, reducer));
  const last = join(root, 'events', '000000000002.json'), bytes = readFileSync(last); unlinkSync(last);
  assert.equal(readAuthority(root, reducer).revision, 1);
  writeFileSync(last, bytes);
  const read = readAuthority(root, reducer);
  assert.equal(read.revision, 2); assert.deepEqual(read, replayAuthorityUncached(root, reducer));
  read.state.count = 99; read.requests.length = 0;
  assert.equal(readAuthority(root, reducer).state.count, 2); assert.equal(readAuthority(root, reducer).requests.length, 2);
  assert.throws(() => { readAuthority(root, reducer).requests[0].result.count = 7; }, TypeError);
  const reply = mutate(root, request('two', 2)); reply.result.count = 7;
  assert.equal(mutate(root, request('two', 2)).result.count, 2);
});

test('a reducer reading anything but its command and event time fails cold replay', t => {
  const root = fixture(t); let drift = 0;
  const impure = (state, cmd) => ({ state: { count: (state?.count || 0) + cmd.add + drift }, result: {} });
  mutateAuthority(root, request(), impure, { confirmedLocal: true });
  assert.equal(readAuthority(root, impure).revision, 1); drift = 1;
  assert.equal(readAuthority(root, impure).revision, 1, 'a warm read does not re-run the verified prefix');
  assert.throws(() => replayAuthorityUncached(root, impure), { code: 'authority-replay-mismatch' });
});

test('empty aged lock cannot be stolen, explicit recovery archives evidence', t => {
  const root = fixture(t); mutate(root);
  mkdirSync(join(root, 'lock'));
  assert.equal(explainRecovery(root).owner, null);
  assert.equal(explainRecovery(root).ttl_recovery, false);
  assert.throws(() => mutate(root, request('two', 1)), { code: 'authority-locked' });
  const outcome = recoverLock(root, { ownerConfirmedStopped: true });
  assert.match(outcome.evidence, /recovered-lock-/);
  mutate(root, request('two', 1));
});

for (const corruption of ['command', 'gap', 'protocol', 'hash']) {
  test('damaged ' + corruption + ' log blocks reads and mutation without repairing history', t => {
    const root = fixture(t); mutate(root);
    const path = join(root, 'events', '000000000001.json');
    const event = JSON.parse(readFileSync(path));
    if (corruption === 'command') event.command.add = 5;
    if (corruption === 'protocol') event.protocol = 99;
    if (corruption === 'hash') event.hash = 'f'.repeat(64);
    if (corruption === 'gap') { unlinkSync(path); writeFileSync(join(root, 'events', '000000000002.json'), JSON.stringify(event)); }
    else writeFileSync(path, JSON.stringify(event));
    const before = readFileSync(corruption === 'gap' ? join(root, 'events', '000000000002.json') : path, 'utf8');
    assert.throws(() => readAuthority(root, reducer), /authority-/);
    assert.throws(() => mutate(root, request('two', 1)), /authority-/);
    assert.equal(readFileSync(corruption === 'gap' ? join(root, 'events', '000000000002.json') : path, 'utf8'), before);
    assert.equal(explainRecovery(root).locked, false);
  });
}

test('symlink roots, ancestors, event directories, locks and snapshots refuse access', t => {
  const root = fixture(t); mutate(root);
  const alias = join(root, '..', 'alias'); symlinkSync(root, alias, 'dir');
  assert.throws(() => readAuthority(alias, reducer), { code: 'authority-symlink' });
  assert.throws(() => mutate(join(alias, 'descendant')), { code: 'authority-symlink' });
  for (const name of ['events', 'state.json', 'lock']) {
    const original = join(root, name);
    if (name === 'events') {
      const target = join(root, '..', 'other-events'); mkdirSync(target);
      // Use a separate initialized authority so the healthy test root stays usable.
      const other = join(root, '..', 'second'); mutate(other); rmSync(join(other, name), { recursive: true }); symlinkSync(target, join(other, name), 'dir');
      assert.throws(() => mutate(other, request('two', 1)), { code: 'authority-symlink' });
    } else {
      if (name === 'state.json') unlinkSync(original);
      symlinkSync(join(root, 'identity.json'), original);
      assert.throws(() => mutate(root, request('two', 1)), { code: 'authority-symlink' });
      unlinkSync(original);
    }
  }
});

test('bounded command and request identifiers', t => {
  const root = fixture(t);
  assert.throws(() => mutate(root, { ...request(), command: { text: 'x'.repeat(300_000) } }), { code: 'authority-command-too-large' });
  assert.throws(() => mutate(root, request('../escape')), { code: 'authority-invalid-request' });
});

test('two processes at one revision accept at most one scheduling transition', async t => {
  const root = fixture(t); mutate(root);
  const modulePath = fileURLToPath(new URL('../scripts/team-store.mjs', import.meta.url));
  const child = key => new Promise((resolveChild, reject) => {
    const program = `import { mutateAuthority } from ${JSON.stringify('file://' + modulePath)};
      const reduce = ${reducer.toString()};
      try { const reply = mutateAuthority(${JSON.stringify(root)}, ${JSON.stringify(request(key, 1))}, reduce); console.log(JSON.stringify(reply)); }
      catch(e) { console.log(JSON.stringify({code:e.code})); }`;
    const p = spawn(process.execPath, ['--input-type=module', '-e', program], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; p.stdout.on('data', x => stdout += x); p.stderr.on('data', x => stderr += x);
    p.on('error', reject); p.on('exit', code => code === 0 ? resolveChild(JSON.parse(stdout)) : reject(new Error(stderr)));
  });
  const outcomes = await Promise.all([child('left'), child('right')]);
  assert.equal(outcomes.filter(x => x.replayed === false).length, 1);
  assert.ok(outcomes.some(x => ['authority-locked', 'authority-stale-revision'].includes(x.code)));
  assert.equal(readAuthority(root, reducer).revision, 2);
  assert.equal(readAuthority(root, reducer).state.count, 2);
});

test('accepted transition time is stamped under authority and remains stable during replay', t => {
 const root = fixture(t);
 const clockReducer = (state, command, authority) => ({ state: { accepted_at: authority.accepted_at }, result: { accepted_at: authority.accepted_at } });
 const request = { key: 'clock', actor: 'owner', expected_revision: 0, command: { at: new Date(Date.now() - 10000).toISOString() } };
 const before = Date.now();
 const first = mutateAuthority(root, request, clockReducer, { confirmedLocal: true });
 assert.ok(Date.parse(first.result.accepted_at) >= before);
 assert.notEqual(first.result.accepted_at, request.command.at);
 assert.deepEqual(readAuthority(root, clockReducer).state, first.result);
 assert.equal(mutateAuthority(root, request, clockReducer).replayed, true);
 assert.throws(() => mutateAuthority(root, { ...request, key: 'backdate', expected_revision: 1, command: { at: '2000-01-01T00:00:00Z' } }, clockReducer), { code: 'authority-invalid-action-time' });
});

test('inventory canonical nonce keys stay immutable across intervening captures and replay',t=>{
 const root=fixture(t),make=(nonce,revision,add)=>({key:'inventory-'+nonce,actor:'collector:peer',expected_revision:revision,command:{type:'native-model-inventory-capture-v1',request_key:'inventory-'+nonce,add}});
 mutate(root,make('A',0,1));mutate(root,make('B',1,2));
 assert.throws(()=>mutate(root,make('A',2,3)),{code:'authority-request-key-reused'});
 assert.throws(()=>mutate(root,{...make('A',2,3),key:'alternate'}),{code:'inventory-store-request-key-mismatch'});
 assert.equal(readAuthority(root,reducer).state.count,3);assert.equal(readAuthority(root,reducer).revision,2);
});
