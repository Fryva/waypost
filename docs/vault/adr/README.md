# Architecture Decision Records

Waypost's own decisions, as vault artifacts checked by `waypost doctor`
(ADR-0009): `code_refs` must resolve, supersede links must be mutual.

1. Read the index below and the related ADRs before designing anything.
2. Draft with `waypost draft adr "<title>" --write`; fill Context, drivers,
   options, consequences and `code_refs`.
3. A decision that has not been approved stays `status: proposed`.
4. Before `proposed` becomes `accepted`: a separate fresh-context critic pass
   (`waypost-critic`), never the author's own self-review; then the project
   owner's decision.
5. After a decision is made or superseded, update the status, the date, the
   deciders and the related documentation; the index regenerates.

## Index

<!-- waypost will keep this index up-to-date when new entries are added via waypost commands. -->

| File | Title | Status | Date |
|------|-------|--------|------|
| [0001-harness-agnostic-core](./0001-harness-agnostic-core.md) | A harness-agnostic core: one CLI instead of hooks and slash commands | accepted | 2026-08-28 |
| [0002-vault-layout-policy](./0002-vault-layout-policy.md) | The `engineering` layout as the default; the vault is markdown in git | accepted | 2026-08-28 |
| [0003-agent-roles-across-harnesses](./0003-agent-roles-across-harnesses.md) | Agent roles: one neutral definition plus per-harness adapters | accepted | 2026-08-29 |
| [0004-path-and-name-split](./0004-path-and-name-split.md) | Name split: the vault stays ProjectStore-compatible, project wiring lives in `.waypost/` | accepted | 2026-08-29 |
| [0005-harness-registry](./0005-harness-registry.md) | A harness is data: the `harnesses/*.json` registry instead of a branch in a renderer | accepted | 2026-09-01 |
| [0006-commit-protocol](./0006-commit-protocol.md) | A commit protocol for parallel work across harnesses | accepted | 2026-09-01 |
| [0007-shared-vault-presence](./0007-shared-vault-presence.md) | Working from several devices and operating systems: presence, leases, network drives | accepted | 2026-09-01 |
| [0008-token-budget](./0008-token-budget.md) | Context spend as a design constraint, not an outcome | accepted | 2026-09-01 |
| [0009-artifact-integrity-checks](./0009-artifact-integrity-checks.md) | doctor verifies artifact integrity, not just story mechanics | accepted | 2026-09-02 |
| [0010-coordination-follows-the-repository](./0010-coordination-follows-the-repository.md) | Coordination follows the repository: presence and leases in the git common dir | accepted | 2026-09-04 |
| [0011-decisions-that-check-themselves](./0011-decisions-that-check-themselves.md) | Decisions that check themselves: guards and provenance in ADRs | accepted | 2026-09-04 |
| [disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes](./disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md) | Disk hygiene by discovery: a toolchain registry, a machine and project profile, and cleanup only after a yes | accepted | 2026-09-14 |
| [heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first](./heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md) | Heavy work sized to the machine: waypost capacity, a machine-wide slot, and a rule to check first | accepted | 2026-09-14 |
| [cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first](./cleanup-to-a-machine-wide-limit-set-by-the-owner-idle-artifacts-oldest-first.md) | Cleanup to a machine-wide limit: set by the owner, idle artifacts oldest first | accepted | 2026-09-18 |
| [memory-for-heavy-work-half-the-memory-up-to-2-gb-macos-without-claimed-pages-no-new-agents-beside-a-job](./memory-for-heavy-work-half-the-memory-up-to-2-gb-macos-without-claimed-pages-no-new-agents-beside-a-job.md) | Memory for heavy work: half the memory up to 2 GB, macOS without claimed pages, no agents beside a job | proposed | 2026-09-28 |
| [automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation](./automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation.md) | Automatic model strength discovery with expiring evidence and periodic revalidation | proposed | 2026-09-30 |
| [model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review](./model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review.md) | Model-aware teams across harness sessions with one authority and independent review | accepted | 2026-09-30 |
| [setup-asks-the-running-harness-not-only-the-projects-files](./setup-asks-the-running-harness-not-only-the-projects-files.md) | setup asks the running harness, not only the project's files | proposed | 2026-09-30 |
| [automatic-role-redistribution-on-verified-model-quota-exhaustion](./automatic-role-redistribution-on-verified-model-quota-exhaustion.md) | Automatic role redistribution on verified model quota exhaustion | proposed | 2026-10-01 |
| [automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets](./automatic-task-aware-model-routing-with-capability-floors-and-cost-budgets.md) | Automatic task-aware model routing with capability floors and cost budgets | proposed | 2026-10-01 |

---

*Managed by waypost. Manual edits preserved outside the Index table.*
