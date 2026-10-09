import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNativeEndpoint, validateNativeDescriptor } from '../scripts/team-transport.mjs';
import { CODEX_SURFACE_R1 } from '../scripts/codex-surface.mjs';

// Surface codex-no-exec-r1 against a fake app-server: readback, guard, output.
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'waypost-codex-surface-'))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home'), cwd = join(root, 'cwd'), pkg = join(root, 'pkg');
  for (const dir of [home, cwd, join(pkg, 'bin')]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(pkg, 'bin', 'codex'), '#!/bin/sh\n'); writeFileSync(join(home, 'config.toml'), '');
  const entry = { slug: 'gpt-6.1-sol', ...CODEX_SURFACE_R1.catalog.values };
  writeFileSync(join(home, CODEX_SURFACE_R1.catalog_file), JSON.stringify({ models: [entry] }));
  return { root, home, cwd, executable: join(pkg, 'bin', 'codex'), descriptor: { harness: 'codex', managed: true, mode: 'read-only', cwd, executable: join(pkg, 'bin', 'codex'), codex_home: home, tool_surface: CODEX_SURFACE_R1.id, model_id: 'gpt-6.1-sol', reasoning: 'low' } };
}
function server(f, { patch = {}, turn = emitAnswer } = {}) {
  const calls = { spawn: null, requests: [] };
  const spawnProcess = (exe, args, opts) => {
    calls.spawn = { exe, args, opts };
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const emit = m => child.stdout.write(JSON.stringify(m) + '\n');
    const results = {
      initialize: { userAgent: 'waypost/' + CODEX_SURFACE_R1.version + ' (fixture)', codexHome: f.home },
      'thread/start': { thread: { id: 'owned', sessionId: 'owned', cwd: f.cwd, ephemeral: true, turns: [], forkedFromId: null }, model: 'gpt-6.1-sol', modelProvider: 'openai', reasoningEffort: 'low', sandbox: { type: 'readOnly', networkAccess: false }, approvalPolicy: 'never', instructionSources: [] },
      'config/read': { config: { model_catalog_json: join(f.home, CODEX_SURFACE_R1.catalog_file) }, layers: [{ name: { type: 'sessionFlags' } }, { name: { type: 'user', file: join(f.home, 'config.toml') } }, { name: { type: 'system', file: join(f.root, 'absent', 'config.toml') } }] },
      'experimentalFeature/list': { data: [{ name: 'unified_exec', stage: 'stable', enabled: true }, { name: 'shell_tool', stage: 'stable', enabled: false }], nextCursor: null },
      'skills/list': { data: [{ cwd: f.cwd, skills: [{ name: 'imagegen', enabled: false }] }] },
      'hooks/list': { data: [{ cwd: f.cwd, hooks: [] }] },
      'mcpServerStatus/list': { data: [], nextCursor: null },
      'app/installed': { apps: [] },
    };
    for (const [k, v] of Object.entries(patch)) results[k] = typeof v === 'function' ? v(structuredClone(results[k])) : v;
    child.stdin = { write(s) { queueMicrotask(() => { const m = JSON.parse(s); calls.requests.push(m); if (m.method === 'turn/start') { emit({ id: m.id, result: { turn: { id: 'turn' } } }); turn(emit); } else if (Object.hasOwn(m, 'id') && Object.hasOwn(results, m.method)) emit({ id: m.id, result: results[m.method] }); }); }, end() {} };
    child.kill = () => { queueMicrotask(() => child.emit('close', 0)); return true; };
    return child;
  };
  return { calls, spawnProcess };
}
function emitAnswer(emit, extra = []) {
  emit({ method: 'turn/started', params: { threadId: 'owned' } });
  for (const m of extra) emit(m);
  emit({ method: 'rawResponseItem/completed', params: { threadId: 'owned', item: { type: 'message' } } });
  emit({ method: 'item/completed', params: { threadId: 'owned', item: { type: 'agentMessage', phase: 'commentary', text: 'Looking. ' } } });
  emit({ method: 'item/completed', params: { threadId: 'owned', item: { type: 'agentMessage', phase: 'final_answer', text: '{"ok":true}' } } });
  emit({ method: 'turn/completed', params: { threadId: 'owned', turn: { id: 'turn', status: 'completed' } } });
}
const send = endpoint => endpoint.send('prompt', { id: 'nonce', purpose: 'calibration', read_only: true, max_output_chars: 8192 });

test('a verified Codex surface runs sanitized, reads its setup back and answers with the final message only', async t => {
  const f = fixture(t), s = server(f), endpoint = await createNativeEndpoint(f.descriptor, { spawnProcess: s.spawnProcess });
  assert.deepEqual(Object.keys(s.calls.spawn.opts.env).sort(), ['CODEX_HOME', 'HOME', 'PATH']); assert.equal(s.calls.spawn.opts.env.CODEX_HOME, f.home);
  assert.ok(s.calls.spawn.args.includes('features.shell_tool=false')); assert.ok(s.calls.spawn.args.includes('tools.update_plan.enabled=false'));
  const init = s.calls.requests.find(m => m.method === 'initialize'), start = s.calls.requests.find(m => m.method === 'thread/start');
  assert.equal(init.params.capabilities.experimentalApi, true); assert.equal(start.params.experimentalRawEvents, true);
  assert.equal((await endpoint.inspectContext()).verified, true);
  const r = await send(endpoint), m = r.context_manifest;
  assert.equal(r.output, '{"ok":true}'); assert.deepEqual(m.tools, []); assert.equal(m.tool_surface, CODEX_SURFACE_R1.id); assert.equal(m.provenance, 'adapter-isolated');
  assert.equal(m.surface_evidence.version, CODEX_SURFACE_R1.version); assert.match(m.surface_evidence.package_digest, /^[a-f0-9]{64}$/); assert.match(m.surface_evidence.catalog_digest, /^[a-f0-9]{64}$/);
  endpoint.close();
});

for (const [name, patch, blocker] of [
  ['another version', { initialize: r => ({ ...r, userAgent: 'waypost/0.160.0 (fixture)' }) }, 'native-surface-version-unverified'],
  ['a foreign home', { initialize: r => ({ ...r, codexHome: '/' }) }, 'native-surface-home-unverified'],
  ['instruction sources', { 'thread/start': r => ({ ...r, instructionSources: ['/x/AGENTS.md'] }) }, 'native-surface-instructions-present'],
  ['a project config layer', { 'config/read': r => ({ ...r, layers: [...r.layers, { name: { type: 'project', file: '/x/.codex/config.toml' } }] }) }, 'native-surface-config-layers-unverified'],
  ['an unpinned catalog', { 'config/read': r => ({ ...r, config: {} }) }, 'native-surface-catalog-unpinned'],
  ['an unexpected feature', { 'experimentalFeature/list': r => ({ ...r, data: [...r.data, { name: 'shell_tool', stage: 'stable', enabled: true }] }) }, 'native-surface-features-unverified'],
  ['an enabled skill', { 'skills/list': r => ({ data: [{ cwd: '/', skills: [{ name: 'imagegen', enabled: true }] }] }) }, 'native-surface-skills-enabled'],
  ['a hook', { 'hooks/list': () => ({ data: [{ cwd: '/', hooks: [{ id: 'h' }] }] }) }, 'native-surface-hooks-present'],
]) test('a Codex surface with ' + name + ' stays unverified and its receipt claims no tool surface', async t => {
  const f = fixture(t), s = server(f, { patch }), endpoint = await createNativeEndpoint(f.descriptor, { spawnProcess: s.spawnProcess });
  const pre = await endpoint.inspectContext(); assert.equal(pre.verified, false); assert.equal(pre.blocker, blocker);
  const m = (await send(endpoint)).context_manifest; assert.equal(m.tools, null); assert.equal(m.provenance, 'unverified'); endpoint.close();
});

test('a catalog that still switches tools on is refused', async t => {
  const f = fixture(t); writeFileSync(join(f.home, CODEX_SURFACE_R1.catalog_file), JSON.stringify({ models: [{ slug: 'gpt-6.1-sol', ...CODEX_SURFACE_R1.catalog.values, tool_mode: 'code_mode_only' }] }));
  const s = server(f), endpoint = await createNativeEndpoint(f.descriptor, { spawnProcess: s.spawnProcess });
  assert.equal((await endpoint.inspectContext()).blocker, 'native-surface-catalog-tools-present'); endpoint.close();
});

for (const [name, frame, blocker] of [
  ['a raw function call', { method: 'rawResponseItem/completed', params: { threadId: 'owned', item: { type: 'function_call', name: 'spawn_agent' } } }, 'native-surface-raw-tool-call'],
  ['a raw custom tool call', { method: 'rawResponseItem/completed', params: { threadId: 'owned', item: { type: 'custom_tool_call', name: 'exec' } } }, 'native-surface-raw-tool-call'],
  ['a plan update', { method: 'turn/plan/updated', params: { threadId: 'owned', plan: [] } }, 'native-surface-frame-turn/plan/updated'],
  ['a command item', { method: 'item/started', params: { threadId: 'owned', item: { type: 'commandExecution' } } }, 'native-surface-tool-item'],
  ['an async message', { method: 'item/completed', params: { threadId: 'owned', item: { type: 'agentMessage', delivery: 'async', text: 'x' } } }, 'native-surface-tool-item'],
  ['a foreign thread', { method: 'item/started', params: { threadId: 'sub-agent', item: { type: 'agentMessage' } } }, 'native-surface-foreign-thread'],
  ['a server request', { id: 900, method: 'item/tool/call', params: { threadId: 'owned' } }, 'native-surface-server-request'],
]) test('the frame guard withdraws isolation for ' + name, async t => {
  const f = fixture(t), s = server(f, { turn: emit => emitAnswer(emit, [frame]) }), endpoint = await createNativeEndpoint(f.descriptor, { spawnProcess: s.spawnProcess });
  const m = (await send(endpoint)).context_manifest;
  assert.equal(m.tools, null); assert.equal(m.provenance, 'unverified'); assert.equal(m.surface_evidence.guard.blocker, blocker); endpoint.close();
});

test('a tool surface needs Codex with an owned executable and home', () => {
  const cwd = realpathSync(tmpdir()), base = { harness: 'codex', managed: true, cwd, executable: '/opt/codex/bin/codex', codex_home: '/opt/home', tool_surface: CODEX_SURFACE_R1.id };
  assert.doesNotThrow(() => validateNativeDescriptor(base));
  for (const bad of [{ ...base, codex_home: undefined }, { ...base, executable: undefined }, { ...base, tool_surface: 'none' }, { ...base, harness: 'claude' }, { harness: 'codex', managed: true, cwd, codex_home: '/opt/home' }])
    assert.throws(() => validateNativeDescriptor(bad), /tool-surface|descriptor|executable/);
});
