---
type: story
id: "story-isolate-remaining-vault-diagnostics-behind-the-doctor-facade"
epic: "WP-21"
title: "Isolate remaining vault diagnostics behind the Doctor facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-23
updated: 2026-10-24
external_refs: {}
tags: []
code_refs: ["scripts/doctor.mjs", "scripts/doctor-vault.mjs", "tests/doctor-vault.test.mjs", "tests/predicates.test.mjs", "tests/harness.test.mjs", "tests/scripts.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-23T23:53:14.341Z"
closed_at: "2026-10-24T00:25:29.695Z"
plan_updated_at: "2026-10-23T23:53:14.341Z"
---

# Isolate remaining vault diagnostics behind the Doctor facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Move the remaining contiguous Vault checks section out of the 58181-byte Doctor.
Keep install/orchestration/repairs and every public import compatible.

## Decomposition

- [x] Move the literal vault block and listMd; copy finding.
- [x] Preserve six bindings/callers, direct artifact-walk dependency and pointers.
- [x] Verify fixtures, regressions, packaging and independent review.

## Implementation Plan

Fresh planner at d9241a2 identified Vault checks through before Runners: scanArtifacts,
checkVaultPolicy/checkWikilinks/checkWorkWithoutStory/checkDependencies/checkAdrNumbers.
Move it plus private listMd into scripts/doctor-vault.mjs; exact private finding copy.
Use existing fs/path/lib/agents/diff-refs/ready imports and walkVaultFiles directly
from doctor-artifacts, never from Doctor. Doctor imports/re-exports six old bindings;
remove only moved-only imports/helpers; retain loadLayout/buildNodeIndex/pathUnder,
fs/path dependencies and original runners/repairs. Graph/reconcile retain Doctor
imports. No new shared resolver, policy, model, dependency, cap, pilot or budget.

Preserve unreadable scan skips and listMd errors, re-read of malformed vault policy,
shared link resolver/default-index failure, inconclusive work warning, dirty path
filtering and Git/vault timestamps, DFS/dedup/order and ADR-number ordering/padding.
New env-first tests cover six binding identities; nested/custom/all-shape scans,
README/read errors; full policy/link findings; real-Git dirty/open/committed work
and observed unreadability; dependency missing/block-form/cycles and 007/0007 ADR
collisions. Keep existing public predicate/CLI/graph/reconcile assertions unchanged.

Capture literal block/helper/factory; reverse all edits to reconstruct full baseline.
Frozen full CLI JSON/text/stderr/exits and file hashes cover healthy, broken policy
plus dead/ambiguous links, cycles/numbers, dirty/open/committed work. Pin owned Git
commit dates and vault mtimes; diagnostics must not mutate fixtures. Retain source
and full validation-log identities. Run affected integration/env checks through
heavy admission and verify package inclusion. ADR-0011 already covers doctor*.mjs.

## Acceptance Criteria

- [x] Literal block/helpers, six identical public bindings and unchanged callers; complete baseline reconstructs byte-for-byte and existing graph/reconcile consumers work. — evidence: measurement.json, tests-attempt-3.log (binding/graph/reconcile checks).
- [x] Scan/policy/link/work/dependency/number semantics and read errors are preserved; frozen CLI matches without mutating files. — evidence: cli-before/after.json, readonly-before/after.json, eight new regressions in tests-attempt-3.log.
- [x] Heavy targeted/protection checks, packaging and independent review pass; focused/combined sizes reported without native-token/runtime savings claims. — evidence: validation.json (120 passed, zero failed/skipped, exit 0), pack-proof.json; independent reviewer ship after checking 26 source hashes and full log SHA.

## Final Summary

Implementation prepared: Doctor 58181 -> 45146 bytes; focused module 13768;
combined source growth 733 bytes. Literal block/helpers and complete baseline
reconstruction verified. Six definitive CLI scenarios match JSON/text/stderr/exits
(0/6/8/1/0/1 findings); all fixture hashes stayed unchanged after warming normal
Git stat caches. Baseline uses pristine d9241a2 and a clock control across UTC
midnight. Initial measurement-harness failures are retained, not discarded.
Syntax/package checks and Doctor pass (zero issues, three existing warnings).

Targeted tests passed after normal heavy admission: 120 passed, zero failed/skipped,
exit 0, 50.413 seconds. Earlier two admission refusals (exit 75 before tests) are
retained. Independent reviewer ship verified all 26 current source identities,
full log SHA and unchanged nine-file review snapshot; no findings. Post-run disk
cleanup reported the existing free-space floor deficit and two nested repositories
never entered; test command exit remained 0. Baseline d9241a2 full CI passed Node
20/22/24; this change has only the targeted local result until its own CI runs.
No native-token/runtime/workflow savings measured.

## Technical Notes

Mechanical extraction under ADR-0008; no new architectural choice or policy.
Definitive fixtures use a pristine d9241a2 archive (24 source identities verified),
physical install paths, distinct real Git repositories and warmed default Git stat
caches. CLI clock is pinned across UTC midnight; native file times and explicit
Date arguments remain intact. Earlier harness attempts are retained: normal Git
refreshed .git/index; disabling autoRefreshIndex changed stat-only diff output and
was discarded; a /var alias made Node main guards skip graph, fixed with physical
paths. These are measurement controls, not production behavior changes.

## Attachments

- Evidence: .waypost/experiments/wp21-doctor-vault-module-20261023/
(source-before/after.json, block-before.txt, helpers-before.json, import-edits.json,
measurement.json, baseline-source.json, fixture-runner.py.txt, cases-inputs.json,
cli-before/after.json, readonly-before/after.json, validation-pending.json,
tests-attempt-1/2/3.log, validation.json, pack.json, pack-proof.json, doctor.log, next.log).
Owned replay/archive/install/cache files removed; diagnostic evidence retained.

---

*Last updated: 2026-10-24*
