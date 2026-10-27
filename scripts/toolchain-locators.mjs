import { readdirSync, lstatSync } from "node:fs";
import { join, sep } from "node:path";
import { spawnSync } from "node:child_process";

// ─── locators ────────────────────────────────────────────────────────────
//
// A locator is a named, small, pure-ish function that finds artifacts a
// plain name/pattern walk cannot: something identified by content rather
// than by its own directory name, matched only after the walk narrows the
// search using basenames it collected along the way (the `collect` suffixes
// the owning entry declares). The core (scripts/sizes.mjs) never names one:
// it collects basenames for whichever suffixes the loaded registry's
// applicable locators ask for, then dispatches by name through runLocator.

// Matched by the workspace path recorded in each candidate folder's own
// project-descriptor file, not by name alone — narrowed first, for free, to
// folders whose name starts with a basename the walk actually collected (an
// owning-bundle name it found inside the project), so a machine holding
// unrelated build output for many other projects costs nothing here. Each
// candidate's confirmation is charged like any other subprocess call via
// ctx.chargeCall(); one the remaining budget cannot afford stops the search
// there, in the same sorted, deterministic order every time — the caller
// reads `incomplete` to mark the overall result a lower bound rather than a
// finished count. Darwin only: the descriptor is read with a macOS system
// tool, not a dependency, and is never invoked on any other platform.
function xcodeDerivedDataFor(ctx) {
  const { root, home, basenames, chargeCall, platform } = ctx;
  if (platform !== "darwin" || !basenames || basenames.size === 0) return { matches: [], incomplete: false };
  const base = join(home, "Library", "Developer", "Xcode", "DerivedData");
  let names;
  try { names = readdirSync(base); } catch { return { matches: [], incomplete: false }; }
  names.sort();
  const prefixes = [...basenames].sort().map((b) => `${b}-`);
  const matches = [];
  for (const name of names) {
    if (!prefixes.some((p) => name.startsWith(p))) continue;
    if (!chargeCall()) return { matches, incomplete: true };
    const dir = join(base, name);
    let st;
    try { st = lstatSync(dir); } catch { continue; }
    if (!st.isDirectory() || st.isSymbolicLink()) continue;
    const r = spawnSync("plutil", ["-extract", "WorkspacePath", "raw", join(dir, "info.plist")], { encoding: "utf8", timeout: 5000 });
    if (r.status !== 0) continue;
    const ws = (r.stdout || "").trim();
    if (ws.startsWith(root + sep)) matches.push(dir);
  }
  return { matches, incomplete: false };
}

const LOCATOR_IMPLS = { "xcode-derived-data": xcodeDerivedDataFor };

// Every locator any loaded entry declares whose own `os` includes this
// platform — the only ones the core should bother collecting basenames for
// or invoking after the walk.
export function applicableLocators(entries, platform = process.platform) {
  const out = [];
  const seen = new Set();
  for (const e of entries) {
    for (const l of e.locators || []) {
      if (seen.has(l.name)) continue;
      if (!Array.isArray(l.os) || !l.os.includes(platform)) continue;
      seen.add(l.name);
      out.push({ name: l.name, collect: l.collect || [] });
    }
  }
  return out;
}

// Dispatches to a locator by name. An unknown name (a project cannot add
// one — locators are never part of the project allowlist) finds nothing
// rather than throwing.
export function runLocator(name, ctx) {
  const fn = LOCATOR_IMPLS[name];
  if (!fn) return { matches: [], incomplete: false };
  return fn({ platform: process.platform, ...ctx });
}

