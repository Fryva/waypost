# ADR-0002: The `engineering` layout as the default; the vault is markdown in git

- Status: proposed
- Date: 2026-08-28
- Deciders: not approved by the project owner; status `proposed`
- Supersedes: —
- Superseded by: —
- Related: `scaffold/layouts/engineering.json`, `README.md`, `AGENTS.md`
- code_refs: ["scaffold/layouts/engineering.json", "bin/waypost", "AGENTS.md", "README.md", "tests/harness.test.mjs"]

## Context

ProjectStore defines the vault structure through layouts (JSON). The only
bundled layout is `engineering` (adr/, specs/, epics/<id>/stories/, research/,
concepts/, meetings/, ops/, diagrams/). The fork has to decide which layout is
the default and where the vault lives.

## Decision drivers

- Compatibility with upstream (layouts and templates are reused unchanged).
- The vault is plain markdown in git: portable, reviewable, rendered by GitHub
  and Obsidian alike, no server.
- The bind config lives in the project so the vault travels with the repo.

## Considered options

### Option 1: `engineering` by default, vault in git (chosen)

`waypost bind` uses `engineering` unless told otherwise; the vault is markdown in
git; the bind config is `.waypost/projectstore.json` in the project root.
**Pros:** compatible with upstream, few new decisions, portable.
**Cons:** the layout is fixed (not tuned for product or data projects).

### Option 2: customisation via `waypost bind --layout <name>`

**Pros:** flexibility.
**Cons:** only `engineering` ships, so the choice changes nothing today.
Compromise: the flag exists and is validated (an unknown name is rejected with
the available ones listed), but the default stays `engineering` — option 1 holds.

### Option 3: the vault outside git (an external store)

**Pros:** one vault shared between repositories.
**Cons:** the vault stops travelling with the project and navigation gets worse.
Rejected.

## Decision

Take option 1: `engineering` by default; the vault is plain markdown in git; the
bind config is `.waypost/projectstore.json` in the project root (the vault may live
in the same repository or in a separate vault repository for teams).

## Consequences

### Positive

- Full compatibility with the upstream layout and templates.
- The vault is portable: git, GitHub, Obsidian, any editor; no proprietary format.

### Negative / risks

- A fixed layout means a new layout file for non-engineering projects.
- A vault in a separate repository means navigating between two checkouts.

## Verification and follow-up

- `bin/waypost bind <vault>` creates the `engineering` structure and
  `.waypost/projectstore.json` (covered by "bind scaffolds the layout…" in
  `tests/harness.test.mjs`).
- `bin/waypost status` reads `vault_path`/`layout` correctly.
- `--layout`/`--lang` are implemented and validated before any write: an unknown
  value is rejected and nothing is written ("bind rejects an unknown layout or
  language").
