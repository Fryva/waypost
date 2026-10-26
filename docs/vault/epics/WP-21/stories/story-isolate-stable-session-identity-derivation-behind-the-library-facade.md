---
type: story
id: "story-isolate-stable-session-identity-derivation-behind-the-library-facade"
epic: "WP-21"
title: "Isolate stable session identity derivation behind the library facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-26
updated: 2026-10-26
external_refs: {}
tags: []
code_refs: ["scripts/lib.mjs", "scripts/lib-session-identity.mjs", "tests/lib-session-identity.test.mjs", "scripts/sessions.mjs", "tests/predicates.test.mjs", "tests/commits.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-26T03:48:39.084Z"
closed_at: "2026-10-26T04:05:33.956Z"
plan_updated_at: "2026-10-26T03:48:39.084Z"
---

# Isolate stable session identity derivation behind the library facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Move the stable session-ID derivation helpers into one readable leaf behind unchanged public bindings. Preserve process/env/argv call-time semantics and all session coordination behavior. Continues WP-21.

## Decomposition

- [x] Freeze namespace, return/error corpus, getter/hostname traces and caller alias identity.
- [x] Move one literal chunk and direct re-export; keep session-awareness code unchanged.
- [x] Pin identity/import/budget/call-time contracts, relevant consumer tests and independent review.

## Implementation Plan

Move Session identity comments/TERMINAL_ENV/sanitiseSessionId/sessionIdFlag/sessionId→before Session awareness (3112 B) to lib-session-identity.mjs, importing hostname directly from node:os only. Facade directly re-exports two functions; keep its hostname import for other functions. No caches/state owners/filesystem registration/heartbeat/claims move. Preserve first --id and -- terminator, null/empty fallback, explicit _/leading-dot/first64 sanitization versus terminal -/last24, exact terminal key order and repeated getter reads, original harness prefix and host-shortname/ppid fallback. argv/env/defaults/hostname/ppid stay call-time, no capture. Freeze namespace100/function metadata; return/error corpus with deterministic hostname/ppid, Proxy getter/coercion traces and both sources precedence, input identities, sessions.mjs alias and repeated calls. Exact inverse whole facade and session-awareness unchanged. Focused two-bindings/name/arity/import-no-actions/hostname-probe guard and <=5000 B tests; relevant predicates/commits/presence/scripts/harness via heavy gate with launch runtime/binary/source SHA. Package/Doctor0/0 and reviewer. No new ADR/pilot or savings claim.

## Acceptance Criteria

- [x] Chunk literal, two bindings/name/arity and namespace100/caller aliases preserved; session-awareness and caches unchanged, no cycle/new dependency. — evidence: `chunks.json`, `wiring.json`, `source-after.json`.
- [x] Returns/errors/precedence/sanitization/getter/probe traces, default arguments and host/ppid call-time behavior match frozen baseline and meaningful consumer coverage. — evidence: `api-before.json`, `api-after.json`, focused and consumer tests.
- [x] Import adds no I/O/hostname/process probes/writes/timers; leaf<=5000 B, exact inverse/source-size/package proofs retained. — evidence: `comparison.json`, `pack.json`, focused import tests.
- [x] Focused and relevant existing tests pass through heavy admission, Doctor0/0 and independent reviewer approves. — evidence: `validation.json`, `tests-attempt-2.log`, `doctor.json`, `review-final.json`.

## Final Summary

Independent reviewer: ship, no findings; all four acceptance criteria met. Literal3112 B identity chunk moved behind two direct re-exports; bindings/names/arity, namespace100 and sessions.sessionId alias preserved. Existing hostname import remains for facade consumers; session-awareness, registration/claims/heartbeat and caches unchanged.

Frozen replay matches306argv/env cases, four getter/coercion scenarios and four default/hostname/ppid cases, including return/error and probe/read traces. Source precedence, first flag/terminator, different sanitizers and call-time behavior remain unchanged. Full inverse facade proof exact. Leaf3149 B (budget5000), facade49003→45962 B, combined+108 B.

Accepted seven-file attempt2:423total,421pass,0fail,2expected Linux-only skips on macOS, exit0,150736.822542ms Node24.22.1 logged at startup with stable binary SHA. Attempt1 emitted421pass/0fail/2skip but was interrupted by SIGTERM/exit143 without binary footer; it remains incomplete and is not acceptance evidence. Signal cause unknown; sources unchanged between attempts. Package includes leaf, syntax/diff-check clean, Doctor0issues/0warnings. Reviewer verified19current/13baseline/11dirty hashes and source-bound log/runner/argv. Evidence: `.waypost/experiments/wp21-lib-session-identity-20261026/` (comparison/validation/review-final, replay/manifests, interrupted receipt and tests-attempt-2.log). Owned fixture/npmcache/replay removed:1594559 B; sources retained as text. No native-token, quota, runtime or net-saving measurement; new Linux/native coverage is not claimed.

## Technical Notes

The two sanitizers intentionally differ. Do not scan a later --id if the first is empty, sanitize the harness prefix, reorder env keys, eliminate repeated getter reads, capture defaults or derive session identity inside a new process. Session-awareness stays in the facade.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-26*
