import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startServer } from './server.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'local-notes-test-'));
const dataDir = path.join(root, 'data');
const token = 'ab'.repeat(32);
let server;
function request(method, route, payload, extra = {}) {
  return new Promise((resolve, reject) => {
    const bytes = payload === undefined ? undefined : Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));
    const req = http.request(server.url + route, { method, headers: {
      'X-Local-Token': token, Origin: server.url, 'Content-Type': 'application/json',
      ...(bytes ? { 'Content-Length': bytes.length } : {}), ...extra
    } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data; try { data = JSON.parse(text); } catch { data = text; }
        resolve({ status: res.statusCode, data, headers: res.headers });
      });
    });
    req.on('error', reject); req.end(bytes);
  });
}
async function status(method, route, body, expected, headers) {
  const result = await request(method, route, body, headers);
  assert.equal(result.status, expected, JSON.stringify(result.data));
  if (route.startsWith('/api')) {
    assert.match(result.headers['content-type'], /^application\/json/);
    assert.equal(result.headers['cache-control'], 'no-store');
    if (expected >= 400) assert.ok(typeof result.data.error === 'string' && result.data.error.length);
  }
  return result.data;
}
try {
  await assert.rejects(startServer({ dataDir, token: 'bad' }));
  await assert.rejects(startServer());
  server = await startServer({ dataDir, token });
  assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.deepEqual(await status('GET', '/api/notes', undefined, 200), { notes: [], total: 0 });
  await status('GET', '/api/notes', undefined, 401, { 'X-Local-Token': '' });
  await status('GET', '/api/notes?token=' + token, undefined, 401, { 'X-Local-Token': '' });
  await status('GET', '/api/notes', undefined, 401, { 'X-Local-Token': 'cd'.repeat(32) });
  await status('GET', '/api/notes', undefined, 403, { Host: 'evil.example' });
  await status('GET', '/api/notes', undefined, 403, { Origin: 'https://evil.example' });
  await status('POST', '/api/notes', { title: 'x', body: '' }, 403, { Origin: '' });
  await status('PUT', '/api/notes', {}, 405);
  await status('GET', '/api/missing', undefined, 404);
  await status('GET', '/api/notes?q=a&q=b', undefined, 400);
  await status('GET', '/api/notes?other=a', undefined, 400);
  await status('GET', '/api/notes?q=' + 'a'.repeat(201), undefined, 400);
  await status('POST', '/api/notes', { title: 'x', body: '' }, 415, { 'Content-Type': 'text/plain' });
  await status('POST', '/api/notes', Buffer.from('{'), 400);
  await status('POST', '/api/notes', Buffer.from([0x22, 0xff, 0x22]), 400);
  await status('POST', '/api/notes', Buffer.alloc(262145, 32), 413);
  await status('POST', '/api/notes', { title: ' ', body: '' }, 400);
  await status('POST', '/api/notes', { title: 'x', body: '', extra: true }, 400);
  await status('POST', '/api/notes', { title: 'x', body: 'a'.repeat(4001) }, 400);
  const { note } = await status('POST', '/api/notes', { title: '  <img src=x onerror=alert(1)>  ', body: 'Preserved\n  body ' }, 201);
  assert.equal(note.title, '<img src=x onerror=alert(1)>');
  assert.equal(note.body, 'Preserved\n  body ');
  assert.match(note.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(new Date(note.createdAt).toISOString(), note.createdAt);
  const found = await status('GET', '/api/notes?q=PRESERVED', undefined, 200);
  assert.equal(found.total, 1);
  const changed = await status('PATCH', '/api/notes/' + note.id, { body: 'New body' }, 200);
  assert.equal(changed.note.createdAt, note.createdAt);
  assert.equal(changed.note.body, 'New body');
  await status('PATCH', '/api/notes/' + note.id, {}, 400);
  await status('PATCH', '/api/notes/' + note.id, { id: note.id }, 400);
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => status('POST', '/api/notes', { title: 'Concurrent ' + i, body: '' }, 201)));
  assert.equal(new Set(results.map(r => r.note.id)).size, 12);
  const saved = await status('GET', '/api/export', undefined, 200);
  assert.equal(saved.notes.length, 13);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dataDir, 'notes.json'), 'utf8')), saved);
  const invalid = structuredClone(saved); invalid.notes[0].surprise = true;
  await status('POST', '/api/import', invalid, 400);
  const duplicate = structuredClone(saved); duplicate.notes.push(duplicate.notes[0]);
  await status('POST', '/api/import', duplicate, 400);
  assert.deepEqual(await status('GET', '/api/export', undefined, 200), saved);
  await status('DELETE', '/api/notes/' + note.id, undefined, 200);
  await status('GET', '/api/notes/' + note.id, undefined, 404);
  await status('DELETE', '/api/notes/' + note.id, undefined, 404);
  assert.deepEqual(await status('POST', '/api/import', saved, 200), { imported: 13 });
  const many = { version: 1, notes: Array.from({ length: 101 }, (_, i) => ({ ...note, id: `00000000-0000-0000-0000-${i.toString(16).padStart(12, '0')}` })) };
  await status('POST', '/api/import', many, 413);
  const full = { version: 1, notes: many.notes.slice(0, 100) };
  await status('POST', '/api/import', full, 200);
  await status('POST', '/api/notes', { title: 'Over limit', body: '' }, 413);
  assert.equal((await status('GET', '/api/export', undefined, 200)).notes.length, 100);
  await status('POST', '/api/import', saved, 200);
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(dataDir)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(path.join(dataDir, 'notes.json'))).mode & 0o777, 0o600);
    const original = path.join(dataDir, 'notes.json');
    const moved = path.join(dataDir, 'saved.json');
    const target = path.join(root, 'target.txt');
    await fs.writeFile(target, 'untouched'); await fs.rename(original, moved); await fs.symlink(target, original);
    await status('POST', '/api/notes', { title: 'Blocked', body: '' }, 500);
    assert.equal(await fs.readFile(target, 'utf8'), 'untouched');
    assert.deepEqual(await status('GET', '/api/export', undefined, 200), saved);
    assert.equal((await fs.readdir(dataDir)).filter(n => n.endsWith('.tmp')).length, 0);
    await fs.unlink(original); await fs.rename(moved, original);
    const link = path.join(root, 'linked-dir'); await fs.symlink(dataDir, link);
    await assert.rejects(startServer({ dataDir: link, token }));
    await fs.rename(original, moved); await fs.symlink(target, original);
    await assert.rejects(startServer({ dataDir, token }));
    await fs.unlink(original); await fs.rename(moved, original);
  }
  const home = await request('GET', '/');
  assert.equal(home.status, 200); assert.match(home.headers['content-type'], /^text\/html/);
  assert.match(home.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(home.headers['x-content-type-options'], 'nosniff');
  assert.ok(!home.data.includes(token));
  await status('GET', '/%2e%2e/server.mjs', undefined, 404);
  await status('GET', '/server.mjs', undefined, 404);
  await server.close(); server = await startServer({ dataDir, token });
  assert.deepEqual(await status('GET', '/api/export', undefined, 200), saved);
  await server.close(); server = null;
  await fs.writeFile(path.join(dataDir, 'notes.json'), '{broken');
  await assert.rejects(startServer({ dataDir, token }));
  assert.equal(await fs.readFile(path.join(dataDir, 'notes.json'), 'utf8'), '{broken');
  console.log('All Local Notes HTTP, validation, concurrency, security, and persistence tests passed.');
} finally {
  if (server) await server.close();
  await fs.rm(root, { recursive: true, force: true });
}
