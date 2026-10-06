---
type: story
id: "story-addressed-messages-and-verified-harness-delivery"
epic: "WP-20"
title: "Addressed messages and verified harness delivery"
status: planned
priority: p1
assignee: "Ivan Morozov"
created: 2026-09-30
updated: 2026-09-30
external_refs: {}
tags: []
code_refs: ["harnesses/claude.json", "harnesses/opencode.json", "harnesses/codex.json", "scripts/agents.mjs", "scripts/presence.mjs", "scripts/team-mcp.mjs", "scripts/team-cli.mjs", "tests/team-mcp.test.mjs", "docs/team-coordination.md", "docs/harnesses.md", "scripts/team-transport.mjs", "scripts/team-host.mjs", "tests/team-transport.test.mjs", "tests/team-host.test.mjs", "scripts/team-mcp-config.mjs", "tests/team-mcp-config.test.mjs", "bin/waypost", "scripts/team-native-delivery.mjs", "tests/native-protocol-delivery-host.test.mjs", "scripts/team-subscription.mjs", "scripts/team-native-action.mjs", "tests/helpers/native-protocol-host.mjs", "scripts/team-diagnostics.mjs", "scripts/team-state.mjs", "scripts/team-workflow.mjs"]
specs: ["cross-harness-team-coordination-protocol"]
started_at: null
closed_at: null
plan_updated_at: null
blocked_by: ["WP-20/story-local-authority-log-and-crash-safe-mutations"]
---

# Addressed messages and verified harness delivery

| Field | Value |
|---|---|
| Epic | [One task coordinated across harnesses and AI models](../epic.md) (WP-20) |
| Status | planned |
| Priority | p1 |

## Description

Provide one neutral addressed queue and capability-gated delivery to actual conversations. Claude/OpenCode bidirectional delivery is required; a mailbox alone is not completion.

The story remains planned behind its authority blocker. A bounded feasibility
prototype now provides cooperative MCP inbox tools; it does not complete native
delivery or claim this story's acceptance criteria.

## Decomposition

- [ ] FIRST perform a feasibility spike of installed Claude/OpenCode send_existing, wake, inspect_model and fresh_review; record evidence before building adapters.
- [ ] Implement bounded envelopes, addressed poll/cursors, idempotency, ack and correlated responses.
- [ ] Add independent registry coordination descriptors, argv/stdin execution and exact native address validation.
- [ ] Separate watcher/subscription from participant/lease lifecycle; report cooperative and autonomous modes honestly.

## Implementation Plan

A fresh planner fills this at the work-start gate after owner ADR approval and
spec activation. Route through spec contracts 4, 2.5.

Fresh planner feasibility pass (2026-10-01): keep one neutral CLI authority and
add a stdio MCP adapter with fixed project/team/participant credential. Expose
only addressed poll/send/ack; no caller-supplied actor/native locator/model or
owner grants. Surface metadata is descriptive. A globally shared MCP credential
does not distinguish desktop chats, so tool calls cannot certify native delivery,
wake or independent review. Native binding/collectors remain subsequent work.

Fresh planner configuration pass (2026-10-02): add a preview-only MCP renderer
before session detection/heartbeat, with format and project target in registry
data. Use absolute Node and bundled script, separate argv, strict options, and no
credential/config reads or writes. Project discovery and cooperative tool access
remain separate from native identity, protected role eligibility and wake.

## Acceptance Criteria

- [ ] Evidence names exact versions/platforms and demonstrates or falsifies each native capability independently; install confidence grants no delivery claim.
- [ ] Duplicate/lost/out-of-order messages retain correlation; old recipient incarnation/stale epoch cannot authorize new work.
- [ ] Queue, context receipt, ack and processing are distinct; watcher output never means an LLM was awakened.
- [ ] Stopping watcher cannot remove parent membership/claims/leases; no eval or use of human invoke string as executable transport.
- [ ] Unsupported idle sessions stay visibly waiting; no new conversation fallback; message injection and forged sender are refused.
- [ ] Claude/OpenCode actual-context bidirectional exchange has a reproducible runbook; unattended wake is proved separately or explicitly blocks autonomous support.

## Final Summary

Pending implementation, evidence and independent review.

Prototype evidence: tests/team-mcp.test.mjs exercises two credential holders,
UTF-8 framing, argument boundaries, duplicate request replay and stale/foreign
acks through the real CLI. Own CLI probes answered/continued Claude, Codex and
OpenCode contexts; these do not establish desktop delivery. Claude Desktop Code
UI was observed without injecting messages into user conversations. Live desktop
native binding and autonomous wake remain unverified. A later dedicated empty
Claude Desktop Code fixture (2.19675.0, macOS, 2026-10-02) completed cooperative
MCP inbox/ack/answer with one-call Manual approvals; the token was absent from the
prompt and the peer CLI poll confirmed the correlated answer. This does not
attest the actual model, fresh context or protected role eligibility.

Independent fresh-context reviewer (2026-10-01) accepted the cooperative prototype
for a checkpoint after regression checks, with full-story gaps explicitly open.
Findings fixed: compact byte-bounded inbox pages preserve the next unread cursor;
ack ids travel in structured JSON instead of CLI option values; stdout waits for
write completion; request-key schema matches the store; CLI failures expose only
allowlisted safe codes. Regression tests include legal large UTF-8 messages,
output backpressure, ids beginning with dashes and stale-epoch diagnostics.

Configuration prototype (2026-10-02): `team-mcp-config` renders project snippets
for Claude, Codex and OpenCode from registry data. It does not read credentials,
overwrite settings, change approvals or grant native capabilities. A fresh planner
and independent reviewer accepted this scoped increment. Focused heavy checks of
harness registry, MCP exchange, preview and owned runtime passed 123/123 in 96.2s.
These are local fixtures, not live desktop exchange or full-story acceptance.

Create-only configuration increment: an explicit dispatcher `--write` prepares
a private configuration and publishes it without replacing any existing target.
The pure renderer and default preview stay read-only. No global config, credentials,
approval policy, authority grants or native capability verification are changed.

## Technical Notes

See [[cross-harness-team-coordination-protocol]]. Its acceptance is additive.
No live messaging, model identity or cross-platform proof from document creation.

### Subscription relay plan (2026-10-04, Claude Code)

Gap: a team using subscription token accounting refuses `relay` before any
work (`scripts/team-host.mjs` managed-operation gate,
`host-subscription-execution-context-collector-unavailable`), so no addressed
question reaches an owned native context of a protocol 2 team. The legacy relay
path (`delivery-consume-v1`/`delivery-capture-v1`) needs a `dispatch` collector
and uses one native context for several messages, which the subscription
counters cannot account (Claude counts only the first turn).

Plan: relay for a protocol 2 team with `inherited-native` subscription
accounting sends each addressed question to its own fresh owned context through
the existing `subscriptionSingleCall` path with a new reservation purpose
`delivery`, so context capture, reserve, the Claude preflight pair, consume,
send, usage settlement and retirement are the same as for identity, trial and
control calls.

1. Owner ceiling `native-protocol-delivery-enable-v2` (policy fields as the
   control policies: `kind: "addressed-delivery"`, `allow_unknown_quota: true`,
   `max_calls`, `max_estimate_tokens`, `timeout_ms`, `expires_at` within the
   team policy, `unit_allocations`). Without it, or after it expires, delivery
   is refused before any native process starts.
2. `subscription-reserve-v2` accepts purpose `delivery` with a `delivery`
   field `{message_id, prompt_digest}`: the message must be a current-epoch,
   unacknowledged question to this participant and incarnation with no delivery
   record; the policy's call count and estimate bound apply; quota rules are
   the native ones (exhausted refuses; unknown allowed only by the policy).
3. `subscription-consume-v2` for `delivery` rechecks the message and the policy
   and, in the same event, creates `t.deliveries[nonce]` (`message_id`,
   `participant`, `incarnation`, `epoch`, `native_id`, `invocation_id`,
   `state: "dispatching"`) and checks the consume `prompt_digest` equals the
   reserved one. One event means no crash window between charge and record.
4. `subscription-usage-v2` for `delivery` takes an extra receipt field
   `delivery: {output, output_digest}` (bounded 16 KiB, digest checked) and
   moves the record to `received` with the output and observed model, only when
   the epoch and incarnation are still current; otherwise the tokens settle and
   the record becomes `rejected`. `subscription-uncertain-v2` moves it to
   `uncertain`. A message with any record other than `rejected` is never sent
   again (the existing relay selection already skips messages with a record).
5. Host `relay`: the managed-operation gate is narrowed to keep refusing
   `inspect`, `review`, `dispatch` and every v1 subscription team; for a v2 team
   `relay` loops over pending questions (bounded by `limit`/`maxPolls`), calls
   `subscriptionSingleCall({purpose:'delivery', message})` per message (fresh
   context each), then forwards the captured answer with the existing
   `forwardCaptured` (answer `send` with `reply_to` and `ack` by the
   participant credential, idempotent by request key). The delivery prompt is
   the existing untrusted-data framing. The entry renews its quota lease first.
6. New stored fields appear only on the new purpose, so stored events replay
   unchanged.

Tests (new `tests/native-protocol-delivery-host.test.mjs` on the protocol Host
fixture, plus reducer cases): order context, reserve, consume, send, usage,
answer, ack; no policy or an expired one refuses before a native process; an
exceeded estimate or call count refuses before inference; an uncertain call
keeps its hold and the message is never redelivered; a stale epoch or changed
incarnation between reserve and consume refuses; a quota freeze blocks
delivery; a refused second Claude preflight aborts the reservation; a received
answer is forwarded after a crash without inference; injected payload text
cannot change authority. Legacy relay tests stay unchanged; the existing
refusal test for subscription relay changes to v1-only.

Plan criticism (fresh context, revise; 2026-10-04). Not implemented; blocked:

- Owner decision needed: spec 2.13 and the coordination ADR allow unknown quota
  only for measurement probes (calibration spec item 20 extends it to the
  leader acknowledgement). Claude and OpenCode never have known quota, and Codex
  is excluded below, so subscription delivery needs a spec/ADR amendment that
  admits addressed delivery under an explicit owner `allow_unknown_quota`
  ceiling. It also answers through a fresh stand-in context with the
  participant's credential, not the participant's own conversation; the story
  forbids a new-conversation fallback, so these answers must be labelled as
  stand-in answers or the design changes.
- Prerequisite: a stop-proof-backed v2 reconciliation. Today an uncertain v2
  call (timeout, crash, a handover stop) blocks every admission on that counter
  and every quota handover forever (`idleWork`), and a revoked or departed
  participant cannot even be settled. Delivery would make this routine.
- Codex contexts report a read-only shell tool; an injected payload could read
  local secrets into the authority log. Delivery requires a no-tools context
  before inference (Claude and OpenCode only until Codex zero-tools evidence).
- `forwardCaptured` must never throw inside the recovery loop: an answer whose
  envelope exceeds the `send` limit, or a departed sender, would wedge relay;
  record a per-delivery forwarding failure instead.
- Per-message managed operations with lease renewal between them; check
  participant quota eligibility at reserve and consume; recompute the prompt
  digest from the stored message with a frozen versioned formatter; store the
  answer text once (authority state is capped at 4 MiB); delivery record needs
  `nonce` and `collector`; define terminal states for native failure, oversize
  answers, unverified isolation and quarantine; a replay test against a log
  recorded before the change.

Owner decision (2026-10-06): addressed delivery under unknown quota is allowed
under an explicit owner delivery ceiling, in a fresh owned stand-in context
labelled as a stand-in answer (spec 2.13 amended). Reconciliation of lost v2
calls landed in the quota story (3d/3e/3f). Implementation of the subscription
relay follows the criticism list above.

Implementation (2026-10-06, Claude Code): `scripts/team-native-delivery.mjs`
(owner ceiling `native-protocol-delivery-enable-v2`; reserve, consume and
settle hooks wired into `scripts/team-subscription.mjs`; reconcile marks a
delivery `stopped`), Host `relaySubscription` and `enableNativeDelivery` in
`scripts/team-host.mjs`, CLI `native-delivery-enable` and relay estimate.
Addressed the criticism: per-message owned operations with lease renewal; the
reducer recomputes the prompt digest from a frozen formatter; delivery record
in the consume event with `nonce`, `collector` and `invocation_id`; terminal
states `received`, `failed` (named reason), `uncertain`, `stopped`; the answer
stored once in the record and the forwarded message; envelope size checked at
seal; forwarding never throws in the loop; Codex refused in Host and reducer;
quota eligibility at reserve and consume; no automatic allocation raise.
Tests (`tests/native-protocol-delivery-host.test.mjs`): labelled answer with
`reply_to` and ack, order reserve, consume, send, no resend; no ceiling refuses
before a native process; the ceiling's call count; an uncertain delivery keeps
its hold and is not resent; an oversized answer fails without forwarding while
tokens settle; an answer received before a crash is forwarded without another
inference; a Claude stand-in runs both preflights; the reducer refuses a Codex
recipient, a foreign prompt digest, an acknowledged question and a missing
ceiling. Not yet: live delivery between own Claude and OpenCode CLI contexts.

Diff review (fresh context, revise, two blockers) and fixes: the Host now
reconciles delivery calls (a lost one no longer blocks the counter forever; the
record becomes `stopped`); a failed native turn that still returns a receipt is
settled `failed` (`delivery-native-turn-failed`) instead of being forwarded as
an answer; questions with a live reservation are skipped and doctor names an
expired orphan with the owner abort; the answer text is stored once in the
record (the receipt keeps a digest and an outcome); forwarding checks epoch and
incarnation; legacy v1 delivery commands refuse v2 records; recovery loads the
authority once; the ceiling's unit allocations must belong to the team and be
positive; the enable command is deferred under a publication fence; Codex is
refused before the lease renewal. New tests: reconcile, accept and resume after
a lost delivery; failed turn with a receipt; expired and zero ceilings; an
estimate above the ceiling; a sender who left; v1 commands against v2 and v1
records; doctor's orphan warning.

Delta review (revise, one regression) and fixes: a complete receipt after a
partial one now settles an `uncertain` record (it stayed stuck); an answer too
large for the message limit is reported by the Host as outcome `too-large`
rather than sending text that could overflow the command; stray
`delivery_output` on other purposes is refused; stale-epoch answers drop out of
the recovery list; doctor names the right abort command per protocol. Tests: a
late complete receipt settles to `received` and is forwarded; a ceiling that
lapses after enabling starts no delivery.

## Dependencies

- WP-20/story-local-authority-log-and-crash-safe-mutations

## Attachments

- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]
