---
type: story
id: "story-outline-packet-files-so-bounded-handoff-requests-target-sections"
epic: "WP-24"
title: "Outline packet files so bounded handoff requests target sections"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-05
updated: 2026-11-05
external_refs: {}
tags: []
code_refs: ["scripts/handoff-retrieval.mjs", "bin/cli/handoff-retrieval.mjs", "tests/handoff-retrieval.test.mjs", "docs/handoffs.md"]
specs: []
started_at: "2026-11-05T13:45:23.237Z"
closed_at: "2026-11-05T22:01:31.957Z"
plan_updated_at: "2026-11-05T13:45:23.237Z"
---

# Outline packet files so bounded handoff requests target sections

| Field | Value |
|---|---|
| **Epic** | [WP-24](../epic.md) |
| **Status** | done |
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

- [x] Deterministic outline extractor, pure node: markdown ATX headings and
      top-level JS/MJS declarations (`export function|class|const`,
      `function`); any other file type gets no outline.
- [x] Attach the outline to the delivered payload, computed from the same
      verified bytes whose `sha256` the packet records; bounded per file and in
      total, counted inside the existing 16 KiB payload limit.
- [x] Response-contract text tells the receiver the outline exists and is
      advisory; range requests stay exactly as they are.
- [x] Deterministic tests: headings/declarations, CRLF and BOM, empty and
      outline-less files, truncation at the bounds, stale file refused as before.
- [x] One retained native example on the same task with and without outline:
      request rounds, fragment bytes, answer correctness, native counters.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

Decided at plan (waypost-planner, fresh context): the outline lives in the
retrieval payload, not in the packet. The packet schema is strict and versioned,
its content is caller-written and would have to be recomputed anyway, and old
packets need delivery-time computation regardless. Only
`prepareHandoffRetrieval` adds it, so V1 one-shot payloads, bindings and the
benchmark driver stay byte-identical.

1. `scripts/handoff-retrieval.mjs`: share packet references, verified text and
   LF splitting between `readHandoffRequests` and the outline (same error codes
   and order); `OUTLINE_LIMITS`; pure `outlineLines(path, lines)`;
   `attachOutline` after the request grammar, greedy in packet order, skipping
   inline documents, non-UTF-8 and non-md/js files; key and contract sentence
   only when at least one file is outlined.
2. `rebuildHandoffRetrieval` passes `outline: Object.hasOwn(payload, 'outline')`
   so states prepared before this change keep their round identities.
3. Tests in `tests/handoff-retrieval.test.mjs`; the paragraph in
   `docs/handoffs.md`.
4. The native example needs the owner's go-ahead on calls and model.

Revised after the first waypost-reviewer pass: the outline is opt-in
(`"outline": true` in the request JSON; library default off) so the frozen
three-arm protocol driving `handoff continue` keeps its payloads; a later round
that cannot carry the outline drops it instead of failing after a paid
inference; entries are compact strings and the total is measured pretty-printed,
as CLI state stores it; only a 512-character line prefix is matched.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Each outlined file lists entries with a label and an inclusive LF line
      range that matches the bytes the host would return for that range. — evidence: tests/handoff-retrieval.test.mjs "outline ranges are exactly what the host returns…" (CRLF, BOM, no final LF, every entry re-read through readHandoffRequests); waypost-reviewer pass 2.
- [x] The outline is bounded (entries per file, label length, total bytes) and
      a truncated outline says so explicitly; the payload never exceeds the
      existing limit because of it. — evidence: OUTLINE_LIMITS in scripts/handoff-retrieval.mjs; later rounds drop it (prepareRetrievalRound); tests "…pretty-printed total…", "a later round that cannot carry the outline drops it…", "worst-case pretty-printed state…".
- [x] The outline is advisory, not an allowlist: every range request valid
      before stays valid, and stale/hash/UTF-8/range checks are unchanged. — evidence: readHandoffRequests keeps its codes and order (shared verifiedText/splitLines); the 35 pre-existing tests pass unchanged; cross-entry range test.
- [x] Outline labels are delivered as untrusted source data, like any other
      fragment, and grant no tools or authority. — evidence: outline sentence of the response contract; a tampered label fails rebuild with resume-context (test "the outline is opt-in…").
- [x] V1 one-shot delivery and packets created before this change behave as
      before. — evidence: no diff in scripts/handoff.mjs, scripts/handoff-delivery.mjs, bin/cli/handoff-delivery.mjs; outline is opt-in and an outline-less payload is byte-identical; states resume with the choice they were prepared with; tests/handoff-delivery.test.mjs green.
- [x] A retained native example reports rounds, fragment bytes and native
      counters with and without outline; no token saving is claimed without
      complete counters and an equally correct answer. — evidence: owner-approved
      live run 2026-11-05 (Claude 2.1.296, observed `claude-sonnet-5-5`, fresh
      read-only contexts, every call settled with complete coverage; ceiling 7
      calls / 80000 tokens, prior budget policy restored). Same task: the
      escalation code of one section of a 592-line, 24582-byte handbook (line
      450), two decoy files, nothing inlined. Without outline: one round, the
      receiver asked for `docs/handbook.md` 1-200 (8211 bytes), refused
      fail-closed as `handoff-retrieval-fragment-limit`, no answer, 3133 tokens.
      With outline: round 1 asked for exactly the listed range 425-466 (1736
      bytes), round 2 answered correctly; 2 rounds, 7761 cumulative payload
      bytes, 3604 + 4402 = 8006 tokens. Control 2035; total 4 calls, 13174
      tokens. The answers are not equally correct, so no saving is claimed; one
      example, not a measurement of how often blind requests fail. Machine-local
      evidence: `~/.local/state/waypost/experiments/wp24-outline-20261105-62d93d84-c91d-4bfe-bef7-5a5187666bf1/`
      (`live-results.json`, `study.json`, drivers in `evidence/`).

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

`handoff continue` accepts `"outline": true` in the request JSON. The first
retrieval payload then carries an advisory table of contents of the packet's
non-inlined markdown/JS files: `"start_line-end_line bytes label"` entries on
the same LF lines and verified bytes the host serves, bounded per file and in
total, dropped from a later round that cannot carry it. Off by default, so
existing payloads, V1 one-shot delivery and resumed states stay byte-identical.
Implemented in c6af106 (`scripts/handoff-retrieval.mjs`, CLI task key,
`docs/handoffs.md`); two waypost-reviewer passes; focused retrieval and delivery
suites green (the state-file cap found on the way was fixed separately in
b240580). The live example shows the failure the outline exists for: a blind
200-line request overran the 8 KiB fragment limit, while the outlined receiver
asked for the exact section and answered. Follow-ups: no CLI test for the
`outline` key yet; ranking `waypost search` by section is a separate idea.

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
