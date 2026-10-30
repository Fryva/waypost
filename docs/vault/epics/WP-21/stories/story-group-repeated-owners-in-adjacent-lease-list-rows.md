---
type: story
id: "story-group-repeated-owners-in-adjacent-lease-list-rows"
epic: "WP-21"
title: "Group repeated owners in adjacent lease list rows"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-30
updated: 2026-10-30
external_refs: {}
tags: []
code_refs: ["scripts/presence.mjs", "tests/presence.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/cli-reference.md", "docs/vault/adr/0008-token-budget.md", "docs/vault/adr/0007-shared-vault-presence.md", "docs/vault/adr/0010-coordination-follows-the-repository.md"]
specs: []
started_at: "2026-10-30T10:11:50.183Z"
closed_at: "2026-10-30T10:28:34.288Z"
plan_updated_at: "2026-10-30T10:11:50.183Z"
---

# Group repeated owners in adjacent lease list rows

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Human lease list repeats the same session/host/harness for each adjacent path. Share that displayed owner once across adjacent ordinary rows without changing lease state, order, flags, JSON, acquisition/refusal/release or coordination semantics.

## Decomposition

- [x] Group adjacent eligible rows by raw session/host/harness identity, retaining singleton and non-shorter legacy output. — evidence: scripts/presence.mjs:341; tests/presence.test.mjs:438
- [x] Verify per-row mine/live/path, boundaries/A-B-A/duplicates/nullish/invalid/multiline fields and exact JSON/legacy/error behavior with frozen reconstruction plus actual CLI. — evidence: tests/presence.test.mjs:438; tests/presence.test.mjs:469; .waypost/experiments/wp21-lease-list-output-20261030/comparison.json
- [x] Measure before/current full texts in offline encodings, run presence/liveness/storage/CLI guards, Doctor, fresh acceptance and owned cleanup. — evidence: .waypost/experiments/wp21-lease-list-output-20261030/{tokens.json,tokenizer-proof.json,validation.json,diagnostics.json,reviewer.json,cleanup.json}

## Implementation Plan

Change only presence.mjs main case list after early JSON and empty returns. For each run use strict === on raw session/host/harness, no serialized/coerced key and no sort/dedup. Eligible: nonempty one-line string path/session/host, harness one-line string or nullish; otherwise original one-row rendering, preserving malformed-path failures and output order. Runs >=2 may emit owner text `${session} on ${host} (${harness || "?"}) [N leases]` followed by indented original mine/live flags and complete raw paths without alignment padding. N counts rows, including duplicates. Build candidate and legacy run strings and select grouped output only when shorter in UTF-16 text length; otherwise retain exact legacy bytes. Singletons always remain exact. Do not merge equal-looking raw undefined/null/empty harness values, nor nonadjacent A/B/A owners. Keep readLeases, storage migration, observation persistence, liveness, writes/refusals/release/watch/warnings and public API unchanged; current list has no independent storage warning to move. Source-bound actual list-block baseline/current replay reconstructs every raw displayed owner+mine/live/path tuple and duplicate/order, compares JSON and all ineligible/empty/unchanged behavior; include short-owner long-path no-benefit control. Actual cloned CLI uses real scripts copies to respect import.meta main guards. Offline pinned tokenization in both encodings with roundtrip/repeat/network-denied counting and no native inference. Full relevant presence/liveness/storage/API/CLI tests plus module/routine/subprocess guards through heavy admission; stable source/runtime/input/log hashes, Doctor, independent acceptance and owned cleanup.

## Acceptance Criteria

- [x] Only adjacent eligible raw-equal owners group when resulting text is shorter; complete unshortened identity and row count remain in header, every original mine/live/path row and order/duplicates retained, singleton/nonshorter output exact. — evidence: scripts/presence.mjs:341; .waypost/experiments/wp21-lease-list-output-20261030/comparison.json
- [x] Raw nullish/empty and owner boundaries/A-B-A remain separate; malformed/multiline fields preserve legacy behavior, JSON exact, no storage/liveness/write/refusal/release/API/warning changes; source-bound reconstruction and actual CLI controls pass. — evidence: tests/presence.test.mjs:469; .waypost/experiments/wp21-lease-list-output-20261030/comparison.json
- [x] Named offline full-output token counts demonstrate reduction on repeated realistic owners and unchanged controls; relevant suites/guards and independent acceptance pass, Doctor clean and owned scratch removed. No native-token/quota/whole-workflow benefit inferred. — evidence: .waypost/experiments/wp21-lease-list-output-20261030/{tokens.json,tokenizer-proof.json,validation.json,diagnostics.json,reviewer.json,cleanup.json}

## Final Summary

Only human list formatting changed: adjacent eligible raw-equal owner runs share a full owner/count header when strictly shorter in UTF-16 text; every raw path and per-row mine/live flag remains. Singleton/nonshorter/invalid/multiline output and JSON remain exact. Source-bound actual list-block inverse and115 cases reconstruct all legacy display/order/duplicates, compare JSON/readLeases calls and malformed-error prefixes. Actual cloned CLI JSON and human outputs match frozen rows (five records, one3-row group, one conflict-copy). Offline tiktoken0.14.0: actual full stdout o200k/cl100k148 to109 (-26.35%); eight repeated long-owner rows o200k285 to111 (-61.05%), cl100k293 to112 (-61.77%); short-owner71 to71 and singleton32 to32 controls. Both encodings roundtrip/repeat, counting network attempts0/native inference calls by runner0; public install/warm separate. Full presence/liveness/storage/checkout suites77pass0fail2skip (Linux-only tick tests skipped on macOS), plus4guards pass, total81pass2skip. Initial measurement wrapper invoked before try/catch on expected malformed path; retained attempt-1 and reran with only wrapper fixed. Sources/runtime stable and own tokenizer/cache/runtime/tool/fixture scratch removed. Independent reviewer accepted all criteria with no findings;581/581 union identities matched, pre-close Doctor issue/warn/warning0. Counts describe fixed raw CLI texts, not whole-workflow/native-model/quota savings or universal owner-text decoding.

## Technical Notes

The raw harness key distinguishes undefined, null and empty even though old display uses ?. Do not use JSON.stringify(tuple) or rendered-owner equality. Group headers count lease records, not unique paths. Keep flags on every row; do not derive mine/live from a shared owner header. The text-length gate avoids making short runs longer in characters but is not a universal tokenizer guarantee. No new public renderer export or format flag.

## Dependencies

-

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-lease-list-output-20261030/`.

---

*Last updated: 2026-10-30*
