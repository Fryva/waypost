---
type: story
id: "story-isolate-bounded-strength-evidence-transport"
epic: "WP-21"
title: "Isolate bounded strength evidence transport"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-27
updated: 2026-10-27
external_refs: {}
tags: []
code_refs: ["scripts/model-strength.mjs", "scripts/model-strength-fetch.mjs", "tests/model-strength-fetch.test.mjs", "tests/helpers/strength-fetch-scenarios.mjs", "tests/model-strength.test.mjs", "tests/team-periodic.test.mjs", "tests/calibration-policy.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-27T22:27:32.993Z"
closed_at: "2026-10-27T22:32:54.650Z"
plan_updated_at: "2026-10-27T22:27:32.993Z"
---

# Isolate bounded strength evidence transport

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Read bounded evidence transport/pagination separately from source validation, parsing and strength policy. Mechanical WP-21/ADR-0008 split; no new source, policy, model call or live network request.

## Decomposition

- [x] Freeze literal owner/API and mocked bounded-fetch behavior.
- [x] Extract fetchJSON/fetchArena; preserve trusted-source validation and public surface.
- [x] Verify consumers, independent review and own-temp cleanup.

## Implementation Plan

Move literal fetchJSON+fetchArena cohort into scripts/model-strength-fetch.mjs; add export only to fetchArena and import it locally into the owner, without public re-export. Leaf has no imports/module state, but it is injected I/O, not a pure function: AbortSignal.timeout and supplied fetch/stream callbacks run on calls. No action at import, owner cycle, wrapper or extra validation. Owner retains all six public exports, source/URL/config validation, routing/calibration, parsers, registry URL, mutable EFFORT and every other declaration. Leaf ceiling4500B, owner ceiling24000B. Exact whole-owner inverse and public function-source/name/arity/values remain.

The helper accepts already-validated source/config from discoverStrength; its internal export is not a new trusted network entry. Preserve timeout/redirect/headers, response URL/status/header checks before acquiring a reader, streamed-byte and aggregate serialized-byte limits, read/cancel ordering and existing exception precedence. Keep page query ordering/100-row offsets/bounded length, total consistency, partial/truncated/misordered/incomplete checks and row identities. Do not fix unusual cancel behavior or add retries.

Use supplied fake fetch/streams only, with call-time AbortSignal.timeout stub and persistent forbidden-global-fetch guard/positive control; no real HTTP or timer in controlled replay. Freeze before/after results, references, command options/order/errors, including multi-page success and every bound/failure/cancel shape. Permanent helper tests import silence and meaningful goldens; existing model-strength, team-periodic and calibration-policy consumers run through heavy admission. Canonical ADR guard objects remain unchanged; they still name existing public consumer tests. Update code_refs and ownership docs only, not accepted decisions/status.

Retain source/runtime/runner/log receipts, syntax/package checks and Doctor issue/warn/warning0. Independent critic before implementation and reviewer before close/commit. Delete only own temporary runner/npmcache before close; keep evidence .waypost/experiments/wp21-strength-fetch-20261027/. No native pilot, live feed/model call, budget change or measured token/runtime savings.

## Acceptance Criteria

- [x] Literal move except one export/import, exact inverse and public API6 preserved; leaf<=4500B, owner<=24000B; injected-I/O replay preserves bounds, rows/references, options/order/errors with no actual HTTP/timers. - evidence: `comparison.json`, `before.json`/`after.json` and API snapshots in `.waypost/experiments/wp21-strength-fetch-20261027/`.
- [x] Focused and existing consumer tests pass with source-bound receipts; import silence, package/syntax/Doctor pass; source validation and guards unchanged, docs identify internal transport ownership. - evidence: `validation.json`, `tests.tap`, `static-checks.json`, `pack.json`, `doctor.json`, `guards.json` and ownership docs.
- [x] Independent review accepts implementation/evidence; own temporary files removed before CLI close. - evidence: independent `review-final.json`, twelve input hashes and `cleanup.json`.

## Final Summary

Literal2688B fetchJSON/fetchArena cohort moved to2695B leaf with only fetchArena export added. Owner24543->21912B, below24000B; combined production source+64B. Local import only, public API6/function-source/name/arity/defaults and exact whole-owner inverse preserved. Endpoint/config validation, parsing, source choice, rankings and calibration remain owner; no imports/module state or import-time I/O in leaf. Controlled30scenario/333event replay matches results, original row references, bounds/options/pagination/order/errors/cancel precedence; import-time timeout guard then call-time stub, persistent forbidden-global-fetch positive control and parallel independence use no actual HTTP/timers. Source-bound four-file run35pass0fail/skip,4002.733667ms Node24.22.1 wrapper/child0, stable binary/runner/log and413input identities. Package/syntax/Doctor issue/warn/warning0; accepted ADR guards unchanged, existing public consumer tests continue covering bounds. Independent reviewer no findings. Removed1628244logicalB own runner/npmcache before close, source identities reverified; evidence `.waypost/experiments/wp21-strength-fetch-20261027/`. Previous full CI40594134608 still in_progress at last check. No live feed/model/native pilot, settings/sweep/user-artifact removal, policy change or measured token/runtime/net saving. New full Node20/22/24 CI follows publication.

## Technical Notes

reader.cancel rejection is swallowed, but synchronous throw or non-Promise return can replace an earlier error; preserve current behavior rather than redesign exception precedence. Exposing the internal fetchArena binding does not move endpoint validation out of discoverStrength.
