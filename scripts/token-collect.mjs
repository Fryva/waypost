import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename, relative } from "node:path";
import { createHash } from "node:crypto";
import { createNavigationAnalyzer } from "./token-navigation.mjs";
import { ingest, countCommandRuns } from "./token-requests.mjs";

// Strip the plugin prefix: "waypost:critic" / "waypost-critic" → "critic". Attribution and
// agentType both carry it; the lifecycle stage is keyed on the bare name.
const bare = (s) => (s.includes(":") ? s.slice(s.lastIndexOf(":") + 1) : s).replace(/^waypost-/, "");

function readSource(file, kind, audit) {
  const entry = { path: relative(audit.dir, file).split("\\").join("/"), kind, sha256: null, readable: false };
  audit.files.push(entry);
  try {
    const bytes = readFileSync(file);
    entry.sha256 = createHash("sha256").update(bytes).digest("hex");
    entry.readable = true;
    return bytes.toString("utf8");
  } catch {
    audit.coverage.unreadable_files++;
    return null;
  }
}

function eachRecord(file, fn, audit) {
  const raw = readSource(file, "transcript", audit);
  if (raw === null) return;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      audit.coverage.malformed_json_lines++;
      continue;
    }
    if (!rec || typeof rec !== "object" || Array.isArray(rec)) { audit.coverage.invalid_records++; continue; }
    audit.coverage.parsed_records++;
    fn(rec);
  }
}

function collect(dir, opts, project) {
  const rows = new Map();
  // "<session>|<bucket>" → runs. Keyed per session so the session table sums
  // only its own spawns; keying by bucket alone credited every session with
  // the GLOBAL run count of each bucket it touched (~72% inflation).
  const calls = new Map();
  const runLabels = new Set();
  const coverage = { parsed_records: 0, malformed_json_lines: 0, invalid_records: 0, unreadable_files: 0, missing_metadata_files: 0, invalid_metadata_files: 0, assistant_records: 0, missing_request_id_records: 0, missing_usage_records: 0, synthetic_records: 0, filtered_records: 0, missing_timestamp_records: 0, undated_assistant_records: 0, unknown_inline_context_records: 0 };
  const audit = { dir, files: [], coverage };
  const missingUsage = new Set();
  const requestTimes = new Map();
  const navigation = opts.navigation ? createNavigationAnalyzer({ project }) : null;
  const since = opts.since ? Date.parse(opts.since) : -Infinity;
  const until = opts.until ? Date.parse(opts.until) : Infinity;
  let unknownInline = 0;
  const scan = (file, context, fn) => eachRecord(file, (rec) => {
    const timestamp = Date.parse(rec.timestamp);
    const dated = Number.isFinite(timestamp);
    if (!dated) coverage.missing_timestamp_records++;
    if (!dated && rec.type === "assistant" && rec.message?.model !== "<synthetic>") coverage.undated_assistant_records++;
    const withinPeriod = !(opts.since || opts.until) || (dated && timestamp >= since && timestamp < until);
    if (!withinPeriod) coverage.filtered_records++;
    let eventContext = context;
    if (rec.isSidechain && !context.includes("/subagents/")) {
      if (typeof rec.agentId === "string" && rec.agentId) eventContext = `${context}/inline/${rec.agentId}`;
      else {
        coverage.unknown_inline_context_records++;
        // No stable identity means no evidence of retained context across records.
        eventContext = `${context}/inline-unknown/${++unknownInline}`;
      }
    }
    if (withinPeriod) navigation?.observe(rec, { context: eventContext });
    if (rec.type !== "assistant") return;
    coverage.assistant_records++;
    if (rec.message?.model === "<synthetic>") { coverage.synthetic_records++; return; }
    if (typeof rec.requestId !== "string" || !rec.requestId) { if (withinPeriod) coverage.missing_request_id_records++; return; }
    if (dated) {
      const bounds = requestTimes.get(rec.requestId);
      requestTimes.set(rec.requestId, { first: Math.min(bounds?.first ?? timestamp, timestamp), last: Math.max(bounds?.last ?? timestamp, timestamp) });
    }
    const usage = rec.message?.usage;
    if (!usage || typeof usage !== "object" || Array.isArray(usage)) { coverage.missing_usage_records++; missingUsage.add(rec.requestId); return; }
    fn(rec, eventContext);
  }, audit);

  // Subagents FIRST: their attribution is exact, so if the same request also
  // shows up inline in a main transcript, the precise bucket wins the dedup.
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const subs = join(dir, entry.name, "subagents");
    if (!existsSync(subs)) continue;
    for (const f of readdirSync(subs).sort()) {
      if (!f.endsWith(".jsonl")) continue;
      const jsonl = join(subs, f);
      const metaFile = join(subs, f.replace(/\.jsonl$/, ".meta.json"));
      let meta = {};
      if (existsSync(metaFile)) {
        try {
          meta = JSON.parse(readSource(metaFile, "agent-metadata", audit));
          if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error("invalid metadata");
        } catch { coverage.invalid_metadata_files++; meta = {}; }
      } else {
        coverage.missing_metadata_files++;
      }
      const agentType = typeof meta.agentType === "string" && meta.agentType ? meta.agentType : "unknown";
      const desc = typeof meta.description === "string" ? meta.description : "";
      const bucket = `agent: ${agentType}`;
      let run = `${bare(agentType)}: ${desc || f.replace(/\.jsonl$/, "")}`;
      // two spawns can share a description — disambiguate instead of merging
      while (runLabels.has(run)) run += " ²";
      runLabels.add(run);
      const context = `${entry.name}/subagents/${basename(f, ".jsonl")}`;
      scan(jsonl, context, (rec) => {
        ingest(rows, rec, { bucket, kind: "agent", short: bare(agentType), session: entry.name, context, run });
      });
    }
  }

  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(".jsonl")) continue;
    const session = basename(f, ".jsonl");
    scan(join(dir, f), session, (rec, context) => {
      // Older Claude Code versions inlined subagent turns into the main
      // transcript instead of a subagents/ file; mark them rather than
      // letting them masquerade as main-thread work.
      const bucket = rec.attributionSkill
        ? `cmd: ${rec.attributionSkill}`
        : rec.attributionPlugin
          ? `cmd: ${rec.attributionPlugin}`
          : rec.isSidechain
            ? "agent: (inline, untyped)"
            : "(main thread, unattributed)";
      const kind = rec.attributionSkill || rec.attributionPlugin ? "cmd" : rec.isSidechain ? "agent" : "main";
      const short = rec.attributionSkill ? bare(rec.attributionSkill) : "";
      ingest(rows, rec, { bucket, kind, short, session, context, run: "" });
    });
  }
  // Select whole requests after dedup, so cumulative output crossing midnight
  // cannot duplicate input or turn a clipped request into a complete one.
  const excludedRequestIds = new Set();
  const selected = (id) => !(opts.since || opts.until) || (requestTimes.has(id) && requestTimes.get(id).first >= since && requestTimes.get(id).first < until);
  coverage.boundary_crossing_requests = 0;
  for (const [id, row] of rows) {
    const bounds = requestTimes.get(id);
    if ((opts.since || opts.until) && bounds && bounds.first < until && bounds.last >= since && (bounds.first < since || bounds.last >= until)) coverage.boundary_crossing_requests++;
    if (!selected(id)) { excludedRequestIds.add(id); rows.delete(id); }
    else if (bounds) { row.ts = new Date(bounds.first).toISOString(); row.lastTimestamp = bounds.last; }
  }
  for (const id of missingUsage) if (!selected(id)) excludedRequestIds.add(id);
  const selectedRuns = new Set();
  for (const row of rows.values()) {
    if (row.kind !== "agent" || !row.run || selectedRuns.has(row.context)) continue;
    selectedRuns.add(row.context);
    const key = `${row.session}|${row.bucket}`;
    calls.set(key, (calls.get(key) || 0) + 1);
  }
  countCommandRuns(rows, calls);
  coverage.requests_without_usage = [...missingUsage].filter((id) => selected(id) && !rows.has(id)).length;
  coverage.incomplete_usage_requests = [...rows.values()].filter((row) => !row.usageComplete).length;
  coverage.conflicting_usage_requests = [...rows.values()].filter((row) => row.conflictingUsage).length;
  return { rows, calls, audit, navigation, excludedRequestIds };
}

export { collect };
