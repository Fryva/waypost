# Architecture Decision Records

Waypost records architectural decisions as markdown in git, in
this directory. The format and the process follow ProjectStore's, adapted for a
harness-agnostic fork.

## Process

1. Read this index and the related ADRs before designing anything.
2. Copy `0000-template.md`, take the next free number, and fill in the context,
   the drivers, the options, the consequences and `code_refs`.
3. A decision that has not been approved stays `Status: proposed`.
4. Before moving from `proposed` to `accepted`: a separate fresh-context critic
   pass, run by another harness or another agent — never the author's own
   self-review.
5. After a decision is made or superseded, update the status, the date, the
   participants and this index.

## Index

| № | Status | Date | Title |
|---|--------|------|-------|
| [0001](0001-harness-agnostic-core.md) | proposed | 2026-08-28 | A harness-agnostic core: one CLI instead of hooks and slash commands |
| [0002](0002-vault-layout-policy.md) | proposed | 2026-08-28 | The `engineering` layout as the default; the vault is markdown in git |
| [0003](0003-agent-roles-across-harnesses.md) | proposed | 2026-08-29 | Agent roles: one neutral definition plus per-harness adapters |
| [0004](0004-path-and-name-split.md) | proposed | 2026-08-29 | Name split: the vault stays ProjectStore-compatible, project wiring lives in `.waypost/` |
| [0005](0005-harness-registry.md) | proposed | 2026-09-01 | A harness is data: the `harnesses/*.json` registry instead of a branch in a renderer |
| [0006](0006-commit-protocol.md) | proposed | 2026-09-01 | A commit protocol for parallel work across harnesses |
| [0007](0007-shared-vault-presence.md) | proposed | 2026-09-01 | Working from several devices and operating systems: presence, leases, network drives |
| [0008](0008-token-budget.md) | proposed | 2026-09-01 | Context spend as a design constraint, not an outcome |
| [0009](0009-artifact-integrity-checks.md) | proposed | 2026-09-02 | doctor verifies artifact integrity, not just story mechanics |

## Checklist before finishing

- the number is unique and the links are relative;
- the status reflects whether the decision was actually approved;
- at least two options are recorded;
- the consequences include the positives, the negatives and the risks;
- a superseding ADR and the one it replaces link to each other;
- `code_refs` are filled in and point at paths that exist;
- this index and the related documentation are updated.

## Deterministic tooling

`bin/waypost doctor` is the single consistency checker (no AI): the install section
covers the bind, the templates, the roles per harness and the routing block; the
vault section covers statuses, indexes, links and gates. Mechanical repairs are
`bin/waypost doctor --fix`; derived views are rebuilt by `bin/waypost reconcile --write`
(or `bin/waypost graph|codemap|kanban`).

Tests: `npm test` (`node --test tests/*.test.mjs`).
