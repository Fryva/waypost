---
type: story
id: "story-isolate-harness-detection-behind-the-agents-facade"
epic: "WP-21"
title: "Isolate harness detection behind the agents facade"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-24
updated: 2026-10-24
external_refs: {}
tags: []
code_refs: ["scripts/agents.mjs", "scripts/agents-detection.mjs", "tests/agents-detection.test.mjs", "scripts/agents-registry.mjs", "scripts/presence.mjs", "tests/harness.test.mjs", "tests/agents-registry.test.mjs", "tests/agents-render.test.mjs", "tests/predicates.test.mjs", "tests/state-migrate.test.mjs", "tests/limit.test.mjs", "docs/harnesses.md", "docs/vault/adr/0003-agent-roles-across-harnesses.md", "docs/vault/adr/0005-harness-registry.md", "docs/vault/adr/setup-asks-the-running-harness-not-only-the-projects-files.md"]
specs: []
started_at: "2026-10-24T14:38:05.055Z"
closed_at: "2026-10-24T14:44:24.136Z"
plan_updated_at: "2026-10-24T14:38:05.055Z"
---

# Isolate harness detection behind the agents facade

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A detection or consent-gate task currently reads the 50,066-byte agents facade
alongside role parsing, installation, routing and CLI. Expose its existing block
in one focused module without changing evidence or policy.

## Decomposition

- [x] Move the literal discovery/consent block and its shared BLOCK_RE.
- [x] Preserve four public bindings, the 44-name facade and shared registry/regexp.
- [x] Verify evidence/authority/marker/union/error contracts, parity, tests and review.

## Implementation Plan

Fresh planner at cdba6ca selects original lines218–419 (10,387 bytes), plus the
88-byte BLOCK_RE declaration at625. agents-detection.mjs imports existsSync,
readFileSync/readdirSync, join, projectRoot, PREFIX/harnessIds/harness/registry
from agents-registry and harnessProcess/processTable from presence. Four original
public functions are detectHarnesses/detectHarness/installHarnesses/gateCheck.
Export BLOCK_RE only for the unchanged private facade register/unregister callers;
never re-export it from facade. Remove only the now-unused presence import there.
No backimport, duplicate registry/cache or cloned regexp. All role/cache/render/
path/install/status/routing/CLI behavior remains. Literal code includes comments.
Keep marker-only filesystem detection independent of env, strip routing-only
files, ignore only own shared skills, preserve errors/dotfile/order behavior.
Keep attribution override->nearest-process->env, synthetic-env table opt-in and
ppid behavior. Keep install union known-running-only, uninstall marker-only.
Gate remains a separate nonmemoized evidence loader: mandatory shipped dir,
optional malformed skipping, only additive env on overrides, provider exclusion,
whole ancestor walk, depth128, nearest process wins, env evidence and errors.
No policy/security/permission/harness data/model/ADR-status change, new dependency,
pilot or budget allocation. Related ADRs gain code_refs/source pointer only.

Capture complete baseline and reverse reconstruction, frozen 44-name API,
90bundled/95local-overlay renders, CLI/errors/install/register/model writes/files.
Add a frozen deterministic discovery/gate table using owned dirs/env/processes.
Env-first focused regressions cover four identities/private BLOCK_RE/lazy import,
marker-only/block-only/shared-skills evidence, attribution and install union,
mandatory/optional/nonmemoized gate load, additive overrides/providers, ancestor
ordering/cycles/depth128/argv0 and shared-regexp state with routing operations.
Keep existing harness/setup/consent/foreign-file/model/standing-context/child-env
regressions. Syntax/package, source-bound heavy-gated targeted log and independent
review before close/commit. Measure focused/combined bytes without claiming native
runtime/token/workflow savings.

## Acceptance Criteria

- [x] Literal extraction reverses exactly to baseline; four bindings/44-name namespace and one shared registry/regexp preserved, no backimport/private export leak. — evidence: move-edits.json, block-before.txt, regexp-before.txt, tests-attempt-1.log; independent reviewer ship.
- [x] Marker/attribution/install-union and consent-gate authority/order/error behavior unchanged; frozen outputs/writes match; new direct regressions pass. — evidence: discovery-before.json/discovery-after.json, cli-before.json/cli-after.json, files-before.json/files-after.json and nine new tests in tests-attempt-1.log; independent reviewer ship.
- [x] Relevant regression/protection checks pass through heavy admission; module packaged; independent reviewer accepts source/log identities and honest size report. — evidence: validation.json (167 passed, 0 failed/skipped, exit 0), pack-proof.json; reviewer verified 55 current source, 12 dirty and 53 baseline hashes plus tested-manifest/full-log SHA.

## Final Summary

Implemented: agents.mjs 50,066 -> 39,742 UTF-8 bytes, focused module 10,849
bytes, combined +525 bytes. Discovery/consent block and shared BLOCK_RE moved
literally; full baseline reconstruction exact. Four public bindings and the
44-name facade are preserved. Detection/register/unregister share one regexp.
Separate nonmemoized consent loader and all evidence authority/order/error rules
remain unchanged. All 90 bundled / 95 local renders, CLI outputs/errors and
install/register/model writes/files match. Frozen discovery/gate cases match.
Syntax/package checks pass. Heavy-gated targeted checks: 167 passed, 0 failed/
skipped, exit 0, 69.152 seconds on Node 25.6.1/macOS, including nine new tests.
After tests only parent footprint added unchanged presence.mjs; both tested and
final manifests retained. Independent reviewer: ship, no findings. Doctor:
0 issues, 0 warnings. Full CI for this change is a follow-up. No native-token,
runtime or workflow saving measured; no new pilot or budget allocation.

## Technical Notes

Mechanical extraction under accepted ADR0003/0005/0008 and existing setup behavior;
setup ADR remains proposed. Evidence: .waypost/experiments/wp21-agents-detection-module-20261024/.

## Attachments

- .waypost/experiments/wp21-agents-detection-module-20261024/

---

*Last updated: 2026-10-24*
