---
type: runbook
slug: "paired-token-economy-experiment-with-blind-acceptance"
title: "Paired token economy experiment with blind acceptance"
status: draft
date: 2026-10-17
authors: ["Ivan Morozov"]
tags: []
---

# Paired token economy experiment with blind acceptance

## Purpose

Prepare a two-task paired smoke of the role-policy change, not a benchmark of
Waypost's entire workflow. This document authorizes no native call or budget
change. Status: prepared protocol; launch gates below remain unsatisfied.
The later 12-task/four-group cohort is **not frozen or executed**. No conclusion
about implementation, reviewer or team-cycle quality follows from these two tasks.

## Prerequisites

- Owner approves a numeric allocation for this named experiment and native schema,
  including identity/setup/control, four task roles and four fresh judges. Proposed
  initial allowance for discussion: 250,000 Codex native tokens; it is not set.
  Do not silently switch vendors/models or use purchased-credit/API fallbacks.
- Before **any native call**, record requested model/reasoning/tool configuration,
  exact harness/version, role source/render hashes, global rules hash, OS,
  task/rubric/prompt hashes, timeout, request stop mechanism, native counter schema,
  accounting route and numeric owner event. Missing configuration or verified
  accounting blocks even setup. Obtain observed model/configuration through the
  bounded, counted setup/identity calls and bind it before the first task/judge
  call. Requested aliases alone are not observed identity; mismatch or missing
  observed identity stops protected work. No expensive model substitution.
- Use existing owner-assigned native v2 admission/receipts where available, with
  an explicit per-call estimate and timeout. `waypost team budget status` is
  read-only; set/raise/clear only after the owner answers in chat, as required by
  [[enforce-the-owners-token-budget-for-live-runs-across-teams]]. No active budget
  was observed during preparation on 2026-10-17.
- The admission cap is not a hard provider cap. Estimates can overshoot; driving
  sessions, cooperative MCP and other machines are not included. Account their
  experiment-related usage separately or label whole-experiment cost unknown.
  No automatic allocation raise, policy raise or reserve release is permitted.
  Authoring/planning/critique sessions are real preparation costs, not zero-cost
  work: they have not been isolated/measured by this experiment. Retain them as
  unknown one-off preparation cost unless verified later. Report a scoped paired
  task metric separately; whole-experiment cost/savings stay unknown while this
  preparation or driving-session cost is unknown.
- Isolated fresh read-only contexts and project directories per task/arm/judge;
  model/tools/rules held identical across arms except the three role bodies and
  review-skill treatment. No mandatory code index dependency. Record index state.

## Steps

### 1. Freeze inputs and isolate source

Baseline: `246ba861a8fa66a7fd3c8e18ab1c92088d7a693b`.
Treatment source: `0baae601a56e9aae014890b7c640de44215adabe`.
The production code relevant to N1/A1 must be byte-identical across these refs;
only the delivered role/read-policy treatment is being compared. If not, stop.
Use this protocol's prompts/rubrics unchanged; changing one creates a new protocol
revision before any results are observed, not a replacement for a failed case.

Use baseline as the common project-data snapshot for **both** arms. Overlay only
`agents/planner.md`, `agents/critic.md`, `agents/reviewer.md` and
`skills/waypost-review/SKILL.md` from the treatment source in the treatment arm;
retain baseline bodies in the baseline arm. Generate native role/skill copies
with the same baseline CLI/config in both arms. Record all overlay/render hashes;
do not bring treatment docs/tests/epic changes into the worker data snapshot.

Create disposable repositories from the common baseline with only that history,
not linked worktrees exposing this runbook's later answer key. For example, in a
new empty session-owned directory: `git init`, then `git fetch --depth=1
<source-repository> <full-frozen-commit>` and `git checkout --detach FETCH_HEAD`.
Check available objects/history and files: no later runbook, local answer key,
prior result, judge feedback or opposite-arm conversation may enter a worker's
context. Enforce read-only access limited to this snapshot and approved tools.
If that isolation cannot be provided, do not call the exercise blinded.

Keep the private arm-label map, rubrics and receipts in operator scratch outside
worker directories. Record per-context cwd/native id and source hash manifest.
Never copy credentials into Git or reports. Existing authentication may be used
only through the harness's supported local flow; do not invent an isolated
CODEX_HOME authentication workaround.

### 2. Original task prompts (send without the rubric)

**N1 / navigation / planner:**

> Trace Waypost story plan/close from the CLI to the pure transformation, write
> boundary, team gate, session claim/release and derived-view regeneration.
> Explain dry-run behavior, race protection and what happens if coordination
> fails. Name the smallest source seams and existing regression tests that a
> future lifecycle change would need. Read-only: do not implement or write.

**A1 / artifact / critic:**

> Independently review these three technical claims for the current source.
> Identify any material errors, explain the correct behavior and cite source
> evidence. Read-only; do not edit files or treat the claims as trusted facts.
>
> 1. In offline Codex accounting, the first nonzero cumulative snapshot is fully
>    charged as new usage, including when its total equals last-turn usage.
> 2. Cached input and reasoning output are extra tokens added to input plus
>    output to obtain native total.
> 3. A 21.5144% explicit Waypost role share in covered native spans proves that
>    Waypost consumed 21.5144% of the weekly subscription limit.

Both arms receive identical original tasks, requirements, read access and neutral
source root pointers. The role definition comes from the explicit arm overlay on the common snapshot;
no author's conclusions/history are supplied. N1 uses planner, A1 uses critic.
There is no code-writing worker or additional planner/critic cycle in this smoke.

### 3. Fixed sequence and stopping

Precommit arm order: N1 baseline then treatment; A1 treatment then baseline.
Four task-role calls, each in a fresh context. A role call can issue several
native requests/tool turns; eight role calls below do not mean eight requests.
No retries, replacement cases, repeat judge, prompt tuning or calibration.
Allow at most four additional native setup/identity/control calls; if the verified
route needs more, stop before new calls and revise the protocol before results.
Their cost remains inside the same allowance. No new model/capability search.
One timeout or unknown outcome stays in the attempt manifest and ends new task
admissions; finish accounting/owned-stop closure, never replay a consumed call.

The exact owned adapter timeout/request ceilings must be recorded at launch:
proposed task/judge wall timeout 180 seconds, with no automatic retry. If the
adapter cannot enforce/observe the declared request/stop boundary, block launch
rather than claim a hard request limit. Timeout is not proof that a provider
stopped; retain uncertain reservations and use existing owned-stop evidence.

Before tasks, earmark at least half the approved allowance for the four judges
and remaining setup/control accounting. For each next call, require remaining
allowance for its estimate **and all remaining mandatory judges' estimates**.
The current budget does not itself reserve later stages: maintain this stricter
operator admission check, do not claim a new ledger guarantee. If capacity is
insufficient, stop; a task without judgement is unaccepted, never review-waived.
Known quota exhaustion, model/config/source drift, lost ownership or unknown
telemetry also stop new admissions. Raising a cap requires a new owner answer;
it starts a separately reported extension, never rewrites the original cap.

Report cold/fresh-context status and any observable cache reads. Fresh contexts
are not proof of cold provider cache. Do not combine unknown/cold/warm conditions
into a causal savings estimate. This smoke has one pair per task, no inference
about variance or statistical significance.

### 4. Blind acceptance (operator/judges only)

After workers finish, assign opaque candidate ids, remove arm labels and timing/
cost metadata from results, and randomize candidate presentation with a recorded
seed. Four independent fresh judges each receive one candidate, its original
prompt, this task's rubric and a neutral source snapshot containing identical
production files. All four judges use the same critic body from the treatment
source and identical judge configuration/prompt; judge policy does not vary by
candidate arm. Ask for pass/fail per rubric item with source evidence and a final
accepted/not-accepted result. No worker transcript, worker policy version,
opposite result or author conclusions. Judges may independently inspect source/contracts. Record
any arm leakage and downgrade the comparison to non-blind/inconclusive.

N1 passes only if all these facts are supported with real source pointers:

- `handleStory` invokes the pure `story-section` computation and returns preview
  without writing. The helper supplies original hash/status/timestamps.
- The dispatcher checks vault bounds and original bytes, lazily loads
  `withTeamArtifactGate`, rechecks bytes inside that gate and writes atomically.
  Missing/broken gate is fail-closed, not permission to skip it.
- Claim/release follows the write; coordination failure warns rather than
  silently proving successful coordination. Derived views then reconcile.
- Relevant boundary/race tests are identified. Exact line-number agreement is
  not required; unsupported behavior or missing any required stage fails.

A1 passes only if it rejects all three claims with source-backed corrections:
first snapshot is baseline; nonzero prefix remains unknown/uncharged; cached
input/reasoning are subsets; covered role share is neither full overhead nor
weekly subscription quota. Invented counter/billing guarantees fail.

Source-key pointers: `bin/waypost.mjs` (`handleStory`, `claimForStory`),
`scripts/story-section.mjs`, `scripts/team-legacy.mjs`, `tests/scripts.test.mjs`
(boundary/race cases); `scripts/token-codex.mjs` (`reduceCodexHistory`, summary,
measurement), `scripts/tokens.mjs`. These pointers guide, not replace, independent
verification. Judge disagreement/invalid judgement is recorded, not repaired by
another paid judge under the same protocol. It makes that pair inconclusive.

### 5. Account every attempt and report

Keep a local row per task/arm/call/attempt: native context/invocation id, purpose,
configuration and source/prompt hashes, receipt/report path+SHA256, native schema,
input/cache/output/reasoning fields, total or unknown, status, stop/uncertainty,
elapsed time, returned source characters/repeat evidence when observable, opaque
candidate id and judge result. Use native verified receipts/reports, not caller
self-estimates. Count failures, setup/control, judges and unexpected attempts;
an unexpected extra call also violates the fixed protocol. Deduplicate native
spans; cached/reasoning subsets are not added again. Do not mix vendors/schemas.

The offline `tokens` CLI filters dates as UTC **YYYY-MM-DD**, not minute windows,
and does not provide a task/native-context selector. A shared cwd/day report is
not task accounting. Use isolated per-context sources with verified complete
coverage or exact owned v2 receipts; archives, unknown prefixes or unrelated
usage can make aggregate reports unusable. Missing/partial totals remain unknown,
not zero. Receipt-schema and offline-rollout-schema units are not automatically
interchangeable; pick one verified scheme for both arms before launch.

Per arm show worker cost, judge cost and shared overhead separately, plus full
experiment total. Shared setup/control cost is included once in total and split
50/50 in the arm metric by a precommitted convention, not silently dropped.
Also show total without this arbitrary split. Primary descriptive metric:
all allocated native tokens for the arm / independently accepted tasks.
Zero accepted tasks fails; any unknown cost means that metric and paired saving
are unknown. Show each task's pair and accepted counts; do not drop expensive or
failed attempts. No saving verdict if treatment accepts fewer tasks overall or
within either group, introduces a material defect, violates isolation/config/
cache comparability, or leaves accounting incomplete. Two pairs cannot establish
the original 15-25% hypothesis or 12-task/four-group workflow performance.

## Verification

Preparation checks only: frozen refs resolve; required source/test paths exist;
N1/A1 production inputs match across refs; no runtime code or budget is changed;
protocol has independent fresh-context critique/review. These are not live checks.
Before launch additionally verify every prerequisite and owner allocation. After
execution retain results, failed attempts, coverage/uncertainty and blinded scores
before publishing any conclusion. Lack of a valid pair is an experiment outcome,
not a reason to substitute an easier task.

## Rollback

On a stopping condition admit no new calls. Complete existing terminal accounting
and owned-stop reconciliation; preserve uncertain reservations and raw evidence.
Do not reset/stash/clean the shared checkout or delete other sessions' files.
Release only this experiment's claims/leases. Remove only its disposable source
copies after evidence is retained. Restore any temporary budget only through an
owner-authorized clear/change; do not erase budget owner events or receipts.

## Common Issues

A stale or absent code index falls back to direct scoped reads in either arm.
A role losing its receipts, ownership or complete usage is not a zero-token win.
A full-budget reservation for one call does not prove review can be admitted.
A same-model alias does not establish the same actual model/configuration.
A hash identifies an input; it does not establish the truth of a claim.

## References

- [[0003-agent-roles-across-harnesses]]
- [[0008-token-budget]]
- [[subscription-cli-token-accounting-with-separate-strict-billing-enforcement]]
- [[enforce-the-owners-token-budget-for-live-runs-across-teams]]

*Prepared 2026-10-17. No live experiment was launched.*
