import assert from 'node:assert/strict';
import http from 'node:http';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startServer } from './server.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'local-notes-test-'));
const token = 'a'.repeat(64);
let service;
let checks = 0;
const assertStatus = (response, status) => { assert.equal(response.status, status); checks++; };
function record(overrides = {}) {
  return { id: randomUUID(), title: 'Example', body: 'Preserved\ntext ', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...overrides };
}
async function request(route, { method = 'GET', value, raw, headers = {} } = {}) {
  const actual = { 'X-Local-Token': token, ...headers };
  if (['POST', 'PATCH', 'DELETE'].includes(method) && !Object.hasOwn(actual, 'Origin')) actual.Origin = service.url;
  if (value !== undefined || raw !== undefined) {
    if (!Object.hasOwn(actual, 'Content-Type')) actual['Content-Type'] = 'application/json';
  }
  for (const key of Object.keys(actual)) if (actual[key] === null) delete actual[key];
  const response = await fetch(service.url + route, { method, headers: actual, body: raw !== undefined ? raw : value === undefined ? undefined : JSON.stringify(value) });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, headers: response.headers, data };
}
async function exported() { const result = await request('/api/export'); assertStatus(result, 200); return result.data; }
async function rawHTTP(route, { method = 'GET', headers = {}, chunks = [] } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(service.url);
    const req = http.request({ hostname: '127.0.0.1', port: target.port, path: route, method, headers: { Host: target.host, 'X-Local-Token': token, ...headers } }, res => {
      const parts = [];
      res.on('data', part => parts.push(part));
      res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(parts).toString() }));
      res.on('error', reject);
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}
try {
  await assert.rejects(startServer(), /directory/);
  for (const invalid of ['', 'x'.repeat(64), null, 42, 'a'.repeat(63)]) await assert.rejects(startServer({ dataDir: path.join(root, 'unused'), token: invalid }), /Token/);
  await assert.rejects(startServer({ dataDir: root, port: -1 }), /Port/);
  const dataDir = path.join(root, 'data');
  service = await startServer({ dataDir, token });
  assert.match(service.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.deepEqual(await exported(), { version: 1, notes: [] });
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(dataDir)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(path.join(dataDir, 'notes.json'))).mode & 0o777, 0o600);
  }
  for (const supplied of [null, '', 'b'.repeat(64), 'z'.repeat(64), 'short']) {
    const result = await request('/api/notes', { headers: { 'X-Local-Token': supplied } });
    assertStatus(result, 401);
    assert.equal(typeof result.data.error, 'string');
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.match(result.headers.get('content-type'), /^application\/json/);
    assert.ok(!JSON.stringify(result.data).includes(token));
  }
  assertStatus(await request(`/api/notes?token=${token}`, { headers: { 'X-Local-Token': null, Cookie: `token=${token}` } }), 401);
  assertStatus(await request('/api/notes', { headers: { Origin: 'https://evil.example' } }), 403);
  assertStatus(await request('/api/notes', { method: 'POST', value: { title: 'A', body: '' }, headers: { Origin: null } }), 403);
  assertStatus(await rawHTTP('/api/notes', { headers: { Host: 'evil.example' } }), 403);
  assertStatus(await rawHTTP('/api/notes', { headers: { Host: new URL(service.url).host.replace('127.0.0.1', 'localhost') } }), 403);
  for (const route of ['/', '/app.js', '/style.css']) {
    const response = await request(route);
    assertStatus(response, 200);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.ok(!String(response.data).includes(token));
  }
  assert.match((await request('/')).headers.get('content-type'), /text\/html/);
  assert.match((await request('/app.js')).headers.get('content-type'), /javascript/);
  assert.match((await request('/style.css')).headers.get('content-type'), /text\/css/);
  for (const route of ['/server.mjs', '/../server.mjs', '/%2e%2e/server.mjs', '/public/index.html', '/api/no-such-route', '/api/notes/not-a-uuid']) assertStatus(await rawHTTP(route), 404);
  assertStatus(await request('/api/notes', { method: 'PUT' }), 405);
  assertStatus(await request('/api/export', { method: 'POST', value: {} }), 405);
  for (const route of ['/api/notes?q=a&q=b', '/api/notes?other=a', '/api/notes?q=' + 'a'.repeat(201)]) assertStatus(await request(route), 400);
  for (const value of [{ title: '', body: '' }, { title: ' '.repeat(3), body: '' }, { title: 'a'.repeat(121), body: '' }, { title: 'A', body: 2 }, { title: 'A', body: 'b'.repeat(4001) }, { title: 'A', body: '', extra: true }, { title: 'A' }, []]) assertStatus(await request('/api/notes', { method: 'POST', value }), 400);
  assertStatus(await request('/api/notes', { method: 'POST', raw: '{' }), 400);
  assertStatus(await request('/api/notes', { method: 'POST', raw: Buffer.from([0xc3, 0x28]) }), 400);
  assertStatus(await request('/api/notes', { method: 'POST', raw: '{}', headers: { 'Content-Type': 'text/plain' } }), 415);
  assertStatus(await request('/api/notes', { method: 'POST', raw: '{}', headers: { 'Content-Type': 'application/json; charset=latin1' } }), 415);
  const oversized = await rawHTTP('/api/import', { method: 'POST', headers: { Origin: service.url, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' }, chunks: [Buffer.alloc(150000, 32), Buffer.alloc(150000, 32)] });
  assertStatus(oversized, 413);
  assert.ok(JSON.parse(oversized.text).error);
  const created = await request('/api/notes', { method: 'POST', value: { title: '  <img src=x onerror=alert(1)>  ', body: 'Hello\nWORLD  ' } });
  assertStatus(created, 201);
  const first = created.data.note;
  assert.equal(first.title, '<img src=x onerror=alert(1)>');
  assert.equal(first.body, 'Hello\nWORLD  ');
  assert.match(first.id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  assert.equal(new Date(first.createdAt).toISOString(), first.createdAt);
  assert.deepEqual((await request('/api/notes/' + first.id)).data, { note: first });
  const found = await request('/api/notes?q=world');
  assertStatus(found, 200);
  assert.equal(found.data.total, 1);
  assert.equal((await request('/api/notes?q=absent')).data.total, 0);
  for (const value of [{}, { id: first.id }, { title: null }, { body: 'x'.repeat(4001) }]) assertStatus(await request('/api/notes/' + first.id, { method: 'PATCH', value }), 400);
  const patched = await request('/api/notes/' + first.id, { method: 'PATCH', value: { title: 'Updated' } });
  assertStatus(patched, 200);
  assert.equal(patched.data.note.id, first.id);
  assert.equal(patched.data.note.createdAt, first.createdAt);
  assert.equal(patched.data.note.body, first.body);
  assert.ok(patched.data.note.updatedAt >= first.createdAt);
  const concurrent = await Promise.all(Array.from({ length: 12 }, (_, index) => request('/api/notes', { method: 'POST', value: { title: `Concurrent ${index}`, body: '' } })));
  concurrent.forEach(response => assertStatus(response, 201));
  assert.equal((await exported()).notes.length, 13);
  const saved = await exported();
  for (const value of [
    { ...saved, extra: 1 },
    { version: 2, notes: [] },
    { version: 1, notes: [record({ title: ' untrimmed ' })] },
    { version: 1, notes: [record({ id: 'BAD' })] },
    { version: 1, notes: [record({ createdAt: '2026-01-01', updatedAt: '2026-01-01' })] },
    { version: 1, notes: [record({ updatedAt: '2025-01-01T00:00:00.000Z' })] },
    { version: 1, notes: [{ ...record(), other: true }] },
    { version: 1, notes: [first, first] }
  ]) {
    assertStatus(await request('/api/import', { method: 'POST', value }), 400);
    assert.deepEqual(await exported(), saved);
  }
  const orderedNotes = [record(), record(), record({ updatedAt: '2026-02-01T00:00:00.000Z' })];
  assertStatus(await request('/api/import', { method: 'POST', value: { version: 1, notes: orderedNotes } }), 200);
  const expectedOrder = [...orderedNotes].sort((a, b) => a.updatedAt === b.updatedAt ? (a.id < b.id ? -1 : 1) : a.updatedAt > b.updatedAt ? -1 : 1);
  assert.deepEqual((await request('/api/notes')).data.notes, expectedOrder);
  const hundred = { version: 1, notes: Array.from({ length: 100 }, () => record()) };
  assertStatus(await request('/api/import', { method: 'POST', value: hundred }), 200);
  assertStatus(await request('/api/notes', { method: 'POST', value: { title: 'Overflow', body: '' } }), 413);
  assert.deepEqual(await exported(), hundred);
  assertStatus(await request('/api/import', { method: 'POST', value: { version: 1, notes: [...hundred.notes, record()] } }), 413);
  const full = { version: 1, notes: Array.from({ length: 40 }, () => record({ body: '' })) };
  let remaining = 262144 - Buffer.byteLength(JSON.stringify(full));
  for (const note of full.notes) {
    const pairs = Math.min(4000, Math.floor(remaining / 2));
    note.body = 'é'.repeat(pairs);
    remaining -= pairs * 2;
    if (remaining === 1 && note.body.length < 4000) { note.body += 'a'; remaining--; }
  }
  assert.equal(remaining, 0);
  assert.equal(Buffer.byteLength(JSON.stringify(full)), 262144);
  assertStatus(await request('/api/import', { method: 'POST', value: full }), 200);
  assertStatus(await request('/api/notes', { method: 'POST', value: { title: 'Too much', body: '' } }), 413);
  assertStatus(await request('/api/notes/' + full.notes[0].id, { method: 'PATCH', value: { title: 'Longer title' } }), 413);
  assert.deepEqual(await exported(), full);
  assertStatus(await request('/api/import', { method: 'POST', value: saved }), 200);
  const filename = path.join(dataDir, 'notes.json');
  const moved = path.join(root, 'saved-notes.json');
  await fs.rename(filename, moved);
  await fs.mkdir(filename);
  assertStatus(await request('/api/notes', { method: 'POST', value: { title: 'Cannot rename', body: '' } }), 500);
  assert.deepEqual(await exported(), saved);
  await fs.rmdir(filename);
  await fs.rename(moved, filename);
  assert.equal((await fs.readdir(dataDir)).filter(name => name.endsWith('.tmp')).length, 0);
  const movedDirectory = path.join(root, 'moved-data');
  await fs.rename(dataDir, movedDirectory);
  await fs.writeFile(dataDir, 'blocked');
  assertStatus(await request('/api/notes', { method: 'POST', value: { title: 'Cannot write', body: '' } }), 500);
  assert.deepEqual(await exported(), saved);
  await fs.unlink(dataDir);
  await fs.rename(movedDirectory, dataDir);
  if (process.platform !== 'win32') {
    const target = path.join(root, 'symlink-target');
    await fs.writeFile(target, 'DO NOT TOUCH');
    await fs.rename(filename, moved);
    await fs.symlink(target, filename);
    assertStatus(await request('/api/notes', { method: 'POST', value: { title: 'Unsafe', body: '' } }), 500);
    assert.equal(await fs.readFile(target, 'utf8'), 'DO NOT TOUCH');
    assert.deepEqual(await exported(), saved);
    await assert.rejects(startServer({ dataDir, token }));
    await fs.unlink(filename);
    await fs.rename(moved, filename);
    const linkedDirectory = path.join(root, 'linked-data');
    await fs.symlink(dataDir, linkedDirectory);
    await assert.rejects(startServer({ dataDir: linkedDirectory, token }));
  }
  assertStatus(await request('/api/notes', { method: 'POST', value: { title: 'Recovery', body: '' } }), 201);
  const beforeRestart = await exported();
  await service.close();
  await service.close();
  service = await startServer({ dataDir, token });
  assert.deepEqual(await exported(), beforeRestart);
  const deleteId = beforeRestart.notes[0].id;
  assert.deepEqual((await request('/api/notes/' + deleteId, { method: 'DELETE' })).data, { deleted: deleteId });
  assertStatus(await request('/api/notes/' + deleteId), 404);
  assertStatus(await request('/api/notes/' + deleteId, { method: 'DELETE' }), 404);
  assertStatus(await request('/api/import', { method: 'POST', value: { version: 1, notes: [] } }), 200);
  assert.deepEqual(await exported(), { version: 1, notes: [] });
  const corrupt = path.join(root, 'corrupt');
  await fs.mkdir(corrupt);
  const badData = '{broken but valuable';
  await fs.writeFile(path.join(corrupt, 'notes.json'), badData);
  await assert.rejects(startServer({ dataDir: corrupt, token }));
  assert.equal(await fs.readFile(path.join(corrupt, 'notes.json'), 'utf8'), badData);
  const generated = await startServer({ dataDir: path.join(root, 'generated') });
  try { assert.match(generated.url, /^http:\/\/127\.0\.0\.1:\d+$/); } finally { await generated.close(); }
  console.log(`Local Notes: ${checks} real HTTP checks passed, plus storage, validation, capacity, concurrency and lifecycle assertions.`);
} finally {
  if (service) await service.close();
  await fs.rm(root, { recursive: true, force: true });
}
