import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ─── Vault-side policy config (upstream ADR-007 Decision 4) ─────────────────────
//
// <vault>/.projectstore.json — vault ROOT, dot-prefixed: git commits it (so
// the policy survives clones and second machines), Obsidian hides it, and it
// is intentionally NOT inside <vault>/.projectstore/, whose .gitignore ("*")
// would defeat the whole point. Keys: spec_policy ("required"|"optional"),
// lifecycle_gates ("on"|"off"), spec_policy_since (ISO-8601, stamped when
// spec_policy first becomes "required").
export function vaultConfigPath(vault) {
  return join(vault, ".projectstore.json");
}

export function readVaultConfig(vault) {
  const p = vaultConfigPath(vault);
  if (!existsSync(p)) return {};
  try {
    const v = JSON.parse(readFileSync(p, "utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch (e) {
    // Degrade to defaults rather than exit — a corrupt vault-side policy file
    // must not take doctor itself down, but it silently turns spec_policy:
    // required into optional, so this is loud on stderr and doctor's own
    // checkVaultPolicy reports it as a first-class finding.
    process.stderr.write(`waypost: vault policy unreadable, using defaults: ${p}: ${e.message}\n`);
    return {};
  }
}

// `self_install` in the vault policy (ADR solo-entry-without-a-profile-...): "off"
// or false, in any case, stops `waypost brief` from installing roles, skills and
// the routing block in every clone. Read raw rather than through readVaultConfig,
// whose {} on a corrupt file would mean "install": an unreadable policy file
// fails closed here — nothing is installed until it is fixed.
export function selfInstallOff(vault) {
  const p = vaultConfigPath(vault);
  if (!existsSync(p)) return false;
  let v;
  try { v = JSON.parse(readFileSync(p, "utf8")); } catch { return true; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return true;
  return ["off", "false"].includes(String(v.self_install).toLowerCase());
}

export function writeVaultConfig(vault, cfg) {
  writeFileSync(vaultConfigPath(vault), JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

// Legacy exemption (upstream ADR-007 Decision 6): a story is exempt from spec-first
// and lifecycle gates iff it was already done before the policy existed —
// status done AND (no closed_at at all, or closed_at earlier than
// spec_policy_since). Stories in progress/review at enable time are IN scope.
export function isLegacyStory(fm, since) {
  const status = String(fm.status || "").toLowerCase();
  if (status !== "done") return false;
  const closed = fm.closed_at && fm.closed_at !== "null" ? String(fm.closed_at) : null;
  if (!closed) return true;
  if (!since) return true;
  return closed < String(since);
}

