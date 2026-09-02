# ADR-0009: doctor verifies artifact integrity, not just story mechanics

- Status: proposed
- Date: 2026-09-02
- Deciders: not approved by the project owner; status `proposed`
- Supersedes: —
- Superseded by: —
- Related: `scripts/doctor.mjs`, `scripts/graph.mjs`, `docs/decisions/0008-token-budget.md`
- code_refs: ["scripts/doctor.mjs", "tests/scripts.test.mjs", "AGENTS.md", "README.md", "docs/how-it-works.md"]

## Context

Three integrity properties that a vault's frontmatter asserts are not verified by
`waypost doctor` today. They were found by a downstream project that had to
reimplement all three in its own script, and that reimplementation is where the
evidence comes from — every one of them caught a real defect on its first run.

1. **`code_refs` are only validated for `in-progress`/`done` artifacts**
   (`checkCodeRefs`). An ADR is never in either state, so a decision record may
   name a path that has ceased to exist and doctor stays silent. The downstream
   project found two superseded ADRs pointing at a script deleted in the same
   commit; `waypost doctor` reported `0 issues`.

2. **`supersedes` / `superseded_by` are read only by `graph.mjs`**, which renders
   the edges. Nothing checks that the target exists, that the declaration is
   mutual, or that a superseded artifact's status says `superseded`. A
   one-directional or dangling declaration produces a plausible-looking graph.

3. **`status: accepted` does not require a completed review.** The converse is
   checked (`review_status: reviewed` demands a `reviewed_at`), so the field pair
   exists and is half-enforced. A project whose process requires an independent
   review before acceptance has no mechanical support for it.

The cost of leaving them out is not theoretical: a downstream project carrying its
own YAML reader for exactly these checks hit three separate parser defects
(`supersedes: null` iterated character by character, block-form lists silently
read as empty, CRLF frontmatter rejected outright). Every one of them is a bug
this repository does not have, in a parser that exists only because the checks are
missing here.

## Decision drivers

- The properties are universal to the vault format, not to any project's policy.
- Existing vaults must not turn red on upgrade: new findings have to be additive
  and mostly advisory.
- Policy that genuinely varies between projects belongs behind the existing
  `lifecycle_gates` switch, not in the default path.
- A second parser downstream is a defect generator; the fix is to not need one.

## Considered options

### Option 1: verify all three in `doctor`, severity graded (chosen)

`code_refs` gain a `warn` at any other status while `in-progress`/`done` keep
`issue`; annotated paths (`(deleted)`, `(waiting)`, `(planned)`) are exempt
everywhere. Supersede links get a new check: dangling target is an `issue`,
missing reciprocal and a non-`superseded` status are `warn` — matching how
spec↔story asymmetry is already treated. The acceptance gate is an `issue`, but
only under `lifecycle_gates: on`.

**Pros:** one implementation, one parser, no downstream duplication; upgrade is
quiet because new default findings are warnings.
**Cons:** `lifecycle_gates` widens from stories to artifacts generally.

### Option 2: leave `doctor` alone, document the gap

**Pros:** zero change here.
**Cons:** every project that cares reimplements a frontmatter reader. The
downstream evidence says that is where the bugs come from. Rejected.

### Option 3: verify all three unconditionally as `issue`

**Pros:** strongest guarantee.
**Cons:** every existing vault with a `proposed` artifact naming a future path
turns red on upgrade, and the acceptance gate imposes one project's process on
all of them. Rejected.

## Decision

Take option 1. `doctor` verifies what frontmatter asserts: that a named path
exists, that a supersede link is mutual and lands somewhere, and — where the
project has switched lifecycle gates on — that acceptance followed a review.

Severity is graded so that the upgrade is quiet: only the acceptance gate and a
dangling supersede target are `issue`, and the gate is opt-in.

## Consequences

### Positive

- The three properties hold for ADRs, not only for stories.
- A downstream project can drop its own frontmatter reader, which is where the
  defects were.
- `lifecycle_gates: on` becomes a meaningful switch for decision records too.

### Negative / risks

- Vaults with `proposed` artifacts pointing at future paths gain warnings. The
  `(waiting)`/`(planned)` annotation is the documented way to silence them, and
  it is now honoured at every status.
- `lifecycle_gates` no longer means "story gates" — the name outlives its original
  scope. Renaming it would break vault configs, so the scope is documented instead.
- Annotations are recognised by suffix only. A path that legitimately ends in
  `(deleted)` cannot exist, so the collision is theoretical.

## Verification and follow-up

- `npm test` — the checks are covered in `tests/scripts.test.mjs`: a resolving and
  a dangling `code_ref` at `proposed`, an annotated one, a mutual and a
  one-directional supersede pair, a dangling target, and the acceptance gate both
  with `lifecycle_gates` off and on.
- `waypost doctor` on this repository stays at its current finding count.
- Follow-up: the downstream project removes the duplicated checks and keeps only
  what is genuinely outside a vault (its Memory index, a pointer file, references
  aimed at ADRs from source).
