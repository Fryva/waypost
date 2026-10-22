// Waypost CLI: artifacts.
import { isInsideVault, storyRefOf, writeFileAtomic } from "../../scripts/lib.mjs";
import { ROOT, SCRIPT, SCRIPT_URL, fail, flag, opt, positionals, readConfig, runJson } from "./core.mjs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// ─── draft ─────────────────────────────────────────────────────────────

function handleDraft(args) {
  const pos = positionals(args);
  const [kind, ...rest] = pos;
  if (!kind || !rest.length) {
    fail('draft <adr|spec|epic|story|research|concept|meeting|runbook> "<title>" [--write] [--lang <code>]\n' +
         '       draft epic <EPIC-ID> "<title>"   |   draft story <EPIC-ID> "<title>"');
  }
  const lang = opt(args, "--lang");
  const out = runJson("draft", [kind, ...rest, ...(lang ? ["--lang", lang] : [])]);
  if (!flag(args, "--write")) {
    if (flag(args, "--json")) { process.stdout.write(JSON.stringify(out, null, 2) + "\n"); return; }
    // A preview used to print the whole rendered artifact — several hundred
    // tokens of template the reader is about to see on disk anyway. What a
    // decision needs is: where it lands, what the index row says, what is wrong.
    process.stdout.write(`would create ${out.path}\n`);
    if (out.index && out.index.line) process.stdout.write(`index row     ${out.index.line}\n`);
    if (out.collision) process.stdout.write(`⚠️  collision  "${out.collision.identity || ""}" already exists as ${out.collision.with}\n`);
    for (const w of out.warnings || []) process.stdout.write(`⚠️  ${w}\n`);
    const head = String(out.content).split("\n").slice(0, 8).join("\n");
    process.stdout.write(`\n${head}\n…\n\n--write to create it · --json for the full payload\n`);
    return;
  }
  if (out.collision) {
    fail(`topic collision: "${out.collision.identity || kind}" already exists as ${out.collision.with}. ` +
         "Extend that artifact, or pick a different title.");
  }
  if (existsSync(out.path)) fail(`refusing to overwrite ${out.path}`);
  mkdirSync(dirname(out.path), { recursive: true });
  // sweep:false — this directory is not reconcile's own regeneration loop,
  // so there is no reason to pay for scanning it for orphaned temps here.
  writeFileAtomic(out.path, out.content, { sweep: false });
  process.stdout.write(`created ${out.path}\n`);
  for (const w of out.warnings || []) process.stdout.write(`⚠️  ${w}\n`);
  // The index row and the board are derived views: regenerate rather than
  // patch, so a hand-edit can never leave them permanently out of step. The
  // artifact is already on disk at this point, so a reconcile failure must be
  // reported against it rather than exiting as if the write had not happened.
  reconcileAfterWrite();
}

function reconcileAfterWrite() {
  const r = spawnSync(process.execPath, [SCRIPT("reconcile"), "--write"], {
    encoding: "utf8", env: { ...process.env, WAYPOST_HOME: ROOT },
  });
  let failed = [];
  let did = null;
  try {
    const out = JSON.parse(r.stdout || "{}");
    failed = [out.kanban, out.codemap, out.graph, ...(out.indexes || [])]
      .filter((t) => t && t.error).map((t) => `${t.path || t.target || "?"}: ${t.error}`);
    // Name only the views that were actually (re)written: the message used to
    // claim "code-map, graph" even on a fresh vault where both are skipped by
    // design, one line above doctor's own "No graph.md yet" (E-2).
    const wrote = [];
    if ((out.indexes || []).some((t) => t && t.written)) wrote.push("indexes");
    for (const k of ["kanban", "codemap", "graph"]) if (out[k] && out[k].written) wrote.push(k === "codemap" ? "code-map" : k);
    did = wrote;
  } catch { /* fall through to the exit code */ }
  if (r.status === 0 && !failed.length) {
    process.stdout.write(did && did.length
      ? `derived views reconciled (${did.join(", ")})\n`
      : did ? "derived views already up to date\n"
      : "derived views reconciled\n");
    return;
  }
  process.stderr.write("waypost: the artifact was written, but reconciling the derived views failed:\n"
    + (failed.length ? failed.map((f) => `  ${f}\n`).join("") : `  ${(r.stderr || "").trim()}\n`)
    + "  fix the cause, then run `waypost reconcile --write`.\n");
  process.exitCode = 1;
}

// ─── story gates ───────────────────────────────────────────────────────

async function handleStory(args) {
  const [mode, storyPath] = positionals(args);
  if (!["plan", "close"].includes(mode) || !storyPath) {
    fail("story <plan|close> <story-path> [--write]");
  }
  const out = runJson("story-section", [mode, storyPath]);
  if (!flag(args, "--write")) {
    process.stdout.write(JSON.stringify({ ...out, content: undefined }, null, 2) + "\n");
    process.stdout.write("(preview only — re-run with --write to apply)\n");
    return;
  }
  // story-section.mjs will transform any file with a frontmatter block, not
  // only a real vault story — refuse to write anywhere outside the bound
  // vault rather than trust a positional path the caller supplied.
  const cfg = readConfig();
  if (!cfg || !cfg.vault_path || !isInsideVault(resolve(out.path), cfg.vault_path)) {
    fail(`refusing to write outside the vault: ${out.path}`);
  }
  if (!out.changed) { process.stdout.write(`unchanged ${out.path}\n`); return; }
  // Re-check against the file story-section actually read: between that read
  // and this write another session (or a hand edit) may have changed it, and
  // `content` was computed from the OLD bytes — writing it now would silently
  // discard the concurrent edit.
  let current;
  try { current = readFileSync(out.path, "utf8"); } catch (e) { fail(`${out.path}: ${e.message}`); }
  if (createHash("sha256").update(current, "utf8").digest("hex") !== out.original_sha256) {
    fail(`${out.path} changed since it was read — re-run`);
  }
  // sweep:false — same reasoning as handleDraft's write.
  // Loaded here, not at the top: this is its only caller, and a static import
  // linked the whole team graph into every command. No try/catch — if the
  // team code cannot load, the gate must refuse, not be skipped.
  const { withTeamArtifactGate } = await import(SCRIPT_URL("team-legacy"));
  withTeamArtifactGate(cfg.vault_path,out.path,mode,()=>{
    const latest=readFileSync(out.path,'utf8');
    if(createHash('sha256').update(latest,'utf8').digest('hex')!==out.original_sha256)throw new Error('story-changed-before-write');
    writeFileAtomic(out.path, out.content, { sweep: false });
  });
  process.stdout.write(`${mode}  ${out.path}\n  ${(out.notes || []).join("\n  ")}\n`);
  // Opening a story claims it for this session; closing it releases the claim.
  // Other harnesses on the same vault read that registry, so the gate is also
  // the announcement — nobody has to remember a separate command.
  claimForStory(mode === "plan" ? out.path : null, cfg.vault_path);
  reconcileAfterWrite();
}

function claimForStory(storyPath, vault) {
  // Warn, do not refuse: re-planning a story someone else opened changes the
  // file idempotently, and the moment that actually needs a gate is the commit.
  // But the session that is about to duplicate work should hear about it here.
  if (storyPath) {
    const r = spawnSync(process.execPath, [SCRIPT("sessions"), "--json"], {
      encoding: "utf8", env: { ...process.env, WAYPOST_HOME: ROOT },
    });
    try {
      const { claims = [], session_id: self } = JSON.parse(r.stdout || "{}");
      const ref = storyRefOf(storyPath, vault);
      const others = ref ? claims.filter((c) => c.story === ref && c.session !== self) : [];
      if (others.length) {
        process.stderr.write(`⚠️  ${ref} is already claimed by ${others.map((o) => `${o.session} (${o.harness || "?"})`).join(", ")}`
          + " — two sessions on one story is how the same work gets done twice.\n");
      }
    } catch { /* the registry is advisory; never block the gate on it */ }
  }
  const args = storyPath ? ["--claim", storyPath] : ["--release"];
  const r = spawnSync(process.execPath, [SCRIPT("sessions"), ...args], {
    encoding: "utf8", env: { ...process.env, WAYPOST_HOME: ROOT },
  });
  if (r.error || r.status !== 0) {
    const reason = r.error?.message || (r.stderr || "").split("\n").find((l) => /^(Error:|waypost)/.test(l)) || `exit ${r.status}`;
    process.stderr.write(`waypost story: story updated, but ${storyPath ? "claim" : "release"} failed; coordination is incomplete.\n`
      + (storyPath ? "Retry the story command" : "Retry with `waypost sessions --release`")
      + " with write access to the coordination directory (normally .git/waypost).\n"
      + `${reason}\n`);
  }
  const line = (r.stdout || "").split("\n").find((l) => l.startsWith("claimed") || l.startsWith("released"));
  if (line) process.stdout.write(`  ${line.trim()}  (visible to other sessions via \`waypost sessions\`)\n`);
}

export { handleDraft, reconcileAfterWrite, handleStory, claimForStory };
