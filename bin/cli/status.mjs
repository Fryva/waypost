// Waypost CLI: status.
import { bindingInfo, readCleanupSetting, readLastAutoCleanup, selfInstallOff } from "../../scripts/lib.mjs";
import { SCRIPT_URL, VERSION, configPath, projectRoot, readConfig, run } from "./core.mjs";
import { existsSync } from "node:fs";
import { join } from "node:path";

// A finding's message, trimmed to its lead clause for a one-line summary:
// split on " — " first (several finding generators use it deliberately as a
// clause separator), else on the first SENTENCE-ending period (one followed
// by whitespace or end of string) — never the first bare ".", which cuts a
// message off mid-path on anything naming a file (kanban.md, .gitattributes,
// .waypost/…) or a domain-shaped word.
function leadClause(message) {
  const dash = message.split(" — ")[0];
  return dash !== message ? dash : message.split(/\.(?:\s|$)/)[0];
}

// ─── next: what this project needs right now ───────────────────────────
//
// The judgement an agent otherwise has to make from scratch every session, made
// deterministically instead: read the state, rank what is actionable, print the
// command. Cheap by construction — no artifact content, one line per item.
function handleNext(args) {
  const cfg = readConfig();
  const items = [];
  if (!cfg || !cfg.vault_path) {
    process.stdout.write("not bound to a vault yet — run `waypost setup`\n");
    return;
  }
  const findings = (() => {
    try { return JSON.parse(run("doctor", ["--json"], { capture: true })); } catch { return []; }
  })();
  const by = (check, level) => findings.filter((f) => f.check === check && (!level || f.level === level));

  for (const f of findings.filter((f) => f.level === "issue")) {
    items.push([1, leadClause(f.message).slice(0, 110), repairFor(f)]);
  }
  const state = (() => {
    try { return JSON.parse(run("sessions", ["--json"], { capture: true })); } catch { return {}; }
  })();
  for (const c of (state.claims || []).filter((c) => c.session !== state.session_id)) {
    items.push([2, `${c.story} is being worked on by ${c.session} (${c.harness || "?"}, ${c.host})`,
      "coordinate before touching it"]);
  }
  // Ready work outranks warnings: an unblocked, unclaimed story is what a
  // session came for (WP-15). Three at most; `waypost ready` has the rest.
  const ready = (() => {
    try { return JSON.parse(run("ready", ["--json"], { capture: true })).ready || []; } catch { return []; }
  })();
  for (const s of ready.slice(0, 3)) {
    items.push([2, `ready: ${s.title} (${s.epic}, ${s.priority})`, `waypost story plan ${s.rel} --write`]);
  }
  for (const f of by("work-without-story", "warn")) {
    items.push([3, "source changes with no story open", 'waypost draft story <EPIC> "<title>" --write']);
  }
  for (const f of findings.filter((f) => f.level === "warn" && f.check !== "work-without-story")) {
    items.push([4, leadClause(f.message).slice(0, 110), repairFor(f)]);
  }
  for (const f of by("agent-roles", "info").concat(by("agents-block", "info"))) {
    items.push([5, leadClause(f.message).slice(0, 110), repairFor(f)]);
  }

  if (!items.length) {
    process.stdout.write(`nothing needs doing: vault consistent, ${selfInstallOff(cfg.vault_path) ? "" : "roles installed, "}no conflicting session.\n`
      + "Next feature-sized change starts with `waypost draft story <EPIC> \"<title>\" --write`.\n");
    return;
  }
  items.sort((a, b) => a[0] - b[0]);
  for (const [, what, how] of items.slice(0, 8)) {
    process.stdout.write(`- ${what}\n${how ? `    ${how}\n` : ""}`);
  }
  if (items.length > 8) process.stdout.write(`…and ${items.length - 8} more (waypost doctor)\n`);
}

function repairFor(f) {
  if (f.check === "code-refs") return "fix the path, or mark it (waiting)/(planned)/(deleted)";
  if (f.check === "supersedes") return "correct supersedes/superseded_by on both artifacts";
  if (f.check === "acceptance-gate") return "record the review outcome in review_status";
  const map = {
    kanban: "waypost reconcile --write", "code-map": "waypost reconcile --write", indexes: "waypost reconcile --write",
    graph: "waypost graph", "agent-roles": "waypost agents install", "agents-block": "waypost agents register",
    gitignore: "waypost doctor --fix", "vault-git": "waypost doctor --fix", "merge-driver": "waypost doctor --fix",
    "line-endings": "waypost doctor --fix", config: "waypost setup",
    "claude-bridge": "waypost doctor --fix", "claude-import-missing": "waypost doctor --fix", "instructions-size": "waypost doctor",
    "story-deps": "waypost ready --all", "adr-number": "waypost doctor", "adr-guard": "waypost doctor",
    "agent-skills": "waypost skills install", launcher: "waypost launcher --write",
  };
  return map[f.check] || null;
}

// ─── status ────────────────────────────────────────────────────────────

// The machine-wide cleanup-limit setting and the last automatic outcome
// (the amended ADR) — a machine-level fact, so it shows even for a project
// with no vault bound yet. Never throws: a broken read here must not take
// the rest of `waypost status` down with it.
async function cleanupStatusLine() {
  try {
    const presence = await import(SCRIPT_URL("presence"));
    const cleanup = await import(SCRIPT_URL("cleanup"));
    const host = presence.hostSlug();
    const setting = readCleanupSetting({ host });
    if (!setting) return "cleanup  none\n";
    const how = setting.gate && setting.gate.answer === true ? "terminal"
      : setting.gate && setting.gate.required === false ? "no gate required" : "gate";
    const checked = setting.gate ? setting.gate.checked : "unknown";
    let line = `cleanup  ${cleanup.formatLimit(setting.limit)} — set ${String(setting.set_at).slice(0, 10)} (${how}; gate: ${checked})\n`;
    const outcome = readLastAutoCleanup({ host });
    if (outcome) line += `        last run ${cleanup.formatOutcome(outcome)}\n`;
    return line;
  } catch {
    return "cleanup  none\n";
  }
}

async function handleStatus() {
  const p = configPath();
  const cfg = readConfig();
  process.stdout.write(`waypost ${VERSION}\n`);
  process.stdout.write(await cleanupStatusLine());
  if (!cfg) {
    process.stdout.write(`config  (none — run \`waypost bind <vault-path>\`)\n        expected at ${p}\n`);
    return;
  }
  process.stdout.write(`config  ${p}${bindingInfo().inherited_from ? `  (inherited from the main worktree ${bindingInfo().inherited_from})` : ""}\n`);
  process.stdout.write(`vault   ${cfg.vault_path || "(unset)"}${cfg.vault_path && !existsSync(cfg.vault_path) ? "  ⚠️ missing" : ""}\n`);
  process.stdout.write(`layout  ${cfg.layout || "engineering"}\n`);
  process.stdout.write(`lang    ${cfg.language || "en"}\n`);
  const a = cfg.agents || {};
  const pins = [
    ...(a.default && a.default.model ? [`default=${a.default.model}`] : []),
    ...Object.entries(a.per_agent || {}).map(([k, v]) => v && v.model ? `${k}=${v.model}` : null),
    ...Object.entries(a.per_harness || {}).map(([k, v]) => v && v.model ? `harness:${k}=${v.model}` : null),
  ].filter(Boolean);
  if (pins.length) process.stdout.write(`models  ${pins.join(" · ")}\n`);
  process.stdout.write("\n");
  // Who else is live on this vault, before anything about roles: on a shared
  // vault that is the fact that changes what you should do next.
  run("sessions", []);
  // Roles: a count, not five paragraphs. `waypost agents list` is one command away
  // when the detail is actually wanted.
  const st = JSON.parse(run("agents", ["list", "--json"], { capture: true }) || "{}");
  const per = (st.install || []).filter((h) => h.roles.some((r) => r.state !== "absent" && r.state !== "n/a"))
    .map((h) => `${h.harness}: ${h.roles.filter((r) => r.state === "current").length}/${h.roles.length}`);
  process.stdout.write(`roles   ${(st.roles || []).length} defined · ${per.length ? per.join(" · ") : "not installed"}`
    + `  (waypost agents list)\n`);
}

// Bare `waypost` is the most likely first thing anyone types. Answer the two
// questions they actually have — is this set up, and what do I do — rather than
// printing a manual.
function handleDefault() {
  const cfg = readConfig();
  if (!cfg || !cfg.vault_path) {
    process.stdout.write(`waypost ${VERSION} — not set up in ${projectRoot()}\n\n`
      + "  waypost setup         bind a vault, install the roles for this project's harnesses,\n"
      + "                    register them, and repair anything mechanical\n"
      + "  waypost setup --dry-run   see what that would do first\n"
      + "  waypost help          every command\n");
    return;
  }
  process.stdout.write(`waypost ${VERSION} · vault ${cfg.vault_path}\n\n`);
  handleNext([]);
  process.stdout.write("\nwaypost brief (orientation) · waypost help (every command)\n");
}

export { leadClause, handleNext, repairFor, cleanupStatusLine, handleStatus, handleDefault };
