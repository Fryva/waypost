// Offline evidence only: no filesystem reads, shell execution or token inference.
import { createHash } from "node:crypto";
import { posix } from "node:path";

const hash = (text) => createHash("sha256").update(text).digest("hex");
const slash = (path) => path.replace(/\\/g, "/").replace(/^([A-Z]):/, (_, drive) => `${drive.toLowerCase()}:`);
const absolute = (path) => path.startsWith("/") || /^[a-z]:\//.test(path);
const normalize = (path, cwd) => posix.normalize(absolute(slash(path)) ? slash(path) : `${cwd}/${slash(path)}`);
const isCli = (path, project) => {
  const relative = posix.relative(project, path);
  return relative === "bin/waypost" || relative === "bin/waypost.mjs" || relative === "bin/cli" || relative.startsWith("bin/cli/");
};

// Deliberately not a shell parser. Reject expansions, pipelines, redirections,
// substitutions and command lists, even when quoting would make them harmless.
function words(command) {
  if (typeof command !== "string" || /[\n\r;$`|&<>()]/.test(command)) return null;
  const parts = command.trim().match(/"[^"\\]*"|'[^']*'|[^\s'"\\]+/g);
  if (!parts || !/^\s*(?:"[^"\\]*"|'[^']*'|[^\s'"\\]+)(?:\s+(?:"[^"\\]*"|'[^']*'|[^\s'"\\]+))*\s*$/.test(command)) return null;
  return parts.map((part) => /^['"]/.test(part) ? part.slice(1, -1) : part);
}

function shellNavigation(command) {
  const args = words(command);
  if (!args) return null;
  const executable = args.shift();
  if (executable === "cat") {
    if (args[0] === "--") args.shift();
    if (!args.length || args.some((a) => !a || a.startsWith("-") || /[*?\[\]{}~]/.test(a))) return null;
    return { kind: "read", paths: args, scope: "unbounded", range: "all", shell: true };
  }
  if (executable === "sed") {
    if (args.shift() !== "-n") return null;
    const range = args.shift();
    if (!/^[1-9]\d*(?:,[1-9]\d*)?p$/.test(range || "")) return null;
    if (args[0] === "--") args.shift();
    if (args.length !== 1 || args[0].startsWith("-") || /[*?\[\]{}~]/.test(args[0])) return null;
    return { kind: "read", paths: args, scope: "bounded", range, shell: true };
  }
  if (executable !== "rg") return null;
  let files = false;
  const positional = [];
  let options = true;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (options && arg === "--") { options = false; continue; }
    if (options && arg.startsWith("-")) {
      if (arg === "--files") files = true;
      else if (["-n", "--line-number", "-l", "--files-with-matches", "-i", "--ignore-case", "-F", "--fixed-strings", "--hidden", "--no-ignore", "-s", "--case-sensitive"].includes(arg)) continue;
      else if (["-g", "--glob", "-m", "--max-count", "-A", "-B", "-C"].includes(arg) && args[i + 1]) i++;
      else return null;
    } else positional.push(arg);
  }
  if (!files) positional.shift(); // the pattern is not a path
  if (!positional.length || positional.some((p) => !p || /[*?\[\]{}~]/.test(p))) return null;
  return { kind: files ? "glob" : "grep", paths: positional, shell: true };
}

function classify(block) {
  const input = block.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const name = typeof block.name === "string" ? block.name.toLowerCase() : "";
  if (["bash", "shell", "exec_command"].includes(name)) return shellNavigation(input.command ?? input.cmd);
  if (name === "read") {
    const path = input.file_path ?? input.path;
    if (typeof path !== "string" || !path) return null;
    const valid = (value) => value === undefined || (Number.isInteger(value) && value > 0);
    if (!valid(input.offset) || !valid(input.limit)) return null;
    return { kind: "read", paths: [path], scope: input.limit === undefined ? "unbounded" : "bounded", range: JSON.stringify([input.offset ?? 1, input.limit ?? null, input.pages ?? null]), shell: false };
  }
  if (name === "grep" || name === "glob") {
    const path = input.path ?? ".";
    if (typeof path !== "string") return null;
    return { kind: name, paths: [name === "glob" && typeof input.pattern === "string" ? `${path}/${input.pattern}` : path], shell: false };
  }
  return null;
}

function resultText(block) {
  if (typeof block.content === "string") return block.content;
  if (!Array.isArray(block.content) || !block.content.length || block.content.some((b) => !b || typeof b !== "object" || b.type !== "text" || typeof b.text !== "string")) return null;
  return block.content.map((b) => b.text).join("\n");
}

function truncated(block, rec, text) {
  return block.truncated === true || block.is_truncated === true || rec.toolUseResult?.truncated === true || rec.toolUseResult?.is_truncated === true || /(?:\[.{0,30}truncated.{0,30}\]|output (?:has been |was )?truncated|content truncated|truncated \d+ (?:lines|characters)|file content.{0,30}exceeds|exceeds maximum allowed tokens)/i.test(text || "");
}

export function createNavigationAnalyzer({ project }) {
  const root = posix.normalize(slash(project));
  const events = [];
  return {
    observe(rec, { context }) {
      if (!rec || !context) return;
      const cwd = typeof rec.cwd === "string" ? normalize(rec.cwd, root) : root;
      if (rec.type === "system" && rec.subtype === "compact_boundary") events.push({ type: "reset", context, id: rec.uuid });
      if (rec.type === "compact_boundary") events.push({ type: "reset", context, id: rec.uuid });
      for (const block of Array.isArray(rec.message?.content) ? rec.message.content : []) {
        if (rec.type === "assistant" && block?.type === "tool_use") events.push({ type: "call", context, cwd, requestId: rec.requestId, block: { id: block.id, name: block.name }, identity: block.id || hash(JSON.stringify(block)), navigation: classify(block), malformed: typeof block.name !== "string" || !block.name || !block.input || typeof block.input !== "object" || Array.isArray(block.input) });
        if (rec.type === "user" && block?.type === "tool_result") {
          const text = resultText(block);
          const file = rec.toolUseResult?.file;
          events.push({ type: "result", context, toolId: block.tool_use_id, result: {
            digest: text === null ? null : hash(text), characters: text?.length ?? 0,
            error: block.is_error === true, truncated: truncated(block, rec, text),
            wholeFile: !!file && file.startLine === 1 && Number.isInteger(file.totalLines) && file.numLines >= file.totalLines,
          } });
        }
      }
    },
    report(rows, { excludeRequestIds = new Set() } = {}) {
      const calls = new Map();
      const byId = new Map();
      const excludedToolSources = new Map();
      const canonical = (event) => rows.get(event.requestId)?.context || event.context;
      // Usage owns the native context: a subagent call copied inline into the
      // parent transcript must not become a second call or a parent read.
      for (const event of events) {
        if (event.type !== "call") continue;
        if (excludeRequestIds.has(event.requestId)) {
          if (event.block.id) {
            const sources = excludedToolSources.get(event.block.id) || new Set();
            sources.add(event.context);
            excludedToolSources.set(event.block.id, sources);
          }
          continue;
        }
        const key = JSON.stringify([canonical(event), event.requestId || null, event.identity]);
        let call = calls.get(key);
        if (call) { call.sources.add(event.context); continue; }
        const navigation = event.navigation;
        call = { ...event, context: canonical(event), key, navigation, sources: new Set([event.context]), results: [] };
        if (navigation) call.paths = navigation.paths.map((path) => normalize(path, event.cwd));
        calls.set(key, call);
        if (event.block.id) {
          const list = byId.get(event.block.id) || [];
          list.push(call);
          byId.set(event.block.id, list);
        }
      }
      const results = new Map();
      let unmatchedResults = 0;
      for (const event of events) {
        if (event.type !== "result") continue;
        const candidates = event.toolId ? byId.get(event.toolId) || [] : [];
        const matching = candidates.filter((call) => call.sources.has(event.context));
        const call = matching.length === 1 ? matching[0] : null;
        if (!call && excludedToolSources.get(event.toolId)?.has(event.context)) continue;
        if (!call) { unmatchedResults++; continue; }
        const result = event.result;
        const signature = JSON.stringify([result.digest, result.error, result.truncated]);
        const duplicate = call.results.find((entry) => entry.signature === signature);
        if (duplicate) { duplicate.wholeFile ||= result.wholeFile; continue; }
        call.results.push({ ...result, signature });
        results.set(event, call);
      }
      const counts = { total: 0, read: 0, grep: 0, glob: 0, shell: 0, cli: 0, cli_read: 0, cli_grep: 0, cli_glob: 0 };
      const reads = { bounded_requests: 0, unbounded_requests: 0, whole_file_confirmed_results: 0, successful_results: 0, missing_results: 0, error_results: 0, truncated_results: 0, unsupported_results: 0, conflicting_results: 0, returned_characters: 0, repeated_identical_results: 0, repeated_returned_characters: 0 };
      const requestIds = new Set();
      const cliRequestIds = new Set();
      const files = new Map();
      const seenCalls = new Set();
      const seenResults = new Set();
      const previous = new Map();
      const epochs = new Map();
      let unsupportedShell = 0, unsupportedNavigation = 0, malformedCalls = 0, invalidations = 0, excludedInvalidations = 0, compactions = 0, missingRequestIds = 0, missingToolIds = 0;
      const reset = (context) => { epochs.set(context, (epochs.get(context) || 0) + 1); invalidations++; };
      const seenResets = new Set();
      for (const event of events) {
        if (event.type === "reset") {
          const key = event.id && `${event.context}:${event.id}`;
          if (key && seenResets.has(key)) continue;
          if (key) seenResets.add(key);
          reset(event.context); compactions++; continue;
        }
        if (event.type === "call") {
          const key = JSON.stringify([canonical(event), event.requestId || null, event.identity]);
          if (seenCalls.has(key)) continue;
          seenCalls.add(key);
          const name = typeof event.block.name === "string" ? event.block.name.toLowerCase() : "";
          if (excludeRequestIds.has(event.requestId)) {
            if (["edit", "write", "multiedit", "apply_patch", "notebookedit"].includes(name) || (!event.navigation && ["bash", "shell", "exec_command"].includes(name))) {
              reset(event.context);
              excludedInvalidations++;
            }
            continue;
          }
          const call = calls.get(key);
          if (event.malformed) malformedCalls++;
          if (["edit", "write", "multiedit", "apply_patch", "notebookedit"].includes(name)) reset(call.context);
          if (!call.navigation) {
            if (["bash", "shell", "exec_command"].includes(name)) { unsupportedShell++; reset(call.context); }
            if (["read", "grep", "glob"].includes(name)) unsupportedNavigation++;
            continue;
          }
          const nav = call.navigation;
          call.epoch = epochs.get(call.context) || 0;
          const cli = call.paths.some((path) => isCli(path, root));
          counts.total++; counts[nav.kind]++;
          if (!call.block.id) missingToolIds++;
          if (nav.shell) counts.shell++;
          if (cli) { counts.cli++; counts[`cli_${nav.kind}`]++; }
          if (call.requestId) { requestIds.add(call.requestId); if (cli) cliRequestIds.add(call.requestId); }
          else missingRequestIds++;
          if (nav.kind !== "read") continue;
          reads[`${nav.scope}_requests`]++;
          if (!call.results.length) {
            reads.missing_results++;
            previous.delete(JSON.stringify([call.context, call.epoch, call.paths, nav.range]));
          }
          if (call.results.length > 1) reads.conflicting_results++;
          for (const path of call.paths) {
            const file = files.get(path) || { path: posix.relative(root, path), cli: isCli(path, root), read_calls: 0, returned_characters: 0, repeated_identical_results: 0, repeated_returned_characters: 0 };
            file.read_calls++; files.set(path, file);
          }
          continue;
        }
        const call = results.get(event);
        if (!call || seenResults.has(call.key) || call.navigation?.kind !== "read") continue;
        seenResults.add(call.key);
        const result = call.results[0];
        const scope = JSON.stringify([call.context, epochs.get(call.context) || 0, call.paths, call.navigation.range]);
        if (call.results.length !== 1 || result.error || result.truncated || result.digest === null || call.epoch !== (epochs.get(call.context) || 0)) {
          previous.delete(scope);
          if (result.error) reads.error_results++;
          else if (result.truncated) reads.truncated_results++;
          else if (result.digest === null || call.epoch !== (epochs.get(call.context) || 0)) reads.unsupported_results++;
          continue;
        }
        reads.successful_results++;
        reads.returned_characters += result.characters;
        if (result.wholeFile) reads.whole_file_confirmed_results++;
        const repeated = previous.get(scope) === result.digest;
        previous.set(scope, result.digest);
        if (repeated) { reads.repeated_identical_results++; reads.repeated_returned_characters += result.characters; }
        // Multi-file cat output does not identify each file's contribution.
        if (call.paths.length === 1) {
          const file = files.get(call.paths[0]);
          file.returned_characters += result.characters;
          if (repeated) { file.repeated_identical_results++; file.repeated_returned_characters += result.characters; }
        }
      }
      const usage = (ids) => {
        const total = { count: ids.size, with_usage: 0, missing_usage: 0, complete_usage: 0, input: 0, cache_write: 0, cache_read: 0, output: 0, observed_input: 0 };
        const estimate = { known_usd: 0, estimated_usd: null, complete: true };
        for (const id of ids) {
          const row = rows.get(id);
          if (!row) { total.missing_usage++; estimate.complete = false; continue; }
          total.with_usage++;
          if (row.usageComplete === true) total.complete_usage++;
          if (row.usageComplete === true && Number.isFinite(row.estimatedApiCostUsd) && row.estimatedApiCostUsd >= 0) estimate.known_usd += row.estimatedApiCostUsd;
          else estimate.complete = false;
          for (const [out, source] of [["input", "input"], ["cache_write", "cacheWrite"], ["cache_read", "cacheRead"], ["output", "output"]]) {
            if (Number.isFinite(row[source]) && row[source] >= 0) total[out] += row[source];
          }
        }
        total.observed_input = total.input + total.cache_write + total.cache_read;
        total.complete_observed_input = total.complete_usage === total.count ? total.observed_input : null;
        estimate.estimated_usd = estimate.complete ? estimate.known_usd : null;
        total.api_price_proxy = estimate;
        return total;
      };
      return {
        schema: "claude-native-navigation-v1",
        calls: counts, initiating_requests: usage(requestIds), cli_initiating_requests: usage(cliRequestIds), reads,
        top_files: [...files.values()].sort((a, b) => b.returned_characters - a.returned_characters || b.read_calls - a.read_calls || a.path.localeCompare(b.path)).slice(0, 20),
        coverage: { supported_harness: "claude", unsupported_harnesses: ["codex", "opencode"], unsupported_shell_calls: unsupportedShell, unsupported_navigation_calls: unsupportedNavigation, malformed_tool_calls: malformedCalls, calls_without_request_id: missingRequestIds, calls_without_tool_id: missingToolIds, unmatched_tool_results: unmatchedResults, invalidations, invalidations_from_excluded_requests: excludedInvalidations, compactions, files_observed: files.size, top_files_limit: 20 },
        limitations: ["Usage belongs only to requests initiating navigation; it does not measure returned-content cost, later context reuse, an upper bound or savings.", "Navigation evidence covers only the caller-supplied timestamp-window event stream; explicitly excluded requests contribute no attributed calls or results, but their mutation events still invalidate repeat evidence; results outside that window may be missing.", "API-price proxy sums only caller-supplied complete, priced request estimates, including cache weighting; it is not subscription quota or the cost of reading returned text.", "Unbounded requests do not establish whole-file reads; only explicit file result metadata can confirm completeness.", "Identical successful returned text in the same context/path/range is evidence, not proof that a read was safe to skip.", "Shell classification supports only explicit cat, sed -n numeric ranges and a conservative rg subset; other shell commands remain unsupported and invalidate repeat evidence.", "Character counts are JavaScript string lengths, not token estimates; no transcript text or content hashes are emitted."],
      };
    },
  };
}
