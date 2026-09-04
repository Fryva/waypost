---

projectstore: derived
generated_at: 2026-09-04T18:23:31.523Z

---

# Vault link graph

Nodes (layout artifacts, keyed by vault-relative path) and typed edges,
derived from body links and frontmatter relations (source of truth).
Regenerate via `waypost graph`; grep a path to see an artifact's
full typed neighborhood, both directions, in one call.

## Nodes

| Path | Title | Type | Status |
|------|-------|------|--------|
| adr/0001-harness-agnostic-core.md | A harness-agnostic core: one CLI instead of hooks and slash commands | adr | accepted |
| adr/0002-vault-layout-policy.md | The `engineering` layout as the default; the vault is markdown in git | adr | accepted |
| adr/0003-agent-roles-across-harnesses.md | Agent roles: one neutral definition plus per-harness adapters | adr | accepted |
| adr/0004-path-and-name-split.md | Name split: the vault stays ProjectStore-compatible, project wiring lives in `.waypost/` | adr | accepted |
| adr/0005-harness-registry.md | A harness is data: the `harnesses/*.json` registry instead of a branch in a renderer | adr | accepted |
| adr/0006-commit-protocol.md | A commit protocol for parallel work across harnesses | adr | accepted |
| adr/0007-shared-vault-presence.md | Working from several devices and operating systems: presence, leases, network drives | adr | accepted |
| adr/0008-token-budget.md | Context spend as a design constraint, not an outcome | adr | accepted |
| adr/0009-artifact-integrity-checks.md | doctor verifies artifact integrity, not just story mechanics | adr | accepted |
| adr/0010-coordination-follows-the-repository.md | Coordination follows the repository: presence and leases in the git common dir | adr | accepted |
| adr/0011-decisions-that-check-themselves.md | Decisions that check themselves: guards and provenance in ADRs | adr | accepted |
| concepts/waypost-10-the-projects-memory-every-tool-shares-checked-without-a-model.md | Waypost 1.0: the project's memory every tool shares, checked without a model | concept | accepted |
| epics/WP-14/epic.md | Skills as the portable layer, and the first verified harnesses | epic | planned |
| epics/WP-14/stories/story-bundled-skills-and-loop-procedures-rendered-as-agent-skills.md | Bundled skills and loop procedures rendered as Agent Skills | story | done |
| epics/WP-14/stories/story-doctor-agentsmd-hygiene-size-duplicate-block-claude-bridge.md | doctor: AGENTS.md hygiene (size, duplicate block, Claude bridge) | story | done |
| epics/WP-14/stories/story-live-verification-codex-and-opencode-run-the-whole-loop.md | Live verification: Codex and OpenCode run the whole loop | story | in-progress |
| epics/WP-14/stories/story-skill-descriptions-inside-the-standing-context-budget.md | Skill descriptions inside the standing-context budget | story | done |
| epics/WP-14/stories/story-skills-registry-a-skillsdir-per-harness-with-evidence.md | Skills registry: a skills.dir per harness, with evidence | story | done |
| epics/WP-14/stories/story-waypost-skills-install-list-and-uninstall-doctor-staleness-brief-self-install.md | waypost skills install, list and uninstall; doctor staleness; brief self-install | story | done |
| epics/WP-15/epic.md | Coordination follows the repository, and ready work | epic | planned |
| epics/WP-15/stories/story-adr-0010-accepted-presence-leases-and-claims-in-the-git-common-dir.md | ADR-0010 accepted: presence, leases and claims in the git common dir | story | done |
| epics/WP-15/stories/story-blockedby-in-stories-waypost-ready-and-a-board-that-shows-blocked.md | blocked_by in stories, waypost ready, and a board that shows blocked | story | done |
| epics/WP-15/stories/story-doctor-dangling-and-cyclic-dependencies-duplicate-adr-numbers.md | doctor: dangling and cyclic dependencies, duplicate ADR numbers | story | done |
| epics/WP-15/stories/story-measure-the-git-common-dir-and-worktree-binding-on-macos-windows-and-a-cloud-drive.md | Measure the git common dir and worktree binding on macOS, Windows and a cloud drive | story | in-progress |
| epics/WP-15/stories/story-runtime-coordination-moves-to-the-git-common-dir-old-records-read-for-one-version.md | Runtime coordination moves to the git common dir; old records read for one version | story | done |
| epics/WP-15/stories/story-shared-checkout-detection-covers-sibling-worktrees-of-one-repository.md | Shared-checkout detection covers sibling worktrees of one repository | story | done |
| epics/WP-16/epic.md | Decisions that check themselves | epic | planned |
| epics/WP-16/stories/story-adr-0011-accepted-guards-and-draftedby-in-adr-frontmatter.md | ADR-0011 accepted: guards and drafted_by in ADR frontmatter | story | done |
| epics/WP-16/stories/story-command-guards-opt-in-behind-vault-config-never-run-by-fix.md | check guards name the project's own fitness command; doctor prints it and never runs it | story | planned |
| epics/WP-16/stories/story-doctor-evaluates-regex-guards-of-accepted-adrs.md | doctor evaluates regex guards of accepted ADRs | story | planned |
| epics/WP-16/stories/story-live-verification-cursor-gemini-cli-and-copilot.md | Live verification: Cursor, Gemini CLI and Copilot | story | planned |
| ops/measure-the-git-common-dir-across-checkout-layouts.md | Measure the git common dir across checkout layouts | runbook | active |
| ops/verify-a-harness-live-the-whole-waypost-loop-in-one-session.md | Verify a harness live: the whole waypost loop in one session | runbook | active |
| research/agent-tooling-landscape-september-2026-standards-task-graphs-orchestrators-adr-drift.md | Agent tooling landscape, September 2026: standards, task graphs, orchestrators, ADR drift | research | final |

## Edges

| From | Kind | To |
|------|------|----|
| concepts/waypost-10-the-projects-memory-every-tool-shares-checked-without-a-model.md | mdlink | adr/0010-coordination-follows-the-repository.md |
| concepts/waypost-10-the-projects-memory-every-tool-shares-checked-without-a-model.md | mdlink | adr/0011-decisions-that-check-themselves.md |
| concepts/waypost-10-the-projects-memory-every-tool-shares-checked-without-a-model.md | mdlink | epics/WP-14/epic.md |
| concepts/waypost-10-the-projects-memory-every-tool-shares-checked-without-a-model.md | mdlink | epics/WP-15/epic.md |
| concepts/waypost-10-the-projects-memory-every-tool-shares-checked-without-a-model.md | mdlink | epics/WP-16/epic.md |
| concepts/waypost-10-the-projects-memory-every-tool-shares-checked-without-a-model.md | mdlink | research/agent-tooling-landscape-september-2026-standards-task-graphs-orchestrators-adr-drift.md |
| epics/WP-14/epic.md | epic-contains | epics/WP-14/stories/story-bundled-skills-and-loop-procedures-rendered-as-agent-skills.md |
| epics/WP-14/epic.md | epic-contains | epics/WP-14/stories/story-doctor-agentsmd-hygiene-size-duplicate-block-claude-bridge.md |
| epics/WP-14/epic.md | epic-contains | epics/WP-14/stories/story-live-verification-codex-and-opencode-run-the-whole-loop.md |
| epics/WP-14/epic.md | epic-contains | epics/WP-14/stories/story-skill-descriptions-inside-the-standing-context-budget.md |
| epics/WP-14/epic.md | epic-contains | epics/WP-14/stories/story-skills-registry-a-skillsdir-per-harness-with-evidence.md |
| epics/WP-14/epic.md | epic-contains | epics/WP-14/stories/story-waypost-skills-install-list-and-uninstall-doctor-staleness-brief-self-install.md |
| epics/WP-14/epic.md | mdlink | concepts/waypost-10-the-projects-memory-every-tool-shares-checked-without-a-model.md |
| epics/WP-14/stories/story-bundled-skills-and-loop-procedures-rendered-as-agent-skills.md | mdlink | epics/WP-14/epic.md |
| epics/WP-14/stories/story-doctor-agentsmd-hygiene-size-duplicate-block-claude-bridge.md | mdlink | epics/WP-14/epic.md |
| epics/WP-14/stories/story-live-verification-codex-and-opencode-run-the-whole-loop.md | mdlink | epics/WP-14/epic.md |
| epics/WP-14/stories/story-skill-descriptions-inside-the-standing-context-budget.md | mdlink | epics/WP-14/epic.md |
| epics/WP-14/stories/story-skills-registry-a-skillsdir-per-harness-with-evidence.md | mdlink | epics/WP-14/epic.md |
| epics/WP-14/stories/story-waypost-skills-install-list-and-uninstall-doctor-staleness-brief-self-install.md | mdlink | epics/WP-14/epic.md |
| epics/WP-15/epic.md | epic-contains | epics/WP-15/stories/story-adr-0010-accepted-presence-leases-and-claims-in-the-git-common-dir.md |
| epics/WP-15/epic.md | epic-contains | epics/WP-15/stories/story-blockedby-in-stories-waypost-ready-and-a-board-that-shows-blocked.md |
| epics/WP-15/epic.md | epic-contains | epics/WP-15/stories/story-doctor-dangling-and-cyclic-dependencies-duplicate-adr-numbers.md |
| epics/WP-15/epic.md | epic-contains | epics/WP-15/stories/story-measure-the-git-common-dir-and-worktree-binding-on-macos-windows-and-a-cloud-drive.md |
| epics/WP-15/epic.md | epic-contains | epics/WP-15/stories/story-runtime-coordination-moves-to-the-git-common-dir-old-records-read-for-one-version.md |
| epics/WP-15/epic.md | epic-contains | epics/WP-15/stories/story-shared-checkout-detection-covers-sibling-worktrees-of-one-repository.md |
| epics/WP-15/epic.md | mdlink | adr/0010-coordination-follows-the-repository.md |
| epics/WP-15/epic.md | mdlink | concepts/waypost-10-the-projects-memory-every-tool-shares-checked-without-a-model.md |
| epics/WP-15/stories/story-adr-0010-accepted-presence-leases-and-claims-in-the-git-common-dir.md | mdlink | epics/WP-15/epic.md |
| epics/WP-15/stories/story-blockedby-in-stories-waypost-ready-and-a-board-that-shows-blocked.md | mdlink | epics/WP-15/epic.md |
| epics/WP-15/stories/story-doctor-dangling-and-cyclic-dependencies-duplicate-adr-numbers.md | mdlink | epics/WP-15/epic.md |
| epics/WP-15/stories/story-measure-the-git-common-dir-and-worktree-binding-on-macos-windows-and-a-cloud-drive.md | mdlink | epics/WP-15/epic.md |
| epics/WP-15/stories/story-runtime-coordination-moves-to-the-git-common-dir-old-records-read-for-one-version.md | mdlink | epics/WP-15/epic.md |
| epics/WP-15/stories/story-shared-checkout-detection-covers-sibling-worktrees-of-one-repository.md | mdlink | epics/WP-15/epic.md |
| epics/WP-16/epic.md | epic-contains | epics/WP-16/stories/story-adr-0011-accepted-guards-and-draftedby-in-adr-frontmatter.md |
| epics/WP-16/epic.md | epic-contains | epics/WP-16/stories/story-command-guards-opt-in-behind-vault-config-never-run-by-fix.md |
| epics/WP-16/epic.md | epic-contains | epics/WP-16/stories/story-doctor-evaluates-regex-guards-of-accepted-adrs.md |
| epics/WP-16/epic.md | epic-contains | epics/WP-16/stories/story-live-verification-cursor-gemini-cli-and-copilot.md |
| epics/WP-16/epic.md | mdlink | adr/0011-decisions-that-check-themselves.md |
| epics/WP-16/epic.md | mdlink | concepts/waypost-10-the-projects-memory-every-tool-shares-checked-without-a-model.md |
| epics/WP-16/stories/story-adr-0011-accepted-guards-and-draftedby-in-adr-frontmatter.md | mdlink | epics/WP-16/epic.md |
| epics/WP-16/stories/story-command-guards-opt-in-behind-vault-config-never-run-by-fix.md | mdlink | epics/WP-16/epic.md |
| epics/WP-16/stories/story-doctor-evaluates-regex-guards-of-accepted-adrs.md | mdlink | epics/WP-16/epic.md |
| epics/WP-16/stories/story-live-verification-cursor-gemini-cli-and-copilot.md | mdlink | epics/WP-16/epic.md |
