---
type: research
slug: "administrative-only-waypost-usage-with-useful-work-excluded"
title: "Administrative-only Waypost usage with useful work excluded"
status: draft
date: 2026-10-22
authors: ["Ivan Morozov", "Codex (OpenAI)"]
code_refs: ["scripts/token-codex.mjs", "docs/vault/research/post-integration-token-accounting-checkpoint.md"]
tags: []
review_status: reviewed
reviewed_at: 2026-10-22
---

# Administrative-only Waypost usage with useful work excluded

## Result

For UTC [2026-10-15,2026-10-22), the conservative local audit identifies **one
metadata-only model response costing141,656 native tokens**. It issued only
`node bin/waypost.mjs story plan ... --write` from the CLI migration worktree,
opening the story "Validate sealed-source collisions before filesystem reads"
under WP-21 "Source an agent can read in one pass" (now done). No code reading,
editing, tests, useful assistant text or role dispatch occurs in this response.
The recorded reasoning is79tokens; its semantics are unavailable. This is
response-level operational attribution, not proof that all hidden reasoning
was administrative. There are **no qualifying zero-recorded-reasoning metadata
responses** under this recognizer; that absence is not zero overhead.

| Component | Native tokens |
| --- | ---: |
| Input |141,460|
| Cached input, subset of input |138,112|
| Uncached input, difference |3,348|
| Output |196|
| Reasoning, subset of output |79|
| Total = input + output |141,656|

Cached input is97.50%of this total. Uncached input plus output is3,544tokens;
that arithmetic is not a billing or quota conversion. Cached tokens remain in
native total and must not be added a second time.

The141,656tokens are **a detected subset, not the full cost of Waypost**. Relative
to the previous checkpoint's364,923,053 observed native tokens they are
0.038818%of that covered reference, or0.051098%of the277,223,106 verified main
context tokens audited here. Neither percentage is the full administrative
share, a weekly subscription percentage or a proven saving. The previous
20.4322%attributed-role figure includes useful work and is excluded entirely
from the administrative numerator.

Useful diagnostics/orientation (two responses,239,268tokens) and resource
admission (one response,156,070tokens) are separate excluded observations.
They are not added to the metadata amount. Useful planner/critic/reviewer and
other explicit role contexts are excluded wholesale. Generic CI watching,
Git operations, mixed/code responses, unbound polls and unknown syntax are
excluded. Unclassified usage is unknown, not automatically useful or waste.

## Measurement contract and coverage

This is an offline local trace audit, not a production collector change or a
live model experiment. Start from the preceding checkpoint's33unattributed
contexts with period usage and exact primary-project session scope. All33plain
JSONL sources were read sequentially under `waypost run --heavy`. Their
reconstructed six-field period totals match the checkpoint:277,223,106native
tokens. No source was excluded for period drift or quarantine. Full-file hashes
may change as active sessions append after the window; reads are not atomic
snapshots. Reference agreement verifies the selected period, not the later tail.
The33main contexts contain1,871covered spans. Only four responses survive
the narrow service recognizer (one metadata, two diagnostics, one capacity);
1,859spans fail mixed/unknown/unpaired classification and eight have an
ambiguous usage-frame count. These are exclusion counts, not useful-work or
missing-token amounts. Matching all source period totals does not mean full
service classification. This very low classification coverage prevents
extrapolating the detected fraction to total overhead.

Some tool calls in primary sessions target the known sibling CLI worktree;
they remain part of those sessions, without adding sibling session totals.

Select a unique owned `token_usage_record.response_id`, with matching thread
and assistant-call turn metadata. Bound its assistant items between adjacent
native usage records; a turn can contain several distinct responses. Require
only recognized service calls, one unique `call_id` per call, exactly one
matching result after its usage record and before the next nonzero token-count
frame. Assistant text, unknown/mixed actions, missing items/results, multiple
usage frames, duplicate/conflicting IDs, malformed input or broken chains
exclude the response (ambiguous identity quarantines the source).

Require two independently anchored monotone cumulative chains: consecutive
native response totals and token-count totals. The native delta, recorded
response usage, token-count delta and last usage must all agree. Absolute
native and token-count cumulatives need not agree: this corpus contains a
historical constant offset. Require valid six-field safe-integer counters,
input+output=total, cached/reasoning subsets and period-contained endpoints.
No first zero, first-response charge or missing-token quantity is inferred.

A bounded non-evaluating recognizer accepts literal
`text(await tools.exec_command({...}))` wrappers and matching structured calls.
Unknown JavaScript, templates, variables, extra statements, unknown tool fields,
unrecognized workdirs/shells, code/test commands and shell substitutions/pipes
fail closed. Literal semicolon-separated commands qualify only when every
command independently belongs to the same category. Metadata operations are
sessions/lease/reconcile/story plan/story close, with bounded recognized flags;
no force or doctor repair. Node entry paths are limited to known project/CLI
worktree paths. Bare `waypost` spelling alone does not authenticate a historical
binary; no selected metadata response depends on it. This is command-intent
classification with native usage attribution, not historical binary attestation.

Doctor/brief/next/status are separately excluded useful process diagnostics;
capacity is separately excluded resource protection. Procedure loads and Git
wrappers are separate categories if recognized. All CI launch/poll/wait usage
is excluded in this implementation, avoiding ambiguous session/cell lifetimes.
Hidden reasoning is separated by zero/nonzero recorded amount, not guessed.

The old overall denominator is a frozen reference, not re-estimated by this
33-context audit. If a source fails period reproduction or identity, its old
observed total is reported as excluded and removed from eligible-main coverage.
Any ratio to the old overall reference describes only the detected subset;
no complete administrative rate is published.

## Verification and evidence

The final local runner passes42assertion checks, including a positive owned
response, two different responses in the same turn, absent assistant items,
foreign identities/results and foreign-turn results, duplicate results, missing
results/baselines, duplicate response IDs,
usage disagreement, mixed text/code/admin, unknown flags/fields/paths,
attached shell operators/redirects, variables/globs, substitution/chaining and
cached/reasoning subset violations. A failing duplicate
ID control initially exposed an exclusion bug; independent criticism also
found attached-shell-operator and result-ownership gaps. All were fixed and
covered by negative controls before the final audit. The selected original
response was independently confirmed from raw lines12016–12025.

Private evidence: `.waypost/experiments/wp21-overhead-20261022/` contains
`audit.json` (per-response record lines/hashes, native counters, source hashes,
coverage and exclusions), `runner.py.txt` (exact nonproduction analyzer), and
`safe-association-example.json` (bounded structural native-record example).
Personal transcript bodies and local session paths are not published in Git.
The final analyzer run exited0,42checks passed,33/33periods reproduced.
No new native pilot or model call was launched by the analyzer. Authoring and
required independent review have their own unisolated cost, not zero cost.

## What remains unknown

Standing Waypost instruction tokens inside useful/mixed requests, their cached
reuse, ambiguous mixed service operations, useful reasoning inside a metadata
response and the counterfactual workload without Waypost cannot be separated
exactly here. Therefore **the complete real overhead and its weekly quota share
remain unknown**. This measurement replaces no unknown with an estimate and
provides no causal before/after saving or reason to drop required reviews.

## References

- [[post-integration-token-accounting-checkpoint]]
- Epic WP-21: Source an agent can read in one pass (in-progress).

## Retained identities

- `audit.json` SHA256 `3efbe39f399752ab5ba1fb77760f3e8c53c4ced63eb1dbf6199d9b0dc3f1f695`.
- `runner.py.txt` SHA256 `59bfcb69d68c4bb8adbff62e866c8537df910b0b0090259f62a5596614978901`.
- `safe-association-example.json` SHA256 `d349b8f908dc8de55324626c6d174cc80cf0d4ce97ae4921e979c2dbec6631b5`.

*Codex (OpenAI),2026-10-22. Offline operational attribution; no architecture or native-pilot approval.*
