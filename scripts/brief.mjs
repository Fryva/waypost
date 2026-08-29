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

export async function brief(cfg, opts = {}) {
  const facts = await gatherVaultFacts(cfg, opts);
  return { facts, text: renderVaultSkeleton(facts) };
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
  const budgetMs = i !== -1 && args[i + 1] ? Number(args[i + 1]) : 400;
  const { facts, text } = await brief(cfg, { budgetMs });
  process.stdout.write(args.includes("--json") ? JSON.stringify(facts, null, 2) + "\n" : text);
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    process.stderr.write(`mps brief: ${e.message}\n`);
    process.exit(1);
  });
}
