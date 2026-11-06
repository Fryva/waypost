---
type: story
id: "story-a-heavy-job-started-while-waypost-team-peers-run-sees-them-and-does-not-start-beside-them"
epic: "WP-18"
title: "A heavy job started while waypost team peers run sees them and does not start beside them"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-06
updated: 2026-11-06
external_refs: {}
tags: []
code_refs: ["scripts/heavy-jobs.mjs", "scripts/team-transport.mjs", "scripts/team-host.mjs", "bin/cli/slots.mjs", "bin/cli/run.mjs", "bin/cli/capacity.mjs", "prompts/heavy.md", "tests/heavy-job-visibility.test.mjs"]
specs: []
started_at: "2026-11-06T04:42:43.396Z"
closed_at: "2026-11-06T05:48:28.572Z"
plan_updated_at: "2026-11-06T04:42:43.396Z"
---

# A heavy job started while waypost team peers run sees them and does not start beside them

| Field | Value |
|---|---|
| **Epic** | [WP-18](../epic.md) |
| **Status** | done |
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

**Owner decisions** (all four recommendations accepted by the owner, 2026-11-06):
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

- [x] owner decisions 1–4 above recorded (2026-11-06)
- [x] ADR amendments
- [x] `registerPeer()` — one record per spawned peer process, written under
      the slot lock right before its spawn, removed on the child's `close`
      and in `finally`; `assertNoHeavyJob` stays read-only
- [x] liveness: by `job` once known (POSIX and win32), by `proc` before
- [x] `run --heavy` refuses with `agents-live` (and `--wait` waits);
      `--beside-agents` starts it and names the peers
- [x] `capacity` text and JSON show live peers; `--release` reaches them
- [x] docs: `prompts/heavy.md`, `docs/cli-reference.md`, `waypost help`
- [x] tests

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
   its own code `peer-registration-failed`. Registration runs at the spawn
   site, after `inspect`/`dispatchRouted` journal writes, so their read-only
   pre-checks (and `createNativeEndpoint`) first test that the peer table is
   writable (`assertPeerTableWritable`) and refuse beside a job; only a slot
   lock busy past 15 s still lands after the journal — the same place the
   factory's own `heavy-job-live` re-check already sat.
2. `scripts/heavy-jobs.mjs` liveness, with `readHolders`/`slotLive`
   unchanged: `setJob(pid)` moves `proc` to the peer itself (the waypost
   process becomes `owner`), so the record is live while the peer is — a
   peer that died on its own stops blocking while waypost lives, an orphan
   that outlives waypost still blocks. On win32 a peer's image name is
   unknown, so peer readers pass `tasklist: () => null` (signal-0 and the
   24-hour cap). The peer table is read only when it has files, so the
   claim's refusal budget is untouched in the common case.
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

- [x] with a live peer record, `waypost run --heavy -- <cmd>` exits 75, does
      not run `<cmd>`, stderr names the peer (harness, pid, since) and the
      `capacity --release <id> --force` way out — evidence: tests/heavy-job-visibility.test.mjs "run --heavy beside a live peer: exit 75, the command never runs, the peer and the way out are named"
- [x] `--wait` starts the job once the peer record is released, and not before — evidence: tests/heavy-job-visibility.test.mjs "run --heavy --wait starts once the peer ends, not before; the claim prunes its record"
- [x] `--beside-agents` runs the job and names the peers; `WAYPOST_BESIDE_HEAVY`
      does not bypass `agents-live` — evidence: tests/heavy-job-visibility.test.mjs "run --heavy beside a live peer…" (WAYPOST_BESIDE_HEAVY=1 still 75; --beside-agents runs and names the peer)
- [x] `clean`, `size --global` and `setup` are not refused by peers — evidence: tests/heavy-job-visibility.test.mjs "claimSlot: only a caller that asks (run --heavy) is refused…"; clean/size/setup call claimSlot without `agents`
- [x] a peer record whose `job` is gone stops refusing while its waypost
      process lives; one whose `proc` and `job` are both gone is pruned by the
      claim; an epoch mismatch without authority is kept, as for slots — evidence: tests/heavy-job-visibility.test.mjs "peer liveness: a peer that died on its own…", "--wait … the claim prunes its record"; epoch rule by construction (slotLive unchanged, authority passed)
- [x] `capacity` lists peers and `agents_live` in JSON, `can_start`
      unchanged; `capacity --release <id>` removes a peer record (with
      `--force` when live); without peers the output is as before — evidence: tests/heavy-job-visibility.test.mjs "run --heavy beside a live peer…" (text, agents_live, --release with/without --force); can_start from measure() unchanged
- [x] one record per spawned peer process: a real spawn writes it, the
      child's exit or a failed start removes it, a `codexEndpoint` restart
      leaves exactly one live; an injected `spawnProcess`/`fetchImpl` and the
      `inspect`/`dispatchRouted` pre-checks write none; the metadata sessions
      write none (if decision 1 stands) — evidence: tests/heavy-job-visibility.test.mjs "transport: a Codex restart leaves exactly one live record…", "transport: a spawn that throws releases its record; inventory and injected spawns register nothing"; real spawn checked by the reviewer's probe
- [x] a win32 `stopAndWait` that throws still removes the record — evidence: by construction: release is bound to the child's 'close' (team-transport.mjs bindPeerRecord), which resolves before the win32 throw; no win32 test
- [x] a registration that cannot write fails with `peer-registration-failed`
      before any journal write (the conversation pre-checks test the peer
      table first); one that cannot take the lock in 15 s fails closed at the
      spawn site; neither spawns anything unrecorded — evidence: tests/heavy-job-visibility.test.mjs "an unwritable peer table fails closed: in the pre-check, and at registration…", "a peer start and a heavy claim exclude each other…" (lock busy → peer-registration-failed)
- [x] a peer registration and a heavy claim cannot both succeed: with the
      slot lock held by a test, the claim refuses "lock busy" and the
      registration waits, then sees the slot and refuses `heavy-job-live` — evidence: tests/heavy-job-visibility.test.mjs "a peer start and a heavy claim exclude each other…", "a registration waiting on the lock sees the slot its holder claimed, and refuses"
- [x] without peers and without jobs, `run --heavy` and the team factories
      behave as before — npm test green under `waypost run --heavy` — evidence: npm test in a detached worktree on the final tree: 2545 tests, 2535 pass, 0 fail, 10 skipped

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

The other order of "no agents beside a heavy job". Every conversation peer
`team` spawns (claude, `codex app-server`, a managed `opencode serve`; not
the metadata sessions) registers in `peers.<hostSlug>/` beside the slot
table, under the slot lock and re-checking live jobs there
(`registerPeer` in scripts/heavy-jobs.mjs); the record follows the child
(`proc` becomes the peer, removed on its 'close'), so slotLive decides it
unchanged. `run --heavy` refuses beside live peers with `agents-live`,
exit 75, `--wait` waits, `--beside-agents` is the owner's non-inherited
go-ahead; `capacity` lists them (`agents_live`) and `--release` reaches
them; `clean`/`size`/`setup` are untouched. Conversation pre-checks test the
peer table is writable before the journal. Both ADRs carry an amendment;
help, `prompts/heavy.md`, the CLI reference updated.

Tests: tests/heavy-job-visibility.test.mjs 20/20; npm test (detached
worktree, final tree) 2545 / 2535 pass / 0 fail / 10 skipped. Critic and
reviewer passes in Technical Notes. Risks and follow-ups: win32 phantom peer
after pid reuse (no image name recorded), `handoff capture` has no
`--beside-agents`, an orphaned `opencode serve` is released not killed, the
process table is still read inside the lock, a slot lock busy past 15 s
still fails after the journal.

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
Reviewer pass 2026-11-06 (waypost-reviewer, fresh context): commit, close
after gaps. Folded in: the predictable registration failures now refuse
before the journal (pre-check tests the peer table; the AC reworded back to
that, with the remaining 15 s lock case named); `'error'` releases only a
child that never got a pid; `--beside-agents` names the peers once, when the
job starts; the lock-busy reason names peer registration; a truncated record
is removed; tests for the waiting-registration sequence, an unwritable table
and the peers named beside. Critic (9) only in part: the peer table is read
only when it has files, but the process table is still read inside the lock
(~0.1 s at load 4–7). Left open (follow-ups): on win32 a peer's image name is
not recorded, so a reused pid after a killed host can hold a phantom peer up
to the 24-hour cap (`capacity --release --force` is the way out);
`handoff capture` inherits the refusal with no `--beside-agents` of its own;
an orphaned `opencode serve` is released by `--release`, not killed;
`registerPeer` repeats `selfMarker`'s fields.

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
