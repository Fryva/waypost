---
type: story
id: "story-avoid-repeated-repair-commands-in-adjacent-next-actions"
epic: "WP-21"
title: "Avoid repeated repair commands in adjacent next actions"
status: done
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-25
updated: 2026-10-25
external_refs: {}
tags: []
code_refs: ["bin/cli/status.mjs", "tests/harness.test.mjs", "tests/scripts.test.mjs", "docs/cli-reference.md", "tests/fixtures/next-script-responses.mjs", "tests/fixtures/next-action-cases.json"]
specs: []
started_at: "2026-10-25T17:08:23.974Z"
closed_at: "2026-10-25T17:23:21.096Z"
plan_updated_at: "2026-10-25T17:08:23.974Z"
---

# Avoid repeated repair commands in adjacent next actions

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | done |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

Next can repeat one repair command under several adjacent diagnostic findings. Reduce that repeated text while keeping every selected action, its order and an exact copyable command under accepted ADR-0008.

## Decomposition

- [x] Fold only adjacent identical executable repair commands after ranking and top-eight selection.
- [x] Pin grouping boundaries, command identity, advice/singletons and overflow with controlled script responses plus a real vault check.
- [x] Freeze baseline/current source/output, run admitted tests and independent review.

## Implementation Plan

Independent planner confirms renderer-only change in handleNext after items.sort. Select visible=items.slice(0,8) first. Scan contiguous runs with identical priority and how; fold only nonempty how beginning waypost and run>=2. Keep every original what bullet byte-for-byte and order. For a folded run print a separate indented For these N: line, then the original exact executable command line unchanged; never append prose to a runnable command. Singletons/advice/null and nonadjacent/different-priority commands keep original output. Overflow uses original items.length. Bare waypost intentionally inherits same next rendering within unchanged header/footer. Do not change doctor/sessions/ready calls or JSON, ranking/selection/truncation/repairFor/status/exit policy. Use child-only Node preload to stub exactly those three script responses, delegating all other spawnSync calls, to cover grouping/data boundaries without new production exports/seams; record calls and payloads. Add native-vault repeated guard findings check and retain existing leadClause/ranking/budget regressions. Compare before/after next/bare, exact unchanged scenarios and preserved bullets/commands; inverse entire status source. Heavy tests source-bound then fresh reviewer; no new flags/ADR/native pilot.

## Acceptance Criteria

- [x] All selected what bullets, their text/order and eight-item cap remain identical; overflow counts original actions. — evidence: bin/cli/status.mjs:68; comparison.json.
- [x] Only adjacent same-priority equal nonempty waypost commands fold; label counts visible run and original command remains on its own executable line. Singletons/advice/null/different priority/nonadjacent cases unchanged. — evidence: bin/cli/status.mjs:72; next-action-cases.json.
- [x] Ranking, producers/JSON calls, repair mapping and error/empty/unbound behavior unchanged; bare command inherits grouping with original framing, status remains unchanged. — evidence: inverse whole status source; frozen controlled/native captures.
- [x] Controlled and real-vault frozen evidence, exact inverse-source proof and regression budgets pass through heavy admission; doctor0/0 and independent reviewer approval; no native-token/quota saving inferred. — evidence: validation.json; tests-attempt-2.log; final independent reviewer ship.

## Final Summary

Next prints all selected bullets unchanged, then one neutral For these N: label and one exact command for adjacent same-priority equal waypost commands. Grouping happens after selecting eight; singleton/advice/null/nonadjacent and overflow remain legacy. Bare waypost inherits this presentation within unchanged framing. No new flags/exports/policy/JSON changes. Doctor commands can diagnose without fixing, hence the neutral label required by critic.

Evidence: .waypost/experiments/wp21-next-command-runs-20261025/ contains14controlled cases xnext/bare: only3grouped cases differ,11exact; producer requests, statuses, bullets/order remain exact. Real nine-guard vault preserves doctor JSON/status and next/bare bullets/remainder; output674->577UTF8bytes,672->575characters. Initial sandbox-after added a process-table warning; retained separately, then both final A/B runs used identical permission to ps and doctor JSON matched. Whole status source inverses exactly to baseline8782437. Fixed eight-guard fixture145<=150characters. These measure text, not native-token/quota/workflow savings.

Heavy admission1 exit75 CPUbusy (no tests), attempt2 Node24.21.0 admitted240/240pass,0fail/skip,exit0,87.448s. Syntax/package/doctor0/0. Independent reviewer initially held runtime AC, final ship/no findings after verifying15current/13baseline/11dirty identities and command/manifest/log/package receipts. All decomposition/criteria met; live fixture/cache removed after review, receipts retained. Prior3CIpassed; follow-up CI checked after publication. No native pilot/allocation change.

## Technical Notes

This is presentation only under accepted compact-output policy. No new export/helper interface, flag, story-ref resolver or token allocation. Full story plan paths must stay: canonical EPIC/story refs are not accepted by the existing lifecycle CLI.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-25*
