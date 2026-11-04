---
type: story
id: "story-preflight-managed-handoffs-and-generate-private-route-configuration"
epic: "WP-24"
title: "Preflight managed handoffs and generate private route configuration"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-03
updated: 2026-11-04
external_refs: {}
tags: []
code_refs: ["scripts/handoff-prepare.mjs", "bin/cli/handoff-prepare.mjs", "scripts/team-host.mjs", "scripts/team-cli.mjs", "tests/handoff-prepare.test.mjs", "tests/team-host.test.mjs", "bin/cli/handoff.mjs", "bin/cli/help.mjs", "tests/harness.test.mjs", "docs/handoffs.md", "docs/cli-reference.md"]
specs: []
started_at: "2026-11-03T00:55:13.897Z"
closed_at: "2026-11-04T03:53:32.405Z"
plan_updated_at: "2026-11-03T00:55:13.897Z"
blocked_by: ["WP-24/story-compare-continuation-quality-and-native-tokens-with-and-without-a-packet"]
---

# Preflight managed handoffs and generate private route configuration

## Description

Owner-approved continuation of Portable task handoffs with verifiable evidence.

## Implementation Plan

Add a lazy preparation CLI separate from the existing delivery writer. Resolve authenticated route paths from existing team/participant-host bindings. Add a metadata-only owned Host preflight operation with confirmed closure and no send/reservation. Consolidate both executable guards while preserving real version/isolation checks. Main integrates handler/help/reference/inventory; worker owns preparation/Host code. Follow the preparation contract in the draft spec and keep future execution preflight separate.

## Acceptance Criteria

- [x] Route creation references existing team participants and credential paths, publishes an exclusive private file, and creates no grants or keys. — evidence: all-six-focused.log380pass, all-six-cli-guards.log9pass and independent phase2/3 reviewer ship.
- [x] Preflight reports actual native version/login/isolation, allocation, owner call ceiling and packet freshness before inference; unknown observations stay unknown. — evidence: all-six-focused.log380pass, all-six-cli-guards.log9pass and independent phase2/3 reviewer ship.
- [x] Existing supported absolute executable paths work under owned supervision without changing version pins or accepting arbitrary executables. — evidence: all-six-focused.log380pass, all-six-cli-guards.log9pass and independent phase2/3 reviewer ship.
- [x] Failure diagnostics name the missing condition; dry preparation makes zero model requests. — evidence: all-six-focused.log380pass, all-six-cli-guards.log9pass and independent phase2/3 reviewer ship.

## Final Summary

Implemented private route generation and metadata-only owned preflight, preserving existing admission, supported-version and isolation guards. Canonical parent collision checks precede output publication. Focused snapshot passed380tests plus9CLIguards; independent reviewer ship after final canonicalization evidence refresh. Native executable path component still requires its normal same-peer preflight at execution; actual model remains unknown until receipt.
