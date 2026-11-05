---
type: story
id: "story-persist-handoff-state-compactly-so-the-worst-allowed-case-fits-the-state-cap"
epic: "WP-24"
title: "Persist handoff state compactly so the worst allowed case fits the state cap"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-05
updated: 2026-11-05
external_refs: {}
tags: []
code_refs: ["bin/cli/handoff-delivery.mjs", "scripts/handoff-retrieval.mjs", "tests/handoff-retrieval.test.mjs", "tests/handoff-delivery.test.mjs", "docs/handoffs.md"]
specs: []
started_at: "2026-11-05T21:38:16.949Z"
closed_at: "2026-11-05T21:53:01.466Z"
plan_updated_at: "2026-11-05T21:38:16.949Z"
---

# Persist handoff state compactly so the worst allowed case fits the state cap

| Field | Value |
|---|---|
| **Epic** | [WP-24](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

`handoff deliver` and `handoff continue` save their state through
`writeDeliveryState` (`bin/cli/handoff-delivery.mjs`), which pretty-prints it
(`JSON.stringify(state, null, 2)`) and refuses anything over 65536 bytes with
`handoff-delivery-state-limit`; both commands read it back under the same cap.
Pretty-printing multiplies nested arrays: a valid final answer inside the 8192-byte
answer limit, e.g. `Array(1365).fill([[1]])` (8191 B compact), becomes a ~70 KB
state with no outline at all. The final save then fails after the last paid native
inference, and `--resume` hits the same wall. The bug predates the outline.

Payload contents and round identities stay exactly as they are (a frozen three-arm
benchmark drives `handoff continue`); only how state is persisted changes.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Write state as compact JSON in `writeDeliveryState`; keep the 64 KiB write/read cap.
- [x] Regression test: real three-round retrieval with the reviewer's 8191-byte nested answer persists to a file and resumes from it without new inference.
- [x] Regression test: a state with every bounded field at its limit at once persists and reads back under the CLI cap.
- [x] Compatibility test: a legacy pretty-printed state file resumes and is rewritten compactly.
- [x] One-shot delivery: the same nested answer persists and resumes.
- [x] Document the state file format in `docs/handoffs.md`.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

1. `bin/cli/handoff-delivery.mjs` `writeDeliveryState`: `JSON.stringify(state) + '\n'`; cap and CAS unchanged. Both CLIs share it, so no change in `bin/cli/handoff-retrieval.mjs`.
2. `tests/handoff-retrieval.test.mjs`: file-backed persist through `writeDeliveryState`, reviewer's nested answer over three rounds, resume from the file; every-field-at-limit state; legacy pretty state resumes.
3. `tests/handoff-delivery.test.mjs`: one-shot delivery with the nested answer persists and resumes.
4. `docs/handoffs.md`: one sentence on the compact state format and compatibility.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] A valid answer within DELIVERY_LIMITS.answer never fails the final save or resume because of serialization overhead, for `continue` and `deliver`. — evidence: bin/cli/handoff-delivery.mjs:16-17; tests/handoff-retrieval.test.mjs:333 (8191 B nested answer, three rounds, persisted and resumed from the file, no new inference); tests/handoff-delivery.test.mjs:229; both fail with handoff-delivery-state-limit when the writer is reverted to pretty-printing (reviewer mutation run)
- [x] The worst case allowed by DELIVERY_LIMITS, RETRIEVAL_LIMITS and OUTLINE_LIMITS (16 KiB payload, 3 rounds, 2 KiB requests, 8 KiB answer, delivery metadata at its bounds) persists and reads back under the 65536-byte cap, checked by a deterministic test. — evidence: tests/handoff-retrieval.test.mjs:348 (exact 16384/8192/2048 limits, cursor 4096 and error 256 per round; asserted <= 57344; measured 45874 B compact vs 116909 B pretty)
- [x] Existing pretty-printed state files remain readable and resumable. — evidence: tests/handoff-retrieval.test.mjs:371 (legacy pretty file resumes through the real CAS and is rewritten compactly); bin/cli/handoff-retrieval.mjs:40-41, bin/cli/handoff-delivery.mjs:54-55 hash the bytes read
- [x] Payload bytes, challenges and round identities are unchanged (existing identity tests stay green). — evidence: scripts/ change is a comment only; waypost run --heavy --wait 20m -- node --test tests/handoff-retrieval.test.mjs tests/handoff-delivery.test.mjs -> 47/47 pass; replay identity asserts at tests/handoff-retrieval.test.mjs:346,377

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

`writeDeliveryState` now writes compact JSON; the 65536-byte write/read cap and the
CAS are unchanged, and both `handoff deliver` and `handoff continue` share the
writer. Compact JSON is the measure every existing limit uses, so the largest state
they allow is ~45 KiB (pretty: ~117 KiB). Payloads and round identities are
untouched; the outline's pretty-printed measure stays and only its rationale was
corrected (docs/handoffs.md, comment in scripts/handoff-retrieval.mjs). Four
regression tests (three-round nested answer + resume, every-field-at-limit, legacy
pretty file, one-shot delivery) fail on the old writer and pass now: focused run
47/47 via `waypost run --heavy`. Fresh-context waypost-reviewer: approve.

Follow-ups (not done): poll cursor is checked in UTF-16 units without escaping and
relay output is bounded only by the 1 MiB command cap — an authority emitting
escaped cursors or a bloated relay could still exceed 64 KiB; tightening the cursor
to `/^[A-Za-z0-9_-]{1,4096}$/` would close it without touching payloads. If a save
does hit the cap, the catch-path save rethrows and loses `retrieval_state`.

## Technical Notes

Chosen fix: compact serialization, not a larger cap. Compact JSON is the measure
every limit already uses (`payload`, `answer`, `request` are all
`JSON.stringify(x)` byte counts), so the stored state is a plain sum of bounded
parts. A larger cap would have to be derived from pretty-print expansion, which
depends on nesting depth and is unbounded by the existing limits (8 KiB of `[[1]]`
already expands ~8x). Readers parse any JSON, so old pretty files (written under the
same 65536 cap) stay readable; CAS compares the bytes actually read.

Compact worst-case budget (retrieval): prepared payload <= 16384 + paths; answer
<= 8192 + binding ~130; 3 rounds x (identity/key ~220 + delivery metadata with
poll cursor <= 4096, error <= 256, relay with --limit 1, timings ~300) + 2 x
request <= 2048; top-level error <= 256 -> about 45 KiB measured (45874 B; 116909 B
pretty), under 64 KiB. A round-limit failure keeps three requests but no answer
(about 40 KiB), so the answered state is the maximum. Retained
fragments only live inside round payloads, which are not stored (only their
identity). Residual: relay output and cursor characters that need JSON escaping
are bounded by the authority's own output, not by these limits.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-05*
