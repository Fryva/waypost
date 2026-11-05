---
type: story
id: "story-link-parsing-moves-to-its-own-leaf-so-the-resolver-has-room-to-change"
epic: "WP-21"
title: "Link parsing moves to its own leaf so the resolver has room to change"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-05
updated: 2026-11-05
external_refs: {}
tags: []
code_refs: ["scripts/lib-links.mjs", "scripts/lib-link-extract.mjs", "tests/lib-links.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-11-05T13:37:56.720Z"
closed_at: "2026-11-05T13:47:24.691Z"
plan_updated_at: "2026-11-05T13:37:56.720Z"
---

# Link parsing moves to its own leaf so the resolver has room to change

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

scripts/lib-links.mjs reached 9990 of the 10000 bytes its read-budget test allows (ADR-0008: a pure leaf stays readable in one pass), so the next change to the resolver would have failed that test. Extraction and resolution are separate concerns with no shared private state: the parser only strips code spans and lists link targets, the resolver only maps a target to a node.

## Decomposition

- [x] Move stripCodeSpans and extractLinks, comments included, verbatim into scripts/lib-link-extract.mjs
- [x] Re-export both from lib-links.mjs so its namespace, bindings and the lib.mjs facade stay unchanged
- [x] Extend the byte-budget and no-I/O import tests to the new leaf; update docs/how-it-works.md

## Implementation Plan

A literal move with one `export … from` line; no caller changes. lib-links.mjs keeps joinRel, the lookup tables and resolveLinkTarget.

## Acceptance Criteria

- [x] Both leaves are under 10000 bytes (lib-links.mjs 7930, lib-link-extract.mjs 2393) — evidence: tests/lib-links.test.mjs "link leaf preserves facade bindings, arity and read budget"
- [x] lib-links.mjs exports the same three functions, identical to the facade bindings, with the same names and arities — evidence: same test
- [x] Importing and calling the leaves performs no filesystem or process I/O — evidence: tests/lib-links.test.mjs "link leaf imports and executes without filesystem I/O or process probes"
- [x] Graph, doctor and readiness behaviour unchanged — evidence: lib-links, harness, scripts, predicates and doctor-integrity suites, 400 pass, 0 fail

## Final Summary

stripCodeSpans and extractLinks moved verbatim (diffed against HEAD) to scripts/lib-link-extract.mjs; lib-links.mjs re-exports them, so the facade, namespace and every caller are unchanged. lib-links.mjs drops from 9990 to 7930 bytes, leaving the resolver about 2 KB of headroom. Tests: lib-links, harness, scripts, predicates and doctor-integrity, 400 pass, 0 fail; doctor 0 issues. Not run: the other lib-* leaf suites (machine saturated by another session); they reach lib-links only through the lib.mjs facade, whose bindings the lib-links test checks. Also added tests/host-home.mjs to WP-19 code_refs (the warning left by the same-named-machines story) and the new leaf to ADR-0008 code_refs.

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-05*
