---
type: epic
id: "WP-21"
title: "Source an agent can read in one pass"
status: in-progress
priority: p2
created: 2026-10-04
updated: 2026-10-14
external_refs: {}
tags: []
code_refs: ["docs/vault/adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md", "docs/vault/ops/paired-token-economy-experiment-with-blind-acceptance.md", "agents/planner.md", "agents/critic.md", "agents/reviewer.md", "skills/waypost-review/SKILL.md", "bin/", "package.json", "scripts/brief.mjs", "scripts/lib.mjs", "tests/predicates.test.mjs", "scripts/tokens.mjs", "scripts/token-navigation.mjs", "scripts/token-codex.mjs", "tests/tokens.test.mjs", "tests/token-navigation.test.mjs", "tests/token-codex.test.mjs", "tests/scripts.test.mjs", "tests/sizes.test.mjs", "tests/harness.test.mjs", "tests/helpers/cli-static-closure.mjs", "tests/helpers/cli-namespace.mjs", "tests/fixtures/cli-namespace.json", "tests/fixtures/cli-namespace-baseline.mjs.gz", "tests/team-cli.test.mjs", "AGENTS.md", "docs/how-it-works.md", "docs/cli-reference.md", "CHANGELOG.md", "scripts/evaluation-source.mjs", "scripts/codex-evaluation-surface.mjs", "scripts/team-host.mjs", "scripts/team-cli.mjs", "scripts/team-subscription.mjs", "scripts/team-transport.mjs", "scripts/team-native-action.mjs", "tests/evaluation-source.test.mjs", "tests/evaluation-transport.test.mjs", "tests/team-host.test.mjs", "tests/team-subscription.test.mjs", "docs/vault/ops/paired-token-economy-experiment-revision-2-over-a-sealed-read-only-source.md", "docs/vault/ops/proposed-revision-3-of-the-sealed-source-token-pilot.md", "docs/vault/ops/revision-3-compatibility-controls-under-the-unchanged-allowance.md", "tests/helpers/cli-modules.mjs"]
review_status: pending
reviewed_at: null
---

# WP-21: Source an agent can read in one pass

| Field | Value |
|---|---|
| **Status** | in-progress |
| **Priority** | p2 |
| **Created** | 2026-10-04 |
| **Updated** | 2026-10-14 |

---

## Goal

A task about one part of Waypost needs one file that fits in a single read and
is visible to extension-based code indexes — instead of windowed reads and
searching through files of 50–200 KB.

## Context

Measured on 2026-10-04 from this project's Claude Code transcripts (1.98 G
input tokens, two thirds of them in subagents): reading code is ≈26% of all
input; whole-file reads by subagents ≈16%; re-reading the same file in the same
context ≈8%. Project Memory and Waypost CLI output are each under 2% — not the
lever.

The most expensive file is `bin/waypost` (202 KB, extensionless, so the code
index does not see it): 441 navigation turns, ~159 M tokens. Next by measured
read volume: `scripts/sizes.mjs`, `scripts/lib.mjs` (88 KB), `scripts/presence.mjs`,
then `scripts/doctor.mjs` (104 KB). `scripts/team-host.mjs` is dense rather than
long and is under active WP-20 work.

Decision for the first and largest step: ADR "The CLI as a thin entry with
per-command modules, each readable in one pass" (accepted 2026-10-19).

## Stories

The measurement increment is tracked by
[[story-reproducible-token-accounting-and-repeated-read-evidence|Reproducible token accounting and repeated-read evidence]].

| Story | Status | Description |
|-------|--------|-------------|
| `story-the-team-code-loads-only-for-story-write-and-the-cli-entry-is-an-mjs-the-code-index-sees` | done | Decision 0 of the ADR: lazy team import, entry renamed to `bin/waypost.mjs` behind a shim |

<!-- Split implementation stories follow the ADR accepted2026-10-19.
     The navigation classifier/baseline prerequisite is already committed.
     2. bin/waypost.mjs becomes a thin entry; each command lives in bin/cli/
     3. scripts/lib.mjs split into lib-*.mjs behind an `export *` facade
     4. sizes.mjs / presence.mjs split by measured read volume
     5. doctor.mjs split into doctor-*.mjs (low priority)
     team-host.mjs: proposed to the WP-20 owner, not in this epic. -->

## Expected Results

- [x] Step 0: `version`, `help`, `run`, `capacity`, `size`, `clean` work with a deliberately broken team module; `story --write` still refuses a team-bound story.
- [x] Step 0, manual (codegraph is an external tool): `codegraph query` finds functions of `bin/waypost.mjs`.
- [ ] A committed classifier (Node, in `scripts/tokens.mjs`) counts navigation turns on `bin/(waypost|cli/)` with cache weights; classifier and baseline are now committed below, while the comparable post-split cohort and target remain to be stated. Existing coverage and API-price proxies do not establish causal savings.
- [ ] Split: the entry ≤ 14 KB; every `bin/cli/*.mjs` ≤ 24 KB, pinned by a test.
- [ ] Split: the free-identifier test and the import-every-module test pass; `node --check` covers `bin/cli`.
- [ ] Split: `help`, `version` and an unknown command are byte-identical before and after; the suite is green on Node 20/22/24 at every step.
- [ ] Split: a CLI test "team-bound story → refuse" exists before the gate moves.
- [ ] Split: guards of other ADRs naming the entry are re-scoped; pointer comments updated.
- [ ] `npm pack --dry-run` lists `bin/waypost.mjs` (done in step 0) and `bin/cli/` after the split.

## Offline measurement baseline (2026-10-15)

Command: `waypost tokens --json --navigation --since 2026-10-08 --until 2026-10-15`.
The interval assigns each request by its first observed assistant timestamp (UTC)
and includes all cumulative usage blocks of that request. Retained Claude-only
history: 247 fingerprinted source files, 2,661 requests, 744,710,130 native tokens;
109,405,665 tokens (14.6910%) explicitly attributed to Waypost roles/skills. This
includes useful role work, not just overhead, and does not measure subscription
quota. Source/usage coverage was complete within the discovered files; no
request crossed a requested boundary in this sample.

Recognized navigation: 269 calls in 186 initiating requests; returned read text
3,076,145 JavaScript characters. Zero identical repeats were confirmed in this
conservative subset. There were 2,396 unsupported shell calls, so zero is not
evidence that the full workflow had no duplicate reads. Initiating-request input
is not the cost of returned text or an upper bound on later context reuse. The
report preserves input/cache counters and a separately labelled API-price proxy.

Actual output reduction for the same period: `--summary` returned 241 characters,
versus 2,188 for the detailed text report (88.99% fewer characters). This proves
shorter tool output only, not an 88.99% reduction in tokens or task cost.

Analyzer source hashes (working tree based on `7255443`, tracked changes present):

- `scripts/tokens.mjs`: `44abfa7b4e591fd0d9a16adcf6bcc3eb5eceef0d78c3f20548625203829ec9ee`
- `scripts/token-navigation.mjs`: `70ed200d00cc1c0e735d3e876763983c607bf7f86daf7fdb22575e2089a43023`

The full fingerprint manifest is a local scratch report, not committed transcript
contents. Retention and new sessions can change later results. Next target:
improve measured navigation coverage, then compare fixed tasks with independent
acceptance and all failed attempts counted. Do not approve the proposed split or
claim a percentage saving from this observational baseline alone.

## Codex observed-span baseline (2026-10-16)

Command: `waypost tokens --harness codex --json --since 2026-10-08 --until 2026-10-16`,
run offline through `waypost run --heavy` after a resource slot became available.
No model was invoked. Discovery inspected 254 plain rollout headers and selected
22 matching files/contexts by exact metadata cwd; 232 files belonged elsewhere.
The Desktop native `id`, not the shared `session_id` label, owns each counter.

The selected observed spans contain **18,949,185 native tokens** across 187 spans;
4,076,805 tokens (21.5144%) have explicit Waypost role attribution. Cached input
(18,090,624) and reasoning output (23,179) are subsets, not extra tokens. These
counts are independent of the earlier Claude baseline and must not be combined
or treated as subscription quota percentages.

Coverage is incomplete: 337 compressed candidate files were not decoded, 20
contexts had uncharged nonzero initial snapshots, and one conflicting context
was quarantined. Full retained-source totals/shares are null. The 21.5144% figure
describes covered spans only; it is not the entire overhead or a measured saving.
Files were read sequentially and native history can expire or grow.

Analyzer hashes (working tree based on `f485cc2`, tracked changes present):

- `scripts/tokens.mjs`: `3fa18bbee62942fb3ebcaa568d3046849600e287139fcd2937204a2cb71a1a53`
- `scripts/token-codex.mjs`: `8f964e022e154e12b8a247646bbbe6d458dd4f474536c9feb5ba80dfa21cac09`

Full source fingerprints remain in a local scratch report; transcript bodies are
not committed. The story is [[story-offline-codex-token-accounting-with-explicit-coverage|Offline Codex token accounting with explicit coverage]].

## Targeted evidence procedures (2026-10-17)

[[story-targeted-evidence-reads-and-reproducible-role-handoffs|Targeted evidence reads and reproducible role handoffs]] applies the existing ADR-0008 pull-context policy to planner, critic and reviewer. The reviewer now inspects sufficient surrounding contracts/dependencies instead of unconditionally reading every changed file in full; full reads remain available when needed. Original acceptance/spec checks and independent verification remain mandatory. The review skill identifies dirty/untracked inputs and binds validation evidence to its checked snapshot.

`waypost run --heavy -- node --test tests/harness.test.mjs`: 112 passed, 0 failed. Complete role bodies are checked across every role-file renderer and CLI show; full review-skill installation and existing standing-context budgets pass. Existing Claude/Codex/OpenCode copies were regenerated. This confirms policy delivery, not measured agent compliance, quality parity or token savings. A fixed-cohort live comparison still needs an owner-set numeric allocation; the module-split ADR remains proposed.

## Paired smoke preparation (2026-10-17)

[[story-fixed-cohort-and-blind-acceptance-for-token-economy-comparison|Bounded paired smoke protocol for token economy]] prepares [[paired-token-economy-experiment-with-blind-acceptance|Paired token economy experiment with blind acceptance]]: two fixed read-only tasks (navigation and artifact critique), baseline common source plus four policy overlays, AB/BA order and four fresh blinded judges. Static checks confirm identical production inputs. All attempts/unknown costs, setup/control, judging and stopping are specified; no new comparator or ledger was added.

No live experiment or budget mutation occurred. A numeric owner allocation and verified configuration/accounting/isolation remain launch gates. At preparation on 2026-10-17 the proposed 250,000 Codex-native-token allowance was not approved or set; the later owner approval below supersedes that historical state. The future 12-task/four-group cohort remains unfrozen; these two pairs cannot establish general workflow savings.

## Approved pilot: failed launch gates (2026-10-18)

The owner approved the 250,000 Codex-native-token allowance. Budget
`waypost-token-smoke-20261018` is set; preflight spent/reserved are zero. The
[[story-execute-paired-token-economy-smoke-under-the-owner-allocation|Execute paired token economy smoke under the owner allocation]] story remains pending execution. Installed CLI 0.163.0-alpha.10.2 fails the pinned 0.162.0-alpha.17.2 version gate; independently, no supported budgeted Host route delivers original role tasks with source navigation. No native experiment inference was started and no savings are claimed.

[[budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot|Budgeted read-only role evaluation over a sealed source snapshot]] proposes a separate evaluation contract/surface; it is not yet accepted or implemented at that point. The owner subsequently accepted it on 2026-10-18; the evaluation-route story carries implementation and fixture evidence. Live C1–C3 and paired savings remain unverified. The approved budget does not authorize silently changing the frozen protocol or relaxing existing guards. Preparation/driving cost remains unknown.

## Revision 2: one counted control, then fail-closed stop (2026-10-18)

Owner-accepted evaluation route implemented/reviewed in `2efc42f`; launch inputs preregistered in `9c24c43`, protocol SHA256 `8df690fa0080a26e669508b88f2df4f63887f737bbedeebb2b2395973142836e`. C0 passed without inference. C1 returned C1_READY but encountered the unregistered `turn/moderationMetadata` notification. Observed counter total 7520 is partial coverage, not verified full usage. Invocation remains uncertain, with reservation 5000 retained; no C2/C3, workers, judges or retries. Source reads 0, owned closure/drain confirmed. The execution story records immutable evidence hashes and the local ignored evidence directory `.waypost/experiments/wp21-smoke-20261018/`.

The optimized-role policy has no live quality/savings result yet. Do not treat CLI exit 0, an expected answer, a counter observation or the displayed remaining allowance as a passed control. The owner subsequently accepted 7520 as an assumed budget charge; the Host reconciled C1 and closed the stopped team while preserving its partial receipt. Final budget: counted 7520, reserved 0, remaining 242480; no new inference. Further inference requires a separately registered protocol; this stop does not authorize changing a definition and replaying C1.

## Bounded moderation compatibility and proposed next phase (2026-10-18)

[[story-evaluation-accepts-bounded-moderation-metadata|Evaluation accepts bounded moderation metadata]] adds only an opaque, owned, before-terminal notification to the separate evaluation surface, with definition-hashed frame/total-byte/count limits. It does not change old no-exec behavior, native accounting or historical C1 evidence. Affected evaluation/old no-exec transport fixtures passed 65/65, no failures/skips; all 385 input hashes matched manifest `ed121669fc5e6a282b6502792692eafc045a14f3ea5ae65337a3849a50dfdf3a`. Fresh reviewer returned `story closed / commit`, no open findings. Live compatibility remains unverified; the story retains previous gate refusals and final source-bound evidence.

[[proposed-revision-3-of-the-sealed-source-token-pilot|Proposed revision 3 of the sealed-source token pilot]] is a reviewed draft, not launch authorization. Initial proposal critic verdict ship at SHA256 `6e4c6ceeda7550cf98607e5ad2ee93c1d3540128ac8d45a5e1ebda936c47726b`; the explicit received-wire-byte clarification passed refreshed critic review at SHA256 `3a2dbc8c575f546ae44c11a9776bd07644cc91d029ddc836f7c1422506a19510`. Full future planning needs 275000 versus remaining 242480, deficit 32520. Owner choices are a larger explicitly set allowance (at least 282520 total before overshoot room), a separately authorized three-control-only phase estimated 60000 under the existing cap, or deferral. That proposal selected no option; the later explicit owner choice and separate registration below authorize only controls. No new inference had occurred at preparation.

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

- Step 0: none (adopted ahead of the ADR as its Decision 0, see the critic pass of 2026-10-14; owner approved 2026-10-14; done in 6d5f093).
- Split: ADR "The CLI as a thin entry with per-command modules, each readable in one pass" — accepted2026-10-19; the split requires one freeze window of the entry coordinated with WP-20.

## Open Questions

- [ ] Split now on structural grounds, or after two weeks of measurement with the committed classifier?
- [ ] Who moves the WP-20 code (`installMcpConfig`, the story gate) out of the entry?
- [ ] Do the size ceilings hold for every module, or does `clean-plan` need a refactor beyond a move?

## Related

- ADR-0008 — context spend as a design constraint.
- Project Memory `memory-format-benchmark` — the measurements behind this epic (session scripts, not reproducible until the classifier is committed).

---

*Last updated: 2026-10-14*

## Compressed retained-source coverage (2026-10-18)

[[story-bounded-compressed-codex-rollout-accounting|Bounded compressed Codex rollout accounting]] extends the offline Codex collector to gzip/Brotli and runtime-native Zstandard, with original-byte hashes, bounded header-first project filtering and full-context quarantine for corrupt, oversized or partially consumed archives. Limits8 MiB compressed/64 MiB expanded; no external decoder or model call. Affected accounting fixtures85/85 passed on Node25.6.1/macOS; Node20 runtime not exercised.

Refreshed [2026-10-08,2026-10-16) UTC retained history:206 archive headers checked,105 matching archives fully decoded,101 foreign headers filtered,0 skipped/failed archives. Observed total18,949,185 and explicit Waypost4,076,805 (21.514408%) are unchanged from the plain-only collector in this window. Full usage/shares remain unknown:108 contexts have unknown prefixes and27 conflicting histories are quarantined. Reports are sequential; one shared active plain input changed, so this is not an atomic controlled comparison. This verifies expanded inspection, not token savings, weekly quota or provider-exhaustive usage. Retained private manifests/logs/reports: `.waypost/experiments/wp21-compressed-20261018/`. Historical failed pilots, assumed charges and frozen protocols are unchanged.

## Explicit inherited-parent metadata recognition (2026-10-18)

[[story-recognize-explicit-inherited-parent-headers-in-codex-accounting|Recognize explicit inherited parent headers in Codex accounting]] fixes false identity quarantine from one older same-project parent header immediately following a child's current header. Consistent explicit parent links and accepted parent metadata are bound across replay and discovered first headers; conflicting parent identity quarantines children using the exception. Later/duplicate inherited/unrelated metadata stays strict. Native counter rules are unchanged: inherited pre-creation events are ignored, first nonzero baselines remain uncharged/unknown, parent counters/roles are never merged into the child. Affected accounting fixtures96/96 pass on Node25.6.1/macOS.

Current retained-source refresh:28 recognized prefixes,28→0 identity quarantines,138 unknown initial prefixes; full totals/shares still null. Window [2026-10-08,2026-10-16) UTC now observes19,366,260 tokens and4,076,805 explicitly Waypost (21.051070%), superseding earlier covered-span totals for this retained corpus. Window [2026-10-16,2026-10-19) UTC observes159,107,953 and35,565,113 explicitly Waypost (22.352819%). Explicit roles include useful work; neither share is pure overhead, savings or weekly quota. Sequential before/after reports have one changing active source per comparison and cannot establish an atomic controlled delta. Private evidence `.waypost/experiments/wp21-context-conflicts-20261018/`. No native pilot or budget mutation; preparation/review costs remain unisolated and unknown.

## Prefix uncertainty scoped to the requested period (2026-10-18)

[[story-scope-unknown-prefix-diagnostics-to-the-requested-period|Scope unknown-prefix diagnostics to the requested period]] adds diagnostics without changing counter/span/completeness decisions or compact output. On this retained-history read,140 reduced contexts have unknown initial prefixes globally;13 may affect the Oct8–15 UTC window and47 the Oct16–18 window. Counts exclude quarantined contexts and are non-exhaustive: zero overlap does not establish completeness when other gaps exist. Earlier138-context figures were corpus-wide, not the number affecting either period.

Affected accounting fixtures100/100 passed on Node25.6.1/macOS. Offline old/new comparisons confirm exact native totals/shares/per-context accounting and byte-identical compact output. Observed19,366,260/4,076,805 explicit Waypost (21.051070%) and159,107,953/35,565,113 (22.352819%) remain unchanged; full totals/shares remain null. One active source grew raw lifetime snapshot counts in the historical comparison; the selected accounting remained equal. No atomic-snapshot, savings, complete-cost or weekly-quota claim. Private evidence `.waypost/experiments/wp21-prefix-period-20261018/`; no native pilot or budget mutation.

## Pull-only CLI reference (2026-10-19)

[[story-keep-cli-reference-out-of-standing-instructions|Keep CLI reference out of standing instructions]] applies ADR-0008: command tables now live in linked packaged `docs/cli-reference.md`. All standing rules outside the original table and the managed block are byte-identical; the full heavy-job policy remains standing. AGENTS19335→17013 characters:2322 characters removed (12.0093095% of the file). This measures source size for future loads, not token or subscription savings. Selected standing-context budgets2/2 pass; npm pack dry-run includes the reference. No native pilot or budget mutation.

## Compact default folder orientation (2026-10-19)

[[story-keep-brief-folder-descriptions-behind-full-mode|Keep brief folder descriptions behind full mode]] hides only folder Purpose descriptions in default brief; every folder/kind/count remains. Full-mode output and JSON detail are retained. Frozen real-vault condensed skeleton1787→1097 characters (690 removed,38.6121992% of this output); dynamic appenders excluded and unchanged.21 selected skeleton/brief/routine/standing checks pass; default brief fixture ceiling tightened2200→1500. This is output-size reduction, not measured token/task/quota savings. No native pilot or budget mutation.

## CLI story-write guard prerequisite (2026-10-19)

[[story-pin-team-bound-story-refusal-before-cli-modularization|Pin team-bound story refusal before CLI modularization]] pins the existing gate at the real CLI: changed:true plan/close previews, exact binding refusal before any vault file/authority/claim/view change, and successful unbound sibling lifecycle. Close fixtures claim before team binding; team-only --id follows -- to preserve session identity. Full affected tests/team-cli.test.mjs11/11 pass on macOS after earlier capacity refusals;154 code identities unchanged. Production CLI unchanged. This is a prerequisite for the proposed split, not approval/implementation of that ADR or measured savings.

## Transitive early CLI isolation guard (2026-10-19)

[[story-prepare-dependency-and-loader-guards-for-the-cli-split|Prepare dependency and loader guards for the CLI split]] replaces the entry-only import regex with an engine-parsed canonical static closure check, without linking/evaluating source. Fixtures cover barrels/re-exports/side effects/cycles, dynamic/text exclusions, missing/syntax/path/package errors, symlinks and failed/malformed child reports.8 selected checks pass on Node20.20.2/22.23.3/24.22.0/25.6.1 on macOS arm64;156 code identities stable.111 Node20 skips are tests excluded by the filter. Full npm/Ubuntu CI/other OS remain unverified. No production move; frozen-U/loader checks and mapping/freeze remain before migration. Owned temporary runtimes removed325603804bytes; provenance and logs retained privately.

## Frozen CLI namespace guard (2026-10-20)

[[story-freeze-and-guard-the-cli-namespace-before-modularization|Freeze and guard the CLI namespace before modularization]] pins a compressed pre-split baseline and201-name U (63imports/138declarations), with independent engine census of2625 raw candidates. Parse-only export early-errors plus recursive discovery detect missing frozen bindings despite template/local/catch scope; conservative literal matching includes strings/comments/properties and rejects raw Unicode escapes. Regression fixtures cover aliases, malformed/incomplete reports and symlinks. All13selected checks pass on Node20.20.2/22.23.3/24.22.0/25.6.1 on macOS arm64,159code identities stable; fresh reviewer accepted3AC/no open findings. Node20's111 skips are filter exclusions. Earlier CPU refusals ran no tests and are historical. Owned temporary runtimes removed325259264bytes. No production move; actual loader/ownership/freeze and full per-migration CI remain prerequisites. No token savings or live role compatibility inferred.

## CLI module syntax and import guards (2026-10-20)

[[story-check-every-cli-module-before-the-first-split|Check every CLI module before the first split]] adds named per-file Node --check and fresh-child actual imports for every future bin/cli module, using shared recursive discovery and exact terminal receipts. Entry remains syntax-only; absent cli is valid. Fixtures cover nested syntax/link failures and incomplete execution. makeRaceRepo recursively copies real CLI modules; import.meta.url and copy-only dependency faults prove the copied tree is exercised while stale-sha refusal remains intact.19selected checks pass on Node20.20.2/22.23.3/24.22.0/25.6.1(macOSarm64),160source identities stable; final reviewer accepted3AC/no findings. Node20 has195filter-excluded skips, other versions0. Historical canonical tmp-path failure was fixed with realpathSync; capacity refusals remain historical. Owned temporary runtimes removed325259264+235429072bytes. Ordinary-store isolation is not a security sandbox; real command modules still absent. No production move; ownership mapping/freeze and full per-migration CI still precede migration. No pilot/budget or savings claim.
