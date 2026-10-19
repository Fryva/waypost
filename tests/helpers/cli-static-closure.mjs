// Parse the early CLI dependency graph without linking or evaluating its code.
// The child flag enables the built-in engine parser on supported Node versions;
// no tokenizer or external parser is needed by the test suite.
import vm from 'node:vm';
import { readFileSync, realpathSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const SELF = fileURLToPath(import.meta.url);

export function decodeClosureResult(result) {
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { throw new Error(`static-closure-invalid-report: exit ${result.status}: ${result.error?.message || result.stderr || ''}`); }
  if (result.error || result.signal || result.status !== 0 || report?.ok !== true) {
    const error = new Error(`static-closure-failed: ${report?.error || result.error?.message || result.stderr || result.status}`);
    error.chain = report?.chain;
    throw error;
  }
  if (!Array.isArray(report.files) || !report.files.length || !report.files.every(p => typeof p === 'string' && p.length)) {
    throw new Error('static-closure-invalid-files');
  }
  return report;
}

export function inspectStaticClosure(root, entry, env = process.env) {
  return decodeClosureResult(spawnSync(process.execPath,
    ['--experimental-vm-modules', SELF, root, entry],
    { encoding: 'utf8', env, timeout: 15000, maxBuffer: 1024 * 1024 }));
}

function inspect(rootPath, entry) {
  const root = realpathSync(rootPath), visited = new Set(), files = [];
  const local = path => relative(root, path).split(sep).join('/');
  const fail = (message, chain) => { const error = new Error(message); error.chain = chain; throw error; };
  function visit(requested, chain) {
    let path;
    try { path = realpathSync(requested); }
    catch (error) { fail(`missing-module ${local(requested)}: ${error.code}`, chain); }
    const rel = relative(root, path), name = local(path), route = [...chain, name];
    if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) fail(`outside-root ${name}`, route);
    if (/^scripts\/team(?:-[^/]+)?\.mjs$/i.test(name)) fail(`forbidden-team-static-import ${name}`, route);
    if (visited.has(path)) return;
    visited.add(path); files.push(name);
    let module;
    try { module = new vm.SourceTextModule(readFileSync(path, 'utf8'), { identifier: path }); }
    catch (error) { fail(`invalid-module ${name}: ${error.message}`, route); }
    for (const specifier of module.dependencySpecifiers) {
      if (isBuiltin(specifier)) continue;
      if (!specifier.startsWith('./') && !specifier.startsWith('../') && !specifier.startsWith('file:')) {
        fail(`unsupported-import ${name}: ${specifier}`, route);
      }
      let target;
      try {
        const url = new URL(specifier, pathToFileURL(path));
        if (url.protocol !== 'file:' || url.search || url.hash) throw new Error('plain file URL required');
        target = fileURLToPath(url);
      } catch (error) { fail(`unsupported-import ${name}: ${specifier}: ${error.message}`, route); }
      visit(target, route);
    }
  }
  visit(resolve(root, entry), []);
  return { ok: true, files };
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  try { process.stdout.write(JSON.stringify(inspect(process.argv[2], process.argv[3])) + '\n'); }
  catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error.message, chain: error.chain || [] }) + '\n');
    process.exitCode = 1;
  }
}
