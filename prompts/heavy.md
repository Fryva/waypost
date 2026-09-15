---
description: Run heavy work (builds, full test suites, simulator/emulator boots, whole-disk scans, background agents that build or test) through waypost's machine-wide slot instead of outside it, and check capacity before launching parallel heavy agents.
argument-hint: "-- <cmd…> [--wait <Ns|Nm>]"
---

You are about to run heavy work under waypost.

## What counts as heavy

Builds (`xcodebuild`, Gradle, `cargo build`, CMake/Ninja, …), full test-suite
runs, a simulator or emulator boot, a whole-disk scan (`waypost size
--global`), and any background agent that builds or tests. One machine has
one shared limit, across every session, harness and project running on it —
this is not scoped to the current project.

## Steps

1. **Check capacity first**, before starting more than one heavy thing, and
   always before launching several parallel agents that will build or test:

   ```bash
   waypost capacity
   ```

   It reports cores, load, available memory and how many more heavy jobs the
   machine can take right now — measured fresh on every call, never cached
   and never a constant tuned on one machine. `--json` gives every figure and
   who already holds a slot (`holders_live`).

2. **Run the actual work through the slot**, never directly:

   ```bash
   waypost run --heavy -- <cmd…>
   ```

   This claims one machine-wide slot, lowers priority (nice +10 on POSIX,
   below-normal on Windows) so the command and everything it starts inherits
   it, runs with stdio inherited, and releases the slot on exit — whatever
   the exit code.

3. **Long work goes in the harness's background mode.** A heavy job can run
   well past a tool call's own timeout (Claude Code's shell tool, for
   example, times out after about two minutes by default). Start it in the
   background — a background shell/Bash call, a background agent, or
   whatever your harness offers — rather than blocking the turn on it.

4. **On refusal (exit 75), report it or retry — never run the work outside
   waypost to "save time".** stderr names which limit is binding (slots, cpu
   or memory) and gives the exact retry command. Either:
   - report the reason to whoever is waiting on it and stop, or
   - retry later, or
   - pass `--wait <Ns|Nm>` to wait for a slot instead of failing at once (it
     still exits 75 at the deadline if none opened up).

   Falling back to running the command directly is exactly the pattern that
   froze the machine this rule exists to prevent.

5. **One heavy job per agent at a time.** Do not start a second heavy command
   while one you started is still running — even for a different project or
   a different repo. The slot is machine-wide: starting a second one anyway
   just makes both compete for the same real, finite resources.

## Notes

- `waypost capacity --release <id> [--force]` is the recovery path for a slot
  that looks stuck; it refuses a still-live-looking holder unless `--force`
  is given, and always prints what it released.
- Heavy work started outside `waypost run --heavy` is still visible through
  the load it creates, so the next `waypost run --heavy` job waits for it —
  but it holds no slot of its own and is not judged by this rule the way a
  job actually run through it is. That is why every heavy command, including
  waypost's own (`npm test`, `waypost size --global`), goes through the slot.
