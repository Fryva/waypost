---
type: story
id: "story-participant-identity-and-owner-approved-model-policy"
epic: "WP-20"
title: "Participant identity and automatic model strength discovery"
status: in-progress
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-30
updated: 2026-10-04
external_refs: {}
tags: []
code_refs: ["scripts/team.mjs", "scripts/model-strength.mjs", "scripts/team-state.mjs", "scripts/team-store.mjs", "scripts/team-cli.mjs", "models/strength-sources.json", "models/policy.schema.json", "models/descriptor.schema.json", "tests/team-models.test.mjs", "tests/team-store.test.mjs", "tests/model-strength.test.mjs", "tests/team-periodic.test.mjs", "tests/team-cli.test.mjs", "scripts/team-transport.mjs", "scripts/team-host.mjs", "scripts/team-evidence.mjs", "tests/team-transport.test.mjs", "tests/team-host.test.mjs", "scripts/native-model-profile.mjs", "tests/native-model-profile.test.mjs", "scripts/team-role-suite.mjs", "tests/team-role-suite.test.mjs", "scripts/team-role-calibration.mjs", "tests/team-role-calibration.test.mjs", "scripts/team-subscription.mjs", "tests/team-subscription.test.mjs", "tests/calibration-policy.test.mjs", "tests/native-policy-models.test.mjs", "tests/native-policy-state.test.mjs", "tests/helpers/native-calibration.mjs", "scripts/team-model-inventory.mjs", "tests/team-model-inventory.test.mjs", "tests/native-model-inventory-transport.test.mjs", "tests/team-model-inventory-cli.test.mjs", "scripts/team-native-action.mjs", "scripts/team-protocol-review.mjs", "tests/native-action-profile.test.mjs", "tests/native-protocol-action.test.mjs", "tests/native-protocol-control.test.mjs", "tests/native-protocol-host.test.mjs", "tests/native-protocol-review.test.mjs", "tests/native-protocol-review-host.test.mjs", "tests/helpers/native-protocol-host.mjs", "tests/claude-native-counter.test.mjs"]
specs: ["cross-harness-team-coordination-protocol", "objective-native-configuration-calibration-for-protocol-roles"]
started_at: "2026-10-01T02:15:04.752Z"
closed_at: null
plan_updated_at: "2026-10-01T02:15:04.752Z"
blocked_by: []
---

# Participant identity and automatic model strength discovery

| Field | Value |
|---|---|
| Epic | [One task coordinated across harnesses and AI models](../epic.md) (WP-20) |
| Status | in-progress |
| Priority | p1 |

## Description

Separate task participants from inherited session ids and declare exact model/provider/reasoning identity with an auditable automatically discovered task-domain ranking with fresh evaluator provenance.

Implementation in progress. Identity/policy core, automatic source discovery and
authority/inbox integration are being validated; no final delivery claim.

## Decomposition

- [ ] Define descriptor/policy schemas and evidence floor; no shipped unsubstantiated worldwide ranking.
- [ ] Mint unique participant/incarnation and native-locator separation, with scoped enrollment/revocation.
- [ ] Implement role-specific eligibility, stable tie behavior, identity/policy revision validation.

## Implementation Plan

Fresh planner validated seams against WP-17/18/19. Implement scripts/team.mjs
with exact identity policy and deterministic selection; models schemas and
model-strength.mjs fetch public evidence with confidence ties/TTL. Integrate
team-state/store/CLI so participant/inbox isolation is tested through real
commands. Route through spec contracts 2, 3.1, 6.1. Native identity/unknown-model
calibration are separately reported pending; do not close from reducer tests alone.

## Acceptance Criteria

- [ ] Parent and child with one legacy session id have different participants and inboxes; restart cannot inherit old addressed work.
- [ ] Unknown/alias/self-declared models cannot lead or satisfy strongest review under default policy; owner attestation is explicitly labelled.
- [ ] Equal ranks retain eligible incumbent; stronger qualified identity is selected; provider/harness/price never implies strength.
- [ ] Model/reasoning/policy changes invalidate protected privileges and unaccepted attestations; unit tests cover changes and malformed descriptors.

- [ ] Automatically discover priorities from fresh sources, including free models; unknown identity never inherits a family rank.
- [ ] Periodically check ranking and execution identity separately; expiry/change suspends stale authority and review.

## Final Summary

Implementation remains in progress. Authenticated protocol calibration can now
install a scoped policy and elect coordinator/independent critic candidates
atomically. The strongest
review frontier is retained as typed identities. Periodic native catalogue
inventory and fixed leadership ACK admission are implemented with scoped evidence.
The current increment adds a distinct fresh native critic for stored ACK binding,
accounting and closure facts; it does not verify historical strongest election or
project work. General protected task/review admission, typed quota handover and
economical calibrated dispatch remain open. No full calibrated native cohort or
live native ACK/audit is claimed.

## Technical Notes

See [[cross-harness-team-coordination-protocol]]. Its acceptance is additive.
No live messaging, model identity or cross-platform proof from document creation.

## Dependencies

- Owner approval of ADR and activation of draft spec.

## Attachments

- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]


### Native catalogue discovery increment (2026-10-03)

Codex/OpenCode metadata-only owned endpoints now feed a bound advisory catalogue.
Periodic refresh checks original inventory clocks independently of calibration;
protocol-v2 refresh cannot initiate identity inference or renew measurement expiry.
Complete same-scope snapshots alone establish removals; route/price/option hints
remain unranked. At that increment Claude inventory was unsupported; the later
Claude metadata increment below supersedes that limitation.
Fresh independent critic returned scoped ship after capture alias, durable nonce
key and watch cadence corrections. Focused integration/compatibility run:259/259
pass; doctor0 issues/0 warnings. Live metadata collection waits for resources:
Waypost refused launch and a60s resource wait (CPU unavailable). No new native
catalogue, full calibrated cohort or protected execution is claimed. Full story
acceptance and economical calibrated dispatch remain open.


### Independent native protocol audit increment (2026-10-03)

A separately owner-bounded action now dispatches the strongest current independent
protocol critic over the authority's own applied ACK binding/accounting/closure
trace. The immutable target excludes raw output and account metadata; current
allocation totals and audit history cannot alter its digest. Original author
expiry does not fabricate missing historical strength evidence. Negative findings
remain unresolved across later positive reviews and policy/epoch changes.

Fresh design and code critics returned scoped ship. Review found an ACK replay
state-shape change; fixed by storing the new policy-kind field only for audit,
with exact legacy reservation regression. The 12-file gated run covered 171 cases:
160 other cases passed unchanged, and all 11 ledger cases passed their final
separate retest after correcting two test fixtures (expected refusal and coherent
policy revision linkage). Real authority replay and owned-runtime callback/closure
were exercised with mocked native transports, including both audit recovery
windows, malformed/partial usage and negative verdict retention. No new live
native audit or complete calibrated cohort is claimed. Project-work review,
generic protected actions, economical routing and typed quota handover remain open.


### Claude metadata discovery increment (2026-10-03)

A separate owned Claude CLI now discovers advertised selectors and effort levels
through a single native SDK initialize control request. No user frame is sent.
Effective model, author, reasoning, price and runtime version remain unknown;
aliases do not establish strength, availability, subscription admission or roles.
The existing 15-minute refresh and one-hour successful snapshot expiry apply.
Capture follows owned stream/group closure; unexpected, malformed, oversized or
truncated late frames preserve the prior snapshot and its original expiry.

Fresh independent code critic returned scoped ship after fixing the empty-catalogue
page/version validation. Seven-file gated regression: 234/234 pass, 96.832 seconds.
Live transport plus projection on macOS with Claude Code 2.1.286 at
2026-10-03T23:30:50Z returned 12 unranked selectors and confirmed owned group
closure. No user frame was sent. This is not live Host ledger capture, a calibrated
cohort, Claude Host execution admission, desktop model discovery or full story
acceptance. Those boundaries remain open.


### Claude same-peer pre-inference preflight plan (2026-10-04, Claude Code)

Gap: the Claude transport learns `system/init` tools only after the user frame,
so the Host cannot verify a fresh no-tools context before reserve, consume and
send, and keeps Claude out of subscription admission. Live observation on
Claude Code 2.1.289 (no user frame sent): the native `get_context_usage`
control request is answered by the same process before any turn, with context
categories, `mcpTools`, `agents`, `memoryFiles`, a message breakdown and
`apiUsage: null`. With `--tools ''` the categories are only System prompt,
Messages, Autocompact buffer and Free space; with default tools it adds System
tools, System tools (deferred) and Skills. `--safe-mode` loaded no memory files
in the project directory.

Plan: `claudeEndpoint.inspectContext` sends that request on the inference peer
itself and verifies, fail-closed, that no turn, output or stream gap happened
yet; only the four known categories appear; tools, agents and memory files are
empty; every message bucket except a small unattributed baseline is zero with
no tool calls or attachments; and `apiUsage` is null. Unknown categories or
fields, malformed or duplicate responses refuse. `send` repeats the inspection
immediately before writing the user frame and refuses without it. The receipt
manifest marks the context fresh and read-only only when the pre-inference
inspection and the existing post-turn `system/init` empty tools both hold.
The Host admits Claude with its existing first-turn counter schema. Billing
metadata stays unavailable (`unknown`), so no provider quota proof, paid
fallback exclusion or account identity is claimed. Done when transport tests
cover each refusal, Host tests admit a mocked Claude peer only after the
preflight and refuse it otherwise, and one live owned call shows a verified
preflight followed by a complete first-turn span.

Plan revision after fresh-context criticism (revise): the default `full` detail
of `get_context_usage` calls the authenticated token-count API per category and
substitutes a placeholder message, which produced the Messages row; a gateway
could even fall back to a one-token completion. The preflight therefore uses
`detail: "summary"` (local estimates; live: no Messages row, unattributed 0,
`apiUsage` null) and refuses gateway, Bedrock, Vertex and API-key routes from
both the inherited environment and the initialize account route. The inference
peer itself must answer an initialize request (`hooks: null`) whose `pid` is the
spawned child; only route enums are kept, never email or organization. Rows are
classified by `kind`: one `used` row named System prompt, any `buffer`/`free`
rows, and nothing `deferred` or unknown. Semantics are pinned to binary versions
read natively with `get_binary_version` (2.1.289 observed); other versions are
unverified. `get_hooks_listing` must show no hooks. Inspection runs before
context capture and again between reserve and consume, where a refusal aborts
the reservation instead of leaving an uncertain charge; `send` writes the user
frame only after checking the sticky gap state and marks the receipt fresh and
read-only only when the bound preflight and the post-turn `system/init` empty
tools both hold. Claude has unknown billing metadata (no account, quota or
paid-fallback claim). Host admission is limited to the identity probe; trials
and protocol control actions stay refused for Claude.

Implementation: `scripts/team-transport.mjs` adds the preflight, post-turn init
checks (no MCP server, `apiKeySource: "none"`, the preflighted binary) and
unknown billing metadata for Claude; `scripts/team-host.mjs` admits Claude for
the identity probe with a second inspection between reserve and consume and
binds the receipt's isolation to that evidence digest. Hermetic tests: 37 Claude
transport cases (22 new, including a spawn-time route variable) including every listed refusal, route environment,
token-source routes, failed, unsolicited and duplicate control frames, a flagged
frame between preflight answers, a concurrent send (busy) and a control timeout;
mutation checks confirmed the recheck and busy guard are each caught (the
pending-request guard is defence in depth, unreachable through the wrapper);
four Host cases (undeclared pre-consume inspection refused, admitted,
refused between reserve and consume with an aborted reservation and no send,
stale binding settled but not isolated). Live on Claude Code 2.1.289: verified
preflight, `OK`, complete 1,852-token span, isolated manifest bound to the
evidence, process group closed. No live Host ledger capture, calibration,
desktop, quota or strength evidence is claimed.

Independent code review returned revise without blockers; fixed: post-turn
`system/init` must carry empty `mcp_servers`, `apiKeySource: "none"` and the
preflighted version (absent fields refuse), any `tokenSource` or other account
key refuses, the route is checked on the spawn-time environment too, the Host
requires the Claude transport to declare its pre-consume inspection, and the
fake child carries a pid only on POSIX. Claude `inspect`/`review` contexts
without a preflight are now reported as not isolated. Full `npm test` before
these fixes: 1355 passed, 0 failed, 5 skipped; after them: 1357 passed, 0
failed, 5 skipped. The live call repeated on the final code with the same
result (2026-10-04T15:56:20Z).
A delta review of these fixes returned ship; its two unpinned guards (spawn-time
route, undeclared Host inspection) now have tests.

### Claude calibration and control admission (2026-10-04, Claude Code)

The identity-probe-only gate for Claude in `subscriptionSingleCall` was a scope
limit of the preflight change, not a missing check: the reducers have no harness
condition and the real Claude receipt, when isolated, carries the manifest the
profile collector requires (`adapter-isolated`, read-only isolation, empty tools
and author contexts, bound preflight digest). The gate is removed; calibration
trials and protocol control actions now run for Claude with both preflights.
Host test: a Claude peer yields an identity profile, then a coordinate trial
passes with exactly inspect, inspect, send, close and an isolated settled
receipt. The protocol Host fixture gained a Claude variant (descriptor without
provider or reasoning, first-turn counter, preflight pair, manifest bound to the
last preflight): a Claude leader ACK applies after owned closure with exactly
one inspection before context capture and one between reserve and consume; a
malformed ACK spends its slot without a leader; a refused second preflight
aborts the reservation without taking the slot. The Claude transport test now
pins the isolated manifest fields the profile collector requires. Fresh review:
ship; its should-fix items (control-action test, pinned manifest fields, quota
consequence, stale Codex/OpenCode wording and status labels) are done. Not
done: a live Claude trial or control action, and a version source for Claude
profiles (they keep `version: unknown`).

### Claude profile version from the bound preflight (2026-10-04, Claude Code)

Claude profiles recorded `version: unknown` because only OpenCode's native
health counted as a version source. `nativeProfileVersion` (team-native-action)
now serves both the profile collector and the action-profile capture check: an
OpenCode `native-health` version, or for Claude the `get_binary_version` answer
of the same preflighted peer that the receipt manifest binds (same native id,
the summary preflight source, a plain `x.y.z` version), recorded as
`native-binary-version`; anything else stays `unknown`. Existing OpenCode and
Codex profiles are unchanged. Tests: the Claude identity profile carries
`2.1.289` / `native-binary-version`; a foreign native id, another source, a
pre-release string, another harness and an unprovenanced version give
`unknown`.
Review (fresh context, revise) and fixes: the protocol Host fixture's Claude
manifests now carry the real preflight shape, so the leader ACK test asserts the
reducer's own recomputation (`2.1.289`, `native-binary-version`); the capture
check compares version and provenance; `native-health` counts only for
OpenCode; control characters are refused. Replay note: the action-profile
capture reducer recomputes the version from the stored manifest, so a Claude
action observation captured with the previous rule would not replay. Claude
control actions were admitted only on this unmerged branch (since 86bdb3a) and
none has run live, so no such event exists; every Claude profile id changes
once, and in-flight cohorts and policies expire within 15 minutes.

Live through a real Host ledger (2026-10-04/05, Claude Code 2.1.289, macOS): a
scratch project ran team create (`--native-policy-bootstrap`), join (harness
claude), `subscription-accounting-enable-v2` (inherited-native), Host bootstrap
with a read-only managed Claude descriptor and one `subscription-bootstrap`.
Result: `probe_passed: true`; complete first-turn span of 1,916 tokens;
invocation settled with `isolation_verified: true`; no binding changes or
quarantine; native profile harness `claude`, version `2.1.289`
(`native-binary-version`), model `anthropic/claude-opus-5-5`, effective
reasoning `unknown`, no roles and not rank-eligible; native context retired.
The joined participant declared `claude-sonnet-5-5`; the observed effective
model was `claude-opus-5-5`, which the identity records as observed without
granting anything. One earlier invocation of the step failed before inference
(missing `--participant`), so exactly one inference ran. This is live Host
ledger evidence for the identity probe only, not a live trial, control action,
calibration, strength or quota evidence.

Live calibration trial through a real Host ledger (2026-10-04, Claude Code
2.1.289): after an identity probe (1,914 tokens, profile `2.1.289` /
`native-binary-version`, `claude-opus-5-5`) and an owner allocation raise, a
one-member cohort was opened and one coordinate trial ran: the raw answer was
clean unfenced JSON (`{"eligible_ids":[...]}`), `trial_capture.pass: true`,
2,229 tokens settled with an isolated receipt, the measurement profile equal to
the identity profile, no roles granted; the summary shows one coordinate sample
(Wilson lower bound 0.21), not qualified. Exactly two inferences. Host
operations other than bootstrap need `--participant` in the CLI; without it the
Host now fails with `host-endpoint-file-missing-pass-participant` instead of a
raw ENOENT. Not run live: a Claude control action, a full 24+24 cohort.
