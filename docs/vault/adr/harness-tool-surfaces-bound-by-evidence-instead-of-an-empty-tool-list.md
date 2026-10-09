---
type: adr
id: "harness-tool-surfaces-bound-by-evidence-instead-of-an-empty-tool-list"
title: "Harness tool surfaces bound by evidence instead of an empty tool list"
status: proposed
date: 2026-10-08
authors: ["Ivan Morozov"]
tags: ["wp-20", "codex", "isolation", "calibration"]
external_refs: {}
supersedes: null
superseded_by: null
review_status: pending
reviewed_at: null
drafted_by: {"harness":"claude","provider":null,"date":"2026-10-08"}
guards: []
code_refs: ["scripts/team-transport.mjs", "scripts/native-model-profile.mjs", "scripts/team-role-calibration.mjs", "scripts/team.mjs", "scripts/model-strength.mjs", "scripts/team-quota-native.mjs"]
---

# Harness tool surfaces bound by evidence instead of an empty tool list

| Field | Value |
|---|---|
| **Status** | proposed |
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
- Some built-in tools have no switch (plan updates, `apply_patch` under the
  read-only sandbox), and default-on features carry more (sub-agents, image
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
context proves with evidence, bind measurements to it, and in revision 1 use a
non-`none` surface for measurement only.

1. **Surfaces.** `none` is today's rule (`tools: []`, Claude and OpenCode). A
   missing `tool_surface` key means `none`: the key is left out, never written
   as `none`, `null` or undefined, so every stored profile, capture and log
   stays byte-identical (a test pins a `none` profile digest). Revision 1 adds
   `codex-no-exec-r1`. Under it the manifest's `tools` lists the residual tools
   the surface definition names, never `[]`, and every check that reads
   `tools` becomes surface-aware.
2. **Surface definition file.** The version-specific lists (launch overrides,
   the allowlists of features, config layers, frames and item fields, the
   residual tools, the probe's tool list) live in a versioned surface-definition
   file in the repository; its digest is part of the evidence. This ADR fixes
   the principles below, not the lists.
3. **The user's own Codex installation (owner decision 2026-10-08,
   superseding an owned copy).** The surface runs the Codex the user has: the
   CLI bundled in ChatGPT.app, the user's `CODEX_HOME` (`~/.codex`) and login,
   with a sanitized environment (only `PATH` and `HOME`). Nothing in the
   user's installation is edited: tool-bearing features, MCP servers, plugins
   and the user's skills are switched off by session flags (MCP, plugins and
   skills after a discovery launch), and the pinned catalog is a file Waypost
   writes under `~/.waypost`. The user's home instruction files
   (`AGENTS.md`, `AGENTS.override.md`) may load; their content digests are
   bound into the evidence and the profile, project instruction files may not
   (`project_doc_max_bytes = 0`). The working directory is one fixed empty
   directory outside any project root. The package digest covers the bundled
   CLI directory, so an app update is a new configuration.
4. **Fail-closed readback.** Before the turn: `config/read {cwd,
   includeLayers:true}` shows only the user's `config.toml`, the session flags and an absent system file;
   `experimentalFeature/list {threadId}` shows every enabled, non-removed feature
   on the definition's allowlist; `skills/list {cwds:[cwd], forceReload:true}`
   and `hooks/list` are empty; `instructionSources` is empty; the sandbox is
   read-only with no network and approval `never`. The effective-config digest
   joins the evidence. Anything else leaves the context unverified.
5. **Pinned model catalog.** The model's entry from the user's cached catalog,
   with the tool-bearing keys removed and the definition's values set, is
   written content-addressed under `~/.waypost` and pinned with
   `model_catalog_json`, confirmed by `config/read`. Its
   digest is part of the evidence and the profile. A remote catalog is never
   used for this surface.
6. **Frame guard to process close.** Raw Responses events
   (`experimentalRawEvents`) are required, and only `message` and `reasoning`
   raw items are allowed (the probe below shows tool calls appear nowhere
   else). Every frame on any thread from
   `thread/start` until the process group is confirmed closed is checked
   against the definition's allowlist (methods and item types, default deny):
   one `userMessage` equal to the prompt, `reasoning`, `agentMessage` with
   `delivery`, `questions` and `memoryCitation` null, and plan updates (owner
   decision: a plan changes nothing outside the thread; it is recorded in the
   evidence). The output is the one `final_answer` message, or the only message
   when no phase is reported. Anything else withdraws isolation for that
   receipt, which settles tokens and is quarantined.
7. **Version bound.** The app-server version (prerelease form accepted), the
   package digest, the catalog digest and the definition digest are recorded in
   the profile; any change is a new surface revision and needs recalibration.
   Codex account and rate-limit semantics are re-read for the pinned version
   before its quota is trusted.
8. **Full participation (owner decision 2026-10-08, superseding "measurement
   only").** A `codex-no-exec-r1` profile is calibrated, ranked and admitted
   on every path a `none` profile is (control actions, work execution and
   review, delivery, `implement`), because the probe below showed the pinned
   configuration offers the model no tool at all. If a receipt's guard ever
   sees a tool frame, that receipt is quarantined as above; the surface
   revision is withdrawn when a probe or a guard shows a tool the definition
   did not expect.
9. **Calibration contract amendment.** "No-tools" in the calibration spec
   (contract 4's fresh no-tools context, the leader-ACK turn) becomes "the
   bound surface, where `none` means no tools"; the Codex refusal note is
   replaced by this ADR.
10. **Negative-control probe.** Before a surface revision is used, one
    probe per (version, catalog digest) runs with raw Responses events
    (`experimentalRawEvents`) as ground truth: it asks for each residual and
    turned-off tool type the definition derives from the catalog and the
    features, and includes a positive control (a throwaway thread with one tool
    left on, showing the guard fires). The probe is interrupted from
    `thread/tokenUsage/updated` before the owner's cap (at most 150K tokens,
    approved 2026-10-08).
11. **The claim.** Revision 1 claims: the user's installation, version- and
    package-pinned, with only its home instruction files (digest-bound), and no
    enabled skills, hooks, plugins or MCP; the listed
    residual tools present but either disabled in the pinned catalog or unused
    in the receipt; the model's built-in and catalog instructions present and
    pinned. It makes no claim that the model sees no tool, and it is macOS-only
    (the package layout is an `.app`; process-tree stop is unverified on
    Windows).

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
stderr, which the readback treats as unverified).

## Implementation (2026-10-08, Claude Code)

`scripts/codex-surface.mjs` holds the revision 1 definition and its digest;
`team-transport.mjs` launches the user's Codex with the sanitized
environment and the definition's switches, reads the setup back after thread
start (`inspectCodexSurface`), guards every frame of the turn plus a 1 s drain
(`codexSurfaceGuard`), takes the one `final_answer` message as output, and
records `tool_surface` and `surface_evidence` in the manifest;
`native-model-profile.mjs` refuses an unproven surface and binds the surface
and its digests into `execution_scope`; the Host supervises the
absolute executable and no longer refuses a surface Codex for work or delivery; the
reducer drops its Codex refusals (admission already needs a calibrated profile
captured with `tools: []`). Codex account semantics are pinned for
`0.162.0-alpha.2` with `accountRoutingOverride` limited to `NO_CONSTRAINT`.
Live check through the transport: one call, 4,641 tokens, `tools: []`,
`adapter-isolated`. Deviation: the guard window is the turn plus a 1 s drain,
not process close; the Host settles before it closes the process. Reworked the
same day to the user's installation: on it the provocative prompt through the
transport reported no tool and no tool frame (7,464 tokens), while a probe that
left the user's MCP servers on did call one, so their discovery and switch-off
is required; the config is bound as a projection of security-relevant keys
because the apps rewrite other parts of `config.toml`. The owned copy and its
separate login were removed.

## Rationale

1. Calibration only means something if production runs in the context it
   measured; binding the surface into the profile keeps that, whatever the
   surface is.
2. The turn-item guard turns "the tool exists" into "the tool was not used in
   this receipt", which is what an action's safety depends on; a use is caught
   after the fact but never counted.
3. Disabling every switchable tool, in the features and in a pinned catalog,
   and reading it back removes the shell, exec, network and MCP surfaces up
   front, so a misbehaving model cannot act before the guard sees it.
6. Measurement only keeps the team's selection rules untouched until real
   results show which roles a Codex surface can hold safely.
4. Claude and OpenCode keep the stricter `none`; because `none` is the
   absent field, their stored logs and profiles stay byte-identical.
5. Binding the package, catalog, config projection and instructions into the
   profile makes the measured configuration the one that runs: an app update,
   a catalog refresh or an edit of the user's Codex setup is a new
   configuration, never a silent change.

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

**Rejected because**: a useful extra signal for a later revision, not a
substitute for the allowlist guard.

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
- A versioned Codex surface-definition file.
- `team-transport.mjs`: the user's Codex, sanitized environment, launch
  overrides, fail-closed readback, catalog pin, prerelease version parser,
  default-deny frame guard to process close, `final_answer` output,
  `tool_surface` in the manifest; the quota and inventory spawn sites use the
  same package and home.
- `native-model-profile.mjs`, `team-role-calibration.mjs`: surface-aware
  checks, the surface bound in `execution_scope`; `team.mjs` and the summary
  compiler: non-`none` profiles graded but never ranked.
- `team-quota-native.mjs`: Codex account semantics re-read for the pinned
  version.
- Calibration spec amendment (item 9).
- One negative-control probe (≤150K tokens) before the live cohort.
- A server-forced client upgrade of the pinned version voids all Codex
  calibration until a new revision is verified.

## References

- Calibration spec: docs/vault/specs/objective-native-configuration-calibration-for-protocol-roles.md
- Coordination spec: docs/vault/specs/cross-harness-team-coordination-protocol.md
- ADR: model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review
- Critic reviews (two fresh contexts, revise; 2026-10-08) and owner decisions (2026-10-08): full isolation package, quota re-read, probe ≤150K tokens; then measurement only in revision 1 (superseding calibration plus control actions) and plan updates allowed as non-acting.
- ADR: native-configuration-profiles-ranked-by-fresh-role-specific-calibration (the execution scope this extends)

---

*Last updated: 2026-10-08*
