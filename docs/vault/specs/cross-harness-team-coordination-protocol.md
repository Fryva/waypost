---
type: spec
id: "cross-harness-team-coordination-protocol"
title: "Cross-harness team coordination protocol"
status: draft
date: 2026-09-30
updated: 2026-09-30
authors: ["Ivan Morozov", "Codex (OpenAI)"]
tags: ["coordination", "models"]
external_refs: {}
adr: ["model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review"]
stories: ["WP-20/story-participant-identity-and-owner-approved-model-policy", "WP-20/story-local-authority-log-and-crash-safe-mutations", "WP-20/story-addressed-messages-and-verified-harness-delivery", "WP-20/story-assignments-supervision-and-stronger-model-handover", "WP-20/story-independent-strongest-model-review-of-immutable-evidence", "WP-20/story-reviewed-integration-and-team-aware-story-gates", "WP-20/story-team-cli-orientation-and-deterministic-diagnostics", "WP-20/story-live-claude-and-opencode-coordination-on-one-task"]
review_status: reviewed
reviewed_at: 2026-09-30
code_refs: ["bin/waypost", "scripts/presence.mjs", "scripts/sessions.mjs", "scripts/commit.mjs", "scripts/agents.mjs", "scripts/brief.mjs", "scripts/doctor.mjs", "scripts/ready.mjs", "scripts/lib.mjs", "templates/agents-block.md.tmpl"]
---

# Cross-harness team coordination protocol

Proposed WP-20 contracts, **not existing commands or runtime guarantees**.
The linked ADR is proposed. Spec activation and owner approval precede implementation.
Acceptance is additive to the covered stories, not substituted for their criteria.

## How we solve

Keep presence advisory. Team decisions live at one host-local authority; AI
participants cooperate through messages and assignments. The strongest eligible
coordinator supervises actual diffs; independent fresh contexts review immutable
snapshots. Enrollment permits only this task's messages to enrolled sessions.

Version one supports several harnesses/worktrees on one host. Another host needs
an evidenced route to the same authority; replicas are read-only observations.
Git push/pull does not carry live team state. No distributed fallback election.

## Behavioral contracts

### 1. Authority, serialization and recovery

1.1. One authority per project/vault stores a project-wide immutable event log
and mutex under the primary coordination directory's teams/authority/. Team
identities/state under teams/<id>/ are projections, not separate authorities.
Identity binds project/vault, canonical task artifact key, endpoint and version.
Task-owner bindings and team transitions share this serialization boundary.
Task key is the resolved canonical vault-relative artifact identity, not caller
spelling. Concurrent create with different team ids for one task returns the
existing active team or refuses; at most one active team owns it. Close releases
binding only after contract 7.4; rebind is an explicit event preserving history.
Validated portable ids cannot traverse paths or follow symlinks outside this root.
Creation refuses existing identities. Legacy migration roots are not authorities.

1.2. Pin the endpoint to one host-local root. Known cloud/network storage refuses
mutation; unknown storage needs owner-confirmed locality. Revalidate mount changes.
Remote requests route to the pinned host. Replica state always names last known
revision; no replica write, election or automatic cross-host relocation.

1.3. Each mutation exclusively acquires a local command mutex, checks expected
revision, validates the transition and publishes one complete immutable event.
Write temp, flush, atomically publish, then update snapshot. Publication is the
commit point. Replay only a contiguous valid prefix; a damaged event, gap or
unknown schema blocks mutation. Missing/stale snapshots rebuild from the log.
Durability depends on tested local filesystem flush semantics; do not promise
portable power-loss persistence based on atomic rename alone.

1.4. Mutex records nonce, host and command process incarnation. Never steal by
TTL. Recovery needs a supported probe proving command termination or explicit
owner confirmation that it stopped. Empty/partial crash locks need owner recovery.
No participant deletes another host's temp files. Authority process verification
is distinct from advisory presence. Authority outage pauses acceptance/scheduling;
same-endpoint recovery replays the log before permitting writes.

1.5. Persist request key and digest with its event. After authenticating caller,
look up completed keys BEFORE revision/epoch checks: retry of the same key/payload
returns the original outcome; key reuse with changed payload refuses. Crash after
publication/before reply therefore cannot assign twice. Unknown protocol versions
refuse mutation. Rejected requests return revision/epoch and a refresh action.
Damaged-log recovery preserves an immutable copy of evidence; never skips events
silently. Owner selects restore/replay from a verified contiguous backup or
abandonment/export of blocked state. Unprovable state cannot authorize integration.
No automatic edits to accepted history.

### 2. Membership, model identity and policy

2.1. Explicit join mints participant id and incarnation, links legacy session id,
worktree/root, harness and optional verified native conversation locator. Parent
and child inheriting a session id still have distinct participants/inboxes. A
restart gets a new incarnation; old addressed messages are not silently redirected.

2.2. Descriptor: provider, exact model_id, reasoning configuration, model_revision,
evidence kind and provenance/time. Evidence: adapter-observed, owner-attested,
self-declared or unknown. Dynamic aliases/routers stay unknown unless actual
execution model is pinned/observed. API keys, process names and installed role
model do not establish identity. No credentials/transcripts in descriptors.

2.3. Owner-approved versioned policy maps exact descriptors to ordered priorities
for coordinate, implement and review for a named task domain, with source/date.
Default identity floor is adapter-observed or owner-attested. Waypost ships no
asserted worldwide strength order. Unknown models cannot lead or satisfy top
review; explicitly permitted low-risk execution is possible. No silent weaker
fallback. Missing policy/identity is a named blocker for owner action.

2.4. Recheck model at join and before protected actions where inspection exists;
otherwise owner attestation binds this exact protected action and model revision.
Self-declaration never inherits prior owner-attested evidence strength: without
new owner attestation/inspection, the protected action is blocked. Operator
checkpoints can be required in cooperative mode; this is not unattended identity
verification. Identity change suspends privileges, invalidates unaccepted old reviews and reruns
selection. Policy revisions require explicit revalidation of work and approvals.

2.5. Enrollment issues a task-scoped participant credential outside Git. Commands
verify credential, participant/incarnation and action role; sender fields are not
authentication. Remote connectors authenticate both endpoint and caller. Enrollment
authorizes task-scoped messaging, not unrelated conversations, model switches,
external messages or permission escalation. Revocation stops new protocol actions.
Trusted local agents sharing OS/filesystem rights can still alter/read state:
no hostile multi-tenant security or cryptographic model-execution proof claimed.
Remote delivery needs a threat-model review. Message text is data, not code or
higher-priority instructions. Limits must bound payloads, batches and evidence.

### 3. Leadership, stronger-model promotion and failover

3.1. Availability is ready, busy, unavailable or left. Participant reports
busy/ready/left; authority records unavailable after failed acknowledgement with
reason; owner can revoke. None deletes outstanding execution evidence.
Eligible means joined, ready, not revoked, identity-qualified, protocol-capable
and routable. Highest coordinate priority wins. Equal ranks keep incumbent;
otherwise stable participant-id ordering. If top cannot acknowledge, mark it
unavailable with a reason, then rerank eligible participants. Leader rank never
comes from self-declared strength. Policy governs model strength, not permissions.

3.2. States: forming -> active -> handover -> active; paused and closed branches.
A grant binds monotonic epoch, leader id, model revision and policy revision.
Active requires leader acknowledgement. Only that participant can propose
assignments, adopt work, request integration and schedule final review. Workers
report/dispute; authority validates, but never approves model-written work.

3.3. Stronger eligible arrival automatically enters handover, refusing new old-
leader assignments immediately. Send quiesce, gather leader/worker acknowledgement
and execution evidence; then append epoch+1 grant. New leader acknowledges before
resuming. Explicit adoption binds retained base/scope/result, old/new epoch and
worker acknowledgement; unadopted old results cannot advance acceptance.
Recompute against latest roster/policy before new grant, so a further stronger
arrival during handover cannot be skipped.

3.4. A deadline can fence a quiet leader's authority, but timeout never proves a
worker stopped. Outstanding edits remain uncertain until acknowledgement,
verified process termination or owner-directed isolation allows continuation.
Distinct worktrees can be quarantined/excluded; shared-tree overlapping scopes
remain blocked. Stale results are preserved as unaccepted reports. Returning
old participants refresh/rejoin before obtaining valid work again.

### 4. Communication and actual delivery

4.1. Committed envelope: protocol, team, immutable message_id, request key,
addressed sender/recipient incarnations, epoch, kind, work/review correlation,
reply_to, bounded payload and evidence refs. Kinds: assignment, ack, progress,
result, question, answer, quiesce, handover, review-request, review-result, cancel.
Duplicate transport delivery is safe; exactly-once side effects are not promised.

4.2. Distinguish queued-at-authority, received-by-participant, accepted, running,
result-submitted. A file write or watcher stdout is not delivery to an LLM.
Poll cursor binds team/participant/incarnation; ack is a separate mutation.
Lost ack: worker reuses assignment id and queries durable status, not repeats
side effects. Questions/answers never grant work authorization. Stale messages
are visible but cannot advance execution state.

4.3. Active participants poll at turn start, before edit/test/commit boundaries
and result submission. Watch subscription can show pending work but stopping it
cannot unregister the parent or release its leases. Watch is interruptible.
Brief reports pending count/one next action; details stay behind flags.

4.4. Optional registry coordination capabilities: inspect_model, send_existing,
wake, fresh_review, remote_authority. Each has independent evidence, platform/
version scope, address validation and consent requirements, separate from role-
install confidence. Missing is unsupported/cooperative, never inferred verified.
Adapters use allowlisted executable/argv, stdin or file payload; no eval, shell
interpolation or execution of today's human invoke string. Failed send cannot
create a different conversation silently. Existing-conversation addressing must
be verified, not derived from an inherited Waypost session id.

4.5. Autonomous collaboration requires evidenced delivery that causes the idle
recipient to process its next checkpoint. Cooperative-only sessions wait when
idle; status states that limit. For Claude <-> OpenCode, first-release evidence
must show addressed assignment/question/result crossing both ways, actual
context receipt and correlated response while one task is in progress. A queue
or mocked adapter is insufficient. Autonomous waking is a separate mandatory
proof for any unattended claim; inability blocks that claim, not hidden fallback.

### 5. Work ownership and supervision

5.1. States: proposed -> assigned -> acknowledged -> running -> submitted ->
review-pending -> changes-requested | reviewed -> integrated, plus blocked,
cancelled and uncertain. Reassign/adopt is explicit. Every transition checks
role, epoch, work generation, base, model/policy and expected team revision.
A worker cannot mark its result reviewed/integrated. Dependencies must resolve
and be acyclic before scheduling.

5.2. Assignment contains goal, dependencies, concrete edit paths, forbidden actions,
acceptance, immutable base and expected evidence/resource requirements. Overlap
refuses parallel edits; read-only review can overlap. New files need scope
amendment first. Directory/glob scope must be expanded/normalized; current leases
protect exact files only and cannot be described as directory locks.

5.3. Prefer isolated worktree per executor. Shared checkout needs explicit owner
opt-in, baseline hashes and exact leases before editing; no automatic takeover
of uncertain shared-tree writes. Version-one integration REQUIRES a dedicated
team-owned checkout/index/HEAD. An isolated index in a shared checkout is not
sufficient: moving HEAD can turn old main-index entries into staged undo.
Shared-checkout integration is deferred pending a safe staged-delta/HEAD protocol.
Next ordinary commits in other checkouts must retain intended staging and cannot
accidentally undo team integration.

5.4. Result pins immutable patch/tree/artifact, base, work generation, model,
changed paths and test/log digests. Include intended untracked files and exclude
unrelated changes. Coordinator records actual diff/acceptance supervision, not
just worker report. Questions/findings go to that addressed worker. Heavy work
uses capacity/run --heavy and starts no new agents alongside a heavy job.

5.5. Cancellation/leader loss preserves edits and partial results. Cleanup only
proven team-owned artifacts after reconciliation/ack; never another participant's
unknown work. Evidence preserves original authorship after another integrates.

### 6. Strongest independent critic and reviewer

6.1. Store review floor as highest review priority among identity-qualified models
admitted to this team under its approved policy. It is independent of ready/busy/
unavailable/left: temporary absence, model switch or departure never automatically
lowers it. Stronger admission raises floor; only owner can explicitly rebaseline
with new policy revision and visible acceptance-scope change. Weaker approval
cannot silently satisfy the earlier requirement. Select an available independent
fresh read-only context at/above that floor. Top model's authoring context is
excluded; its separately established fresh context can qualify. If none can run,
block with strongest-independent-review-unavailable. Lower reviews are preliminary.

6.2. Review context receives pinned target, acceptance and relevant rules, not
author conversation, private chain of thought or coordinator's verdict. Bind
review invocation/context identity, model revision and provenance; no author/implementer context
of any reviewed component may approve. Verdict: approve, changes-requested or
blocked, with actionable findings/evidence. Coordinator cannot override negatives.
Freshness requires a manifest of isolated initial context without author messages,
plus pinned target/rules/criteria. A new native context id alone is insufficient.
Verified fresh_review adapter records this manifest; manual invocation needs
owner-attested fresh context/model, authority invocation nonce and captured output
digest. Without either evidence route review blocks. No full-history fork or
inherited author conversation, even when child has a distinct native id.

6.2a. Read-only critic need not write queue/log or hold team credentials. An
authorized collector outside that context delivers request and captures unedited
structured output. It submits invocation nonce/manifest, pinned target/model/
criteria and output digest. Store reviewer/context separately from collector/
submitter; collector cannot substitute verdict or impersonate reviewer. Verified
transport binding or owner-attested manual output supplies provenance; without
it output is preliminary. Narrow authenticated RPC is another possible route.
Neither route expands critic filesystem/code rights. Test a real read-only
critic, forged/substituted output and unrelated invocation rejection.

6.3. Attestation binds team, epoch/adoption, work generation, reviewer/context,
model/policy, target digest, criteria digest and material test/evidence digests.
Change any target/base/criteria/evidence invalidates review. Review of a patch
against one base does not approve a conflicted merge against another. Stronger
review model admission before integration raises floor and forces recheck; weaker
earlier approval no longer satisfies final acceptance.

6.4. Final integration requires worker evidence, coordinator diff supervision and
independent top-strength approval for the exact candidate. Resolve findings and
re-review revised target. Artifact critics and code reviewers share protocol,
not acceptance targets. Component changes invalidate composite final approval.

### 7. Git, stories and compatibility

7.1. Teams bind existing artifact/story without giving all members a legacy claim.
Unrelated live story owner requires explicit handoff; team creation cannot erase
its claim. Team ownership/work assignments are separate from heartbeat and stay
visible during reasoning. Non-team story plan/close/claims/commit remain unchanged.
Current-version ownership-changing commands for a bound task serialize with its
binding in the authority mutex. Plan/create recheck live legacy claim there;
foreign claim needs acknowledged handoff. Older binaries/direct Git do not
enforce this and cannot be trusted team participants. Unrelated story API/outcomes
stay unchanged. Heartbeat alone is never the authoritative team-owner record.

7.2. Protected team commit has a narrow claim exception for current integration
reservation and exact authorized paths/snapshot; foreign leases still block.
Shared story/session id grants no rights. Older binaries cannot participate in
protected mutations; require protocol version floor and show the limitation.
Direct Git/editor writes remain outside enforcement. No force/all team bypass.

7.3. Pipeline in dedicated checkout: assemble candidate -> reconcile derived
views -> pin full tree/base/path scope (including derived files) -> supervision
-> independent review -> reserve -> publish. Team commit can check/recompute
reconcile for byte equality, but cannot mutate approved tree. Any change requires
new candidate/review. Reservation pins tree, parents, paths, approvals and HEAD.
States: prepared -> publishing -> published -> acknowledged; aborted/uncertain
require reconciliation. Before publishing recheck identity/policy/floor/epochs.
During publishing, changes invalidating approval or leadership are queued/deferred
until Git operation finishes or is reconciled. Persist this publication fence
under short command mutex rather than holding mutex over long external work;
nonconflicting progress/replies continue. Git ref update uses expected-HEAD CAS.
Stronger admission ordered before publication requires its review floor; after
publication applies to later work. Deferred admission is explicitly pending,
never counted as admitted while publishing an insufficient candidate.
Dedicated index verifies exact tree and no unrelated staged content.
Commit adds Waypost-Team/Work/Review trailers while
preserving Harness/Session/Provider/Story. Record commit id and contributors.

7.4. Git and team log are not one transaction. Crash after commit/before ack:
inspect HEAD/trailers, reserved tree/parents; recover that commit idempotently or
block for reconciliation. Do not create a duplicate commit blindly. Changed HEAD
needs candidate revalidation/review. Story close requires all work integrated,
valid final review and no uncertain execution, through lifecycle gate only.
Parent CLI death does not prove its Git child ended. Recovery retains publishing
fence until child/process group is proven stopped and ref/operation is reconciled;
otherwise integration remains uncertain. No blind retry or fence release by TTL.

### 8. CLI, diagnostics and evidence

Proposed interfaces; none exist yet:

| Command | Purpose |
|---|---|
| team create <artifact> --policy <file> | Bind authority/task and messaging consent |
| team join <team> --model <descriptor> | Mint explicit participant identity |
| team status <team> [--json] | Revision, leader/epoch, ranks, delivery limits/blockers |
| team poll <team> --participant <id> [--cursor <c>] | Bounded addressed messages, no automatic ack |
| team send <team> --participant <id> --request-file <file> | Validate/enqueue typed request |
| team ack <team> --message <id> | Persist receipt/acceptance with credential identity |
| team assign <team> --request-file <file> | Coordinator-only assignment |
| team submit <team> --work <id> --evidence <file> | Correlated worker result |
| team review <team> --work <id> | Request independent strongest review |
| team handover <team> | Reconcile stronger-model promotion |
| team recover <team> | Explain recovery; no destructive default |
| commit --team <team> --work <id> -- <paths> | Integrate reviewed reserved snapshot |

8.1. Brief/next/sessions/ready/doctor show membership, pending messages, uncertain
work and team-owned stories concisely. Explicit participant required if one
legacy session maps to many. No false ready for team-owned story. Doctor checks
log, schema, identity/policy, leader and review eligibility and drift; never
performs election or approves work. Standing context keeps token-budget tests.

8.2. Accepted actions are auditable. Runtime state/credentials are untracked;
no secrets in logs. Errors/records are bounded. Completed-team retention/export
is owner-controlled; version one has no automatic history GC. Reconcile remains
the only writer of derived views. Watch lifecycle never owns participant lifecycle.

## Modules & files on disk

Proposed seams, to validate with a fresh planner before coding:

- scripts/team.mjs: pure reducer, eligibility and invariants.
- scripts/team-store.mjs: serialized log, idempotency/recovery.
- scripts/team-transport.mjs: cooperative queue and capability contracts.
- models/ and .waypost/models/: exact descriptors/policy data and schemas.
- Harness coordination descriptors separate from installed-role confidence.
- bin/waypost dispatch/write boundary; existing modules query team state.
- tests/team*.test.mjs: reducer, concurrent CLI, fault and integration tests.

These proposed files are not code_refs claims of present implementation.

## Testing

| Scenario | Required outcome |
|---|---|
| Equal ranks, stronger join, unknown model | Stable tie, acknowledged promotion, unknown cannot lead |
| Parent/child one legacy id, model/effort switch | Distinct identities; stale privileges refused |
| Concurrent requests, crash publication/reply | One transition; valid-prefix replay, idempotent retry |
| Lost ack, duplicates, stale epoch | No assumed exactly-once effects; stale acceptance refused |
| Leader dies during shared-tree edits | Uncertain scopes blocked, isolated work quarantined |
| Cloud replicas, clock skew | No replica promotion/mutation |
| Top model authored target, revised patch/base | Independent fresh context or blocked; old review invalid |
| Git commit succeeds before ack | Recover same commit, no double integration |
| Foreign claim/lease, unrelated staged files | Refuse/preserve; no broad team exception |
| Idle unsupported harness | Queued/cooperative visible, never claimed awakened |

Unit/multi-process tests prove their local assumptions, not live model identity,
LLM messaging, power-loss persistence or remote transport. Last story supplies
live evidence: harness/model/version/OS, task ids, transcripts and reviewed commit.

## Acceptance

- [ ] Contracts 1–8 have deterministic tests without legacy regression.
- [ ] Named blockers replace silent strength/identity/delivery/gate fallbacks.
- [ ] Strongest selection and fresh independence pass separate review.
- [ ] Claude and OpenCode actually exchange task messages both ways in their
      contexts; different models coordinate one task, demonstrate promotion,
      rejection/revision and integration of the reviewed candidate.
- [ ] Unattended wake is claimed only for live-tested adapter combinations;
      cooperative delivery limits are explicit. Windows/Linux/remote proof separate.
- [ ] Owner approves ADR/activates spec before implementation is treated as agreed.

## References

- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]
- [One task coordinated across harnesses and AI models](../epics/WP-20/epic.md)
- [[0003-agent-roles-across-harnesses]], [[0005-harness-registry]],
  [[0006-commit-protocol]], [[0007-shared-vault-presence]],
  [[0010-coordination-follows-the-repository]]
