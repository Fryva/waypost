// waypost — explicit mechanical Doctor repairs; diagnostics remain read-only.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { pluginRoot, pathUnder } from "./lib.mjs";
import { detectHarnesses } from "./agents.mjs";
import { mergeDriverCommand } from "./doctor-coordination.mjs";

// ─── Repairs (--fix, install group only) ───────────────────────────────
//
// Every repair here is mechanical and reversible by hand: appending gitignore
// lines, `git init` in the vault, re-rendering role files from agents/*.md,
// re-writing the routing block in place. Anything requiring judgement stays a
// finding. Vault-side repairs are reconcile's job, never this flag's.
export function applyFixes(cfg, proj, findings) {
  const done = [];
  const has = (check, level = null) =>
    findings.some((f) => f.check === check && (!level || f.level === level));

  if (has("gitignore")) {
    const p = join(proj, ".gitignore");
    let text = "";
    try { text = readFileSync(p, "utf8"); } catch {}
    const lines = text.split("\n").map((l) => l.trim());
    const add = [".waypost/projectstore.json", ".waypost/state/"].filter((w) => !lines.includes(w));
    if (add.length) {
      writeFileSync(p, `${text.replace(/\s*$/, "")}\n${add.join("\n")}\n`, "utf8");
      done.push(`.gitignore += ${add.join(", ")}`);
    }
  }

  if (has("vault-git") && cfg && cfg.vault_path) {
    const r = spawnSync("git", ["init", "-q", cfg.vault_path], { encoding: "utf8" });
    done.push(r.status === 0 ? `git init ${cfg.vault_path}` : `git init failed: ${(r.stderr || "").trim()}`);
  }

  // `agent-roles` only — never `agent-roles-foreign`, whose whole content is
  // "there is a file here that is not ours". install skips those anyway; not
  // triggering on them keeps the two facts independent.
  //
  // And never on `info` either: the info case is "this harness has no waypost roles
  // at all", which is a choice the user has not made yet. Repairing it turned
  // `--fix` into an installer — after `waypost agents uninstall`, the next `--fix`
  // put all fifteen files back.
  if (has("line-endings")) {
    const p = join(proj, ".gitattributes");
    let text = "";
    try { text = readFileSync(p, "utf8"); } catch {}
    {
      const existing = text.match(/^\*\s+text=auto.*$/m);
      if (existing && !/\beol=/.test(existing[0])) {
        // eol= is the load-bearing half: without it the rule normalises on
        // check-in and leaves checkout to core.eol, which is CRLF on Windows.
        writeFileSync(p, text.replace(existing[0], `${existing[0].trimEnd()} eol=lf`), "utf8");
        done.push(".gitattributes: `* text=auto` += eol=lf (checkout ending was left to core.eol)");
      } else if (!existing) {
        const block = "\n# waypost: one line-ending policy, or a Windows session's first commit\n"
          + "# rewrites every file it touches and conflicts with every parallel edit.\n"
          + "# eol=lf is not decoration: without it checkout falls back to core.eol.\n"
          + "* text=auto eol=lf\n*.md text eol=lf\n*.mjs text eol=lf\n";
        writeFileSync(p, `${text.replace(/\s*$/, "")}${text.trim() ? "\n" : ""}${block}`, "utf8");
        done.push(".gitattributes += text=auto eol=lf (one line-ending policy for every OS)");
      }
    }
  }

  if (has("merge-driver") && cfg && cfg.vault_path) {
    const rel = pathUnder(cfg.vault_path, proj);
    if (rel) {
      const p = join(proj, ".gitattributes");
      let text = "";
      try { text = readFileSync(p, "utf8"); } catch {}
      if (!/merge=waypost-derived/.test(text)) {
        const block = [
          "", "# waypost: derived views are regenerated from the artifacts, never merged.",
          "# `waypost merge-derived` re-derives them; see docs/vault/adr/0006-*.md.",
          `${rel}/kanban.md merge=waypost-derived`,
          `${rel}/graph.md merge=waypost-derived`,
          `${rel}/code-map.md merge=waypost-derived`,
          `${rel}/**/README.md merge=waypost-derived`, "",
        ].join("\n");
        writeFileSync(p, `${text.replace(/\s*$/, "")}${text.trim() ? "\n" : ""}${block}`, "utf8");
        done.push(".gitattributes += merge=waypost-derived for the derived views");
      }
      const a = spawnSync("git", ["config", "merge.waypost-derived.driver", mergeDriverCommand()], { cwd: proj, encoding: "utf8" });
      spawnSync("git", ["config", "merge.waypost-derived.name", "regenerate waypost derived views"], { cwd: proj, encoding: "utf8" });
      done.push(a.status === 0 ? "git config merge.waypost-derived.driver" : `git config failed: ${(a.stderr || "").trim()}`);
    }
  }

  if (has("agent-roles", "issue") || has("agent-roles", "warn")) {
    const harnesses = detectHarnesses(proj);
    if (harnesses.length) {
      const r = spawnSync(process.execPath,
        [join(pluginRoot(), "scripts", "agents.mjs"), "install", "--harness", harnesses.join(",")],
        { encoding: "utf8", env: { ...process.env, WAYPOST_PROJECT_DIR: proj } });
      done.push(r.status === 0
        ? `agents install --harness ${harnesses.join(",")}`
        : `agents install failed: ${(r.stderr || "").trim()}`);
    }
  }

  if (has("agent-skills", "issue") || has("agent-skills", "warn")) {
    const harnesses = detectHarnesses(proj);
    if (harnesses.length) {
      const r = spawnSync(process.execPath,
        [join(pluginRoot(), "scripts", "skills.mjs"), "install", "--harness", harnesses.join(",")],
        { encoding: "utf8", env: { ...process.env, WAYPOST_PROJECT_DIR: proj } });
      done.push(r.status === 0
        ? `skills install --harness ${harnesses.join(",")}`
        : `skills install failed: ${(r.stderr || "").trim()}`);
    }
  }

  if (has("claude-import-missing")) {
    // A bare `@NAME` written as if from the project root — the usual shape of
    // the mistake — is rewritten to the path that reaches that root file from
    // the importing file's directory. Anything else is left for the owner.
    for (const f of ["CLAUDE.md", ".claude/CLAUDE.md"]) {
      const p = join(proj, f);
      if (!existsSync(p)) continue;
      const before = readFileSync(p, "utf8");
      const after = before.replace(/^@(\S+)(\s*)$/gm, (line, raw, tail) => {
        if (raw.includes("/") || raw.startsWith("~")) return line;
        if (existsSync(resolve(dirname(p), raw)) || !existsSync(join(proj, raw))) return line;
        return `@${relative(dirname(p), join(proj, raw)).replace(/\\/g, "/")}${tail}`;
      });
      if (after !== before) {
        writeFileSync(p, after, "utf8");
        done.push(`${f}: import rewritten to resolve against the file itself`);
      }
    }
  }

  if (has("claude-bridge")) {
    const p = join(proj, "CLAUDE.md");
    const before = existsSync(p) ? readFileSync(p, "utf8") : "";
    writeFileSync(p, before.trim() ? `@AGENTS.md\n\n${before}` : "@AGENTS.md\n", "utf8");
    done.push(before.trim() ? "CLAUDE.md: `@AGENTS.md` import added at the top" : "CLAUDE.md created with `@AGENTS.md` (Claude Code reads it, not AGENTS.md)");
  }

  if (has("agents-block", "issue")) {
    const r = spawnSync(process.execPath,
      [join(pluginRoot(), "scripts", "agents.mjs"), "register"],
      { encoding: "utf8", env: { ...process.env, WAYPOST_PROJECT_DIR: proj } });
    done.push(r.status === 0 ? "agents register" : `agents register failed: ${(r.stderr || "").trim()}`);
  }

  return done;
}

