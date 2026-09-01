#!/usr/bin/env node
// mps — brief.mjs
// The session-start orientation packet, on demand.
//
// Upstream injected this through Claude Code's SessionStart hook. A hook is
// exactly the thing this fork cannot have in three harnesses, so the same
// payload is printed by a command instead: a rule ("run `mps brief` when you
// start work in this project") reaches Claude Code, Codex and OpenCode alike.
//
// What it prints is a SKELETON, not vault content: where things live, how many
// of each, what is in flight, and the order to read the vault in. It does not
// grow with the vault — descend on demand from here.
//
// CLI: node brief.mjs [--json] [--budget <ms>]

import { fileURLToPath } from "node:url";
import { readConfig, gatherVaultFacts, renderVaultSkeleton, ignoreEpipe } from "./lib.mjs";
import { peers, readLeases } from "./presence.mjs";
import { sessionId } from "./sessions.mjs";

export async function brief(cfg, opts = {}) {
  const facts = await gatherVaultFacts(cfg, opts);
  return { facts, text: renderVaultSkeleton(facts) + others(cfg, opts) };
}

// Who else is working on this vault right now — the first thing that matters
// when the same project is open in another harness, on another machine, in
// another OS. Never fails the brief: presence is advisory, and a vault that has
// never been shared has nothing to say here.
function others(cfg, opts = {}) {
  try {
    const self = opts.sessionId || sessionId();
    const view = peers(cfg.vault_path, { self });
    const live = view.peers.filter((p) => p.live && !p.self);
    const leases = readLeases(cfg.vault_path, { self }).filter((l) => l.live && !l.mine);
    if (!live.length && !leases.length && view.storage.kind === "local") return "";
    const L = ["", "## Who else is working here", ""];
    if (view.storage.kind !== "local") {
      L.push(`Vault is on ${view.storage.provider} (${view.storage.kind}) — another device's presence can be up to ~${Math.round(view.storage.lag_ms / 1000)}s behind this list.`, "");
    }
    if (!live.length) L.push("- nobody else is live right now");
    for (const p of live) {
      L.push(`- **${p.session}** — ${p.harness || "unknown harness"} on ${p.host} (${p.os})`
        + `${p.claim && p.claim.story ? `, working on \`${p.claim.story}\`` : ""}`);
    }
    if (leases.length) {
      L.push("", "Files another session is editing right now — do not touch them without asking:");
      for (const l of leases) L.push(`- \`${l.path}\` (${l.session} on ${l.host})`);
    }
    if (view.conflicts.length) {
      L.push("", `⚠️ the sync client left conflicted copies in the presence directory (${view.conflicts.join(", ")}) — two devices wrote at once.`);
    }
    return L.join("\n") + "\n";
  } catch { return ""; }
}

async function main() {
  ignoreEpipe();
  const args = process.argv.slice(2);
  const cfg = readConfig();
  if (!cfg || !cfg.vault_path) {
    process.stderr.write("mps brief: no bound vault — run `mps bind <vault-path>` first\n");
    process.exit(1);
  }
  const i = args.indexOf("--budget");
  let budgetMs = 400;
  if (i !== -1) {
    budgetMs = Number(args[i + 1]);
    if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
      process.stderr.write(`mps brief: --budget takes a positive number of milliseconds, got "${args[i + 1]}"\n`);
      process.exit(1);
    }
  }
  const { facts, text } = await brief(cfg, { budgetMs });
  process.stdout.write(args.includes("--json") ? JSON.stringify(facts, null, 2) + "\n" : text);
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    process.stderr.write(`mps brief: ${e.message}\n`);
    process.exit(1);
  });
}
