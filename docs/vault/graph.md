---

projectstore: derived
generated_at: 2026-10-19T16:26:39.968Z

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
| adr/automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation.md | Automatic model strength discovery with expiring evidence and periodic revalidation | adr | accepted |
| adr/automatic-role-redistribution-on-verified-model-quota-exhaustion.md | Automatic role redistribution on verified model quota exhaustion | adr | proposed |
| adr/automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets.md | Automatic task-aware model routing with capability floors and cost budgets | adr | accepted |
| adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md | Budgeted read-only role evaluation over a sealed source snapshot | adr | accepted |
| adr/cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first.md | Cleanup to a machine-wide limit: set by the owner, idle artifacts oldest first | adr | accepted |
| adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md | Disk hygiene by discovery: a toolchain registry, a machine and project profile, and cleanup only after a yes | adr | accepted |
| adr/enforce-the-owners-token-budget-for-live-runs-across-teams.md | Enforce the owner's token budget for live runs across teams | adr | accepted |
| adr/harness-tool-surfaces-bound-by-evidence-instead-of-an-empty-tool-list.md | Harness tool surfaces bound by evidence instead of an empty tool list | adr | accepted |
| adr/heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md | Heavy work sized to the machine: waypost capacity, a machine-wide slot, and a rule to check first | adr | accepted |
| adr/memory-for-heavy-work-half-the-memory-up-to-2-gb-macos-without-claimed-pages-no-new-agents-beside-a-job.md | Memory for heavy work: half the memory up to 2 GB, macOS without claimed pages, no agents beside a job | adr | proposed |
| adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md | Model-aware teams across harness sessions with one authority and independent review | adr | accepted |
| adr/native-configuration-profiles-ranked-by-fresh-role-specific-calibration.md | Native configuration profiles ranked by fresh role-specific calibration | adr | accepted |
| adr/owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check.md | Owner-assigned team roles by default with calibration as an optional check | adr | accepted |
| adr/owners-global-rules-one-harness-neutral-source-reaching-every-installed-harness-on-every-machine.md | Owner's global rules: one harness-neutral source, reaching every installed harness on every machine | adr | accepted |
| adr/record-the-operating-system-of-a-commit-in-a-waypost-os-trailer.md | Record the operating system of a commit in a Waypost-OS trailer | adr | accepted |
| adr/setup-asks-the-running-harness-not-only-the-projects-files.md | setup asks the running harness, not only the project's files | adr | proposed |
| adr/solo-entry-without-a-profile-an-external-task-trailer-doctor-on-a-vault-path-a-vault-level-opt-out-from-self-install.md | Solo entry without a profile: an external task trailer, doctor on a vault path, a vault-level opt-out from self-install | adr | accepted |
| adr/subscription-cli-token-accounting-with-separate-strict-billing-enforcement.md | Subscription CLI token accounting with separate strict billing enforcement | adr | accepted |
| adr/the-cli-as-a-thin-entry-with-per-command-modules-each-readable-in-one-pass.md | The CLI as a thin entry with per-command modules, each readable in one pass | adr | proposed |
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
| epics/WP-15/stories/story-the-command-on-path-survives-a-checkout-that-loses-its-executable-bit.md | The command on PATH survives a checkout that loses its executable bit | story | done |
| epics/WP-15/stories/story-the-merge-driver-regenerates-a-derived-view-without-writing-into-the-worktree.md | The merge driver regenerates a derived view without writing into the worktree | story | planned |
| epics/WP-16/epic.md | Decisions that check themselves | epic | planned |
| epics/WP-16/stories/story-adr-0011-accepted-guards-and-draftedby-in-adr-frontmatter.md | ADR-0011 accepted: guards and drafted_by in ADR frontmatter | story | done |
| epics/WP-16/stories/story-command-guards-opt-in-behind-vault-config-never-run-by-fix.md | check guards name the project's own fitness command; doctor prints it and never runs it | story | done |
| epics/WP-16/stories/story-doctor-evaluates-regex-guards-of-accepted-adrs.md | doctor evaluates regex guards of accepted ADRs | story | done |
| epics/WP-16/stories/story-live-verification-cursor-gemini-cli-and-copilot.md | Live verification: Cursor, Gemini CLI and Copilot | story | planned |
| epics/WP-17/epic.md | Disk hygiene by discovery | epic | planned |
| epics/WP-17/stories/story-detectors-superseded-device-support-unavailable-simulators-duplicate-toolchains.md | Detectors: superseded device support, unavailable simulators, duplicate toolchains | story | planned |
| epics/WP-17/stories/story-discovery-and-the-profile-the-scheme-of-what-waypost-works-with.md | Discovery and the profile: the scheme of what Waypost works with | story | done |
| epics/WP-17/stories/story-doctor-and-next-surface-build-artifacts-the-cleanup-prompt.md | doctor and next surface build artifacts | story | planned |
| epics/WP-17/stories/story-the-machine-wide-limit-automatic-cleanup-at-the-end-of-a-heavy-run.md | The machine-wide limit: automatic cleanup at the end of a heavy run | story | in-progress |
| epics/WP-17/stories/story-verified-on-linux-and-windows-virtual-machines.md | Verified on Linux and Windows virtual machines | story | planned |
| epics/WP-17/stories/story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit.md | waypost clean: a classified plan, removal after a yes, the setup audit | story | done |
| epics/WP-17/stories/story-waypost-size-the-read-only-scan-project-and-global.md | The toolchain registry and a tool-agnostic waypost size | story | done |
| epics/WP-18/epic.md | Heavy work sized to the machine | epic | planned |
| epics/WP-18/stories/story-a-live-holder-started-through-a-differently-cased-path-still-reads-as-live-on-windows.md | A live holder started through a differently cased path still reads as live on Windows | story | done |
| epics/WP-18/stories/story-capacity-verified-on-linux-and-windows-virtual-machines.md | Capacity verified on Linux and Windows virtual machines | story | in-progress |
| epics/WP-18/stories/story-cleanup-tests-prove-a-live-holder-on-windows-fixtures-record-the-comm-tasklist-reports-and-the-fake-clean-tool-is-a-real-executable.md | Cleanup tests prove a live holder on Windows: fixtures record the comm tasklist reports, and the fake clean tool is a real executable | story | done |
| epics/WP-18/stories/story-the-heavy-work-rule-in-every-project-and-wayposts-own-heavy-work.md | The heavy-work rule in every project, and Waypost's own heavy work | story | done |
| epics/WP-18/stories/story-the-heavy-work-slot-is-machine-wide-on-windows-not-one-per-packaged-app.md | The heavy-work slot is machine-wide on Windows, not one per packaged app | story | done |
| epics/WP-18/stories/story-waypost-capacity-the-machines-real-free-resources-measured-by-each-os.md | waypost capacity: the machine's real free resources, measured by each OS | story | done |
| epics/WP-18/stories/story-waypost-run-heavy-a-machine-wide-slot-for-heavy-work.md | waypost run --heavy: a machine-wide slot for heavy work | story | done |
| epics/WP-19/epic.md | The process layer on any host, and honest harness detection | epic | planned |
| epics/WP-19/stories/story-agentsmd-is-not-evidence-that-codex-is-used-here.md | setup asked the filesystem alone about which harnesses a project uses | story | in-progress |
| epics/WP-19/stories/story-an-empty-team-authority-on-a-network-share-does-not-block-commits-from-another-machine.md | An empty team authority on a network share does not block commits from another machine | story | done |
| epics/WP-19/stories/story-codex-keeps-one-session-and-direct-installers-see-the-running-harness.md | Codex keeps one session and direct installers see the running harness | story | in-progress |
| epics/WP-19/stories/story-project-rules-reach-claude-sessions-on-a-vm-whose-checkout-is-on-a-network-share.md | Project rules reach Claude sessions on a VM whose checkout is on a network share | story | planned |
| epics/WP-19/stories/story-ps-in-the-c-locale-so-the-process-table-exists-on-any-host.md | ps in the C locale, so the process table exists on any host | story | done |
| epics/WP-20/epic.md | One task coordinated across harnesses and AI models | epic | planned |
| epics/WP-20/stories/story-addressed-messages-and-verified-harness-delivery.md | Addressed messages and verified harness delivery | story | planned |
| epics/WP-20/stories/story-assignments-supervision-and-stronger-model-handover.md | Assignments supervision and stronger-model handover | story | planned |
| epics/WP-20/stories/story-automatic-model-routing-by-task-complexity-and-expected-cost.md | Automatic model routing by task complexity and expected cost | story | planned |
| epics/WP-20/stories/story-independent-strongest-model-review-of-immutable-evidence.md | Independent strongest-model review of immutable evidence | story | planned |
| epics/WP-20/stories/story-live-claude-and-opencode-coordination-on-one-task.md | Live Claude, Codex and OpenCode coordination on one task | story | planned |
| epics/WP-20/stories/story-local-authority-log-and-crash-safe-mutations.md | Local authority log and crash-safe mutations | story | planned |
| epics/WP-20/stories/story-participant-identity-and-owner-approved-model-policy.md | Participant identity and automatic model strength discovery | story | in-progress |
| epics/WP-20/stories/story-quota-exhaustion-redistributes-leadership-and-independent-review-safely.md | Quota exhaustion redistributes leadership and independent review safely | story | in-progress |
| epics/WP-20/stories/story-reviewed-integration-and-team-aware-story-gates.md | Reviewed integration and team-aware story gates | story | planned |
| epics/WP-20/stories/story-team-cli-orientation-and-deterministic-diagnostics.md | Team CLI orientation and deterministic diagnostics | story | planned |
| epics/WP-21/epic.md | Source an agent can read in one pass | epic | in-progress |
| epics/WP-21/stories/story-bounded-compressed-codex-rollout-accounting.md | Bounded compressed Codex rollout accounting | story | done |
| epics/WP-21/stories/story-budgeted-sealed-source-evaluation-route.md | Budgeted sealed-source evaluation route | story | done |
| epics/WP-21/stories/story-distinguish-evaluation-moderation-rejection-causes.md | Distinguish evaluation moderation rejection causes | story | done |
| epics/WP-21/stories/story-evaluation-accepts-bounded-moderation-metadata.md | Evaluation accepts bounded moderation metadata | story | done |
| epics/WP-21/stories/story-execute-paired-token-economy-smoke-under-the-owner-allocation.md | Execute paired token economy smoke under the owner allocation | story | in-progress |
| epics/WP-21/stories/story-fixed-cohort-and-blind-acceptance-for-token-economy-comparison.md | Bounded paired smoke protocol for token economy | story | done |
| epics/WP-21/stories/story-keep-brief-folder-descriptions-behind-full-mode.md | Keep brief folder descriptions behind full mode | story | done |
| epics/WP-21/stories/story-keep-cli-reference-out-of-standing-instructions.md | Keep CLI reference out of standing instructions | story | done |
| epics/WP-21/stories/story-offline-codex-token-accounting-with-explicit-coverage.md | Offline Codex token accounting with explicit coverage | story | done |
| epics/WP-21/stories/story-pin-team-bound-story-refusal-before-cli-modularization.md | Pin team-bound story refusal before CLI modularization | story | done |
| epics/WP-21/stories/story-recognize-explicit-inherited-parent-headers-in-codex-accounting.md | Recognize explicit inherited parent headers in Codex accounting | story | done |
| epics/WP-21/stories/story-reproducible-token-accounting-and-repeated-read-evidence.md | Reproducible token accounting and repeated-read evidence | story | done |
| epics/WP-21/stories/story-scope-unknown-prefix-diagnostics-to-the-requested-period.md | Scope unknown-prefix diagnostics to the requested period | story | done |
| epics/WP-21/stories/story-targeted-evidence-reads-and-reproducible-role-handoffs.md | Targeted evidence reads and reproducible role handoffs | story | done |
| epics/WP-21/stories/story-the-team-code-loads-only-for-story-write-and-the-cli-entry-is-an-mjs-the-code-index-sees.md | The team code loads only for story --write, and the CLI entry is an .mjs the code index sees | story | done |
| epics/WP-22/epic.md | The owner's global rules on every machine and harness | epic | planned |
| epics/WP-22/stories/story-a-source-on-another-machine-reaches-each-vm-through-a-local-cache.md | A source on another machine reaches each VM through a local cache | story | planned |
| epics/WP-22/stories/story-each-machine-replies-in-its-own-users-language.md | Each machine replies in its own user's language | story | planned |
| epics/WP-22/stories/story-global-rules-reach-every-installed-harness-and-doctor-refuses-a-machine-where-they-do-not.md | Global rules reach every installed harness, and doctor refuses a machine where they do not | story | planned |
| epics/WP-22/stories/story-the-owners-global-files-on-every-machine-migrate-into-the-one-source.md | The owner's global files on every machine migrate into the one source | story | planned |
| epics/WP-23/epic.md | Solo entry: one person, one harness | epic | done |
| epics/WP-23/stories/story-a-vault-turns-briefs-self-install-off-for-every-clone.md | A vault turns brief's self-install off for every clone | story | done |
| epics/WP-23/stories/story-commit-carries-an-external-task-id-in-a-waypost-task-trailer.md | Commit carries an external task id in a Waypost-Task trailer | story | done |
| epics/WP-23/stories/story-doctor-vault-path-checks-a-vault-on-a-fresh-clone-without-a-binding.md | doctor --vault <path> checks a vault on a fresh clone without a binding | story | done |
| epics/WP-23/stories/story-readme-opens-a-path-for-working-alone-in-one-tool.md | README opens a path for working alone, in one tool | story | done |
| ops/measure-the-boot-identity-on-macos-kernboottime-uptime-and-a-sleep.md | Measure the boot identity on macOS: kern.boottime, uptime and a sleep | runbook | draft |
| ops/measure-the-git-common-dir-across-checkout-layouts.md | Measure the git common dir across checkout layouts | runbook | active |
| ops/paired-token-economy-experiment-revision-2-over-a-sealed-read-only-source.md | Paired token economy experiment revision 2 over a sealed read-only source | runbook | draft |
| ops/paired-token-economy-experiment-with-blind-acceptance.md | Paired token economy experiment with blind acceptance | runbook | draft |
| ops/proposed-revision-3-of-the-sealed-source-token-pilot.md | Proposed revision 3 of the sealed-source token pilot | runbook | draft |
| ops/revision-3-compatibility-controls-under-the-unchanged-allowance.md | Revision 3 compatibility controls under the unchanged allowance | runbook | active |
| ops/run-waypost-from-a-checkout-another-operating-system-edits.md | Run waypost from a checkout another operating system edits | runbook | active |
| ops/verify-a-harness-live-the-whole-waypost-loop-in-one-session.md | Verify a harness live: the whole waypost loop in one session | runbook | active |
| research/agent-tooling-landscape-september-2026-standards-task-graphs-orchestrators-adr-drift.md | Agent tooling landscape, September 2026: standards, task graphs, orchestrators, ADR drift | research | final |
| specs/cross-harness-team-coordination-protocol.md | Cross-harness team coordination protocol | spec | active |
| specs/objective-native-configuration-calibration-for-protocol-roles.md | Objective native configuration calibration for protocol roles | spec | draft |

## Edges

| From | Kind | To |
|------|------|----|
| adr/0006-commit-protocol.md | wikilink | adr/record-the-operating-system-of-a-commit-in-a-waypost-os-trailer.md |
| adr/automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation.md | wikilink | adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md |
| adr/automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation.md | wikilink | adr/native-configuration-profiles-ranked-by-fresh-role-specific-calibration.md |
| adr/automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation.md | wikilink | adr/owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check.md |
| adr/automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation.md | wikilink | specs/cross-harness-team-coordination-protocol.md |
| adr/automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets.md | wikilink | adr/automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation.md |
| adr/automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets.md | wikilink | adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md |
| adr/automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets.md | wikilink | adr/native-configuration-profiles-ranked-by-fresh-role-specific-calibration.md |
| adr/automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets.md | wikilink | adr/owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check.md |
| adr/automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets.md | wikilink | adr/subscription-cli-token-accounting-with-separate-strict-billing-enforcement.md |
| adr/automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets.md | wikilink | epics/WP-20/stories/story-automatic-model-routing-by-task-complexity-and-expected-cost.md |
| adr/automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets.md | wikilink | specs/cross-harness-team-coordination-protocol.md |
| adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md | wikilink | adr/enforce-the-owners-token-budget-for-live-runs-across-teams.md |
| adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md | wikilink | adr/harness-tool-surfaces-bound-by-evidence-instead-of-an-empty-tool-list.md |
| adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md | wikilink | adr/subscription-cli-token-accounting-with-separate-strict-billing-enforcement.md |
| adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md | wikilink | ops/paired-token-economy-experiment-with-blind-acceptance.md |
| adr/enforce-the-owners-token-budget-for-live-runs-across-teams.md | wikilink | adr/owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check.md |
| adr/enforce-the-owners-token-budget-for-live-runs-across-teams.md | wikilink | adr/subscription-cli-token-accounting-with-separate-strict-billing-enforcement.md |
| adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md | mdlink | epics/WP-20/epic.md |
| adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md | wikilink | adr/0005-harness-registry.md |
| adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md | wikilink | adr/0006-commit-protocol.md |
| adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md | wikilink | adr/0007-shared-vault-presence.md |
| adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md | wikilink | adr/0010-coordination-follows-the-repository.md |
| adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md | wikilink | specs/cross-harness-team-coordination-protocol.md |
| adr/native-configuration-profiles-ranked-by-fresh-role-specific-calibration.md | wikilink | adr/automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation.md |
| adr/native-configuration-profiles-ranked-by-fresh-role-specific-calibration.md | wikilink | adr/automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets.md |
| adr/native-configuration-profiles-ranked-by-fresh-role-specific-calibration.md | wikilink | adr/harness-tool-surfaces-bound-by-evidence-instead-of-an-empty-tool-list.md |
| adr/native-configuration-profiles-ranked-by-fresh-role-specific-calibration.md | wikilink | adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md |
| adr/native-configuration-profiles-ranked-by-fresh-role-specific-calibration.md | wikilink | adr/owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check.md |
| adr/native-configuration-profiles-ranked-by-fresh-role-specific-calibration.md | wikilink | adr/subscription-cli-token-accounting-with-separate-strict-billing-enforcement.md |
| adr/native-configuration-profiles-ranked-by-fresh-role-specific-calibration.md | wikilink | epics/WP-20/stories/story-participant-identity-and-owner-approved-model-policy.md |
| adr/native-configuration-profiles-ranked-by-fresh-role-specific-calibration.md | wikilink | specs/objective-native-configuration-calibration-for-protocol-roles.md |
| adr/owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check.md | wikilink | adr/automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation.md |
| adr/owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check.md | wikilink | adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md |
| adr/owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check.md | wikilink | adr/native-configuration-profiles-ranked-by-fresh-role-specific-calibration.md |
| adr/record-the-operating-system-of-a-commit-in-a-waypost-os-trailer.md | wikilink | adr/0001-harness-agnostic-core.md |
| adr/record-the-operating-system-of-a-commit-in-a-waypost-os-trailer.md | wikilink | adr/0006-commit-protocol.md |
| adr/record-the-operating-system-of-a-commit-in-a-waypost-os-trailer.md | wikilink | adr/0010-coordination-follows-the-repository.md |
| adr/record-the-operating-system-of-a-commit-in-a-waypost-os-trailer.md | wikilink | adr/record-the-operating-system-of-a-commit-in-a-waypost-os-trailer.md |
| adr/setup-asks-the-running-harness-not-only-the-projects-files.md | mdlink | epics/WP-19/stories/story-codex-keeps-one-session-and-direct-installers-see-the-running-harness.md |
| adr/subscription-cli-token-accounting-with-separate-strict-billing-enforcement.md | wikilink | adr/automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation.md |
| adr/subscription-cli-token-accounting-with-separate-strict-billing-enforcement.md | wikilink | adr/automatic-role-redistribution-on-verified-model-quota-exhaustion.md |
| adr/subscription-cli-token-accounting-with-separate-strict-billing-enforcement.md | wikilink | adr/automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets.md |
| adr/subscription-cli-token-accounting-with-separate-strict-billing-enforcement.md | wikilink | adr/enforce-the-owners-token-budget-for-live-runs-across-teams.md |
| adr/subscription-cli-token-accounting-with-separate-strict-billing-enforcement.md | wikilink | adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md |
| adr/subscription-cli-token-accounting-with-separate-strict-billing-enforcement.md | wikilink | specs/cross-harness-team-coordination-protocol.md |
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
| epics/WP-15/epic.md | epic-contains | epics/WP-15/stories/story-the-command-on-path-survives-a-checkout-that-loses-its-executable-bit.md |
| epics/WP-15/epic.md | epic-contains | epics/WP-15/stories/story-the-merge-driver-regenerates-a-derived-view-without-writing-into-the-worktree.md |
| epics/WP-15/epic.md | mdlink | adr/0010-coordination-follows-the-repository.md |
| epics/WP-15/epic.md | mdlink | concepts/waypost-10-the-projects-memory-every-tool-shares-checked-without-a-model.md |
| epics/WP-15/stories/story-adr-0010-accepted-presence-leases-and-claims-in-the-git-common-dir.md | mdlink | epics/WP-15/epic.md |
| epics/WP-15/stories/story-blockedby-in-stories-waypost-ready-and-a-board-that-shows-blocked.md | mdlink | epics/WP-15/epic.md |
| epics/WP-15/stories/story-doctor-dangling-and-cyclic-dependencies-duplicate-adr-numbers.md | mdlink | epics/WP-15/epic.md |
| epics/WP-15/stories/story-measure-the-git-common-dir-and-worktree-binding-on-macos-windows-and-a-cloud-drive.md | mdlink | epics/WP-15/epic.md |
| epics/WP-15/stories/story-runtime-coordination-moves-to-the-git-common-dir-old-records-read-for-one-version.md | mdlink | epics/WP-15/epic.md |
| epics/WP-15/stories/story-shared-checkout-detection-covers-sibling-worktrees-of-one-repository.md | mdlink | epics/WP-15/epic.md |
| epics/WP-15/stories/story-the-command-on-path-survives-a-checkout-that-loses-its-executable-bit.md | mdlink | epics/WP-15/epic.md |
| epics/WP-15/stories/story-the-merge-driver-regenerates-a-derived-view-without-writing-into-the-worktree.md | mdlink | epics/WP-15/epic.md |
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
| epics/WP-17/epic.md | epic-contains | epics/WP-17/stories/story-detectors-superseded-device-support-unavailable-simulators-duplicate-toolchains.md |
| epics/WP-17/epic.md | epic-contains | epics/WP-17/stories/story-discovery-and-the-profile-the-scheme-of-what-waypost-works-with.md |
| epics/WP-17/epic.md | epic-contains | epics/WP-17/stories/story-doctor-and-next-surface-build-artifacts-the-cleanup-prompt.md |
| epics/WP-17/epic.md | epic-contains | epics/WP-17/stories/story-the-machine-wide-limit-automatic-cleanup-at-the-end-of-a-heavy-run.md |
| epics/WP-17/epic.md | epic-contains | epics/WP-17/stories/story-verified-on-linux-and-windows-virtual-machines.md |
| epics/WP-17/epic.md | epic-contains | epics/WP-17/stories/story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit.md |
| epics/WP-17/epic.md | epic-contains | epics/WP-17/stories/story-waypost-size-the-read-only-scan-project-and-global.md |
| epics/WP-17/epic.md | mdlink | adr/cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first.md |
| epics/WP-17/epic.md | mdlink | adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md |
| epics/WP-17/stories/story-detectors-superseded-device-support-unavailable-simulators-duplicate-toolchains.md | mdlink | adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md |
| epics/WP-17/stories/story-detectors-superseded-device-support-unavailable-simulators-duplicate-toolchains.md | mdlink | epics/WP-17/epic.md |
| epics/WP-17/stories/story-discovery-and-the-profile-the-scheme-of-what-waypost-works-with.md | mdlink | adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md |
| epics/WP-17/stories/story-discovery-and-the-profile-the-scheme-of-what-waypost-works-with.md | mdlink | epics/WP-17/epic.md |
| epics/WP-17/stories/story-doctor-and-next-surface-build-artifacts-the-cleanup-prompt.md | mdlink | adr/cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first.md |
| epics/WP-17/stories/story-doctor-and-next-surface-build-artifacts-the-cleanup-prompt.md | mdlink | adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md |
| epics/WP-17/stories/story-doctor-and-next-surface-build-artifacts-the-cleanup-prompt.md | mdlink | epics/WP-17/epic.md |
| epics/WP-17/stories/story-the-machine-wide-limit-automatic-cleanup-at-the-end-of-a-heavy-run.md | mdlink | adr/cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first.md |
| epics/WP-17/stories/story-the-machine-wide-limit-automatic-cleanup-at-the-end-of-a-heavy-run.md | mdlink | epics/WP-17/epic.md |
| epics/WP-17/stories/story-verified-on-linux-and-windows-virtual-machines.md | mdlink | adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md |
| epics/WP-17/stories/story-verified-on-linux-and-windows-virtual-machines.md | mdlink | epics/WP-17/epic.md |
| epics/WP-17/stories/story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit.md | mdlink | adr/cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first.md |
| epics/WP-17/stories/story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit.md | mdlink | adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md |
| epics/WP-17/stories/story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit.md | mdlink | epics/WP-17/epic.md |
| epics/WP-17/stories/story-waypost-size-the-read-only-scan-project-and-global.md | mdlink | adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md |
| epics/WP-17/stories/story-waypost-size-the-read-only-scan-project-and-global.md | mdlink | epics/WP-17/epic.md |
| epics/WP-18/epic.md | epic-contains | epics/WP-18/stories/story-a-live-holder-started-through-a-differently-cased-path-still-reads-as-live-on-windows.md |
| epics/WP-18/epic.md | epic-contains | epics/WP-18/stories/story-capacity-verified-on-linux-and-windows-virtual-machines.md |
| epics/WP-18/epic.md | epic-contains | epics/WP-18/stories/story-cleanup-tests-prove-a-live-holder-on-windows-fixtures-record-the-comm-tasklist-reports-and-the-fake-clean-tool-is-a-real-executable.md |
| epics/WP-18/epic.md | epic-contains | epics/WP-18/stories/story-the-heavy-work-rule-in-every-project-and-wayposts-own-heavy-work.md |
| epics/WP-18/epic.md | epic-contains | epics/WP-18/stories/story-the-heavy-work-slot-is-machine-wide-on-windows-not-one-per-packaged-app.md |
| epics/WP-18/epic.md | epic-contains | epics/WP-18/stories/story-waypost-capacity-the-machines-real-free-resources-measured-by-each-os.md |
| epics/WP-18/epic.md | epic-contains | epics/WP-18/stories/story-waypost-run-heavy-a-machine-wide-slot-for-heavy-work.md |
| epics/WP-18/epic.md | mdlink | adr/heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md |
| epics/WP-18/stories/story-a-live-holder-started-through-a-differently-cased-path-still-reads-as-live-on-windows.md | mdlink | epics/WP-18/epic.md |
| epics/WP-18/stories/story-capacity-verified-on-linux-and-windows-virtual-machines.md | mdlink | adr/heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md |
| epics/WP-18/stories/story-capacity-verified-on-linux-and-windows-virtual-machines.md | mdlink | epics/WP-18/epic.md |
| epics/WP-18/stories/story-cleanup-tests-prove-a-live-holder-on-windows-fixtures-record-the-comm-tasklist-reports-and-the-fake-clean-tool-is-a-real-executable.md | mdlink | epics/WP-18/epic.md |
| epics/WP-18/stories/story-the-heavy-work-rule-in-every-project-and-wayposts-own-heavy-work.md | mdlink | adr/heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md |
| epics/WP-18/stories/story-the-heavy-work-rule-in-every-project-and-wayposts-own-heavy-work.md | mdlink | epics/WP-18/epic.md |
| epics/WP-18/stories/story-the-heavy-work-slot-is-machine-wide-on-windows-not-one-per-packaged-app.md | mdlink | epics/WP-18/epic.md |
| epics/WP-18/stories/story-waypost-capacity-the-machines-real-free-resources-measured-by-each-os.md | mdlink | adr/heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md |
| epics/WP-18/stories/story-waypost-capacity-the-machines-real-free-resources-measured-by-each-os.md | mdlink | epics/WP-18/epic.md |
| epics/WP-18/stories/story-waypost-run-heavy-a-machine-wide-slot-for-heavy-work.md | mdlink | adr/heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md |
| epics/WP-18/stories/story-waypost-run-heavy-a-machine-wide-slot-for-heavy-work.md | mdlink | epics/WP-18/epic.md |
| epics/WP-19/epic.md | epic-contains | epics/WP-19/stories/story-agentsmd-is-not-evidence-that-codex-is-used-here.md |
| epics/WP-19/epic.md | epic-contains | epics/WP-19/stories/story-an-empty-team-authority-on-a-network-share-does-not-block-commits-from-another-machine.md |
| epics/WP-19/epic.md | epic-contains | epics/WP-19/stories/story-codex-keeps-one-session-and-direct-installers-see-the-running-harness.md |
| epics/WP-19/epic.md | epic-contains | epics/WP-19/stories/story-project-rules-reach-claude-sessions-on-a-vm-whose-checkout-is-on-a-network-share.md |
| epics/WP-19/epic.md | epic-contains | epics/WP-19/stories/story-ps-in-the-c-locale-so-the-process-table-exists-on-any-host.md |
| epics/WP-19/stories/story-agentsmd-is-not-evidence-that-codex-is-used-here.md | mdlink | epics/WP-19/epic.md |
| epics/WP-19/stories/story-an-empty-team-authority-on-a-network-share-does-not-block-commits-from-another-machine.md | mdlink | epics/WP-19/epic.md |
| epics/WP-19/stories/story-codex-keeps-one-session-and-direct-installers-see-the-running-harness.md | mdlink | epics/WP-19/epic.md |
| epics/WP-19/stories/story-project-rules-reach-claude-sessions-on-a-vm-whose-checkout-is-on-a-network-share.md | mdlink | epics/WP-19/epic.md |
| epics/WP-19/stories/story-ps-in-the-c-locale-so-the-process-table-exists-on-any-host.md | mdlink | epics/WP-19/epic.md |
| epics/WP-20/epic.md | epic-contains | epics/WP-20/stories/story-addressed-messages-and-verified-harness-delivery.md |
| epics/WP-20/epic.md | epic-contains | epics/WP-20/stories/story-assignments-supervision-and-stronger-model-handover.md |
| epics/WP-20/epic.md | epic-contains | epics/WP-20/stories/story-automatic-model-routing-by-task-complexity-and-expected-cost.md |
| epics/WP-20/epic.md | epic-contains | epics/WP-20/stories/story-independent-strongest-model-review-of-immutable-evidence.md |
| epics/WP-20/epic.md | epic-contains | epics/WP-20/stories/story-live-claude-and-opencode-coordination-on-one-task.md |
| epics/WP-20/epic.md | epic-contains | epics/WP-20/stories/story-local-authority-log-and-crash-safe-mutations.md |
| epics/WP-20/epic.md | epic-contains | epics/WP-20/stories/story-participant-identity-and-owner-approved-model-policy.md |
| epics/WP-20/epic.md | epic-contains | epics/WP-20/stories/story-quota-exhaustion-redistributes-leadership-and-independent-review-safely.md |
| epics/WP-20/epic.md | epic-contains | epics/WP-20/stories/story-reviewed-integration-and-team-aware-story-gates.md |
| epics/WP-20/epic.md | epic-contains | epics/WP-20/stories/story-team-cli-orientation-and-deterministic-diagnostics.md |
| epics/WP-20/epic.md | wikilink | adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md |
| epics/WP-20/epic.md | wikilink | adr/owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check.md |
| epics/WP-20/epic.md | wikilink | specs/cross-harness-team-coordination-protocol.md |
| epics/WP-20/stories/story-addressed-messages-and-verified-harness-delivery.md | mdlink | epics/WP-20/epic.md |
| epics/WP-20/stories/story-addressed-messages-and-verified-harness-delivery.md | wikilink | adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md |
| epics/WP-20/stories/story-addressed-messages-and-verified-harness-delivery.md | wikilink | specs/cross-harness-team-coordination-protocol.md |
| epics/WP-20/stories/story-assignments-supervision-and-stronger-model-handover.md | mdlink | epics/WP-20/epic.md |
| epics/WP-20/stories/story-assignments-supervision-and-stronger-model-handover.md | wikilink | adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md |
| epics/WP-20/stories/story-assignments-supervision-and-stronger-model-handover.md | wikilink | specs/cross-harness-team-coordination-protocol.md |
| epics/WP-20/stories/story-automatic-model-routing-by-task-complexity-and-expected-cost.md | mdlink | epics/WP-20/epic.md |
| epics/WP-20/stories/story-automatic-model-routing-by-task-complexity-and-expected-cost.md | wikilink | adr/automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation.md |
| epics/WP-20/stories/story-automatic-model-routing-by-task-complexity-and-expected-cost.md | wikilink | adr/automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets.md |
| epics/WP-20/stories/story-automatic-model-routing-by-task-complexity-and-expected-cost.md | wikilink | adr/subscription-cli-token-accounting-with-separate-strict-billing-enforcement.md |
| epics/WP-20/stories/story-automatic-model-routing-by-task-complexity-and-expected-cost.md | wikilink | epics/WP-20/stories/story-participant-identity-and-owner-approved-model-policy.md |
| epics/WP-20/stories/story-independent-strongest-model-review-of-immutable-evidence.md | mdlink | epics/WP-20/epic.md |
| epics/WP-20/stories/story-independent-strongest-model-review-of-immutable-evidence.md | wikilink | adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md |
| epics/WP-20/stories/story-independent-strongest-model-review-of-immutable-evidence.md | wikilink | specs/cross-harness-team-coordination-protocol.md |
| epics/WP-20/stories/story-live-claude-and-opencode-coordination-on-one-task.md | mdlink | epics/WP-20/epic.md |
| epics/WP-20/stories/story-live-claude-and-opencode-coordination-on-one-task.md | wikilink | adr/automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets.md |
| epics/WP-20/stories/story-live-claude-and-opencode-coordination-on-one-task.md | wikilink | adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md |
| epics/WP-20/stories/story-live-claude-and-opencode-coordination-on-one-task.md | wikilink | specs/cross-harness-team-coordination-protocol.md |
| epics/WP-20/stories/story-local-authority-log-and-crash-safe-mutations.md | mdlink | epics/WP-20/epic.md |
| epics/WP-20/stories/story-local-authority-log-and-crash-safe-mutations.md | wikilink | adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md |
| epics/WP-20/stories/story-local-authority-log-and-crash-safe-mutations.md | wikilink | specs/cross-harness-team-coordination-protocol.md |
| epics/WP-20/stories/story-participant-identity-and-owner-approved-model-policy.md | mdlink | epics/WP-20/epic.md |
| epics/WP-20/stories/story-participant-identity-and-owner-approved-model-policy.md | wikilink | adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md |
| epics/WP-20/stories/story-participant-identity-and-owner-approved-model-policy.md | wikilink | adr/owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check.md |
| epics/WP-20/stories/story-participant-identity-and-owner-approved-model-policy.md | wikilink | adr/subscription-cli-token-accounting-with-separate-strict-billing-enforcement.md |
| epics/WP-20/stories/story-participant-identity-and-owner-approved-model-policy.md | wikilink | specs/cross-harness-team-coordination-protocol.md |
| epics/WP-20/stories/story-reviewed-integration-and-team-aware-story-gates.md | mdlink | epics/WP-20/epic.md |
| epics/WP-20/stories/story-reviewed-integration-and-team-aware-story-gates.md | wikilink | adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md |
| epics/WP-20/stories/story-reviewed-integration-and-team-aware-story-gates.md | wikilink | specs/cross-harness-team-coordination-protocol.md |
| epics/WP-20/stories/story-team-cli-orientation-and-deterministic-diagnostics.md | mdlink | epics/WP-20/epic.md |
| epics/WP-20/stories/story-team-cli-orientation-and-deterministic-diagnostics.md | wikilink | adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md |
| epics/WP-20/stories/story-team-cli-orientation-and-deterministic-diagnostics.md | wikilink | specs/cross-harness-team-coordination-protocol.md |
| epics/WP-21/epic.md | epic-contains | epics/WP-21/stories/story-bounded-compressed-codex-rollout-accounting.md |
| epics/WP-21/epic.md | epic-contains | epics/WP-21/stories/story-budgeted-sealed-source-evaluation-route.md |
| epics/WP-21/epic.md | epic-contains | epics/WP-21/stories/story-distinguish-evaluation-moderation-rejection-causes.md |
| epics/WP-21/epic.md | epic-contains | epics/WP-21/stories/story-evaluation-accepts-bounded-moderation-metadata.md |
| epics/WP-21/epic.md | epic-contains | epics/WP-21/stories/story-execute-paired-token-economy-smoke-under-the-owner-allocation.md |
| epics/WP-21/epic.md | epic-contains | epics/WP-21/stories/story-fixed-cohort-and-blind-acceptance-for-token-economy-comparison.md |
| epics/WP-21/epic.md | epic-contains | epics/WP-21/stories/story-keep-brief-folder-descriptions-behind-full-mode.md |
| epics/WP-21/epic.md | epic-contains | epics/WP-21/stories/story-keep-cli-reference-out-of-standing-instructions.md |
| epics/WP-21/epic.md | epic-contains | epics/WP-21/stories/story-offline-codex-token-accounting-with-explicit-coverage.md |
| epics/WP-21/epic.md | epic-contains | epics/WP-21/stories/story-pin-team-bound-story-refusal-before-cli-modularization.md |
| epics/WP-21/epic.md | epic-contains | epics/WP-21/stories/story-recognize-explicit-inherited-parent-headers-in-codex-accounting.md |
| epics/WP-21/epic.md | epic-contains | epics/WP-21/stories/story-reproducible-token-accounting-and-repeated-read-evidence.md |
| epics/WP-21/epic.md | epic-contains | epics/WP-21/stories/story-scope-unknown-prefix-diagnostics-to-the-requested-period.md |
| epics/WP-21/epic.md | epic-contains | epics/WP-21/stories/story-targeted-evidence-reads-and-reproducible-role-handoffs.md |
| epics/WP-21/epic.md | epic-contains | epics/WP-21/stories/story-the-team-code-loads-only-for-story-write-and-the-cli-entry-is-an-mjs-the-code-index-sees.md |
| epics/WP-21/epic.md | wikilink | adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md |
| epics/WP-21/epic.md | wikilink | epics/WP-21/stories/story-bounded-compressed-codex-rollout-accounting.md |
| epics/WP-21/epic.md | wikilink | epics/WP-21/stories/story-evaluation-accepts-bounded-moderation-metadata.md |
| epics/WP-21/epic.md | wikilink | epics/WP-21/stories/story-execute-paired-token-economy-smoke-under-the-owner-allocation.md |
| epics/WP-21/epic.md | wikilink | epics/WP-21/stories/story-fixed-cohort-and-blind-acceptance-for-token-economy-comparison.md |
| epics/WP-21/epic.md | wikilink | epics/WP-21/stories/story-keep-brief-folder-descriptions-behind-full-mode.md |
| epics/WP-21/epic.md | wikilink | epics/WP-21/stories/story-keep-cli-reference-out-of-standing-instructions.md |
| epics/WP-21/epic.md | wikilink | epics/WP-21/stories/story-offline-codex-token-accounting-with-explicit-coverage.md |
| epics/WP-21/epic.md | wikilink | epics/WP-21/stories/story-pin-team-bound-story-refusal-before-cli-modularization.md |
| epics/WP-21/epic.md | wikilink | epics/WP-21/stories/story-recognize-explicit-inherited-parent-headers-in-codex-accounting.md |
| epics/WP-21/epic.md | wikilink | epics/WP-21/stories/story-reproducible-token-accounting-and-repeated-read-evidence.md |
| epics/WP-21/epic.md | wikilink | epics/WP-21/stories/story-scope-unknown-prefix-diagnostics-to-the-requested-period.md |
| epics/WP-21/epic.md | wikilink | epics/WP-21/stories/story-targeted-evidence-reads-and-reproducible-role-handoffs.md |
| epics/WP-21/epic.md | wikilink | ops/paired-token-economy-experiment-with-blind-acceptance.md |
| epics/WP-21/epic.md | wikilink | ops/proposed-revision-3-of-the-sealed-source-token-pilot.md |
| epics/WP-21/epic.md | wikilink | ops/revision-3-compatibility-controls-under-the-unchanged-allowance.md |
| epics/WP-21/stories/story-bounded-compressed-codex-rollout-accounting.md | mdlink | epics/WP-21/epic.md |
| epics/WP-21/stories/story-budgeted-sealed-source-evaluation-route.md | mdlink | epics/WP-21/epic.md |
| epics/WP-21/stories/story-distinguish-evaluation-moderation-rejection-causes.md | mdlink | epics/WP-21/epic.md |
| epics/WP-21/stories/story-evaluation-accepts-bounded-moderation-metadata.md | mdlink | epics/WP-21/epic.md |
| epics/WP-21/stories/story-execute-paired-token-economy-smoke-under-the-owner-allocation.md | mdlink | epics/WP-21/epic.md |
| epics/WP-21/stories/story-execute-paired-token-economy-smoke-under-the-owner-allocation.md | wikilink | adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md |
| epics/WP-21/stories/story-execute-paired-token-economy-smoke-under-the-owner-allocation.md | wikilink | ops/paired-token-economy-experiment-revision-2-over-a-sealed-read-only-source.md |
| epics/WP-21/stories/story-execute-paired-token-economy-smoke-under-the-owner-allocation.md | wikilink | ops/revision-3-compatibility-controls-under-the-unchanged-allowance.md |
| epics/WP-21/stories/story-fixed-cohort-and-blind-acceptance-for-token-economy-comparison.md | mdlink | epics/WP-21/epic.md |
| epics/WP-21/stories/story-keep-brief-folder-descriptions-behind-full-mode.md | mdlink | epics/WP-21/epic.md |
| epics/WP-21/stories/story-keep-cli-reference-out-of-standing-instructions.md | mdlink | epics/WP-21/epic.md |
| epics/WP-21/stories/story-offline-codex-token-accounting-with-explicit-coverage.md | mdlink | epics/WP-21/epic.md |
| epics/WP-21/stories/story-pin-team-bound-story-refusal-before-cli-modularization.md | mdlink | epics/WP-21/epic.md |
| epics/WP-21/stories/story-recognize-explicit-inherited-parent-headers-in-codex-accounting.md | mdlink | epics/WP-21/epic.md |
| epics/WP-21/stories/story-reproducible-token-accounting-and-repeated-read-evidence.md | mdlink | epics/WP-21/epic.md |
| epics/WP-21/stories/story-scope-unknown-prefix-diagnostics-to-the-requested-period.md | mdlink | epics/WP-21/epic.md |
| epics/WP-21/stories/story-targeted-evidence-reads-and-reproducible-role-handoffs.md | mdlink | epics/WP-21/epic.md |
| epics/WP-21/stories/story-the-team-code-loads-only-for-story-write-and-the-cli-entry-is-an-mjs-the-code-index-sees.md | mdlink | epics/WP-21/epic.md |
| epics/WP-22/epic.md | epic-contains | epics/WP-22/stories/story-a-source-on-another-machine-reaches-each-vm-through-a-local-cache.md |
| epics/WP-22/epic.md | epic-contains | epics/WP-22/stories/story-each-machine-replies-in-its-own-users-language.md |
| epics/WP-22/epic.md | epic-contains | epics/WP-22/stories/story-global-rules-reach-every-installed-harness-and-doctor-refuses-a-machine-where-they-do-not.md |
| epics/WP-22/epic.md | epic-contains | epics/WP-22/stories/story-the-owners-global-files-on-every-machine-migrate-into-the-one-source.md |
| epics/WP-22/epic.md | mdlink | adr/owners-global-rules-one-harness-neutral-source-reaching-every-installed-harness-on-every-machine.md |
| epics/WP-22/stories/story-a-source-on-another-machine-reaches-each-vm-through-a-local-cache.md | mdlink | adr/owners-global-rules-one-harness-neutral-source-reaching-every-installed-harness-on-every-machine.md |
| epics/WP-22/stories/story-a-source-on-another-machine-reaches-each-vm-through-a-local-cache.md | mdlink | epics/WP-22/epic.md |
| epics/WP-22/stories/story-each-machine-replies-in-its-own-users-language.md | mdlink | adr/owners-global-rules-one-harness-neutral-source-reaching-every-installed-harness-on-every-machine.md |
| epics/WP-22/stories/story-each-machine-replies-in-its-own-users-language.md | mdlink | epics/WP-22/epic.md |
| epics/WP-22/stories/story-global-rules-reach-every-installed-harness-and-doctor-refuses-a-machine-where-they-do-not.md | mdlink | adr/owners-global-rules-one-harness-neutral-source-reaching-every-installed-harness-on-every-machine.md |
| epics/WP-22/stories/story-global-rules-reach-every-installed-harness-and-doctor-refuses-a-machine-where-they-do-not.md | mdlink | epics/WP-22/epic.md |
| epics/WP-22/stories/story-the-owners-global-files-on-every-machine-migrate-into-the-one-source.md | mdlink | adr/owners-global-rules-one-harness-neutral-source-reaching-every-installed-harness-on-every-machine.md |
| epics/WP-22/stories/story-the-owners-global-files-on-every-machine-migrate-into-the-one-source.md | mdlink | epics/WP-22/epic.md |
| epics/WP-23/epic.md | epic-contains | epics/WP-23/stories/story-a-vault-turns-briefs-self-install-off-for-every-clone.md |
| epics/WP-23/epic.md | epic-contains | epics/WP-23/stories/story-commit-carries-an-external-task-id-in-a-waypost-task-trailer.md |
| epics/WP-23/epic.md | epic-contains | epics/WP-23/stories/story-doctor-vault-path-checks-a-vault-on-a-fresh-clone-without-a-binding.md |
| epics/WP-23/epic.md | epic-contains | epics/WP-23/stories/story-readme-opens-a-path-for-working-alone-in-one-tool.md |
| epics/WP-23/stories/story-a-vault-turns-briefs-self-install-off-for-every-clone.md | mdlink | epics/WP-23/epic.md |
| epics/WP-23/stories/story-commit-carries-an-external-task-id-in-a-waypost-task-trailer.md | mdlink | epics/WP-23/epic.md |
| epics/WP-23/stories/story-doctor-vault-path-checks-a-vault-on-a-fresh-clone-without-a-binding.md | mdlink | epics/WP-23/epic.md |
| epics/WP-23/stories/story-readme-opens-a-path-for-working-alone-in-one-tool.md | mdlink | epics/WP-23/epic.md |
| ops/measure-the-boot-identity-on-macos-kernboottime-uptime-and-a-sleep.md | mdlink | adr/heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md |
| ops/paired-token-economy-experiment-revision-2-over-a-sealed-read-only-source.md | wikilink | adr/budgeted-read-only-role-evaluation-over-a-sealed-source-snapshot.md |
| ops/paired-token-economy-experiment-revision-2-over-a-sealed-read-only-source.md | wikilink | adr/enforce-the-owners-token-budget-for-live-runs-across-teams.md |
| ops/paired-token-economy-experiment-revision-2-over-a-sealed-read-only-source.md | wikilink | adr/harness-tool-surfaces-bound-by-evidence-instead-of-an-empty-tool-list.md |
| ops/paired-token-economy-experiment-revision-2-over-a-sealed-read-only-source.md | wikilink | ops/paired-token-economy-experiment-with-blind-acceptance.md |
| ops/paired-token-economy-experiment-with-blind-acceptance.md | wikilink | adr/0003-agent-roles-across-harnesses.md |
| ops/paired-token-economy-experiment-with-blind-acceptance.md | wikilink | adr/0008-token-budget.md |
| ops/paired-token-economy-experiment-with-blind-acceptance.md | wikilink | adr/enforce-the-owners-token-budget-for-live-runs-across-teams.md |
| ops/paired-token-economy-experiment-with-blind-acceptance.md | wikilink | adr/subscription-cli-token-accounting-with-separate-strict-billing-enforcement.md |
| ops/proposed-revision-3-of-the-sealed-source-token-pilot.md | wikilink | ops/paired-token-economy-experiment-revision-2-over-a-sealed-read-only-source.md |
| ops/revision-3-compatibility-controls-under-the-unchanged-allowance.md | wikilink | ops/proposed-revision-3-of-the-sealed-source-token-pilot.md |
| specs/cross-harness-team-coordination-protocol.md | mdlink | epics/WP-20/epic.md |
| specs/cross-harness-team-coordination-protocol.md | spec-covers | epics/WP-20/stories/story-addressed-messages-and-verified-harness-delivery.md |
| specs/cross-harness-team-coordination-protocol.md | spec-covers | epics/WP-20/stories/story-assignments-supervision-and-stronger-model-handover.md |
| specs/cross-harness-team-coordination-protocol.md | spec-covers | epics/WP-20/stories/story-automatic-model-routing-by-task-complexity-and-expected-cost.md |
| specs/cross-harness-team-coordination-protocol.md | spec-covers | epics/WP-20/stories/story-independent-strongest-model-review-of-immutable-evidence.md |
| specs/cross-harness-team-coordination-protocol.md | spec-covers | epics/WP-20/stories/story-live-claude-and-opencode-coordination-on-one-task.md |
| specs/cross-harness-team-coordination-protocol.md | spec-covers | epics/WP-20/stories/story-local-authority-log-and-crash-safe-mutations.md |
| specs/cross-harness-team-coordination-protocol.md | spec-covers | epics/WP-20/stories/story-participant-identity-and-owner-approved-model-policy.md |
| specs/cross-harness-team-coordination-protocol.md | spec-covers | epics/WP-20/stories/story-quota-exhaustion-redistributes-leadership-and-independent-review-safely.md |
| specs/cross-harness-team-coordination-protocol.md | spec-covers | epics/WP-20/stories/story-reviewed-integration-and-team-aware-story-gates.md |
| specs/cross-harness-team-coordination-protocol.md | spec-covers | epics/WP-20/stories/story-team-cli-orientation-and-deterministic-diagnostics.md |
| specs/cross-harness-team-coordination-protocol.md | spec-implements-adr | adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md |
| specs/cross-harness-team-coordination-protocol.md | wikilink | adr/0003-agent-roles-across-harnesses.md |
| specs/cross-harness-team-coordination-protocol.md | wikilink | adr/0005-harness-registry.md |
| specs/cross-harness-team-coordination-protocol.md | wikilink | adr/0006-commit-protocol.md |
| specs/cross-harness-team-coordination-protocol.md | wikilink | adr/0007-shared-vault-presence.md |
| specs/cross-harness-team-coordination-protocol.md | wikilink | adr/0010-coordination-follows-the-repository.md |
| specs/cross-harness-team-coordination-protocol.md | wikilink | adr/automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation.md |
| specs/cross-harness-team-coordination-protocol.md | wikilink | adr/automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets.md |
| specs/cross-harness-team-coordination-protocol.md | wikilink | adr/model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md |
| specs/cross-harness-team-coordination-protocol.md | wikilink | adr/owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check.md |
| specs/cross-harness-team-coordination-protocol.md | wikilink | adr/subscription-cli-token-accounting-with-separate-strict-billing-enforcement.md |
| specs/objective-native-configuration-calibration-for-protocol-roles.md | spec-covers | epics/WP-20/stories/story-automatic-model-routing-by-task-complexity-and-expected-cost.md |
| specs/objective-native-configuration-calibration-for-protocol-roles.md | spec-covers | epics/WP-20/stories/story-participant-identity-and-owner-approved-model-policy.md |
| specs/objective-native-configuration-calibration-for-protocol-roles.md | spec-implements-adr | adr/native-configuration-profiles-ranked-by-fresh-role-specific-calibration.md |
| specs/objective-native-configuration-calibration-for-protocol-roles.md | wikilink | adr/automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets.md |
| specs/objective-native-configuration-calibration-for-protocol-roles.md | wikilink | adr/native-configuration-profiles-ranked-by-fresh-role-specific-calibration.md |
| specs/objective-native-configuration-calibration-for-protocol-roles.md | wikilink | adr/owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check.md |
| specs/objective-native-configuration-calibration-for-protocol-roles.md | wikilink | specs/cross-harness-team-coordination-protocol.md |
