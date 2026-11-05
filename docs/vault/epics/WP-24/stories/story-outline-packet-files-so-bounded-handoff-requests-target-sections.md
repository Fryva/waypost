---
type: story
id: "story-outline-packet-files-so-bounded-handoff-requests-target-sections"
epic: "WP-24"
title: "Outline packet files so bounded handoff requests target sections"
status: planned
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-05
updated: 2026-11-05
external_refs: {}
tags: []
code_refs: ["scripts/handoff.mjs", "scripts/handoff-delivery.mjs", "scripts/handoff-retrieval.mjs", "tests/handoff-retrieval.test.mjs", "docs/handoffs.md"]
specs: []
started_at: null
closed_at: null
plan_updated_at: null
---

# Outline packet files so bounded handoff requests target sections

| Field | Value |
|---|---|
| **Epic** | [WP-24](../epic.md) |
| **Status** | planned |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A receiver of a handoff packet may ask the host for bounded line ranges
(at most 4 requests of 200 lines, 3 native rounds — `RETRIEVAL_LIMITS` in
`scripts/handoff-retrieval.mjs`). But a packet file reference carries only
`{path, state, bytes, sha256}` (`scripts/handoff.mjs`), so the receiver picks
ranges blind: it guesses, asks for "lines 1–200 to see", or spends a round
locating the section it actually needs.

Give the receiver a table of contents first: a short deterministic outline of
each packet file (label → line range), so a request names the section it
needs. The idea is borrowed from two-level retrieval (look at the labels, open
only a couple of folders, as in latent sparse attention), applied to the bytes
Waypost already ships rather than to model internals.

## Decomposition

- [ ] Deterministic outline extractor, pure node: markdown ATX headings and
      top-level JS/MJS declarations (`export function|class|const`,
      `function`); any other file type gets no outline.
- [ ] Attach the outline to the delivered payload, computed from the same
      verified bytes whose `sha256` the packet records; bounded per file and in
      total, counted inside the existing 16 KiB payload limit.
- [ ] Response-contract text tells the receiver the outline exists and is
      advisory; range requests stay exactly as they are.
- [ ] Deterministic tests: headings/declarations, CRLF and BOM, empty and
      outline-less files, truncation at the bounds, stale file refused as before.
- [ ] One retained native example on the same task with and without outline:
      request rounds, fragment bytes, answer correctness, native counters.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [ ] Each outlined file lists entries with a label and an inclusive LF line
      range that matches the bytes the host would return for that range.
- [ ] The outline is bounded (entries per file, label length, total bytes) and
      a truncated outline says so explicitly; the payload never exceeds the
      existing limit because of it.
- [ ] The outline is advisory, not an allowlist: every range request valid
      before stays valid, and stale/hash/UTF-8/range checks are unchanged.
- [ ] Outline labels are delivered as untrusted source data, like any other
      fragment, and grant no tools or authority.
- [ ] V1 one-shot delivery and packets created before this change behave as
      before.
- [ ] A retained native example reports rounds, fragment bytes and native
      counters with and without outline; no token saving is claimed without
      complete counters and an equally correct answer.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

## Technical Notes

- Open question for the plan: outline in the packet (schema change, frozen at
  capture) or in the delivery payload (no packet change, recomputed from
  verified bytes). The payload side looks smaller; decide at `story plan`.
- No embeddings, no ranking model, no new dependency: the outline is structure
  the file already has.
- Risk: an outline steers the receiver away from relevant text outside any
  heading. Keep raw ranges available and watch for this in the native example.
- Fewer wire bytes do not imply fewer native tokens (see the three-arm runbook).

## Dependencies

- Serve bounded handoff document requests through the existing host
  (WP-24, done) — the request grammar this story feeds.
- Bounded handoff retrieval and content addressed receiver snapshots
  (ADR, proposed).

## Attachments

-

---

*Last updated: 2026-11-05*
