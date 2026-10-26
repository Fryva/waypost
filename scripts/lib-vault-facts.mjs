import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import { join } from "node:path";
import { loadLayout, folderByKind } from "./lib-resources.mjs";
import { listEpicStories, listVaultStoryFiles, pathUnder } from "./lib-vault-files.mjs";
import { parseFrontmatter } from "./lib-frontmatter.mjs";
import { readVaultConfig } from "./lib-vault-policy.mjs";

// Contract 5 — per folder, non-recursive, `README.md` excluded. The epic folder
// counts epics and stories separately, through the shared story lister so that
// folder-shaped and standalone stories are counted the same way the rest of the
// plugin sees them. readdir/stat only: contract 14 forbids anything here that
// could materialize an evicted file, because this path has no budget at all.
function countFolder(vault, folder) {
  const dir = join(vault, folder.path);
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return folder.subfolder_per_id ? { epics: 0, stories: 0 } : { artifacts: 0 };
  }
  if (folder.subfolder_per_id) {
    let epics = 0;
    let stories = 0;
    for (const n of names) {
      if (n.startsWith(".")) continue;
      const full = join(dir, n);
      try {
        if (!statSync(full).isDirectory()) continue;
      } catch {
        continue;
      }
      // Contract 5 — an epic is a subdirectory containing `epic.md`, AND stories
      // come from the shared walker. Two clauses, and the gate belongs in front
      // of only the first: the walker does not require `epic.md`, so gating both
      // makes the count and the in-flight list disagree about the same vault
      // three lines apart — contract 12's argument at a smaller scale.
      stories += listEpicStories(full).length;
      if (!existsSync(join(full, "epic.md"))) continue;
      epics += 1;
    }
    return { epics, stories };
  }
  return { artifacts: names.filter((n) => n.endsWith(".md") && n !== "README.md").length };
}

// Contracts 12–15 — every read this payload needs, under ONE deadline.
//
// Two families race a single timer: the folder READMEs and the in-flight
// story scan. One timer rather than two because the budget is the user's
// startup latency, which does not divide. Each family degrades on its own
// terms, and a family that finished before expiry keeps its result — partial
// is the normal outcome, not a failure.
//
// Nothing here is synchronous except enumeration. The synchronous reader this
// module used to carry was deleted with this change rather than left as an
// invitation: a synchronous read of an evicted file blocks uninterruptibly
// inside one call and the timer never gets a turn.
export async function gatherVaultFacts(cfg, opts = {}) {
  // Trailing slashes: `bind` normalizes, a hand-edited config may not, and the
  // relativization below (stripping `vault + "/"` off each story path) is raw
  // arithmetic that a trailing slash would throw off by one character.
  const vault = String(cfg.vault_path || "").replace(/\/+$/, "");
  const budgetMs = opts.budgetMs ?? 200;
  const readFile = opts.readFile || ((p) => readFileAsync(p, "utf8"));

  // Contract 17 — the vault-not-found shape keeps working. Without this the
  // renderer answers with eight rows of authoritative zeros and the line
  // "nothing in progress" about a vault that does not exist: exactly the
  // silently-false claim contracts 13 and 21 spend paragraphs refusing.
  if (!existsSync(vault)) return { vaultMissing: true, vaultPath: vault };

  const layout = loadLayout(cfg.layout);
  const vcfg = readVaultConfig(vault);
  const adrFolder = folderByKind(layout, "adr") || folderByKind(layout, "spec");
  const epicFolder = folderByKind(layout, "epic");

  const folders = layout.folders.map((f) => ({
    path: f.path,
    kind: f.kind,
    counts: countFolder(vault, f),
    readme: null, // a read that lands fills this; contract 6 covers the rest
  }));

  const storyFiles = listVaultStoryFiles(vault);
  const inFlight = { status: "ok", entries: [], total: 0 };

  const done = { readmes: false, inFlight: false };

  const readmes = (async () => {
    for (const f of folders) {
      try {
        f.readme = String(await readFile(join(vault, f.path, "README.md")));
      } catch {
        /* contract 6: missing, empty and unreadable all fall back to the kind */
      }
    }
    done.readmes = true;
  })();

  const stories = (async () => {
    const found = [];
    for (const abs of storyFiles) {
      let text;
      try {
        text = await readFile(abs);
      } catch {
        continue;
      }
      const fm = parseFrontmatter(String(text)).data;
      if (!fm || fm.status !== "in-progress") continue;
      const rel = pathUnder(abs, vault) ?? abs;
      const seg = rel.split("/");
      const epic = epicFolder && seg[0] === epicFolder.path && seg[1] ? seg[1] : seg[0];
      found.push({ epic, title: String(fm.title || seg[seg.length - 1]), startedAt: fm.started_at || "" });
    }
    // Contract 15 — most recently started first, walker order as the tie-break,
    // which sort() preserves. Unstated, the cap would silently favour whichever
    // epic sorts first alphabetically, forever.
    found.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    inFlight.entries = found;
    inFlight.total = found.length;
    done.inFlight = true;
  })();

  let timer = null;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve("timeout"), budgetMs);
  });
  // Each family swallows its own rejection. Without this, a family that
  // rejects AFTER the deadline won leaves a derived promise with no handler:
  // node's default `--unhandled-rejections=throw` then exits the hook non-zero,
  // which is the "a hook never breaks session startup" contract 17 forbids.
  await Promise.race([
    Promise.all([readmes, stories].map((p) => p.catch(() => {}))).then(() => "ok"),
    deadline,
  ]);
  clearTimeout(timer);

  // Contract 13 — a family still outstanding degrades to its NAMED line. An
  // unfinished in-flight scan must not render as an empty list: that asserts
  // the vault is idle, which is a different and possibly false claim.
  if (!done.inFlight) inFlight.status = "timeout";

  return {
    vaultPath: vault,
    layoutName: layout.name || cfg.layout,
    language: cfg.language || "en",
    specPolicy: vcfg.spec_policy || "optional",
    // Empty means off, which is how doctor reads it. Printing "on" for an
    // unset key told sessions a gate was enforced when nothing enforced it.
    lifecycleGates: vcfg.lifecycle_gates || "off",
    kanbanFile: (layout.kanban && layout.kanban.file) || "kanban.md",
    adrIndex: adrFolder ? `${adrFolder.path}/README.md` : "README.md",
    epicFile: epicFolder ? `${epicFolder.path}/<EPIC>/epic.md` : "epic.md",
    folders,
    inFlight,
  };
}

