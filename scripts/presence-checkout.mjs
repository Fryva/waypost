import { resolve } from "node:path";
import { hostname } from "node:os";
import { projectRoot, gitCommonDir, treesOverlap } from "./lib.mjs";
import { storageOf } from "./presence-storage.mjs";
import { peers } from "./presence-liveness.mjs";

// A lease is keyed by a path every session spells the same way: vault-relative
// inside the vault, project-relative outside it (`waypost commit` compares leases
// against `git diff --cached --name-only`, which is project-relative), and
// absolute only when the path is under neither. A relative argument is taken
// from the project root, as `waypost commit -- <paths>` takes it. The raw string
// used to go in as typed, so `waypost lease /abs/proj/src/x.rs` recorded a lease
// no staged path could ever match.
const normPath = (s) => String(s || "").replace(/\\/g, "/").replace(/\/+$/, "");
const underPath = (a, base) => (a === base ? "" : a.startsWith(base + "/") ? a.slice(base.length + 1) : null);
export const vaultRel = (p, vault) => {
  const abs = normPath(resolve(projectRoot(), String(p)));
  const inVault = underPath(abs, normPath(vault));
  if (inVault !== null) return inVault;
  const inProject = underPath(abs, normPath(projectRoot()));
  return inProject !== null ? inProject : abs;
};

// Where the vault sits inside the checkout ("vault", "docs/vault", "." when
// the vault is the checkout), or null when it lives outside. Every presence
// record carries it: it is what lets a session on another OS tell "the same
// checkout" from "the same vault" — see sharedTree().
export function vaultOffset(vault) {
  if (!vault) return null;
  const rel = underPath(normPath(vault), normPath(projectRoot()));
  return rel === null ? null : rel === "" ? "." : rel;
}

// ─── A shared checkout ─────────────────────────────────────────────────
//
// ADR-0007 modelled a shared VAULT. What happened in the field (2026-09-03) was
// a shared CHECKOUT: two machines on one working copy, and a `git checkout --
// <file>` on one of them reverted an edit the other had verified but not yet
// committed. Git runs no hook before checkout/restore/stash/reset/clean, so
// this cannot be prevented — only named while it still matters. Signals, all
// about a live peer and all advisory like everything else here:
//   - same git common dir and a different project root: a SIBLING WORKTREE
//     of this repository (ADR-0010) — named as such, never "shared checkout",
//     never a --all refusal; its leases on paths edited here are a merge
//     conflict on its way;
//   - another host reporting OUR project root: the same directory, shared;
//   - a peer with no repository at all, on another host, while our project
//     root sits on cloud/network storage: probably the same directory.
// Two sessions on one machine in one checkout are ADR-0006's case (leases).
// The vault-offset signal of the first version is retired: once records
// travel through .git, "same offset" no longer means "same checkout".
// `contain` (the machine-wide-limit ADR, Decision 4's own "no other host
// shares the checkout" check): "same project root" widens from exact
// equality to treesOverlap — a peer whose root is an ANCESTOR or a
// DESCENDANT of ours counts too, not only an identical one. Every other
// signal (sibling worktrees, the no-repository-at-all cloud/network case) is
// unchanged; this is strictly about how "same root" itself is decided.
export function sharedTree(vault, { self = null, now = Date.now(), persist = true, view = null, contain = false } = {}) {
  const v = view || peers(vault, { self, now, persist });
  const root = normPath(projectRoot());
  const here = hostname().split(".")[0];
  const storage = storageOf(projectRoot());
  const common = gitCommonDir();
  const osPlatform = process.platform;
  const describe = (p, basis) => ({
    session: p.session, host: p.host, harness: p.harness || null, os: p.os || null,
    project_root: p.project_root || null, basis,
  });
  const found = [];
  const siblings = [];
  for (const p of v.peers) {
    if (!p.live || p.self) continue;
    const sameRoot = p.project_root && (contain ? treesOverlap(p.project_root, root, { platform: osPlatform }) : normPath(p.project_root) === root);
    const sameCommon = common && p.common_dir && normPath(p.common_dir) === normPath(common);
    if (sameCommon && !sameRoot) { siblings.push(describe(p, "sibling worktree of this repository")); continue; }
    if (!p.host || p.host === here) continue;
    if (sameRoot) found.push(describe(p, "same project root"));
    else if (!sameCommon && !p.common_dir && storage.kind !== "local") found.push(describe(p, `project root on ${storage.provider}`));
  }
  return { shared: found.length > 0, with: found, siblings, storage };
}

// One sentence every gate repeats, so brief, sessions and commit agree on what
// a shared checkout means and on the one rule that helps.
export const SHARED_TREE_ADVICE = "an uncommitted edit here is uncommitted on their side too: "
  + "`git checkout --`, `restore`, `stash`, `reset --hard` or `clean` from either side erases the other's unsaved work, "
  + "and git has no hook to stop it. Commit verified work at once (`waypost commit -- <paths>`); "
  + "before any revert, check `waypost sessions` and `waypost lease list`.";
export const sharedWith = (st) => st.with
  .map((p) => `${p.session} on ${p.host}${p.harness ? ` (${p.harness})` : ""}, ${p.basis}`).join("; ");

