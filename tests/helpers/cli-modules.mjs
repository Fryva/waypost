// Actual syntax/link guards for the future CLI tree. Unlike the parse-only
// namespace guard, imports evaluate modules: use fresh children and scratch
// stores. This isolates normal stores; it is not a security sandbox.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectNamespaceFiles } from './cli-namespace.mjs';

function options(root, scratch, env) {
  const inherited = Object.fromEntries(Object.entries(env).filter(([key]) =>
    ['SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL'].includes(key.toUpperCase())));
  return { encoding: 'utf8', cwd: scratch, timeout: 15000, maxBuffer: 1024 * 1024,
    env: { ...inherited, PATH: '', NODE_OPTIONS: '', NODE_PATH: '',
      HOME: scratch, USERPROFILE: scratch, XDG_STATE_HOME: scratch,
      XDG_CONFIG_HOME: scratch, XDG_CACHE_HOME: scratch, LOCALAPPDATA: scratch,
      APPDATA: scratch, TMPDIR: scratch, TMP: scratch, TEMP: scratch,
      WAYPOST_PROJECT_DIR: scratch, WAYPOST_HOME: root, WAYPOST_NO_BEAT: '1',
      WAYPOST_NO_STATE_MIGRATION: '1' } };
}

const successful = result => result.status === 0 && !result.error && !result.signal;
const detail = result => result.error?.message || result.signal || result.stderr || result.stdout || `exit ${result.status}`;

// Keep all named outcomes, even when an earlier file fails: --check does not
// follow dependencies, so every discovered file must get its own invocation.
export function checkCliSyntax(root, scratch, env = process.env) {
  return collectNamespaceFiles(root).map(file => {
    const result = spawnSync(process.execPath, ['--check', join(root, file.path)], options(root, scratch, env));
    return { path: file.path, ok: successful(result), detail: successful(result) ? '' : detail(result) };
  });
}

export function decodeModuleImport(result, requested) {
  let report;
  try { report = JSON.parse(result.stdout); } catch { /* fail closed below */ }
  if (!successful(result) || report?.ok !== true || report.requested !== requested
      || Object.keys(report).length !== 2) {
    throw new Error(`cli-import-failed (requested module ${requested}): ${detail(result)}`);
  }
  return requested;
}

export function importCliModule(root, requested, scratch, env = process.env) {
  if (typeof requested !== 'string' || requested.includes('\\')
      || !/^bin\/cli\/.+\.mjs$/.test(requested) || requested.split('/').includes('..')) {
    throw new Error(`cli-import-invalid-path: ${requested}`);
  }
  const code = `import {readFileSync} from 'node:fs';
    const request=JSON.parse(readFileSync(0,'utf8'));
    await import(request.url);
    process.stdout.write(JSON.stringify({ok:true,requested:request.requested})+'\\n');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    ...options(root, scratch, env),
    input: JSON.stringify({ requested, url: pathToFileURL(join(root, requested)).href }),
  });
  // SyntaxError stacks need not identify the failing dependency. This label
  // identifies only the module we requested; individual --check results locate
  // syntax errors without guessing from the import exception.
  return decodeModuleImport(result, requested);
}

export function inspectCliModules(root, scratch, env = process.env) {
  const syntax = checkCliSyntax(root, scratch, env);
  const failures = syntax.filter(file => !file.ok);
  if (failures.length) throw new Error('cli-syntax-failed:\n' + failures.map(f => `${f.path}: ${f.detail}`).join('\n'));
  const imported = syntax.filter(f => f.path.startsWith('bin/cli/'))
    .map(file => importCliModule(root, file.path, scratch, env));
  return { checked: syntax.map(file => file.path), imported };
}
