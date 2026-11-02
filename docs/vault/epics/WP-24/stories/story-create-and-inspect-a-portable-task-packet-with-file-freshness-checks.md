---
type: story
id: "story-create-and-inspect-a-portable-task-packet-with-file-freshness-checks"
epic: "WP-24"
title: "Create and inspect a portable task packet with file freshness checks"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-02
updated: 2026-11-02
external_refs: {}
tags: []
code_refs: ["scripts/handoff.mjs", "bin/cli/handoff.mjs", "bin/waypost.mjs", "bin/cli/help.mjs", "tests/handoff.test.mjs", "tests/harness.test.mjs", "docs/handoffs.md", "docs/cli-reference.md"]
specs: []
started_at: "2026-11-02T14:41:34.842Z"
closed_at: "2026-11-02T15:01:49.320Z"
plan_updated_at: "2026-11-02T14:41:34.842Z"
---

# Create and inspect a portable task packet with file freshness checks

| Field | Value |
|---|---|
| **Epic** | [WP-24](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Experiment requested by the owner on 2026-11-02: reuse task results across sessions
and harnesses without model training, raw KV access or replaying full transcripts.
The packet is explicit caller-supplied context, never independent review evidence.

## Decomposition

- [x] Add bounded capture/inspection and strict portable packet validation.
- [x] Add thin CLI integration and usage documentation.
- [x] Exercise a two-process handoff, stale inputs and independent review. — evidence: /private/tmp/waypost-handoff-example-pjxlhabk/summary.json; independent reviewer ship

## Implementation Plan

A dependency-free `scripts/handoff.mjs` owns packet schema, bounded regular-file
SHA256 reads, portable project-relative paths and freshness inspection. A small
`bin/cli/handoff.mjs` owns argument validation and exclusive output creation; the
entry lazily imports it. No team, vault binding, provider, MCP or model call is
required. Reference roots follow the existing projectRoot() order: WAYPOST_PROJECT_DIR,
CLAUDE_PROJECT_DIR, then cwd; leading --project overrides the environment.

Experimental commands: `waypost handoff create --input <json> --output <json>`
and `waypost handoff show <packet> [--json]`. Strict input fields: required goal
and next_step, optional constraints/progress/open_questions lists, files list,
and evidence list of {path, description}. Capture records SHA256+bytes or explicit
absence for each referenced path, plus informational Git HEAD. Reject traversal,
absolute/drive/backslash/control paths, .git references, Windows-reserved names,
case-fold/ancestor collisions, duplicate paths, symlinks
and non-regular files. Bound JSON size, item counts, text sizes and file reads.
Inspection validates the whole packet before dereferencing paths, rehashes every
reference and reports unchanged/changed/missing/appeared/unreadable, including
absent ancestor becoming a symlink. No referenced file contents enter default
output, no command or instruction in the packet is executed. Output never
replaces an existing file and cannot equal a captured path or become its ancestor.

A matching hash says only that the selected bytes match capture time: file lists
may be incomplete, environment may change, and caller statements/logs are not
verified results. Evidence is fingerprinted at packaging time, not bound to an
observed execution. Preserve full primary files outside the compact packet.
No automatic role injection: independent critics/reviewers start fresh and
independently validate claims. No claim of measured token, quality or speed gains.

Show exits 0 only when a nonempty selected set matches, 2 for changed/unreadable
or an empty unchecked set, 1 for invalid input/arguments or creation failure.
Snapshot checks assume a cooperative filesystem: component checks are best-effort,
not protection from hostile concurrent ancestor replacement. Exclusive output
is not atomic publication; an interrupted write can leave invalid JSON.

## Acceptance Criteria

- [x] Create/show roundtrip works without a vault and across independent processes and relocated project roots; output is exclusive and default text is compact. — evidence: tests/handoff.test.mjs:35; /private/tmp/waypost-handoff-example-pjxlhabk/summary.json
- [x] Byte changes, missing/appeared files and replaced ancestors invalidate the selected snapshot independently of HEAD; every reference has an explicit status. — evidence: tests/handoff.test.mjs:65; tests/handoff.test.mjs:77
- [x] Malformed/oversized packets, unsafe/duplicate paths, symlinks, special files, unsupported schema and output/input collisions fail without overwriting files or running packet content. — evidence: tests/handoff.test.mjs; corrected output-ancestor regression and /private/tmp/waypost-handoff-final-tests-v2.log
- [x] Human/JSON output separates selected-file freshness from caller claims and runtime verification, documents the schema, limits, exit codes and omitted dependencies. — evidence: docs/handoffs.md; scripts/handoff.mjs:170; tests/handoff.test.mjs
- [x] Focused CLI/module regression checks and a retained two-process smoke pass; independent reviewer checks the final diff. Runtime on other OSes and actual agent token/quality gains remain unverified. — evidence: /private/tmp/waypost-handoff-final-tests-v2.log (24 pass, exit 0); independent reviewer ship

## Final Summary

Implemented bounded explicit task packets with SHA256/absence observations and
strict create/show CLI. No model or provider calls, automatic injection or team
authority changes. Matching snapshots never validate caller claims or test runs.

Validation on macOS / Node 25.6.1: final post-review focused run 24 pass, 0 fail/skip, exit 0
(15 handoff cases and 9 CLI/module/standing-context checks). Full log:
/private/tmp/waypost-handoff-final-tests-v2.log; pre-run SHA256 manifest:
/private/tmp/waypost-handoff-inputs-v2.json (418 bin/scripts/tests files unchanged
after execution). Initial CLI guard caught 114 bytes over the fixed entry budget;
shortened a comment, retained the 14000-byte ceiling and reran successfully.

Retained independent-process smoke: /private/tmp/waypost-handoff-example-pjxlhabk/.
Create exit 0; another process with a different harness/session marker read the
packet exit 0; relocation also exited 0; after a source edit in the relocated
fixture the read exited 2 with changed status. Compact output was 903 bytes. These are deterministic CLI processes, not native model
sessions; harness markers do not prove native integration.

No full npm suite, Windows/Linux runtime, execution-bound logs or live-model
quality/token/speed comparison was performed. The proposed ADR remains proposed.
Independent final reviewer returned ship after verifying 16/16 review hashes,
418/418 source inputs, the 24-pass v2 log and retained smoke results.

## Technical Notes

First experimental v1. Follow-up ideas: selecting individual evidence details,
optional command capture with execution-bound inputs, provider cache observability
and a fixed-budget paired agent benchmark. These are not part of this story.

## Dependencies

- ADR-0008; accepted thin CLI architecture. The packet-specific ADR remains a
  proposed description of the experiment, not owner acceptance of a permanent API.

## Design review

Fresh critic requested explicit no-inputs semantics, exit codes, projectRoot()
compatibility and the cooperative-filesystem boundary. All four are incorporated
above; empty packets report snapshot_matches: null and exit 2, not green proof.

## Implementation review

The first independent reviewer found an output/source ancestor collision:
creating packet.json could invalidate a missing packet.json/child reference.
Fixed by component-boundary, case-folded ancestor comparison for both files and
evidence. A regression case also preserves unrelated prefixes. Final v2 validation passed: 24/24 tests, exit 0, unchanged 418 source identities;
independent reviewer confirmed this execution evidence and returned ship. Earlier admission
refusal (exit 75) ran no tests and was not counted as a test failure.
