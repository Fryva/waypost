#!/usr/bin/env node
// Preview only: config discovery never proves native conversation identity.
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { harness } from './agents.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const TEAM = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const pathValue = v => typeof v === 'string' && v.length <= 4096 && isAbsolute(v) && !/[\x00-\x1f\x7f]/.test(v) && !/\$\{|\{(?:env|file):/.test(v);
const fail = code => { throw new Error(code); };
export function renderMcpConfig({ entry, project, team, credential, name, node = process.execPath }) {
  if (!pathValue(project) || !pathValue(credential) || !pathValue(node)) fail('absolute-clean-paths-required');
  if (!TEAM.test(team || '') || !ID.test(name || '')) fail('safe-team-and-server-name-required');
  const m = entry?.mcp;
  if (!m) fail('harness-mcp-config-unsupported');
  if (!['json-mcp-servers','toml-mcp-servers','json-local-mcp'].includes(m.format) || !['documented','verified'].includes(m.confidence) || typeof m.docs !== 'string' || !/^https:\/\//.test(m.docs)) fail('invalid-harness-mcp-metadata');
  if (typeof m.project_file !== 'string' || !m.project_file || isAbsolute(m.project_file) || /[\\\x00-\x1f\x7f:]/.test(m.project_file) || m.project_file.split('/').some(p => !p || p === '..' || p === '.')) fail('unsafe-project-config-target');
  const script = fileURLToPath(new URL('./team-mcp.mjs', import.meta.url));
  // Harness config interpolation is separate from shell escaping.
  if (!pathValue(script)) fail('absolute-clean-paths-required');
  const execution = { command: node, args: [script, '--project', resolve(project), '--team', team, '--credential', resolve(credential)] };
  let snippet;
  if (m.format === 'json-mcp-servers') snippet = JSON.stringify({ mcpServers: { [name]: execution } }, null, 2) + '\n';
  else if (m.format === 'json-local-mcp') snippet = JSON.stringify({ mcp: { [name]: { type: 'local', command: [execution.command, ...execution.args], enabled: true } } }, null, 2) + '\n';
  else snippet = `[mcp_servers.${JSON.stringify(name)}]\ncommand = ${JSON.stringify(execution.command)}\nargs = [${execution.args.map(a => JSON.stringify(a)).join(', ')}]\n`;
  return { protocol: 1, preview_only: true, harness: entry.id, name, target: { scope: 'project', file: resolve(project, m.project_file), format: m.format }, execution, snippet,
    capabilities: { cooperative_tools: ['waypost_inbox','waypost_send','waypost_ack'], native_binding: 'unverified', inspect_model: 'unverified', wake: 'unverified', protected_review: 'unverified' }, docs: m.docs,
    limitations: ['Merge the snippet into existing settings; never replace the whole file blindly.', 'One credential exposed to several chats identifies a shared credential holder, not independent native sessions.', 'Project trust, tool approval and server discovery belong to the harness. No approval policy is changed.', 'No credential, existing config, authority or native conversation was read. Nothing was written.'] };
}
export function parseMcpConfigArgs(argv) {
  const allowed = new Set(['--harness','--project','--team','--credential','--name']), result = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1];
    if (!allowed.has(key) || Object.hasOwn(result, key.slice(2)) || typeof value !== 'string' || !value || value.startsWith('--')) fail('invalid-mcp-config-arguments');
    result[key.slice(2)] = value;
  }
  if (Object.keys(result).length !== allowed.size) fail('invalid-mcp-config-arguments');
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseMcpConfigArgs(process.argv.slice(2));
    if (!pathValue(options.project)) fail('absolute-clean-paths-required');
    process.env.WAYPOST_PROJECT_DIR = options.project;
    process.stdout.write(JSON.stringify(renderMcpConfig({ ...options, entry: harness(options.harness) }), null, 2) + '\n');
  } catch { process.stderr.write('waypost MCP config: invalid or unsupported preview request\n'); process.exitCode = 1; }
}
