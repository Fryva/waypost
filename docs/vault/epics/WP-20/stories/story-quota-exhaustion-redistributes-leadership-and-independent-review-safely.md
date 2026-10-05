---
type: story
id: "story-quota-exhaustion-redistributes-leadership-and-independent-review-safely"
epic: "WP-20"
title: "Quota exhaustion redistributes leadership and independent review safely"
status: in-progress
priority: p1
assignee: "Ivan Morozov"
created: 2026-10-01
updated: 2026-10-02
external_refs: {}
tags: []
code_refs: ["scripts/native-model-profile.mjs", "scripts/team-host-registry.mjs", "scripts/team-host.mjs", "scripts/team-native-action.mjs", "scripts/team-native-quota.mjs", "scripts/team-owned-runtime.mjs", "scripts/team-quota-native.mjs", "scripts/team-quota.mjs", "scripts/team-state.mjs", "scripts/team-subscription.mjs", "scripts/team-transport.mjs", "scripts/team-workflow.mjs", "scripts/team.mjs", "tests/helpers/native-calibration.mjs", "tests/helpers/native-protocol-host.mjs", "tests/native-protocol-handover-host.test.mjs", "tests/native-protocol-handover.test.mjs", "tests/native-protocol-quota.test.mjs", "tests/team-host-registry.test.mjs", "tests/team-host.test.mjs", "tests/team-owned-runtime.test.mjs", "tests/team-quota-native.test.mjs", "tests/team-quota-state.test.mjs", "tests/team-quota.test.mjs", "tests/team-transport.test.mjs", "scripts/team-store.mjs", "tests/team-store.test.mjs", "scripts/team-cli.mjs", "tests/team-model-inventory-cli.test.mjs", "scripts/team-diagnostics.mjs", "scripts/team-role-calibration.mjs", "tests/native-protocol-host.test.mjs", "tests/team-diagnostics.test.mjs"]
specs: ["cross-harness-team-coordination-protocol"]
started_at: "2026-10-02T00:57:09.984Z"
closed_at: null
plan_updated_at: "2026-10-02T00:57:09.984Z"
---

# Quota exhaustion redistributes leadership and independent review safely

## Description

The strongest provider account can run out of quota while other models remain
available. Continue under the strongest available coordinator and independent
critic with verified quota evidence and safe handover.

## Implementation Plan

Trusted provider observations and pure quota eligibility live in team-quota.mjs.
Versioned collector events apply them under the existing journal/publication
fence. Model ranking remains in team.mjs; team-state derives the quota-adjusted
review floor without deleting historical identities. Host failures/watch update
confirmed quota availability and trigger existing acknowledged handover.

## Acceptance Criteria

- [ ] Only exact current collector/provider records can exhaust or restore quota.
- [ ] Exhausted coordinator yields to the strongest available remaining model.
- [ ] Independent critic selection preserves historical strength except verified
      quota exhaustion; revocation, silence or price cannot lower the floor.
- [ ] A healthy same-model peer retains the strongest review requirement.
- [ ] Returning stronger models require acknowledged handover and fresh review.
- [ ] Reset/expiry alone cannot restore quota; no eligible models produces pause.
- [ ] Consumed work/charges remain quarantined until stopped/invoice evidence.
- [ ] Live provider refusal/recovery and desktop behavior are verified separately.

## Technical Notes

ADR automatic-role-redistribution-on-verified-model-quota-exhaustion is proposed.
The owner explicitly requested automatic quota redistribution; fresh criticism
and runtime evidence must precede claiming this story complete.


### Native protocol-only quota handover (2026-10-04)

An additive owner policy now accepts provider-confirmed quota observations bound
to an authority-owned settled action, its admitted native profile and an exact
known billing route/account generation. Source method, code, scope, status and
interpretation documentation must match the installed collector rule. Unknown
billing, generic HTTP 429, timeouts, busy state and local token ceilings cannot
establish provider exhaustion. Negative observations remain sticky; expiry or
reset clocks do not restore eligibility. Separate positive provider evidence is
required. Advertised model authorship and hidden reasoning remain unknown.

The protocol transition freezes new identity/calibration/control admission, stops
all enrolled old-epoch native scopes and requires callback-drained, process-group
closure evidence from each participant's own runtime collector. Consumed
subscription calls remain in stop coverage even after terminal accounting;
historical calls without operation journals block handover. Preparation refuses
outstanding generic work or unresolved usage and retains the historical typed
review floor. Missing an independent current critic at that floor pauses transfer.
A separately bounded fixed ACK executes in a provisional target runtime epoch,
while accounting remains bound to the old authority epoch. Atomic capture checks
current policy/quota/frontier/transition, actual settled profile and own closure.
Recovery reads the original seal without new inference. Generic execution,
review and integration permissions are not granted. Account-wide exhaustion also
excludes verified aliases and actual new billing contexts on the same account.
Only account scope is supported. Same-meaning refresh retains the prepared
election sample; material changes after consumption pause with charges retained.
Automatic old-leader reactivation remains explicitly unsupported.

Independent fresh-context criticism returned scoped ship after fixing Host
bindings, account-wide exhaustion, expiry and interrupted-capture refresh.
The gated 16-file regression initially passed 202/210 cases in 128.674 seconds.
Seven Host cases exposed a registered-fixture vault binding omission, and one
quota case exposed missing comparison against the original billing context.
Both fixes passed another independent critic. The final affected three-file
run passed 23/23 in 280.207 seconds; the other 187 cases passed unchanged.
Owned-runtime/authority tests use mocked provider transport, not live inference. Provider collection is an installed trusted Host capability; the
current CLI has no verified typed provider observer and returns an explicit
unsupported blocker. Hermetic provider fixtures are not live provider refusal
or live cross-harness/desktop transfer. Full story acceptance remains open.

### Same-leader recovery implementation plan (2026-10-04)

Add an explicit optional owner policy for recovery after confirmed exhaustion.
Pin the original old coordinator binding and account exhaustion when freezing.
Require a fresh ordered positive provider proof, all enrolled scope stops, idle
accounting and unchanged strongest independent review before a new target epoch
ACK. Preserve default pause and historical event shapes without the opt-in.
Bind recovery evidence in the prepared transition and fixed request, recheck at
consume/capture, and recover interrupted publication without another inference.
Equivalent refresh must not extend pinned positive expiry. Independent criticism
and reducer/registered Host tests precede implementation claims or completion.

The implementation now keeps an immutable first-freeze basis and binds it with
the original ordered positive account proof in the new-epoch ACK. An epoch-wide
consumed latch prevents a second ACK across candidates/nonces. Independent review
found and corrected account-alias refresh cases that could hide a newer provider
exhaustion; the guard also covers opted-in transfers to another coordinator.

The first six-file run passed 54/60 in 425.513 seconds. Four new alias fixtures
used ACK output for an audit and were corrected to the exact audit response.
Two new registered Host cases correctly refused recovery when authority replay
CPU time exceeded the original 30-second proof age. Their positive-path rerun
uses a controlled Date clock, with a separate tick between exhaustion and recovery;
production expiry checks are unchanged. The seven existing Host cases retain
real wall clocks. Original proof-age rejection at reserve, consume and capture
passed. The complete affected reducer file then passed 17/17 in 9.454 seconds;
the two controlled-time Host cases passed 2/2 in 113.417 seconds. The other 41
cases passed unchanged in the initial run. Independent code and fixture review
returned scoped ship; there is no demonstrated wall-clock recovery within the
original 30-second bound on this ledger. Doctor reported 0 issues/0 warnings;
`next` and `git diff --check` showed no consistency failures. The quota story
and WP-20 remain in progress.
Provider transport remains mocked; this is not live provider recovery evidence.

### Authority replay latency plan (2026-10-04, Claude Code)

Measured cause of the 30-second recovery gap: a CPU profile of the registered
recovery Host case (51.9 s) spends 47.2 s inside `readAuthority`, which every
Host load and mutation calls. Each read re-runs the reducer over the whole log
and, per event, clones, re-serializes and digests the entire state, and checks
duplicate requests in quadratic time. The cost grows with ledger length times
state size, so a longer real ledger cannot meet the provider proof age.

Plan: keep replay authoritative but make it incremental within one process.
`team-store.mjs` caches, per authority root and reducer function, the verified
revision, state, last hash, request index and a SHA-256 of each verified event
file's raw bytes. Every read still performs all path, symlink, identity and
sequence checks and re-reads every event file; an unchanged byte digest of the
already-verified prefix skips only its per-event checks and reducer. Any changed,
missing or extra prefix byte, identity change or different reducer discards the
cache and falls back to the existing full replay with its existing errors. New
events are verified and reduced exactly as before. Readers receive a clone of
the state; cached request entries are deep-frozen and idempotent replies are
cloned. Duplicate request detection uses a set. The cache is bounded and holds
no secrets beyond the state already on disk. Proof age, refresh and expiry rules
are unchanged. Done when the store tests, including corruption after a cached
read, pass and the registered recovery Host cases pass with real wall clocks
inside the original 30-second bound.

Fresh-context criticism of the plan returned revise: verify reducer purity with
an uncached replay, publish the cache only after a complete read, keep per-file
symlink checks on cache hits, test tampering after a warm read and assert a
timing margin. All are implemented. Store tests cover command, hash, identity,
symlink-to-identical-bytes, renamed and duplicated prefix files after a cached
read (refused on every later read), truncation, whitespace rewrites, foreign
appends, caller mutation, interrupted mutations at revision one, and a forged
duplicate-request or non-JSON tail refused on warm and cold reads (35/35).
An independent reviewer compared HEAD and new replay on 23 tampered logs: both
accept and refuse the same ones; it returned ship after these two tests. The two
recovery Host cases dropped the controlled Date clock and pass on real clocks,
asserting completion within 15 seconds; each handover Host case now takes about
5 seconds against 52 seconds for one recovery case before, and the file passed
9/9 within the full suite. Full `npm test`:
1330 passed, 5 skipped, one failure in `tests/slots.test.mjs` caused by this
session's `FORCE_COLOR` environment, which passes when it is unset.

### Codex typed provider-account observer plan (2026-10-04, Claude Code)

Gap: protocol-2 quota sources need known billing on the settled admitted call
(`mode` subscription or free, `paid_fallback: false`, `credit_availability:
"unavailable"`, account digest, origin, SKU, auth method), but the Codex
transport reports mode, paid fallback and credits as unknown, so no live call
can ever become a quota source; and the Host has no built-in observer.

Live metadata (Codex CLI 0.160.0, no thread or inference): `account/read`
returns `type: chatgpt`, `planType`, `workspaceRouting.chatgptAccountId` and
`backendOrigin: https://chatgpt.com`; `account/rateLimits/read` returns a typed
account permission `ordinaryUsageAllowed`, per-bucket `rateLimitReachedType`,
`spendControlReached`, `individualLimit`, `credits {hasCredits, unlimited,
balance}`, `rateLimitResetCredits.availableCount` and the same `accountId`.

Plan:
1. Codex `captureAccountingMetadata` also reads `account/rateLimits/read` on the
   same peer. Only when its `accountId` equals the routing account, the auth
   method is `chatgpt` and the account bucket reports no credits (`hasCredits`
   and `unlimited` false, balance absent or zero) does it report `credit_availability: "unavailable"` and
   `paid_fallback: false`; `mode` is `free` for the free plan and `subscription`
   for known paid plans. Anything else keeps those fields unknown. Usage
   percentages and reset times are never read as availability or exhaustion.
2. A built-in protocol-2 observer in `team-quota-native.mjs` starts its own
   metadata-only app-server (no thread or turn), reads account and rate limits
   twice with account continuity, and requires the hashed account, origin and
   plan to equal the source binding's billing. Account scope only:
   `available` needs `ordinaryUsageAllowed: true`, no bucket with a reached
   type, spend control or individual limit, and no credits; `exhausted` needs
   `ordinaryUsageAllowed: false` and the account bucket's reached type an
   account-wide reason (workspace usage or credits, or
   `rate_limit_reached` on the model-agnostic bucket), and no credits or reset
   credits. Everything else refuses. The proof cites the method, a fixed
   evidence kind, the reached type (or `ordinary-usage-allowed`) as provider
   code, the billing origin as source and the Codex app-server documentation,
   expires 60 seconds after observation and is exported with the matching
   owner source rules so the owner installs exactly them.
3. The Host uses this observer by default for Codex participants; other
   harnesses keep `host-native-protocol-provider-observer-unsupported`.
Done when hermetic tests cover each refusal and both statuses through the
Host's existing capture, the transport reports known billing only from the
typed fields, and live metadata on this machine shows the transport billing
and an `available` proof. Live exhaustion and recovery are not claimed.

Plan revision after fresh-context criticism (revise): known billing also needs
the thread's own provider to be `openai` with `requiresOpenaiAuth`, because a
custom provider can route inference elsewhere under a ChatGPT login; only
personal plans qualify, because a workspace routing id is shared by members
with separate limits; the account bucket is identified by `limitId: "codex"`,
not by the display slug; repeated maps compare canonically; semantics are
pinned to the app-server version; positives are dated at the start of their
reads and negatives at the end. Deferred to a follow-up: protocol-2 renewal of
an `available` lease without revision churn (a new command type, so existing
replay is untouched) and cross-host clock ordering.

Implementation (3a): Codex transport billing, `observeCodexProtocolAccountQuota`
with `codexAccountQuotaSourceRules`, the Host default for Codex, and canonical
comparison in the legacy collector (whose metadata process is now shared).
Hermetic tests: Codex billing known only on the exact conditions (nine unknown
variants including `openai_base_url`, model buckets with null or present
credits, account mismatch and failed read abort); observer availability, both
exhaustion codes, a reached model bucket beside the account bucket, fifteen
refusals, one percentage-only positive case, a stale read and key-order
independence; the legacy collector's canonical comparison (mutation-checked);
the Host's observer selection and its use of the Host spawn (the clock is passed
but not exercised by that test); and one
Host case that drives the exhaustion handover from the built-in observer under
the exported rules through the real capture. Live on Codex 0.160.0 (2026-10-04T16:26Z and, after the review fixes,
16:47Z, no inference): known subscription billing and an `available` proof.
Live exhaustion is not claimed. Independent code review returned revise: an
`openai_base_url` reroute, model-bucket credit shape, untested refusals and
Host wiring, and reset-credit detail reads; all are fixed above. Full `npm test`
before those fixes: 1365 passed, 0 failed, 5 skipped; after them: 1368 passed,
0 failed, 5 skipped. A delta review of the fixes returned ship.

### Available lease renewal plan (3b, 2026-10-04, Claude Code)

Gap: an `available` provider-account proof expires 60 seconds after its
observation. After that its participant is ineligible for election and
`assertNativeBillingQuotaEligible` refuses context capture, reserve and consume
on that account, so a healthy coordinator stops working a minute after a
positive proof. Capturing a new positive through the existing command bumps
`native_quota_revision` and `quota_revision`, which invalidates bindings and
approvals on every renewal; changing that command's semantics would break replay
of existing ledgers.

Plan: a new reducer command `native-protocol-quota-renew-v2` (old events replay
unchanged) accepts, from the participant's bound collector, a fresh validated
observation whose status is `available`, whose binding is the current proof's
binding and whose proof differs from it only in observation id and clocks, with
a strictly later observation time, while the current proof is still unexpired,
no quota freeze or unapplied handover exists, and the account record is not
exhausted (stickiness holds). It replaces the participant and account records
and recomputes account exclusions without changing quota revisions, election,
candidates or review state. A lapsed lease, any other status or any change of
meaning goes through the existing capture. The Host renews before a
subscription call when the lease has 30 seconds or less left, using the
binding's source invocation and its observer; a renewal observation that shows
exhaustion is captured through the existing command so it is never lost.
Done when reducer tests cover acceptance and each refusal (lapsed, freeze,
other status, changed binding or meaning, older observation, exhausted account,
wrong collector) with unchanged revisions and replay, and a Host test renews
before a call and records an exhaustion found during renewal.

Plan revision after fresh-context criticism (revise): the Host hook moves to
each entry point before the action request is built and outside any operation
(the observer is not supervised by one); nothing observes under a freeze or
unapplied handover, keeping renewal out of the 30-second reactivation window;
a refused renewal never falls back to capture; renewal is refused unless every
participant's account keys, available keys and eligibility stay the same;
ordering is checked against the stored participant and account histories, and
renewal writes both; a same-meaning positive from `native-quota-observe` also
renews, so idle Hosts can stay eligible on a schedule.

Implementation (3b): `renewNativeQuotaLease` and the
`native-protocol-quota-renew-v2` branch in `scripts/team-native-quota.mjs`
(registered as deferred in `team-state.mjs`); `ensureNativeQuotaLease` and
renewal routing in `scripts/team-host.mjs`. The renewal threshold is 50 seconds
left, not the 30 seconds of the first plan, so a 60-second lease is renewed
before it can lapse during a long observation.

Diff review (fresh context, revise) found that the entry hook could still
capture a positive when the lease lapsed during observation, that Host routing
compared only the binding while the reducer checks the full meaning, and that
the bootstrap test could not fail. Fixes: the Host routes by running the
reducer's own renewal on a copy of the state; the entry hook is renew-only and
refuses with `host-native-quota-lease-lapsed` or
`host-native-quota-lease-not-renewable` without any mutation; renewal also
refuses a reused observation id.

Reducer tests: renewal keeps revisions, election and review state and extends
eligibility; ten refusals (lapsed, exhausted status, equal time, reused id,
wrong collector, exhausted account, freeze, unapplied handover, policy revision,
eligibility change) each leave the lease and revisions unchanged. Host tests: a
repeated positive renews without a revision change; a bootstrap entry's first
mutation is the renewal and the lease id changes with revisions unchanged; more
than 50 seconds left starts no observer; a lapsed lease, a lease lapsing during
observation and a reused id each refuse with no mutation; an exhaustion found at
the entry is captured, freezes the team and refuses the call without a send, and
no observer starts under the freeze.

### Scheduled lease renewal (3c, 2026-10-04, Claude Code)

Gap: before this, `team watch` on a protocol 2 team never observed provider
quota, so an idle participant's positive lease lapsed a minute after its proof.
Now each pass calls `maintainNativeQuotaLease` on the bound Host of every
present participant holding an `available` lease and drives the handover after
an exhaustion it captures.

Diff review (fresh context, revise) found that skipping leases with more than 50
seconds left plus a fixed 30-second sleep and a slow pass could let a lease
lapse, after which the same pass re-elects or pauses; that a concurrent renewal
made the loser fail; that writing the owner check every pass multiplied lock
time; and that the CLI path, free-text blockers and the stored handover result
were untested or too large. Fixes: a scheduled pass renews any unexpired lease
(entries keep 50 seconds) and the next pass starts 30 seconds after this one
began; a renewal refused after another process renewed reports
`renewed-concurrently`; skips name a reason; the owner check is written at the
owner's interval or when a pass has something notable; blockers are codes only;
the stored result is a compact summary.

Tests: a scheduled pass renews a 60-second lease without a revision change; a
renewal losing to another Host process is not an error and the winner's lease
stays; an exhaustion is captured and the handover is driven to a new leader with
the review floor kept; the CLI refresh asks only the leased participant's Host
and stores its named blocker under `strength_check.native_quota_inspections`,
and records an empty list without a policy. Not covered: an exhaustion with no
unapplied transition and a failed drive on this path. Through the CLI only Codex
has a built-in observer, so only Codex participants can hold a lease to renew.

Delta review (revise, one should-fix): the `renewed-concurrently` path accepted
any observe failure, so an exhaustion whose capture lost the authority race to
a concurrent positive renewal would be dropped and the entry would proceed. Now
only errors of this Host's own positive observation may be treated as a lost
renewal; a test injects a stale-revision capture during a concurrent renewal
and the error propagates. Also: the check is rewritten only when non-routine
findings change, `lastNativeCheck` advances only after a successful write, the
throttle applies only with a native quota policy, a coded ACK blocker is kept
in the summary and upper-case system codes are kept as blockers.

Note (2026-10-04): with Claude admitted to calibration and control actions, a
Claude participant can be elected. Its billing metadata is always unavailable,
so it can never be a provider-account quota source: its exhaustion cannot
trigger an automatic handover and it stays quota-eligible as a candidate. This
is OpenCode's position too; only Codex has a built-in observer.

### Stop-proof reconciliation of uncertain v2 calls plan (3d, 2026-10-04, Claude Code)

Gap: a v2 subscription call that is consumed but never gets a terminal receipt
(timeout, crash, a handover stop killing it) stays `uncertain` (or `consumed`)
forever. Its reservation blocks every admission on that team counter
(`subscription-uncertain-usage-blocks-admission`) and `idleWork` refuses every
quota handover prepare and acknowledgement while it exists; there is no v2
reconcile command, and a revoked or departed participant's call cannot even be
marked uncertain. Spec 2.14 promises terminal stop/reconciliation of the exact
prior invocation after epoch, allocation or quota changes.

Plan, first scope protocol control calls (they carry a ledger-bound
`operation_id`, so the owned runtime's closure can be bound to them):

1. New command `subscription-reconcile-v2` by the invocation's bound collector
   with `{invocation_id, nonce, completion}`. The completion is the owned
   runtime closure for that exact invocation, validated as the ACK capture
   validates it (scope team/participant/incarnation/epoch/descriptor, the
   stored `operation_id`, kind, invocation id, nonce, native id,
   `subscription-consume-v2`, stopped, callback drained, evidence digest,
   created no later than consume), except that it needs no settlement time.
2. Allowed only for a `protocol-control` invocation in state `consumed` or
   `uncertain`; it works after epoch, allocation, quota or policy changes and
   for a revoked or departed participant (binding still checked against the
   stored incarnation and descriptor), because it grants nothing.
3. The invocation becomes a new terminal state `reconciled` with
   `charged_tokens` equal to its reserved estimate, `usage: "unknown"`, the
   completion evidence digest, and `overshoot_allocation_revision` set to the
   unit's current allocation revision: actual usage is unknown and may exceed
   the estimate, so new admissions on that counter stay blocked until the owner
   explicitly raises the allocation, as for a measured overshoot. Its control
   slot stays consumed; no seal, profile, ACK or capture follows from it.
4. Every place that treats `settled`/`aborted` as terminal also accepts
   `reconciled`; `totals` counts it as actual usage with the overshoot latch;
   readers of `receipt` skip it. No stored event can contain the new state or
   command, so replay is unchanged.
5. Host `reconcileProtocolControl({invocationId})` collects the closure from
   the participant's runtime directory and submits it; it refuses without one
   (`completion-*` blockers). Identity and calibration calls have no ledger
   operation id and stay out of scope (named in docs).

Tests: reducer — reconcile of an uncertain and of a consumed control call
settles to `reconciled` with the estimate charged and the latch set; admissions
on the counter are refused until the owner raises the allocation; `idleWork`
no longer refuses after the raise; a wrong operation, nonce, native id, scope,
unstopped or undrained completion, a non-control purpose, a settled or aborted
call, and a non-collector actor each refuse unchanged; works after a revoke.
Host — a control ACK whose send times out (uncertain) is reconciled from its
owned closure, then a quota handover can be prepared after the allocation raise.

Plan criticism (fresh context, revise) and resolution: raising the allocation
to clear the latch would invalidate the control policies' pinned allocation
revision, so a per-call owner command `subscription-unknown-usage-accept-v2`
(charge at least the estimate) clears it instead; a reconciled call frees its
control slot and the consumed-handover latch ignores it, so a lost handover
acknowledgement no longer blocks the handover forever (the drive retries with a
new nonce); reconciled contexts count as used; every terminal-state site and
the control and calibration budgets include `reconciled`; the closure must
close after consume and not in the future; a repeated reconcile with the same
closure is unchanged at the Host; `waypost doctor` names unsettled and
unaccepted calls; CLI operations `native-control-reconcile` and
`unknown-usage-accept`. Documented limits: a crashed or killed Host leaves no
closure; identity and calibration calls (no ledger-bound operation id) are the
next step.

Tests: a lost leader acknowledgement is reconciled (estimate charged, slot
freed, no leader), a repeat is unchanged, late uncertain or usage commands are
refused, admission is refused until a charge of at least the estimate is
accepted, after which a new acknowledgement elects the leader; the reducer
refuses another operation, native id, an unstopped or undrained closure, one
that closed before consume, an owner actor, another nonce and a settled call.
A handover acknowledgement lost mid-call is reconciled by the candidate Host;
after the accepted charge the next drive applies the handover with a `_1`
attempt, the review floor kept. Doctor warnings are unit-tested.

Diff review (fresh context, revise, one blocker) and fixes: a call whose answer
is already on the ledger in a partial receipt (partial or absent usage
coverage) must not lose its slot, or a recorded negative audit or malformed ACK
could be asked again (the reviewer reproduced both). Reconcile now records
`slot_released` only without a partial receipt; the slot check, the
consumed-handover latch and the drive retry honour only released slots. The
drive also skips aborted attempts; a registry error is surfaced when no closure
is found; repeated owner acceptance with the same charge is unchanged; doctor
wording distinguishes partial receipts and names reconcile only for calls with
a ledger-bound operation; the legacy provider-invocation edits were reverted.
New tests: an answered partial ACK keeps its slot after reconcile and a retry
is refused without a send; reconcile of a consumed call and after a participant
revoke; refusal after a collector revoke, for a closure in the future and for a
settled call with its own exact closure; the consumed-handover latch with
same-leader reactivation for uncertain, settled, answered and unanswered
reconciled and aborted calls. Open for the owner: per-call acceptance amends
spec 2.14 and the proposed accounting ADR, which say the allocation must be
raised.
