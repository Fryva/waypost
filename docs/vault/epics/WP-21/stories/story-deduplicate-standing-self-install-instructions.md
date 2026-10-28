---
type: story
id: "story-deduplicate-standing-self-install-instructions"
epic: "WP-21"
title: "Deduplicate standing self-install instructions"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-28
updated: 2026-10-28
external_refs: {}
tags: []
code_refs: ["AGENTS.md", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "bin/cli/brief.mjs", "scripts/brief.mjs", "docs/vault/adr/0008-token-budget.md", "docs/vault/adr/0003-agent-roles-across-harnesses.md"]
specs: []
started_at: "2026-10-28T15:24:42.824Z"
closed_at: "2026-10-28T16:07:30.245Z"
plan_updated_at: "2026-10-28T15:24:42.824Z"
---

# Deduplicate standing self-install instructions

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Standing instructions describe self-install twice. Consolidate installation in required context; retain automatic first-entry behavior, current-harness detection before brief, project-wide setup, and reported-write guidance. Describe --no-install precisely as skipping installation, without promising read-only CLI execution; do not change runtime.

## Decomposition

- [x] Map two substitutions to current installer/orientation contracts. — evidence: bin/cli/brief.mjs installer bypass; independent critic/reviewer.
- [x] Apply manual prose substitutions and tighten the standing budget. — evidence: exact inverse in substitutions.json; comparison.json; tests/harness.test.mjs.
- [x] Verify source-bound checks, independent semantics review and owned-temp cleanup. — evidence: validation.json, diagnostics.json, cleanup.json; final reviewer accepted all three AC.

## Implementation Plan

Replace exactly Required context step 2 and the later new-harness bullet. Preserve bound-vault locations, in-flight work/reading order, SessionStart replacement, missing/stale roles/skills and own-harness routing, commit reported writes, automatic first brief, doctor/next detection before first brief and setup for every evidenced harness. --no-install skips the installer; avoid any broader read-only guarantee or unsupported claim that brief regenerates views. Keep managed routing v4 and every other instruction, role, runtime, skill, ADR and permission unchanged. Pin a tighter root character ceiling without weakening canonical-block equality or routing cap. Freeze and inverse-check exact substitutions, run existing standing-context and child-isolation guards with source-bound receipts through heavy admission, independent review then close/commit.

## Acceptance Criteria

- [x] Exactly two prose regions consolidate the installation explanation without losing operational conditions; --no-install wording matches the current installer bypass; all other instructions and managed v4 unchanged. — evidence: substitutions.json and comparison.json exact inverse; bin/cli/brief.mjs installer bypass; independent semantic review.
- [x] A tighter root character budget passes with canonical-block/isolation guards, syntax/diff/Doctor and matching source identities. — evidence: validation.json: 6 passed; 577 source identities stable; diagnostics.json all checks exit0 and Doctor issue/warn/warning0.
- [x] Independent reviewer accepts semantic equivalence; own temporary runner removed; character proxy distinguished from unmeasured native-token/quota/net savings. — evidence: final independent reviewer verdict story closed / commit; cleanup.json root absent, 1787 logical bytes removed; character-only metrics in comparison.json.

## Final Summary

Two manual prose regions consolidate self-install instructions. Exact inverse restores the baseline; managed v4 and every other instruction remain unchanged. Root 15583 -> 15340 characters, 243 fewer / 1.55939% character proxy, strict budget <15400. The test-source inverse proves only that budget changed. No native-token, subscription-quota or net-workflow saving measured.

Syntax and diff checks passed. Two heavy admission waits ended exit75 due zero idle CPU; neither launched tests. The subsequent admitted source-bound Node24.22.1 run passed all 6 focused checks, 0 failed/skipped, 6509.586125 ms; wrapper/child exit0, 577 source identities stable. Own temporary runner removed. Final independent review accepted all three criteria with no findings. Full CI for this revision follows publication.

## Technical Notes

Applies accepted ADR-0008 compact-standing-context policy and ADR-0003 harness-owned install/routing. No new ADR, public API, installation behavior, native pilot, budget or role/model change.

## Dependencies

- Accepted ADR-0008 and ADR-0003.

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-standing-install-20261028/`.

---

*Last updated: 2026-10-28*
