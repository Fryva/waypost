// Vault artifact, policy, link and workflow diagnostics.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseFrontmatter, vaultConfigPath, loadLayout, buildNodeIndex, extractLinks, resolveLinkTarget, listVaultStoryFiles, listEpicDirs, listEpicStories, openStoryFrom, lastVaultActivityMs, ENTRY_IGNORE, pathUnder } from "./lib.mjs";
import { uncommittedProjectFiles, lastCommitMs } from "./diff-refs.mjs";
import { harnessOwnedPaths } from "./agents.mjs";
import { stories as vaultStories } from "./ready.mjs";
import { walkVaultFiles } from "./doctor-artifacts.mjs";

function finding(group, level, check, message, file) {
  const f = { group, level, check, message };
  if (file) f.file = file;
  return f;
}

function listMd(dir) {
  try {
    return readdirSync(dir).filter((n) => n.endsWith(".md"));
  } catch {
    return [];
  }
}

// ─── Vault checks ──────────────────────────────────────────────────────

// Collect every structured artifact with parsed frontmatter.
export function scanArtifacts(cfg, layout) {
  const vault = cfg.vault_path;
  const artifacts = [];
  const push = (abs, rel, kind) => {
    let md;
    try { md = readFileSync(abs, "utf8"); } catch { return; }
    artifacts.push({ abs, rel, kind, fm: parseFrontmatter(md).data, body: md });
  };
  for (const folder of layout.folders) {
    const dir = join(vault, folder.path);
    if (!existsSync(dir)) continue;
    if (folder.kind === "epic") {
      for (const id of listEpicDirs(dir)) {
        const epicMd = join(dir, id, "epic.md");
        if (existsSync(epicMd)) push(epicMd, `${folder.path}/${id}/epic.md`, "epic");
        // listEpicStories sees all three story shapes (flat, folder, and
        // standalone epics/<id>/story-*.md) — a manual stories/*.md glob
        // silently dropped the other two from every vault-side check.
        for (const s of listEpicStories(join(dir, id))) {
          push(s.abs, `${folder.path}/${id}/${s.rel}`, "story");
        }
      }
    } else {
      for (const f of listMd(dir)) {
        if (f === "README.md") continue;
        push(join(dir, f), `${folder.path}/${f}`, folder.kind);
      }
    }
  }
  return artifacts;
}

// Suggestion for existing binds: specs exist but no vault policy declared.
// vaultCfg already degraded a parse failure to {} (readVaultConfig's own
// stderr warning) — a re-read here is the only way doctor can tell "no
// policy file" apart from "a policy file that no longer parses", and the
// second one silently drops spec_policy: required to optional with no other
// signal at all.
export function checkVaultPolicy(cfg, layout, artifacts, vaultCfg) {
  const out = [];
  const p = vaultConfigPath(cfg.vault_path);
  if (existsSync(p)) {
    try {
      JSON.parse(readFileSync(p, "utf8"));
    } catch (e) {
      out.push(finding("vault", "issue", "vault-policy",
        `<vault>/.projectstore.json is not valid JSON (${e.message}) — spec_policy and lifecycle_gates fall back to their defaults until it is fixed.`,
        ".projectstore.json"));
    }
  }
  const hasSpecs = artifacts.some((a) => a.kind === "spec");
  if (hasSpecs && !vaultCfg.spec_policy) {
    out.push(finding("vault", "info", "spec-policy",
      "Vault contains specs but declares no spec_policy — consider enabling spec-first: add { \"spec_policy\": \"required\" } to <vault>/.projectstore.json (doctor gates activate)."));
  }
  if (vaultCfg.spec_policy === "required" && !vaultCfg.spec_policy_since) {
    out.push(finding("vault", "warn", "spec-policy",
      "spec_policy is required but spec_policy_since is missing — the legacy exemption cannot be evaluated; stamp it with the enable date (ISO-8601)."));
  }
  // G-2: both gates are read as `["on", "true"].includes(...)` — anything else,
  // including a plausible-looking "yes", is silently off. Warn rather than let
  // a typo disable a gate the project believes it turned on.
  const GATE_VALUES = new Set(["on", "off", "true", "false"]);
  for (const key of ["lifecycle_gates", "acceptance_gate"]) {
    const raw = vaultCfg[key];
    if (raw === undefined || raw === null) continue;
    if (!GATE_VALUES.has(String(raw).toLowerCase())) {
      out.push(finding("vault", "warn", "vault-policy",
        `${key}: ${JSON.stringify(raw)} in <vault>/.projectstore.json is not on/off/true/false — it is read as off, silently.`,
        ".projectstore.json"));
    }
  }
  const si = vaultCfg.self_install;
  if (si !== undefined && si !== null && !["on", "off", "true", "false"].includes(String(si).toLowerCase())) {
    out.push(finding("vault", "warn", "vault-policy",
      `self_install: ${JSON.stringify(si)} in <vault>/.projectstore.json is not on/off — it is read as on: \`waypost brief\` installs roles and skills.`,
      ".projectstore.json"));
  }
  return out;
}

// Body links resolved through the ONE shared resolver (spec:
// vault-link-graph-derived-view-and-shared-link-resolver): dead stays an
// issue, ambiguous (multiple node candidates — invisible to the old
// basename-set check) is a NEW warn, out-of-scope (the target exists but
// is not an artifact: kanban, code-map, READMEs, attachments) is silent at
// every level. A deliberate, documented behavior change in both
// directions: tiered matching also accepts links the exact-basename check
// rejected (number-stripped slug readings), and path-qualified links now
// resolve as paths — a wrong relative depth is dead here even though
// Obsidian's basename fallback happens to heal it. The graph generator
// consumes the same resolver, so a dead edge in graph.md and a dead-link
// finding here are the same fact reported twice.
export function checkWikilinks(cfg, artifacts, vaultFiles = null, nodeIndex = null) {
  const out = [];
  const files = vaultFiles ?? walkVaultFiles(cfg.vault_path);
  let index = nodeIndex;
  if (!index) {
    try { index = buildNodeIndex(cfg, loadLayout(cfg.layout)); } catch (e) {
      // A silent no-op check would read as "links are fine" — say why not.
      return [finding("vault", "warn", "wikilink", `Link check skipped — node index failed: ${e.message}`)];
    }
  }
  // Share the lazy membership cache within this check, keeping source contexts separate.
  let fileSet;
  for (const a of artifacts) {
    const ctx = {
      sourceRel: a.rel,
      index,
      files,
      exists: (rel) => existsSync(join(cfg.vault_path, rel)),
    };
    if (fileSet) ctx._fileSet = fileSet;
    for (const link of extractLinks(a.body)) {
      const r = resolveLinkTarget(link.target, link.type, ctx);
      fileSet ??= ctx._fileSet;
      if (r.outcome === "dead") {
        out.push(link.type === "wikilink"
          ? finding("vault", "issue", "wikilink", `Dead wiki-link [[${link.target}]].`, a.rel)
          : finding("vault", "issue", "rel-link", `Dead relative link (${link.target}).`, a.rel));
      } else if (r.outcome === "ambiguous") {
        out.push(finding("vault", "warn", "wikilink",
          `Ambiguous wiki-link [[${link.target}]] — matches ${r.candidates.join(", ")}; qualify with a path.`, a.rel));
      }
    }
  }
  return out;
}

// Untracked work, after the fact (spec contract 18). The reminder fires at the
// moment of the act and cannot see Bash-mediated writes at all; this is the
// backstop, and it is where the reported incident was actually caught — at
// "done". Warn, never issue: spikes and hotfixes legitimately produce this
// state, and an issue would poison the SessionStart line.
export function checkWorkWithoutStory(cfg, proj) {
  const out = [];
  if (!cfg || !cfg.vault_path) return out;

  // The same predicate the hook uses, fed by a plain read: doctor is not on a
  // hot path and needs no budget, but it must not answer a different question.
  const files = listVaultStoryFiles(cfg.vault_path);
  const fms = [];
  let unreadable = 0;
  for (const f of files) {
    try { fms.push(parseFrontmatter(readFileSync(f, "utf8")).data); } catch { unreadable++; }
  }
  if (unreadable > 0 && !openStoryFrom(fms)) {
    // A diagnostic that goes quiet because it could not read is a false clean.
    out.push(finding("vault", "warn", "work-without-story",
      `Could not read ${unreadable} story file(s), so "is any story in progress" is unproven — this check is inconclusive rather than clean.`));
    return out;
  }
  if (openStoryFrom(fms)) return out;

  // ENTRY_IGNORE, not the shared set: waypost bind writes AGENTS.md,
  // CLAUDE.md and .gitignore in a session that by construction has no story, so
  // the shared set would make this fire on every project's first run.
  const all = uncommittedProjectFiles(proj, ENTRY_IGNORE);
  if (all === null) return out; // not a git repo, shallow, no commits, detached
  // Neither the vault's own artifacts nor a harness's generated files are work
  // on the codebase: a fresh `setup` scaffolds the vault and installs roles in
  // a session that by construction has no story, and counted every one (G-6).
  const under = (f, p) => f === p || f.startsWith(`${p}/`);
  const vaultAbs = resolve(cfg.vault_path);
  // pathUnder, not a `${proj}/` prefix: this one spelling of the question
  // survived the WP-18 sweep because it is a template literal, and on
  // Windows it made every file the vault owns read as untracked source work.
  const vaultRel = pathUnder(vaultAbs, resolve(proj)) || null;
  let owned = [];
  try { owned = harnessOwnedPaths(); } catch { /* an unreadable registry is doctor's own finding, not this check's */ }
  const dirty = all.filter((f) => !(vaultRel && under(f, vaultRel)) && !owned.some((p) => under(f, p)));

  // The other half: work that WAS committed, with no story to attribute it to.
  // In a repo of small frequent commits that is the common shape, and a
  // dirty-tree-only check would never see it.
  const vaultMs = lastVaultActivityMs(cfg.vault_path);
  const commitMs = lastCommitMs(proj);
  const committedSince = vaultMs !== null && commitMs !== null && commitMs > vaultMs;

  if (dirty.length === 0 && !committedSince) return out;

  // Upstream could add "and a reminder already fired N times" here, because a
  // hook was counting. Without hooks there is no such counter and no honest way
  // to claim one — the finding says what is on disk and nothing more.
  const what = [];
  if (dirty.length) what.push(`${dirty.length} uncommitted source file(s)`);
  if (committedSince) what.push("commits newer than the vault's last activity");
  out.push(finding("vault", "warn", "work-without-story",
    `${what.join(" and ")} in the project, and no story is in progress. If this is feature-sized work, open it in the vault: \`waypost draft story <EPIC> "<title>" --write\`.`));
  return out;
}

// `blocked_by` (WP-15): every reference must name a story, and the graph must
// have no cycle — a cycle is two stories each waiting for the other forever.
export function checkDependencies(vault) {
  const out = [];
  let all;
  try { all = vaultStories(vault); } catch (e) {
    return [finding("vault", "warn", "story-deps", `Stories not readable for dependency checks: ${e.message}`)];
  }
  const byRef = new Map(all.map((s) => [s.ref, s]));
  for (const s of all) {
    if (s.blocked_by_block_form) {
      out.push(finding("vault", "issue", "story-deps",
        `${s.ref}: blocked_by is written in block form, which the line-based frontmatter reader reads as empty — write it as a JSON list: blocked_by: ["<epic>/<stem>"].`, s.rel));
    }
    for (const b of s.blocked_by) {
      if (!byRef.has(b)) out.push(finding("vault", "issue", "story-deps",
        `${s.ref}: blocked_by names no story: ${JSON.stringify(b)} — use <epic>/<story-stem>, as \`waypost story\` prints it.`, s.rel));
    }
  }
  // Cycles: depth-first over the declared edges, reporting each cycle once.
  const state = new Map();
  const reported = new Set();
  const walk = (ref, trail) => {
    state.set(ref, "visiting");
    for (const b of (byRef.get(ref) || { blocked_by: [] }).blocked_by) {
      if (!byRef.has(b)) continue;
      const st = state.get(b);
      if (st === "visiting") {
        const cycle = trail.slice(trail.indexOf(b)).concat(b);
        const key = [...cycle].sort().join(" ");
        if (!reported.has(key)) {
          reported.add(key);
          out.push(finding("vault", "issue", "story-deps",
            `dependency cycle: ${cycle.join(" → ")} — each waits for the other; drop one blocked_by.`, byRef.get(ref).rel));
        }
      } else if (!st) walk(b, trail.concat(b));
    }
    state.set(ref, "done");
  };
  for (const s of all) if (!state.has(s.ref)) walk(s.ref, [s.ref]);
  return out;
}

// Two decisions with one number: what two sessions drafting in parallel
// produce (WP-15). Numbering is for humans, so the fix is a rename, not a hash.
export function checkAdrNumbers(vault, adrFolder = "adr") {
  const dir = join(vault, adrFolder);
  let names = [];
  try { names = readdirSync(dir).filter((n) => n.endsWith(".md")); } catch { return []; }
  const byNumber = new Map();
  for (const n of names) {
    const m = n.match(/^(\d{3,4})-/);
    if (!m) continue;
    const key = String(parseInt(m[1], 10));
    if (!byNumber.has(key)) byNumber.set(key, []);
    byNumber.get(key).push(n);
  }
  const out = [];
  const taken = [...byNumber.keys()].map(Number);
  const next = (taken.length ? Math.max(...taken) : 0) + 1;
  for (const files of byNumber.values()) {
    if (files.length < 2) continue;
    const shown = files[0].match(/^\d+/)[0];
    out.push(finding("vault", "issue", "adr-number",
      `two decisions share number ${shown}: ${files.join(", ")} — rename one to the next free number (${String(next).padStart(shown.length, "0")}) and fix the links to it.`, `${adrFolder}/${files[1]}`));
  }
  return out;
}

