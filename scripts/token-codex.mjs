// Read-only Codex rollout analysis. Native snapshots are evidence, not invoices.
import { createReadStream, readdirSync, openSync, readSync, closeSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import * as zlib from "node:zlib";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const MAX_LINE = 1024 * 1024;
const MAX_ARCHIVE = 8 * 1024 * 1024;
const MAX_EXPANDED = 64 * 1024 * 1024;
const archiveKind = file => file.match(/\.jsonl\.(zst|gz|xz|br)$/)?.[1] ?? null;
const archiveSupported = kind => kind === "gz" || kind === "br" || (kind === "zst" && typeof zlib.createZstdDecompress === "function");
const FIELDS = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"];
const WRITE = "cache_write_input_tokens";
const digest = value => createHash("sha256").update(value).digest("hex");
const normalized = path => resolve(path).replace(/\\/g, "/").replace(/^([A-Z]):/, (_, drive) => `${drive.toLowerCase()}:`);
const count = value => Number.isSafeInteger(value) && value >= 0;
const timestamp = value => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const parsed = Date.parse(value), day = value.slice(0, 10);
  if (!Number.isFinite(parsed) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) return null;
  return parsed;
};

// Parentage narrows a metadata-prefix exception; it never anchors counters.
function parentIdentity(payload) {
  const links = [payload.parent_thread_id, payload.forked_from_id, payload.source?.subagent?.thread_spawn?.parent_thread_id].filter(value => value !== undefined && value !== null);
  if (!links.length) return null;
  return links.every(value => typeof value === "string" && value.length && value !== payload.id && value === links[0]) ? links[0] : undefined;
}

function metadata(rec) {
  const p = rec?.type === "session_meta" ? rec.payload : null;
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  // Desktop rollouts can share session_id across parent and subagent files.
  // Only id owns the cumulative native context; never merge by session_id.
  const id = p.id;
  const created = timestamp(p.timestamp), parent = parentIdentity(p);
  const roles = [p.agent_role, p.source?.subagent?.thread_spawn?.agent_role].filter(value => typeof value === "string" && value.length);
  if (parent === undefined || typeof id !== "string" || !id || typeof p.cwd !== "string" || !p.cwd || created === null || new Set(roles).size > 1) return null;
  return { id, session_label: typeof p.session_id === "string" ? p.session_id : null, cwd: normalized(p.cwd), created, role: roles[0] ?? null, provider: typeof p.model_provider === "string" ? p.model_provider : null, version: typeof p.cli_version === "string" ? p.cli_version : null, parent_id: parent };
}

function counters(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || FIELDS.some(key => !count(value[key]))) return null;
  const keys = Object.hasOwn(value, WRITE) ? [...FIELDS, WRITE] : FIELDS;
  if (keys.some(key => !count(value[key])) || value.cached_input_tokens > value.input_tokens || value.reasoning_output_tokens > value.output_tokens || (Object.hasOwn(value, WRITE) && value[WRITE] > value.input_tokens)) return null;
  if (!Number.isSafeInteger(value.input_tokens + value.output_tokens) || value.total_tokens !== value.input_tokens + value.output_tokens) return null;
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}

// Probe cancellation is intentional; full reads must reach decoder EOF/trailer.
async function archiveBytes(file, consume, probe = false) {
  const kind = archiveKind(file), hash = createHash("sha256");
  const stop = new Error("archive-probe-complete");
  let raw = 0, expanded = 0, probeComplete = false, limitFailure = null;
  const limit = (compressed) => new Transform({ transform(bytes, _encoding, done) {
    if (compressed) raw += bytes.length; else expanded += bytes.length;
    if ((compressed ? raw > MAX_ARCHIVE : expanded > MAX_EXPANDED)) {
      limitFailure = compressed ? "archive-input-limit" : "archive-output-limit";
      done(Object.assign(new Error("archive-limit"), { archiveReason: limitFailure }));
    } else { if (compressed) hash.update(bytes); done(null, bytes); }
  } });
  const decoder = kind === "gz" ? zlib.createGunzip() : kind === "br" ? zlib.createBrotliDecompress()
    : zlib.createZstdDecompress({ params: { [zlib.constants.ZSTD_d_windowLogMax]: 26 } });
  try {
    await pipeline(createReadStream(file), limit(true), decoder, limit(false), async source => {
      for await (const bytes of source) if (consume(bytes) === false && probe) { probeComplete = true; throw stop; }
    });
    if (decoder.bytesWritten !== raw) throw Object.assign(new Error("archive-trailing-data"), { archiveReason: "archive-trailing-data" });
    return hash.digest("hex");
  } catch (error) {
    if (probeComplete && (error === stop || error.code === "ABORT_ERR")) return null;
    throw Object.assign(new Error("archive-read-failed"), { archiveReason: error.archiveReason ?? limitFailure ?? "archive-decode-or-read-error" });
  }
}

async function archiveHeader(file) {
  const chunks = [];
  let size = 0, complete = false;
  try {
    await archiveBytes(file, bytes => {
      const end = bytes.indexOf(10), part = bytes.subarray(0, end < 0 ? bytes.length : end);
      size += part.length;
      if (size > MAX_LINE || (size === MAX_LINE && end < 0)) throw new Error("header-limit");
      chunks.push(part);
      if (end >= 0) { complete = true; return false; }
    }, true);
    const line = Buffer.concat(chunks);
    if (!complete && !line.length) return null;
    const rec = JSON.parse(line.toString("utf8"));
    return { meta: metadata(rec), id: typeof rec?.payload?.id === "string" ? rec.payload.id : null, sha256: digest(line) };
  } catch (error) { return { archive_error: error.archiveReason ?? "archive-header-error" }; }
}

function header(file) {
  let fd;
  try {
    fd = openSync(file, "r");
    const chunks = [];
    let used = 0, ended = false;
    while (used < MAX_LINE) {
      const bytes = Buffer.alloc(Math.min(65536, MAX_LINE - used));
      const n = readSync(fd, bytes, 0, bytes.length, used);
      if (!n) break;
      const end = bytes.subarray(0, n).indexOf(10);
      chunks.push(bytes.subarray(0, end >= 0 ? end : n));
      used += n;
      if (end >= 0) { ended = true; break; }
    }
    const line = Buffer.concat(chunks);
    if (!ended && used === MAX_LINE) return null;
    const rec = JSON.parse(line.toString("utf8")), meta = metadata(rec);
    return { meta, id: typeof rec?.payload?.id === "string" ? rec.payload.id : null, sha256: digest(line) };
  } catch { return null; }
  finally { if (fd !== undefined) closeSync(fd); }
}

// Hash original bytes, bound even non-token tool-output lines, and retain only
// token counters. A malformed/oversized line can hide an observation: break it.
async function readHistory(file, expected) {
  const hash = createHash("sha256"), decoder = new StringDecoder("utf8");
  const frames = [];
  let pending = "", dropping = false, errors = 0, metadataConflict = false, sawHeader = false, parentSlot = false, inheritedParentHeaders = 0, inheritedParent = null;
  const gap = () => { parentSlot = false; if (!sawHeader) { sawHeader = true; metadataConflict = true; } errors++; frames.push({ gap: true }); };
  const line = text => {
    if (!text.trim()) return;
    let rec;
    try { rec = JSON.parse(text); } catch { gap(); return; }
    const initial = !sawHeader;
    if (initial) {
      sawHeader = true;
      const first = metadata(rec);
      if (!first || JSON.stringify(first) !== JSON.stringify(expected)) metadataConflict = true;
    }
    if (!rec || typeof rec !== "object" || Array.isArray(rec)) { gap(); return; }
    if (rec.type === "session_meta") {
      const meta = metadata(rec);
      if (!meta || JSON.stringify(meta) !== JSON.stringify(expected)) {
        if (parentSlot && meta && expected.parent_id && meta.id === expected.parent_id && meta.cwd === expected.cwd && meta.created < expected.created) { inheritedParentHeaders++; inheritedParent = meta; }
        else metadataConflict = true;
      }
    }
    parentSlot = initial && !metadataConflict;
    if (rec.type === "event_msg" && rec.payload?.type === "token_count") frames.push({ time: timestamp(rec.timestamp), value: counters(rec.payload.info?.total_token_usage) });
  };
  const consume = text => {
    let start = 0, end;
    while ((end = text.indexOf("\n", start)) >= 0) {
      if (dropping) dropping = false;
      else {
        const whole = pending + text.slice(start, end);
        if (Buffer.byteLength(whole) > MAX_LINE) gap(); else line(whole);
      }
      pending = ""; start = end + 1;
    }
    if (!dropping) {
      pending += text.slice(start);
      if (Buffer.byteLength(pending) > MAX_LINE) { gap(); pending = ""; dropping = true; }
    }
  };
  try {
    let sourceHash;
    if (archiveKind(file)) sourceHash = await archiveBytes(file, bytes => consume(decoder.write(bytes)));
    else { for await (const bytes of createReadStream(file)) { hash.update(bytes); consume(decoder.write(bytes)); } sourceHash = hash.digest("hex"); }
    consume(decoder.end());
    if (pending && !dropping) line(pending);
    if (!sawHeader) metadataConflict = true;
    return { frames, errors, metadataConflict, inheritedParentHeaders, inheritedParent, sha256: sourceHash, readable: true };
  } catch (error) { gap(); return { frames: archiveKind(file) ? [] : frames, errors, inheritedParentHeaders, inheritedParent, metadataConflict: metadataConflict || !!archiveKind(file), sha256: null, readable: false, archive_error: error.archiveReason ?? null }; }
}

const prefix = (a, b) => a.length <= b.length && a.every((frame, i) => JSON.stringify(frame) === JSON.stringify(b[i]));

export function reduceCodexHistory(meta, frames, { since = null, until = null } = {}) {
  const from = since ? Date.parse(since) : -Infinity, to = until ? Date.parse(until) : Infinity;
  const selected = time => time >= from && time < to;
  const spans = [];
  const coverage = { snapshots: 0, current_snapshots: 0, duplicates: 0, historical_snapshots: 0, unknown_prefixes: 0, chain_gaps: 0, invalid_timestamps: 0, counter_conflicts: 0, counter_decreases: 0, schema_changes: 0, boundary_crossing_spans: 0 };
  let prev = null, recovering = false, complete = true, lastTime = meta.created, seenCurrent = false;
  for (const frame of frames) {
    if (frame.gap) { coverage.chain_gaps++; prev = null; recovering = true; complete = false; continue; }
    coverage.snapshots++;
    if (frame.time !== null && frame.time < meta.created && !seenCurrent) { coverage.historical_snapshots++; continue; }
    if (frame.time === null || frame.time < lastTime) {
      coverage.invalid_timestamps++; prev = null; recovering = true; complete = false; continue;
    }
    seenCurrent = true;
    lastTime = frame.time;
    if (!frame.value) { coverage.chain_gaps++; prev = null; recovering = true; complete = false; continue; }
    coverage.current_snapshots++;
    if (!prev) {
      if (frame.value.total_tokens !== 0 && !recovering) {
        coverage.unknown_prefixes++;
        // An unknown prefix can cover the window even when its first retained
        // endpoint is after --until. Only a wholly pre-window prefix is safe.
        if (frame.time >= from && meta.created < to) complete = false;
      }
      prev = frame; recovering = false; continue;
    }
    const keys = Object.keys(prev.value);
    if (JSON.stringify(keys) !== JSON.stringify(Object.keys(frame.value))) {
      coverage.schema_changes++; prev = null; recovering = true; complete = false; continue;
    }
    if (keys.every(key => prev.value[key] === frame.value[key])) { coverage.duplicates++; prev = frame; continue; }
    if (frame.time === prev.time || frame.value.total_tokens === prev.value.total_tokens) {
      coverage.counter_conflicts++; prev = null; recovering = true; complete = false; continue;
    }
    if (keys.some(key => frame.value[key] < prev.value[key])) {
      coverage.counter_decreases++; prev = null; recovering = true; complete = false; continue;
    }
    const delta = Object.fromEntries(keys.map(key => [key, frame.value[key] - prev.value[key]]));
    if (delta.cached_input_tokens > delta.input_tokens || delta.reasoning_output_tokens > delta.output_tokens || (delta[WRITE] !== undefined && delta[WRITE] > delta.input_tokens)) {
      coverage.counter_conflicts++; prev = null; recovering = true; complete = false; continue;
    }
    if (selected(frame.time)) {
      spans.push({ start: prev.time, end: frame.time, ...delta });
      if (prev.time < from || prev.time >= to) coverage.boundary_crossing_spans++;
    }
    prev = frame;
  }
  return { spans, complete: complete && coverage.current_snapshots > 0, coverage };
}

function summary(spans, complete) {
  const result = { observed_spans: spans.length, observed_input_tokens: 0, observed_cached_input_tokens: 0, observed_output_tokens: 0, observed_reasoning_output_tokens: 0, observed_total_tokens: 0 };
  for (const span of spans) for (const key of FIELDS) {
    const out = `observed_${key}`;
    const sum = result[out] === null ? NaN : result[out] + span[key];
    result[out] = Number.isSafeInteger(sum) ? sum : null;
  }
  result.cache_write_counter_spans = spans.filter(span => Object.hasOwn(span, WRITE)).length;
  result.observed_cache_write_input_tokens = null;
  if (spans.length && result.cache_write_counter_spans === spans.length) {
    const write = spans.reduce((sum, span) => sum + span[WRITE], 0);
    if (Number.isSafeInteger(write)) result.observed_cache_write_input_tokens = write;
  }
  result.complete_within_discovered_retained_sources = complete && FIELDS.every(key => result[`observed_${key}`] !== null);
  result.total_tokens = result.complete_within_discovered_retained_sources ? result.observed_total_tokens : null;
  return result;
}

export async function collectCodexReport({ project, since = null, until = null, codexHome = process.env.CODEX_HOME || join(homedir(), ".codex") }) {
  const root = join(codexHome, "sessions"), wanted = normalized(project);
  const coverage = { plain_files_discovered: 0, compressed_files_skipped: 0, compressed_files_discovered: 0, compressed_files_decoded: 0, compressed_files_failed: 0, archive_limit_failures: 0, symlinks_skipped: 0, discovery_errors: 0, unidentifiable_headers: 0, other_project_files: 0, matching_files: 0, unreadable_matching_files: 0, malformed_or_oversized_lines: 0, conflicting_contexts: 0, inherited_parent_headers: 0, replay_files: 0 };
  const files = [], discovery = [], contexts = new Map(), identityHeaders = new Map(), conflictingIds = new Set(), stack = [root];
  const registerIdentity = meta => {
    const signature = JSON.stringify(meta), prior = identityHeaders.get(meta.id);
    if (prior && prior !== signature) conflictingIds.add(meta.id);
    identityHeaders.set(meta.id, signature);
  };
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); }
    catch { coverage.discovery_errors++; continue; }
    for (const entry of entries) {
      const path = join(dir, entry.name), name = relative(root, path).replace(/\\/g, "/");
      if (entry.isSymbolicLink()) { coverage.symlinks_skipped++; discovery.push([name, "symlink"]); continue; }
      if (entry.isDirectory()) { stack.push(path); continue; }
      const compression = archiveKind(path);
      if (compression) {
        coverage.compressed_files_discovered++;
        if (!archiveSupported(compression)) { coverage.compressed_files_skipped++; discovery.push([name, "compressed-unsupported"]); continue; }
      } else {
        if (!entry.name.endsWith(".jsonl")) continue;
        coverage.plain_files_discovered++;
      }
      const first = compression ? await archiveHeader(path) : header(path);
      if (first?.archive_error) {
        coverage.compressed_files_failed++;
        if (first.archive_error.endsWith("-limit")) coverage.archive_limit_failures++;
      }
      if (!first?.meta) {
        coverage.unidentifiable_headers++;
        if (first?.id) conflictingIds.add(first.id);
        discovery.push([name, first?.sha256 ?? "unknown-header"]); continue;
      }
      discovery.push([name, first.sha256]);
      registerIdentity(first.meta);
      if (first.meta.cwd !== wanted) { coverage.other_project_files++; continue; }
      coverage.matching_files++;
      const history = await readHistory(path, first.meta);
      if (history.readable && !history.metadataConflict && history.inheritedParent) registerIdentity(history.inheritedParent);
      if (compression) {
        if (history.readable) coverage.compressed_files_decoded++;
        else { coverage.compressed_files_failed++; if (history.archive_error?.endsWith("-limit")) coverage.archive_limit_failures++; }
      }
      files.push({ path: name, sha256: history.sha256, readable: history.readable, context_id: first.meta.id, ...(compression ? { compression, archive_error: history.archive_error ?? null } : {}) });
      coverage.malformed_or_oversized_lines += history.errors;
      coverage.inherited_parent_headers += history.inheritedParentHeaders;
      if (!history.readable) coverage.unreadable_matching_files++;
      const existing = contexts.get(first.meta.id);
      if (!existing) contexts.set(first.meta.id, { meta: first.meta, frames: history.frames, inheritedParent: history.inheritedParent, conflict: history.metadataConflict, readable: history.readable });
      else {
        coverage.replay_files++;
        existing.readable &&= history.readable;
        if (JSON.stringify(existing.meta) !== JSON.stringify(first.meta) || JSON.stringify(existing.inheritedParent) !== JSON.stringify(history.inheritedParent) || history.metadataConflict) existing.conflict = true;
        if (prefix(existing.frames, history.frames)) existing.frames = history.frames;
        else if (!prefix(history.frames, existing.frames)) existing.conflict = true;
      }
    }
  }
  const sourceComplete = !coverage.compressed_files_skipped && !coverage.symlinks_skipped && !coverage.discovery_errors && !coverage.unidentifiable_headers && !coverage.unreadable_matching_files;
  const all = [], waypost = [], unattributed = [], other = [], perContext = [];
  let historiesComplete = true;
  for (const context of [...contexts.values()].sort((a, b) => a.meta.id.localeCompare(b.meta.id))) {
    let reduced;
    if (context.conflict || conflictingIds.has(context.meta.id) || (context.inheritedParent && conflictingIds.has(context.inheritedParent.id))) { coverage.conflicting_contexts++; reduced = { spans: [], complete: false, coverage: {} }; }
    else reduced = reduceCodexHistory(context.meta, context.frames, { since, until });
    if (!context.readable || !reduced.complete) historiesComplete = false;
    all.push(...reduced.spans);
    const target = context.meta.role?.startsWith("waypost-") ? waypost : context.meta.role ? other : unattributed;
    target.push(...reduced.spans);
    perContext.push({ id: context.meta.id, session_label: context.meta.session_label, role: context.meta.role, provider: context.meta.provider, cli_version: context.meta.version, ...summary(reduced.spans, reduced.complete && context.readable && sourceComplete), coverage: reduced.coverage });
  }
  const complete = sourceComplete && historiesComplete && contexts.size > 0;
  const native = { all: summary(all, complete), waypost: summary(waypost, complete), unattributed: summary(unattributed, complete), other_explicit_roles: summary(other, complete) };
  const total = native.all.observed_total_tokens, numerator = native.waypost.observed_total_tokens;
  const share = total > 0 && numerator !== null ? 100 * numerator / total : null;
  return {
    report_version: 2,
    measurement: { source_harness: "codex", counter_schema: "codex-rollout-cumulative-delta-v1", scope: "observed native spans in matching retained plain and supported compressed rollouts, not provider-exhaustive usage", total_formula: "delta(total_tokens); cached input and reasoning are subsets, never extra tokens", first_snapshot: "baseline only; nonzero prefixes are uncharged unknown usage even when total equals last", inherited_metadata: "one older same-cwd explicit parent header immediately after the current header; parentage never anchors counters", unsupported_harnesses: ["claude", "opencode"], other_harness_modes: ["claude"], subscription_quota_percent: null, source_discovery_complete: !!sourceComplete, raw_transcript_bodies_emitted: false },
    provenance: { generated_at: new Date().toISOString(), project_root: wanted, transcript_dir: root, period: { since_inclusive_utc: since, until_exclusive_utc: until, span_selection: "endpoint timestamp after constructing cumulative chain with pre-period baselines" }, input_files: files.sort((a, b) => a.path.localeCompare(b.path)), discovery_sha256: digest(JSON.stringify(discovery.sort((a, b) => a[0].localeCompare(b[0])))), snapshot: "sequential per-file reads; not an atomic snapshot of live sessions; metadata probed before full read", max_line_bytes: MAX_LINE, archive_limits: { compressed_bytes: MAX_ARCHIVE, decompressed_bytes: MAX_EXPANDED, zstd_window_log_max: 26 }, archive_codecs: { gz: true, br: true, zst: archiveSupported("zst"), xz: false }, archive_foreign_project_check: "bounded header only; unrelated archive tails are not decoded or integrity-checked" },
    coverage: { ...coverage, matched_contexts: contexts.size, histories_complete_within_observed_sources: historiesComplete && contexts.size > 0 },
    native_totals: native,
    token_shares: { observed_waypost_percent: share, full_retained_source_waypost_percent: native.all.complete_within_discovered_retained_sources ? share : null, interpretation: "explicit role attribution over covered spans only; unknown role remains unattributed, not non-Waypost" },
    contexts: perContext,
  };
}

export function formatCodexReport(report, { summary: compact = false, sessions = false } = {}) {
  const all = report.native_totals.all, share = report.token_shares.observed_waypost_percent;
  const text = [
    `waypost tokens (Codex): ${all.observed_total_tokens ?? "unknown"} observed native tokens in ${all.observed_spans} spans`,
    `explicit Waypost role share: ${share === null ? "unknown" : `${share.toFixed(2)}%`} of covered spans; full retained-source coverage ${all.complete_within_discovered_retained_sources}`,
    "scope: plain and supported compressed retained rollouts; first nonzero snapshots are uncharged baselines; no subscription quota conversion",
  ];
  if (!compact) {
    text.push(`contexts ${report.coverage.matched_contexts}; decoded archives ${report.coverage.compressed_files_decoded}; skipped compressed files ${report.coverage.compressed_files_skipped}; failed archives ${report.coverage.compressed_files_failed}; unknown headers ${report.coverage.unidentifiable_headers}`, "cache/reasoning are subsets of input/output; snapshots are not request counts");
    if (sessions) for (const context of report.contexts) text.push(`${context.id}  ${context.role ?? "unattributed"}  ${context.observed_total_tokens ?? "unknown"} observed tokens`);
  }
  return text.join("\n") + "\n";
}
