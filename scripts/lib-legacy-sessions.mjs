import { mkdirSync, existsSync, writeFileSync, readFileSync, utimesSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";

// ─── Session awareness (layer 2 — multi-Claude coordination) ──────────
//
// Each Claude Code session registers itself in
// <vault>/.projectstore/sessions/<id>.json, where <id> is Claude's own
// session_id (from hook stdin input). Two Claude instances in the same
// project therefore get distinct files. Other sessions reading the vault
// can detect each other and warn the agent to avoid topic / numbering
// collisions. mtime is used as a liveness proxy: a session whose file
// has not been touched in 30 minutes is considered idle; >24h => stale,
// removed on next SessionStart.
//
// Kept for upstream compatibility (ADR-0004), not because waypost itself still
// reads it: presence.mjs/sessions.mjs (layer 3, ADR-0007) is what this fork's
// own commands use for liveness now. `recent_activity` in particular is dead
// from this fork's own side — it was populated by the hook-driven continuity
// feature this fork removed along with the hooks it needed — but upstream
// ProjectStore's own hooks still write and read this same file on a vault
// shared with a Claude Code session running unmodified upstream, so the shape
// stays exactly as upstream expects it.

export function sessionsDir(vault) {
  return join(vault, ".projectstore", "sessions");
}

export function sessionFilePath(vault, sessionId) {
  return join(sessionsDir(vault), `${sessionId}.json`);
}

export function ensureSessionsDir(vault) {
  const dir = sessionsDir(vault);
  mkdirSync(dir, { recursive: true });
  // Make sure no session metadata leaks into git, regardless of where the
  // vault lives. A nested .gitignore inside .projectstore/ is the simplest
  // way to handle this idempotently.
  const gi = join(vault, ".projectstore", ".gitignore");
  if (!existsSync(gi)) {
    writeFileSync(gi, "# projectstore — runtime data, do not commit\n*\n", "utf8");
  }
  return dir;
}

// Idempotent: preserves started_at and recent_activity if the session file
// already exists (e.g. when SessionStart fires after touch-session has
// already bootstrapped the record).
export function writeSession(vault, sessionId, projectRoot) {
  ensureSessionsDir(vault);
  const path = sessionFilePath(vault, sessionId);
  let existing = null;
  if (existsSync(path)) {
    try { existing = JSON.parse(readFileSync(path, "utf8")); } catch {}
  }
  const data = {
    id: sessionId,
    started_at: existing?.started_at || new Date().toISOString(),
    project_root: projectRoot,
    host: hostname(),
    pid: process.pid,
    recent_activity: Array.isArray(existing?.recent_activity) ? existing.recent_activity : [],
  };
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
  return path;
}

export function touchSession(vault, sessionId) {
  const p = sessionFilePath(vault, sessionId);
  if (!existsSync(p)) return false;
  const now = new Date();
  try {
    utimesSync(p, now, now);
    return true;
  } catch {
    return false;
  }
}

// Contract 23 — `currentSessionId` is exempt. A live session's file is not
// stale, and reaping it is pure data destruction: `writeSession` recreates it
// from nothing, so `recent_activity` and `started_at` are gone.
//
// Named limitation: a SIBLING session idle beyond 24 hours is still reaped by
// whichever session runs cleanup. Mtime cannot tell idle-alive from dead, so
// the justification above applies to that session word for word and is not
// cheaply actionable here.
// `dryRun` counts what would be removed without touching disk — `waypost
// sessions` (no `--prune`) uses it to say how many stale records are sitting
// there before anyone asks to reap them.
export function cleanupStaleSessions(vault, maxAgeHours = 24, currentSessionId = null, { dryRun = false } = {}) {
  const dir = sessionsDir(vault);
  if (!existsSync(dir)) return 0;
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const mine = currentSessionId ? `${currentSessionId}.json` : null;
  let removed = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    if (mine && name === mine) continue;
    const path = join(dir, name);
    try {
      if (statSync(path).mtimeMs < cutoff) {
        if (!dryRun) unlinkSync(path);
        removed++;
      }
    } catch {}
  }
  return removed;
}

