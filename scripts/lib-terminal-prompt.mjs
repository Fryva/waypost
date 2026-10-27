import { createInterface } from "node:readline";

// ─── A terminal yes/no, with a timeout ──────────────────────────────────

// Asks `question` on `input`/`output` (a real TTY in production, a
// PassThrough pair in tests) and resolves `true` only for a first line that
// is exactly "y" or "yes" (case-insensitive, surrounding whitespace
// trimmed) — every other answer, EOF with no answer at all, and no answer
// within `timeoutMs` (default 60s, the ADR's own figure) all resolve
// `false`. Reused by the machine-wide-limit story's own gate. Node's
// readline decides `terminal` from `input.isTTY` on its own; this never
// forces it either way. Always closes its own readline interface and pauses
// `input` before resolving, whichever way — an open, non-paused stdin is a
// handle Node will wait on, and a command that asked once must still be
// able to exit on its own afterwards.
// `output` defaults to stderr, not stdout: a caller piping `--json` (or
// anything else) reads stdout as data, and an interactive question written
// there would land inside that stream instead of in front of the person
// answering it.
export function askYesNo(question, { input = process.stdin, output = process.stderr, timeoutMs = 60000 } = {}) {
  return new Promise((resolvePromise) => {
    const rl = createInterface({ input, output });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rl.close();
      try { input.pause(); } catch { /* not pausable — nothing more to do */ }
      resolvePromise(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    rl.question(question, (answer) => {
      const a = String(answer || "").trim().toLowerCase();
      finish(a === "y" || a === "yes");
    });
    // EOF before any line was ever entered — the question's own callback
    // never fires in that case, so this is the only way to observe it.
    rl.on("close", () => finish(false));
    // Ctrl-C at the prompt is "no", not an uncaught readline exit — the
    // caller's own answer/timeout path is the only other way this settles.
    rl.on("SIGINT", () => finish(false));
  });
}
