---
type: adr
id: "bounded-handoff-retrieval-and-content-addressed-receiver-snapshots"
title: "Bounded handoff retrieval and content addressed receiver snapshots"
status: proposed
date: 2026-11-03
authors: ["Ivan Morozov"]
tags: []
external_refs: {}
supersedes: null
superseded_by: null
review_status: pending
reviewed_at: null
drafted_by: {"harness":"codex","provider":null,"date":"2026-11-03"}
guards: []
---

# Bounded handoff retrieval and content addressed receiver snapshots

## Context

Current one-shot handoff inlines at most16KiB. Owner approved exploring bounded document requests and transferring changes between verified snapshots, after measurement, preparation, recovery and coding comparison.

## Decision drivers

Keep harness neutrality, fresh/no-tools receiver isolation, bounded untrusted input, existing team authority/admission and verifiable content identity.

## Considered options

1. Increase inline context without bounds: rejected for unmeasured spend and weak failure behavior.
2. Give peers direct filesystem/shell tools: rejected because it broadens the existing managed receiver surface.
3. Explicit host-mediated manifest data requests and verified local content objects: proposed experimental approach.

## Decision

Propose an opt-in broker for exact authorized packet document/range requests. Each native round is separately admitted and recoverable under existing team receipts and stable keys. A receiver-local bounded content store may acknowledge a base only after verifying its manifest/objects; deltas reconstruct and verify the full snapshot or explicitly require full transfer. Peer claims alone are insufficient. No global caches, private session import, hidden model-state reuse, automatic hooks or new authority.

## Consequences

This may reduce transferred/repeated source bytes; it does not establish reduced native token use. Fresh receiver contexts can require reinlining unchanged content. Additional request rounds can cost more and must be measured. Store failure/missing base must remain a normal explicit fallback. This ADR remains proposed; roadmap approval does not assert a permanent wire/storage contract.

## Verification and follow-up

Independent critic before implementation; malformed/range/staleness/alias/digest/baseline-fallback and interrupted-round regressions, then retained native examples under the existing remaining allocation. See verified-handoff-continuation-with-measured-usage-bounded-retrieval-and-confirmed-deltas.
