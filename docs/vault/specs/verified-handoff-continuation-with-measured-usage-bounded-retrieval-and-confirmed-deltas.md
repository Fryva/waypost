---
type: spec
id: "verified-handoff-continuation-with-measured-usage-bounded-retrieval-and-confirmed-deltas"
title: "Verified handoff continuation with measured usage bounded retrieval and confirmed deltas"
status: draft
date: 2026-11-03
updated: 2026-11-03
authors: ["Ivan Morozov"]
tags: []
external_refs: {}
adr: ["bounded-handoff-retrieval-and-content-addressed-receiver-snapshots"]
stories: []
review_status: pending
reviewed_at: null
---

# Verified handoff continuation with measured usage bounded retrieval and confirmed deltas

## Scope and authorization

Owner approved the six-stage roadmap in this chat. This document describes the experimental continuation; it does not accept the proposed packet or retrieval ADRs. Existing authorization, isolated receiver surfaces and token admission remain authoritative.

## Stage contracts

1. Measurement: preserve additive optional versioned native_usage through adapter, Host and immutable receipt. Schema has protocol1, existing counter schema, coverage, before/after/delta counter objects or null; values are bounded decimal strings and keysets are adapter-specific. Claude four disjoint buckets, Codex cumulative totals with cached/reasoning subsets, OpenCode normalized disjoint input/output/reasoning/cache-read/cache-write. Total charge remains the existing native span, never sum subsets. Old events without diagnostics replay. Missing diagnostic data cannot erase known actual expense or become zero. Preserve monotonic millisecond handoff preparation/send/relay/poll/total durations with an explicit per-attempt scope on resume.

2. Preparation: generate private route references from existing registered team state; validate binding/packet/owner ceilings and collect nonbillable native preflight with owned closure. Accept supported absolute executable only through actual native evidence, preserving pins and read-only guard. No new participant grants or provider credentials.

3. Recovery: bounded overall execution deadline, persisted stable question identity, force-kill tests at actual process boundaries. Received proof recovers without new inference; uncertain consumed work retains accounting and cannot be replayed.

4. Coding experiment: three frozen small development tasks, full-history/ordinary-summary/packet conditions, independently executed tests, matched actual model/permissions, counterbalanced order. Control+all subsequent operational model requests share the remaining467813 native tokens of the original500000. Preserve old32187 experiment spending plus17520 unrelated history. No global budget clear, unsupported version pin bypass or unknown-as-zero. One-time development/driving chat remain separate. Persist runner, hashes, results and negative outcomes.

5. Retrieval: explicit structured JSON data requests interpreted by the Host over a broker allowlist of packet references, strict UTF-8/line ranges, immutable source checks, cumulative limits and admission per native round. Native model sessions remain fresh/no-tools. The broker serves data only and does not execute peer strings. Reuse only pure sealing/range primitives where existing evaluation authorization/isolation contract remains unchanged. A bound evaluation broker is one-shot per native context; never rebind it across fresh rounds or invent native thread IDs. Handoff owns round identity and aggregate limits; evaluation tool surfaces and grants are not imported.

6. Delta: receiver acknowledges only verified local object availability for an exact manifest/base digest. Hash-checked reconstruction, explicit full fallback, no trusted peer has-object flag without local verification. Fresh native sessions still receive whatever context their task needs; byte-transfer dedup is distinct from provider KV-cache or token saving.

## Compatibility and validation

Packet v1 and one-shot delivery remain usable. New wire/data shapes are opt-in and bounded. Every stage gets focused regression checks and an independent acceptance pass. Heavy tests run serially through Waypost with no agents beside them. Runtime coverage is stated per OS/version; local tests do not imply cross-OS verification. No changes to standing routing context without its existing token-budget checks.


## Coding experiment protocol refinement

Use isolated copies of three small real Waypost modules, not production edits or
claims that seeded faults were discovered production bugs: markdown-cell escaping
with a deliberately removed global pipe replacement; pure artifact numbering
from an explicit names array; AbortSignal support for the terminal prompt while
preserving a newer stderr default against the historical stdout version.
The exact baseline bytes, hashes, task and grading tests are frozen before calls.

Each no-tools answer is exactly `{files:[{path,content,base_sha256}]}`, inside the
existing correlated handoff response. Exactly one task-allowlisted file, current
base hash, strict UTF-8 replacement at most6144bytes, complete answer at most8192.
Reject extra files/keys and altered base identity before applying any change.
Each answer is applied only to its own disposable fixture copy and graded by a
separate hidden runner; expected solutions/tests never enter model context.
A plain cwd is not a security boundary. Verify bounded execution isolation,
no inherited credentials, no network, no reads outside the frozen fixture and
necessary runtime allowlist, no writes outside the fixture, process
closure and timeout before running any generated replacement. The hidden oracle and pass/fail assertions remain in the trusted parent outside
the candidate process. Candidate stdout, TAP text or exit0 cannot establish pass;
missing expected observations, early exit, protocol errors or timeout fail. The
candidate cannot read hidden grader/oracle files. Before paid calls, negative
controls must reject outside sentinel reads/writes, network access, descendant
escape, early process.exit(0), forged success and assertion replacement. Retain
actual OS/executable/sandbox-policy digests and owned closure evidence. A platform without verified
execution isolation must refuse grading and report missing coverage.

Tasks A/B/C use Latin-square orders history-summary-packet, summary-packet-history,
packet-history-summary. One observation per task/condition, no significance claim.
Ordinary summaries are deterministic curated context, preparation0model calls,
and this limitation is stated; all conditions receive the same current source,
task constraints and permissions. Retain invalid patches and failing tests.

## Retrieval protocol refinement

Opt-in rounds keep the outer correlated JSON response. A request answer is
exactly `{kind:"handoff-data-request",requests:[{path,start_line,end_line}]}`;
paths must be explicit current packet references and ranges positive inclusive
integers. Initially at most4requests/round,200lines/request,8KiB/response fragment,
3native rounds total including the initial turn,16KiB serialized payload/round,
and48KiB cumulative serialized payload. These are handoff bounds, not defaults
inherited from the evaluation broker. Over-budget input fails, never truncates.

Every continuation binds the root challenge, exact packet/manifest digest,
round number and previous authoritative raw-output digest. Persist the verified
request response and next deterministic request key before starting its inference.
Repeated current rounds reuse the same key/question; changed request/payload
cannot reuse that key. Revalidate actual bytes and hashes for every fragment and
before consuming a final answer. Interrupted consumed rounds remain uncertain;
no new round can bypass existing reservation or call ceiling. No native tools,
evaluation grants, bound evaluation-broker rebind or invented native thread IDs.

## Delta protocol refinement

Use an opt-in versioned transfer manifest separate from packet v1. It names full
target path/state/hash/bytes and explicit deletions relative to an exact base.
Content objects publish atomically only after hash/size validation. Store scope
is one authenticated receiver/incarnation, with a bounded quota and explicit
store-owned garbage collection; never remove foreign or unproven files.
A baseline availability report is emitted by the receiver Host after local validation,
recorded through existing authenticated team messaging and bound to receiver,
incarnation, manifest and transfer identity. Existing messaging proves participant identity/incarnation, not Host origin or
local validation. The report is only an optimization hint, never trusted content
proof. A model echo or sender-local has-object flag is insufficient. Validate
the report against authority and rehash every
needed local object when applying a delta, including after acknowledgement-time
GC/eviction/corruption. Verify reconstructed full target digest before publication
and acknowledgement. Missing base requests an explicit bounded full transfer.
Measure object/serialized transfer bytes separately from native model input; a
fresh model still needs its task context reconstructed and inlined by its Host.
