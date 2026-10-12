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
| **Status** | proposed; the choice is pending the owner |
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
| A. Machine-local budget record, checked at `reserve-v2` time, with per-vendor sub-caps | Enforced where calls are admitted; per-vendor units stay honest; survives new teams | A new file outside the team authority; needs its own locking and crash rules; blind to other machines |
| B. A run budget id pinned by every team's allocation | Reuses the allocation event; the link between teams is explicit in the log | Needs a pooled counter across authorities; a team that forgets to pin the id is unbounded; cross-team reads |
| C. Operator-only tracking, as today | No code | Already failed once (an overshoot hidden by leftover); depends on memory and discipline |

## Decision

Decision: pending owner choice. No option is chosen. This record stays `proposed`.

## Open questions

- Unit: one cap per vendor counter schema, or one number across vendors? One number
  hides the vendor difference noted above.
- Where it lives: inside each team's authority, a machine-local record, or the vault.
- What happens on exhaustion mid-run: refuse new calls only, cancel the work, or
  pause for the owner to raise the cap?
- Crash-uncertain calls: do they hold their full estimate until a new team is made,
  given that a crashed Host permanently blocks its counter today?
- Who may raise a run cap, and does raising it invalidate control policies, as an
  allocation raise does today?
- Does the cap cover calibration and identity probes, or only work and review?

## Consequences

Until the owner chooses, caps across teams are tracked by the operator. The ledger
does not enforce them, and the accounting ADR says so.

## References

- [[subscription-cli-token-accounting-with-separate-strict-billing-enforcement]]
- [[owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check]]

---

*Last updated: 2026-10-12*
