# Handoff continuation experiment — 2026-11-04

All six owner-approved experimental slices are implemented. This is portable application state with verified file references, bounded retrieval and optional local object reuse. It does not transfer model KV tensors or hidden model state.

## Frozen protocol and scope

The native receiver was anthropic/claude-sonnet-5-5, reasoning unknown, installed Claude 2.1.296, first-party subscription. Every native context was freshly created, owned, isolated, observed and retired. The receiver had no execution or filesystem tools. All 17 new calls have complete settled receipts and complete input/cache/output diagnostics. The limit is an estimate-based admission control, not a hard provider cap.

Three small actual Waypost modules were copied into isolated fixtures: A fixes global Markdown cell escaping; B adds pure numbering from supplied names; C adds cancellation while preserving current stderr/default behavior against historical stdout behavior. Nine one-shot arms use the same current source, task facts, permissions and observed profile. Latin order: A history/summary/packet; B summary/packet/history; C packet/history/summary. Histories and ordinary summaries are deterministic curated inputs, not actual user transcripts or model-generated summaries. Preparation made zero model calls. This is a small behavioral benchmark, not evidence for arbitrary repository-wide coding quality.

Patch format and base hash are checked before application to a new fixture. The trusted parent grades primitive behavioral observations, not child exit status or a claimed test pass. Each candidate runs behind current macOS sandbox controls denying outside reads/writes, network and process creation, with a bounded VM import surface. Three reference solutions passed; four invalid candidates (early exit, forged result, assertion replacement and toJSON coercion) were rejected. The AbortSignal mock models once listeners and delegated readline cancellation. This is a restricted fixture runtime, not a general-purpose hostile-code service.

## Fresh synthetic ABBA replication

This separately repeats the prior frozen six-case analytical task to obtain new raw buckets. The original 2026-11-02 results remain 18478 versus11682 tokens, all4 correct, total32187 including its control; their missing historical raw buckets remain unknown.

| Condition | Native tokens | Correct |
| --- | --- | --- |
| history | 18414 | 2/2 |
| packet | 11671 | 2/2 |

The fresh packet difference is 6743 tokens (36.62% fewer). This synthetic result does not establish the coding result below.

## Executable coding outcomes

| Task | Condition | Payload bytes | Native tokens | Executable check |
| --- | --- | --- | --- | --- |
| A | history | 4265 | 5551 | pass |
| A | summary | 3017 | 4872 | pass |
| A | packet | 3503 | 4819 | pass |
| B | summary | 4162 | 6411 | pass |
| B | packet | 4827 | 6732 | pass |
| B | history | 6643 | 7837 | pass |
| C | packet | 5462 | 6474 | FAIL: handoff-delivery-answer-json |
| C | history | 7657 | 7764 | FAIL: handoff-delivery-answer-json |
| C | summary | 4806 | 6100 | FAIL: handoff-delivery-answer-json |

| Condition | Native tokens across three tasks | Passed |
| --- | --- | --- |
| history | 21152 | 2/3 |
| summary | 17383 | 2/3 |
| packet | 18025 | 2/3 |

Packet versus curated history: 14.78% fewer native tokens in these three tasks. Packet used 3.69% more native tokens than the ordinary summary. One observation per task/condition gives no statistical confidence or general quality claim. Unfavorable outcomes and grader failures are retained rather than retried. All three C outputs used Markdown fences around JSON and failed the strict transport format before candidate execution; this does not establish whether their code would pass.

## Complete native bucket breakdown

Claude fields below are disjoint native counters. Total = input + cache creation + cache read + output; tokenizer estimates are never substituted.

| Call | Input | Cache creation | Cache read | Output | Total |
| --- | --- | --- | --- | --- | --- |
| A / subscription-wp24-control-20261104 | 2 | 1476 | 535 | 23 | 2036 |
| A / subscription-delivery_27ebc05e670f4fd29eb58b4fdf263ac5 | 2 | 2426 | 1431 | 1692 | 5551 |
| A / subscription-delivery_4a481762d00b420aaf5097da0aa83c2e | 2 | 1891 | 1431 | 1548 | 4872 |
| A / subscription-delivery_c9983038fe284d8fa06540cc4ce61a95 | 2 | 2078 | 1431 | 1308 | 4819 |
| B / subscription-delivery_6585996f60ef44eba85d06a4165f697f | 2 | 2628 | 1431 | 2350 | 6411 |
| B / subscription-delivery_4b62d77a300e4f248a7c31d830a9f816 | 2 | 2878 | 1431 | 2421 | 6732 |
| B / subscription-delivery_98dfed1c5b0547a18fecf5e68069fd00 | 2 | 4041 | 1431 | 2363 | 7837 |
| C / subscription-delivery_01a8aa42032542f6bacaa2405a07fd58 | 2 | 2827 | 1431 | 2214 | 6474 |
| C / subscription-delivery_6750ab3a8e2a4739a5ffd46fb04ff02d | 2 | 3726 | 1431 | 2605 | 7764 |
| C / subscription-delivery_5f1d2d07180a4fdab28867ff0f789525 | 2 | 2575 | 1431 | 2092 | 6100 |
| R / subscription-delivery_10e86128a47040aa80b849552497d85f | 2 | 1276 | 1431 | 277 | 2986 |
| R / subscription-delivery_904f834dc92d46f5945f48b306c77546 | 2 | 1579 | 1431 | 379 | 3391 |
| R / subscription-delivery_fd3173f478c7436abb3cb66ec9641732 | 2 | 1907 | 1431 | 121 | 3461 |
| Q / subscription-delivery_8797ef5330de4d379aa82d425d056847 | 2 | 7469 | 1431 | 321 | 9223 |
| Q / subscription-delivery_62c137c7e39141d68fdaaa082968e558 | 2 | 4098 | 1431 | 323 | 5854 |
| Q / subscription-delivery_74c5527ad47c455b865178134c0286ff | 2 | 4092 | 1431 | 292 | 5817 |
| Q / subscription-delivery_c84c59fb67ce46dfb4287012b805d005 | 2 | 7463 | 1431 | 295 | 9191 |
| Total | 34 | 54430 | 23431 | 20624 | 98519 |

Control and retrieval are included in total spend, separately from condition comparisons. New calls: 98519; cumulative owner experiment: 130706/500000; remaining: 369294. Unrelated prior17520 remains in machine total 148226, reserved 0. Previous policy was restored without clearing ledger entries or events. Development, independent reviews and this driving chat are outside this operational native comparison.

## Timing and preparation

| Task | Shared deterministic preparation ms | Preparation model calls |
| --- | --- | --- |
| A | 3521.603 | 0 |
| B | 3484.844 | 0 |
| C | 3470.170 | 0 |

| Task/condition | Prepare ms | Send ms | Relay ms | Poll ms | Orchestration ms | Total ms | Delivery wall ms | Grading ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A/history | 0.734 | 301.134 | 16296.819 | 269.299 | 16871.164 | 16871.898 | 16872.494 | 152.675 |
| A/summary | 0.587 | 300.425 | 15261.735 | 272.973 | 15838.249 | 15838.836 | 15839.365 | 152.981 |
| A/packet | 5.087 | 263.043 | 12652.461 | 235.333 | 13155.028 | 13160.115 | 13297.583 | 154.109 |
| B/summary | 0.478 | 299.837 | 17627.332 | 273.596 | 18204.855 | 18205.333 | 18205.909 | 157.658 |
| B/packet | 7.262 | 264.449 | 19053.851 | 234.288 | 19557.598 | 19564.860 | 19700.850 | 155.237 |
| B/history | 0.432 | 307.459 | 17595.457 | 275.675 | 18182.359 | 18182.791 | 18183.519 | 154.448 |
| C/packet | 5.479 | 268.978 | 17228.508 | 243.466 | 17745.572 | 17751.051 | 17888.649 | 0.109 |
| C/history | 0.326 | 310.827 | 20584.305 | 266.676 | 21164.937 | 21165.263 | 21165.932 | 0.064 |
| C/summary | 0.548 | 302.761 | 17344.016 | 278.040 | 17927.946 | 17928.494 | 17929.159 | 0.069 |

Timings are monotonic per current attempt and exclude the latest checkpoint write itself. Shared preparation is recorded once per task; do not charge it repeatedly to each arm. Public CLI packet resume and library history/summary wrappers differ, so no causal latency comparison is claimed. The recovered synthetic packet retains its original saved timings; outer wall time is unknown, not zero.

## Bounded retrieval and recovery

The actual opt-in CLI continuation completed 2 native rounds: request ledger line40, then answer with the exact independently held token. Earlier verified fragments remain available in later fresh contexts. The original replay failed without additional inference because CLI generated a new request timestamp. It retained its original deadline and was not extended. After the CLI fix, a separate single-round inline-data continuation and immediate public CLI replay succeeded; replay made 0 additional model calls. This validation used the previously unused third retrieval call slot, so the original overall maximum17 calls was preserved. Unit tests separately exercise multi-round replay. Allowlisted paths, current hashes, strict UTF-8, line/byte/call ceilings and deterministic persisted keys remain mandatory. This grants data, never command execution or evaluation authority.

Five real Node SIGKILL surrogate boundaries (prepared/sent/consumed/received/answered) exercise deadline and recovery. Product native authority tests separately enforce consumed-unknown refusal and received replay. These surrogate process tests are not a claim that a real native descendant was killed at each boundary.

The measurement driver initially overwrote a checkpoint with a CLI summary because its log name collided. It stopped after three complete settled calls, restored the previous budget policy, and retained the failure. Q1 was reconstructed from frozen inputs and the already received authoritative output with the original deadline; zero calls were repeated. A subsequent local variable-shadowing failure made zero new calls. Both attempt reports are retained. The final driver prefixes command logs and resumes only the exact known settled cohort. These were experiment-driver defects, not additional successful product scenarios.

## Content-addressed transfer CLI example

Full export/import, authenticated receiver availability message, delta export/import, eviction after acknowledgement, explicit needs-full refusal and full fallback were exercised through separate CLI processes. Three relocated snapshots were verified. Provenance-limited GC preserved a foreign sentinel.

| Measure | Full | Delta |
| --- | --- | --- |
| Serialized wire bytes | 40930 | 4111 |
| Object bytes | 29553 | 1900 |

Wire/storage byte reuse is separate from model input tokens. An availability message is an authenticated participant hint, not Host attestation; the receiver rehashes the exact base and reconstructed target. Missing/corrupt content never becomes a cache hit. A crash may leave a cooperative store lock; no foreign lock is automatically deleted. Fresh model contexts still require explicit context input.

## Verification and retained evidence

389 focused assertions passed in the all-six implementation run. After grader/retrieval refinements,20 targeted tests and3positive/4negative sandbox controls passed with441 source hashes unchanged; prior broader evidence remains bound to its own source snapshot. After the native run exposed unstable generated send timestamps,82 targeted CLI/authority/delivery/retrieval regressions passed, including real separate-process retries, changed-command refusal and revoked-actor refusal. Initial81/82 failure from using accepted-message time instead of original command time is retained; the final fix obtains command_at from verified events and preserves full digest checks. Full npm suite, Windows/Linux runtime and Node20/22/24 were not run for this continuation. Runtime evidence is macOS27.2arm64 / Node25.6.1 only. The architectural ADR remains proposed.

Private retained experiment root: /Users/frost/.local/state/waypost/experiments/wp24-continuation-20261104-09e08791-0553-4cd2-9784-ba8a8d1ec146. It holds study.json, frozen payloads, original and final results, per-team authoritative stores, receipts, private credentials, test logs, manifests and drivers. Do not publish credentials or delete authority: machine spending is derived from it. Source pointers: docs/handoffs.md and the WP-24 stories. The measured cohort matches verified-controls-v3-inputs.json. Three files changed after measurement for replay repair: scripts/team-cli.mjs, scripts/team-store.mjs and tests/team-cli.test.mjs. The82-regression manifest was recorded after that run with no concurrent source writers; it is not an independent before/after source snapshot.
