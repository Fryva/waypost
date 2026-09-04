---
type: concept
slug: "waypost-10-the-projects-memory-every-tool-shares-checked-without-a-model"
title: "Waypost 1.0: the project's memory every tool shares, checked without a model"
status: accepted
date: 2026-09-04
authors: ["Ivan Morozov"]
tags: []
---

# Waypost 1.0: the project's memory every tool shares, checked without a model

## What is it

The approved direction for Waypost after 0.13.1 (owner's approval: 2026-09-04). One
sentence: the project's memory that every tool shares, and that can be checked
without a model. Waypost does not compete with spec-driven frameworks or with
agent orchestrators; it is the layer they use — a git-native vault, a
deterministic doctor, and coordination across sessions, tools and machines.

## Why it matters

By September 2026 AGENTS.md is a Linux Foundation standard read by 30+ tools,
Agent Skills (`SKILL.md`) is an open standard read by 40+, orchestrators isolate
agents by git worktree, Beads showed autonomous loops need a dependency graph and
"ready work", and the ADR market answers decision drift with hosted platforms.
Waypost is aligned with the first, ships skills nobody discovers, coordinates one
checkout only, has no dependency graph, and never checks an accepted decision
against the code. Each gap is a bounded piece of work; together they are 1.0.

## How it works

Seven directions, three releases, one bar.

| | Direction | Verdict |
|---|---|---|
| A | Skills as the portable layer: bundled skills and loop procedures rendered as standard Agent Skills, installed per harness like roles | do first — epic WP-14 |
| B | Coordination follows the repository: presence, leases and claims in the git common dir so worktrees see each other | do, ADR-0010 — epic WP-15 |
| C | `blocked_by` on stories and `waypost ready` for unblocked, unclaimed work | do with B — epic WP-15 |
| D | Guards in ADR frontmatter checked by doctor without a model; `drafted_by` provenance | do, ADR-0011 — epic WP-16 |
| E | Delta specs in the OpenSpec sense | deferred until asked |
| F | An MCP façade for harnesses without a shell | later, on demand |
| G | A verified compatibility matrix, one harness per release | every release — WP-14, WP-16 |

Releases: 0.14 (A, first two `verified` harnesses, AGENTS.md hygiene in doctor),
0.15 (B, C), 0.16 (D, three more harnesses), then 1.0.

The 1.0 bar, all measurable: five harnesses `verified` with a date and the whole
loop run in three; the standing context with skills at most 800 tokens, pinned
by a test; two sessions in two worktrees see each other's claims within one
command; doctor catches a guard violation with no model; Waypost's own plan
lives in this vault.

## When to use / not use

Not to do, and why:

- A database instead of markdown (Beads needs Dolt, single writer): the vault
  must stay readable without the tool.
- Twelve personas (BMAD): one role pass costs $1.62 on Opus; five roles called
  on purpose are cheaper and clearer.
- An orchestrator or worktree manager: eleven exist; Waypost is their substrate.
- Semantic search: at 32 artifacts pointer search costs 44 tokens against 1119
  for reading the graph; revisit at 500 artifacts in a real vault.
- Hooks as a required interface (ADR-0001 stands); hook recipes may be documented
  as optional.
- A fourth spec-driven framework: the difference is the decision log, doctor
  and coordination, not the workflow.

## Related

- Epics: [WP-14](../epics/WP-14/epic.md), [WP-15](../epics/WP-15/epic.md), [WP-16](../epics/WP-16/epic.md)
- [ADR-0010](../adr/0010-coordination-follows-the-repository.md) and [ADR-0011](../adr/0011-decisions-that-check-themselves.md), accepted 2026-09-04
- Research: [Agent tooling landscape, September 2026](../research/agent-tooling-landscape-september-2026-standards-task-graphs-orchestrators-adr-drift.md)

## References

- The review page this concept was approved from: claude.ai/code/artifact/b8ac9ce3-e3c8-44d6-a1e1-01149d5a9f16
- Sources are listed in the research note above.

---

*Last updated: 2026-09-04*
