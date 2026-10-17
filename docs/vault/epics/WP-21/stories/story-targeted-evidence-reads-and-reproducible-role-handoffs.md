---
type: story
id: "story-targeted-evidence-reads-and-reproducible-role-handoffs"
epic: "WP-21"
title: "Targeted evidence reads and reproducible role handoffs"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-17
updated: 2026-10-17
external_refs: {}
tags: []
code_refs: ["agents/planner.md", "agents/critic.md", "agents/reviewer.md", "skills/waypost-review/SKILL.md", "tests/harness.test.mjs", "docs/how-it-works.md"]
specs: []
started_at: "2026-10-17T22:27:22.393Z"
closed_at: "2026-10-17T22:33:48.192Z"
plan_updated_at: "2026-10-17T22:27:22.393Z"
---

# Targeted evidence reads and reproducible role handoffs

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Role prompts currently encourage whole changed-file reads and broad derived-view orientation. Apply the existing ADR-0008 pull-context policy to planner, critic and reviewer without weakening verification. A compact caller handoff identifies original requirements and revision; each role independently expands evidence where needed. No model change, CLI feature, mandatory index dependency or live model benchmark.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Replace redundant whole-file/derived-view guidance in the three role bodies with targeted evidence discovery and freshness rules.
- [x] Document a compact reproducible handoff in the review skill and user documentation.
- [x] Verify rendered/distributed bodies and unchanged standing-context budgets; record limits without claiming measured token savings.

## Implementation Plan

<!-- Written at the work-start gate (waypost story plan), AFTER studying the
     codebase. When a spec covers this story, this is a thin route through the
     spec's contracts: which contracts, in what order, which files. -->

Replace the reviewer whole-changed-file mandate with independently inspected status/diffs, relevant surrounding symbols and contracts, expanding to full files whenever needed. Replace critic/reviewer derived-view orientation with `waypost search` and `waypost graph --for`. Add the same short targeted-evidence procedure to all three role bodies: search/index first where available, validate freshness of pointers/results, reuse evidence only within this context while the source is unchanged, expand when context is insufficient, and summarize successful logs with errors/counts/path while retaining full logs locally. Preserve all role-specific verification and acceptance phases.

Add a compact handoff template to the existing review skill (body only): goal/artifact and original AC/spec links, base/head + dirty state, relevant paths/symbols, diff selection, validation command/results/log path. Identify dirty inputs (including untracked files) with content hashes or a retained patch/manifest, and bind validation evidence to the checked snapshot. Missing identities/log bindings are explicitly unverified, never green proof. Missing fields prompt independent discovery, never skipped verification; caller conclusions are not evidence. Document it adjacent to existing context-spend guidance. Do not add a command or generic handoff service.

Use existing harness render/show/skill-install fixtures to verify distribution of the actual procedure and preservation of independent-review access. Run existing standing-context budgets and the focused harness suite; no live pilot without a numeric owner allocation. Reinstall the affected roles/skill through the CLI for harnesses already in use, preserving foreign files and model config. Record static distribution checks separately from any future quality/token comparison.

The fresh-context planner confirmed these source boundaries and existing fixtures. The independent critic approved the revised plan after requiring dirty/untracked identities and checked-snapshot binding for logs; these are now explicit in the roles, skill and documentation. The role-specific additive spec acceptance block remains unchanged.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Planner, critic and reviewer use index/search pointers, then relevant symbols/ranges; derived views are queried through graph/search. Unchanged evidence is reused only within the same role context after checking file identity; branch/revision/file changes or uncertainty require refresh. — evidence: agents/planner.md:18; agents/critic.md:22; agents/reviewer.md:25
- [x] Reviewer independently reads status/diffs and sufficient surrounding contracts/dependencies; whole-file reads remain allowed when needed. All existing acceptance/spec checks, technical-claim verification and fresh-context separation remain. — evidence: agents/reviewer.md:17; agents/reviewer.md:43; agents/critic.md:19
- [x] Review handoff names task/artifact, original criteria, base/head and dirty state, dirty/untracked input identities, paths/symbols, diff selection and relevant validation command/log bound to the checked snapshot. Pointers are leads, not trusted conclusions; roles can expand scope and missing fields do not disable review. — evidence: skills/waypost-review/SKILL.md:18
- [x] All role-file harness renderers and CLI show preserve the policy; shipped skill installation preserves the handoff. Existing standing-context budgets pass without changing summaries/descriptions/routing. — evidence: tests/harness.test.mjs:296; tests/harness.test.mjs:749; tests/harness.test.mjs:978; tests/harness.test.mjs:1476; /tmp/waypost-context-20261017/harness-tests.log
- [x] Documentation and final evidence distinguish policy/distribution verification from actual task-token savings; no live benchmark is run without an owner-set numeric budget. — evidence: docs/how-it-works.md:247


## Final Summary

Replaced unconditional whole-changed-file/derived-view orientation with targeted evidence discovery and explicit expansion to contracts/dependencies/full files when needed. Added a compact caller handoff with dirty/untracked input identities and checked-snapshot validation binding. Independent fresh-context acceptance/spec verification remains mandatory. Source summaries, frontmatter, model policy and routing were not changed; existing generated copies were refreshed via CLI.

Validation: targeted harness suite 112 passed / 0 failed, exit 0; full body distribution, CLI show, review skill installation and existing standing-context budgets passed. Independent fresh-context reviewer accepted all five criteria on 2026-10-17, verified source hashes and generated parity, and found no remaining issues. Doctor has no issues; existing WP-18 code_ref warnings remain (sandbox process-table warning is environment-dependent). `git diff --check` is clean.

Limits: macOS fixture/CLI validation only, no full npm suite or Windows/Linux runtime check. Policy delivery is confirmed; actual agent compliance, quality parity and token savings await a fixed-cohort comparison with an owner-set numeric allocation. The proposed module split was not implemented or accepted.

## Technical Notes

Only role/skill bodies changed; their frontmatter, summaries, model selection and routing block remain unchanged. Existing Claude, Codex and OpenCode copies were regenerated using `waypost agents install --harness claude,codex,opencode` and `waypost skills install --harness claude,codex,opencode`, not edited by hand. Other harness formats are covered by renderer fixtures.

Validation inputs are fingerprinted in `/tmp/waypost-context-20261017/inputs.json`; the full targeted log is `/tmp/waypost-context-20261017/harness-tests.log`. These local scratch files contain no transcript bodies and are not committed. Tests check complete-body delivery and standing-context limits; they do not prove agent compliance, quality parity or a percentage reduction in tokens. The module-split ADR remains proposed. A live paired benchmark and its numeric owner allocation remain separate follow-up work.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-17*
