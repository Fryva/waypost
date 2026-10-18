---
type: adr
id: "budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot"
title: "Budgeted read-only role evaluation over a sealed source snapshot"
status: accepted
date: 2026-10-18
authors: ["Ivan Morozov", "Codex (OpenAI)"]
tags: []
external_refs: {}
supersedes: null
superseded_by: null
review_status: reviewed
reviewed_at: 2026-10-18
deciders: "Ivan Morozov; explicit acceptance in chat 2026-10-18"
drafted_by: {"harness":"codex","provider":null,"date":"2026-10-18"}
code_refs: ["scripts/team-cli.mjs", "scripts/team-host.mjs", "scripts/team-subscription.mjs", "scripts/team-transport.mjs", "scripts/codex-surface.mjs", "scripts/run-budget.mjs", "tests/team-host.test.mjs", "tests/team-subscription.test.mjs", "tests/codex-surface-transport.test.mjs", "scripts/evaluation-source.mjs", "scripts/codex-evaluation-surface.mjs", "scripts/team-native-action.mjs", "tests/evaluation-source.test.mjs", "tests/evaluation-transport.test.mjs"]
guards: []
---

# Budgeted read-only role evaluation over a sealed source snapshot

| Field | Value |
|---|---|
| **Status** | accepted |
| **Date** | 2026-10-18 |
| **Authors** | Ivan Morozov |

---

## Context

The owner approved 250,000 Codex native tokens on 2026-10-18 for the paired
N1/A1 smoke, including setup and judges. The machine admission budget
`waypost-token-smoke-20261018` is set for `codex-thread-cumulative-total-v1`;
preflight status is spent 0, reserved 0. Driving/preparation sessions are outside
that record and remain unknown cost, not zero. No experiment inference started.

Preflight found two independent blockers:

1. The installed user Codex CLI is `0.163.0-alpha.10.2`;
   `codex-no-exec-r1` covers only `0.162.0-alpha.17.2`.
   `nativeVersionStatus` returns `native-surface-version-unverified`.
2. No existing budgeted Host operation accepts an arbitrary read-only research
   task with snapshot-scoped source navigation. `subscriptionSingleCall` chooses
   fixed identity/calibration/control/work/delivery prompts. Active budgets
   refuse legacy uncounted calls. The no-exec surface intentionally disables
   tools and uses an empty cwd; ordinary read-only sandboxing does not prove
   snapshot-only reading. Merely refreshing the version cannot run N1 unchanged.

These are missing capabilities, not proof that the optimization saves or wastes
any tokens. The frozen protocol remains unchanged at SHA256
`1367c5ece03fe81815b563fd44f6bb24c330d1a1e1b81132be9d9bbe1e49ec1d`.

## Decision drivers

- Execute original role tasks with independently discoverable source evidence.
- Retain the current machine budget and authority ledger; no second ledger.
- Preserve no-exec protected work, identity/calibration contracts and strict mode.
- Keep the judge key, opposite arm and personal/project files outside the source
  snapshot unavailable to model tools; cwd/read-only alone is insufficient.
- A new operation must justify its maintenance cost. Building it solely for two
  measurements may cost more than the savings; that trade-off needs the owner.

## Considered options

1. **Defer the live pilot.** Keep static policy checks and spend no pilot tokens.
   Lowest engineering cost; yields no behavioral/token comparison.
2. **Add a narrowly budgeted read-only evaluation route (proposal).** Reuse native
   v2 accounting and owned supervision, with a separate evaluation purpose and
   a bounded source broker. Enables repeated role evaluation but needs a new
   Host/reducer/transport contract and version-specific evidence.
3. **Use direct headless shell sessions/manual accounting.** Available CLI tools
   do not establish the required budget admission and snapshot read boundary.
   Not a conforming substitute for this protocol.
4. **Preload source text into no-tools calls.** A different experiment could
   measure answering from a packet, but cannot test navigation/re-read policy.
   It must be separately registered, not relabelled as N1/A1.

## Decision

The owner accepted option 2 in this chat on 2026-10-18, including the separate evaluation surface, version/catalog controls and preregistered protocol revision within the existing 250,000-token allowance. Acceptance authorizes implementation; runtime capability remains unverified until its gates pass.

### Operation and authority

Add an explicit read-only evaluation operation from CLI to Host and an additive
versioned reservation purpose/contract in the existing subscription reducer.
Do not disguise an evaluation as identity, calibration, protected work or peer
payload. Owner consent pins task/role/prompt, source-manifest and broker-policy
hashes, requested model/configuration, timeout and ceilings before any call.
The original task text is unchanged; the arm role/skill is delivered explicitly
as separately hashed instructions. Actual identity is observed before tasks.
Evaluation receipts grant no strongest-role rank, qualification, leader/work/
review privilege, code write, publication or model routing change. The manifest
names the real read/search tools; never report them as `tools: []` or use an
evaluation capture as a no-tools qualification. Existing profile admission remains
unchanged; diagnostic evaluation metadata is not a protected-role profile.

Every invocation uses existing run-budget admission and native counter schema,
consume-before-dispatch, terminal receipts, retained uncertainty, quarantine,
owned stop and callback drain. Count all tool-mediated model iterations inside
the native span, not one final response. Missing/decreasing/conflicting counters,
late frames or an unproven stop preserve unknown cost/reservation and block the
next call. Binding a new purpose must not make historical events replay
under different semantics. Never auto-raise allocations or policy caps.

The current Codex adapter infers first-turn zero only when **terminal** cumulative
counters equal last-response counters. A tool loop can have cumulative greater
than last and currently becomes partial. Add a distinct first-turn launch gate:
a bound earliest counter frame whose cumulative equals last may establish the
same existing zero-anchor rule, then retain that anchor across subsequent
monotonic frames to the terminal snapshot. Validate native/turn ownership and all
subset fields at each step; no inferred zero from thread freshness alone. If the
early anchor is absent, contradictory or arrives after unaccounted inference,
the whole fresh turn stays unknown. Do not insert a model warmup into each of the
eight contexts or subtract a later partial snapshot as though it covered the turn.
Fixtures and a counted multi-iteration read/search control must prove initial
anchor, intermediate counters, terminal total and complete loop coverage before
tasks. This is a required collector change, not already supported behavior.

### Source broker instead of general shell access

Keep the model's process in an empty cwd, network off, acting tools disabled.
Expose only named read/search callbacks over one predeclared immutable snapshot
manifest. No shell, arbitrary commands, writes, external MCP, network, spawned
agents or access to the operator's result/key directories.

Each callback validates the bound thread/call, exact input schema, portable
manifest-relative path and content hash. Reject absolute/traversal paths,
symlinks, linked worktrees/git indirection and non-manifest files. Construct the immutable byte buffer first, verify its manifest hash, then build
every range/search result from that same verified buffer. An open descriptor alone
does not prevent in-place writes; do not hash-then-reread it. A new content version
requires a new manifest before dispatch, never a mid-attempt refresh. A search covers only manifest files, uses a bounded literal query,
and returns capped pointers in manifest-relative path byte order then line order.
Every response states truncation and a continuation cursor bound to manifest,
query and next position; no silent loss at the cap. Range reads cap bytes/lines.
A callback is bound to thread/turn/call id and input digest. Identical duplicates
return the recorded response without repeating source access; changed-input or
foreign replay fails closed. Duplicate traffic still counts toward transport
limits. After terminal/stop reject callbacks without source bytes, preserve
request/result pairing and retain evidence; never attach a result to another turn. Bind per-call and
whole-invocation callback counts/bytes before launch; exceeding them ends the
attempt, not an automatic expansion. Expand evidence by further permitted reads,
not by reducing acceptance criteria. A version-1 broker needs no vendored code
index; index absence is recorded identically in both arms.

The transport checks effective source/tool/configuration identity before and
after the turn, rejects foreign-thread or unregistered tool traffic and closes
owned processes before accepting final accounting. Keep personal auth through
the user's supported local installation/home; do not create/copy credentials.
Common global rules and explicit role instructions are separately hash-bound
approved inputs in both arms; reject unexpected instruction sources, automatic
memory/skill/plugin content and project docs. The source boundary is not a claim
that the model sees no global instructions or billing metadata.

### Evidence and compatibility gates

Create a separately named/versioned read-only evaluation surface; do not weaken
`codex-no-exec-r1`, add native shell access to it, or silently replace its version.
A new CLI/catalog/definition requires owner-authorized revision and negative/
positive controls, as in the accepted surface ADR. This proposal requests that
manual step together with the evaluation-route decision; the numerical pilot
allowance alone did not authorize it.

Local schema generation on installed `0.163.0-alpha.10.2` (no model session)
shows experimental `ThreadStartParams.dynamicTools`, `DynamicToolCallParams`
and `DynamicToolCallResponse`. This supports investigating a callback broker;
it does **not** prove effective tool isolation, model visibility, counter coverage
or runtime ABI compatibility. Fail closed if the supported implementation cannot
verify the proposed guarantees; schema presence is not a verified adapter.

Owner approval must include preregistering a new protocol revision/hash for the
evaluation surface, evidence controls and same-turn baseline rule **before any
inference**. The original protocol's ban on capability search cannot silently be
reinterpreted. Keep original N1/A1 task text, rubrics, AB/BA, common source and
eight role calls unchanged; report any changed tool/configuration scope explicitly.

Keep live setup/control, including identity and negative/positive controls, within
the original four-call setup ceiling and the already approved 250,000 allowance;
no extra calibration/model search. If adequate controls need more calls or
engineering changes require a different measurement protocol, stop and register
that change before inference. Do not repurpose pilot calls or raise the cap.
Pre-register this bounded control schedule in the new protocol revision:

- C0, **no inference**: version/schema/config readback, source-manifest traversal
  checks, descriptor ownership/stop and callback replay/late-frame fixture tests.
- C1, one counted call: fixed identity/observed configuration and native span;
  retire the context after normal owned close/drain.
- C2, one counted call: fresh first-turn read/search over harmless sealed
  control files, requiring multiple model iterations. Prove permitted callbacks,
  denied non-manifest paths, early anchor through terminal usage, no unexpected
  native tools and normal owned close/drain. A denial result is recorded; it
  must not expose outside bytes or manufacture a source hit.
- C3, one counted positive control: a harmless probe-only dynamic tool name
  outside the allowed surface. Its model request must trip the guard before
  any callback side effect; keep complete terminal native accounting if available
  and permanently quarantine this control context. The updated protocol must
  explicitly classify this expected violation as control evidence, not weaken
  ordinary task stop rules. If terminal cost remains unknown, stop the pilot.
- The fourth permitted setup slot is unused, not a hidden retry. Any required
  additional inference/control is a new protocol decision before further calls.

Fixture cancellation tests plus normal live closure do not claim that every
abnormal runtime timeout was exercised. The owned timeout mechanism must still
be bound and fail closed on any unproven closure; never replace an unknown stop
with a zero charge. If C2 cannot observe the early anchor, C3 cannot both prove
its guard and retain terminal accounting, or these controls cannot fit the
existing call/budget ceilings, record failure and admit no tasks.

Preserve four task roles/four judges, AB/BA, common source, blind keys and review
reserve. No protected task starts before version/catalog/read-scope/counter/
identity/owned-stop evidence passes. Runtime or model/config drift stops new calls.

## Consequences

Positive: role evaluation can test discovery on identical source without broad
filesystem access, while reusing admission, receipts and uncertainty semantics.
The new route is explicitly separate from protected workflow authority.

Costs/risks: a source broker and another operation need tests and version evidence;
experimental callbacks may change. Results concern that broker/tool surface,
not automatically the user's normal shell/codegraph workflow. This instrument
can cost more tokens/maintenance than it saves; no ROI or saving is claimed.
Preparation/driving costs remain unknown until separately measured.

## Verification and follow-up

Independent critic and owner acceptance completed on 2026-10-18. Version/catalog controls and protocol revision are authorized within the unchanged pilot allowance.
After approval, implement one slice at a time in existing modules. Required checks:

- Old strict/v1/v2 replay and no-exec behavior remain unchanged; no authority
  promotion or alternate model/billing route through evaluation events.
- Budget concurrency, omitted schema, exhausted cap, no automatic raise, judge
  reservation, crash/unknown outcomes and no replay of consumed attempts.
- Source traversal/absolute path/symlink/git indirection, changed hash and check/
  read race, foreign thread/call, oversized queries/ranges/results and total
  callback limits; deterministic truncated search/continuation, duplicate and
  changed-input callback replay, post-terminal/stop callbacks and correct pairing;
  no operator key or opposite-arm access.
- Wrong version/catalog/config or unexpected native tool/raw frame fails before
  protected work; already consumed usage is still charged or remains unknown.
- First fresh tool-mediated multi-iteration turn: earliest valid zero anchor,
  monotonic intermediate snapshots, complete terminal delta; missing/late/foreign
  anchors remain unknown. No per-context model warmups or hidden extra calls.
- Owned timeout/callback drain and terminal accounting remain possible at budget
  exhaustion; stopped/unknown contexts never become zero-cost successes.
- Fixture checks first; then owner-authorized counted controls on the installed
  user CLI. Only actual verified evidence can enable the frozen pilot.

The execution story remains in progress, recording failed launch gates. None of
this converts the existing smoke into a completed experiment.

## References

- [[harness-tool-surfaces-bound-by-evidence-instead-of-an-empty-tool-list]]
- [[subscription-cli-token-accounting-with-separate-strict-billing-enforcement]]
- [[enforce-the-owners-token-budget-for-live-runs-across-teams]]
- [[paired-token-economy-experiment-with-blind-acceptance]]

*Accepted 2026-10-18; implementation and runtime evidence tracked by stories.*
