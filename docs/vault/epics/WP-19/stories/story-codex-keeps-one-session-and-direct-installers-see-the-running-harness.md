---
type: story
id: "story-codex-keeps-one-session-and-direct-installers-see-the-running-harness"
epic: "WP-19"
title: "Codex keeps one session and direct installers see the running harness"
status: in-progress
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-01
updated: 2026-10-01
external_refs: {}
tags: []
code_refs: ["bin/waypost", "scripts/agents.mjs", "scripts/skills.mjs", "scripts/lib.mjs", "tests/harness.test.mjs", "tests/commits.test.mjs", "tests/predicates.test.mjs", "harnesses/codex.json"]
specs: []
started_at: "2026-10-01T00:38:26.583Z"
closed_at: null
plan_updated_at: "2026-10-01T00:38:26.583Z"
---

# Codex keeps one session and direct installers see the running harness

| Field | Value |
|---|---|
| **Epic** | [WP-19](../epic.md) |
| **Status** | in-progress |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

A live Codex session with no project marker is told by next to install roles, but direct agents/skills install only reads file markers and refuses. Codex desktop exports CODEX_THREAD_ID; ignoring it fragments session identity across shell processes when CODEX_SESSION_ID is absent.

## Decomposition

- [x] Direct installers include the running harness.
- [x] Codex thread identity survives distinct shells.
- [x] Verify the live loop and run fresh-context review — evidence: desktop temp loop, final critic ship; reviewer found no functional blockers.

## Implementation Plan

Use the existing marker detector plus validated detectHarness() only for install, preserving explicit --harness and the marker-only uninstall contract. Share the union helper between agents and skills; do not make the pure file-marker detector ambient. Add CODEX_THREAD_ID ahead of terminal identifiers, after explicit Waypost and existing harness ids. Cover no-marker install, mixed evidence, explicit override, neutral refusal, uninstall and shell-spawn identity. Pin brief self-install to the executable registry; report failed repairs while keeping orientation available. Restrict the status scan to the current harness. Replace the Codex role-format citation with the official vendor page; keep documented confidence until every live runbook condition holds.

## Acceptance Criteria

- [x] Direct agents/skills install in a marker-free live harness installs the named harness; explicit overrides and neutral refusal still work. — evidence: tests/harness.test.mjs direct installers tests (8/8 targeted regressions).
- [x] CODEX_THREAD_ID yields one session through distinct shells, with distinct threads separated and explicit ids taking precedence. — evidence: tests/predicates.test.mjs and tests/commits.test.mjs; two-shell baseline gave distinct PID ids before the fix.
- [x] brief repairs roles and skills despite foreign WAYPOST_HOME; repair failures are visible; current-harness status agrees with the full scan. — evidence: foreign-root, partial-repair and role-status regressions.
- [x] Targeted and full tests pass; doctor has no new issues; a fresh-context critic reviews OpenCode changes and the final diff. — evidence: npm test 816 pass / 0 fail / 5 skipped; regressions 8/8; final doctor outside sandbox 0 issues / 0 warnings; final critic ship after documentation repairs, reviewer AC1/2/3/5 met with no functional blockers.
- [x] Live Codex commands record codex attribution, preserve their own claim and release their own lease; sandbox limits are reported. — evidence: desktop run on 2026-09-30; direct install, brief, draft/plan, throwaway commit with codex/PS-1 trailers, own claim and lease release; doctor 0 issues/0 warnings. Setup was dry-run only, scoped tool approval allowed protected .codex writes; At that initial audit confidence remained documented; the later standalone runbook confirmed all conditions and promoted Codex to verified on macOS.

## Final Summary

Direct installers now agree with setup and next, Codex thread identity supplies the missing fallback, and brief self-install uses the executable registry with one-harness status scanning and visible partial-failure diagnostics. The fresh planner approved placement, preliminary critic approved the plan, and final critic returned ship after stale ADR/epic statements were repaired; reviewer found no functional blockers. Tests: 816 pass / 0 fail / 5 skipped, 8/8 targeted regressions; final doctor 0/0 outside sandbox. Live temp Codex loop reached codex/story commit trailers and released its own lease. The main repository is left uncommitted. The story is ready for its close gate; the OpenCode portion of WP-14 and proposed ADR remain open. Follow-up runbook verification on 2026-09-30 found a silent failed claim under sandbox protection; claimForStory now reports failed claim/release without undoing the story update. A new independent Codex session used this diagnostic to retry with scoped approval and held its claim. The claim/release regression passes; the complete runbook is documented in ops/verify-a-harness-live-the-whole-waypost-loop-in-one-session.md and Codex is now verified for macOS with --approve-for-me. The final full suite after this follow-up passed 817 tests, with zero failures and five skipped; the localized ps test now checks each snapshot independently to avoid process-churn races. The fresh-context runbook critic independently checked CLI evidence and returned ship with no open blockers.

## Technical Notes

The initial parent Codex tool probe supplied CODEX_THREAD_ID without CODEX_SESSION_ID, together with Codex sandbox env markers; later probes and subagent tools supplied both session-id variables. Preserve the existing session-id precedence: subagents inherit the parent session id and get their own thread id. In the parent, a later probe confirmed both raw ids and derived identities were equal; stability is not promised when callers arbitrarily change distinct id values. The sandbox denies ps and protected .git/.codex writes; scoped approved tool execution confirmed that process-table diagnostics clear outside it. Setup idempotence was confirmed in README-only Codex and empty neutral fixtures; the old memory hypothesis was not reproduced. The proposed setup ADR remains proposed. isHarnessDetected in cleanup still has unpinned registry reads; this audit did not reproduce a user-visible failure there and does not change cleanup policy.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-01*
