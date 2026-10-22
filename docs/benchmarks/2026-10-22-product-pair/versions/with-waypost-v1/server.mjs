import http from 'node:http';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const LIMIT = 262144;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^[0-9a-fA-F]{64}$/;
class Failure extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function fail(status, message) { throw new Failure(status, message); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keys(value, expected) {
  return object(value) && Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
}
function timestamp(value) {
  if (typeof value !== 'string') return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}
function title(value, exact = false) {
  if (typeof value !== 'string') fail(400, 'Title must be a string.');
  const trimmed = value.trim();
  if (!trimmed.length || trimmed.length > 120 || (exact && value !== trimmed)) fail(400, 'Title must contain 1 to 120 trimmed characters.');
  return trimmed;
}
function body(value) {
  if (typeof value !== 'string' || value.length > 4000) fail(400, 'Body must be a string of at most 4000 characters.');
  return value;
}
function validateStore(value) {
  if (!keys(value, ['version', 'notes']) || value.version !== 1 || !Array.isArray(value.notes)) fail(400, 'Invalid backup schema.');
  if (value.notes.length > 100) fail(413, 'The collection cannot exceed 100 notes.');
  const ids = new Set();
  for (const note of value.notes) {
    if (!keys(note, ['id', 'title', 'body', 'createdAt', 'updatedAt']) || typeof note.id !== 'string' || !UUID.test(note.id) || ids.has(note.id)) fail(400, 'Invalid or duplicate note record.');
    title(note.title, true);
    body(note.body);
    if (!timestamp(note.createdAt) || !timestamp(note.updatedAt) || Date.parse(note.updatedAt) < Date.parse(note.createdAt)) fail(400, 'Invalid note timestamps.');
    ids.add(note.id);
  }
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > LIMIT) fail(413, 'The collection exceeds the storage limit.');
  return serialized;
}
function fields(value, partial = false) {
  if (!object(value)) fail(400, 'Expected a JSON object.');
  const names = Object.keys(value);
  if (partial ? !names.length || names.some(key => key !== 'title' && key !== 'body') : !keys(value, ['title', 'body'])) fail(400, 'Invalid note fields.');
  const result = {};
  if (Object.hasOwn(value, 'title')) result.title = title(value.title);
  if (Object.hasOwn(value, 'body')) result.body = body(value.body);
  return result;
}
async function statOrMissing(filename) {
  try { return await fs.lstat(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function json(res, status, value, extra = {}) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(value));
}
function readJSON(req) {
  const media = req.headers['content-type'];
  if (typeof media !== 'string' || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(media.trim())) {
    req.resume();
    return Promise.reject(new Failure(415, 'Use application/json with UTF-8 encoding.'));
  }
  if (Number(req.headers['content-length']) > LIMIT) {
    req.resume();
    return Promise.reject(new Failure(413, 'Request body is too large.'));
  }
  return new Promise((resolve, reject) => {
    let length = 0;
    let chunks = [];
    const cleanup = () => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('aborted', onAbort);
      req.removeListener('error', onError);
    };
    const stop = error => {
      cleanup();
      chunks = [];
      req.on('error', () => {});
      req.resume();
      reject(error);
    };
    const onAbort = () => stop(new Failure(400, 'Incomplete request body.'));
    const onError = () => stop(new Failure(400, 'Unable to read request body.'));
    const onData = chunk => {
      length += chunk.length;
      if (length > LIMIT) return stop(new Failure(413, 'Request body is too large.'));
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, length));
        resolve(JSON.parse(text));
      } catch { reject(new Failure(400, 'Invalid JSON or UTF-8.')); }
      chunks = [];
    };
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('aborted', onAbort);
    req.on('error', onError);
  });
}

export async function startServer({ dataDir, port = 0, token } = {}) {
  if (typeof dataDir !== 'string' || !dataDir.trim()) throw new Error('A data directory is required.');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer between 0 and 65535.');
  if (token === undefined) token = randomBytes(32).toString('hex');
  if (typeof token !== 'string' || !TOKEN.test(token)) throw new Error('Token must be exactly 64 hexadecimal characters.');
  const secret = Buffer.from(token, 'utf8');
  const directory = path.resolve(dataDir);
  const filename = path.join(directory, 'notes.json');
  let store;
  let tail = Promise.resolve();
  async function safeDirectory() {
    const info = await fs.lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Unsafe directory.');
  }
  async function safeTarget() {
    const info = await statOrMissing(filename);
    if (info && (info.isSymbolicLink() || !info.isFile())) throw new Error('Unsafe notes file.');
  }
  async function persist(next) {
    const serialized = validateStore(next);
    await safeDirectory();
    await safeTarget();
    const temporary = path.join(directory, `.notes-${randomUUID()}.tmp`);
    let owned = false;
    let handle;
    try {
      handle = await fs.open(temporary, 'wx', 0o600);
      owned = true;
      await handle.writeFile(serialized, 'utf8');
      await handle.close();
      handle = undefined;
      await safeDirectory();
      await safeTarget();
      await fs.rename(temporary, filename);
      owned = false;
    } finally {
      if (handle) await handle.close().catch(() => {});
      if (owned) await fs.unlink(temporary).catch(() => {});
    }
  }
  try {
    const existing = await statOrMissing(directory);
    if (existing && (existing.isSymbolicLink() || !existing.isDirectory())) throw new Error('Unsafe directory.');
    if (!existing) await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await safeDirectory();
    await safeTarget();
    const existingFile = await statOrMissing(filename);
    if (existingFile) {
      const bytes = await fs.readFile(filename);
      store = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      validateStore(store);
    } else {
      store = { version: 1, notes: [] };
      await persist(store);
    }
  } catch {
    throw new Error('Unable to open local notes. Check directory permissions, symlinks, and the existing backup schema; existing data was not reset.');
  }
  const assets = new Map();
  try {
    for (const [route, mime, file] of [
      ['/', 'text/html; charset=utf-8', 'index.html'],
      ['/app.js', 'text/javascript; charset=utf-8', 'app.js'],
      ['/style.css', 'text/css; charset=utf-8', 'style.css']
    ]) assets.set(route, { mime, data: await fs.readFile(new URL(`./public/${file}`, import.meta.url)) });
  } catch { throw new Error('Unable to load the application files. Restore the complete package.'); }
  function mutate(operation) {
    const result = tail.then(async () => {
      const { next, response } = operation(store);
      validateStore(next);
      await persist(next);
      store = next;
      return response;
    });
    tail = result.catch(() => {});
    return result;
  }
  let url;
  let expectedHost;
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    try {
      const hosts = req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === 'host');
      if (hosts.length !== 1 || req.headers.host !== expectedHost) fail(403, 'Host is not allowed.');
      const target = req.url || '';
      if (!target.startsWith('/') || target.startsWith('//') || target.includes('#')) fail(404, 'Resource not found.');
      const question = target.indexOf('?');
      const route = question < 0 ? target : target.slice(0, question);
      const query = question < 0 ? '' : target.slice(question + 1);
      const api = route === '/api' || route.startsWith('/api/');
      if (!api) {
        const asset = question < 0 && assets.get(route);
        if (!asset) fail(404, 'Resource not found.');
        if (req.method !== 'GET') {
          req.resume();
          return json(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET' });
        }
        req.resume();
        res.writeHead(200, { 'Content-Type': asset.mime, 'Cache-Control': 'no-store' });
        res.end(asset.data);
        return;
      }
      const supplied = req.headers['x-local-token'];
      if (typeof supplied !== 'string' || !TOKEN.test(supplied) || !timingSafeEqual(secret, Buffer.from(supplied, 'utf8'))) fail(401, 'Missing or invalid access token. Open the URL printed by the server.');
      const origin = req.headers.origin;
      const mutation = ['POST', 'PATCH', 'DELETE'].includes(req.method);
      if ((origin !== undefined && origin !== url) || (mutation && origin !== url)) fail(403, 'Origin is not allowed.');
      const item = /^\/api\/notes\/([^/]+)$/.exec(route);
      let allowed;
      if (route === '/api/notes') allowed = ['GET', 'POST'];
      else if (item) allowed = ['GET', 'PATCH', 'DELETE'];
      else if (route === '/api/export') allowed = ['GET'];
      else if (route === '/api/import') allowed = ['POST'];
      else fail(404, 'API route not found.');
      if (!allowed.includes(req.method)) {
        req.resume();
        return json(res, 405, { error: 'Method not allowed.' }, { Allow: allowed.join(', ') });
      }
      const params = new URLSearchParams(query);
      let search = '';
      if (route === '/api/notes' && req.method === 'GET') {
        if ([...params.keys()].some(key => key !== 'q') || params.getAll('q').length > 1) fail(400, 'Only one q search parameter is allowed.');
        search = params.get('q') ?? '';
        if (search.length > 200) fail(400, 'Search cannot exceed 200 characters.');
      } else if ([...params].length) fail(400, 'Query parameters are not allowed here.');
      const needsBody = req.method === 'POST' || req.method === 'PATCH';
      const hasBody = Number(req.headers['content-length']) > 0 || req.headers['transfer-encoding'] !== undefined;
      const input = needsBody || hasBody ? await readJSON(req) : undefined;
      if (route === '/api/notes' && req.method === 'GET') {
        const needle = search.toLowerCase();
        const notes = store.notes.filter(note => note.title.toLowerCase().includes(needle) || note.body.toLowerCase().includes(needle)).sort((a, b) => b.updatedAt < a.updatedAt ? -1 : b.updatedAt > a.updatedAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        return json(res, 200, { notes, total: notes.length });
      }
      if (route === '/api/export') return json(res, 200, store);
      if (route === '/api/import') {
        validateStore(input);
        const response = await mutate(() => ({ next: input, response: { imported: input.notes.length } }));
        return json(res, 200, response);
      }
      if (route === '/api/notes') {
        const values = fields(input);
        const response = await mutate(current => {
          const now = new Date().toISOString();
          const note = { id: randomUUID(), ...values, createdAt: now, updatedAt: now };
          return { next: { version: 1, notes: [...current.notes, note] }, response: { note } };
        });
        return json(res, 201, response);
      }
      const id = item[1];
      if (!UUID.test(id)) fail(404, 'Note not found.');
      if (req.method === 'GET') {
        const note = store.notes.find(note => note.id === id);
        if (!note) fail(404, 'Note not found.');
        return json(res, 200, { note });
      }
      const changes = req.method === 'PATCH' ? fields(input, true) : undefined;
      const response = await mutate(current => {
        const previous = current.notes.find(note => note.id === id);
        if (!previous) fail(404, 'Note not found.');
        if (req.method === 'DELETE') return { next: { version: 1, notes: current.notes.filter(note => note.id !== id) }, response: { deleted: id } };
        const now = new Date(Math.max(Date.now(), Date.parse(previous.createdAt), Date.parse(previous.updatedAt))).toISOString();
        const note = { ...previous, ...changes, updatedAt: now };
        return { next: { version: 1, notes: current.notes.map(value => value.id === id ? note : value) }, response: { note } };
      });
      return json(res, 200, response);
    } catch (error) {
      req.resume();
      json(res, error instanceof Failure ? error.status : 500, { error: error instanceof Failure ? error.message : 'Unable to save or process notes. Your last committed data is unchanged.' });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 100;
  await new Promise((resolve, reject) => {
    const onError = () => reject(new Error('Unable to listen on the requested local port. Check whether it is already in use.'));
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', onError);
      expectedHost = `127.0.0.1:${server.address().port}`;
      url = `http://${expectedHost}`;
      resolve();
    });
  });
  let closing;
  return {
    url,
    close() {
      if (!closing) closing = (async () => {
        await new Promise((resolve, reject) => {
          server.close(error => error ? reject(error) : resolve());
          server.closeAllConnections();
        });
        await tail;
      })();
      return closing;
    }
  };
}

async function main() {
  let dataDir = './data';
  let port = 3000;
  const args = process.argv.slice(2);
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!['--data-dir', '--port'].includes(flag) || value === undefined || seen.has(flag)) throw new Error('Usage: npm start -- --data-dir <path> --port <port>');
    seen.add(flag);
    if (flag === '--data-dir') dataDir = value;
    else {
      if (!/^\d+$/.test(value)) throw new Error('Port must be an integer between 0 and 65535.');
      port = Number(value);
    }
  }
  const token = randomBytes(32).toString('hex');
  const service = await startServer({ dataDir, port, token });
  console.log(`Local Notes: ${service.url}/#token=${token}`);
  console.log('Keep this URL private. Press Ctrl+C to stop safely.');
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try { await service.close(); } catch { console.error('Unable to complete shutdown.'); process.exitCode = 1; }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(`Local Notes could not start: ${error.message}`); process.exitCode = 1; });
}
