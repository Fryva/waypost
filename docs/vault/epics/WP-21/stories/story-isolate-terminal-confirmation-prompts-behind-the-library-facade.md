---
type: story
id: "story-isolate-terminal-confirmation-prompts-behind-the-library-facade"
epic: "WP-21"
title: "Isolate terminal confirmation prompts behind the library facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-26
updated: 2026-10-27
external_refs: {}
tags: []
code_refs: ["scripts/lib.mjs", "scripts/lib-terminal-prompt.mjs", "tests/lib-terminal-prompt.test.mjs", "tests/helpers/terminal-prompt-scenarios.mjs", "tests/cleanup.test.mjs", "tests/limit.test.mjs", "bin/cli/clean.mjs", "bin/cli/clean-apply.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-26T18:55:13.600Z"
closed_at: "2026-10-27T02:22:42.341Z"
plan_updated_at: "2026-10-26T18:55:13.600Z"
---

# Isolate terminal confirmation prompts behind the library facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Isolate the existing terminal confirmation helper so its safety/settlement behavior can be read without the shared library. Preserve the exact prompt/defaults/response grammar and cleanup contract. Mechanical extraction under existing accepted boundaries, no new ADR/policy/native pilot.

## Decomposition

- [x] Freeze literal/API and controlled prompt baseline.
- [x] Move block and add deterministic prompt/settlement tests.
- [x] Validate real stream consumers, independent review, cleanup and close.

## Implementation Plan

Move the entire2235B terminal yes/no block through EOF into lib-terminal-prompt.mjs, with sole createInterface import from node:readline. Direct re-export askYesNo from lib.mjs; remove only its now-unused readline import, no caller changes. No module state: rl/settled/timer/finish remain per invocation. Leaf ceiling4000B. Prove namespace100/name/arity1/function-source and whole-facade inverse.

Freeze baseline using a child with controlled readline interface and timers, explicit fixture streams and no real terminal. Probe call-time stdin/stderr/default60000 and option getter order; capture prompt bytes, timer/question/listener order and clear/close/pause/settlement trace. Cover affirmative/negative/empty/non-string answers, timeout, EOF, fake-interface SIGINT, races/repeated completion, paused-input errors and synchronous versus Promise error boundaries. Timers fire manually after construction, never synchronously in setTimeout; track active timers/interface closure and one settlement on normal answer/EOF/SIGINT/timeout paths. For error paths preserve baseline traces: a synchronous question() throw rejects the Promise while its timer remains active until a later event; the harness drains residual fake timers after observing that state. Guards add no actual prompt, terminal reads, OS signals, process probes or cleanup/removal. Real PassThrough tests in cleanup.test.mjs continue to cover actual readline yes/no, timeout/EOF and stderr rather than stdout. Test fixture errors must be reported to original stderr and child must exit naturally after cleanup.

Source-path classification is deliberately excluded: public mutable ignore arrays/RegExp objects retain per-query facade ownership. Heading/cache and all other bindings remain. Focused tests pin facade alias/namespace/arity/budget and run the guarded scenarios. Run focused/cleanup/limit tests via heavy gate with wrapper/child status, startup/stable Node binary and source/log/runner/argv receipt. Package/syntax/Doctor issue/warn/warning all0. Independent final reviewer before close/commit; full Node20/22/24 CI after publication, report pending honestly.

## Acceptance Criteria

- [x] Literal block/API and full inverse preserved; leaf<=4000B, no module-state or cycle change — evidence: `.waypost/experiments/wp21-lib-terminal-prompt-20261026/comparison.json`, `validation.json`, `tests.tap`, `pack.json`, `doctor.json`, and independent `review-final.json`.
- [x] Controlled before/after prompt/Boolean/error/timer/event traces match; no real terminal/signals/removal. Normal answer/EOF/SIGINT/timeout paths clear timers and settle once; error paths preserve baseline residual-timer behavior and harness drains fake timers — evidence: `.waypost/experiments/wp21-lib-terminal-prompt-20261026/comparison.json`, `validation.json`, `tests.tap`, `pack.json`, `doctor.json`, and independent `review-final.json`.
- [x] Focused and real-stream consumer tests pass with source-bound receipts; package and Doctor0/0 — evidence: `.waypost/experiments/wp21-lib-terminal-prompt-20261026/comparison.json`, `validation.json`, `tests.tap`, `pack.json`, `doctor.json`, and independent `review-final.json`.
- [x] Independent reviewer approves exact diff/evidence; docs describe the helper boundary and limits — evidence: `.waypost/experiments/wp21-lib-terminal-prompt-20261026/comparison.json`, `validation.json`, `tests.tap`, `pack.json`, `doctor.json`, and independent `review-final.json`.

## Final Summary

Literal terminal helper moved into a 2285B leaf (ceiling4000B), facade36448→34218B; combined source+55B. Namespace100 and full inverse match. Controlled baseline/current26scenarios267events match. Source-bound Node24.22.1 targeted run145pass0fail/skip, wrapper/child0; package includes leaf, syntax/diff-check and Doctor issue/warn/warning0. Independent reviewer ship/no findings verified256source and11dirty identities. Removed1606757logical bytes of owned fixtures/npm cache/runner; retained evidence under `.waypost/experiments/wp21-lib-terminal-prompt-20261026/`. Full Node20/22/24 CI follows publication and is not yet confirmed. No native-token/quota/runtime/net-saving measurement.

## Technical Notes

Only trimmed case-insensitive y/yes is affirmative; every other line/EOF/SIGINT/timeout is false. Output defaults to stderr, not stdout. Preserve settled guard before clearTimeout/close/pause/resolve and swallowed pause errors. Do not force terminal mode or change failure handling. This source-read reduction does not establish native token/runtime/net savings.
