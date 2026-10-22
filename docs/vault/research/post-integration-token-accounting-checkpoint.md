---
type: research
slug: "post-integration-token-accounting-checkpoint"
title: "Post-integration token accounting checkpoint"
status: draft
date: 2026-10-22
authors: ["Ivan Morozov", "Codex (OpenAI)"]
tags: ["token-economy", "offline-accounting"]
code_refs: ["scripts/tokens.mjs", "scripts/token-codex.mjs", "scripts/token-navigation.mjs", "docs/vault/epics/WP-21/epic.md"]
review_status: reviewed
reviewed_at: 2026-10-22
---

# Post-integration token accounting checkpoint

## Question

What do retained local histories establish about Waypost role usage after the
CLI split has been integrated, and is a comparable before/after measurement
available? The collection ran after integration; its requested period is the
seven **pre-integration** UTC days [2026-10-15, 2026-10-22). It is a reference
checkpoint, not an untreated control or a post-split savings measurement.

## TL;DR

Codex recorded **364,923,053 observed native tokens**, including **74,561,748
explicitly attributed to Waypost roles (20.432183548568524%)** in covered spans.
Full retained-source totals and shares are unknown. The period may overlap
123 contexts with unknown initial prefixes. Unattributed usage is not classified
as non-Waypost; attributed usage includes useful work, not merely overhead.
Claude has only four selected requests and no recognized navigation calls in
this window, so it supplies no adequate CLI navigation comparison. Neither
report measures subscription quota or causal token savings.

## Method

- Analyzer/main revision: `109abf113803f52c32829e910144ae59ae6e3f57`, initially
  clean; Node25.6.1/macOS. The six recorded collector/entry/core source hashes
  were identical before and after both reads.
- One machine-wide heavy admission ran two existing CLI collectors sequentially;
  both exited0. The two collectors invoked no model, pilot, calibration or judge. Authoring and review costs are not isolated by this collection.
- Exact primary project scope only. Sibling worktree or other-cwd histories are
  not automatically a repository-wide union; do not add separately scoped
  reports without context-identity deduplication.
- Histories were read sequentially, not captured as an atomic live snapshot.
  The private report fingerprints describe those actual reads; later retention,
  compression, session growth or project metadata can change a rerun.
- Dates are UTC and `--until` is exclusive. Claude selects requests by the first
  observed assistant-block timestamp and includes their usage blocks; Codex
  selects cumulative-delta spans by endpoint timestamp after constructing their
  chains with pre-period baselines. The two schemas are reported separately.

Commands, both inside `waypost run --heavy --wait 30s -- <sequential runner>`:

```sh
waypost tokens --harness claude --json --navigation --since 2026-10-15 --until 2026-10-22 --project <primary-checkout>
waypost tokens --harness codex --json --since 2026-10-15 --until 2026-10-22 --project <primary-checkout>
```

The Codex collector does not implement `--navigation` or `--runs`; no shell/read
classification or navigation-cost attribution is inferred from its token spans.
Private raw reports, source fingerprints, argv, collection timestamps, exit
statuses and aggregation are retained in
`.waypost/experiments/wp21-accounting-checkpoint-20261022/`. No transcript bodies
or per-context identifiers are published in this note. API-price proxy fields
are not used to estimate subscription cost or quota.

## Findings

### Codex covered usage

| Category | Observed native tokens |
|---|---:|
| All covered spans | 364,923,053 |
| Explicit Waypost roles | 74,561,748 |
| Unattributed | 277,223,106 |
| Other explicit roles | 13,138,199 |

There are2738 observed spans. Input363,630,644 plus output1,292,409 equals total;
cached input351,277,696 and reasoning output507,198 are subsets, never extra
charges to add. Unknown role remains unknown. Main-session Waypost/tool context
can occur in the unattributed category; these data do not isolate its overhead.

| Explicit Waypost role | Contexts with period usage | Observed spans | Observed native tokens |
|---|---:|---:|---:|
| waypost-reviewer | 19 | 345 | 41,149,992 |
| waypost-planner | 21 | 249 | 21,728,992 |
| waypost-critic | 10 | 124 | 11,682,764 |

Reviewer is the largest explicitly attributed role in this sample. These are
observed native tokens, including cached input, not normalized task cost,
avoidable waste, unique source text, model price or proof that any mandatory
review should be removed. Task difficulty and acceptance quality are unmatched.

Discovery found220plain and251compressed candidates;252files matched this
primary scope,105matching archives decoded,219candidates belonged elsewhere.
No matching-file read/decode/limit/discovery error or conflicting context was
reported. There are213unknown-prefix contexts corpus-wide,123whose unknown
prefix may overlap the requested period. The latter is a diagnostic context
count, not missing-token quantity or a coverage percentage. Full totals and
full Waypost share remain `null` despite successful archive decoding.

Context coverage also reports **two corpus-wide `chain_gaps`**. This separate
diagnostic is not repaired by successful archive decoding and does not quantify
missing tokens. It can overlap the prefix diagnostics; never add these counts
as though they represented distinct contexts. Observed totals remain as reported,
while full totals/share remain unknown.

### Claude sparse window

Four complete requests contain565,276 native tokens. None has explicit Waypost
role/skill attribution (the collector's observed attributed share is0%). That
zero does not establish zero Waypost overhead. They span only
2026-10-15T01:04:44.803Z through2026-10-15T01:05:01.114Z in this retained corpus.
247source/metadata files were fingerprinted with no unreadable files or
incomplete/conflicting selected-request usage. Recognized navigation calls0;
unsupported shell calls3. There is no adequate CLI task/navigation cohort here.

## Comparison readiness

GitHub records PR#2 `mergedAt`2026-10-22T15:08:58Z for mergee3a3699
(the local merge commit was created at15:08:16Z). Today therefore mixes old main, migration preparation and
post-integration activity; do not call the full UTC day2026-10-22 a post cohort.
With the current date-only CLI,2026-10-23 is the earliest whole UTC day after
that integration. A future window alone would still be observational: a
matched task/model/harness/scope cohort and its target remain unregistered.
This note neither defines nor starts a new pilot or automatic follow-up.

Do not compare20.4322% to the older Claude14.6910% or Codex21.0511%/22.3528%
figures as a saving: periods, counter schemas, selected work and retained-source
coverage differ. No comparable accepted before/after task pair was produced.
The WP-21 comparison expected result remains unchecked.

## Conclusion

This checkpoint refreshes explicit role-usage evidence and identifies a
measurement gap. It does not justify further source splits, weaker acceptance
criteria, fewer required independent reviews or a model change. Existing
bounded handoffs and reuse of unchanged evidence remain the accepted procedure.
A navigation/operational phase collector for Codex would need its own bounded
metric contract and negative fixtures; it is not implemented by this report.
Any live paired experiment still needs the separately approved protocol and
compatibility/accounting gates of the accepted evaluation ADR. Historical
owner-assumed pilot charges remain separate from this observational report;
preparation costs are not zero or silently added to that allocation.

## References

- Epic [[WP-21]]: Source an agent can read in one pass (in-progress).
- [[the-cli-as-a-thin-entry-with-per-command-modules-each-readable-in-one-pass]]
- [[budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot]]
- `docs/how-it-works.md`, token accounting and limitations.

## Retained evidence identities

- `claude.json` SHA256 `523b8544456e3d1f1b8273e37c29de05ade8ee84c2e30fd99a8c6351598b0bed`.
- `codex.json` SHA256 `8b6e3cb47e16cc9dd74641874b8ca5d73329a324b395fe6506d8dde7e981dd03`.
- `collection.json` SHA256 `9bf48eebea669326678f7e334546f8126805931fadf791f870324aa63359a87f`.
- `aggregate.json` SHA256 `6f5a869637ceea6bdc8a1ce0a06d0ea0bfc13386e47a89d2a55608ab83877572`.

*Recorded by Codex (OpenAI), 2026-10-22. Draft research checkpoint; no architecture acceptance or causal savings claim.*
