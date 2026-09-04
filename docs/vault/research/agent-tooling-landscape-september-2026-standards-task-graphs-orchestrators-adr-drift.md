---
type: research
slug: "agent-tooling-landscape-september-2026-standards-task-graphs-orchestrators-adr-drift"
title: "Agent tooling landscape, September 2026: standards, task graphs, orchestrators, ADR drift"
status: final
date: 2026-09-04
authors: ["Ivan Morozov"]
tags: []
review_status: pending
reviewed_at: null
---

# Agent tooling landscape, September 2026: standards, task graphs, orchestrators, ADR drift

## Question

What settled in the agent-tooling landscape by September 2026, and what does each settlement mean for Waypost's next releases?

## TL;DR

Standards settled around files in git (AGENTS.md, Agent Skills); isolation settled
around git worktrees; task tracking for agents settled around dependency graphs
with "ready work"; decision drift is answered by hosted platforms and fitness
functions. Waypost should ship its procedures as skills, follow the repository
rather than the checkout, add dependencies and `ready`, and check decisions
deterministically — and not build a database, an orchestrator, or a workflow
framework.

## Method

Web search on 2026 sources (8 queries), then targeted reading of primary pages: the Agent Skills specification, the Beads README, the OpenSpec README, the awesome-agent-orchestrators list, an ADR-governance write-up, the AGENTS.md field guide, and upstream ProjectStore. One afternoon, one author; claims from vendor blogs are marked as such in the findings.

## Findings

- **AGENTS.md**: stewarded by the Agentic AI Foundation under the Linux Foundation since 2025-12; 60,000+ repositories; 30+ tools read it natively. Field practice: 150–200 lines at the root, nested files in monorepos, imperative rules with explicit never-do lists; Claude Code reads it through `@AGENTS.md` in CLAUDE.md.
- **Agent Skills**: `SKILL.md` with `name` (≤64, lowercase, hyphens) and `description` (≤1024), optional `license`, `compatibility`, `metadata`, `allowed-tools`; body ≤500 lines recommended; progressive disclosure — name and description at startup (~100 tokens), body on activation. 40+ clients including Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Copilot, pi, Kiro, Roo, Trae, Windsurf. Discovery paths are per client and must be taken from each client's docs.
- **Beads**: hierarchical hash ids, dependency types (blocks, related, duplicates, supersedes), `bd ready` = no open blockers, atomic claim, Dolt-backed storage with single-writer embedded mode, git sync via `refs/dolt/data`.
- **Spec-driven**: Spec Kit (constitution, NEEDS CLARIFICATION), OpenSpec (change bundle: proposal/specs delta/design/tasks, archived and merged into `specs/`), BMAD (12+ personas), Kiro (IDE). Decision guides pick by team size and greenfield/brownfield.
- **Orchestrators**: eleven cited tools, all on worktree-per-agent; worktrees give isolation but not decomposition, dependencies or semantic conflicts. A few file/git-based coordinators exist (swarm-protocol, gastown).
- **ADR drift**: "vibe architecting" — agents decide silently; answers are hosted decision corpora (ArchSteer, Catio), CI fitness functions, and per-tool hooks that ask a model to compare diffs with ADRs. Pitfalls noted: fabricated rationale in agent-written ADRs, missing attribution.
- **MCP vaults**: exposing a markdown vault over MCP is the 2026 default for note tools (Obsidian MCP, vault-mcp, brain.md); local stdio processes, files remain the truth.
- **Upstream ProjectStore**: six agents (adds a write-capable Clerk), hooks-based session registry, no dated 2026 changes.

## Comparison

| Settlement | Waypost today | Implication |
|---|---|---|
| AGENTS.md standard | routing block in AGENTS.md, Claude bridge handled | keep; add hygiene checks to doctor |
| Agent Skills standard | 4 skills + 13 procedures shipped, none discoverable | render as skills, install per harness (WP-14) |
| Worktree per agent | coordination lives per checkout | git common dir (ADR-0010, WP-15) |
| Ready work | claims exist, no dependencies | `blocked_by`, `waypost ready` (WP-15) |
| Decision drift | code_refs resolve, nothing checks conformance | guards in ADRs (ADR-0011, WP-16) |
| MCP vaults | CLI only | optional façade, on demand |

## Conclusion

Adopted as the concept "Waypost 1.0" (concepts/) and planned as epics WP-14, WP-15, WP-16.

## References

- https://agents.md/ ; https://www.iuriio.com/blog/posts/2026/05/agents-md-field-guide-2026
- https://agentskills.io/specification ; https://agentskills.io/
- https://github.com/gastownhall/beads ; https://betterstack.com/community/guides/ai/beads-issue-tracker-ai-agents/
- https://github.com/Fission-AI/OpenSpec ; https://dev.to/willtorber/spec-kit-vs-bmad-vs-openspec-choosing-an-sdd-framework-in-2026-d3j
- https://github.com/andyrewlee/awesome-agent-orchestrators ; https://www.augmentcode.com/tools/open-source-agent-orchestrators
- https://codex.danielvaughan.com/2026/04/28/codex-cli-architecture-decision-records-adr-automated-governance/ ; https://dev.to/alexandreamadocastro/stop-architecture-drift-operationalizing-adrs-with-automated-fitness-functions-22oi
- https://github.com/TensorBlock/awesome-mcp-servers/blob/main/docs/knowledge-management--memory.md ; https://pypi.org/project/vault-mcp/
- https://github.com/SmartAndPoint/ProjectStore

---

*Last updated: 2026-09-04*
