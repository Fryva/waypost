---
type: story
id: "story-agentsmd-is-not-evidence-that-codex-is-used-here"
epic: "WP-19"
title: "setup asked the filesystem alone about which harnesses a project uses"
status: in-progress
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-30
updated: 2026-09-30
external_refs: {}
tags: []
code_refs: ["harnesses/codex.json", "harnesses/claude.json", "harnesses/gemini.json", "scripts/agents.mjs", "bin/waypost", "tests/harness.test.mjs", "docs/vault/ops/verify-a-harness-live-the-whole-waypost-loop-in-one-session.md"]
specs: []
started_at: "2026-09-30T16:03:38.395Z"
closed_at: null
plan_updated_at: "2026-09-30T16:03:38.395Z"
---

# setup asked the filesystem alone about which harnesses a project uses

<!-- The file stem is the original report's wording and is kept, so every existing
     reference to the story keeps resolving; the title above is what the board shows. -->

| Field | Value |
|---|---|
| **Epic** | [WP-19](../epic.md) |
| **Status** | in-progress |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

**`AGENTS.md` is not the bug. `setup` was.** Both were treated as one problem
until a real `codex` session was measured, and the measurement separated them.

The report that opened this story: `AGENTS.md` is a `detect` marker for `codex`
and for no other entry, while being the `instructions` target of **all 21**.
So a project with a plain user-written `AGENTS.md` and no harness directory is
detected as a Codex project, and `waypost setup` writes `.codex/agents/*.toml`
into it. True, and still true.

What the live run added is the other side of the same fact. Measured
2026-09-30 from inside a live `codex` session (`codex-cli 0.159.2`,
`/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`), in a git
repo containing **only a README and no marker of any kind**:

```
$ waypost setup --dry-run
  no harness detected — run `waypost agents install --harness <id>` once you pick one

$ node -e '…detectHarness()…'
  codex
```

`setup` was blind to the harness it was running inside. Three answers from that
session, each measured, not inferred:

| question | answer |
|---|---|
| does `codex` create a project-local `.codex/`? | **no** — `codex exec` in an `AGENTS.md`-only repo, `ls -a` before and after identical |
| does a session export a declared env marker? | **yes** — `CODEX_SANDBOX=seatbelt` and `CODEX_SANDBOX_NETWORK_DISABLED=1`; `CODEX_HOME` unset |
| does `waypost setup` see it? | **no** — "no harness detected" |

So the two symptoms are one cause seen from two ends. `setup` read file markers
only. `AGENTS.md` happened to cover for that, so a real Codex project — which
nearly always has one, per the vendor's AGENTS.md guide, where it is *the*
project instruction file and no `.codex/` appears at all — got the right answer
by luck. Every project *without* `AGENTS.md` got the wrong one, and `setup` was
the only consumer that *wrote* on file markers alone: `doctor` already unioned
the running harness (`scripts/agents.mjs`, the `used` union), and `selfInstall`
already read `detectHarness()`. The installer itself still asks the filesystem
alone — out of scope here, and the reason `waypost next` → `waypost agents
install` → exit 1 (measured) remains a dead end in a marker-less project.

Removing the `AGENTS.md` marker would have made the blindness visible for every
Codex user, and fixing `setup` removes the need to argue about the marker at
all: the running harness is direct evidence, and it is what `setup` was
forgetting to ask.

## Decomposition

- [x] **Settle it on a live `codex`, not from the docs** — the three answers are
      measured above
- [x] **`setup` asks the running harness as well as the project's files**, the
      same union `doctor` makes, so a project that shows no evidence of a harness
      is no longer reported as evidence of none
- [x] The list `setup` installs for is passed to `agents install` explicitly, so
      a harness found only by the running process is installed and not just named
- [x] Every spawned command empties the harness evidence the driving session
      exports, and this test file clears its own `WAYPOST_PROC` — the reason the
      existing setup tests stayed green was that they were not hermetic in this
      respect (measured: an inherited `WAYPOST_PROC` alone, 4 failures)
- [x] `detectedHarnesses()` delegates to the module's E-1-aware detector instead
      of the bare-`existsSync` projection it stood in for; without this, the
      explicit `--harness` list hands over the weaker set and `setup` writes the
      unrequested `.codex/` it was meant to avoid
- [x] Tests: running harness alone, env marker alone (no `WAYPOST_HARNESS`),
      two-run idempotence of the harness set, union with a marked harness, and an
      explicit `--harness` overriding both
- [x] `docs/harnesses.md` and `harnesses/codex.json` state what `detect` is for
      and that a running harness counts independently
- [x] CHANGELOG entry, with the recovery for each of the two shapes the old guess
      produces — measured separately, because they are not the same damage
- [x] Runbook step: the WP-14 live-loop runbook names the harness explicitly and
      documents the `EPERM` a first codex install hits under its own sandbox
- [ ] A full run of that runbook on a real codex session, reaching
      `Waypost-Harness: codex` on the commit
- [x] A fresh-context critic pass over the ADR and the diff — `revise`; its
      verified findings are corrected above and in the ADR's Consequences
- [x] A second critic pass over the revision — `revise`; its blocker (the memo
      defeating the pin), its two misattributed claims, the non-reproducible
      mutation record and the unasserted short-circuit are corrected above
- [ ] A fourth critic pass over that revision, before the ADR is accepted

## Implementation Plan

Landed (`bin/waypost`, `tests/harness.test.mjs`, docs, CHANGELOG):

- `runningHarness()` in `bin/waypost` — the harness this command is running
  inside, or `null`. It answers about *now*; `detectedHarnesses()` answers about
  the project. `main()` has already resolved it into `WAYPOST_HARNESS` for every
  non-quiet command, so this is one re-read of that value, not a second
  detection pass; `detectHarness()` is the fallback.
- `handleSetup` unions the two, with no precedence between them: a file marker
  says the project uses that harness, the running process says someone is in it
  right now, and both can be true. An explicit `--harness` still overrides, and
  is read first so an explicit choice costs no detection.
- The union is passed to `agents install` / `skills install` as an explicit
  `--harness` list, for two reasons: the child re-detects from markers on its
  own, so a harness found only by the running process would be named in the
  label and then skipped; and a project holding only waypost's own routing block
  used to make `setup` print a promise and then exit 1 mid-command, when the
  child stripped the block and found nothing.
- `detectedHarnesses()` now calls the module's own `detectHarnesses()` instead of
  filtering the `agents harnesses --json` projection with a bare `existsSync`.
  The projection was standing in for the child's detector and is measurably
  weaker: on a project holding only waypost's routing block it reports
  `[ 'antigravity', 'codex', 'opencode', 'pi' ]` where the module reports
  `[ 'pi' ]`. Since the list is now what gets written, the naive set would have
  written the unrequested `.codex/agents/` this story exists to prevent.
- The suite empties harness evidence twice over: `withoutHarnessEvidence()` for
  every spawned command, and a `delete process.env.WAYPOST_PROC` at the top of
  the harness test file, because `harnessProcess()` reads that variable before
  the table it is handed and no per-spawn env can reach the test process itself.
  `WAYPOST_NO_INSTALL` is not the tool for this: it switches off the repair
  these tests are about.

### What is deliberately unchanged

- `harnesses/codex.json` keeps `AGENTS.md` in `detect`. It is the only
  instruction file the Codex docs describe, so for a Codex project it is
  frequently the only on-disk evidence, and the cost of being wrong is now one
  extra `agents install` in a project that happens to keep a shared file.
- `markerCounts()` is untouched. The file is legitimately the user's; the
  question was never whether waypost may read it.
- `tests/harness.test.mjs:233` and `:249` (E-1) stand, unchanged. The live run
  confirmed what they protect.

## Acceptance Criteria

- [x] A project with no marker at all is still recognised, when `setup` runs from
      inside that harness — evidence: `tests/harness.test.mjs` "setup sees the
      harness it is running inside, not only the project's files", and the live
      `codex` run above
- [x] A marker and the running harness are both installed, not one of them —
      evidence: "a harness from the project and the one running are both
      installed"
- [x] An explicit `--harness` still wins over both — evidence: "an explicit
      --harness still overrides what is running and what is on disk"
- [x] A harness known only by its env marker — no `WAYPOST_HARNESS`, no file, no
      process — is recognised, and the neutralised env really is neutral —
      evidence: "a harness found by its env marker alone", which is the read the
      other cases bypass
- [x] Two consecutive runs agree on the harness set, on the E-1 fixture, and
      `setup` writes nothing the next run mistakes for evidence — evidence:
      "setup is idempotent in the harness set it writes"; the same case fails
      under a mutation restoring the bare-`existsSync` detector
- [x] The suite does not depend on which harness is running it — evidence: green
      in three environments — this session's own, an inherited
      `WAYPOST_PROC` naming another harness, and
      `WAYPOST_HARNESS=codex` + `CODEX_SANDBOX` + `CLAUDECODE`
- [x] A real `codex` project is still detected by `.codex/` **and** by a bare
      `AGENTS.md` — evidence: the unchanged E-1 test, and `.codex/agents/*.toml`
      written in the live run
- [x] `waypost doctor` clean on this repository — evidence: 0 issue, 0 warning
- [x] `npm test` green — evidence: full suite
- [x] The decision is recorded as an ADR, and `AGENTS.md` in `detect` is stated
      there as a deliberate position rather than left to the two contradicting
      records
- [x] Projects already polluted by the old guess have a recovery, and the
      CHANGELOG names the right one per shape — evidence, measured on both: a
      project that only kept a shared `AGENTS.md` got the routing block in *that*
      file, so `waypost agents uninstall --harness codex` alone restores the
      state and `rm -rf .codex` is not needed; a marker-less project got
      `.codex/AGENTS.md`, which uninstall leaves behind, and there the directory
      does have to go. `setup` keeps offering codex in the first case, because
      `AGENTS.md` stays a codex marker — accepted above, one extra install, not a
      wrong project. A user's `.codex/config.toml` survives uninstall (measured)
- [ ] The WP-14 runbook no longer creates an `AGENTS.md`-only project to
      demonstrate detection (done), and a full live run of it still reaches
      `Waypost-Harness: <id>` — evidence: the run
- [ ] `waypost agents install` and `skills install` ask the running harness too,
      closing the dead end a marker-less project still has: `waypost next`
      prints a bare `waypost agents install`, which exits 1 (measured) —
      evidence: the follow-up, out of scope here
- [ ] `waypost agents uninstall` leaves no evidence behind, so the recovery above
      is one command — evidence: the follow-up

## Technical Notes

- The union is what makes the two symptoms one bug. Codex's `.codex/` directory
  in a project is, in practice, waypost's own: the live run showed codex
  creating no project-local file at all. So "detected by `.codex/`" and
  "polluted by a previous wrong guess" are the same path, and no marker-based
  rule can separate them — which is why the fix had to be a second source of
  evidence, not a sharper reading of the first.
- A live `codex` session under its default sandbox cannot write `.codex/`:
  `mkdir` returns `EPERM` under `sandbox: workspace-write` (measured, 2026-09-30).
  With `--dangerously-bypass-approvals-and-sandbox` the full `setup` completes and
  writes 5 role files, a routing block in `.codex/AGENTS.md`, and `doctor` reports
  0 issue, 1 warning. Worth knowing for the live-loop runbook: a real Codex
  session may need that flag for a first-run install, and the runbook should say
  so rather than leave it to look like a waypost failure.
- `bin/waypost:171-173` already said "no harness detected — name one", so the
  fallback text needed no change; what changed is how often it is correct.
- Not done, and deliberately: a registry field separating "a path that means this
  project uses this harness" from "a path another harness merely reads". It is
  the right shape for expressing the shared-file case per entry, and the
  fixed-key JSON projection at `scripts/agents.mjs:1241` would have to be
  threaded through for a new field to reach `setup` at all. It answers a question
  this fix no longer needs answered, so it belongs to a later story.
- `setup` is not an idempotent operation on an empty project, and this change
  does not make it one. A run writes markers, detection is by directory, and the
  next run believes them — the loop `scripts/agents.mjs:1133-1135` names as the
  reason `harnessArg` refuses to default. What is asserted is the weaker, useful
  property: a second run agrees with the first. Bounding the accumulation (three
  runs, three harnesses, three markers) is not solved here.

## Dependencies

- the ADR gate: the fix stands on its own measurement, the ADR records why
- independent of `story-ps-in-the-c-locale-so-the-process-table-exists-on-any-host`:
  this fix reads the process table that story made reliable, and is independent
  of it — with `WAYPOST_HARNESS` set, or in a Codex session where
  `CODEX_SANDBOX` is exported, no process table is needed at all

## Attachments

- **live `codex` measurement, 2026-09-30**, `codex-cli 0.159.2` at
  `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex` (not in
  PATH; the ChatGPT.app bundle carries it), in `/tmp` repos:
  - `codex exec` in a repo with only `AGENTS.md`: no `.codex/` afterwards
  - `env` from inside the session: `CODEX_SANDBOX=seatbelt`,
    `CODEX_SANDBOX_NETWORK_DISABLED=1`, `CODEX_HOME` unset, plus
    `CODEX_THREAD_ID`, `CODEX_SESSION_ID`, `CODEX_CI`, `CODEX_VERSION`
  - `setup --dry-run` in that repo: "no harness detected", while
    `detectHarness()` answered `codex` and `detectHarnesses()` answered `[]`
  - after the fix, the same session: "would install roles for codex"
  - full `setup` under `--dangerously-bypass-approvals-and-sandbox`: 5 role
    files in `.codex/agents/`, routing block in `.codex/AGENTS.md`, `doctor`
    0 issue / 1 warning
- original report, 2026-09-30: `waypost setup --dry-run` in a project with a
  README and one line of `AGENTS.md` reported "would install roles for codex"
- critic pass 2026-09-30: `revise` — the blanket invariant breaks `claude` and
  `gemini`; plan step 1 reversed a recorded decision silently; "21 of 22" was
  wrong; the runbook change is work, not a note; the existing `selfInstall`
  mitigation was unmentioned. All corrected above.
- critic pass 1 on the implementation, 2026-09-30: `revise` — the explicit
  `--harness` list handed over the weaker `existsSync` set and so lost E-1; the
  documented uninstall escape did not work; an inherited `WAYPOST_PROC` leaked
  into the suite; "setup was the only consumer" was false; `external_refs` cited
  a redirect stub; `harnesses/codex.json` claimed a live exercise while staying
  `documented`. All corrected, each re-measured.
- critic pass 2 on the revision, 2026-09-30: `revise` — it confirmed those six
  and found a regression this revision had introduced: reading the registry
  in-process has no `WAYPOST_HOME` pin that every spawn gets, so a foreign
  `WAYPOST_HOME` or `CLAUDE_PLUGIN_ROOT` lost *both* halves of the answer and
  the user was told "no harness detected" with no reason (fixed, plus a named
  diagnostic). Also: two of the new tests passed under the mutation they claimed
  to guard (both rewritten, both now fail by mutation); the uninstall escape was
  attributed to the wrong scenario (now two measured shapes); the E-1
  measurement quoted halves from two different fixture states (one table, one
  command); process-table attribution — the mechanism the whole decision rests
  on — was absent from the negative consequences (added, with its measurement).
  What it would still not sign: the second live-loop run, and the direct
  `install` dead end left open by this scoping.
- critic pass 3, 2026-09-30: `revise` — the `WAYPOST_HOME` fix was defeated by
  `registry()`'s memo, primed unpinned by `main()`'s own detection, so a foreign
  root holding a *valid* registry answered with that root's ids (or none, for an
  inherited harness) and aborted mid-command on an id the child rejects; the
  CHANGELOG's marker-less escape was promised as a one-time reset that the next
  `setup` undoes; "restores the previous state" was false for the shared
  `AGENTS.md` case (uninstall takes `.codex/`, `agents unregister` takes the
  block); the recorded `--harness` mutation was not the pair it takes to fail;
  and the short-circuit had no assertion. All corrected: the memo is keyed on the
  root as well as pinned, `main()`'s read is pinned, the foreign-root case covers
  both shapes, the override mutation is recorded as the pair it is, the
  short-circuit has its own assertion, and the ADR carries `guards` (ADR-0011)
  that forbid the deleted detector and require the pin.
- mutation checks on a copy of the tree, 2026-09-30, each expected to fail one
  named case: `WAYPOST_HOME` pin removed (in `handleSetup`, and everywhere) →
  "a foreign WAYPOST_HOME costs neither half of the answer"; `detectHarness()`
  fallback removed from `runningHarness` → the same case; bare-`existsSync`
  detector restored → "setup is idempotent in the harness set it writes";
  `runningHarness()` forced to `null` → four cases; `--harness` override guarded
  by a *pair* (short-circuit removed **and** the list widened to a union),
  because after the short-circuit the union is unreachable and either half alone
  changes nothing.
- two more critic passes, 2026-09-30, one per candidate resolution (remove the
  marker / add a registry field). Both returned "survives with required changes".
  What they established, verified by hand afterwards:
  - the cost bound this story relied on is **false** — `waypost doctor` says
    nothing about a project polluted by a wrong `setup`; measured 0 issue, and
    it even asks for codex skills to be installed there
  - `bin/waypost` held a **second detector** that never called
    `detectHarnesses()` — it filtered the `agents harnesses --json` projection
    with a bare `existsSync`, and that projection (`scripts/agents.mjs:1241`)
    lists a fixed key set, so a new registry field could not reach `setup` at
    all. **Since fixed**: the function now delegates to the module's detector,
    which is what made the second half of the ADR's rationale necessary
  - `bin/waypost` tells `waypost next` to answer `waypost agents install` with
    no `--harness`, which is the command that fails with exit 1 in a
    marker-less project. **Still true** — the follow-up below
  - `scripts/agents.mjs:635` says the routing block is "the block target for
    nine other harnesses"; it is 21
  - this story's body said `CLAUDE.md` is read by 6 entries; it is 7
- **vendor documentation, 2026-09-30.** The vendor's own AGENTS.md guide
  (`https://developers.openai.com/codex/guides/agents-md`) documents `AGENTS.md`
  as the primary project instruction file, discovered "starting at the project
  root (typically the Git root)"; the only project-level Codex file is
  `.codex/config.toml`, described as existing for trusted projects a user
  configures. A plain `codex` session in a project holding only `AGENTS.md` is a
  fully documented Codex project, which is why removing the marker was rejected
  rather than merely deprioritised. (`docs/agents_md.md` in the openai/codex tree
  is a redirect stub to that page, so the page itself is what the ADR cites.) The
  registry's `docs` field for codex still names a non-vendor URL, but for the
  agent-TOML *format* — a different claim — and that is why codex stays
  `documented` rather than `verified` after the live run.
- ADR-0005 line 143 argued the same call was already made for `AGENTS.md` when
  `.agents/` was dropped as a marker for kimi. The live run shows that reading
  was wrong in its consequence: `.agents/` was kept for antigravity and dropped
  for kimi, so the precedent is "keep it for the owner, drop it for the reader",
  not "shared means never evidence".

---

*Last updated: 2026-09-30*
