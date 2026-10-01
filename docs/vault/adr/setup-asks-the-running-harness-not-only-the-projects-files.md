---
type: adr
id: "setup-asks-the-running-harness-not-only-the-projects-files"
title: "setup asks the running harness, not only the project's files"
status: proposed
date: 2026-09-30
authors: ["Ivan Morozov"]
tags: []
external_refs: {"codex-agents-md": "https://developers.openai.com/codex/guides/agents-md"}
supersedes: null
superseded_by: null
review_status: pending
reviewed_at: null
drafted_by: {"harness":"opencode","provider":null,"date":"2026-09-30"}
guards: [{"forbid": "existsSync\\(join\\(projectRoot\\(\\), d\\)", "in": "bin/waypost", "why": "this diff deletes bin/waypost's second detector — the agents harnesses --json projection filtered with a bare existsSync over each detect path. That detector is measurably weaker than scripts/agents.mjs's detectHarnesses (E-1), and since setup hands its result to the child as an explicit --harness list it is now what gets written, so it must not come back"}, {"require": "withRegistryHome\\(", "in": "bin/waypost", "why": "an in-process import of scripts/agents.mjs gets no WAYPOST_HOME pin the way every spawn does, so every registry read in this dispatcher has to pin it or answer from a foreign root"}, {"check": "node --test tests/harness.test.mjs", "why": "the six setup cases and the hermetic harness-evidence helper live there, including the mutation-observable ones"}]
code_refs: ["bin/waypost", "scripts/agents.mjs", "tests/harness.test.mjs", "harnesses/codex.json", "docs/harnesses.md", "docs/vault/ops/verify-a-harness-live-the-whole-waypost-loop-in-one-session.md", "CHANGELOG.md"]
---

# setup asks the running harness, not only the project's files

| Field | Value |
|---|---|
| **Status** | proposed |
| **Date** | 2026-09-30 |
| **Authors** | Ivan Morozov |

---

## Context

A registry entry answers one question — *does this project show evidence of
using that harness?* — through its `detect` paths. It is a question about files.
It cannot answer *which CLI is running here*, and a harness may leave nothing on
disk to answer with.

Measured 2026-09-30, from inside a live `codex` session (`codex-cli 0.159.2`,
found in the desktop bundle at `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`,
not in PATH), in a git repository containing only a README and no harness marker
of any kind:

| question | answer |
|---|---|
| does `codex` create a project-local `.codex/`? | no — `ls -a` identical before and after `codex exec` |
| does the session export a marker the registry declares? | yes — `CODEX_SANDBOX=seatbelt`, `CODEX_SANDBOX_NETWORK_DISABLED=1`; `CODEX_HOME` unset |
| does `waypost setup` see it? | no — "no harness detected", while `detectHarness()` answered `codex` |

`setup` was the only consumer that *wrote* on the strength of file markers
alone. `doctor` already unioned the running harness into the harnesses it
considered in use, and `selfInstall` already installed a first-run harness's
roles from `detectHarness()`, with no file marker involved at all.

The scope of this decision is `setup` only, and that is deliberate rather than
complete: `waypost agents install` and `waypost skills install` still ask the
filesystem alone, so a user who reaches them directly in a marker-less project
still gets "no harness detected — name one". The user-visible dead end that
follows from that is measured, not assumed: in a marker-less project `doctor`
says "opencode is used by this project but has no waypost roles → `waypost agents
install`", and that command exits 1. Making the installer union as well is the
obvious follow-up and is left to it; what is decided here is that `setup`, the
one command whose job is to configure a project for the first time, is not the
place to leave a harness invisible.

The report that prompted the investigation was the mirror image: `AGENTS.md` is
a `detect` marker for `codex` and for no other entry, while being the
`instructions` target of all 21, so a project keeping a plain user-written
`AGENTS.md` and no harness directory is reported as a codex project. Two
opposite symptoms, one cause. `AGENTS.md` was covering for the blindness: a real
codex project almost always has one, because OpenAI's own `docs/agents_md.md`
makes it the primary project instruction file, discovered from the repository
root, with no `.codex/` in the picture. Projects without one got the wrong
answer, and nothing recorded that the right answer elsewhere had been luck.

## Decision

`setup` asks the same two sources `doctor` and `brief` already use, and unions
them. It answers "which harnesses" from file markers **and** from the harness it
is running inside, with no precedence between the two: a file says the project
uses that harness, a running process says someone is in it now, and both can be
true. An explicit `--harness` still overrides both.

The union is passed to `agents install` and `skills install` as an explicit
`--harness` list rather than left to the child, for two measured reasons:

1. the child re-detects from markers on its own, so a harness found only by the
   process would be named in the label and then skipped — the label would be a
   lie;
2. it removes a hard abort. A project holding only waypost's own routing block
   used to make `setup` print `install roles for codex` and then fail: the child
   strips the block (E-1), finds nothing, and exits 1 mid-command, leaving the
   project bound and scaffolded but with no roles and no routing block.

Because the list is now what gets written, the marker half of the union is
taken from `scripts/agents.mjs`'s own `detectHarnesses()`, not from the
`agents harnesses --json` projection that `bin/waypost` filtered with a bare
`existsSync`. That weaker detector is the one this used to stand in for the
child's, and it is measurably wrong. On the E-1 fixture — `.pi/`, a README, and
an `AGENTS.md` carrying only waypost's routing block — one script printing both
sets, with the run pinned to `pi` so that nothing ambient is added:

| state | projection + `existsSync` | `detectHarnesses()` |
|---|---|---|
| before `setup` | `[ 'codex', 'pi' ]` | `[ 'pi' ]` |
| after `setup` | `[ 'antigravity', 'codex', 'pi' ]` | `[ 'pi' ]` |

The extra ids are exactly the unrequested directories: with the naive set handed
over as an explicit list, `setup` would have written `.codex/agents/` and
`.antigravity/` — the E-1 loop, reached through `setup` instead of the
installer. One detector, used in both places. `tests/harness.test.mjs` guards it:
"setup is idempotent in the harness set it writes" fails if the delegation is
reverted to the bare `existsSync` filter.

`AGENTS.md` stays in `codex`'s `detect`, deliberately and recorded: it is
frequently the only on-disk evidence a real codex project has, and the cost of
the over-count is one extra `agents install` in a project that keeps a file all
21 harnesses read.

## Rationale

1. **It fixes the cause rather than one of the two symptoms.** Both original
   candidates — deleting the `AGENTS.md` marker, adding a registry field
   separating "a path this harness uses" from "a path another harness reads" —
   sharpened the file layer while leaving `setup` blind. Deleting the marker in
   particular would have made the blindness visible for every codex user, since
   the file was the only thing masking it.
2. **It is consistent with two existing decisions rather than a third rule.**
   `doctor` unions the same two sources; `selfInstall` reads the running harness
   alone. `setup` was the outlier.
3. **It is one behaviour, not twenty-one judgements.** A registry field can
   express "this shared file is still evidence" per entry, and the machinery for
   it is not free: `bin/waypost`'s own harness detector filters a fixed-key JSON
   projection with a bare `existsSync`, so a new field could not reach `setup`
   without threading it through two more places. That is the right shape for a
   follow-up; it is not a prerequisite for asking the process.
4. **The measurement, not the argument, chose it.** ADR-0005 line 143 argued the
   same call was already made for `AGENTS.md` when `.agents/` was dropped as a
   marker for kimi. The live run shows that reading was wrong in its
   consequence: `.agents/` was kept for antigravity and dropped for kimi, so the
   precedent is "keep it for the owner, drop it for the reader" — which argues
   *for* keeping `AGENTS.md` for codex, since codex is its primary documented
   consumer.

## Alternatives Considered

### Remove `AGENTS.md` from `codex`'s `detect`

**Pros**:
- a project that only keeps a shared `AGENTS.md` stops being told it uses codex,
  which is the symptom that opened the investigation
- no new field, no new detection rule; the marker simply stops claiming more
  than a directory does

**Cons**:
- a real codex project in a bare repo — the documented, supported shape — is
  de-detected at `setup`, since codex writes no project file of its own; only
  `selfInstall` on the first `brief` would recover
- does nothing about any other harness whose only trace is its process, which is
  the general form of the problem

**Rejected because**:
- it trades a false positive for a false negative on evidence the vendor's own
  documentation calls primary, and leaves the actual defect in place. It also
  contradicts the ADR-0005 precedent when that precedent is read correctly.

### Add a registry field: `detect` means "owned", `instructions` means "read"

**Pros**:
- expresses the shared-file case per entry instead of arguing about it: a
  default, and a recorded reason for each entry that departs
- survives the case where a project's only evidence genuinely is a file

**Cons**:
- more schema for a question this fix no longer needs answered
- reaches `setup` only after two detectors are threaded through it, so it is a
  larger change than the defect

**Rejected because**:
- it is the right follow-up and the wrong prerequisite. Deferred, not denied.

## Consequences

**Positive**:
- `waypost setup` inside a project with no marker at all configures the project
  for the harness actually in use
- one fewer place where a harness can be invisible: the layer that missed it was
  the layer every first-run install goes through

**Negative / trade-offs**:
- `setup` now depends on `scripts/agents.mjs` being importable, and reads the
  registry in-process — the price of one detection instead of two. An in-process
  import does not get what every spawn gets for free: `run()` passes
  `WAYPOST_HOME=ROOT`, so `pluginRoot()` resolves the registry from this
  executable's own tree. Unpinned, a caller with a foreign `WAYPOST_HOME` — a
  documented setting — or with `CLAUDE_PLUGIN_ROOT` set, which is itself one of
  the `env` markers the `claude` entry declares, took over *the answer*, in two
  ways. A root that does not exist throws in `registry()`, so both halves
  degraded together and a project with real markers was told it had no harness,
  with no reason. A root that *does* resolve is worse: nothing throws, so no
  diagnostic fires, and the ids came from that root — this project was offered
  for a harness this tool has never heard of (whose id the child then rejects,
  aborting the command mid-way and leaving the project bound and scaffolded with
  no roles), and an inherited, correct `WAYPOST_HARNESS` was validated against
  that root's id list and silently dropped. All three measured, each with a case.
  The pin alone did not fix the second: `registry()` memoizes, and `main()`'s own
  detection read it first, so the fix covers that read too and the memo is keyed
  on the root as well (`scripts/agents.mjs`). The pin makes this answer right;
  the key stops a second reader inheriting the first one's.
- **the guess can still make itself true.** A run writes markers — a roles
  directory, the shared `.agents/skills/`, a block-only `AGENTS.md` — and
  detection is by directory, so the next run believes them. That is
  `scripts/agents.mjs:1133-1135`'s own stated reason for `harnessArg` dying
  rather than defaulting, and it is now reachable through `setup`: three runs
  from three harnesses accumulate three harness markers in one project. It is
  bounded rather than solved — the second run is asserted to agree with the
  first, so a given run is stable, but `setup` is not an idempotent operation
  on an empty project and is not claimed to be. For a command whose job is "set
  this project up from nothing", the concrete consequence is that the first run
  on a marker-less project fixes the harness permanently, including when that
  harness is an ambient or nested one (below). No flag changes that: `--harness`
  chooses, and there is no "just this one, then stop asking" mode. Deciding
  whether a non-interactive run should default to the explicit list instead of
  the union is a separate decision, not made here.
- **ambient harness evidence is inherited**, which the runbook already warns
  about: a `CLAUDE.md`-only project set up from an OpenCode session installs
  for both. Unioning a signal the codebase calls unreliable into the one
  command that writes is a design call, not a free win. The alternative —
  asking only about the project — is what made a live codex session invisible.
  - **and attribution is by nearest non-shell ancestor
    (`scripts/presence.mjs:228-233`), so a nested agent names its own harness,
    not the user's.** Env markers can be cleared by the caller; the process
    table cannot be turned off from inside at all. Measured on an empty project
    with `WAYPOST_HARNESS` and `WAYPOST_PROC` cleared, running `setup` from a
    process whose non-shell ancestor is named `codex`: `would install roles for
    codex`; the same command from an ancestor named `node`: `no harness
    detected`. So a subagent, a nested agent run, or a harness launched from a
    harness gives the *inner* harness's roles to the *outer* project, and the
    marker then makes it permanent. The union only ever adds, so `--harness` is
    the single way to refuse it.
- the test suite had to become hermetic in a respect it was not, in two places:
  every spawn now empties the harness evidence the driving session exports, and
  this file clears its own `process.env.WAYPOST_PROC`, which no per-spawn env
  can reach because `harnessProcess()` reads it before the table it is handed.
  Measured on the pre-revision tree: an inherited `WAYPOST_PROC` alone produced
  4 failures; with both hermetic fixes reverted on the current tree, 6 — the
  extra two are the new cases. What this does **not** neutralise is the
  process table itself: clearing `WAYPOST_PROC` in a spawn *enables* the real
  table in that child, and the suite is green because `node --test` puts a
  non-shell `node` between the child and the harness running the tests. That is
  load-bearing and unasserted; a real fix is a `--pid`/`--ppid` seam.
- a project polluted by an earlier wrong guess has no automatic way back, and
  the shape of the cleanup depends on which guess polluted it (both measured;
  `uninstall` removes waypost's own role files, and a user's
  `.codex/config.toml` survives). A project that only kept a **shared**
  `AGENTS.md`: `setup` wrote the role files under `.codex/agents/` and put the
  routing block into that root `AGENTS.md` — not into `.codex/AGENTS.md` — and
  `uninstall --harness codex` removes the whole `.codex/` directory once nothing
  else is in it. So the *directory* is restored; the user's `AGENTS.md` still
  carries the block, which is `agents unregister`'s job, not uninstall's. And
  `setup` keeps offering codex afterwards, because `AGENTS.md` remains a codex
  marker and that over-count is accepted above. A project with **no** marker at
  all: `setup` wrote `.codex/AGENTS.md`, which `uninstall` leaves behind, so
  there the recovery does need the directory removed as well — and that is not
  a state the next `setup` will stay out of, because the union re-detects the
  harness it is running inside. The CHANGELOG says so rather than promising a
  reset. `doctor` flags none of it, because waypost cannot tell an unjustified
  install from a justified one. Making `uninstall` leave no evidence is the
  better fix and is left to the story that owns it.

**What changes in code / process**:
- `bin/waypost`: `runningHarness()`, the union in `handleSetup`,
  `detectedHarnesses()` delegating to the module's E-1-aware detector, and
  `withRegistryHome()` / `registryReadFailed()` so both in-process reads resolve
  the registry from this tree and a registry that cannot be read is named
- `tests/harness.test.mjs`: six cases (running harness, env marker alone, foreign
  `WAYPOST_HOME` incl. the broken-registry diagnostic, two-run idempotence, union,
  explicit `--harness`), plus the two hermetic fixes
- `docs/harnesses.md` gains *Two sources of evidence*; `harnesses/codex.json`
  records the `AGENTS.md` position and the live-verification date
- `scripts/agents.mjs`: `registry()`'s memo is keyed on `pluginRoot()`, so a
  second reader from a different root is a different registry rather than the
  first one's answer
- this ADR checks itself (`guards`, ADR-0011): `forbid` the deleted bare-
  `existsSync` detector in `bin/waypost`, `require` the `WAYPOST_HOME` pin, and
  `check` the test file. The `forbid` matches the code shape rather than the
  phrase, because the prose here and in the code comments names the deleted
  detector on purpose
- the live-loop runbook no longer creates an `AGENTS.md`-only fixture, and
  documents the `EPERM` a first `codex` install hits under its own sandbox

## Verification and follow-up

- [x] Live `codex` session, before the fix: "no harness detected" in a
      marker-less repo, `detectHarness()` → `codex`
- [x] Live `codex` session, after the fix: "would install roles for codex"
- [x] Full `setup` under `--dangerously-bypass-approvals-and-sandbox`: five role
      files in `.codex/agents/`, routing block in `.codex/AGENTS.md`, `doctor`
      0 issue / 1 warning
- [x] `tests/harness.test.mjs` green (99 cases), including the six new ones
- [x] A foreign `WAYPOST_HOME`, both shapes, on a project with `.claude/`:
      a root that does not exist and a root holding a valid one with an id this
      tool has never heard of, whose `detect` matches the project. Fixed code
      says `would install roles for claude` in both, keeps an inherited
      `WAYPOST_HARNESS=claude`, completes a real (non-dry) run, and never names
      the foreign id; pre-fix it says `no harness detected`, or names the foreign
      id and aborts mid-command. A `.waypost/harnesses/x.json` that is not JSON
      names the file and which read wanted it, on stderr, once per read
- [x] An explicit `--harness` under both foreign roots still decides, and consults
      nothing: no registry diagnostic when the decision did not need one
- [x] Each load-bearing case fails when its guard is broken, by mutation on a
      copy: no `WAYPOST_HOME` pin, no `detectHarness()` fallback, bare-`existsSync`
      detector restored, `runningHarness()` forced to null. The `--harness`
      override is guarded by a *pair* — removing the short-circuit **and**
      widening the list to a union — because after the short-circuit the union
      is unreachable, and either half alone changes nothing
- [x] The two cleanup shapes measured, not reasoned: a shared-`AGENTS.md`
      project is restored by `agents uninstall --harness codex` alone; a
      marker-less one additionally needs `.codex` removed, because `setup` wrote
      `.codex/AGENTS.md` there. A user's `.codex/config.toml` survives uninstall
- [x] Process-table attribution measured: an empty project whose nearest
      non-shell ancestor is named `codex` gets codex roles with both env markers
      cleared; the same command from an ancestor named `node` gets none
- [x] Two-run idempotence of the harness set, on the E-1 fixture: measured
      against a mutation that restores the bare-`existsSync` detector, and the
      idempotence case is the one that fails
- [x] The suite is green under three inherited environments: none, a pinned
      `WAYPOST_PROC` naming another harness, and `WAYPOST_HARNESS=codex` plus
      `CODEX_SANDBOX` plus `CLAUDECODE`
- [x] Fresh-context critic pass 1 (2026-09-30): `revise`. Its verified findings —
      the E-1 loss from the explicit list, the non-functional uninstall escape,
      `WAYPOST_PROC` leaking into the suite, the "only consumer" overreach, the
      `external_refs` URL — are corrected above
- [x] Fresh-context critic pass 2 (2026-09-30): `revise`. It confirmed those six
      and found a regression of its own: the in-process registry read had no
      `WAYPOST_HOME` pin, so a foreign root lost both halves of the answer (fixed,
      and the cause is now in Negative); two new tests passed under the mutation
      they claimed to guard (both rewritten, both now fail by mutation); the
      uninstall escape was attributed to the wrong scenario (split into the two
      measured ones); the E-1 measurement quoted halves from two different
      fixture states (one table, one fixture, one command); and process-table
      attribution — the mechanism this ADR rests on — was missing from the
      negative consequences (added, with its measurement)
- [x] Fresh-context critic pass 3 (2026-09-30): `revise`. It showed the pin alone
      was not enough — `registry()` memoizes and `main()`'s own detection primed
      it unpinned, so a foreign root holding a *valid* registry answered with
      that root's ids (and with none for an inherited harness, validated against
      the wrong id list); that a real run then aborted mid-command on an id the
      child rejects, the exact shape this ADR claims to have removed. Also: the
      CHANGELOG promised a one-time reset the next `setup` undoes; "restores the
      previous state" was false for the shared-`AGENTS.md` case (`agents
      unregister` takes the block, not `uninstall`); the recorded `--harness`
      mutation was not the pair that actually fails; and the short-circuit had no
      assertion. Fixed: `main()`'s read pinned, the memo keyed on the root, both
      foreign-root shapes in one case, the override mutation recorded as the
      pair, the short-circuit asserted, and `guards` added so the decision
      checks itself
- [ ] A fourth critic pass over this revision, before `accepted`
- [ ] A full live-loop run of the runbook on a real codex session, reaching
      `Waypost-Harness: codex` on the commit — that also closes WP-14
- [ ] `waypost agents uninstall` leaving no evidence behind, so the recovery is
      one command rather than a documented `rm -rf`
- [ ] `waypost agents install` / `skills install` asking the running harness as
      well, which closes the `doctor` → `install` → exit 1 dead end
- [ ] The registry field, if it is ever wanted, as its own story

## References

- Story: WP-19 "setup asked the filesystem alone about which harnesses a project uses"
- ADR-0005 line 143 — the `.agents/`/kimi marker precedent, read here in the
  opposite direction
- `https://developers.openai.com/codex/guides/agents-md` — `AGENTS.md` as the
  primary project instruction file, discovered "starting at the project root
  (typically the Git root)". Note `docs/agents_md.md` in the openai/codex tree is
  a redirect stub to this page, so it is the page that is cited
- `docs/harnesses.md` — *Two sources of evidence*
- `docs/vault/ops/verify-a-harness-live-the-whole-waypost-loop-in-one-session.md`

---

*Last updated: 2026-09-30*
