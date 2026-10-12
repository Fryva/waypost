---
type: adr
id: "enforce-the-owners-token-budget-for-live-runs-across-teams"
title: "Enforce the owner's token budget for live runs across teams"
status: proposed
date: 2026-10-12
authors: ["Ivan Morozov"]
tags: ["models", "subscription", "budget"]
external_refs: {}
supersedes: null
superseded_by: null
review_status: pending
reviewed_at: null
drafted_by: {"harness":"claude","provider":null,"date":"2026-10-12"}
guards: []
---

# Enforce the owner's token budget for live runs across teams

| Field | Value |
|---|---|
| **Status** | proposed; owner chose option A on 2026-10-12; critic re-pass accept-with-edits, edits applied; accepted with the implementation |
| **Date** | 2026-10-12 |
| **Authors** | Ivan Morozov |
| **Related** | [[subscription-cli-token-accounting-with-separate-strict-billing-enforcement]] |

---

## Context

The owner approves token budgets for a live run, not for one team. In WP-20 the
budgets came in steps that span several teams and three vendors: 150K, then +60K,
then +40K. About 235K of 250K is spent. Nothing enforces this total. The operator
tracks it by hand in Memory. One run overshot its step and fit only thanks to
leftover from an earlier step.

The v2 ledger enforces two layers: a per-team allocation keyed by team and native
counter schema (`validateNativeCounterUnit` in `scripts/team-subscription.mjs`), and
per-policy caps. It never pools across teams. A new team starts with a fresh
allocation, so a run that opens a second team has no running total.

Summing tokens across vendors is not comparable. The accounting ADR says: "Tokens from
different vendors or buckets are not automatically equivalent measures of quota
consumption."

## Decision drivers

- The owner's cap must hold across teams, not only inside one.
- Vendors count tokens differently, so one number may mislead.
- A crash must not silently free budget: uncertain calls keep their reservation.
- No new silent raise of a cap. Raises are owner events.
- Small change: no second ledger beside the team authority.
- Honest limits: a local record cannot stop other clients or other machines.

## Options considered

| Option | Pros | Cons |
|---|---|---|
| A. Machine-local budget record, checked when the Host admits a native call, with per-schema caps and an optional total | Enforced where calls are admitted; per-adapter units stay honest; survives new teams | A new file outside the team authority; needs its own locking and crash rules; blind to other machines |
| B. A run budget id pinned by every team's allocation | Reuses the allocation event; the link between teams is explicit in the log | Needs a pooled counter across authorities; a team that forgets to pin the id is unbounded; cross-team reads |
| C. Operator-only tracking, as today | No code | Already failed once (an overshoot hidden by leftover); depends on memory and discipline |

## Decision

The owner chose option A on 2026-10-12: a machine-local **admission cap** for live
runs, checked by the Host before it admits a native call. A critic pass the same day
returned revise; the owner then decided: caps per counter schema plus an optional
raw total, refusal of uncounted native calls while a budget is active, a team that
freezes at exhaustion, and one budget per machine covering every project.

1. **Record.** At most one budget file per machine, in Waypost's machine state
   directory (`run-budget.json`, no host name in the path). It holds a name, optional
   caps per counter schema (the adapter's `counter_schema`, e.g.
   `codex-thread-cumulative-total-v1`), an optional `total` cap, the owner events that
   set or changed it, and admitted entries. An entry is {authority realpath, team,
   invocation id, schema, estimate, holder pid, start time and boot id}, so the same
   team and nonce in two vaults never collide.
2. **Spending is derived, never written.** Spent and reserved are computed from each
   entry's invocation in its team authority, with the ledger's own charge rule
   (`totals` in `scripts/team-subscription.mjs`, extracted as one shared function):
   settled or reconciled count the charged tokens; prepared, consumed or uncertain
   count the estimate; aborted counts zero; an invocation absent from the authority
   counts zero only when its holder process is gone; an unreadable authority counts
   the estimate. Usage, reconcile and unknown-usage acceptance therefore settle the
   budget with no extra write, and a crash at any point can only over-count.
3. **Admission.** In `subscriptionSingleCall` (`scripts/team-host.mjs`), before the
   native endpoint starts (the call's schema is the adapter's static
   `COUNTER_SCHEMA`), under a machine-wide lock
   that is never held across a team mutation: if derived spent plus reserved plus the
   estimate exceeds the cap for the call's schema, or the total cap, the call is
   refused with `run-budget-exhausted`, naming the schema, the cap and the remainder,
   and no event is appended. Otherwise the entry is added. If the call fails before
   `subscription-reserve-v2` is recorded, the Host removes its own entry; after a
   crash the entry derives to zero by rule 2.
4. **Fail closed.** No file means no budget and today's behaviour. A file that exists
   but cannot be read or validated refuses every native call. When schema caps are
   set, a call whose schema has no cap is refused. If the lock cannot be taken or the
   entry cannot be written, the call is refused. A budget must hold at least one cap.
5. **Coverage.** Every v2 native call counts: identity probes, calibration, protocol
   control, leader and handover acknowledgements, delivery, work, plan and review.
   While a budget is active, native calls that do not go through the v2 ledger
   (`inspect`, `relay`, `review`, `dispatch`, `handover-control`, in any team) are refused. Not counted: the harness sessions
   that drive a run, and cooperative MCP or inbox participants.
6. **Exhaustion stops native calls.** Leader and handover acknowledgements are
   refused too; no team event is written, and the team stalls until the owner raises
   the cap or clears the budget. Calls
   already in flight finish, and their overshoot can exceed the cap: it is an
   admission cap, not a hard spending limit.
7. **Owner changes.** `waypost team budget set|clear` require `--yes --reason` after
   the owner answered in chat (the existing consent rule). This is procedural, not
   cryptographic: the file has no credential. Changing a cap never touches team
   allocations or policies. There is no release of an admitted call: unknown usage
   is never turned into zero (accounting ADR); calls that were never dispatched free
   themselves by rule 2.
8. **Visibility.** `waypost team budget status` shows per schema and in total: cap,
   spent, reserved, remaining.

Limits: the budget sees only calls admitted by Waypost on this machine. Other
machines, other clients and the driving sessions are not counted. The raw total sums
tokens of different adapters and is labelled "not quota-equivalent". Estimates are not
calibrated (the default is 16000; Codex probes settled at 18.5K and 19.2K), so caps
should leave room. An authority that later becomes unreadable (moved or deleted)
counts its entries at their estimates, which under-counts their overshoot.

## Open questions

Whether a budget should also bind a second machine through the vault is deferred
until a run spans machines.

## Consequences

With a budget set, the owner's admission cap holds across every team in every project
on this machine, per counter schema and optionally in total. A crash can only
over-count, never free budget, because spending is derived from the team ledgers.
An exhausted budget stalls a team until the owner raises it. The cost is one
machine-local file, a shared lock module and a refusal path in the Host. Without a
budget file, nothing changes.

## References

- [[subscription-cli-token-accounting-with-separate-strict-billing-enforcement]]
- [[owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check]]

---

*Last updated: 2026-10-12*
