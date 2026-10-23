---
type: story
id: "story-isolate-doctor-report-formatting-without-changing-diagnostics"
epic: "WP-21"
title: "Isolate doctor report formatting without changing diagnostics"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-23
updated: 2026-10-23
external_refs: {}
tags: []
code_refs: ["scripts/doctor.mjs", "scripts/doctor-report.mjs", "tests/doctor-report.test.mjs", "tests/scripts.test.mjs", "tests/harness.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-23T04:13:36.304Z"
closed_at: "2026-10-23T04:20:35.721Z"
plan_updated_at: "2026-10-23T04:13:36.304Z"
---

# Isolate doctor report formatting without changing diagnostics

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Text-report formatting is inside the 108898-byte doctor script. A formatting-only
edit should have a small focused source file and isolated behavioral tests.
Mechanically extract the existing renderer without changing any diagnostic or
CLI behavior. This is not a new diagnostic architecture or source-budget policy.

## Decomposition

- [x] Extract icon/report formatting into an import-free pure helper.
- [x] Keep the current doctor wrapper responsible for version and live date.
- [x] Verify exact output and existing diagnostic contracts, then independently review.

## Implementation Plan

Create scripts/doctor-report.mjs with renderDoctorReport(findings, groups,
{version, date}). Move the icon helper and existing report body; inject metadata
rather than reading version, clock or filesystem in the formatter. Keep the
private report function in doctor.mjs as a thin wrapper supplying the same
waypostVersion() result and UTC date slice. No changes to main, checks, JSON,
startup/fix branches, exit codes or guard execution. Add a short source pointer
in docs/how-it-works.md and the new source/test paths to the parent epic footprint.

Add isolated golden tests for full mixed-level reports, empty/ordered groups,
version fallback, exact-prefix path deduplication, issue repair advice and immutable
inputs. Run them with existing targeted doctor/guard/exit/repair/context/CLI tests
through heavy gate. Retain old source hashes and report extraction, fixed findings/
metadata and exact before/after text, and verify remaining doctor source differs
only by the import and wrapper/extraction. Report source sizes separately from
native-token use; do not infer runtime or whole-workflow savings from a file move.

## Acceptance Criteria

- [x] Formatter can be imported alone and formats solely from supplied findings/groups/version/date; no filesystem, process, clock or diagnostic dependencies. — evidence: standalone import/golden tests in tests/doctor-report.test.mjs, explicit date with throwing clock, import-free extracted source.
- [x] Frozen full output is byte-identical; severities, messages, ordering, counts, path suffixes, JSON/startup/fix/exit behavior and declarative guard non-execution are preserved. — evidence: frozen-output SHA256 equality and full source reconstruction, 44 unchanged CLI regressions.
- [x] Isolated and integration checks pass against identified source hashes; the focused formatter size is measured without claiming native-token or runtime savings. — evidence: measurement.json, source-after.json and verification.json; 49/49 targeted checks.

## Final Summary

Text formatting now lives in the import-free scripts/doctor-report.mjs helper.
Doctor retains the private wrapper and supplies version before the live UTC date,
exactly as before. The helper owns no filesystem, process, clock or diagnostics.
Main/check/JSON/startup/fix/exit source is byte-identical after reversing only the
import and icon/report extraction; the moved body is mechanically identical apart
from supplied metadata. Frozen report SHA256 remains
`7b0fe234512d8f667631bf7003e5a04001a6bbc25cff67bae3732a9681c6a2ba`.

The focused formatting file is **1152 UTF-8 bytes**, compared with its former
108898-byte containing file. Doctor is now 108047 bytes; combined production source
is 109199 bytes (**301 bytes more**). This reduces the full-file target for formatting
work, not total code size. Exact-symbol Codegraph reads may not improve. Native
tokens and runtime speed were not measured or claimed.

**49/49 targeted checks passed** through heavy admission on Node 25.6.1/macOS:
five isolated renderer tests plus 44 existing doctor/guard/exit/repair/context/CLI
checks. No local full suite or Node 20/22/24 matrix. Package files already include
the scripts directory; no dependency or packaging-policy changes were needed.
Independent implementation review: ship, no actionable findings. The reviewer
independently reproduced the byte-identical source reconstruction and frozen
output, and verified all six current source hashes, four baseline hashes and the
49-pass log. Live doctor: exit 0, no issues, two pre-existing WP-18 warnings.

## Technical Notes

Mechanical refactoring under WP-21; no new public CLI interface, required process,
source-size cap, model configuration, native pilot or historical budget changes.

## Dependencies

- Accepted ADR-0008; current doctor report formatting.

## Attachments

- `.waypost/experiments/wp21-doctor-report-module-20261023/`: old functions/frozen findings/metadata, before/after text, source hashes, mechanical reconstruction/size comparison, full test log and validation manifest (local evidence).

---

*Last updated: 2026-10-23*
