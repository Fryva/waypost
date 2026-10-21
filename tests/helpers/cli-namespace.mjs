// A bounded, conservative check of the frozen CLI namespace, not a general
// JavaScript free-identifier analyzer. Engine export early-errors resolve scope.
import vm from 'node:vm';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SELF = fileURLToPath(import.meta.url);
const IDENTIFIERS = /[$_\p{ID_Start}][$\u200C\u200D\p{ID_Continue}]*/gu;
const ASCII_NAME = /^[A-Za-z_$][0-9A-Za-z_$]*$/;
const strings = value => Array.isArray(value) && value.every(x => typeof x === 'string' && x.length);
const unique = value => new Set(value).size === value.length;
const rawNames = (source, names) => {
  const raw = new Set(source.match(IDENTIFIERS) || []);
  return names.filter(n => raw.has(n));
};

function decodeReport(result, kind) {
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { throw new Error('cli-namespace-invalid-report'); }
  if (result.error || result.signal || result.status !== 0 || report?.ok !== true || report.kind !== kind) {
    throw new Error(`cli-namespace-failed: ${report?.error || result.error?.message || result.stderr || result.status}`);
  }
  return report;
}

// Selection reports have their own direct decoder: never recurse into the
// primary decoder. Structural validation is not a semantic classification proof;
// the separately executed, known selector computes the parent's expectation.
export function decodeSelectionResult(result, request) {
  const report = decodeReport(result, 'selection');
  if (!Array.isArray(report.checked) || report.checked.length !== request.files.length
      || report.checked.some((f, i) => !f || f.path !== request.files[i].path || !strings(f.selected)
        || !unique(f.selected) || JSON.stringify(f.selected) !== JSON.stringify(
          rawNames(request.files[i].source, request.names).filter(n => f.selected.includes(n))))) {
    throw new Error('cli-namespace-invalid-selection');
  }
  return report;
}

function spawn(request, env) {
  return spawnSync(process.execPath, ['--experimental-vm-modules', SELF],
    { input: JSON.stringify(request), encoding: 'utf8', env, timeout: 120000, maxBuffer: 1024 * 1024 });
}
export function decodeNamespaceResult(result, request, env = process.env) {
  const report = decodeReport(result, request.kind);
  if (request.kind === 'audit') {
    if (!strings(report.bindings) || !unique(report.bindings) || !Number.isSafeInteger(report.candidates)
        || report.candidates < report.bindings.length) throw new Error('cli-namespace-invalid-audit');
  } else {
    const selection = { ...request, kind: 'selection' };
    const expected = decodeSelectionResult(spawn(selection, env), selection).checked;
    if (!Array.isArray(report.checked) || report.checked.length !== expected.length
        || report.checked.some((f, i) => !f || f.path !== expected[i].path || !strings(f.selected)
          || JSON.stringify(f.selected) !== JSON.stringify(expected[i].selected))) {
      throw new Error('cli-namespace-incomplete-report');
    }
  }
  return report;
}

function run(request, env) { return decodeNamespaceResult(spawn(request, env), request, env); }
export const auditNamespace = (source, env = process.env) => run({ kind: 'audit', source }, env);
export const inspectNamespace = (files, names, env = process.env) => run({ kind: 'files', files, names }, env);

export function collectNamespaceFiles(root) {
  const files = [];
  if (lstatSync(join(root, 'bin')).isSymbolicLink()) throw new Error('cli-namespace-symlink: bin');
  function add(path, name) {
    if (lstatSync(path).isSymbolicLink()) throw new Error(`cli-namespace-symlink: ${name}`);
    files.push({ path: name, source: readFileSync(path, 'utf8') });
  }
  function walk(path, name) {
    if (lstatSync(path).isSymbolicLink()) throw new Error(`cli-namespace-symlink: ${name}`);
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(path, entry.name), rel = name + '/' + entry.name;
      if (entry.isSymbolicLink()) throw new Error(`cli-namespace-symlink: ${rel}`);
      if (entry.isDirectory()) walk(child, rel);
      else if (entry.name.endsWith('.mjs')) add(child, rel);
    }
  }
  add(join(root, 'bin', 'waypost.mjs'), 'bin/waypost.mjs');
  const cli = join(root, 'bin', 'cli');
  if (lstatSync(cli, { throwIfNoEntry: false })) walk(cli, 'bin/cli');
  return files;
}

function prefixFor(source) {
  let prefix = '__waypost_namespace_probe_';
  while (source.includes(prefix)) prefix += '_';
  return prefix;
}
function parse(source) { return new vm.SourceTextModule(source); }
function checkedSource(source) {
  if (typeof source !== 'string' || source.includes('\\u')) throw new Error('unsupported-unicode-escape-or-source');
  parse(source);
}
function probeSource(source, names, prefix) {
  return source + '\n;\nexport { ' + names.map((n, i) => `${n} as ${prefix}${i}`).join(', ') + ' };\n';
}
// Only called in the flagged child after checkedSource. A successful export
// proves a module-level binding. Otherwise @ cannot replace a code identifier
// in valid strict ESM: successful parses identify non-code occurrences. Keep
// each original UTF-16 offset; text before a real use must not hide that use.
function selectedNames(source, names) {
  const occurrences = new Map(names.map(n => [n, []]));
  for (const match of source.matchAll(IDENTIFIERS)) {
    if (occurrences.has(match[0])) occurrences.get(match[0]).push(match.index);
  }
  const prefix = prefixFor(source);
  return names.filter(name => {
    const offsets = occurrences.get(name);
    if (!offsets.length) return false;
    try { parse(probeSource(source, [name], prefix)); return true; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    for (const offset of offsets) {
      try { parse(source.slice(0, offset) + '@' + source.slice(offset + name.length)); }
      catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return true;
      }
    }
    return false;
  });
}
function inspect(request) {
  if (request.kind === 'audit') {
    checkedSource(request.source);
    const candidates = [...new Set(request.source.match(IDENTIFIERS) || [])].sort();
    const prefix = prefixFor(request.source), bindings = [];
    for (const name of candidates) {
      try { parse(probeSource(request.source, [name], prefix)); bindings.push(name); }
      catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    }
    return { ok: true, kind: 'audit', candidates: candidates.length, bindings };
  }
  if (!['files', 'selection'].includes(request.kind) || !strings(request.names) || !request.names.length || !unique(request.names)
      || request.names.some(n => !ASCII_NAME.test(n)) || !Array.isArray(request.files) || !request.files.length
      || !request.files.every(f => f && typeof f.path === 'string' && f.path.length && typeof f.source === 'string')
      || !unique(request.files.map(f => f.path))) throw new Error('invalid-namespace-request');
  const checked = [];
  for (const file of request.files) {
    try {
      checkedSource(file.source);
      const selected = selectedNames(file.source, request.names);
      if (request.kind === 'files' && selected.length) parse(probeSource(file.source, selected, prefixFor(file.source)));
      checked.push({ path: file.path, selected });
    } catch (error) { throw new Error(`${file.path}: ${error.message}`); }
  }
  return { ok: true, kind: request.kind, checked };
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  try { process.stdout.write(JSON.stringify(inspect(JSON.parse(readFileSync(0, 'utf8')))) + '\n'); }
  catch (error) { process.stdout.write(JSON.stringify({ ok: false, error: error.message }) + '\n'); process.exitCode = 1; }
}
