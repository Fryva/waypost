---
type: epic
id: "WP-21"
title: "Source an agent can read in one pass"
status: in-progress
priority: p2
created: 2026-10-04
updated: 2026-10-14
external_refs: {}
tags: []
code_refs: ["bin/", "package.json", "scripts/tokens.mjs", "scripts/token-navigation.mjs", "tests/tokens.test.mjs", "tests/token-navigation.test.mjs", "tests/scripts.test.mjs", "tests/sizes.test.mjs", "tests/harness.test.mjs", "AGENTS.md", "docs/how-it-works.md", "CHANGELOG.md"]
review_status: pending
reviewed_at: null
---

# WP-21: Source an agent can read in one pass

| Field | Value |
|---|---|
| **Status** | in-progress |
| **Priority** | p2 |
| **Created** | 2026-10-04 |
| **Updated** | 2026-10-14 |

---

## Goal

A task about one part of Waypost needs one file that fits in a single read and
is visible to extension-based code indexes — instead of windowed reads and
searching through files of 50–200 KB.

## Context

Measured on 2026-10-04 from this project's Claude Code transcripts (1.98 G
input tokens, two thirds of them in subagents): reading code is ≈26% of all
input; whole-file reads by subagents ≈16%; re-reading the same file in the same
context ≈8%. Project Memory and Waypost CLI output are each under 2% — not the
lever.

The most expensive file is `bin/waypost` (202 KB, extensionless, so the code
index does not see it): 441 navigation turns, ~159 M tokens. Next by measured
read volume: `scripts/sizes.mjs`, `scripts/lib.mjs` (88 KB), `scripts/presence.mjs`,
then `scripts/doctor.mjs` (104 KB). `scripts/team-host.mjs` is dense rather than
long and is under active WP-20 work.

Decision for the first and largest step: ADR "The CLI as a thin entry with
per-command modules, each readable in one pass" (proposed).

## Stories

The measurement increment is tracked by
[[story-reproducible-token-accounting-and-repeated-read-evidence|Reproducible token accounting and repeated-read evidence]].

| Story | Status | Description |
|-------|--------|-------------|
| `story-the-team-code-loads-only-for-story-write-and-the-cli-entry-is-an-mjs-the-code-index-sees` | done | Decision 0 of the ADR: lazy team import, entry renamed to `bin/waypost.mjs` behind a shim |

<!-- Planned, drafted after the ADR is accepted:
     1. the classifier of navigation turns committed to scripts/tokens.mjs, baseline recorded here
     2. bin/waypost.mjs becomes a thin entry; each command lives in bin/cli/
     3. scripts/lib.mjs split into lib-*.mjs behind an `export *` facade
     4. sizes.mjs / presence.mjs split by measured read volume
     5. doctor.mjs split into doctor-*.mjs (low priority)
     team-host.mjs: proposed to the WP-20 owner, not in this epic. -->

## Expected Results

- [x] Step 0: `version`, `help`, `run`, `capacity`, `size`, `clean` work with a deliberately broken team module; `story --write` still refuses a team-bound story.
- [x] Step 0, manual (codegraph is an external tool): `codegraph query` finds functions of `bin/waypost.mjs`.
- [ ] A committed classifier (Node, in `scripts/tokens.mjs`) counts navigation turns on `bin/(waypost|cli/)` with cache weights; the baseline is recorded in this epic and a target stated.
- [ ] Split: the entry ≤ 14 KB; every `bin/cli/*.mjs` ≤ 24 KB, pinned by a test.
- [ ] Split: the free-identifier test and the import-every-module test pass; `node --check` covers `bin/cli`.
- [ ] Split: `help`, `version` and an unknown command are byte-identical before and after; the suite is green on Node 20/22/24 at every step.
- [ ] Split: a CLI test "team-bound story → refuse" exists before the gate moves.
- [ ] Split: guards of other ADRs naming the entry are re-scoped; pointer comments updated.
- [ ] `npm pack --dry-run` lists `bin/waypost.mjs` (done in step 0) and `bin/cli/` after the split.

## Offline measurement baseline (2026-10-15)

Command: `waypost tokens --json --navigation --since 2026-10-08 --until 2026-10-15`.
The interval assigns each request by its first observed assistant timestamp (UTC)
and includes all cumulative usage blocks of that request. Retained Claude-only
history: 247 fingerprinted source files, 2,661 requests, 744,710,130 native tokens;
109,405,665 tokens (14.6910%) explicitly attributed to Waypost roles/skills. This
includes useful role work, not just overhead, and does not measure subscription
quota. Source/usage coverage was complete within the discovered files; no
request crossed a requested boundary in this sample.

Recognized navigation: 269 calls in 186 initiating requests; returned read text
3,076,145 JavaScript characters. Zero identical repeats were confirmed in this
conservative subset. There were 2,396 unsupported shell calls, so zero is not
evidence that the full workflow had no duplicate reads. Initiating-request input
is not the cost of returned text or an upper bound on later context reuse. The
report preserves input/cache counters and a separately labelled API-price proxy.

Actual output reduction for the same period: `--summary` returned 241 characters,
versus 2,188 for the detailed text report (88.99% fewer characters). This proves
shorter tool output only, not an 88.99% reduction in tokens or task cost.

Analyzer source hashes (working tree based on `7255443`, tracked changes present):

- `scripts/tokens.mjs`: `44abfa7b4e591fd0d9a16adcf6bcc3eb5eceef0d78c3f20548625203829ec9ee`
- `scripts/token-navigation.mjs`: `70ed200d00cc1c0e735d3e876763983c607bf7f86daf7fdb22575e2089a43023`

The full fingerprint manifest is a local scratch report, not committed transcript
contents. Retention and new sessions can change later results. Next target:
improve measured navigation coverage, then compare fixed tasks with independent
acceptance and all failed attempts counted. Do not approve the proposed split or
claim a percentage saving from this observational baseline alone.

## Dependencies

- Step 0: none (adopted ahead of the ADR as its Decision 0, see the critic pass of 2026-10-14; owner approved 2026-10-14; done in 6d5f093).
- Split: ADR "The CLI as a thin entry with per-command modules, each readable in one pass" — accepted; one freeze window of the entry agreed with WP-20.

## Open Questions

- [ ] Split now on structural grounds, or after two weeks of measurement with the committed classifier?
- [ ] Who moves the WP-20 code (`installMcpConfig`, the story gate) out of the entry?
- [ ] Do the size ceilings hold for every module, or does `clean-plan` need a refactor beyond a move?

## Related

- ADR-0008 — context spend as a design constraint.
- Project Memory `memory-format-benchmark` — the measurements behind this epic (session scripts, not reproducible until the classifier is committed).

---

*Last updated: 2026-10-14*
