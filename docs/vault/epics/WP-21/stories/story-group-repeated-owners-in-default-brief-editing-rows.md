---
type: story
id: "story-group-repeated-owners-in-default-brief-editing-rows"
epic: "WP-21"
title: "Group repeated owners in default brief editing rows"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-01
updated: 2026-11-01
external_refs: {}
tags: []
code_refs: ["scripts/brief.mjs", "tests/presence.test.mjs", "docs/cli-reference.md", "docs/vault/adr/0008-token-budget.md"]
specs: []
started_at: "2026-11-01T22:32:38.709Z"
closed_at: "2026-11-01T22:41:58.144Z"
plan_updated_at: "2026-11-01T22:32:38.709Z"
---

# Group repeated owners in default brief editing rows

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Default brief repeats a foreign editing owner for each leased path. Group only adjacent identical owners when doing so shortens the text; retain full detail and all safety advice.

## Decomposition

- [x] Group eligible adjacent default lease rows only when shorter; preserve legacy full/fallback output. — evidence: tests/presence.test.mjs; retained replay/CLI/token/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-brief-editing-output-20261101/`.
- [x] Cover filters/raw boundaries/duplicates/short-owner/full/JSON and complete safety blocks. — evidence: tests/presence.test.mjs; retained replay/CLI/token/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-brief-editing-output-20261101/`.
- [x] Compare source-bound reports, measure named text tokens, pass relevant suites/guards, Doctor and fresh review. — evidence: tests/presence.test.mjs; retained replay/CLI/token/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-brief-editing-output-20261101/`.

## Implementation Plan

Only others() lease rendering changes. After existing live && !mine filter, default mode groups adjacent nonempty single-line string path/session/host and nullish or single-line string harness; RAW session/host/harness compare separately with ===. Keep null/undefined/empty harness boundaries distinct; no sort/dedup/A-B-A merge. Header - (session on host) [N leases], child rows two-space-indented Markdown path bullets. Count lease records including duplicates. Compare candidate and exact legacy run length; use only strictly shorter. Singleton/unsupported/multiline and opts.full keep old interpolation/error containment. All presence/lease/sharedTree calls, safety headings, storage lag, peer list, shared checkout, siblings and sync conflicts unchanged. No coordination/state/export/newflag/dependency changes. Unit/source replay reconstructs displayed tuples and exact prefix/suffix, guards full/short/fallback/call order/errors; actual owned CLI default/full/JSON with fixed clock validates live/own/stale filters and shared warning. Token counts use pinned offline tiktoken0.14.0 full stdoutLF in o200k_base/cl100k_base, public install/warm separate; no native inference/quota/workflow claim. Full presence/liveness/storage/checkout plus routine/module/subprocess guards via heavy admission after roles finish; source/runtime/Doctor identities and fresh implementation review.

## Acceptance Criteria

- [x] Only eligible adjacent default editing rows change when shorter; all records/owners/paths/order/duplicates/filters and complete safety blocks/calls/full/fallback/JSON behavior remain intact. — evidence: tests/presence.test.mjs; retained replay/CLI/token/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-brief-editing-output-20261101/`.
- [x] Source-bound replay and actual CLI verify scope and named text-token reduction; suites/guards pass, Doctor no issues/warnings, independent reviewer accepts. — evidence: tests/presence.test.mjs; retained replay/CLI/token/test/Doctor/reviewer receipts in `.waypost/experiments/wp21-brief-editing-output-20261101/`.

## Final Summary

Default brief groups eligible adjacent foreign editing rows by their raw session/host/harness only when strictly shorter. Full mode preserves the literal old loop. All records, paths, duplicates, order, filters, calls, facts/JSON and safety blocks remain intact; no new flag/dependency/export/state change.

Confirmed Node24.22.1/macOS:81presence/liveness/storage/checkout+4module/routine/subprocess guards=85pass,0fail,2Linux-only skips.416source identities stable;3baseline files match48b4a52; inverse restores exact production baseline.188source-bound matrix cases plus4token-report comparisons retain tuples/order/duplicates, calls and prefix/suffix, including short/equal/nonshorter, full, raw nullish keys, malformed interpolation, filtered adjacency and combined safety blocks. Decoder is source-aware, not universal. Four real copied-CLI modes with fixed clock/reset samepaths show header-only default changes; full/JSON/fullJSON stdout/stderr/status/project file hashes exact; shared-checkout warning retained.

Pinned offline tiktoken0.14.0 counts full stdoutLF: actual complete brief567→541(-4.59%) in o200k_base/cl100k_base. Eight-long-owner coordination section alone388→261o(-32.73%),398→264cl(-33.67%); singleton/equal/short controls unchanged. Fivepairs roundtrip/repeat, denied DNS/sockets0attempts; public binary-only/no-cache install+warm separate.0native inference calls BY RUNNER; operator/reviewer spend unmeasured. This is fixture text-output reduction, not native/quota/net-workflow savings; a character-length guard cannot guarantee reduction in every tokenizer.

Fresh independent implementation reviewer accepted original AC. Explicit checkednode+repo/bin Doctor receipt:953tracked/untracked/config inputs stable,exit0/stderr empty/0issues/warnings6info. First heavy32460 failed one new integration assertion (mixed real-clock parent and fixed-clock child snapshot); exact checked test/logs/manifest retained in attempt-1. Only fixture observation was corrected to sessions--json in the same child clock/env; final heavy2837 exit0. Both scratch trees removed with external symlink targets untouched; helpers cleaned separately. Evidence `.waypost/experiments/wp21-brief-editing-output-20261101/` retains source/review/baseline/runtime/test/CLI/tokenizer/Doctor bindings. No native pilot or historical budget changes.

## Technical Notes

Brief is Markdown, unlike sessions/lease list; use a local renderer, no cross-module extraction. Character gate is not a guarantee for all tokenizers. Full option already reaches others().

## Dependencies

-

## Attachments

- Evidence: `.waypost/experiments/wp21-brief-editing-output-20261101/`.

---

*Last updated: 2026-11-01*
