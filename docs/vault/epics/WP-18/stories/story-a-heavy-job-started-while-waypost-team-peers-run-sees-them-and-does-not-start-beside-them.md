---
type: story
id: "story-a-heavy-job-started-while-waypost-team-peers-run-sees-them-and-does-not-start-beside-them"
epic: "WP-18"
title: "A heavy job started while waypost team peers run sees them and does not start beside them"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-06
updated: 2026-11-06
external_refs: {}
tags: []
code_refs: ["scripts/team-transport.mjs", "scripts/team-quota-native.mjs", "bin/cli/slots.mjs", "bin/cli/run.mjs", "bin/cli/capacity.mjs", "scripts/heavy-jobs.mjs", "tests/heavy-job-visibility.test.mjs"]
specs: []
started_at: null
closed_at: null
plan_updated_at: null
---

# A heavy job started while waypost team peers run sees them and does not start beside them

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

ADR "Memory for heavy work" Decision 6 says no agents beside a heavy job,
*in either order*. Story "Agents waypost starts itself see a live heavy job,
and brief and status name it" (1f857a7) covered one order: a `waypost team`
peer factory refuses with `heavy-job-live` while a slot is held. The other
order is open: `waypost run --heavy` (`claimSlot` in `bin/cli/slots.mjs`)
and `waypost capacity` know nothing about peers already running, so a build
started after a team began runs beside claude / `codex app-server` /
opencode processes Waypost itself spawned — the 2026-09-27 VM incident
with the order reversed.

Nothing today records live peers machine-wide. The owned runtime
(`scripts/team-owned-runtime.mjs`, driven by `managedOperation` in
`scripts/team-host.mjs`) keeps intent/capability/closed records per
operation, but in a per-team directory (`<authority>/host/<team>/runtime`),
deliberately without pids, and covers only owned operations — the
injected-transport and external-OpenCode paths skip it. It is a stop/proof
ledger, not a liveness table, and `run --heavy` cannot enumerate every
team's directory. The one chokepoint every real peer start already passes is
`assertNoHeavyJob()` — `createNativeEndpoint`, `startManagedOpenCodeServer`,
`createNativeModelInventoryEndpoint`, and the Codex metadata session in
`scripts/team-quota-native.mjs`.

**Proposal: refuse, the same rule as the other order** (not warn, not count),
for `waypost run --heavy` only. Every conversation peer Waypost spawns writes
a record into a machine-wide table beside the slot table,
`<machineStateDir>/peers.<hostSlug>/<id>.json`; `run --heavy` reads it under
the slot lock and refuses with `agents-live`, exit 75 (`--wait` waits);
`capacity` shows the peers. Revised after the critic pass (Technical Notes).

Why not the alternatives:
- *warn only* — weaker than the order already shipped, and an agent reading
  a warning in a build log does not stop the build;
- *count them in the reserve* — the ADR's rule is "no agents beside", not
  "agents fit"; a peer's memory grows with its context and a fixed per-peer
  reserve would be a guess that admits the job on a large machine anyway.

Out of scope: agents a harness starts itself (subagents) — only the routing
block reaches them (ADR Rationale 4); `brief`/`status` naming live peers;
a team worker's own heavy work (a sandboxed Codex `workspace-write` worker
cannot write the machine state dir, so its `run --heavy` fails before any
peer check — recorded, not solved here); mixed versions (an older
`run --heavy` does not read peers, an older `team` writes none).

**Owner decisions this story needs before code** (recommendation first):
1. *What counts as a peer.* Conversation peers only — `processPeer`
   (claude, `codex app-server` with a thread) and managed `opencode serve`.
   The ≤30 s metadata sessions (Codex quota lease renewal every watch pass,
   model inventory) do not register: registering them makes every build
   flaky beside `team watch`. (Alternative: register them too, and the claim
   waits up to their own 30 s limit before refusing.)
2. *Which `claimSlot` callers obey it.* `run --heavy` only (an option passed
   by `handleRun`, so `handoff capture` inherits it); `clean`, `size
   --global` and `setup`'s audit do not — disk work is not the memory
   incident.
3. *Owner override.* A non-inherited `run --heavy --beside-agents` flag,
   not `WAYPOST_BESIDE_HEAVY=1`, which every peer inherits through
   `{...process.env}`.
4. *Amending the ADRs.* Refusal adds a fourth admission condition to ADR
   "Heavy work sized to the machine" (Decision 1) and a second kind of slot
   lock holder (Decision 2), and turns "warning there" in the memory ADR's
   Rationale 4 into a refusal: both get an "Amended by" note and the new
   Consequence "any heavy job on the machine, in any project, waits for any
   live peer of any team".

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [ ] owner decisions 1–4 above recorded, ADR amendments drafted
- [ ] `registerPeer()` — one record per spawned peer process, written under
      the slot lock right before its spawn, removed on the child's `close`
      and in `finally`; `assertNoHeavyJob` stays read-only
- [ ] liveness: by `job` once known (POSIX and win32), by `proc` before
- [ ] `run --heavy` refuses with `agents-live` (and `--wait` waits);
      `--beside-agents` starts it and names the peers
- [ ] `capacity` text and JSON show live peers; `--release` reaches them
- [ ] docs: `prompts/heavy.md`, `docs/cli-reference.md`, `waypost help`
- [ ] tests

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

1. `scripts/heavy-jobs.mjs` (beside `liveHeavyJobs`): `peersDir({home})`,
   `livePeers({home,…})` (`readHolders` over `peers.<host>/`), `peerLine()`
   (harness, pid, command, since), and `registerPeer(meta, {home})`:
   patient lock wait (not the claim's 2 s budget), `ensureMachineStateDir`
   first, read live heavy jobs → refuse `heavy-job-live` as today, else write
   `selfMarker()` + `{kind:"peer", harness, participant?, job:null}`; after
   the lock, `authority` as `recordAuthority` does. Returns
   `{ setJob(pid), release() }`. A lock or write failure fails closed with
   its own code `peer-registration-failed`, before any journal write.
2. `scripts/heavy-jobs.mjs` liveness: a peer record is live while its `job`
   is (POSIX ticks; win32 signal-0 plus image name) once `job` is set, and
   while `proc` is before — not "proc OR job", so a peer that died on its own
   stops blocking while waypost lives. One process table read before the
   lock, passed as `table` to every `readHolders` under it.
3. `scripts/team-transport.mjs`: `registerPeer` at the two conversation spawn
   sites — `processPeer` (`:165`; each `codexEndpoint` restart re-registers,
   so a restart re-checks heavy jobs) and `opencode serve` (`:837`).
   `release()` on the child's `'close'` event and in the factory's
   `finally`/catch — never after `await stopAndWait` (on win32 it throws
   `native-process-tree-stop-unverified`). Injected `spawnProcess`/`fetchImpl`
   write nothing. `inspect`/`dispatchRouted` pre-checks stay read-only.
4. `bin/cli/slots.mjs` `claimSlot(dir, argv, capacity, presence, where,
   {agents=false})`: when `agents`, before `measure()`, read `livePeers()`,
   prune stale peer records, refuse `{ok:false, code:"agents-live",
   reason:"agents live — <peerLine…>"}`. `bin/cli/run.mjs` passes
   `agents:true` unless `--beside-agents` (then names the peers on stderr);
   prints the `capacity --release <id> --force` hint for `agents-live` too.
5. `bin/cli/capacity.mjs`: a `peers:` section; `can_start` in text and JSON
   stays `measure()`'s (peers do not change it), plus `agents_live: [...]`
   and a line `run --heavy refuses: agents live`; `--release <id>` also looks
   in `peers.<host>/`.
6. Docs and tests (`tests/heavy-job-visibility.test.mjs`, `home` seam, no
   writes to the real state dir).

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [ ] with a live peer record, `waypost run --heavy -- <cmd>` exits 75, does
      not run `<cmd>`, stderr names the peer (harness, pid, since) and the
      `capacity --release <id> --force` way out
- [ ] `--wait` starts the job once the peer record is released, and not before
- [ ] `--beside-agents` runs the job and names the peers; `WAYPOST_BESIDE_HEAVY`
      does not bypass `agents-live`
- [ ] `clean`, `size --global` and `setup` are not refused by peers
- [ ] a peer record whose `job` is gone stops refusing while its waypost
      process lives; one whose `proc` and `job` are both gone is pruned by the
      claim; an epoch mismatch without authority is kept, as for slots
- [ ] `capacity` lists peers and `agents_live` in JSON, `can_start`
      unchanged; `capacity --release <id>` removes a peer record (with
      `--force` when live); without peers the output is as before
- [ ] one record per spawned peer process: a real spawn writes it, the
      child's exit or a failed start removes it, a `codexEndpoint` restart
      leaves exactly one live; an injected `spawnProcess`/`fetchImpl` and the
      `inspect`/`dispatchRouted` pre-checks write none; the metadata sessions
      write none (if decision 1 stands)
- [ ] a win32 `stopAndWait` that throws still removes the record
- [ ] a registration that cannot take the lock or write fails with
      `peer-registration-failed` before any journal write
- [ ] a peer registration and a heavy claim cannot both succeed: with the
      slot lock held by a test, the claim refuses "lock busy" and the
      registration waits, then sees the slot and refuses `heavy-job-live`
- [ ] without peers and without jobs, `run --heavy` and the team factories
      behave as before — npm test green under `waypost run --heavy`

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

Critic pass 2026-11-06 (waypost-critic, fresh context): accept after fixes.
Folded in: (1, blocker) `assertNoHeavyJob` as the registration would leak
records from the endpoint-less `inspect`/`dispatchRouted` pre-checks and
block heavy work for as long as `team watch` lives — registration moved to
the spawn sites; (2) `slotLive` as is ignores `job` on win32, keeps a dead
peer live while waypost lives, misses `host`/`authority`, and
`codexEndpoint` restarts up to three times — per-spawn records, job-first
liveness, `selfMarker()` fields; (3) undefined lock/write failure after
journal writes — fail closed before them; (4) `claimSlot` also serves
`clean`/`size`/`setup` — option passed by `run --heavy` only; (5) quota
lease renewals every ~30 s would make builds flaky — owner decision 1;
(6) ancestor exclusion by `proc` also excludes siblings, and a sandboxed
worker cannot take a slot at all — exclusion dropped (YAGNI), recorded out
of scope; (7) no way out of an orphaned `opencode serve` — pid in the line,
`--release` reaches peers; (8) ADR amendments, `can_start` in JSON, the
epoch rule, `prompts/heavy.md`; (9) one process table before the lock;
(10) the inherited env go-ahead — `--beside-agents`.
Not taken: write-then-check on both sides without the peer taking the lock
(both may back off; the lock is already the primitive the claim uses).

## Dependencies

- ADR "Memory for heavy work: half the memory up to 2 GB, macOS by pressure
  level, no agents beside a job" (accepted 9044ce6), Decision 6 "in either
  order"
- Story "Agents waypost starts itself see a live heavy job, and brief and
  status name it" (done 1f857a7) — the other order; its Final Summary names
  this one as the follow-up

## Attachments

-

---

*Last updated: 2026-11-06*
