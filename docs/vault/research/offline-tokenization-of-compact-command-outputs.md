---
type: research
slug: "offline-tokenization-of-compact-command-outputs"
title: "Offline tokenization of compact command outputs"
status: draft
date: 2026-10-23
authors: ["Ivan Morozov"]
tags: []
review_status: reviewed
reviewed_at: 2026-10-23
---

# Offline tokenization of compact command outputs

## Question

Do the five recent CLI output changes reduce tokenized text as well as UTF-8
bytes, and which results preserve the same displayed information?

## TL;DR

All five frozen before/after examples use fewer tokens in both public encodings.
The lossless graph endpoint presentation drops from **2444 to 1844 o200k tokens
(24.55%)** while preserving the same sixty directed triples. These are counts of
raw CLI text under named encodings, not native Codex usage, total workflow savings
or a percentage of the subscription limit. No encoding is asserted to match the
current model. Previously measured negative product-level findings are unchanged.

## Method

Performed by Codex (OpenAI) on 2026-10-23 UTC, with production base `db29ee3`.
`tiktoken 0.14.0` was installed as binary wheels only into an owned temporary
runtime, not as a Waypost dependency. Encoding tables were downloaded into that
runtime before measurement, and their SHA256 fingerprints retained.

For each case, read the exact before/after UTF-8 bytes from the previous local
experiment, including final newlines. Verify both file hashes and published
byte/character counts against that experiment's measurement.json. Run
`get_encoding(name).encode_ordinary(text)` for `o200k_base` and `cl100k_base`.
Require exact decode round-trips and deterministic repeat token IDs. Disable
socket connection and DNS functions during the runner; observed network attempts
were zero. The runner made no native inference calls.

The successful run went through `waypost run --heavy`; all ten input hash/size
checks and twenty encoding/round-trip/repeat combinations passed. Retained
execution.json binds runner, results and complete-log hashes. Named encodings,
package provenance, vocabulary-cache hashes and regex-pattern hashes are retained
in tokenizer.json/install.json. The exact runner is retained as runner.py.txt.
The public [results JSON](../../benchmarks/2026-10-23-command-output-tokenization/results.json)
contains the input identities and complete arithmetic.

This method excludes chat/tool envelopes, system instructions, output/reasoning
work, repeated historical context, cached-input accounting and subsequent model
corrections. The current operator and independent review consume tokens separately;
those costs are not measured here and are not zero. Existing experiment ledgers
and the closed native-comparison allocation were not changed.

## Findings

| Frozen transition | o200k before → after | o200k fewer | cl100k before → after |
|---|---|---|---|
| Brief folder list | 311 → 289 | 22 (7.07%) | 312 → 290 |
| Search title duplicate | 41 → 27 | 14 (34.15%) | 41 → 27 |
| Graph edge cap restoration | 3729 → 2432 | 1297 (34.78%) | 3660 → 2386 |
| Doctor file prefix | 701 → 629 | 72 (10.27%) | 700 → 628 |
| Graph endpoint directions | 2444 → 1844 | 600 (24.55%) | 2398 → 1798 |

Four rows preserve the same displayed facts: folder paths/kinds/counts; full
search title/path/status/line; doctor findings/messages; graph directed triples.
Their existing story reviews and regressions remain the semantic evidence. This
measurement validates tokenized size, not semantic quality by itself.

**The graph edge cap row is different:** it restores the existing limit by
showing sixty of ninety-four edges and naming thirty-four remaining. Its reduction
must not be described as lossless compression of the complete output. The later
graph-endpoint row uses a different frozen graph (98 edges, sixty shown and38
remaining). Do not multiply or add these percentages as a single improvement.

These examples are selected saved command outputs, not a representative task
frequency distribution. Do not sum their token deltas into total savings or claim
that Waypost now saves24.55% of a working session. Native receipts from a matched
finished-product comparison would be needed for that claim; this run adds none.

## Independent review

Fresh-context waypost-critic: ship, no actionable findings. Independently checked
seven review-packet hashes, all ten input identities and twenty encoding pairs,
round-trips/repeat IDs with zero network calls, cached vocabularies and fifteen
tiktoken source/binary files. Historical source/log identities and semantic checks
for the five changes were verified, including all sixty graph triples. Recount
exit0 matched every published number. This does not meter operator/review cost.

## Conclusion

Retain the checked compact presentation changes: their selected raw text costs
less under both encodings, and four transitions preserve all previously displayed
facts. Keep the graph-cap result separately labelled as bounded output. Use these
input hashes/counts as a reproducible checkpoint before further formatting changes.
This report supplies no evidence that overall Waypost workflow expense is lower
than the accepted product comparison or that subscription-quota usage changed.

## References

- [Official tiktoken documentation](https://github.com/openai/tiktoken): public encoding API and reversible BPE.
- [Context spend as a design constraint, not an outcome](../adr/0008-token-budget.md) — accepted; historical baseline used o200k.
- WP-21 **Source an agent can read in one pass**, done stories:
  [Condense default brief orientation without hiding safety signals](../epics/WP-21/stories/story-condense-default-brief-orientation-without-hiding-safety-signals.md),
  [Avoid duplicate title snippets in vault search](../epics/WP-21/stories/story-avoid-duplicate-title-snippets-in-vault-search.md),
  [Recognize all graph edge kinds in bounded queries](../epics/WP-21/stories/story-recognize-all-graph-edge-kinds-in-bounded-queries.md),
  [Avoid repeated file paths in doctor findings](../epics/WP-21/stories/story-avoid-repeated-file-paths-in-doctor-findings.md),
  [Compact repeated graph endpoints without losing directions](../epics/WP-21/stories/story-compact-repeated-graph-endpoints-without-losing-directions.md).
- Local evidence: `.waypost/experiments/wp21-static-tokenization-20261023/` and the five original measurement directories named in results.json.

---

*Last updated: 2026-10-23*
