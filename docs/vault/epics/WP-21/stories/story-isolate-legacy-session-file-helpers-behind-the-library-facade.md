---
type: story
id: "story-isolate-legacy-session-file-helpers-behind-the-library-facade"
epic: "WP-21"
title: "Isolate legacy session file helpers behind the library facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-26
updated: 2026-10-26
external_refs: {}
tags: []
code_refs: ["scripts/lib.mjs", "scripts/lib-legacy-sessions.mjs", "tests/lib-legacy-sessions.test.mjs", "tests/helpers/legacy-session-scenarios.mjs", "scripts/sessions.mjs", "tests/predicates.test.mjs", "tests/presence.test.mjs", "docs/how-it-works.md", "docs/vault/adr/0010-coordination-follows-the-repository.md"]
specs: []
started_at: "2026-10-26T18:30:33.151Z"
closed_at: "2026-10-26T18:42:30.540Z"
plan_updated_at: "2026-10-26T18:30:33.151Z"
---

# Isolate legacy session file helpers behind the library facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Isolate the legacy .projectstore/sessions file helpers behind the unchanged facade. This cohesive read/write block has no module state and remains used by sessions.mjs; modern presence/storage policies do not change. Existing accepted module boundaries and ADR-0004/0010 apply; no new ADR or native token pilot.

## Decomposition

- [x] Freeze literal/API and owned-fixture behavior baseline.
- [x] Move block and add focused call-time/filesystem/error tests.
- [x] Validate consumers, independent review, cleanup and close.

## Implementation Plan

Move the complete4296B Session awareness block into lib-legacy-sessions.mjs, direct Node fs/path/os imports only. Re-export sessionsDir/sessionFilePath/ensureSessionsDir/writeSession/touchSession/cleanupStaleSessions from lib.mjs. No internal calls remain; remove only unused statSync/utimesSync/unlinkSync/hostname imports. Leaf ceiling6000B; prove namespace100/name/arity/function-source and full inverse. Leave dates, heading cache, source classification and modern coordination untouched.

Before edits freeze behavior under owned roots and a fixed clock. Stub hostname and process.pid at call time; PID uses explicit JS getter with positive4242/4343 controls; process.kill is never-forwarding and forbidden. Guard every filesystem mutation within owned fixtures, with persistent violation records even inside swallowed catches. Compare exact returns/errors/error identity, ordered fs trace, resulting JSON/.gitignore bytes and controlled mtimes. Protect human files, custom .gitignore, live/current/cutoff/ignored records and an unrelated modern-presence fixture by content/inode/dev/mtime across replay; reset only owned mutable outputs between runs.

Cases cover new/existing/malformed/read-failing session data, preserved truthy started_at and array activity, discarded other fields, write/mkdir/.gitignore/hostname errors, missing/success/failing touch, cleanup own exemption/strict cutoff/dryRun/stat+unlink failure/listing propagation/missing directory. Preserve JSON without final LF, mkdir/plain writes, path handling and exact catch boundaries. No new validation, atomic replacement, PID liveness or modern policy. Permanent focused tests run the same guarded scenarios and pin bindings/budget/import actions. Existing predicates/presence/commits/scripts contours cover actual sessions consumers; all targeted tests run via heavy gate with source-bound runtime/log/argv receipts. Package/syntax/doctor must pass. Independent reviewer before closing/committing; full Node20/22/24 CI follows publication, status stated honestly.

## Acceptance Criteria

- [x] Literal block/API and inverse preserved; leaf<=6000B, no facade cycle or state move — evidence: comparison.json/api-before+after.json/chunk.txt/wiring.json; literal4296B,leaf4492B,API100/function-source and full inverse verified independently.
- [x] Fixed-clock owned-fixture replay matches filesystem/error/mtime behavior and protected identities without real PID probes — evidence: baseline.json/current.json,18scenarios/99operations/71protected live identities; persistent mutation guards and never-forwarding forbidden process.kill.
- [x] Focused and consumer tests pass with source-bound receipt; package and Doctor issue/warn/warning all0 — evidence: validation.json/tests.tap/admitted-run.log,Node24.22.1,277pass/0fail/2unchanged Linux-only skips,wrapper+child exit0,64486.634166ms,253source/stable binarySHA; package and Doctor0/0.
- [x] Independent reviewer approves current diff/evidence; docs describe legacy helper boundary truthfully — evidence: independent final ship/no findings,253current/252baseline/12dirty identities plus full runtime/log/runner/argv; docs/how-it-works.md and ADR0010 source-pointer-only update.

## Final Summary

Moved literal4296B legacy Session awareness block into lib-legacy-sessions.mjs with direct Node fs/path/os imports; six facade bindings/name/arity/function sources and namespace100 preserved. Full-facade inverse exact; no local caller changes, state/cache move or facade cycle. Facade40644->36448B, leaf4492B (budget6000), combined+296B. Modern presence/coordination unchanged; legacy .projectstore/sessions remains per ADR0010. Source compatibility comment retained literally; docs identify actual sessions.mjs usage, ADR0010 updates only its source pointer.

Frozen18scenario/99operation replay matches all returns/error identities, fs order/bytes/controlled mtimes and71protected live content/inode/dev/mtime identities. Preserves truthy started_at/array activity, JSON without final LF, human .gitignore, current-session exemption, strict cutoff, dryRun and catch boundaries. No real PID probes; all mutations owned and guarded, including persistent records of swallowed violations. Initial baseline helper failed on Node loader file URLs; read guard fixed using fileURLToPath BEFORE accepted baseline/source editing; initial stderr retained separately.

Five-file admitted run:279total/277pass/0fail/2unchanged Linux-only proc tick-count skips on macOS,wrapper+child exit0,64486.634166ms Node24.22.1,stable binarySHA/253source identities; full log/manifest/runner/argv retained. Package/syntax/diff-check/Doctor0issue/0warn/0warning pass. Independent reviewer ship/no findings, verifying253current/252baseline/12dirty identities and protected live fixtures. Removed1606925logicalB own fixtures/npmcache/runner after final review; sources retained as text. Evidence .waypost/experiments/wp21-lib-legacy-sessions-20261026/. BaselineCI40365474655 verified success on Node20/22/24; new full CI follows publication. No native-token/quota/runtime/net-saving measurement or new native-platform coverage.

## Technical Notes

The legacy registry stays under the vault per ADR-0010. Its old mtime policy is not modern presence: sibling idle records can be reaped; currentSessionId is exempt. Preserve this limitation and dryRun count behavior. Source compatibility comment is retained literally even though sessions.mjs still invokes touch/cleanup helpers; docs describe actual callers. No native-token/quota/runtime/net-saving claim follows from a smaller facade.
