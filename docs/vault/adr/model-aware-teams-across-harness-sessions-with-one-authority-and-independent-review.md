---
type: adr
id: "model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review"
title: "Model-aware teams across harness sessions with one authority and independent review"
status: accepted
date: 2026-09-30
authors: ["Ivan Morozov", "Codex (OpenAI)"]
tags: ["coordination", "models"]
external_refs: {}
supersedes: null
superseded_by: null
code_refs: ["bin/waypost", "scripts/presence.mjs", "scripts/sessions.mjs", "scripts/agents.mjs", "scripts/commit.mjs", "scripts/lib.mjs", "agents/critic.md", "agents/reviewer.md", "tests/presence.test.mjs", "tests/commits.test.mjs"]
review_status: reviewed
reviewed_at: 2026-09-30
drafted_by: {"harness":"codex","provider":null,"date":"2026-09-30"}
guards: []
---

# Model-aware teams across harness sessions with one authority and independent review

| Field | Value |
|---|---|
| Status | accepted; implementation authorized, runtime verification pending |
| Date | 2026-09-30 (owner timezone) |
| Deciders | Ivan Morozov; authorized implementation of the reviewed proposal in chat on 2026-09-30 |
| Supersedes / Superseded by | none / none |
| Related | ADR-0001, ADR-0003, ADR-0005, ADR-0006, ADR-0007, ADR-0010; WP-20 |

## Context

The owner requires sessions in different harnesses and AI models to collaborate
on one task. The strongest participating model coordinates weaker models and
checks their work; independent critics come from the strongest qualified models.
The owner requested architecture and implementation tasks first on this turn.
The owner also observed that Claude and OpenCode sessions do not communicate:
actual bidirectional delivery to their contexts is a first-release requirement.
This observation does not verify every other harness's native capabilities.

Waypost has presence, story claims and exact-file leases, but no membership,
live model identity, model policy, messages, assignments or review attestations.
Installed role models and registry invoke strings are not live model discovery
or executable session transports. Children can inherit a parent's session id.
Atomic heartbeat replacement is not a transaction: concurrent writes can lose
claims. ADR-0007 explicitly makes cloud coordination advisory. A tie-break over
delayed files cannot establish a unique leader at the time of execution.
Git common dirs connect local worktrees, not unrelated clones through git push.

## Decision drivers

- Strongest eligible model leads according to auditable owner-approved policy.
- Model strength and independent fresh review must both hold.
- One accepted scheduling history despite retries, crashes and model changes.
- Real addressed conversation, including Claude to OpenCode and back.
- Pure Node >=20, zero dependencies; no required hooks or vendor orchestrator.
- Preserve permissions, leases, existing stories and unrelated changes.

## Considered options

| Option | Benefits | Cost / reason |
|---|---|---|
| Extend heartbeat with leader/team claim | Small diff | Lost updates, no review ledger, split brain on replicas. Rejected. |
| Peer election through replicated files | No designated endpoint | Delayed membership has no agreed fencing point. Rejected for authoritative work. |
| Mandatory remote database/service | Shared authority possible | New deployment and credentials; changes accepted no-server baseline. Defer to separate ADR. |
| One pinned local authority, durable log, cooperative CLI participants | A concrete serialization/fencing point; no resident daemon | Authority availability limits progress; remote participants need a route to it. Chosen. |
| Vendor orchestrator as core | Can drive its own native sessions | Loses harness neutrality. Optional evidenced adapters instead. |

## Decision

Propose two separate responsibilities. The deterministic **authority** stores
membership, policy revision, leadership epoch, messages, assignments and review
attestations. Short-lived CLI mutations serialize at one pinned local endpoint.
It is not an AI model and never approves code. The **coordinator participant**
plans, delegates, examines real diffs and requests independent critique.
The authority grants control to the strongest eligible joined participant.

An owner-approved policy ranks exact model/provider/reasoning descriptors by
coordinate, implement and review priorities for a task domain. Names, price,
harness, installed roles and provider keys never imply strength. Unknown models
stay unclassified. The owner can attest identity and priority without a universal
leaderboard. Once policy exists selection is automatic. Equal ranks retain an
eligible incumbent; initial ties use stable participant-id order.

Participants have unique task identities/incarnations independent of legacy
session ids and native conversation addresses. Stronger eligible arrival triggers
acknowledged handover and a new epoch. Old proposals/results cannot advance state
without explicit adoption. Quiet workers remain uncertain, not assumed stopped.
Isolated worktrees can be quarantined; ambiguous shared-tree edits block reassign.

Critics are selected separately at a stored maximum qualified review-model floor;
busy/quiet/departed participants never silently lower it. Rebaseline requires an
explicit owner policy decision and visible change of acceptance scope.
They must use fresh read-only contexts which did not author/implement the target.
A fresh independent context of the coordinator's top model can qualify; its
authoring conversation cannot. If none can be established, review is blocked.
Weaker findings can be preliminary, never a silent substitute. Critique pins the
actual snapshot, criteria, model, policy and evidence; edits invalidate approval.
Freshness requires isolated invocation provenance, not just a new conversation id.
Verified collector records unedited output from read-only contexts, preserving
reviewer/submitter identity separately; manual evidence needs owner attestation.

A neutral addressed message protocol is the communication floor. Queued,
received, acknowledged and processed are distinct. Active sessions poll at
checkpoints. Watcher output cannot wake an LLM. Native send_existing, wake,
fresh_review and inspect_model each need version/platform-specific evidence,
validated addressing and consent. Message bodies never become shell commands.
For unattended participation a verified route must wake the destination context;
without it status explicitly says cooperative-only. A failed send must not
silently create a different conversation. Claude/OpenCode bidirectional delivery
and actual responses are mandatory live acceptance, not inferred from a mailbox.

The authority uses a project/vault-wide serialized event log with canonical
task-to-active-team binding: two teams cannot own one task. It lives in the coordination
directory from ADR-0010. Cloud/network directories cannot host authoritative
mutations; unknown storage needs owner-confirmed locality. Remote sessions use a
verified relay or wait. Replicas never promote themselves. Version one has no
automatic cross-host authority relocation and no hostile multi-tenant guarantees.

Assignments bind edit scope, base, dependencies and acceptance. Worktrees are
preferred. Foreign leases remain exclusive even among teammates. A narrow
assignment-based story-claim exception replaces no legacy gates. Integration
requires a dedicated team-owned checkout/index/HEAD. Reconcile precedes final
review; commit cannot mutate the reviewed tree. A persisted publication fence
orders Git publication against model/policy/epoch changes; recovery accounts
for a surviving Git child, not merely its dead parent. Other staged work stays
preserved. See the draft spec for protocol and crash recovery contracts.

## Consequences

Positive: one auditable task across harnesses; explicit delegation and replies;
strong-model supervision; independently qualified review; retry/recovery evidence.
Model policy and transport capabilities remain data, not vendor branches.

Costs: maintain identity and ranking policy; one authority availability dependency;
active cooperative participants poll, idle conversations need native delivery.
No promise of automation across every listed harness. Fencing protects accepted
protocol actions, not arbitrary direct editor/Git writes by another process.
Trusted agents with shared filesystem access remain trusted; credentials do not
create OS isolation. Remote transport needs a separate threat-model review.

Implementation adds team reducer/store/transport, model policy schema and
team-aware command gates. Legacy presence stays advisory, vault service files
keep their names, projects without teams keep current behavior. No accepted ADR
is superseded by this opt-in extension.

## Verification and follow-up

- WP-20 contains eight implementation stories, none implemented or claimed here.
- Before code: owner approves ADR and activates spec; fresh planner validates seams.
- Fresh architectural critics check protocol safety and model/review boundaries;
  findings and resolutions are recorded in the epic. Review is not owner approval.
- Tests: concurrent requests, fault injection, stale epochs, duplicates, changed
  identities, unknown models, uncertain edits and invalidated review snapshots.
- Live proof: Claude and OpenCode exchange assignments/questions/results both
  ways during one task, different models, stronger-model handover, independent
  top-model rejection/revision and verified integration. Autonomy is measured
  separately from active-session cooperative delivery, per adapter/version/OS.
- Unit tests/role installation are not live messaging or model-execution proof.
  Windows/Linux and remote participation need separate evidence.

## References

- [[cross-harness-team-coordination-protocol]] (draft spec)
- [One task coordinated across harnesses and AI models](../epics/WP-20/epic.md)
- [[0006-commit-protocol]], [[0007-shared-vault-presence]],
  [[0010-coordination-follows-the-repository]], [[0005-harness-registry]]

## Owner authorization

On 2026-09-30, after the independently reviewed architecture/backlog was committed
as 9f7f997, the owner instructed Codex to begin implementation and authorized
checks between installed Claude, Codex and OpenCode. This records approval of
the reviewed approach, not proof of its runtime behavior or a model-strength ranking.
