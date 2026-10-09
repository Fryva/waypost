import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNativeEndpoint, validateNativeDescriptor } from '../scripts/team-transport.mjs';
import { CODEX_SURFACE_R1, PROBED_CATALOGS } from '../scripts/codex-surface.mjs';
import { createHash } from 'node:crypto';

// Surface codex-no-exec-r1 against a fake app-server: readback, guard, output.
// HOME is a scratch directory, so the pinned catalog never lands in the real home.
const scratchHome = realpathSync(mkdtempSync(join(tmpdir(), 'waypost-codex-home-'))); process.env.HOME = scratchHome;
test.after(() => rmSync(scratchHome, { recursive: true, force: true }));
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'waypost-codex-surface-'))); t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home'), cwd = join(root, 'cwd'), pkg = join(root, 'pkg');
  for (const dir of [home, cwd, join(pkg, 'bin')]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(pkg, 'bin', 'codex'), '#!/bin/sh\n'); writeFileSync(join(home, 'config.toml', ), ''); writeFileSync(join(home, 'AGENTS.md'), 'user rules\n');
  // The user's cached catalog entry still switches tools on; Waypost pins a stripped copy.
  writeFileSync(join(home, CODEX_SURFACE_R1.catalog_cache), JSON.stringify({ models: [{ slug: 'gpt-6.1-sol', tool_mode: 'code_mode_only', multi_agent_version: 'v2', shell_type: 'unified_exec', experimental_supported_tools: ['clock'], supports_search_tool: true, node_repl_disabled: false }] }));
  return { root, home, cwd, executable: join(pkg, 'bin', 'codex'), descriptor: { harness: 'codex', managed: true, mode: 'read-only', cwd, executable: join(pkg, 'bin', 'codex'), codex_home: home, tool_surface: CODEX_SURFACE_R1.id, model_id: 'gpt-6.1-sol', reasoning: 'low' } };
}
function server(f, { patch = {}, turn = emitAnswer, skills = [{ name: 'imagegen', enabled: false }], probed = true } = {}) {
  const calls = { spawn: null, spawns: [], requests: [] };
  const spawnProcess = (exe, args, opts) => {
    calls.spawn = { exe, args, opts }; calls.spawns.push(args);
    const catalog = JSON.parse(args.find(a => a.startsWith('model_catalog_json=')).slice('model_catalog_json='.length)), skillFlag = args.find(a => a.startsWith('skills.config='));
    // The fixture's pinned catalog stands in for a probed one.
    if (probed) PROBED_CATALOGS.add(createHash('sha256').update(readFileSync(catalog)).digest('hex'));
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const emit = m => child.stdout.write(JSON.stringify(m) + '\n');
    const results = {
      initialize: { userAgent: 'waypost/' + CODEX_SURFACE_R1.version + ' (fixture)', codexHome: f.home },
      'thread/start': { thread: { id: 'owned', sessionId: 'owned', cwd: f.cwd, ephemeral: true, turns: [], forkedFromId: null }, model: 'gpt-6.1-sol', modelProvider: 'openai', reasoningEffort: 'low', sandbox: { type: 'readOnly', networkAccess: false }, approvalPolicy: 'never', instructionSources: [join(f.home, 'AGENTS.md')] },
      'config/read': { config: { model_catalog_json: catalog, ...CODEX_SURFACE_R1.config_expect, features: Object.fromEntries(CODEX_SURFACE_R1.features_off.map(k => [k, false])) }, layers: [{ name: { type: 'sessionFlags' } }, { name: { type: 'user', file: join(f.home, 'config.toml') } }, { name: { type: 'system', file: join(f.root, 'absent', 'config.toml') } }] },
      'experimentalFeature/list': { data: [{ name: 'unified_exec', stage: 'stable', enabled: true }, { name: 'shell_tool', stage: 'stable', enabled: false }], nextCursor: null },
      'skills/list': { data: [{ cwd: f.cwd, skills: skills.map(k => ({ ...k, enabled: skillFlag?.includes(JSON.stringify(k.name)) ? false : k.enabled })) }] },
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
  assert.deepEqual(Object.keys(s.calls.spawn.opts.env).sort(), ['CODEX_HOME', 'HOME', 'PATH']); assert.equal(s.calls.spawn.opts.env.CODEX_HOME, f.home); assert.equal(s.calls.spawn.opts.env.HOME, scratchHome);
  assert.ok(s.calls.spawn.args.includes('features.shell_tool=false')); assert.ok(s.calls.spawn.args.includes('tools.update_plan.enabled=false'));
  const init = s.calls.requests.find(m => m.method === 'initialize'), start = s.calls.requests.find(m => m.method === 'thread/start');
  assert.equal(init.params.capabilities.experimentalApi, true); assert.equal(start.params.experimentalRawEvents, true);
  assert.equal((await endpoint.inspectContext()).verified, true);
  const r = await send(endpoint), m = r.context_manifest;
  assert.equal(r.output, '{"ok":true}'); assert.deepEqual(m.tools, []); assert.equal(m.tool_surface, CODEX_SURFACE_R1.id); assert.equal(m.provenance, 'adapter-isolated');
  assert.equal(m.surface_evidence.version, CODEX_SURFACE_R1.version); assert.match(m.surface_evidence.package_digest, /^[a-f0-9]{64}$/); assert.match(m.surface_evidence.catalog_digest, /^[a-f0-9]{64}$/); assert.match(m.surface_evidence.instructions_digest, /^[a-f0-9]{64}$/);
  // The pinned catalog is the user's entry without the tool-bearing keys, written under ~/.waypost.
  const path = JSON.parse(s.calls.spawn.args.find(a => a.startsWith('model_catalog_json=')).slice(19)), pinned = JSON.parse(readFileSync(path, 'utf8')).models[0];
  assert.ok(path.startsWith(join(scratchHome, '.waypost'))); assert.equal(pinned.tool_mode, undefined); assert.equal(pinned.shell_type, 'disabled'); assert.deepEqual(pinned.experimental_supported_tools, []);
  endpoint.close();
});

test('the user\'s enabled skills are switched off by session flag after one discovery launch', async t => {
  const f = fixture(t), s = server(f, { skills: [{ name: 'apple-design', enabled: true }, { name: 'imagegen', enabled: false }] }), endpoint = await createNativeEndpoint(f.descriptor, { spawnProcess: s.spawnProcess });
  assert.equal(s.calls.spawns.length, 2); assert.ok(s.calls.spawns[1].includes('skills.config=[{name="apple-design",enabled=false}]'));
  assert.equal((await endpoint.inspectContext()).verified, true); endpoint.close();
});

for (const [name, patch, blocker] of [
  ['another version', { initialize: r => ({ ...r, userAgent: 'waypost/0.160.0 (fixture)' }) }, 'native-surface-version-unverified'],
  ['a foreign home', { initialize: r => ({ ...r, codexHome: '/' }) }, 'native-surface-home-unverified'],
  ['a project instruction file', { 'thread/start': r => ({ ...r, instructionSources: ['/x/AGENTS.md'] }) }, 'native-surface-instructions-present'],
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
  const f = fixture(t), s = server(f, { patch: { 'config/read': r => { const other = join(f.root, 'other-catalog.json'); writeFileSync(other, JSON.stringify({ models: [{ slug: 'gpt-6.1-sol', ...CODEX_SURFACE_R1.catalog.values, tool_mode: 'code_mode_only' }] })); return { ...r, config: { model_catalog_json: other } }; } } }), endpoint = await createNativeEndpoint(f.descriptor, { spawnProcess: s.spawnProcess });
  assert.equal((await endpoint.inspectContext()).blocker, 'native-surface-catalog-unpinned'); endpoint.close();
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

test('a tool surface needs Codex with an absolute executable and a model; the home defaults to the user\'s', () => {
  const cwd = realpathSync(tmpdir()), base = { harness: 'codex', managed: true, cwd, executable: '/opt/codex/bin/codex', model_id: 'gpt-6.1-sol', tool_surface: CODEX_SURFACE_R1.id };
  assert.doesNotThrow(() => validateNativeDescriptor(base)); assert.doesNotThrow(() => validateNativeDescriptor({ ...base, codex_home: '/opt/home' }));
  for (const bad of [{ ...base, codex_home: 'relative' }, { ...base, executable: undefined }, { ...base, model_id: undefined }, { ...base, tool_surface: 'none' }, { ...base, harness: 'claude' }, { harness: 'codex', managed: true, cwd, codex_home: '/opt/home' }])
    assert.throws(() => validateNativeDescriptor(bad), /tool-surface|descriptor|executable/);
});

test('the native profile binds the surface into the configuration identity and refuses an unproven one', async () => {
  const { collectNativeModelProfile } = await import('../scripts/native-model-profile.mjs');
  const at = new Date().toISOString(), hash = 'a'.repeat(64);
  const p = { id: 'peer', incarnation: 'incarnation', model: { model_revision: 1, resolved: false }, availability: 'ready', revoked: false, native_binding: { collector_id: 'native', descriptor_digest: hash } };
  const base = { id: 'b'.repeat(64), native_id: 'native-session', harness: 'codex', cwd: '/fixture', version: 'unknown', version_provenance: 'unknown', provenance: 'adapter-isolated', read_only: true, fresh: true, fresh_review_verified: true, author_history_inherited: false, author_contexts: [], tools: [], isolation: 'read-only' };
  const evidence = { surface: CODEX_SURFACE_R1.id, definition_digest: 'd'.repeat(64), version: CODEX_SURFACE_R1.version, package_digest: 'e'.repeat(64), catalog_digest: 'f'.repeat(64), config_digest: '1'.repeat(64), instructions_digest: '2'.repeat(64), guard: { window: 'turn-plus-drain', drain_ms: 1000 } };
  const collect = manifest => collectNativeModelProfile({ participant: p, adapter_revision: 'native-profile-v1', requested_configuration: { reasoning: 'low' }, execution_environment: { platform: 'fixture' }, now: () => Date.parse(at),
    observe: async () => ({ native_id: manifest.native_id, invocation_id: 'probe', output: 'token', observed_at: at, actualModel: { provider: 'openai', model_id: 'gpt-6.1-sol', reasoning: 'low', observed_at: at }, context_manifest: manifest, correlation: { participant: p.id, incarnation: p.incarnation, model_revision: 1, native_id: manifest.native_id, context_id: manifest.id, nonce: 'token', invocation_id: 'probe' } }) });
  const plain = await collect(base), surfaced = await collect({ ...base, tool_surface: CODEX_SURFACE_R1.id, surface_evidence: evidence });
  assert.equal(plain.profile.execution_scope.tool_surface, undefined);
  assert.equal(surfaced.profile.execution_scope.tool_surface, CODEX_SURFACE_R1.id); assert.equal(surfaced.profile.execution_scope.surface.package_digest, 'e'.repeat(64));
  assert.notEqual(surfaced.profile_id, plain.profile_id);
  for (const bad of [{ ...evidence, guard: { blocker: 'native-surface-raw-tool-call' } }, { ...evidence, catalog_digest: 'x' }])
    await assert.rejects(collect({ ...base, tool_surface: CODEX_SURFACE_R1.id, surface_evidence: bad }), /verified-tool-surface-required/);
  await assert.rejects(collect({ ...base, tool_surface: CODEX_SURFACE_R1.id }), /verified-tool-surface-required/);
});

test('plugin-contributed skills, MCP servers and plugins do not change the bound config digest', async t => {
  const digestWith = async extra => {
    const f = fixture(t), s = server(f, { patch: { 'config/read': r => ({ ...r, config: { ...r.config, ...extra } }) } }), endpoint = await createNativeEndpoint(f.descriptor, { spawnProcess: s.spawnProcess });
    const m = (await send(endpoint)).context_manifest; endpoint.close(); return m.surface_evidence.config_digest;
  };
  const base = await digestWith({});
  assert.equal(await digestWith({ skills: { config: [{ name: 'x', enabled: false }] }, mcp_servers: { a: { enabled: false } }, plugins: { p: { enabled: false } } }), base);
  assert.notEqual(await digestWith({ model: 'another' }), base);
});

for (const [name, options, blocker] of [
  ['an unprobed catalog', { probed: false }, 'native-surface-catalog-unprobed'],
  ['web search left on', { patch: { 'config/read': r => ({ ...r, config: { ...r.config, web_search: 'live' } }) } }, 'native-surface-config-unverified'],
  ['a tool feature left on', { patch: { 'config/read': r => ({ ...r, config: { ...r.config, features: { ...r.config.features, shell_tool: true } } }) } }, 'native-surface-config-unverified'],
]) test('a Codex surface with ' + name + ' stays unverified', async t => {
  const f = fixture(t);
  // A catalog no other test has registered as probed.
  if (options.probed === false) writeFileSync(join(f.home, CODEX_SURFACE_R1.catalog_cache), JSON.stringify({ models: [{ slug: 'gpt-6.1-sol', display_name: 'unprobed ' + Math.random() }] }));
  const s = server(f, options), endpoint = await createNativeEndpoint(f.descriptor, { spawnProcess: s.spawnProcess });
  assert.equal((await endpoint.inspectContext()).blocker, blocker); endpoint.close();
});

test('a turn without a raw message item proves nothing, and an ambiguous answer is empty', async t => {
  const noRaw = emit => { emit({ method: 'turn/started', params: { threadId: 'owned' } }); emit({ method: 'item/completed', params: { threadId: 'owned', item: { type: 'agentMessage', phase: 'final_answer', text: 'x' } } }); emit({ method: 'turn/completed', params: { threadId: 'owned', turn: { id: 'turn', status: 'completed' } } }); };
  const f = fixture(t), s = server(f, { turn: noRaw }), endpoint = await createNativeEndpoint(f.descriptor, { spawnProcess: s.spawnProcess });
  const m = (await send(endpoint)).context_manifest; assert.equal(m.tools, null); assert.equal(m.surface_evidence.guard.blocker, 'native-surface-raw-events-absent'); endpoint.close();
  const twoFinals = emit => emitAnswer(emit, [{ method: 'item/completed', params: { threadId: 'owned', item: { type: 'agentMessage', phase: 'final_answer', text: 'first' } } }]);
  const g = fixture(t), s2 = server(g, { turn: twoFinals }), e2 = await createNativeEndpoint(g.descriptor, { spawnProcess: s2.spawnProcess });
  assert.equal((await send(e2)).output, ''); e2.close();
});
