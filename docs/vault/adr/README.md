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

---

*Managed by waypost. Manual edits preserved outside the Index table.*
