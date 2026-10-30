---
type: story
id: "story-group-repeated-owners-in-adjacent-session-editing-rows"
epic: "WP-21"
title: "Group repeated owners in adjacent session editing rows"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-30
updated: 2026-10-30
external_refs: {}
tags: []
code_refs: ["scripts/sessions.mjs", "tests/presence.test.mjs", "tests/presence-liveness.test.mjs", "tests/presence-storage.test.mjs", "tests/presence-checkout.test.mjs", "tests/harness.test.mjs", "tests/state-migrate.test.mjs", "docs/cli-reference.md", "docs/vault/adr/0008-token-budget.md", "docs/vault/adr/0007-shared-vault-presence.md", "docs/vault/adr/0010-coordination-follows-the-repository.md"]
specs: []
started_at: "2026-10-30T10:52:58.210Z"
closed_at: "2026-10-30T11:10:30.186Z"
plan_updated_at: "2026-10-30T10:52:58.210Z"
---

# Group repeated owners in adjacent session editing rows

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Sessions repeats each foreign live lease owner in editing lines. Share the full displayed owner once across adjacent visible rows without changing the session table, safety warnings, JSON or coordination semantics.

## Decomposition

- [x] Group eligible adjacent editing rows by raw session/host/harness, keeping complete paths/owner/count and exact singleton/nonshorter fallback. — evidence: scripts/sessions.mjs:217; tests/presence.test.mjs:489
- [x] Verify filtered adjacency, duplicates/A-B-A/nullish/malformed/multiline and source-bound complete prefix/suffix/JSON/call parity plus actual CLI warnings/filters. — evidence: tests/presence.test.mjs:489; tests/presence.test.mjs:534; .waypost/experiments/wp21-sessions-editing-output-20261030/comparison.json
- [x] Measure full outputs with named offline encodings and unchanged controls, run presence/CLI suites, Doctor, independent acceptance and owned cleanup. — evidence: .waypost/experiments/wp21-sessions-editing-output-20261030/{tokens.json,tokenizer-proof.json,validation.json,diagnostics.json,reviewer.json,cleanup.json}

## Implementation Plan

Replace only the existing human out.leases.filter(x=>!x.mine) editing loop. Save that same filtered sequence, group adjacent raw-equal session/host/harness with ===; no serializing/coercing key, sort or dedup. Eligible path/session/host are nonempty one-line strings; harness is single-line string or nullish. Runs >=2 may render `  editing: (session on host) [N leases]` then four-space-indented raw paths, only if candidate UTF-16 length is strictly less than exact legacy concatenation. N counts visible records, not unique paths. Singleton/invalid/multiline/nonshorter rows retain old interpolation bytes (numeric paths stay printable; do not copy padEnd errors from lease list). Adjacent means after the unchanged !mine filter; the already-computed live filter stays upstream. Preserve all active-table/action/stale/storage/shared-checkout/sibling/sync-conflict bytes and their relative order/boundaries around editing literally, plus early JSON and every state/data API call. Source inverse proves no other code change. Frozen whole-display replay compares calls/JSON/errors and entire prefix/suffix, reconstructs original editing tuples/order/duplicates with source-aware owner data; no universal decoder promise. Actual cloned CLI uses real scripts and frozen child clock/warmed observations for exact JSON before/current. Offline pinned two-encoding token counts/roundtrip/repeat/network-denied counting, singleton/ineligible controls and short-owner sensitivity (nonshorter/equal-length eligible runs may be unreachable for this grammar; calculate rather than fabricate controls). Full presence/liveness/storage/checkout and module/routine/subprocess guards through heavy admission; stable identities, Doctor, fresh reviewer and owned cleanup. No warnings, coordination/liveness/storage/write policy or API changes.

## Acceptance Criteria

- [x] Only eligible adjacent raw-equal visible owners group when shorter in text; full unshortened session/host, lease-row count, paths/order/duplicates retained; singleton/ineligible/nonshorter output exact and !mine/live filtering unchanged. — evidence: scripts/sessions.mjs:217; .waypost/experiments/wp21-sessions-editing-output-20261030/comparison.json
- [x] Source-bound reconstruction plus actual CLI proves complete unmodified session table/actions/stale/storage/shared-checkout/sibling/sync-conflict warning bytes and relative order/boundaries, exact JSON/calls and legacy typed/multiline/error behavior; no storage/liveness/write/refusal/release/API change. — evidence: tests/presence.test.mjs:534; .waypost/experiments/wp21-sessions-editing-output-20261030/comparison.json
- [x] Named offline full-output token counts show reduction for repeated realistic owners with unchanged controls; relevant suites/guards pass, independent reviewer accepts, Doctor clean and own scratch removed. No native-token/quota/whole-workflow savings inferred. — evidence: .waypost/experiments/wp21-sessions-editing-output-20261030/{tokens.json,tokenizer-proof.json,validation.json,diagnostics.json,reviewer.json,cleanup.json}

## Final Summary

Only human editing rendering changed. Eligible adjacent raw-equal visible owners share full owner/count header and every raw path; singleton/ineligible output remains exact. Source-bound172 whole-display cases preserve JSON/state calls, session table/action/stale/storage/shared-checkout/sibling/sync-conflict prefix/suffix bytes and relative boundaries; reconstruct all original visible rows/order/duplicates after unchanged !mine filtering. Typed path7 remains printable. Current grammar always shortens eligible >=2 runs in UTF-16; formula/control sizes recorded rather than fabricating unreachable equal-length input. Actual cloned CLI with fixed clock/warmed observations preserves full JSON, own/stale filters, five visible leases and shared-checkout warning. Full output offline tiktoken0.14.0 o200k_base: actual318 to275 (-13.52%), eightlong325 to141 (-56.62%), short67 to65; singleton76 to76 and ineligible108 to108. cl100k316 to273,333 to142,67 to65,77 to77,110 to110. All encoding roundtrip/repeat; counting0network attempts/0native inference calls by runner, public install/warm separate. Full presence/liveness/storage/checkout79pass0fail2Linux-onlyskips onmacOS plus4guards pass, total83pass2skip. Sources/runtime stable; own temporary tokenizer/cache/runtime/realtools/fixtures removed. Independent reviewer accepted all criteria without findings;581/581 union identities and59 extra bindings matched, pre-close Doctor issue/warn/warning0. These are named raw-text counts for fixed fixtures, not model mapping, whole-workflow/native-token/quota savings or universal owner decoding.

## Technical Notes

Harness is a RAW boundary only: editing output never showed it, so do not add it to headers. Missing/null/empty harness must not merge despite equal displayed owner. Preserve interpolation of numeric/nullish paths. Character-length gate is not a universal tokenizer guarantee. Owner delimiters are already ambiguous; reconstruction checks source-bound display facts only. Shared-checkout warnings must remain after editing output; do not move their priority or content.

## Dependencies

-

## Attachments

- Local retained evidence: `.waypost/experiments/wp21-sessions-editing-output-20261030/`.

---

*Last updated: 2026-10-30*
