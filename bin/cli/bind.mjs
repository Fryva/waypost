// Waypost CLI: bind.
import { expandHome, readVaultConfig, selfInstallOff, storedVaultPath, writeVaultConfig } from "../../scripts/lib.mjs";
import { selfInstall } from "./brief.mjs";
import { ROOT, VERSION, fail, flag, opt, positionals, projectRoot, readConfig } from "./core.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

// ─── bind ──────────────────────────────────────────────────────────────

// A-2: shared by handleBind (a --layout flag) and handleScaffold (a layout
// already sitting in .waypost/projectstore.json) — a bad value in either place
// must get this same actionable message, not a raw ENOENT from whichever
// readFileSync happens to hit it first.
function checkLayoutExists(layout) {
  if (!existsSync(join(ROOT, "scaffold", "layouts", `${layout}.json`))) {
    fail(`unknown layout "${layout}" — available: ${readdirSync(join(ROOT, "scaffold", "layouts")).map((n) => n.replace(/\.json$/, "")).join(", ")}`);
  }
}

function handleBind(args) {
  const [vault] = positionals(args);
  if (!vault) fail('bind <vault-path> [--layout engineering] [--lang en|ru|es|de|fr|zh] [--self-install off|on]');
  const selfInstall = opt(args, "--self-install");
  if (selfInstall !== null && !["off", "on"].includes(selfInstall)) fail("--self-install takes off or on");
  // An unreadable policy file would read as {} and be overwritten with one key,
  // dropping spec_policy and the gates; refuse before anything is written.
  const policyPath = join(resolve(expandHome(vault)), ".projectstore.json");
  if (selfInstall !== null && existsSync(policyPath)) {
    let v; try { v = JSON.parse(readFileSync(policyPath, "utf8")); } catch { v = null; }
    if (!v || typeof v !== "object" || Array.isArray(v)) fail(`${policyPath} is not a JSON object — fix it before --self-install changes it`);
  }
  const abs = resolve(expandHome(vault));
  // A re-bind keeps what the project already chose: `waypost bind <same vault>`
  // used to reset language and layout to their defaults unless both flags were
  // repeated, which is how a Russian vault came back English.
  const existing = readConfig();
  const layout = opt(args, "--layout", (existing && existing.layout) || "engineering");
  const lang = opt(args, "--lang", (existing && existing.language) || "en");
  checkLayoutExists(layout);
  if (!existsSync(join(ROOT, "templates", lang))) {
    fail(`unknown language "${lang}" — available: ${readdirSync(join(ROOT, "templates")).filter((n) => !n.includes(".")).join(", ")}`);
  }
  if (existing && existing.vault_path && resolve(existing.vault_path) !== abs && !flag(args, "--force")) {
    fail(`already bound to ${existing.vault_path} — re-run with --force to rebind to ${abs}`);
  }
  mkdirSync(abs, { recursive: true });
  const cfgPath = join(projectRoot(), ".waypost", "projectstore.json");
  mkdirSync(dirname(cfgPath), { recursive: true });
  const stored = storedVaultPath(abs);
  const cfg = {
    ...(existing || {}),
    vault_path: stored,
    layout,
    language: lang,
    default_author: (existing && existing.default_author) || gitUser(),
    waypost: { version: VERSION },
  };
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  process.stdout.write(`bound  ${abs}${stored !== abs ? `  (stored as ${stored}, relative to the project)` : ""}\nconfig ${cfgPath}\n`);
  process.env.WAYPOST_PROJECT_DIR = projectRoot();
  handleScaffold([]);
  // The opt-out lives in the committed vault policy, so every clone sees it;
  // merged, never replacing the other policy keys.
  if (selfInstall !== null && (selfInstall === "off" || existsSync(policyPath))) {
    const { self_install: _drop, ...rest } = readVaultConfig(abs);
    writeVaultConfig(abs, selfInstall === "off" ? { ...rest, self_install: "off" } : rest);
    process.stdout.write(`self_install ${selfInstall} in ${join(abs, ".projectstore.json")} — commit it\n`);
  }
  process.stdout.write(
    "\nnext:\n" +
    (selfInstallOff(abs) ? "" : "  waypost agents install         install the roles into the harnesses this project uses\n") +
    '  waypost draft adr "<title>" --write\n' +
    "  waypost doctor\n",
  );
}

function gitUser() {
  const r = spawnSync("git", ["config", "--get", "user.name"], { encoding: "utf8" });
  return (r.stdout || "").trim() || process.env.USER || "unknown";
}

// ─── scaffold ──────────────────────────────────────────────────────────

// The deterministic half of upstream's /bind: layout folders and their index
// READMEs. Prose lives in prompts/bind.md; the directories are mechanical, so
// they are the CLI's job and never an LLM's.
function handleScaffold(args) {
  const cfg = readConfig();
  if (!cfg || !cfg.vault_path) fail("no bound vault — run `waypost bind <vault-path>` first");
  checkLayoutExists(cfg.layout || "engineering");
  const layout = JSON.parse(readFileSync(join(ROOT, "scaffold", "layouts", `${cfg.layout || "engineering"}.json`), "utf8"));
  const lang = cfg.language || "en";
  const created = [];
  for (const folder of layout.folders) {
    const dir = join(cfg.vault_path, folder.path);
    if (!existsSync(dir)) { mkdirSync(dir, { recursive: true }); created.push(folder.path + "/"); }
    if (!folder.readme) continue;
    const p = join(dir, "README.md");
    if (existsSync(p)) continue;
    const tmpl = readFileSync(join(ROOT, "templates", lang, "folder-readme.md.tmpl"), "utf8");
    const title = folder.path.charAt(0).toUpperCase() + folder.path.slice(1);
    // doctor reads the first prose paragraph as the folder's purpose, so the
    // default has to say what the folder holds, not merely name it.
    writeFileSync(p, tmpl
      .replace(/\{\{folder_name\}\}/g, title)
      .replace(/\{\{folder_description\}\}/g,
        `\`${folder.kind}\` artifacts of the \`${layout.name}\` layout, maintained by waypost.`), "utf8");
    created.push(`${folder.path}/README.md`);
  }
  if (flag(args, "--json")) { process.stdout.write(JSON.stringify({ created }, null, 2) + "\n"); return; }
  if (!created.length) process.stdout.write("scaffold: vault already complete\n");
  else process.stdout.write(`scaffold: created ${created.length} item(s)\n  ${created.join("\n  ")}\n`);
}

export { checkLayoutExists, handleBind, gitUser, handleScaffold };
