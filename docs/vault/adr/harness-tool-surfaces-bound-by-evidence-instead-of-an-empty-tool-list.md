---
type: adr
id: "harness-tool-surfaces-bound-by-evidence-instead-of-an-empty-tool-list"
title: "Harness tool surfaces bound by evidence instead of an empty tool list"
status: accepted
date: 2026-10-08
authors: ["Ivan Morozov"]
tags: ["wp-20", "codex", "isolation", "calibration"]
external_refs: {}
supersedes: null
superseded_by: null
review_status: reviewed
reviewed_at: 2026-10-09
drafted_by: {"harness":"claude","provider":null,"date":"2026-10-08"}
guards: []
code_refs: ["scripts/codex-surface.mjs", "scripts/team-transport.mjs", "scripts/native-model-profile.mjs", "scripts/team-host.mjs", "scripts/team-native-work.mjs", "scripts/team-native-work-review.mjs", "scripts/team-native-delivery.mjs", "scripts/team-quota-native.mjs", "tests/codex-surface-transport.test.mjs"]
---

# Harness tool surfaces bound by evidence instead of an empty tool list

| Field | Value |
|---|---|
| **Status** | accepted |
| **Date** | 2026-10-08 |
| **Authors** | Ivan Morozov |

---

## Context

Every protocol 2 measurement and action admits only a context whose manifest
lists no tools: the calibration capture (`team-role-calibration.mjs`, the
`actual-profile-snapshot-binding` check), the native profile collector
(`native-model-profile.mjs`, `execution_scope.tools: []`) and the action
profile (`team-native-action.mjs`). Claude and OpenCode contexts satisfy it.
A Codex context cannot: the transport records `tools: ['shell.read-only']`
(`team-transport.mjs`, `codexEndpoint`), so a Codex trial is charged and never
captured, and Codex can neither calibrate nor act. The owner wants Codex
(`gpt-6.1-sol`) in the next live cohort (2026-10-08).

What the Codex app-server can and cannot prove (bundled `codex-cli
0.162.0-alpha.2`, schema read from `codex app-server generate-json-schema`):

- It has no request or field that lists the tools the model sees.
- Several tools can be switched off by configuration and the switch read back:
  the features `shell_tool`, `unified_exec`, `sleep_tool`, `tool_suggest`,
  `apps`, `browser_use`, `computer_use`, `code_mode_host`, the `web_search`
  setting, MCP servers and plugins (`config/read`,
  `experimentalFeature/list`); the sandbox (`readOnly`) and the approval policy
  come back in the thread start response.
- Some tools are switched only by catalog or less obvious keys (the plan tool by
  `tools.update_plan.enabled`, `apply_patch` by the catalog), and default-on features carry more (sub-agents, image
  view and generation, goals, hooks, memories, plugins).
- Tool use shows up as turn items (`commandExecution`, `fileChange`,
  `mcpToolCall`, `dynamicToolCall`, `collabAgentToolCall`, `subAgentActivity`,
  `webSearch`, `imageView`, `sleep`, `imageGeneration`, among 19 item types),
  but also as notifications (`turn/plan/updated`, goal, hook and diff
  updates), server requests, other threads, and fields of `agentMessage`
  (`delivery`, `questions`); none of it after `turn/completed` is observed
  today.
- What the model is told and offered comes partly from a server-supplied model
  catalog (`gpt-6.1-sol`: `code_mode_only`, `unified_exec`, a 21 KB instruction
  template) that can change without a version change, and a Codex context on
  this machine loads `~/.codex/AGENTS.md`, memories, skills and the project
  `AGENTS.md`.

So "no tools" is provable for Claude and OpenCode, but for Codex only "no
acting tool enabled, and no tool used in this turn" is.

## Decision

Replace the empty-tool-list rule by a named, versioned **tool surface** that a
context proves with evidence, bind measurements and actions to it, and admit a
verified surface on every path.

1. **Surfaces.** `none` is today's rule (`tools: []`, Claude and OpenCode). A
   missing `tool_surface` key means `none`: the key is left out, never written,
   so stored profiles, captures and logs stay byte-identical (profiles without a
   surface gain no key). Revision 1 adds `codex-no-exec-r1`. The manifest's
   `tools` is the definition's `residual_tools`, which revision 1 leaves empty,
   so the existing `tools.length === 0` checks hold; only `tool_surface` and its
   evidence mark the weaker claim.
2. **Surface definition file** (`scripts/codex-surface.mjs`). The
   version-specific lists — launch overrides, switched-off features, expected
   config values, allowed features, config layers, turn methods and items, raw
   item types, residual tools, probed catalogs — live there; its digest is part
   of the evidence. This ADR fixes the principles, not the lists.
3. **The user's own Codex installation (owner decision 2026-10-08,
   superseding an owned copy).** The surface runs the Codex the user has: the
   CLI bundled in ChatGPT.app, the user's `CODEX_HOME` (`~/.codex`) and login,
   with a sanitized environment (only `PATH` and `HOME`, plus `CODEX_HOME` when
   the descriptor names one), on every Codex spawn site. Nothing in the user's
   installation is edited: tool-bearing features, MCP servers, plugins and the
   user's skills are switched off by session flags (MCP, plugins and skills
   after a discovery launch), and the pinned catalog is a file Waypost writes
   under `~/.waypost`. The user's home instruction files (`AGENTS.md`,
   `AGENTS.override.md`) may load and their content digests are bound; project
   instruction files may not (`project_doc_max_bytes = 0`). The working
   directory is one fixed empty directory outside any project root.
4. **Fail-closed readback after thread start.** `config/read {cwd,
   includeLayers:true}` shows only the session flags, the user's `config.toml`
   and an absent system file, and reports the expected values (web search
   disabled, every switched-off feature `false`, project docs 0, unified exec
   tool off); `experimentalFeature/list {threadId}` shows every enabled,
   non-removed feature on the definition's allowlist; every listed skill is
   `enabled: false`; `hooks/list` is empty; `instructionSources` holds only the
   home instruction files; the sandbox is read-only with no network and
   approval `never`; MCP servers and apps are verified off before and after the
   turn. Anything else leaves the context unverified. The plan tool's switch has
   no `config/read` field; it is off by flag and enforced by the guard.
5. **Pinned, probed model catalog.** The model's entry from the user's cached
   catalog, with the tool-bearing keys removed and the definition's values set,
   is written content-addressed under `~/.waypost` and pinned with
   `model_catalog_json`, confirmed by `config/read`. Only a catalog whose digest
   the definition lists as probed (item 10) is admitted; a refreshed catalog
   stays unverified (`native-surface-catalog-unprobed`) until probed and added.
6. **Frame guard over the turn plus a drain (owner-accepted deviation).** Raw
   Responses events (`experimentalRawEvents`) are required: a receipt with no raw
   `message` item is unverified, and only `message` and `reasoning` raw items are
   allowed (the probe shows tool calls appear nowhere else). Every frame on any
   thread from `turn/start` until 1 s after `turn/completed` is checked against
   the definition's allowlist (methods and item types, default deny): one
   `userMessage`, `reasoning`, and `agentMessage` with `delivery`, `questions`
   and `memoryCitation` null. Revision 1 keeps the plan tool off, so a plan
   frame withdraws isolation; the owner's permission to allow plan updates is
   unused. The output is the one `final_answer` message, or the only message
   when no phase is reported; otherwise it is empty. Anything else withdraws
   isolation for that receipt, which settles tokens and is quarantined. Two
   gaps are accepted: frames between `thread/start` and `turn/start` and after
   the drain are not observed (the Host settles before it closes the process).
7. **Version and configuration bound.** The app-server version (prerelease
   form accepted) and the package, catalog, definition, config-projection and
   instructions digests are recorded in the profile. A package, catalog, config
   or instructions change is a new configuration that needs recalibration; a
   new version stays unverified until a definition revision covers it. The
   config projection omits the skills, MCP servers and plugins the user's
   plugins contribute (their set varies with load timing); they are verified
   off on every launch instead. Codex account semantics are pinned for the
   definition's version; `accountRoutingOverride` must be absent or
   `NO_CONSTRAINT`.
8. **Full participation (owner decision 2026-10-08, superseding "measurement
   only").** A `codex-no-exec-r1` profile is calibrated, ranked and admitted on
   every path a `none` profile is (control actions, work execution and review,
   delivery, `implement`); the reducer's Codex refusals are dropped because an
   admission already needs a capture made with `tools: []`. A guard violation
   quarantines its receipt; withdrawing a surface revision is a manual owner
   step (remove the catalog from the probed list or bump the definition).
9. **Calibration contract amendment.** "No-tools" in the calibration spec means
   the bound surface, `none` or a verified `codex-no-exec-r1`; its Codex refusal
   notes are superseded by this ADR (amended in the spec).
10. **Negative-control probe (manual owner step).** Before a catalog is added
    to the probed list, one probe through the transport asks the model to use
    each tool type (shell, patch, image view, plan, sub-agent, web search, image
    generation, async message, sleep, clock, MCP) with raw events as ground
    truth, and a positive control shows the guard firing; it runs under an
    owner token cap. Probed so far: catalog
    `3085306bb82e2a1541b425f4239aaa73939860c755b871651a4a22e1e424490b`
    (`gpt-6.1-sol`, 2026-10-08) and
    `fefbe074a61b4bf2487f603e37bd06339bdb635785f596f53fc77d26dfc416ce`
    (`gpt-6.1-sol` on 0.162.0-alpha.17.2, 2026-10-11).
11. **The claim.** Revision 1 claims: the user's installation, version- and
    package-pinned, with only its home instruction files (digest-bound), no
    enabled skills, hooks, plugins or MCP, a probed catalog without tool types,
    and no tool frame in the observed window of the receipt. It makes no claim
    that the model sees no tool (the model's own "no tools" report is not
    evidence), and it is macOS-only (the package layout is an `.app`;
    process-tree stop is unverified on Windows).

## Probe evidence (2026-10-08, owner-approved, 37K of 150K tokens)

An owned copy of the package and `CODEX_HOME` (later removed, see Implementation)
(`~/.waypost/codex-home`, separate ChatGPT login), empty cwd, raw Responses
events on, every server request refused.

1. **Catalog as fetched** (`tool_mode: code_mode_only`,
   `multi_agent_version: v2`), all features above off: the model still had
   `functions.exec` (code-mode exec) and `collaboration.spawn_agent` and called
   both. Exec failed only because the code-mode host was off, the sub-agent
   only because the thread was ephemeral. **Neither call produced a thread
   item**: both were visible only as raw `custom_tool_call` / `function_call`
   items. An item-level guard would have missed them; raw events are required.
   22.8K tokens.
2. **Pinned catalog without `tool_mode`, `multi_agent_version`,
   `apply_patch_tool_type`, `web_search_tool_type`, with
   `shell_type: disabled`, `experimental_supported_tools: []`,
   `supports_search_tool: false`, `node_repl_disabled: true`**, plan tool off
   (`tools.update_plan.enabled = false`): the model reported
   `{"available":[]}`; no raw tool item, no server request, no file. 4.8K
   tokens.
3. **Positive control**, plan tool deliberately on: the call appeared as raw
   `function_call` and `turn/plan/updated`, so the guard sees it. 9.8K tokens.

Readback facts on this binary: `features.multi_agent = false` does not remove
`spawn_agent` (the catalog does); the thread feature list keeps reporting
`unified_exec` enabled whatever the config says, so the allowlist accepts it
only together with the pinned catalog's `shell_type: disabled` and the probe;
bundled skills are disabled per name with `[[skills.config]] enabled = false`;
`skills.enabled` is not a setting (Codex warns about unknown settings on
stderr; the transport discards stderr, so the readback compares effective
values instead).

## Probe evidence (2026-10-11, 0.162.0-alpha.17.2, owner-approved, ≈45K tokens)

The ChatGPT.app update brought Codex `0.162.0-alpha.17.2` and a refreshed
`models_cache.json`. The new `gpt-6.1-sol` entry has the same tool-bearing keys
(removed or overridden by pinning as before); only the `model_messages` text changed.
Probes through the transport on the user's installation:

1. **Unchanged code** (version unverified, so the readback stopped early): the model
   answered `{"available":[]}`, raw items only `message` and `reasoning`, no server
   request; the guard withdrew isolation on a new `thread/started` frame. The
   app-server now announces the thread asynchronously after the `thread/start`
   response, so with a short readback the frame lands in the guard window.
2. **Revised definition, negative control:** readback refused
   `native-surface-features-unverified` on a new stable feature `ultrafast_mode`;
   it is now switched off by session flag (`features_off`) rather than allowed.
   Then: readback verified, `adapter-isolated`, `tools: []`, answer
   `{"available":[]}`, raw `message`/`reasoning` only, no server request.
3. **Positive control, plan tool on:** the model did not call it (the plan tool is
   not offered on this version), so it proves nothing.
4. **Positive control, catalog as fetched** (probe-only switch, removed): the model
   called `exec` (raw `custom_tool_call`) and `spawn_agent` (raw `function_call`);
   the guard withdrew isolation (`native-surface-raw-tool-call`) and the readback
   refused the catalog (`native-surface-catalog-tools-present`).

Revision: `version` 0.162.0-alpha.17.2; catalog `fefbe074…` added to the probed set;
`ultrafast_mode` off; the guard allows `thread/started` only for the context's own
ephemeral, unforked thread without a parent (any other is
`native-surface-foreign-thread`). The definition digest changes, so native
profiles of Codex change identity.

## Implementation (2026-10-08/09, Claude Code)

`scripts/codex-surface.mjs` holds the revision 1 definition, its digest and the
probed catalogs; `team-transport.mjs` launches the user's Codex with the
sanitized environment and the definition's switches, discovers and switches off
MCP, plugins and skills, writes the pinned catalog, reads the setup back after
thread start (`inspectCodexSurface`), guards the turn plus a 1 s drain
(`codexSurfaceGuard`), and records `tool_surface` and `surface_evidence`;
`native-model-profile.mjs` refuses an unproven surface and binds it into
`execution_scope`; the Host supervises the absolute executable and the reducer
drops its Codex refusals; Codex account semantics are pinned for
`0.162.0-alpha.2`. Later fixes: plugin-contributed skills, MCP servers and
plugins left the bound config projection (ef27967); after the acceptance review
the readback compares the expected config values and admits only probed
catalogs, a receipt without a raw message item is unverified, and an ambiguous
answer is empty. Live: the provocative prompt through the transport on the
user's installation reported no tool and no tool frame (7,464 tokens), and the
live team run elected Codex coordinator, let it execute and had OpenCode review
it (see References).

## Rationale

1. Calibration only means something if production runs in the context it
   measured; binding the surface into the profile keeps that, whatever the
   surface is.
2. The raw-event guard turns "the tool exists" into "the tool was not used in
   this receipt", which is what an action's safety depends on; a use is caught
   after the fact but never counted.
3. Disabling every switchable tool, in the features and in a pinned catalog,
   and reading it back removes the shell, exec, network and MCP surfaces up
   front, so a misbehaving model cannot act before the guard sees it.
4. Claude and OpenCode keep the stricter `none`; because `none` is the absent
   key, their stored logs and profiles stay byte-identical.
5. Binding the package, catalog, config projection and instructions into the
   profile makes the measured configuration the one that runs: an app update, a
   catalog refresh or an edit of the bound settings is a new configuration,
   never a silent change.
6. Full participation follows the live evidence: the probed configuration
   showed no tool frame, and the run elected Codex coordinator, let it execute
   and had it reviewed.

## Alternatives Considered

### Alternative A: keep `tools: []` strict

**Pros**:
- No change; the strongest guarantee.

**Cons**:
- Codex can never calibrate or act; the owner's three-harness cohort is
  impossible.

**Rejected because**: it excludes a harness for a property the protocol does
not need (no tool use), only a stronger one it cannot prove.

### Alternative B: runtime evidence only (no tool items observed)

**Pros**:
- Smallest change.

**Cons**:
- Shell and network stay enabled; a model can act before the receipt is
  judged.

**Rejected because**: the guard must back up disabling, not replace it.

### Alternative C: raw Responses events only (`experimentalRawEvents`)

**Pros**:
- Sees every function, custom, shell, search and image call directly.

**Cons**:
- Experimental API; still needs disabling and readback.

**Rejected because**: required in revision 1 as the guard's ground truth
(item 6), but not a substitute for disabling and readback.

### Alternative D: ask the model to report its tools

**Pros**:
- Simple.

**Cons**:
- Self-report is not evidence.

**Rejected because**: unverifiable.

## Consequences

**Positive**:
- Codex can join calibration cohorts and protocol actions under a named,
  evidence-bound surface.
- The rule says what is actually proven for each harness.

**Negative / trade-offs**:
- A Codex configuration is weaker isolated than Claude or OpenCode (residual
  built-ins exist), and a Codex receipt with a stray tool item is paid for and
  wasted.
- Each new app-server version needs a read before it is verified.

**What changes in code / process**:
- `scripts/codex-surface.mjs`: the revision 1 definition and its probed catalogs.
- `team-transport.mjs`: the user's Codex with a sanitized environment, launch
  flags, discovery and switch-off of MCP, plugins and skills, the generated
  pinned catalog, fail-closed readback, prerelease version parser, raw-event
  guard over the turn plus a drain, `final_answer` output, `tool_surface` and
  `surface_evidence` in the manifest.
- `native-model-profile.mjs`: an unproven surface is refused; the surface and
  its digests join `execution_scope`.
- `team-host.mjs`, `team-native-work.mjs`, `team-native-work-review.mjs`,
  `team-native-delivery.mjs`: no Codex refusal for a verified surface.
- `team-quota-native.mjs`, `team-transport.mjs`: Codex account semantics pinned
  for 0.162.0-alpha.2, same sanitized spawn.
- The calibration spec amendment (item 9) and a probe per new catalog (item 10).
- A ChatGPT.app update to another Codex version makes the surface unverified
  until a definition revision covers it.

## References

- Calibration spec: docs/vault/specs/objective-native-configuration-calibration-for-protocol-roles.md
- Coordination spec: docs/vault/specs/cross-harness-team-coordination-protocol.md
- ADR: model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review
- Accepted by the owner on 2026-10-09, including the guard-window deviation of item 6.
- Critic reviews (three fresh contexts, revise; 2026-10-08/09) and owner decisions (2026-10-08): quota re-read, probe ≤150K tokens, plan updates allowed as non-acting (unused in r1), the user's own installation (superseding an owned copy) and full participation (superseding measurement only).
- Live run: docs/vault/epics/WP-20/stories/story-participant-identity-and-owner-approved-model-policy.md, section "Live three-harness team".
- ADR: native-configuration-profiles-ranked-by-fresh-role-specific-calibration (the execution scope this extends)

---

*Last updated: 2026-10-08*
