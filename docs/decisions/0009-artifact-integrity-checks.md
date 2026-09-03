# ADR-0009: doctor verifies artifact integrity, not just story mechanics

- Status: accepted
- Date: 2026-09-02
- Deciders: Ivan Morozov (project owner); approved 2026-09-03
- Supersedes: —
- Superseded by: —
- Related: `scripts/doctor.mjs`, `scripts/graph.mjs`, `docs/decisions/0008-token-budget.md`
- code_refs: ["scripts/doctor.mjs", "scripts/lib.mjs", "scripts/graph.mjs", "bin/waypost", "tests/scripts.test.mjs", "AGENTS.md", "docs/how-it-works.md", "docs/decisions/README.md", "agents/planner.md", "agents/reviewer.md", "prompts/story.md"]

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
   dead target does appear in the graph as such, but a graph row is not a finding
   and ADR-0008 says not to read the graph whole — so nothing surfaces it.

3. **`status: accepted` does not require a completed review.** The converse is
   checked (`review_status: reviewed` demands a `reviewed_at`), so the field pair
   exists and is half-enforced. A project whose process requires an independent
   review before acceptance has no mechanical support for it.

The cost of leaving them out is not theoretical: a downstream project carrying its
own YAML reader for exactly these checks hit three separate parser defects
(`supersedes: null` iterated character by character, block-form lists silently
read as empty, CRLF frontmatter rejected outright). Two of the three are bugs this
repository does not have; the block-form trap it shares, and compensates for with
a dedicated finding on `external_refs:` — which these fields do not yet have. The
parser existed only because the checks were missing here.

## Decision drivers

- The properties are universal to the vault format, not to any project's policy.
- Existing vaults must not turn red on upgrade: new findings have to be additive
  and mostly advisory.
- Policy that genuinely varies between projects belongs behind an opt-in switch of
  its own, not in the default path and not on a switch that means something else.
- A second parser downstream is a defect generator; the fix is to not need one.

## Considered options

### Option 1: verify all three in `doctor`, severity graded (chosen)

`code_refs` gain a `warn` at any other status while `in-progress`/`done` keep
`issue`; annotated paths (`(deleted)`, `(waiting)`, `(planned)`) are exempt
everywhere. Supersede links get a new check: dangling target is an `issue`,
missing reciprocal and a non-`superseded` status are `warn` — matching how
spec↔story asymmetry is already treated. The acceptance gate is an `issue` under
its own vault key, `acceptance_gate`.

The supersede check reads its fields with `refsOf` and resolves targets with
`resolveLinkTarget` — the reader and the resolver `graph.mjs` already uses. This
is not an implementation detail: a private lookup was the first version of the
supersede check, and it simultaneously missed the bare-scalar form these fields
are normally written in and rejected legal slug and case variants, turning a
correct vault red. An ADR whose premise is "a second reader is a defect
generator" cannot ship a third one.

`code_refs` keeps reading through `listOf`: inline flow is the documented form for
that field and `codemap.mjs` reads it the same way, so moving it to the
scalar-tolerant reader would have made doctor and `code-map.md` disagree about what
a document declares, and would have added a new issue on upgrade. The scalar form is
accepted only where it is documented and used — `supersedes`/`superseded_by`.

**Pros:** one reader per field, one resolver, no downstream duplication; the only
new issues an upgrade can produce come from a supersede link that cannot be true.
**Cons:** a new vault-config key to explain.

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
project has switched `acceptance_gate` on — that the review question was answered
before the artifact was accepted.

Severity is graded so the upgrade stays quiet where it can: `code_refs` findings
are warnings outside `in-progress`/`done`, which is the bulk of what an existing
vault would newly report. `issue` is kept for a supersede link that resolves to
nothing, is ambiguous, or points at its own artifact — a declaration that cannot be
true — and for the acceptance gate, which is opt-in behind its own key.

The gate's invariant is deliberately narrow — acceptance must not happen while the
review question is open. Any explicit answer satisfies it (`reviewed`, `n/a`,
`waived`, or a project's own word for a conscious non-review); only silence fails.
That way a project supplies its own vocabulary without this check knowing it.

## Consequences

### Positive

- The three properties hold for ADRs, not only for stories.
- A downstream project can drop its own frontmatter reader, which is where the
  defects were.
- `acceptance_gate` gives a project a way to make its own acceptance rule
  mechanical, without this check knowing the project's vocabulary for it.

### Negative / risks

- Vaults with `proposed` artifacts pointing at future paths gain warnings. The
  `(waiting)`/`(planned)` annotation is the documented way to silence them, and
  it is now honoured at every status.
- One more vault-config key. The alternative — hanging the gate on
  `lifecycle_gates` — was tried and rejected: that switch is story-scoped, every
  finding under it is a warning, and `waypost bind` recommends turning it on, so an
  issue-level acceptance policy there would enrol projects that only ever agreed to
  story gates. (`waypost brief` used to print `lifecycle_gates: on` for an empty
  config while doctor read empty as `off`; that disagreement has since been fixed
  separately, and it was one more reason not to hang policy on that key.)
- Annotations are recognised by suffix only. A path that legitimately ends in
  `(deleted)` cannot exist, so the collision is theoretical.
- **Unreadable forms pass silently.** `parseFrontmatter` is line-based, so a
  block-sequence `supersedes:` reads as empty and a `"[[wikilink]]"` value is
  skipped — doctor reports nothing and a clean run looks like confirmation the link
  was checked. `external_refs` has a dedicated finding for exactly this trap;
  extending it to these fields is the first follow-up. (Since the 2026-09
  frontmatter-parsing fixes, the unquoted flow-list spelling — `code_refs: [a.mjs,
  b.mjs]` — and the bare YAML `~` for null are both read correctly; block-form
  sequences and wikilink values are the forms that still pass silently.)
- **The gate covers `adr`, `spec` and `research` only** — the kinds whose templates
  carry `review_status`. Demanding it from a runbook would be asking for a field the
  template never offered; an `epic` has the field but its acceptance is not a review
  decision.
- Supersede targets resolve within the source artifact's own kind first, because
  `graph.mjs` reads these fields for `adr` only. A declaration that lands on another
  kind is real and is reported as a warning naming what it found, not as a missing
  target: the edge simply will not appear in the graph.

## Verification and follow-up

- `npm test` — covered in `tests/scripts.test.mjs`. The supersede cases are built
  from real frontmatter rather than hand-made objects: the first version supplied
  `fm` directly and so never exercised the reader, which is exactly where the check
  was blind. Covered: the bare-scalar form, a slug reference to a legacy-numbered filename,
  asymmetry, self-reference, duplicate entries reported once, the acceptance gate
  off / under `lifecycle_gates` / under its own key / satisfied by each answer
  form, and a well-formed vault gaining no new issue.
- This repository has no bound vault, so the vault group never runs here; the
  checks were measured against a real 15-artifact vault downstream, where they
  report nothing on a correct state.
- Follow-up: the downstream project removes the duplicated checks and keeps only
  what is genuinely outside a vault (its Memory index, a pointer file, references
  aimed at ADRs from source).
