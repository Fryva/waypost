import { join, resolve } from "node:path";
import { hostname, platform } from "node:os";
import { spawnSync } from "node:child_process";
import { readConfig, projectRoot, gitCommonDir, mainWorktree } from "./lib.mjs";

// ─── Storage ───────────────────────────────────────────────────────────

// How long a write here may take to become visible on another device, and how
// long to wait before re-reading our own write to see whether someone else's
// landed too. Numbers are deliberately conservative: being early is a false
// conflict, being late is a slow command.
const STORAGE = {
  local:   { lag_ms: 0,       settle_ms: 150 },
  network: { lag_ms: 3_000,   settle_ms: 1_500 },
  cloud:   { lag_ms: 60_000,  settle_ms: 4_000 },
};

export function storageOf(path) {
  const p = String(path || "");
  // Cloud-sync roots are recognisable by path on every OS that has them.
  if (/Library\/Mobile Documents|com~apple~CloudDocs|iCloud Drive/i.test(p)) return { kind: "cloud", provider: "iCloud", ...STORAGE.cloud };
  if (/\/Dropbox(\/|$)|\\Dropbox(\\|$)/i.test(p)) return { kind: "cloud", provider: "Dropbox", ...STORAGE.cloud };
  if (/Google ?Drive|My Drive/i.test(p)) return { kind: "cloud", provider: "Google Drive", ...STORAGE.cloud };
  if (/OneDrive/i.test(p)) return { kind: "cloud", provider: "OneDrive", ...STORAGE.cloud };
  if (/Yandex\.?Disk|YandexDisk/i.test(p)) return { kind: "cloud", provider: "Yandex Disk", ...STORAGE.cloud };
  if (/^\\\\/.test(p)) return { kind: "network", provider: "UNC share", ...STORAGE.network };
  if (platform() === "darwin" && /^\/Volumes\//.test(p)) return { kind: "network", provider: "mounted volume", ...STORAGE.network };
  const fs = mountTypeOf(p);
  if (fs && /^(nfs|smbfs|cifs|afpfs|webdav|fuse|sshfs|9p|virtiofs)/i.test(fs)) {
    return { kind: "network", provider: fs, ...STORAGE.network };
  }
  return { kind: "local", provider: fs || platform(), ...STORAGE.local };
}

function mountTypeOf(p) {
  try {
    if (platform() === "win32") return null;
    const r = spawnSync("df", ["-P", "-T", p], { encoding: "utf8", timeout: 3000 });
    if (r.status === 0) {
      const line = (r.stdout || "").trim().split("\n").pop() || "";
      return line.split(/\s+/)[1] || null;
    }
    // macOS df has no -T; `mount` names the type in parentheses.
    const m = spawnSync("mount", [], { encoding: "utf8", timeout: 3000 });
    const rows = (m.stdout || "").split("\n")
      .map((l) => l.match(/^(\S+) on (.+?) \((\w+)/))
      .filter(Boolean)
      .filter(([, , mp]) => p === mp || p.startsWith(mp.replace(/\/$/, "") + "/"))
      .sort((a, b) => b[2].length - a[2].length);
    return rows.length ? rows[0][3] : null;
  } catch { return null; }
}

// ─── Paths ─────────────────────────────────────────────────────────────

// ─── Where coordination lives (ADR-0010) ───────────────────────────────
//
// Inside a repository, presence and leases live in the git common dir —
// `<.git>/waypost/<vault key>/` — which every worktree of that repository
// shares and `git clean` never touches; the key is the vault's path relative
// to the project root, so two bound subprojects of one monorepo stay apart
// while two worktrees of one project (same relative path) meet. Outside a
// repository, or in a bare one, the ADR-0007 place stays: `<vault>/.projectstore/`,
// the synchronised directory itself. `coordination_dir` in the binding
// overrides both. The legacy session registry is not here — it stays in the
// vault for upstream ProjectStore (ADR-0004).
//
// Migration: for one minor version writers write both places and readers
// merge both, so a peer on the previous version keeps seeing claims and
// leases (`legacy` is null once the two coincide).
const _coord = new Map();
export function coordinationDirs(vault) {
  const root = projectRoot();
  const key = `${root}\u0000${vault}`;
  if (_coord.has(key)) return _coord.get(key);
  const norm = (s) => String(s).replace(/\\/g, "/").replace(/\/+$/, "");
  const legacy = join(vault, ".projectstore");
  let primary = legacy;
  let cfg = null;
  try { cfg = readConfig(); } catch { cfg = null; }
  if (cfg && cfg.coordination_dir) {
    primary = resolve(mainWorktree(root) || root, String(cfg.coordination_dir));
  } else {
    const common = gitCommonDir(root);
    const rel = norm(vault) === norm(root) ? "" : norm(vault).startsWith(norm(root) + "/") ? norm(vault).slice(norm(root).length + 1) : null;
    if (common && rel !== null) primary = join(common, "waypost", rel === "" ? "vault" : rel.replace(/\//g, "-"));
  }
  const out = { primary, legacy: norm(primary) === norm(legacy) ? null : legacy, common: gitCommonDir(root) };
  _coord.set(key, out);
  return out;
}
export const presenceDir = (vault) => join(coordinationDirs(vault).primary, "presence");
export const leaseDir = (vault) => join(coordinationDirs(vault).primary, "leases");
export const legacyPresenceDir = (vault) => { const l = coordinationDirs(vault).legacy; return l ? join(l, "presence") : null; };
export const legacyLeaseDir = (vault) => { const l = coordinationDirs(vault).legacy; return l ? join(l, "leases") : null; };
// One cache per observing HOST, not per project directory: "machine-local" has
// to hold even when the project directory itself sits on a sync drive, or two
// devices sharing it would read each other's clock stamps — the exact
// comparison assumption 1 rules out — and flip every verdict on every command.
export const hostSlug = () => hostname().split(".")[0].replace(/[^\w.-]+/g, "_");
export const observationsPath = () => join(projectRoot(), ".waypost", "state", `peers.${hostSlug()}.json`);

