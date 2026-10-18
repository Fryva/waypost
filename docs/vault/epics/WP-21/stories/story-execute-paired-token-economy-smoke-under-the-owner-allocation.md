---
type: story
id: "story-execute-paired-token-economy-smoke-under-the-owner-allocation"
epic: "WP-21"
title: "Execute paired token economy smoke under the owner allocation"
status: in-progress
priority: p2
assignee: "Ivan Morozov"
created: 2026-10-18
updated: 2026-10-18
external_refs: {}
tags: []
code_refs: ["docs/vault/adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md", "docs/vault/ops/paired-token-economy-experiment-revision-2-over-a-sealed-read-only-source.md", "scripts/team-host.mjs", "scripts/team-transport.mjs", "docs/vault/ops/revision-3-compatibility-controls-under-the-unchanged-allowance.md"]
specs: []
started_at: "2026-10-18T03:24:43.347Z"
closed_at: null
plan_updated_at: "2026-10-18T22:52:11.793Z"
---

# Execute paired token economy smoke under the owner allocation

| Field | Value |
|---|---|
| **Epic** | [WP-21](../epic.md) |
| **Status** | in-progress |
| **Priority** | p2 |
| **Assignee** | Ivan Morozov |

---

## Description

The owner approved the prepared 250,000 Codex-native-token pilot on 2026-10-18. Execute the frozen two-task protocol only after all gates pass; retain blocked preflight and unknown costs as outcomes, never bypass them. Initial launch failed before inference on CLI version and missing budgeted source navigation. The owner accepted the separate route, implemented/reviewed in 2efc42f. Revision 2 and C0 preparation below supersede those initial blockers; C1 subsequently ran and failed the event-surface gate; C2/C3 and all tasks/judges were stopped under the frozen protocol. This story is not done.

## Decomposition

<!-- Granular checklist of concrete tasks. Each item should be small enough to complete in a session. -->

- [x] Record owner consent, budget status and non-model version preflight.
- [ ] Establish a supported original-task route with verified source isolation and native accounting after the separate owner decision.
- [ ] Execute the fixed four task/four judge calls or record runtime stop outcomes; publish complete scoped cost and acceptance evidence.

## Implementation Plan

Initial preflight followed the frozen runbook SHA256 `1367c5ece03fe81815b563fd44f6bb24c330d1a1e1b81132be9d9bbe1e49ec1d`. Read-only nativeVersionStatus is allowed before model calls. The independent launch planner verified that no supported existing budgeted route accepts the original tasks with sealed-source navigation: version refresh alone is insufficient. Record the fail-closed stop and propose the missing route for owner approval; do not change protected surface definitions, purposes, prompts or receipts to force execution. Continue only after explicit architecture/surface decision, implementation/review and live controls within the existing budget/call ceiling.

## Acceptance Criteria

<!-- How do we know we're done? Each criterion testable. Checked only with
     evidence at close: - [x] <criterion> — evidence: <test | command | file:line> -->

- [x] Numeric consent and machine budget are recorded; native version gate is checked without inference. — evidence: /tmp/waypost-token-smoke-20261018/budget-before.json; /tmp/waypost-token-smoke-20261018/preflight.json
- [ ] Runtime version/catalog, original task/role delivery, snapshot read boundary, identity, accounting and stop/drain are independently verified before tasks.
- [ ] All fixed tasks/judges and failed/unknown attempts are retained with receipts, blind acceptance and counter/source identities; no replacement or cap raise.
- [x] Result distinguishes scoped comparison from unknown preparation cost and whole-week quota; no saving claim when required coverage or quality is missing. — evidence: retained C1 stop report and controlled-stop record below.

## Final Summary

Not complete; neither registered phase established live compatibility or paired savings.

- Revision2: one C1 returned C1_READY but the then-unregistered `turn/moderationMetadata` failed the surface gate. Observed7520 had partial coverage; the owner subsequently accepted7520 as an assumed budget charge and closed that stopped team. It remains a failed control, not verified full usage.
- Separately owner-authorized revision3 control-only phase: one C1 returned C1_READY but failed `native-evaluation-moderation-binding` for the now-registered method. Observed7518 again has partial coverage and actual_tokens null; the owner later accepted10000 as an assumed experimental charge. Its owned process stopped/drained; C2/C3/workers/judges/retries0. Its owned completion is reconciled; the owner accepted the already-counted10000 as an assumed experimental charge and closed the stopped team. Actual usage remains unknown. No new comparison was launched.

## Technical Notes

Budget `waypost-token-smoke-20261018`, schema `codex-thread-cumulative-total-v1`, cap 250000, spent/reserved 0 at preflight. Installed CLI 0.163.0-alpha.10.2 versus pinned 0.162.0-alpha.17.2; blocker native-surface-version-unverified. The Host has no arbitrary budgeted read-only role task, and no-exec suppresses source navigation. Proposed follow-up: [[budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot]]. Native experiment calls 0 is an operator workflow observation, not provider-wide usage; these authoring/review sessions are real unknown preparation cost. Protocol and existing surface code unchanged. Independent critic first requested a whole-loop zero-anchor gate and immutable-buffer reads; both were corrected in the proposal. Final design verdict ship on 2026-10-18, reviewed design SHA256 b95182cfe0e57cec5e05d825687ed45d64ef5b72ceb88e9461bfa80daba4a134 (before recording review metadata). That sentence described the initial pre-acceptance state; owner acceptance and implementation subsequently completed, while live controls remain outstanding.

### Preregistered revision 2 before inference (2026-10-18)

Owner accepted the sealed-source ADR; implementation story is done at `2efc42f`. Independent protocol critic returned ship at SHA256 `8df690fa0080a26e669508b88f2df4f63887f737bbedeebb2b2395973142836e` for [[paired-token-economy-experiment-revision-2-over-a-sealed-read-only-source]]. Original runbook bytes remain unchanged. Controls are C1 identity, C2 multi-iteration read/search plus denied non-manifest path, C3 actual forbidden probe; setup fourth slot unused. No model capability search or budget increase.

C0 non-inference inspection on installed Codex CLI 0.163.0-alpha.10.2 verified effective configuration, model gpt-6.1-sol/low and owned stop, using timeout 180000. Four newly enabled features were explicitly disabled on the new surface; old no-exec definition is unchanged. Evidence: `/private/tmp/waypost-evaluation-20261018/c0-final.json`, same-dir checked source/test manifests and logs. This is not live first-turn/tool-loop accounting proof.

Three separate shallow baseline-only copies contain 562 identical UTF-8 source files (5857827 bytes), with 56 recorded identical omissions; roles/skills are explicit separately rendered inputs and only the four allowed files differ in treatment. Broker seals all copies with manifest digest `c9d9485f229d2f54078c12a280a3c0a37a781c9980a98200580755d1f19c83d9`. Source count ceiling 1024, total 8 MiB, per-file 1 MiB, all other callback caps frozen before inference. Source/renders/substitution rules, original prompts/rubrics, AB/BA, four tasks/four blinded judges and protected future-judge reserve 125000 are frozen in `/private/tmp/waypost-evaluation-20261018/pilot/launch-manifest.json`, SHA256 `2b1736327ed3c82d28a8f21cbe535e5c0f4a858ade928fa67394a3d9e3b5b9f6`.

At this registration: native pilot inference calls 0, machine budget spent/reserved 0, cap unchanged 250000. Existing authoring/review costs remain unknown outside that pilot counter. Any failed control or unknown counter/stop stops further calls; runtime conditions remain unsatisfied until C1–C3 proof is retained.

### Revision 2 controlled stop after C1 (2026-10-18)

Preregistration commit `9c24c43`, code implementation `2efc42f`. C1 admission verified all source hashes, request hash and machine allowance: remaining 250000 >= estimate 5000 + future-judge reserve 125000 + remaining control estimates 25000. Frozen launch SHA256 remains `2b1736327ed3c82d28a8f21cbe535e5c0f4a858ade928fa67394a3d9e3b5b9f6`; protocol SHA256 remains `8df690fa0080a26e669508b88f2df4f63887f737bbedeebb2b2395973142836e`.

Exactly one native inference was started: `subscription-wp21-c1-20261018`, gpt-6.1-sol/low. Output was exactly `C1_READY`. However the pinned guard observed `turn/moderationMetadata`, absent from the accepted frame list, and correctly failed closed. CLI exit 0 means the Host returned a recorded uncertain result, not that C1 passed. Its early zero anchor and terminal counter report 0 → 7520; coverage is partial, actual_tokens null, accounting_valid false, context quarantined, broker calls 0. Do not relabel that observed counter as verified full usage or retroactively pass C1 after changing code.

Owned closure and callback drain are confirmed by ledger-bound completion. At the controlled stop the authority invocation remained `uncertain`; the original 5000-token reservation was retained, with no owner acceptance or manual settlement/release. Machine budget after stop: cap 250000, spent 0, reserved 5000, displayed remaining 245000; that displayed balance is not permission to bypass the uncertainty latch. The observed total exceeds the soft estimate, demonstrating that an admission estimate is not a provider cap. Reforecast controls before any proposed new run; never auto-raise policy/allocation or silently reduce estimates.

C2/C3 calls 0, task roles 0, judges 0; no retry or fourth setup slot. Stop applies to the entire registered revision. Local generated version-specific schema names this notification and requires metadata/threadId/turnId, but schema presence alone does not authorize adding a frame and rerunning a failed control under the frozen protocol. A future proposal needs bounded thread/turn/schema checks, regression tests and a separately registered control schedule; accepting unknown C1 usage is an explicit owner action. No new inference is authorized by this outcome record.

Private raw evidence (ignored by Git, local permissions only) is retained under `.waypost/experiments/wp21-smoke-20261018/`; earlier temporary paths are historical input identities. Important files: `pilot/C1-result.json` SHA256 `fe867b3148cb037e3f0726bf7dcde5a45fe2308436a7dcf116849fdd0941f94f`, `pilot/C1-stop-report.json` SHA256 `5847c7f8890310af078dd8ba2e374e595c27605ee2461b74ad8d44cd90dadadf`, and `pilot/C1-owned-completion.json` SHA256 `40f6411a05a0faa17481511170fe52a408f4837d1fc80b356274f871b28e6483`. Source manifests, role renders, templates, budget snapshots, reviewed-source/test logs and ABI excerpts remain with them. Only our disposable source copies and regenerable full schema were removed (31877750 bytes); original Git refs and exact manifests reconstruct source data.

After C1, `waypost doctor` reports 0 issues and 4 warnings: three existing unrelated warnings plus the intentionally retained partial-receipt admission blocker. Mechanical repair cannot authorize a charge or retry.

This is a launch/compatibility stop, not a quality comparison of the optimized roles. Preparation/driving/review costs and full C1 cost remain unknown, and native totals have no weekly subscription-quota denominator. Neither token savings nor whole-workflow overhead can be inferred from this failed pilot.

### Owner-authorized accounting resolution (2026-10-18)

The owner explicitly accepted the recommendation to count 7520 as an assumed C1 charge, close the stopped team and commit this report; this consent authorizes no new pilot. The Host reconciled the exact owned completion, then recorded `unknown-usage-accept` with charged_tokens 7520. `close-v1` closed only `wp21-smoke-20261018` and released its artifact binding, allowing the ordinary Waypost report commit.

Verified final state: invocation `reconciled`, usage `unknown`, unknown_usage_accepted true, partial receipt retained with coverage partial and actual_tokens null; team closed, task binding absent. C1 remains failed/quarantined and never becomes a settled identity or successful control. Machine budget now counts the owner-assumed 7520, reserved 0, remaining 242480 of unchanged 250000. This is an experimental admission-budget charge, not verified provider billing or a weekly quota percentage. Authoring/review cost remains unknown.

Durable verification: `.waypost/experiments/wp21-smoke-20261018/owner-resolution.json`. The earlier C1 stop report and hashes are unchanged; the 5000 reservation/245000 balance above describe the pre-resolution snapshot. No new inference, C2/C3, worker, judge or retry occurred during reconciliation/closure. Execution remains incomplete pending a separately registered future protocol.

## Owner-authorized revision 3 control-only registration (2026-10-18)

The owner explicitly selected only C1/C2/C3, estimates10000/40000/10000, unchanged aggregate cap250000; workers0, judges0, retries0. [[revision-3-compatibility-controls-under-the-unchanged-allowance|Revision 3 compatibility controls under the unchanged allowance]] selects option2 of the reviewed proposal, without changing its frozen bytes. The full paired comparison remains unauthorized/budget-blocked and this execution story is not done.

Protocol SHA256 `0f5defbe2876fa4c72c0bc16b967e662901e83041fd26c094e837bb50acd2619`; full local launch SHA256 `b3e8d14cc5fc2bc1614b3271515567f0e43d5db765e3b85445490f8f6d6abf6f` in `.waypost/experiments/wp21-controls-r3-20261018/launch-manifest.json`. Independent critic returned ship for these exact inputs. Runtime code remains ead3ed2, all385 checked hashes unchanged, affected fixtures65/65 passed. New C0 verified installed CLI0.163.0-alpha.10.2, gpt-6.1-sol/low, effective pin `4c2ec378bc01ac85ffe366bcec379f6773b636f4c7cee5b89b8503825ccee44d` and owned close/drain without inference. Initial in-repository cwd metadata inspection failed closed; only after changing to the permanently empty external cwd was the final descriptor frozen. C0 repetitions did not start model turns. Common source562 files/5857827 bytes reconstructed and seal c9d9485f229d2f54078c12a280a3c0a37a781c9980a98200580755d1f19c83d9 verified.

At registration: new phase inference calls0, new team not created yet. Existing budget counts historical assumed7520, reserved0, remaining242480. Initial admission threshold185000 includes all60000 proposed controls and125000 protected future-judge reserve. New team namespace wp21-controls-r3-20261018; unit allocation242480, no existing cap/allocation raised. Every call rechecks hashes/pin, live budget and earlier control success before consume. Any failed/uncertain control stops further calls, no retry. Old team remains closed and old C1 remains failed/partial; no cost, authority or savings is inferred from these preparations.

## Revision 3 stopped after one failed C1 (2026-10-18)

Registration committed as `cc4d582`; protocol/launch hashes remain unchanged. Exactly one native phase inference consumed: `subscription-wp21-r3-c1-20261018`. It returned C1_READY with observed model gpt-6.1-sol/low/openai, but guard rejected `native-evaluation-moderation-binding`. Native counter0→7518 has the early anchor but coverage partial, actual_tokens null, accounting_valid false; context quarantined, source callbacks0. CLI exit0 returned a recorded uncertain outcome, not a passed control. The exact offending raw frame was not retained, so the available evidence does not identify which envelope/binding check failed; do not assert a schema-field or ordering diagnosis.

Owned completion proves stopped=true, callback_drained=true, one consumption, native process group closed. No C2/C3, workers, judges or retries were admitted after failure. Pre-model CLI configuration/argument failures are retained separately: the omitted-participant evaluation failed before reserve/consume, and authority revision20 proves no invocation existed then; it was corrected before this sole model call. No runtime-code/protocol/request mutation occurred after preregistration.

At the initial stop (authority revision25), invocation was uncertain with its10000 estimate reserved; no new unknown charge was accepted and the team was not closed. Machine cap250000, counted7520 (historical owner-assumed charge), reserved10000, displayed remaining232480. That initial counted7520 was not the full experiment cost; the remaining balance did not permit bypassing uncertainty. No automatic charge acceptance/release, closure, catalog registration or further inference is authorized by this stop record. The Host subsequently reconciled the exact owned completion without a new model call (authority revision26): invocation reconciled, usage unknown, partial receipt retained, unknown_usage_accepted=false; team paused and not closed. The standard reconciliation provisionally counted its10000 estimate and cleared the reservation. At that reconciliation, machine budget was cap250000, counted17520 (historical assumed7520 plus provisional unknown10000), reserved0, remaining232480. This does not verify7518 or10000 as full usage, pass C1, grant authority or record owner acceptance. `C1-reconcile.json`, `after-reconcile.json` and `budget-after-reconcile.json` retain the transition and current readbacks.

Local private evidence `.waypost/experiments/wp21-controls-r3-20261018/`: `C1-result.json`, `C1-owned-completion.json` SHA256 `a78263607c0e874f5eb565536d2e611965746566458fc66c728391b0f0d86dea`, `authority-after-C1.json`, `budget-after-C1.json`, and `phase-stop-report.json` SHA256 `d68a65cb01912c4f04984904377ca81f35ceff67927fed3c246ec60b2c5a9ed5`. This execution story remains in-progress. Live compatibility, full accounting, paired quality/savings and weekly quota share are not established; preparation/driving/review costs remain unknown. The failed phase must not be replayed under its frozen definition or invocation.

## Owner-authorized revision 3 accounting resolution and closure (2026-10-18)

The owner explicitly accepted the already-provisional10000 as an assumed experimental charge, closing only the stopped revision3 team and committing this checked report. Host `unknown-usage-accept --charged-tokens 10000` recorded the decision; `close-v1` closed `wp21-controls-r3-20261018`. Verified authority revision28: team closed, artifact task binding absent; invocation reconciled, usage unknown, charged_tokens10000, unknown_usage_accepted=true, partial receipt retained. The previous paused/unaccepted state above is historical. Evidence: `.waypost/experiments/wp21-controls-r3-20261018/{C1-owner-accept.json,team-close.json,owner-resolution.json}`.

Final machine cap250000, counted17520 = owner-assumed7520 (revision2) + owner-assumed10000 (revision3), reserved0, remaining232480. This owner decision did not add new counted spend or verify either observation as full provider usage; revision3 still has observed7518, partial coverage and actual_tokens null. C1 remains failed/quarantined; C2/C3/workers/judges/retries0, no new inference during acceptance/closure. Execution story remains in-progress because the original comparison/runtime gates are unmet. No later pilot, cost assumption, definition change or budget increase is authorized by this closure. Token savings, full workflow cost and weekly subscription share remain unknown.

## Dependencies

-

## Attachments

-

---

*Last updated: 2026-10-18*
