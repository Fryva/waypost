---
type: story
id: "story-agentsmd-is-not-evidence-that-codex-is-used-here"
epic: "WP-19"
title: "AGENTS.md is not evidence that codex is used here"
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

# AGENTS.md is not evidence that codex is used here

| Field | Value |
|---|---|
| **Epic** | [WP-19](../epic.md) |
| **Status** | in-progress |
| **Priority** | p1 |
| **Assignee** | Ivan Morozov |

---

## Description

`AGENTS.md` is listed as a `detect` marker for `codex` and for no other entry.
It is the `instructions` target of **all 21** entries in `harnesses/`. A
project that has an `AGENTS.md` with a line of the user's own prose in it, and
no harness directory at all, is therefore detected as a Codex project.

The user is anyone whose project keeps a plain `AGENTS.md` — the file every
harness in the registry reads, and the one the routing block itself is written
into. For them `waypost setup` installs `.codex/agents/*.toml`, and `waypost next`
names `waypost agents install` for codex. In a session running OpenCode, the
agent is told to install Codex's roles.

Live, in a throwaway project containing only a README and
`AGENTS.md: My own rule.`:

```
$ waypost setup --dry-run
  would install roles for codex
  would install skills for codex
  would register the routing block
```

### What the registry actually looks like

| entry | `detect` | the file it claims | read by (other entries) | own dir marker? |
|-------|----------|--------------------|-------------------------|-----------------|
| `codex` | `.codex`, `AGENTS.md` | `AGENTS.md` | 20 | yes |
| `claude` | `.claude`, `CLAUDE.md` | `CLAUDE.md` | 6 | yes |
| `gemini` | `.gemini`, `GEMINI.md` | `GEMINI.md` | 1 (antigravity) | yes |
| `copilot` | `.github/agents`, … | `.github/copilot-instructions.md` | 0 | yes |
| `iflow` | `.iflow`, `IFLOW.md` | `IFLOW.md` | 0 | yes |
| `qwen` | `.qwen`, `QWEN.md` | `QWEN.md` | 0 | yes |

Every entry that claims an instruction file also has a **directory of its own**
as a marker, and that directory is a genuine fingerprint. The instruction file
is the ambiguous half — the case `markerCounts()` already handles for "waypost
wrote this", and the case nobody handles for "another harness merely reads
this". Six of the twenty-one also list their own file in *both* `detect` and
`instructions`, so any blanket rule about the two lists has to exclude
self-overlap or it forbids something legitimate.

### This is an unresolved contradiction in the repo, not an open question

- **For removal** — `ADR-0005` (line 143) already made the call, on the same
  reasoning, for `kimi`: `.agents/` was dropped as a marker because it is "a
  shared convention Kimi merely reads, so it says nothing about which CLI runs
  here (**the same call the registry already makes for `AGENTS.md`, read by
  nearly all and claimed by `codex` alone**)".
- **For keeping it** — `tests/harness.test.mjs:217` "a real user-written
  AGENTS.md still detects codex (E-1 does not over-correct)", and
  `bin/waypost:3484`, which documents setup as installing "for the harnesses
  this project shows evidence of (a `.codex/` directory, **a CLAUDE.md with the
  user's own content**)". `git log -S` shows the test and the `markerCounts`
  block-stripping guard arrived in the same commit, so the intent was
  deliberate.

Two recorded positions, opposite. That is an ADR, not a patch, and it is the
owner's call. This story therefore does not implement a fix; it produces the
decision and then carries it out.

## Decomposition

- [ ] **Owner decision, recorded as an ADR** (or an amendment to ADR-0005, whose
      line 143 already argues for removal): which recorded position supersedes
      which, and whether `AGENTS.md` alone is evidence of Codex at all
- [ ] Whatever the decision, the registry gets to say so per entry rather than
      by omission: a field that separates "a path that means this project uses
      this harness" from "a path another harness merely reads", so the shared-file
      case is expressed instead of argued about. Default one way, each entry that
      disagrees says why in its own `notes`
- [ ] The whole registry is walked for the same shape, not just `codex`:
      `claude`/`CLAUDE.md` (read by 6) and `gemini`/`GEMINI.md` (read by 1) are
      the same asymmetry at a smaller scale, and whether they are violations
      depends on the definition of "shared" the decision settles
- [ ] `docs/vault/ops/verify-a-harness-live-the-whole-waypost-loop-in-one-session.md`
      is updated as work. Its setup step creates "an `AGENTS.md` with one line of
      your own" before `waypost setup`, which is what makes every harness look
      like a codex project; after the change `setup` there must name the harness
      (`waypost setup --harness <id>`) or the runbook verifies nothing
- [ ] `harnesses/codex.json` `notes` and `docs/harnesses.md` follow the decision
      — both document the detection rationale in prose today
- [ ] CHANGELOG entry: this is a user-visible detection change

## Implementation Plan

Deliberately none yet. The plan follows the ADR, and the ADR follows the owner's
decision. What is already settled and needs no further work:

- `markerCounts()` stays as it is. The file is legitimately the user's; what is
  wrong is the claim made about it. Making the function stricter about content
  would be the wrong fix, and the E-1 history is against it.
- The mitigation for the reported symptom already ships and bounds the blast
  radius: `detectHarness()` is process-first, and `selfInstall()` installs a
  first-run harness's roles from *the running harness*, with no filesystem
  marker at all (`tests/harness.test.mjs:1187`). A Codex user in an
  `AGENTS.md`-only project still gets roles on their first `waypost brief`. That
  is what turns this from "setup installs the wrong thing" into "setup's guess
  is wrong until the first brief", and it is why the two stories in this epic are
  independent.
- The reported transcript is reproducible as a scripted fixture with
  `hermeticDiscoveryEnv()` (`tests/harness.test.mjs:1382`), not as a manual
  `setup --dry-run` + `waypost next` pair — `setup --dry-run` binds nothing, so
  the second half of that pair prints "not bound to a vault yet" and cannot
  produce the output as quoted.

### Known cost, to weigh against the benefit

Projects the old behaviour already polluted **cannot be de-detected by this
change**, because the artifact it wrote — `.codex/agents/` — is the same path
`codex` legitimately detects on. `doctor` nags about it and `doctor --fix`
re-installs. Either that is accepted and written down, or it needs its own
story. This repository is one such project (`.codex/agents/` is tracked).

## Acceptance Criteria

- [ ] An ADR (or an amendment to ADR-0005) names which recorded position
      supersedes which, and the owner has approved it — evidence: the ADR at
      `status: accepted` with the decision in `Decision`, and the index updated
- [ ] The registry states the rule per entry, with a default and a recorded
      reason for every entry that departs from it — evidence: the field on all
      21 entries, and a test that fails on an entry that departs without one
- [ ] No `detect` path is claimed by an entry that also lists it in its own
      `instructions` *unless* that entry says why — evidence: the test, run over
      the merged registry (`HARNESSES`), not over `harnesses/*.json`, so a
      project override in `.waypost/harnesses/` cannot reintroduce the defect
- [ ] A project with a user-authored `AGENTS.md` and no harness directory is not
      reported as using codex, and `waypost setup --dry-run` names no harness to
      install — evidence: a scripted fixture, not a manual transcript
- [ ] The WP-14 runbook's setup step names the harness explicitly, and a full
      run of it still reaches `Waypost-Harness: <id>` on the commit — evidence:
      the runbook diff and the run
- [ ] A real codex project is still detected: `.codex/` with no other marker —
      evidence: a test, and the runbook
- [ ] `waypost doctor` clean on this repository — evidence: `waypost doctor`
- [ ] `npm test -- tests/harness.test.mjs` green — evidence: `npm test`
      (the sibling locale story owns `tests/presence.test.mjs`; the two cannot
      both close on a green suite without that ordering being stated)
- [ ] `harnesses/codex.json` `notes` and `docs/harnesses.md` match the shipped
      behaviour, and CHANGELOG carries the change — evidence: the diff

## Technical Notes

- Do not fix this by making `markerCounts` stricter about content. The file is
  the user's; the claim made about it is what is wrong.
- The distinction the story is really about has three cases, and the code today
  handles one of them: **waypost wrote this** (handled — `markerCounts` strips
  the routing block), **the user wrote this** (disputed, per the ADR-0005 /
  `harness.test.mjs:217` contradiction), **another harness merely reads this**
  (unhandled). A registry field expresses the third case directly. Deleting a
  marker, by contrast, discards a signal the user may want, and the plan for it
  as first written did so without noticing that `claude` and `gemini` are in the
  same position.
- A blanket invariant — "no `detect` path may be another entry's `instructions`"
  — was the first draft's generalisation and is **wrong**: it forces `CLAUDE.md`
  out of `claude`'s `detect`, which breaks
  `tests/harness.test.mjs:1378` ("one command leaves a project ready" writes
  `CLAUDE.md` and asserts `install roles for claude`) plus `:611` and `:1189`,
  and de-detects every Claude Code user whose only evidence is a `CLAUDE.md` and
  who has no `.claude/`. That is a larger regression than the one being fixed,
  and this repo — which has both `.claude/` and `.codex/agents/` — would have
  kept passing some of it.
- `bin/waypost:171-173` and `scripts/skills.mjs:218` already say "no harness
  detected here — name one: `--harness <id>`". The only delta is naming the
  reason, so this is a wording change, not a new mechanism.
- "Shared" needs a number. Read by 1 other entry (`gemini`) is a different case
  from read by 20 (`codex`); the ADR should say which threshold it uses.

## Dependencies

- the ADR and the owner decision gate every code item here
- independent of `story-ps-in-the-c-locale-so-the-process-table-exists-on-any-host`:
  the symptom this story reports needs no process table, and that story's fix
  does not touch detection markers

## Attachments

- live evidence, 2026-09-30: `waypost setup --dry-run` in a project with a
  README and one line of `AGENTS.md` reported "would install roles for codex"
- critic pass 2026-09-30: `revise` — the blanket invariant breaks `claude` and
  `gemini`; plan step 1 reversed a recorded decision silently; "21 of 22" was
  wrong; the runbook change is work, not a note; the existing `selfInstall`
  mitigation was unmentioned. All corrected above.

---

*Last updated: 2026-09-30*
