# Team coordination: implementation status

The `team` CLI is experimental WP-20 coordination on one local host. Addressed
inboxes and managed native endpoints use the same immutable authority. Native
receipts, protected handover, independent review and dedicated Git publication
have versioned transitions and host operations. Their availability depends on
observed adapter capabilities. A mailbox acknowledgement alone does not prove
that a model processed a message; CLI/backend receipts do not prove desktop delivery.

## Managed host operations

Enroll each participant with its own credential, then bind an owner-approved
descriptor in a private endpoint file. Use separate endpoint paths for different
participants. Descriptors never attach implicitly to personal conversations.

```sh
waypost team host TEAM --operation bootstrap --participant PARTICIPANT \
  --descriptor-file native.json --endpoint-file endpoint.json
waypost team host TEAM --operation inspect --participant PARTICIPANT \
  --endpoint-file endpoint.json --action EXACT_ACTION_TOKEN
waypost team host TEAM --operation relay --participant PARTICIPANT \
  --endpoint-file endpoint.json --credential participant.json \
  --limit 10 --max-polls 20 --poll-ms 1000
```

Codex descriptors use `managed: true`, `harness: "codex"`, an absolute `cwd`,
`mode: "read-only"` and optional exact `model_id`/`reasoning`. Claude uses the
same shape, with tools and MCP disabled. OpenCode can use `spawn_server: true`
to start a separate authenticated loopback server with deny-all permissions.
All secret descriptor and credential files must be private. The host closes only
its own processes. An existing desktop socket without a verified protocol is refused.

Relay keeps one native context throughout a bounded polling invocation. It consumes
each addressed question before inference, captures the unedited answer and actual
model metadata, then sends a correlated participant answer and acknowledgement.
Uncertain inference is retained and never silently retried. Budget-required teams
refuse unbudgeted relay calls.

Host operations `checkout`, `candidate`, `review`, `publish`, and
`recover-publication` assemble and publish from a dedicated owned worktree/ref.
Candidate reconciliation precedes immutable review. A candidate without collected
tests explicitly records `tests_status: not-executed`; missing acceptance evidence
must be rejected by the critic. Review requires a collector-verified fresh read-only
native context, exact actual model and the historical strongest review floor.
Publication requires current supervision/review and a persisted project fence;
recovery requires confirmation that the Git child stopped and exact Git facts.

Versioned handover records stopped old contexts, exact retained work, candidate
identity and worker adoption acknowledgements. A revoked previous member needs
collector stop evidence. Legacy story writes, claims and attributed commits are
serialized with task binding and refused while that artifact belongs to an active
team. Close the resolved team before using the legacy artifact lifecycle again.

Invocation reservations retain confirmed spend and uncertain liabilities across
the project pool and task budget. A grant binds the exact model, incarnation,
manifest, route, attempt and policy; the whole provider-quoted maximum is reserved.
Provider pricing/maximum-liability adapters remain necessary for strict dispatch.
An unknown subscription price or unverified maximum cannot authorize a free call.

## Periodic model-strength checks

For an enrolled team, run:

```sh
waypost team refresh <team-id>
waypost team watch <team-id> --interval 300
waypost team status <team-id>
```

These commands use the local owner credential created during team creation.
`watch` remains in the foreground until interrupted. Every five minutes it checks
the enrolled and historically required review-model cohort. Public source requests
are cached for 24 hours; publication evidence expires after seven days. Source
limits are in `models/strength-sources.json`. Cached reads do not advance retrieval
or expiry. Watch is not installed as a background daemon: without it, evidence
still expires and protected actions cannot use it.

Freshness-only refresh preserves priority revision and current work. Changed ranks
invalidate the policy and require acknowledged handover. Source outage records a
failed check without extending expiry. Authority contention retries; cohort changes
during fetch discard the old result. Bounded source cache and row proofs persist
in the immutable authority history for restart and audit.

The first evaluator is the official Arena agent dataset, with confidence-interval
partial-order levels. Its overall results are a proxy for coordination and code
review. Unknown models, unconfirmed reasoning and ambiguous identifiers remain
unclassified; free access never implies a lower rank. Runtime inspection is a separate adapter capability. Bound managed endpoints are
checked on refresh/watch when observations are at least fifteen minutes old;
strict-budget checks require provider-backed control grants. Unbound conversations
remain unverified. Unknown reasoning is unresolved and cannot gain protected rank.
Enrollment of existing personal conversations is unsupported.

## Current commands

`create` binds one vault artifact to one team (`--confirm-local` for first local
authority initialization); `join` enrolls a unique participant with a separate
credential; `leader-ack` acknowledges the strongest eligible candidate. `send`,
`poll` and `ack` provide addressed cooperative messages. `assign`, `work-ack`,
`submit`, `supervise` and `cancel` provide initial assignment transitions with
explicit model evidence. Versioned handover, immutable review and integration
retain exact generation/model/policy bindings. `close-v1` requires integrated or
cancelled work, resolved liabilities and captured or stopped native operations.
An owner may discard a stale deferred command with a recorded reason.

Use `--request-file <json>` for command payloads. Retrying an accepted request
requires the identical request key and original payload, including epoch/time.
Join credentials retain the original enrollment envelope for retry. Credentials
are private machine-local files; do not commit them. Only explicit owner recovery
may release an interrupted authority mutex, after confirming the command stopped.

## Task-aware economical routing foundation

`waypost team route <team-id> --request-file <manifest.json>` validates an immutable
manifest and previews conservative classification. Explicit bounded/reversible
work without risk flags may be routine; missing/unknown risk stays complex.
`models/routing.schema.json` describes the manifest, including exact task-class
qualification floor, concrete scope, criteria digest, tools and whole-cycle budget.

The pure `model-routing.mjs` proposal algorithm chooses the lowest bounded total
cost among qualified routine executors; complex proposals retain the strongest
model cohort even when its price/budget is unavailable. Integer currency units
round upward and include permitted attempts plus reserved coordinator/review cost.
Synthetic collector fixtures test this algorithm; they do not demonstrate billing
or runtime qualification.

The CLI preview has no installed provider billing capabilities,
so it returns concrete blockers and a proposal-only result. It accepts no external
qualification/price file or `trusted: true` admission. `team routing-enable <id>`
requires the owner credential and no unfinished legacy work. It prevents legacy
assignments from bypassing routing. `routing-enable-v2`, collector-sealed grants
and `assign-routed-v2` bind qualifications and reservations. These explicit new
transitions preserve replay of prior non-routing events.

The host API exposes bounded executor dispatch and typed runtime/review/delivery
control grants. Trusted provider adapters must prove the exact endpoint/account/SKU
route and applicable ceiling before dispatch, then reconcile exact invoices.
Worker and control calls consume reservations before inference. Confirmed cost
and uncertain liabilities remain charged; workers protect the unspent control
reserve. Unsupported subscription liability is refused. Native billing adapters
and measured live savings remain unverified. Strongest coordinator/final critics
remain separate from executor cost selection.

## Desktop and cooperative MCP inboxes

Enroll a dedicated participant with `team join ... --surface desktop-code`,
`desktop-chat`, `desktop`, `web` or `cli`. This is descriptive, owner-supplied
metadata. Historical participants report `unknown`. No surface value grants
native delivery, wake or runtime-model capabilities.

The optional zero-dependency stdio MCP server exposes only `waypost_inbox`,
`waypost_send` and `waypost_ack`. Start it with absolute paths:

```sh
waypost team-mcp \
  --project /absolute/project --team TEAM_ID \
  --credential /absolute/private/participant.json
```

The host launches this command as an MCP stdio server. Project, team and
credential are fixed at startup; tool arguments cannot substitute them or set
actor, model, surface or owner authority. The bridge calls `bin/waypost` with
structured argv and no shell. Polling does not acknowledge messages. Send/ack
require a request key, epoch and original ISO timestamp (use `server_time` from
the inbox response); an identical retry retains the same envelope. An uncertain
timeout must be reconciled rather than retried with a fresh key. Peer message
payloads are untrusted data, not system instructions.

Generate a reviewable project configuration without installing it:

```sh
waypost team-mcp-config --harness claude \
  --project /absolute/project --team TEAM_ID \
  --credential /absolute/private/participant.json --name own-team-inbox
```

Use `codex` or `opencode` for their registry formats. The JSON result names the
project target and includes a ready JSON/TOML `snippet` plus structured execution
arguments. The command reads neither credentials nor existing settings and works
without a vault or an existing team. Merge the snippet into settings after checking
the name and participant; preserve other servers. Do not commit a machine-specific
credential path into shared settings. Trust, tool approvals and startup discovery
remain the harness's responsibility. The default preview writes no settings and no native
capability becomes verified. A unique name helps avoid collisions but does not
prove that other chats cannot access the credential.

Add `--write` to create an absent project configuration using the same arguments.
The dispatcher prepares a private file, flushes it and publishes it with an
exclusive hard link. Existing files, directories and symlinks are refused, even
if their content matches the snippet; use the preview for a manual merge instead.
Only project settings are eligible: Git/Waypost metadata and another harness's
`.claude` directory are rejected. Parent directories are checked for symlinks;
these checks assume a trusted local filesystem and do not prevent hostile
concurrent ancestor replacement. Hard-link support is required; POSIX `0600`
does not establish Windows ACL protection. No credentials, approval policy or
native capabilities are changed. A successful result sets `written: true` and
`preview_only: false`; `cleanup_pending` reports a leftover private temporary
file separately from installation success. A crash before publication can leave
a private temporary file; directory durability after power loss is not certified.

This proves only actions by a participant credential holder. A global MCP config
can expose one credential to multiple chats: those chats share an inbox and are
not independently identified. Use dedicated test participants and do not treat
MCP handshake or tool calls as receipts from a particular native conversation.
Stopping the bridge does not leave the team, release claims or remove leases.
It grants no assignment, leader, execution-model attestation or review tools.
Initialization and tool discovery do not authenticate membership: call
`waypost_inbox` to verify current participant access. The authority rechecks the
credential and incarnation for every subsequent action, including after revocation.
Startup accepts exactly one project, team and credential argument; duplicate or
unknown flags fail before protocol output. Invalid UTF-8 frames are parse errors,
not silently repaired messages.

Claude Desktop Code reads project `.mcp.json` alongside CLI configuration.
Current [official desktop documentation](https://code.claude.com/docs/en/desktop)
also says local Code sessions receive servers from Chat's
`claude_desktop_config.json`; that definition wins a same-name conflict. The
standalone CLI does not read that Chat file. A shared server may therefore expose
one participant credential to several conversations and surfaces. Configuration
discovery is not native identity or delivery verification. MCP framing
follows the [stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
and [tools protocol](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
No global desktop config has been modified automatically.

Live macOS observation (2026-10-01): a dedicated Claude Desktop Code conversation
returned a test token, then recalled it on a second turn without the token in
that prompt. No visible tool calls occurred. The weekly all-model badge showed
100% during both successful replies; that badge is not provider exhaustion
evidence. This verifies interactive desktop continuity only, not Waypost MCP
exchange, native execution reasoning, independent review or unattended wake.

Confirmed on macOS: fixture MCP clients exchange addressed questions/answers
through the real CLI, retain idempotent retries and reject foreign/stale acks.
Native CLI-only probes separately completed two turns in newly created Claude,
Codex and OpenCode contexts. Claude reported `claude-opus-5-5`; Codex reported
`gpt-6.1-sol`, OpenAI, low reasoning; OpenCode CLI frames did not report an exact
model. These probes are not desktop delivery evidence. Claude Desktop's Code UI
was observed, but no message was sent to an existing user conversation.

Live macOS observation (2026-10-02, Claude Desktop 2.19675.0): a new local Code
conversation in an empty synthetic project discovered its project `.mcp.json`
server. With one-call approvals in Manual mode, it read an addressed question,
acknowledged it, refreshed the inbox and sent an answer with the original
`reply_to`. The random token was absent from the user prompt. The peer's real CLI
poll confirmed the returned token and sender at authority revision 6, epoch 0.
This verifies a cooperative desktop MCP round trip in that observed conversation.
Its 65.5k context and displayed model/effort are not fresh-context or execution-model
attestations. The fixture used unknown models and granted no protected roles.

Pending: independently bound native session addresses, unattended wake,
actual-model inspection and the full cross-harness execution/review/integration
loop. OpenCode on this laptop is CLI-only, as confirmed by the owner.

## Provider quota and role redistribution

New CLI teams opt into versioned automatic quota redistribution. Existing teams
can enable it with the owner-authorized `quota-policy-enable-v1` transition once outstanding legacy work has been reconciled. The transition refuses unfinished work rather than stranding existing review approvals.
The host `observeQuota` callback admits provider observations, and automatically
drives `driveQuotaHandover` when a strongest available successor exists. Neither
operation invokes the exhausted coordinator to obtain permission to stop.

Only an explicit provider account/model or pool exhaustion proof can exclude a
model. Task budgets, local allocations, reservations, generic 429, timeouts and
UI usage percentages do not establish this fact. Historical strength and stable
review admissions remain intact; status exposes historical/effective floors and
quota revision. Review/grant/publication bindings reject stale quota revisions.
Reset time and expiry do not restore quota; a fresh positive proof is required.

Codex has a default nonbillable collector: a dedicated owned app-server reads
account and rate-limit metadata twice, checks authorization continuity, and
closes without creating a thread. Account identifiers are hashed; emails are not
persisted. Exact model scope is required for model-level permission. Backend
workspace exhaustion can establish account scope only when all reported credit
alternatives are explicitly depleted. Unknown model aliases, credits or account
metadata produce named blockers, never inferred exhaustion. Availability is a
fresh permission to attempt, not an invoice or a guaranteed call allocation.
Other providers still require injected trusted observers.

With automatic redistribution enabled, watch waits at most 30s between inspection
passes; slow probes can outlive permission TTL and checkpoint renewal then blocks
stale dispatch.
cached strength discovery retains its source freshness rules. Before inference,
hosts renew existing positive permission within 15s of expiry. Failed renewal
blocks dispatch. Expired negatives stay exhausted until a fresh positive proof.
Register each participant explicitly with its own credential:
`waypost team host <team> --operation register-participant-host --participant <id> --credential <file> --collector-credential <file> --endpoint-file <file>`.
The owner-bound private manifest fixes the participant's credentials and runtime
directory. The resolver never searches for credentials or imports personal chats.

Standard managed read-only CLI hosts now supervise whole operations. A private
authenticated loopback stop capability waits for native closure and the outer
callback, including invoice and patch handling. Durable epoch barriers fence new
work before enumeration. Consumed ids require ledger coverage even after invoice
settlement. Missing records, vanished parents, legacy unsupervised running work,
external servers, workspace-write backends and custom executables block automatic
stop. Candidate handover checks use authority-bound read-only control in the target
epoch; they do not reopen old work admission. A negative quota record observed
within an operation defers redistribution until that operation drains.
If fencing arrives before callback entry, the still-live launcher records an
unstarted closure with no consumptions or native processes. An abandoned intent
cannot receive that proof from recovery, age or a missing PID; it stays blocked.

POSIX closure verifies held roots and their original process groups. Escaped
descendants are outside that proof; the default contract is limited to the standard
read-only adapters with isolated tools. Windows process-tree closure remains
unverified and blocked. Uncertain dispatches and unresolved invoices remain held
during redistribution. CLI `redistribute` reports the exact missing capability.
Desktop quota badges alone are not provider evidence.

On macOS, 2026-10-01, an independent owned Codex CLI
probe exercised whole-operation closure with actual `gpt-6.1-sol / low`, verified
context isolation and a durable stopped receipt after the callback/process ended.

## Subscription token accounting increment

The owner may explicitly select the versioned `subscription-tokens` mode with
`waypost team subscription-accounting-enable-v1 <team-id> --request-file <policy.json>`.
The request contains `{"policy":{"bootstrap":true},"revision":1}`; this is an owner
operation, not a participant assertion. Existing strict monetary admission remains
a separate mode. Unfinished invocations, active work and unreconciled reviews
prevent migration. Token estimates do not enforce a provider monetary cap.

The authority records allocations per authenticated account/origin/SKU/native
counter schema, shared across teams within that authority. Bootstrap reservations
allow only bounded identity or synthetic calibration attempts, never worker,
coordinator or reviewer privileges. Collector-bound terminal receipts preserve
actual overshoot, stale-epoch usage and uncertain outcomes. Missing usage retains
the reservation; duplicate native counter spans cannot be charged twice.

Historical subscription v1 provides the journal and migration gates. Its default native
execution-context collector is still unavailable: `team status` reports
`native_dispatch: "blocked"`, and host inference refuses before launch with
`host-subscription-execution-context-collector-unavailable`. User-supplied JSON
cannot establish execution account/mode or complete token telemetry. Native
collectors, calibrated routing and the executable team driver remain pending.
See the proposed ADR **Subscription CLI token accounting with separate strict
billing enforcement** and the coordination protocol specification.

Codex transport additionally returns `usage_span` with the exact owned native
thread and correlated turn, native counter schema, baseline/terminal boundaries
and the difference of `totalTokens`. Cached and reasoning subsets are not added
again. `coverage: complete` describes a continuous observed native counter span;
it is not a provider invoice or an assertion that every billing charge is exposed.
Missing, conflicting, decreasing or foreign-turn counters remain partial/absent
and break baseline continuity. This path has fixture coverage and independent
review; the inherited-native v2 host below connects this telemetry to subscription admission.

The preferred owner-selected mode is subscription v2, enabled by
`team subscription-accounting-enable-v2` with
`{"policy":{"bootstrap":true,"billing_policy":"inherited-native"},"revision":1}`.
It inherits existing native billing policy and reports unavailable fields as
unknown. It does not enable credits, alter provider settings or add API fallback.
Historical subscription v1 keeps its stricter account-route checks for replay.

A v2 owned Codex or OpenCode host provides `--operation subscription-bootstrap --nonce <unique-id>`
with explicit `--estimate-tokens` and `--max-tokens` local advisory bounds. This
performs one fixed read-only synthetic identity-token probe, consuming its ledger
attempt before inference. It neither calibrates model strength nor promotes any
role. Reusing an invocation ID refuses without another native call. Native token
usage shares a team/schema allocation across its own contexts, never an invented
provider-global account pool. Billing changes preserve usage and quarantine the
context. Economical worker dispatch and strongest final review remain pending.

An owned Codex CLI synthetic probe on 2026-10-03 returned the requested token,
reported `gpt-6.1-sol / low`, and settled an observed cumulative span of 18,516
tokens. Reusing its nonce refused before another native call; no model or role
was promoted. Owned-runtime closure confirmed child stop and callback drain.
An account initialization notification made the first metadata read inconsistent,
so that receipt honestly quarantined the context while retaining usage. The host
now permits one nonbillable recapture before admission; continuing instability
still remains explicit. This is bootstrap evidence, not model calibration,
provider billing verification or a complete reviewed cross-harness task.
After that correction, a second owned synthetic probe settled 19,207 native
tokens with consistent metadata and no quarantine; nonce replay again refused,
the context was retired, and no model or role was promoted.

The OpenCode CLI collector uses a separate owned server and local
`opencode-native-normalized-step-total-v1` unit. Its native normalized buckets
are disjoint: input + output + reasoning + cache.read + cache.write. The final
assistant's `info.tokens` is only the last step; it cannot stand for the whole
request. The collector must correlate its caller message ID, terminal assistant
parent, message/part IDs and bounded own history, and verify deny permissions
before and after inference. Coverage describes observed completed step buckets,
not provider attempts or billing. Missing/zero/conflicting counters retain the
hold; a gap permanently breaks continuity in that context. Route provider IDs
remain routing observations, not model authorship or strongest-role proof.
The counter semantics are checked against OpenCode 1.18.33; other versions must
remain unverified until checked rather than inheriting that evidence by shape.
On 2026-10-03 an owned OpenCode 1.18.33 host using the already connected
`opencode-go / longcat-2.5-preview-free` route returned the fixed synthetic token
and settled 5,469 observed normalized step tokens. Nonce replay refused before
another native call; the context was retired, remained unresolved and granted no
protected roles. Read-only deny rules passed before and after the call. Provider
route and effective reasoning remain distinct; reasoning is unknown.

Earlier successful output retained an uncertain hold because native POST and
stored history JSON had different object key order. Structural comparison now
checks exact values and array order while allowing object key reordering; altered
counters, parent IDs, text or part order still fail. That earlier receipt is not
retroactively declared complete. An earlier default `opencode / big-pickle` call
returned APIError 403 with no completed step; it remains failed with unknown
usage, not zero usage or a verified quota-exhaustion event.
Primary sources: [native normalization](https://github.com/anomalyco/opencode/blob/v1.18.33/packages/opencode/src/session/session.ts),
[step accounting](https://github.com/anomalyco/opencode/blob/v1.18.33/packages/opencode/src/session/processor.ts),
and [prompt correlation](https://github.com/anomalyco/opencode/blob/v1.18.33/packages/opencode/src/session/prompt.ts).

### Claude terminal token telemetry

The Claude transport reports `claude-native-first-turn-total-v1` separately
from subscription admission. Complete telemetry requires the first owned fresh
turn, exact native session and terminal UUID, one turn, an observed empty native
tool set and no nested/tool activity. The four mandatory terminal buckets are
input, output, cache creation input and cache read input. Their sum uses integer
arithmetic; reasoning output is already included and is not added again.
The corresponding buckets in the bounded flat `modelUsage` map must match.
Native model web-search and terminal server-tool counters, when present, must
explicitly report zero activity; malformed buckets cannot hide tool activity.
Missing, malformed, conflicting, foreign, late or repeated-turn evidence cannot
be repaired by a later frame or interpreted as zero usage.

A terminal failure retains its bounded original receipt when counters are
available. Complete describes observed terminal token buckets, not an invoice,
provider-global quota or every hidden provider attempt. Native dollar estimates and the documented `costBasis` pricing-table marker
are ignored. Optional native `thinkingTokens` must be a nonnegative safe integer
within output tokens and is never added to the total. The distinction between per-turn main-loop `usage` and accumulated
whole-call `modelUsage` makes the fresh single-turn boundary essential.
See [Claude SDK usage tracking](https://code.claude.com/docs/en/agent-sdk/cost-tracking).

Claude subscription Host admission remains unsupported: nonbillable pre-inference
isolation inspection has not been verified. Transport telemetry does not enable
bootstrap, calibration, coordinator acknowledgement or protected task execution.
Desktop telemetry requires its own observation. On 2026-10-03, a separate owned
Claude Code 2.1.286 CLI session returned `OK` with observed
`anthropic / claude-opus-5-5`, unknown reasoning, empty native tools and a complete
first-turn span of 1,851 tokens (2 input, 4 output, 0 cache creation, 1,845 cache
read). Owned process-group closure was confirmed. Two earlier smoke calls stayed
partial until the observed `thinkingTokens` and documented `costBasis` fields were
handled; their receipts were not reclassified. This verifies transport telemetry,
not Host subscription admission, calibrated strength, role election or desktop
execution.


### Native configuration observation foundation (protocol 2)

After an already admitted and accounted successful owned bootstrap, the host
can return a detached `native_profile` observation and explicit
`native_profile_status: retired-observation`. This does not make the retired
context eligible or alter enrollment, policy, ranking or protected roles.
Validation failure leaves settled token usage intact and reports a profile
blocker. The collector never performs another inference or extends a receipt's
original observation time.

A process-local trusted collector binds participant/incarnation/model revision,
caller token, invocation and native/context IDs. Its immutable canonical profile
fingerprint separates requested configuration from observed native route/model,
version provenance and isolation/environment scope. Effective reasoning and model
authorship remain unknown where the native route does not prove them. OpenCode
version evidence comes from native health; a descriptor's requested version alone
is not observed runtime evidence. Detached JSON cannot mint trusted observations
or calibration. The proposed reviewed native-configuration ADR remains proposed;
role-specific common-cohort calibration, versioned policy/action admissions,
historical review identity migration and periodic discovery are still pending.


Live on 2026-10-03, a separate owned OpenCode host probe settled 5,484 observed
native step tokens and returned a protocol 2 retired observation with native
health version 1.18.33, unknown effective reasoning and `rank_eligible: false`.
The nonce retry refused and no enrollment or protected role changed. This proves
capture compatibility, not calibration or a protected cross-harness task.


The installed `team-role-suite.mjs` now generates 24 coordinate and 24 review
cases with fixed prompts, answer keys and grader digests. A bounded parser rejects
nested duplicate JSON member names, including escaped equivalents. Exact grading,
per-family/total/safety gates and finite-suite Wilson intervals are tested.
`qualified` is a mathematical result from raw answers; `authority_granted` is
always false. Caller-built answers cannot become authenticated model scores.
Authenticated native measurement admission and sealed receipts are available
through the host operations below. Complete common cohorts and policy activation
remain pending; these trials do not grant roles.


### Authenticated single-call calibration trials (protocol 2)

An owner opens an immutable cohort after collecting its members' native profile
IDs and setting token allocations for each native counter schema. The bounded
request contains only `id`, `seed`, `members`, `roles`, `unit_allocations` and
`expires_at` (at most fifteen minutes ahead). Each member binds participant,
incarnation, model revision, descriptor digest and profile ID. Each allocation
binds its existing unit digest, token limit and allocation revision. Different
native counter schemas retain separate limits. The host derives installed suite
and grading digests; the request cannot supply prompts, answers or scores.

```sh
waypost team host TEAM --operation calibration-cohort-open --request-file cohort.json
waypost team host TEAM --operation calibration-trial --participant PARTICIPANT \
  --endpoint-file endpoint.json --cohort COHORT --case INSTALLED_CASE \
  --nonce UNIQUE_NONCE --estimate-tokens 16000
waypost team host TEAM --operation calibration-summary --cohort COHORT
```

Each trial consumes its installed prompt and immutable profile/role/case slot
before one inference in a separate owned empty read-only context. Another case
cannot reuse a consumed native context. Another nonce cannot retry the consumed
slot, including failed or uncertain calls. Undispatched aborted reservations do
not consume a slot. Trial admission never expands native or cohort allocations.

The bound collector seals the original bounded answer, native receipt and clocks.
The reducer regrades that sealed answer using installed criteria, then retains an
immutable capture. Incorrect or duplicate-member JSON is an accounted failure,
not a reason to retry. A missing answer or invalid optional measurement seal
leaves known exact-bound native token accounting intact, with no usable capture.
Incomplete native counters retain an uncertain hold; billing or isolation changes
quarantine the context. Retirement and historical capture do not extend expiry.

`calibration-summary` regrades authenticated journal captures, reports incomplete
or expired role coverage and sets `policy_applied: false`. It does not classify
an architecture-capable model or authorize protected work. The finite suite
covers only Waypost protocol coordination and review; implement remains untested.


Live on 2026-10-03, a fresh OpenCode 1.18.33 `opencode-go / longcat-2.5-preview-free`
owned host first accounted 5,471 native identity-probe tokens, then 5,729 native
trial tokens. The terminal original JSON was captured and locally graded passing;
the same case with a different nonce refused before inference. The summary retained
one coordinate sample and no review samples, both unqualified, with no policy or
roles applied. This verifies one authenticated trial, not a completed cohort.


### Diagnostic role-specific policy proposal

`waypost team host TEAM --operation calibration-policy-proposal --cohort COHORT`
reads the authenticated authority snapshot through the installed host. It verifies
sealed captures again on a clone and regrades original answers. The compiler accepts
only the process-local minted summary, rejects detached JSON/copies and preserves
original calibration expiry. It reports snapshot authority revision and capture,
suite and grading digests; no source URL or owner score substitutes for those facts.

Coordinate and review priorities are computed separately from qualified common
role coverage and Wilson intervals. Disjoint intervals alone establish a stronger
edge. Overlap retains the entire uncertainty frontier; 22/24 and 24/24 qualified
results in this finite suite overlap and cannot prove an order. Missing, incomplete,
failed-family or changed-enrollment coverage yields `null`. Reaching the earliest
bound expiry blocks the proposal and requires fresh measurements. Implement is
always `null` because this suite does not test it. No Arena proxy score is copied
into these priorities. The output is `automatic-calibration-proposal`, with
`activation: false` and `authority_granted: false`; existing policy/action gates
refuse it. Fresh execution admissions, historical review requirements, protected
token routing and complete calibrated native cohorts remain separate work.

### Applying protocol calibration to candidate election

Create a separate owner-selected team with `waypost team create TASK --id TEAM
--native-policy-bootstrap` to prepare native calibration without the legacy automatic
quota policy. Ordinary team creation retains automatic quota redistribution. This
new creation marker avoids recording unknown legacy tuples as review requirements;
existing historical requirements are never removed.

After settled authenticated trials, the owner can run `waypost team host TEAM
--operation native-policy-install --cohort COHORT --policy-revision CURRENT`.
The authority recomputes the summary from its own immutable captures and installs
qualified role coverage, participant identity admissions and the entire strongest
review frontier atomically. The store supplies its actual revision. Imported policy
or summary JSON grants no admission. Active work, unresolved accounting, pending
native operations, automatic quota policies or uncovered historical identities
block installation. Publication defers the operation.

This selects protocol coordinator and independent critic candidates. The critic
must be a different ready participant at or above the retained review frontier;
installation without one is refused. Installation does not acknowledge a leader,
execute work or create an independent review context. Architecture and implementation
coverage remain absent; legacy protected actions and policy downgrade are refused.
New action admission, typed quota handover and full native execution remain separate
work. Original capture expiry applies and recompilation does not renew observations.

### Bounded native coordinator acknowledgement

For an idle forming protocol-v2 team, the owner may explicitly enable
`--operation protocol-control-enable --request-file control.json`. The request
contains `revision` and `policy`: `kind: "protocol-leader-ack"`,
`allow_unknown_quota: true`, `max_calls`, decimal-string `max_estimate_tokens`,
`timeout_ms`, `expires_at`, and `unit_allocations` with `unit_digest`,
decimal-string `max_tokens` and the existing `allocation_revision`.
These ceilings must fit existing native allocations and calibration expiry.
Known exhausted quota refuses dispatch; unknown quota remains unknown. This
explicit policy neither expands allocations nor changes inherited billing.

`waypost team host TEAM --operation native-leader-ack --participant PARTICIPANT
--action-id ACTION --nonce NONCE --estimate-tokens TOKENS` sends one fixed
no-tools request in a fresh owned Codex or OpenCode context. The request binds
the strongest current coordinator, strongest independent critic, native profiles,
original calibration, policy revision and exact current/next epoch. The response
must be a strict JSON object with exactly `ack: true`, `action_id` and
`request_digest`. Duplicate keys, extra fields and foreign bindings are refused.

Usage is settled before admission. Malformed responses, changed profiles,
partial counters or failed closure retain their charges or unresolved holds.
A consumed semantic election slot cannot be retried with a new nonce or action ID.
The authority applies the epoch change only after the owned callback drains and
the process group closes, then rechecks the original source and current frontier.
`--operation native-leader-ack-recover --invocation INVOCATION` derives that same
owned completion from its journal without sending another model turn or renewing
source clocks. An active team's critic is recomputed when readiness, revocation
or freshness changes; historical review requirements remain retained.

This acknowledgement grants only protocol coordinator election. It does not
authorize architecture, implementation, worker dispatch, integration or review
execution, and the selected critic still needs a separate verified context.
The current Codex transport reports a read-only shell capability; native profile
admission requires an empty tool set and therefore refuses that configuration.
Codex token accounting alone does not establish eligibility for this action.

### Periodic native model inventory

`waypost team host TEAM --operation model-inventory` gathers advisory model
metadata through a separate owned Codex app-server or OpenCode server. Codex uses
`model/list`, including every page; OpenCode uses health and `/provider`. No thread,
session or model turn is started. Selected execution models and reasoning settings
are omitted from this metadata descriptor. Claude has no verified inventory adapter
and records an unsupported result before launch.

`waypost team refresh TEAM` and `watch` check each due bound descriptor scope at
most once per cycle. Inventory is due every 15 minutes, including after a failed
attempt; successful observations expire after one hour. Failed, oversized,
malformed, partial or late replies preserve the previous successful snapshot and
its original expiry. Catalogue removals require a complete valid response in the
same descriptor, adapter/schema and filter scope. A disconnected provider remains
advertised, with its connection status recorded separately.

`waypost team status TEAM --model-inventory` includes candidate details; ordinary
status shows candidate counts. Entries contain native route/model IDs, advertised
requested reasoning/variant options and explicit native input/output price hints.
Unknown currency, price units, authorship and effective reasoning remain unknown.
An advertised zero price is neither quota availability nor permission to run.
Raw credentials, provider options, descriptions and responses are not published.

Inventory cannot change policy, calibration expiry, retained strongest review
requirements or role admission. Protocol-v2 periodic refresh only checks original
calibration freshness and reselects candidates; it does not run identity inference,
fetch proxy scores or silently purchase a new calibration cohort. Fresh calibrated
execution admission and economical worker dispatch still require their own gates.
