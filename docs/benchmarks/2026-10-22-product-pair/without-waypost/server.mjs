import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMIT = 262144;
const TOKEN = /^[a-fA-F0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']]
]);
class Failure extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function fail(status, message) { throw new Failure(status, message); }
function exact(object, keys) {
  return object !== null && typeof object === 'object' && !Array.isArray(object) &&
    Object.keys(object).length === keys.length && keys.every(k => Object.hasOwn(object, k));
}
function title(value, importing = false) {
  if (typeof value !== 'string') fail(400, 'Title must be a string.');
  const trimmed = value.trim();
  if (!trimmed.length || trimmed.length > 120 || (importing && trimmed !== value))
    fail(400, 'Title must be trimmed and contain 1 to 120 characters.');
  return trimmed;
}
function body(value) {
  if (typeof value !== 'string' || value.length > 4000) fail(400, 'Body must be a string of at most 4000 characters.');
  return value;
}
function timestamp(value) {
  if (typeof value !== 'string') return false;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) && d.toISOString() === value;
}
function stateSize(store) {
  if (store.notes.length > 100 || Buffer.byteLength(JSON.stringify(store), 'utf8') > LIMIT)
    fail(413, 'The collection exceeds its storage limit.');
  return store;
}
function backup(value) {
  if (!exact(value, ['version', 'notes']) || value.version !== 1 || !Array.isArray(value.notes))
    fail(400, 'Invalid backup schema.');
  if (value.notes.length > 100) fail(413, 'The collection exceeds 100 notes.');
  const seen = new Set();
  const notes = value.notes.map(n => {
    if (!exact(n, ['id', 'title', 'body', 'createdAt', 'updatedAt']) || typeof n.id !== 'string' ||
      !UUID.test(n.id) || seen.has(n.id) || !timestamp(n.createdAt) || !timestamp(n.updatedAt) ||
      new Date(n.updatedAt).getTime() < new Date(n.createdAt).getTime()) fail(400, 'Invalid note record.');
    seen.add(n.id);
    return { id: n.id, title: title(n.title, true), body: body(n.body), createdAt: n.createdAt, updatedAt: n.updatedAt };
  });
  return stateSize({ version: 1, notes });
}
async function regularFileOrMissing(filename) {
  try {
    const info = await fs.lstat(filename);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Unsafe data file');
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
function readBody(req) {
  const media = req.headers['content-type'];
  if (typeof media !== 'string' || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(media)) {
    req.resume();
    return Promise.reject(new Failure(415, 'Use application/json with UTF-8 encoding.'));
  }
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [], finished = false;
    const rejectOnce = error => { if (!finished) { finished = true; chunks = []; reject(error); } };
    req.on('data', chunk => {
      if (finished) return;
      size += chunk.length;
      if (size > LIMIT) { rejectOnce(new Failure(413, 'Request body is too large.')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (finished) return;
      finished = true;
      try {
        const source = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
        resolve(JSON.parse(source));
      } catch { reject(new Failure(400, 'Invalid UTF-8 JSON.')); }
    });
    req.on('error', () => rejectOnce(new Failure(400, 'Unable to read request body.')));
    req.on('aborted', () => rejectOnce(new Failure(400, 'Incomplete request body.')));
  });
}
function headers(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
}
function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

export async function startServer({ dataDir, port = 0, token } = {}) {
  if (typeof dataDir !== 'string' || !dataDir.length) throw new Error('A data directory is required.');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535.');
  if (token === undefined) token = randomBytes(32).toString('hex');
  if (typeof token !== 'string' || !TOKEN.test(token)) throw new Error('Token must contain exactly 64 hexadecimal characters.');
  const secret = Buffer.from(token, 'utf8');
  const directory = path.resolve(dataDir);
  try {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await fs.lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Unsafe directory');
  } catch { throw new Error('Cannot use the data directory. It must be a real, accessible directory.'); }
  const filename = path.join(directory, 'notes.json');
  let state;
  try {
    await regularFileOrMissing(filename);
    try {
      const bytes = await fs.readFile(filename);
      if (bytes.length > LIMIT) throw new Error('Oversize data');
      state = backup(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      state = { version: 1, notes: [] };
    }
  } catch { throw new Error('Cannot load notes: the data file is unsafe, unreadable, or invalid. No data was reset.'); }

  async function persist(next) {
    stateSize(next);
    const temporary = path.join(directory, `.notes-${randomUUID()}.tmp`);
    let owned = false;
    try {
      await regularFileOrMissing(filename);
      const handle = await fs.open(temporary, 'wx', 0o600);
      owned = true;
      try { await handle.writeFile(JSON.stringify(next), 'utf8'); } finally { await handle.close(); }
      await regularFileOrMissing(filename);
      await fs.rename(temporary, filename);
      owned = false;
    } finally {
      if (owned) await fs.unlink(temporary).catch(() => {});
    }
  }
  // The initial empty store is persisted before opening a listener.
  try {
    try { await fs.lstat(filename); } catch (e) { if (e.code === 'ENOENT') await persist(state); else throw e; }
  } catch { throw new Error('Cannot initialize notes storage. No existing data was reset.'); }
  let queue = Promise.resolve();
  function mutate(operation) {
    const result = queue.then(async () => {
      const { next, result } = operation(state);
      await persist(next);
      state = next;
      return result;
    });
    queue = result.catch(() => {});
    return result;
  }
  let url;
  const server = http.createServer(async (req, res) => {
    headers(res);
    try {
      if (req.headers.host !== new URL(url).host) fail(403, 'Host is not allowed.');
      const raw = req.url || '';
      const rawPath = raw.split('?')[0];
      const api = rawPath === '/api' || rawPath.startsWith('/api/');
      if (!api) {
        const asset = assets.get(raw);
        if (!asset) fail(404, 'Resource not found.');
        if (req.method !== 'GET') fail(405, 'Method not allowed.');
        const content = await fs.readFile(new URL(`./public/${asset[0]}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store' });
        res.end(content);
        return;
      }
      const provided = req.headers['x-local-token'];
      if (typeof provided !== 'string' || !TOKEN.test(provided)) fail(401, 'A valid local token is required. Open the printed local URL.');
      const candidate = Buffer.from(provided, 'utf8');
      if (candidate.length !== secret.length || !timingSafeEqual(candidate, secret)) fail(401, 'A valid local token is required. Open the printed local URL.');
      const origin = req.headers.origin;
      if ((origin !== undefined && origin !== url) || (['POST', 'PATCH', 'DELETE'].includes(req.method) && origin !== url))
        fail(403, 'Origin is not allowed.');
      const parsed = new URL(raw, url);
      const item = /^\/api\/notes\/([0-9a-f-]+)$/.exec(rawPath);
      const collection = rawPath === '/api/notes';
      const exporting = rawPath === '/api/export';
      const importing = rawPath === '/api/import';
      if (!collection && !exporting && !importing && !item) fail(404, 'Resource not found.');
      if (item && !UUID.test(item[1])) fail(404, 'Note not found.');
      const methods = collection ? ['GET', 'POST'] : exporting ? ['GET'] : importing ? ['POST'] : ['GET', 'PATCH', 'DELETE'];
      if (!methods.includes(req.method)) { res.setHeader('Allow', methods.join(', ')); fail(405, 'Method not allowed.'); }
      const params = [...parsed.searchParams];
      if (collection && req.method === 'GET') {
        if (params.length > 1 || (params.length === 1 && (params[0][0] !== 'q' || params[0][1].length > 200))) fail(400, 'Use at most one q parameter of at most 200 characters.');
      } else if (params.length) fail(400, 'Query parameters are not supported here.');
      const hasBody = req.headers['transfer-encoding'] !== undefined || (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0');
      let input;
      if (req.method === 'POST' || req.method === 'PATCH' || hasBody) input = await readBody(req);
      if (collection && req.method === 'GET') {
        const q = (parsed.searchParams.get('q') || '').toLowerCase();
        const notes = state.notes.filter(n => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)).slice();
        // Canonical ISO strings may use signed six-digit years; compare instants.
        notes.sort((a, b) => {
          const timeDifference = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
          return timeDifference || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        });
        json(res, 200, { notes, total: notes.length }); return;
      }
      if (exporting) { json(res, 200, state); return; }
      if (importing) {
        const validated = backup(input);
        const result = await mutate(() => ({ next: validated, result: { imported: validated.notes.length } }));
        json(res, 200, result); return;
      }
      if (collection) {
        if (!exact(input, ['title', 'body'])) fail(400, 'Supply exactly title and body.');
        const fields = { title: title(input.title), body: body(input.body) };
        const result = await mutate(current => {
          const now = new Date().toISOString();
          const note = { id: randomUUID(), ...fields, createdAt: now, updatedAt: now };
          return { next: stateSize({ version: 1, notes: [...current.notes, note] }), result: { note } };
        });
        json(res, 201, result); return;
      }
      const id = item[1];
      if (req.method === 'GET') {
        const note = state.notes.find(n => n.id === id);
        if (!note) fail(404, 'Note not found.');
        json(res, 200, { note }); return;
      }
      let changes;
      if (req.method === 'PATCH') {
        if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length || Object.keys(input).some(k => k !== 'title' && k !== 'body')) fail(400, 'Supply title, body, or both.');
        changes = {};
        if (Object.hasOwn(input, 'title')) changes.title = title(input.title);
        if (Object.hasOwn(input, 'body')) changes.body = body(input.body);
      }
      const result = await mutate(current => {
        const old = current.notes.find(n => n.id === id);
        if (!old) fail(404, 'Note not found.');
        if (req.method === 'DELETE') return { next: { version: 1, notes: current.notes.filter(n => n.id !== id) }, result: { deleted: id } };
        const now = new Date().toISOString();
        const note = { ...old, ...changes, updatedAt: new Date(Math.max(Date.parse(now), Date.parse(old.updatedAt))).toISOString() };
        return { next: stateSize({ version: 1, notes: current.notes.map(n => n.id === id ? note : n) }), result: { note } };
      });
      json(res, 200, result);
    } catch (error) {
      req.resume();
      if (!res.headersSent && !res.destroyed) json(res, error instanceof Failure ? error.status : 500,
        { error: error instanceof Failure ? error.message : 'Unable to complete the request. Your previous saved notes remain available.' });
      else if (!res.writableEnded) res.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  url = `http://127.0.0.1:${server.address().port}`;
  let closing;
  function close() {
    if (!closing) closing = (async () => {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
      await queue;
    })();
    return closing;
  }
  return { url, close };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let dataDir = './data', port = 3000;
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
      const key = args[i], value = args[++i];
      if (key === '--data-dir' && value) dataDir = value;
      else if (key === '--port' && value !== undefined && /^\d+$/.test(value)) port = Number(value);
      else throw new Error('Usage: npm start -- --data-dir <directory> --port <0-65535>');
    }
    const token = randomBytes(32).toString('hex');
    const running = await startServer({ dataDir, port, token });
    console.log(`Local Notes: ${running.url}/#token=${token}`);
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      running.close().then(() => { process.exitCode = 0; }, () => { console.error('Unable to finish shutdown.'); process.exitCode = 1; });
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } catch (error) {
    const message = error.code === 'EADDRINUSE' ? 'Port is already in use. Choose another --port.' :
      error.code === 'EACCES' ? 'Permission denied. Choose an accessible directory and port.' :
      error.message?.startsWith('Usage:') || error.message?.startsWith('Port must') || error.message?.startsWith('Cannot ') ? error.message : 'Unable to start Local Notes. Check the data directory and port.';
    console.error(message);
    process.exitCode = 1;
  }
}
