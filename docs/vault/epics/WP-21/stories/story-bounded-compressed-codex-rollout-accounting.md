---
type: story
id: "story-bounded-compressed-codex-rollout-accounting"
epic: "WP-21"
title: "Bounded compressed Codex rollout accounting"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-18
updated: 2026-10-19
external_refs: {}
tags: []
code_refs: ["scripts/token-codex.mjs", "tests/token-codex.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-18T23:56:39.692Z"
closed_at: "2026-10-19T00:04:27.909Z"
plan_updated_at: "2026-10-18T23:56:39.692Z"
---

# Bounded compressed Codex rollout accounting

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Compressed Codex rollouts are currently skipped, leaving retained-source totals unknown even when native counters are present. Add bounded stdlib decoding for gzip, Brotli and runtime-supported Zstandard, preserving project selection, conservative native-span accounting and original-byte fingerprints. Unsupported codecs/runtime capabilities and corrupt or over-limit archives remain explicit coverage gaps. No external commands, model calls, quota conversion, or pilot/ledger mutation.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Add bounded archive header/history streams and explicit coverage/provenance. — evidence: scripts/token-codex.mjs:49; complete input consumption guard
- [x] Verify codec parity, replay/identity safety, corruption/limits and payload privacy. — evidence: 85/85 affected fixtures; tests/token-codex.test.mjs:346–445
- [x] Document limits/runtime fallback and record an offline refreshed baseline after fresh review. — evidence: baseline-summary.json; independent archive_accounting_reviewer acceptance

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

The independent planner recommended preserving probe → identity → cwd filter → full read, with original compressed-byte hashing and full-context quarantine on decode failure. Implement native namespace zlib codecs without external commands; preserve reducer semantics. Fixed limits are 8 MiB compressed and 64 MiB expanded per pass (above the observed local maximum compressed archive 3,082,309 bytes); Zstandard window log max26. These are protective ceilings, not measured token savings. Foreign tails remain unverified. Test codec parity, replay/foreign identity, corruption, both ceilings and privacy; affected accounting suites through the heavy gate, then fresh reviewer and a separate offline baseline.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Supported archives produce the same conservative native spans as plain histories, with exact project/role selection and plain/archive replay deduplication; original compressed bytes are fingerprinted. — evidence: codec parity/replay/hash fixtures; reviewer AC1 met
- [x] Unsupported codecs/runtime, corrupt streams and compressed/decompressed limits remain visible and prevent completeness; a failed matching archive cannot contribute trusted partial spans or silently hide conflicting identity. No transcript bodies are emitted. — evidence: corruption/limit/tail/privacy fixtures; reviewer AC2 met
- [x] Node20-compatible stdlib imports, unchanged Claude/native-counter semantics and scoped fixture validation are independently reviewed; documentation and an offline measured report distinguish observed coverage from full usage/quota/savings. No live evaluation or authority/budget mutation. — evidence: 154 source hashes; 85/85 tests; independently checked baseline and docs; reviewer AC3 met

## Final Summary

Implemented bounded stdlib gzip/Brotli/runtime-native Zstandard inspection for retained Codex rollouts. Header-first filtering preserves project identity checks; matching archives require decoder completion and consumption of all source bytes. Full original-byte hashes, explicit errors/limits and context-wide quarantine prevent fabricated completeness or replay recovery after failure. Claude and cumulative-counter semantics are unchanged.

Affected fixtures85/85 pass; independent reviewer accepted AC1–AC3 with no remaining findings after the ignored-tail blocker was fixed. Refreshed historical window fully decoded105 matching archives and checked101 foreign headers; observed totals remain18,949,185, explicit Waypost4,076,805 (21.514408%). Unknown prefixes/conflicts still prevent full totals; one active plain source changed between sequential reads. This is expanded inspection, not measured savings or subscription quota. Node25.6.1/macOS verified; Node20 runtime remains untested. No native pilot dispatch or budget mutation; session preparation/review cost remains unknown.

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

### Verified offline behavior

Affected accounting suites: `waypost run --heavy --wait 30s -- node --test tests/token-codex.test.mjs tests/tokens.test.mjs tests/token-navigation.test.mjs`, exit0,85 passed/0 failed/0 skipped on Node25.6.1/macOS. All154 source inputs matched before/after tests and baseline. Evidence `.waypost/experiments/wp21-compressed-20261018/{source-before.json,tests.log,verification.json,baseline-plain.json,baseline-archives.json,baseline-summary.json}`. Source manifest SHA256 `b8d8f50494d919dc016b306b9435ebb8011bee500a87ee64873644e1a64b2852`; log SHA256 `0b914163c7942c999b62002a68ecf5f00f3931a9b501402727176bdc5d08861e`. Node20 runtime was not exercised; namespace imports and capability detection preserve the existing compatibility contract without requiring Zstandard.

Initial run75/82 exposed Node pipeline wrapping controlled probe cancellation as AbortError; the correction tracks intentional probe completion explicitly. Initial independent review found that Brotli/Zstandard silently ignore tails/second members; full reads now require decoder.bytesWritten to equal all original input bytes. Added all-codec junk/second-member tests including valid gzip concatenation; prior logs/input manifests remain retained as historical evidence.

### Retained-history refresh

Offline fixed window [2026-10-08,2026-10-16) UTC: old plain-only collector at3a5592a and current collector both observe18,949,185 native tokens in187 spans; explicit Waypost4,076,805 (21.514408%). Current discovery184 plain files plus206 archives; all206 headers decoded,105 matching archives fully decoded,101 foreign archives filtered by header,0 skipped/failed archives and0 limit failures. Matching files increase66→171; full totals/shares remain null,108 contexts have unknown prefixes and27 conflicting histories are quarantined. This is broader source inspection, not demonstrated savings or complete usage.

One shared plain input changed between sequential reads (active history); this is not an atomic source snapshot or an exact controlled cost comparison. Historical source retention also changed since earlier reports. Neither archive success nor unchanged observed totals authorizes any live pilot. No native experiment inference, authority/budget mutation or quota conversion occurred. Author/planner/reviewer session costs remain unisolated and unknown; this offline step is not zero-cost work and does not charge them to the pilot allowance. Fixed protective limits may leave larger archives unknown; no external decompressor is launched.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-19*
