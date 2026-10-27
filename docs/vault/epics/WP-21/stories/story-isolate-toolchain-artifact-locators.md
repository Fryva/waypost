---
type: story
id: "story-isolate-toolchain-artifact-locators"
epic: "WP-21"
title: "Isolate toolchain artifact locators"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-27
updated: 2026-10-27
external_refs: {}
tags: []
code_refs: ["scripts/toolchains.mjs", "scripts/toolchain-locators.mjs", "tests/toolchain-locators.test.mjs", "tests/helpers/toolchain-locator-scenarios.mjs", "tests/toolchains.test.mjs", "tests/sizes.test.mjs", "tests/discovery.test.mjs", "tests/scripts.test.mjs", "docs/toolchains.md", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-27T22:13:45.076Z"
closed_at: "2026-10-27T22:20:33.946Z"
plan_updated_at: "2026-10-27T22:13:45.076Z"
---

# Isolate toolchain artifact locators

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Read artifact locator selection/dispatch without registry loading or cache resolution. A mechanical WP-21/ADR-0008 split, not a new locator, public API, platform policy or security redesign.

## Decomposition

- [x] Freeze literal owner/block/API and controlled locator behavior.
- [x] Extract cohesive locator block; preserve source pointers and existing guards.
- [x] Validate affected consumers, independent review and owned-temp cleanup.

## Implementation Plan

Move the literal locators section (xcodeDerivedDataFor, private LOCATOR_IMPLS, applicableLocators and runLocator) into scripts/toolchain-locators.mjs with only direct builtin fs/path/child_process imports. Owner directly re-exports the two public functions without local imports if no internal consumer exists; remove only lstatSync if confirmed unused elsewhere. No new wrappers/cycle/factory/configuration. Registry cache _shipped, BATCH_SHIM_RE mutable RegExp and all cache asking/resolution remain owned by each queried toolchains.mjs import. Leaf ceiling6000B, owner ceiling24000B.

Preserve public namespace/type/value/function source/name/arity, exact whole-owner inverse and literal cohort. Reference parity means input collect/result links and owner-to-leaf aliases. As with the existing leaf facade pattern, stateless exported functions become shared across queried owner imports; their previous cross-query function identity isolation is not retained. Mutable BATCH_SHIM_RE and _shipped ownership remains per queried owner import. Keep call-time process.platform/context spread precedence, first applicable duplicate locator and original collect reference; dispatch must retain existing inherited property behavior of LOCATOR_IMPLS, not silently change it to a null-prototype map. Keep darwin/empty-basename early returns, sorted prefix narrowing, charge BEFORE stat and command, stop at denied charge, lstat errors and symlink/directory checks, plutil argv/timeout/encoding, result ordering/root-plus-separator boundary and current exception behavior. No actual locator/system commands, user directories or cleanup operations during controlled replay.

Controlled helper child patches ONLY builtin readdir/lstat/spawn before importing exact literal sources via data URL, with positive controls and persistent violation counters for any unexpected paths/commands even through swallowed catches. Restore builtins in finally. Freeze baseline/current outputs, reference relationships, call ordering/options and errors. Test import has no side effects and call-time behavior after import. Existing toolchains/sizes/discovery tests exercise consumers through heavy admission; these retain their own isolated fixtures. Canonical ADR guards unchanged (none target this file); update code_refs and ownership docs, never policy/status. Syntax/package/source/runtime/runner/log identities and Doctor issue/warn/warning0; independent critic before implementation and reviewer before close/commit. Remove own temporary runner/npmcache before close, retain evidence .waypost/experiments/wp21-toolchain-locators-20261027/. No native pilot or measured token/runtime savings.

## Acceptance Criteria

- [x] Literal block/direct aliases/API and exact owner inverse preserved; leaf<=6000B, owner<=24000B, query-owned cache/RegExp remain owner; controlled replay preserves results/references/order/errors with no actual native locator calls. - evidence: exact inverse/API8 and replay22/49 in `.waypost/experiments/wp21-toolchain-locators-20261027/comparison.json`, before/after API/replay snapshots and helper positive controls.
- [x] Focused helper and existing consumers pass with source-bound logs; no import side effects, syntax/package/Doctor pass, canonical guards unchanged and docs identify ownership. - evidence: `validation.json`, `tests.tap`, `static-checks.json`, `pack.json`, `doctor.json`, `guards.json` and ownership docs.
- [x] Independent review accepts diff/evidence; owned temporary files removed before CLI close. - evidence: independent `review-final.json`, thirteen input hashes and `cleanup.json`.

## Final Summary

Literal3681B locator cohort moved to3819B leaf with direct builtin imports; owner26349->22733B, below24000B, combined production source+203B. Owner directly re-exports two functions without local imports, removes only unused lstatSync. Exact whole-owner inverse/API8/function-source/name/arity/values preserved. Input collect/result links and aliases preserved; stateless functions shared across queried facades as explicitly scoped, while mutable registry cache and batch-shim RegExp remain query-owned. Controlled child replay22scenarios/49events matches original including call-time platform/override, sorting/budget-before-stat/command, errors and inherited lookup; three positive controls and persistent counters prevent unexpected native access. No actual native command or user-directory access in controlled replay. Existing consumers retained with their own isolated fixtures. Source-bound five-file run224pass0fail/skip,30305.054375ms Node24.22.1 wrapper/child0, stable binary/runner/log and410input identities. Syntax/package/Doctor issue/warn/warning0; canonical guards unchanged. Independent reviewer no findings. Removed1626022logicalB own runner/npmcache before close, source hashes reverified; evidence `.waypost/experiments/wp21-toolchain-locators-20261027/`. Previous full CI40592893760 still in_progress at last check. No settings/sweep/user-artifact removal, policy redesign, native pilot or measured token/runtime/net saving. New full Node20/22/24 CI follows publication.

## Technical Notes

Do not repair inherited LOCATOR_IMPLS dispatch or misleading general comments as part of a literal source move. Unit probes are not live Windows/Linux/macOS tool discovery verification.
