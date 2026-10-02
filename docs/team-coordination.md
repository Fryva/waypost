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
