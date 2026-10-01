# Team coordination: implementation status

The `team` CLI is an experimental foundation for WP-20. Its authority and addressed
inboxes work across harness identifiers on one local host. Native session delivery,
execution-model inspection, independent review collection and reviewed Git
publication remain unfinished. A mailbox acknowledgement is not proof that a
model processed a message.

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
unclassified; free access never implies a lower rank. Runtime inspection of the
actual execution model is a separate adapter capability and is currently reported
as unverified. Automatic enrollment/checkpoint refresh and verified calibration
execution remain pending.

## Current commands

`create` binds one vault artifact to one team (`--confirm-local` for first local
authority initialization); `join` enrolls a unique participant with a separate
credential; `leader-ack` acknowledges the strongest eligible candidate. `send`,
`poll` and `ack` provide addressed cooperative messages. `assign`, `work-ack`,
`submit`, `supervise` and `cancel` provide initial assignment transitions with
explicit model evidence. Handover reconciliation and review/integration transitions
remain pending, so a team with work cannot yet be closed.

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

The current CLI has no trusted task-class, tariff/quota or invocation collectors,
so it returns concrete blockers and a proposal-only result. It accepts no external
qualification/price file or `trusted: true` admission. `team routing-enable <id>`
requires the owner credential and no unfinished legacy work. It prevents legacy
assignments from bypassing routing. `assign-routed-v1` cannot grant execution until
the required collector/reservation capabilities are installed. These explicit new
transitions preserve replay of prior non-routing events.

Real economical dispatch, account-pool reservations, consume-before-dispatch
recovery and measured savings remain pending. Strongest coordinator/final critics
are separate from executor cost selection.

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

This proves only actions by a participant credential holder. A global MCP config
can expose one credential to multiple chats: those chats share an inbox and are
not independently identified. Use dedicated test participants and do not treat
MCP handshake or tool calls as receipts from a particular native conversation.
Stopping the bridge does not leave the team, release claims or remove leases.
It grants no assignment, leader, execution-model attestation or review tools.

Claude Desktop Chat and the Claude Code desktop tab have separate MCP settings
([official desktop documentation](https://code.claude.com/docs/en/desktop)).
Do not copy CLI configuration and call desktop support verified. MCP framing
follows the [stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
and [tools protocol](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).
No global desktop config has been modified automatically.

Confirmed on macOS: fixture MCP clients exchange addressed questions/answers
through the real CLI, retain idempotent retries and reject foreign/stale acks.
Native CLI-only probes separately completed two turns in newly created Claude,
Codex and OpenCode contexts. Claude reported `claude-opus-5-5`; Codex reported
`gpt-6.1-sol`, OpenAI, low reasoning; OpenCode CLI frames did not report an exact
model. These probes are not desktop delivery evidence. Claude Desktop's Code UI
was observed, but no message was sent to an existing user conversation.

Pending: live bridge calls from dedicated desktop conversations, independently
bound native session addresses, unattended wake, actual-model inspection and the
full cross-harness execution/review/integration loop. OpenCode Desktop installation
was not found in the inspected `/Applications` directory or enabled app inventory;
other installation locations were not ruled out.
