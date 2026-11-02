---
type: story
id: "story-capture-command-outcomes-with-selected-input-snapshots"
epic: "WP-24"
title: "Capture command outcomes with selected input snapshots"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-02
updated: 2026-11-02
external_refs: {}
tags: []
code_refs: ["scripts/handoff.mjs", "scripts/handoff-capture.mjs", "bin/cli/handoff-capture.mjs", "tests/handoff-capture.test.mjs", "bin/cli/handoff.mjs", "bin/waypost.mjs", "bin/cli/help.mjs", "tests/harness.test.mjs", "docs/handoffs.md", "docs/cli-reference.md"]
specs: []
started_at: "2026-11-02T17:31:33.568Z"
closed_at: "2026-11-02T20:13:38.072Z"
plan_updated_at: "2026-11-02T17:31:33.568Z"
---

# Capture command outcomes with selected input snapshots

| Field | Value |
|---|---|
| **Epic** | [WP-24](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Capture command outcomes with selected input snapshots, the next ordered slice of the owner-authorized WP-24 experiment.

## Implementation Plan

Add an explicit `handoff capture --input <json> --output-dir <project-relative-new-dir> -- <argv...>`. Reuse the existing heavy runner for one slot, launching a local capture worker; never execute strings from input/packets. Preserve v1 packet schema and create/show behavior. Output directory holds raw stdout/stderr logs, a separate selected-input before/after receipt, and a v1 packet referencing the outputs as evidence. Caller context remains unverified; before/after are sequential and do not prove complete dependencies, no transient edits or execution authenticity. All outputs preflight no-clobber/collisions before command spawn. Bound argv, runtime, logs and receipts; incomplete capture is explicit. Commands wrapping their own heavy slot (npm test) are documented as unsupported nesting; use underlying node test command. Handle child failure and invalid capture distinctly. No env bypass or resource-policy changes.

### Design review corrections

The worker receives a canonical project root and executes the explicit CLI argv
with cwd=root and shell:false; receipt cwd is ".". Reject Windows .cmd/.bat
rather than silently enabling a shell. Before/after observations remain selected,
sequential and cannot detect transient edits restored before the after snapshot.

Bound termination: timeout/error -> TERM, bounded grace -> KILL of the direct
child; independently bound pipe drain. Destroy local streams after the deadline
and record incomplete capture if inherited pipes remain open. This is not process
tree containment; callers must not background descendants.

Capture.complete/reason and command.exit_code/signal/spawn_error are independent.
A fully captured failed command has complete:true but a nonzero command exit.
CLI propagates normal child status; incomplete capture exits1 (timeout124),
admission refusal75 and validation failure1. Show only checks bytes, never command
success. All writer errors mark incomplete; close logs before hashing, finalize
receipt before packet, publish packet last. Partial diagnostics never claim pass.
Preflight must reserve3evidence slots, file-byte budget AND worst-case serialized
packet JSON before spawn. Default runtime120000ms/max300000ms, combined raw logs
4MiB max, receipt256KiB max; user may lower runtime/log caps, not raise them.

## Acceptance Criteria

- [x] Explicit capture executes CLI argv only under the existing heavy gate; admission refusal does not execute the command. — evidence: tests/handoff-capture.test.mjs; v4 focused59+CLI9 pass; independent capture reviewer ship
- [x] Before/after selected-file observations, exit status and full per-stream logs are retained with hashes; failures, changes and incomplete capture are explicit. — evidence: tests/handoff-capture.test.mjs; v4 focused59+CLI9 pass; independent capture reviewer ship
- [x] No-clobber, output/source/ancestor collisions, malformed selectors, size/time limits and binary outputs are tested without weakening v1. — evidence: tests/handoff-capture.test.mjs; v4 focused59+CLI9 pass; independent capture reviewer ship
- [x] Focused regressions and independent review pass; no native token/quality claim is inferred from deterministic tests. — evidence: tests/handoff-capture.test.mjs; v4 focused59+CLI9 pass; independent capture reviewer ship

## Final Summary

Implemented explicit capture through the existing heavy runner with canonical
project cwd, bounded binary stdout/stderr, independent command/capture status,
selected before/after receipt and a v1 packet retaining BEFORE hashes.

Validation: v4 focused59pass0fail plus9CLI guardspass, exit0; actual captureCLI
smoke status0, correct root/logs/beforeafter. Source manifests and full logs:
/private/tmp/waypost-handoff-evolve-vb2jqxtc/evolve-inputs-v4.json,
evolve-focused-v4.log, evolve-cli-guards-v4.log and actual-capture-smoke.json.
Initial49test run had2failures (negative ENOENT code, overlong fixture component);
both corrected and included in v4. Independent reviewer confirmed all4AC and
capture inputs unchanged; delivery-specific follow-ups remain separate.

macOS Node25.6.1 only; no cross-OS/full npm or token-saving claim. Imported
receipts remain untrusted, selected sequential observations are not complete
dependency or transient-edit proof, and capture does not contain hostile trees.
