---
type: story
id: "story-evidence-names-a-test-by-an-anchor-that-doctor-can-check-not-by-a-line-number"
epic: "WP-16"
title: "Evidence names a test by an anchor that doctor can check, not by a line number"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-11-07
updated: 2026-11-07
external_refs: {}
tags: []
code_refs: ["scripts/doctor-integrity.mjs", "scripts/doctor.mjs", "scripts/doctor-lifecycle.mjs", "templates/", "prompts/story.md", "skills/waypost-story/SKILL.md", "agents/reviewer.md", "tests/doctor-integrity.test.mjs", "tests/doctor-lifecycle.test.mjs"]
specs: []
started_at: "2026-11-07T04:35:42.467Z"
closed_at: "2026-11-07T05:36:50.816Z"
plan_updated_at: "2026-11-07T04:35:42.467Z"
---

# Evidence names a test by an anchor that doctor can check, not by a line number

| Field | Value |
|---|---|
| **Epic** | [WP-16](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A closed story's evidence names tests as `file:line`. Any insertion above that
line moves the test and the evidence silently points at something else: closing
the disk-space ADR's Decision 2 (b25c306) inserted 117 lines into
`tests/limit.test.mjs`, and the 17 WP-17 references had to be remapped twice by
hand — the reviewer still caught them one line off. 39 stories carry 175 such
references into `tests/`, and nothing checks any of them.

Evidence gains an anchor form: `<path>#"<literal>"` — a project-relative path
and a literal string that occurs in that file, normally the test's title (or a
prefix of it). It survives insertions, works for any language (a Rust `fn`
name, a Swift `func test…`, a JS `test("…")` title), and `waypost doctor`
checks it without a model: the file exists and contains the literal.
`file:line` stays legal (code locations, older stories); only the anchor is
checked.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] `checkEvidenceAnchors` in `scripts/doctor-integrity.mjs`, wired into `doctor`.
- [x] The convention in the story templates (all languages), `prompts/story.md`,
      the `waypost-story` skill, the reviewer role and the lifecycle warning.
- [x] Re-render the installed roles and skills.
- [x] Migrate the WP-17 story's `tests/limit.test.mjs` references to anchors.
- [x] Tests for the check.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

1. `scripts/doctor-integrity.mjs`: `checkEvidenceAnchors(artifacts, proj)` —
   every artifact body, lines outside fenced blocks, matched against
   `<path>#"<literal>"` (path: no spaces or `<>`); level by status as in
   `checkCodeRefs`. One read per file, cached per call.
2. `scripts/doctor.mjs`: call and re-export it next to `checkCodeRefs`.
3. Convention text: `templates/*/story.md.tmpl` (6 languages),
   `prompts/story.md`, `skills/waypost-story/SKILL.md`, `agents/reviewer.md`
   Phase 1, the `doctor-lifecycle.mjs` evidence warning; then
   `waypost agents install` and `waypost skills install`.
4. `tests/doctor-integrity.test.mjs` (or the file covering `checkCodeRefs`):
   the cases of the acceptance criteria.
5. WP-17 story: `tests/limit.test.mjs:<n>` → anchors by test title.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <path>#"<test title>" | <command> | <file>:<line> -->

- [x] `doctor` reports an anchor whose file is missing, or whose file does not
      contain the literal: an issue for an in-progress or done artifact, a
      warning otherwise (the `code_refs` precedent, ADR-0009).
      — evidence: tests/doctor-integrity.test.mjs#"evidence anchors: a missing file or a missing literal is reported, by status"
      (done, in-progress, planned; an accepted ADR warns); reviewer ran
      `waypost doctor --vault` on a scratch vault with a renamed test: ✖ evidence-anchor, exit 1.
- [x] An anchor that resolves, a `file:line` reference, a placeholder
      (`<path>#"<text>"`) and an anchor inside a fenced block or an HTML
      comment produce nothing.
      — evidence: tests/doctor-integrity.test.mjs#"evidence anchors: a missing file or a missing literal is reported, by status"
      (a prefix anchor, `file:line`, the placeholder, nested and `~~~` fences,
      a two-line comment, non-ASCII and `@scope` paths add nothing; checking
      resumes after a closed fence; a repeated anchor is reported once).
- [x] Templates, the story prompt, the skill and the reviewer role name the
      anchor form for tests; installed copies are re-rendered.
      — evidence: templates/en/story.md.tmpl:52 (the same line in de, es, fr,
      ru, zh), prompts/story.md:63, skills/waypost-story/SKILL.md:17,
      agents/reviewer.md:58 and :93; `waypost doctor`: install clean.
- [x] The WP-17 story's `tests/limit.test.mjs` evidence uses anchors and
      `doctor` is clean on this vault.
      — evidence: no `limit.test.mjs:<n>` left in the WP-17 story; the reviewer
      matched all 42 anchors (33 limit, 9 cleanup/sizes/toolchains) to the
      line each old reference named; `waypost doctor`: 0 issues, 0 warnings.

## Final Summary

<!-- Written at the done gate (waypost story close): what changed, why,
     tests executed, risks and follow-ups. -->

`<path>#"<literal>"` names a test by text that occurs in the file — its title
or a prefix — instead of a line number. `doctor` (`evidence-anchor`) checks
every anchor outside fenced blocks and HTML comments: the path must be a
regular file inside the project (4 MiB at most) that still contains the
literal; an issue for an in-progress or done artifact, a warning otherwise.
The templates (6 languages), the story prompt, the `waypost-story` skill and
the reviewer role (Phase 1 and its Output matrix) name the anchor; the
installed copies are re-rendered. The WP-17 story moved 42 references to
anchors; two that were already three lines off (`askYesNo`) and AC3's text
(the 1-day floor) were corrected on the way.

Tests: harness, doctor-integrity, doctor-lifecycle, scripts and limit 355/355
through `waypost run --heavy` after the review fixes; the full `npm test`
before them: 2581 pass, 10 skipped, 1 failure — a byte ceiling of
`bin/cli/auto-clean.mjs` from b25c306, fixed in 1e6b96c.

Not done, by choice: paths with spaces (documented), a `(deleted)` escape for
a test removed on purpose, a warning for a literal that occurs more than once
or an anchor wrapped onto the next line.

Follow-up (2026-11-07): the other stories and one ADR moved to anchors too —
228 references in 36 files. Each reference was resolved against the commit
that wrote its line (`git blame HEAD`), to the test enclosing that line there,
and became an anchor only when the current file still has that title. 18 stay
`file:line`: helpers and lines outside any test (13), tests renamed since (5).

## Technical Notes

<!-- Implementation hints, constraints, gotchas. -->

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-11-07*
