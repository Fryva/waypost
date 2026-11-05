---
type: epic
id: "WP-21"
title: "Source an agent can read in one pass"
status: in-progress
priority: p2
created: 2026-10-04
updated: 2026-11-05
external_refs: {}
tags: []
code_refs: ["bin/", "scripts/", "tests/", "agents/", "skills/", "templates/", "package.json", "AGENTS.md", "README.md", "CHANGELOG.md", ".github/workflows/ci.yml", "docs/how-it-works.md", "docs/cli-reference.md", "docs/harnesses.md", "docs/handoffs.md", "docs/vault/adr/the-cli-as-a-thin-entry-with-per-command-modules-each-readable-in-one-pass.md", "docs/vault/adr/setup-asks-the-running-harness-not-only-the-projects-files.md", "docs/vault/adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md", "docs/vault/ops/paired-token-economy-experiment-with-blind-acceptance.md", "docs/vault/ops/paired-token-economy-experiment-revision-2-over-a-sealed-read-only-source.md", "docs/vault/ops/proposed-revision-3-of-the-sealed-source-token-pilot.md", "docs/vault/ops/revision-3-compatibility-controls-under-the-unchanged-allowance.md", "docs/vault/adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md", "docs/vault/adr/0011-decisions-that-check-themselves.md", "docs/vault/adr/0009-artifact-integrity-checks.md", "docs/vault/adr/0007-shared-vault-presence.md", "docs/vault/adr/0006-commit-protocol.md", "docs/vault/adr/0003-agent-roles-across-harnesses.md", "docs/vault/epics/WP-21/stories/story-isolate-repository-and-runtime-diagnostics-behind-the-doctor-facade.md", "docs/vault/adr/0005-harness-registry.md", "docs/toolchains.md", "docs/vault/adr/cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first.md", "docs/vault/adr/0010-coordination-follows-the-repository.md", "docs/vault/adr/0008-token-budget.md", "docs/vault/research/token-measurement-pilot-and-cli-split-record-of-wp-21.md"]
review_status: pending
reviewed_at: null
---

# WP-21: Source an agent can read in one pass

| Field | Value |
|---|---|
| **Status** | in-progress |
| **Priority** | p2 |
| **Created** | 2026-10-04 |
| **Updated** | 2026-11-05 |

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
per-command modules, each readable in one pass" (accepted 2026-10-19).

## Stories

The measurement increment is tracked by
[[story-reproducible-token-accounting-and-repeated-read-evidence|Reproducible token accounting and repeated-read evidence]].

| Story | Status | Description |
|-------|--------|-------------|
| `story-the-team-code-loads-only-for-story-write-and-the-cli-entry-is-an-mjs-the-code-index-sees` | done | Decision 0 of the ADR: lazy team import, entry renamed to `bin/waypost.mjs` behind a shim |

<!-- Split implementation stories follow the ADR accepted2026-10-19.
     The navigation classifier/baseline prerequisite is already committed.
     2. bin/waypost.mjs becomes a thin entry; each command lives in bin/cli/
     3. scripts/lib.mjs split into lib-*.mjs behind an `export *` facade
     4. sizes.mjs / presence.mjs split by measured read volume
     5. doctor.mjs split into doctor-*.mjs (low priority)
     team-host.mjs: proposed to the WP-20 owner, not in this epic. -->

## Expected Results

- [x] Step 0: `version`, `help`, `run`, `capacity`, `size`, `clean` work with a deliberately broken team module; `story --write` still refuses a team-bound story.
- [x] Step 0, manual (codegraph is an external tool): `codegraph query` finds functions of `bin/waypost.mjs`.
- [ ] A committed classifier (Node, in `scripts/tokens.mjs`) counts navigation turns on `bin/(waypost|cli/)` with cache weights; classifier and baseline are now committed below, while the comparable post-split cohort and target remain to be stated. Existing coverage and API-price proxies do not establish causal savings.
- [x] Split: the entry ≤ 14 KB; every `bin/cli/*.mjs` ≤ 24 KB, pinned by a test. — evidence: the six independently accepted CLI stages below, final CI39728661785 and source-bound parity/pack/guard checks.
- [x] Split: the free-identifier test and the import-every-module test pass; `node --check` covers `bin/cli`. — evidence: the six independently accepted CLI stages below, final CI39728661785 and source-bound parity/pack/guard checks.
- [x] Split: `help`, `version` and an unknown command are byte-identical before and after; the suite is green on Node 20/22/24 at every step. — evidence: the six independently accepted CLI stages below, final CI39728661785 and source-bound parity/pack/guard checks.
- [x] Split: a CLI test "team-bound story → refuse" exists before the gate moves. — evidence: the six independently accepted CLI stages below, final CI39728661785 and source-bound parity/pack/guard checks.
- [x] Split: guards of other ADRs naming the entry are re-scoped; pointer comments updated. — evidence: the six independently accepted CLI stages below, final CI39728661785 and source-bound parity/pack/guard checks.
- [x] `npm pack --dry-run` lists `bin/waypost.mjs` (done in step 0) and `bin/cli/` after the split. — evidence: the six independently accepted CLI stages below, final CI39728661785 and source-bound parity/pack/guard checks.

## Dependencies

- Step 0: none (adopted ahead of the ADR as its Decision 0, see the critic pass of 2026-10-14; owner approved 2026-10-14; done in 6d5f093).
- Split: ADR "The CLI as a thin entry with per-command modules, each readable in one pass" — accepted2026-10-19; the split requires one freeze window of the entry coordinated with WP-20.

## Open Questions

- [ ] Split now on structural grounds, or after two weeks of measurement with the committed classifier?
- [ ] Who moves the WP-20 code (`installMcpConfig`, the story gate) out of the entry?
- [ ] Do the size ceilings hold for every module, or does `clean-plan` need a refactor beyond a move?

## Related

- ADR-0008 — context spend as a design constraint.
- Project Memory `memory-format-benchmark` — the measurements behind this epic (session scripts, not reproducible until the classifier is committed).

## History

Dated records — the offline Claude and Codex baselines, the paired-token pilot
and its stops, retained-source coverage, the six CLI split stages and the
post-integration checkpoint (2026-10-15 … 2026-10-22) — are kept verbatim in
[[token-measurement-pilot-and-cli-split-record-of-wp-21|Token measurement, pilot and CLI split record of WP-21]].
Later work records its outcome in each story's Final Summary, not here: an epic
is read whole by the planner, so it carries goal, scope and status only.

---

*Last updated: 2026-11-05*
