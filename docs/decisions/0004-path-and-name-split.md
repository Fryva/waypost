# ADR-0004: Name split: the vault stays ProjectStore-compatible, project wiring lives in `.mps/`

- Status: proposed
- Date: 2026-08-29
- Deciders: not approved by the project owner; status `proposed`
- Supersedes: —
- Superseded by: —
- Related: `scripts/lib.mjs`, `bin/mps`, `scripts/doctor.mjs`, ADR-0001, ADR-0002
- code_refs: ["scripts/lib.mjs", "bin/mps", "scripts/doctor.mjs", "scripts/sessions.mjs", ".gitignore"]

## Context

The fork renamed the tool (`projectstore` → `mps`), but the name appears in two
different layers: inside the vault (the policy file `<vault>/.projectstore.json`,
the session registry `<vault>/.projectstore/sessions/`, the `projectstore: derived`
marker in generated files) and in the project wiring
(`<project>/.claude/projectstore.json`, `<project>/.claude/.projectstore/` for
machine-local state). Renaming everything breaks vault compatibility; renaming
nothing leaves non-Claude harnesses writing into `.claude/`.

## Decision drivers

- The vault is the team's shared artifact and the portable value; it should open
  in upstream ProjectStore and in this fork alike.
- Project wiring is machine-local and harness-specific; a `.claude/` directory in
  a project driven from Codex or OpenCode is a leaked abstraction.
- Do not create migrations without a payoff.

## Considered options

### Option 1: split the layers (chosen)

The vault is not renamed: `<vault>/.projectstore.json`,
`<vault>/.projectstore/sessions/` and `projectstore: derived` stay as they are.
The project side moves to `.mps/`: the bind config is `.mps/projectstore.json`
(legacy `.claude/projectstore.json` still read) and machine state is
`.mps/state/`.
**Pros:** the vault stays compatible in both directions; no harness gets another
harness's directory; one migration, limited to the project side.
**Cons:** the tool name inside the vault differs from the CLI name, which has to
be explained (it is, here and in `docs/how-it-works.md`).

### Option 2: rename everything to `mps`

**Pros:** nomenclature purity.
**Cons:** the vault stops opening in upstream ProjectStore, and existing vaults
need a migration for cosmetics. Rejected.

### Option 3: leave everything as upstream

**Pros:** no changes.
**Cons:** Codex and OpenCode write into `.claude/` — the exact thing the fork
exists to avoid. Rejected.

## Decision

Take option 1. In addition: generated role files (`.claude/agents/`,
`.opencode/agents/`, `.codex/agents/`, …) are meant to be committed — that is how
a team gets the same roles — while `.mps/` is machine-local and belongs in
`.gitignore`; `mps doctor --fix` writes exactly those entries.

## Consequences

### Positive

- One vault can be driven from MPS and from ProjectStore.
- A project driven from Codex or OpenCode contains no `.claude/` unless Claude
  Code is actually used there.
- `SOURCE_IGNORE` covers `.mps/`, `.opencode/` and `.codex/`: wiring is not
  counted as source when doctor asks "work without a story?".

### Negative / risks

- Two naming schemes in two layers is a source of confusion when reading the
  code; mitigated by comments in `scripts/lib.mjs` and a table in
  `docs/how-it-works.md`.
- Compatibility with upstream is verified by path names, not by running both
  tools against one vault.

## Verification and follow-up

- `tests/harness.test.mjs`: the config is created at `.mps/projectstore.json`
  and doctor names exactly that path; the session registry is written to
  `<vault>/.projectstore/sessions/`.
- `mps doctor --fix` adds `.mps/projectstore.json` and `.mps/state/` to
  `.gitignore` (covered by "a freshly bound … clean under doctor").
