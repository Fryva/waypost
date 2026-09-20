---
description: Review build output and machine caches with waypost clean, and remove only what the user agreed to, only after their own yes in this conversation.
argument-hint: "[--apply <id…>|should --yes --reason \"<who agreed, when>\"]"
---

You are reviewing disk usage with waypost's own classifier — never `rm -rf`
by hand instead of this.

## Steps

1. **Get the plan**:

   ```bash
   waypost clean --json
   ```

   Exit 75 means the machine-wide slot was refused (something else heavy is
   running) — report that to whoever is waiting, or try again later; never
   fall back to scanning or deleting anything yourself.

2. **Show the classes, not a summary of them.** For each item that matters,
   its id, its size, and the reason it is classified the way it is:

   - **should** — idle past its window, regenerable, not in use. The usual
     candidate for removal.
   - **can** — regenerable but recently used, a generic name (`build`,
     `dist`, …), a machine-wide cache, or a directory of tool versions.
     Removed only by id, never by passing `should`.
   - **keep** — never removed. Held by a lease, in use, not regenerable,
     holds a tracked file, a nested repository or a mount point, or a path
     this project does not own. Do not suggest it, whatever a user asks.
   - a `can` item can also carry `manual: true` in `--json` — not a fourth
     class, a flag: it names its own clean command in `clean` (and a
     `clean_docs` URL) instead of a route waypost can run. Show the user
     that command; they run it themselves. Refused even by id, the same as
     `keep` — never retry it with `--yes`.

3. **Removal needs the user's own yes, right here in this conversation, for
   exactly what you are about to name.** Not "clean up my disk" in general —
   confirm the specific ids or "every should item" you are about to pass.
   Once they say yes:

   ```bash
   waypost clean --apply <id…>|should --yes --reason "<who agreed, when>"
   ```

   `--reason` records who agreed and when, in your own words — it is what
   makes this different from silent automatic removal. `can` items are only
   ever passed by id; never pass `should` meaning to sweep in a `can` item
   too. `keep`, and a `can` item flagged `manual`, are refused even by id —
   do not retry with `--yes` expecting a different answer, and never suggest
   deleting a manual cache's path directly.

4. **Report exactly what happened, from the command's own output** — never
   your own guess: which ids were removed, skipped (changed since the plan,
   or no longer eligible) or failed (with the reason), and the space freed
   per filesystem. `--json` carries the full per-item and per-filesystem
   detail if you need to branch on it.

## Notes

- `waypost clean` alone is always read-only — safe to run any time, no yes
  needed.
- An item can look eligible in the plan and no longer be by the time
  `--apply` re-checks it right before removing it (touched, force-tracked,
  replaced by a symlink) — that is expected, not a bug to work around.
- `waypost setup`'s own last step offers this same audit once, interactively
  (`[y/N]`, 60s, only on a terminal with no harness detected) — it never
  removes anything without that yes either.
- `waypost clean --limit [<N>|free:<P>%|off]` sets the machine-wide
  automatic-cleanup threshold that runs at the end of every `waypost run
  --heavy`. Only the owner, in their own terminal, may set it or tighten
  it — you will be refused, on purpose, if you try. You may loosen it or
  turn it off (`waypost clean --limit off`) on the owner's behalf.
