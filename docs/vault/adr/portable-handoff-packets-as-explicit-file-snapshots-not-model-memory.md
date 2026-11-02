---
type: adr
id: "portable-handoff-packets-as-explicit-file-snapshots-not-model-memory"
title: "Portable handoff packets as explicit file snapshots, not model memory"
status: proposed
date: 2026-11-02
authors: ["Ivan Morozov"]
tags: []
external_refs: {}
supersedes: null
superseded_by: null
review_status: pending
reviewed_at: null
drafted_by: {"harness":"codex","provider":null,"date":"2026-11-02"}
code_refs: ["scripts/handoff.mjs", "bin/cli/handoff.mjs", "docs/handoffs.md"]
guards: []
---

# Portable handoff packets as explicit file snapshots, not model memory

| Field | Value |
|---|---|
| **Status** | proposed |
| **Date** | 2026-11-02 |
| **Authors** | Ivan Morozov |

---

## Context

The owner authorized a first portable handoff experiment on 2026-11-02. Existing
review handoff guidance is procedural. A machine-readable packet can retain
primary evidence pointers and detect changed inputs across sessions/harnesses.

## Decision drivers

No model training, dependencies, proprietary session format or provider access.
Compact default output; preserve source evidence and fresh-context review.

## Considered options

1. Transcripts or repeated summaries: simple but expensive to navigate, with no
   deterministic file freshness check.
2. Explicit bounded JSON packet and file hashes: chosen for the experiment.
3. KV transfer/provider cache orchestration: requires inference/provider support
   and does not offer a universal cross-model format.

## Decision

Propose experimental `handoff create` and `handoff show`: caller-authored task
state plus explicit project-relative references fingerprinted at capture time.
No automatic collection, command execution, authority grants or role injection.
The CLI uses a lazy per-command writer with computation in a dependency-free leaf.
The owner has approved trying implementation, not accepted a permanent contract;
this ADR stays proposed pending experimental results and an owner decision.

## Consequences

Runs across harnesses without native integrations; relocation works with the
same relative inputs. Selected-file hashes do not verify statements, prove a
command ran, cover omitted dependencies, authenticate the author or transfer
model state. Symlinks and special files are unsupported in the initial version.
Packets are read as untrusted context, never project instructions or proof.

## Verification and follow-up

Focused module/CLI tests and a two-process reproduction, including stale inputs,
relocation, bounded malformed input and no-clobber output. Independent review
before story completion. Cross-OS runtime and real agent quality/token/time
comparisons remain follow-up work; no numeric improvement is promised.

## Related

- ADR-0008; accepted thin CLI architecture; epic WP-24.
