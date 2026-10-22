// Waypost CLI: run.
import { ensureMachineStateDir, stateWriteHint } from "../../scripts/lib.mjs";
import { autoCleanup } from "./auto-clean.mjs";
import { INHERITED_HARNESS, INHERITED_PROC, INHERITED_SESSION_ID, SCRIPT_URL, fail, flag, opt, splitAtTerminator } from "./core.mjs";
import { EX_TEMPFAIL, REASON_PRINT_MS, WAIT_POLL_MS, claimSlot, delay, parseDuration, recordAuthority, shellQuote, signalNumber, slotWhere, slotsDir } from "./slots.mjs";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { constants as osConstants, setPriority } from "node:os";
import { join } from "node:path";

// Lowers waypost's own priority first, so the command and everything it
// starts inherits it — Node maps PRIORITY_BELOW_NORMAL to nice +10 on POSIX,
// below-normal on Windows. No shell, except a .cmd/.bat target on Windows,
// which only cmd.exe can start (the argv is the caller's own command, not
// data from a registry).
// `claim` (not just its own release()) and `where` (the amended machine-
// wide-limit ADR): the automatic cleanup runs AFTER the wrapped command
// exits but BEFORE the slot is released, under the same claim — and needs
// both. Nothing on this whole path may call fail() or readConfig() (both
// call process.exit): a bug in the cleanup must never take the wrapped
// command's own already-decided exit status down with it.
// A probe, not a guess from XDG_RUNTIME_DIR: systemd-run fails the same way
// (exit 1) for an unreachable manager and for a command that exits 1, so the
// choice is made before the job starts.
function ownScopeAvailable(env) {
  const r = spawnSync("systemd-run", ["--user", "--scope", "--quiet", "--collect", "--", "true"], { stdio: "ignore", timeout: 5000, env });
  return r.status === 0;
}

async function runHeavy(argv, claim, where, mods) {
  try { setPriority(osConstants.priority.PRIORITY_BELOW_NORMAL); }
  catch { /* best-effort: a restricted sandbox must not block the run */ }
  // Linux: if memory runs out anyway, the kernel's OOM killer takes this job
  // first, not the harness beside it (ADR "Memory for heavy work: half the
  // memory up to 2 GB, …"; the job's own scope below keeps systemd from
  // taking the harness down with it). Inherited across fork and exec; raising needs no
  // privilege, lowering would, so a higher value already set is left alone.
  if (process.platform === "linux") {
    try {
      if (Number(readFileSync("/proc/self/oom_score_adj", "utf8")) < 1000) writeFileSync("/proc/self/oom_score_adj", "1000");
    } catch { /* best-effort, like the priority above */ }
  }

  // The command is arbitrary and may itself invoke `waypost` (this project's
  // own test suite does, extensively): it must see the environment it was
  // actually given, not this wrapper's own session/harness identity — pinned
  // onto process.env above by main(), for ITS OWN heartbeat/commit labelling
  // — when that identity was only invented (detected), not passed in. Left
  // leaking through, a nested `waypost` call would skip its OWN derivation
  // (main() only pins when unset) and inherit this wrapper's, which is how a
  // `waypost run --heavy -- node --test …` run once produced a session id
  // collision in an unrelated test.
  // The harness process (WAYPOST_PROC) is always derived, never passed in by a
  // caller, so a nested `waypost` must find its own the same way.
  const childEnv = { ...process.env };
  if (INHERITED_SESSION_ID === undefined) delete childEnv.WAYPOST_SESSION_ID;
  if (INHERITED_HARNESS === undefined) delete childEnv.WAYPOST_HARNESS;
  if (INHERITED_PROC === undefined) delete childEnv.WAYPOST_PROC;

  let [cmd, ...cmdArgs] = argv;
  const useShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(cmd);
  // Linux under a systemd user manager: the job gets a scope of its own. The
  // OOM killer's victim is only half of it — systemd then stops the whole
  // unit the victim sat in (DefaultOOMPolicy=stop), and that unit is the
  // harness's own app scope when the job runs in it: the 2026-09-27 VM
  // incident, reproduced 2026-10-13. `--scope` execs the command in place, so
  // its pid, signals, environment and exit status stay this child's. Without
  // a reachable user manager the command runs as before.
  if (process.platform === "linux" && ownScopeAvailable(childEnv)) {
    cmdArgs = ["--user", "--scope", "--quiet", "--collect", "--", cmd, ...cmdArgs];
    cmd = "systemd-run";
  }

  // A signal THIS wrapper itself caught — set the moment it arrives, so a
  // tool that traps Ctrl-C and exits 130 on its own terms (never actually
  // killed BY the signal, so `signal` below stays null) is treated exactly
  // the same as one the signal killed outright: either way, cleanup must
  // never run against a command that did not finish on its own.
  let interrupted = null;
  let child = null;
  const onSigint = () => { interrupted = "SIGINT"; if (child) { try { child.kill("SIGINT"); } catch {} } };
  const onSigterm = () => { interrupted = "SIGTERM"; if (child) { try { child.kill("SIGTERM"); } catch {} } };
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  let spawnFailed = false;
  let code = null;
  let signal = null;
  try {
    child = spawn(cmd, cmdArgs, { stdio: "inherit", shell: useShell, env: childEnv });
    [code, signal] = await new Promise((res) => {
      child.on("exit", (c, s) => res([c, s]));
      child.on("error", (e) => {
        spawnFailed = true;
        process.stderr.write(`waypost run --heavy: ${e.message}\n`);
        res([127, null]);
      });
    });
  } catch (e) {
    spawnFailed = true;
    process.stderr.write(`waypost run --heavy: ${e.message}\n`);
    code = 127;
  }

  // Default handling again: a signal that arrives DURING the cleanup below
  // ends this process at once (the ADR: "A signal that arrives during the
  // cleanup ends the process at once, with 128+n") — renaming an item
  // before it is ever actually deleted is what keeps that safe.
  process.removeListener("SIGINT", onSigint);
  process.removeListener("SIGTERM", onSigterm);

  const status = signal ? 128 + signalNumber(signal) : (code == null ? 1 : code);
  process.exitCode = status;

  try {
    await autoCleanup({
      claim, where, ended: { status, signal, interrupted, spawnFailed },
      capacity: mods.capacity, presence: mods.presence,
    });
  } catch (e) {
    process.stderr.write(`waypost: automatic cleanup failed: ${e.message}\n`);
  } finally {
    claim.release();
  }
  process.exitCode = status;
}

// waypost run --heavy [--wait <Ns|Nm>] -- <argv…>. No wait: refuse at once,
// with the reason and the exact retry command, exit EX_TEMPFAIL. --wait
// retries every 5 seconds until the deadline, repeating the reason every 30.
async function handleRun(args) {
  if (!flag(args, "--heavy")) fail('run: only "run --heavy -- <argv…>" is supported (see `waypost help`)');
  const { tail: argv } = splitAtTerminator(args);
  if (!argv.length) fail("run --heavy: usage: waypost run --heavy [--wait <Ns|Nm>] -- <argv…>");

  let waitMs = null;
  const waitSpec = opt(args, "--wait");
  if (waitSpec != null) {
    waitMs = parseDuration(waitSpec);
    if (waitMs == null) fail(`run --heavy: --wait expects <N>s or <N>m, got "${waitSpec}"`);
  }

  let capacity, presence;
  try {
    capacity = await import(SCRIPT_URL("capacity"));
    presence = await import(SCRIPT_URL("presence"));
  } catch (e) { fail(`run --heavy: ${e.message}`); }

  const dir = slotsDir(presence);
  try { ensureMachineStateDir(dir); } catch (e) { fail(`run --heavy: ${stateWriteHint(dir, e)}`); }
  const retryCmd = `waypost run --heavy -- ${argv.map(shellQuote).join(" ")}`;
  const deadline = waitMs != null ? Date.now() + waitMs : null;
  let lastPrinted = 0;
  // Computed once, before the wait loop: the command's own working directory
  // never changes while this process waits, and nothing may spawn inside
  // claimSlot's own lock either way.
  const where = slotWhere(process.cwd());

  for (;;) {
    const claim = await claimSlot(dir, argv, capacity, presence, where);
    if (claim.ok) {
      recordAuthority(claim.file, capacity);
      await runHeavy(argv, claim, where, { capacity, presence });
      return;
    }

    const now = Date.now();
    if (deadline == null || now >= deadline) {
      process.stderr.write(`waypost run --heavy: refused — ${claim.reason}\n  retry: ${retryCmd}\n`);
      // A holder whose boot could not be confirmed is kept rather than pruned
      // (WP-18 amendment), so the way out of a phantom has to be said out
      // loud: the only other one is waiting for the 24-hour cap.
      if (/^slots:/.test(String(claim.reason || ""))) {
        process.stderr.write("  who holds it: waypost capacity"
          + "     (a holder that is not really there: waypost capacity --release <id> --force)\n");
      }
      process.exitCode = EX_TEMPFAIL;
      return;
    }
    if (now - lastPrinted >= REASON_PRINT_MS) {
      process.stderr.write(`waypost run --heavy: waiting — ${claim.reason}\n`);
      lastPrinted = now;
    }
    await delay(Math.min(WAIT_POLL_MS, deadline - now));
  }
}

export { ownScopeAvailable, runHeavy, handleRun };
