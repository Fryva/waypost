# ADR-0011: Decisions that check themselves: guards and provenance in ADRs

- Status: proposed
- Date: 2026-09-04 (revised the same day after a fresh-context critic pass)
- Deciders: not approved by the project owner; status `proposed`
- Supersedes: —
- Superseded by: —
- Related: ADR-0009 (artifact integrity checks), ADR-0008 (token budget), `scripts/doctor.mjs`, `scripts/lib.mjs` (`parseFrontmatter`), `agents/critic.md`, `agents/reviewer.md`
- code_refs: ["scripts/doctor.mjs (planned)", "scripts/draft.mjs (planned)", "scripts/lib.mjs (planned)", "templates/en/adr.md.tmpl (planned)", "bin/waypost (planned)", "tests/scripts.test.mjs (planned)"]

## Context

A decision log works only while something checks that the code still follows
it. With coding agents the failure arrives faster: an agent scaffolds a service
in minutes and, along the way, picks a database client, a transport, a
directory layout — decisions nobody wrote down and nobody asked for. The 2026
literature calls it vibe architecting, and the market answers with hosted
platforms that turn decisions into a queryable corpus tied to the live system,
with fitness functions in CI, and with per-tool hooks that ask a model to
compare each diff against the ADRs.

Waypost has half of the answer. ADR-0009 makes `doctor` verify what an ADR's
frontmatter asserts: `code_refs` resolve, supersede links are mutual,
acceptance needs a review. `code_refs` proves that the files a decision names
still exist; it does not prove they still do what the decision says. The
critic and reviewer roles cover the semantic half, at a price (about $1.62 per
critic pass on Opus, ADR-0008) and only when someone calls them.

Two constraints shape the mechanism. `parseFrontmatter` is line-based by
design (no YAML dependency, AGENTS.md): it reads a block sequence or a block
map as an empty scalar, and `doctor` already ships findings for block-form
`specs:` and `external_refs:`. And `doctor` is not only the command a human
runs: `waypost next` runs it in full on every session start, so anything
`doctor` evaluates runs unattended, on every clone, before any human reads
the artifact that asked for it.

Separately, an ADR drafted by an agent carries no record of that: which
harness, which provider. Commits carry it (ADR-0006 trailers); the artifact
does not.

## Decision drivers

- Deterministic: a guard is checked by `doctor` with no model, no network,
  and nothing executed.
- Files in git: the guard lives in the ADR it protects, travels with it, and
  is reviewed with it.
- Safe on every clone: a markdown file must not be able to run a command on
  someone else's machine, through any path `doctor` is reached by.
- Narrow and explainable: a failing guard names the ADR, the file, the line
  and the reason in one sentence. A guard that cannot say why does not exist.
  A guard that cannot fail is a finding of its own.
- Bounded: `doctor` stays cheap by construction; a guard cannot hang it or
  silence the checks that follow.
- Complement, not replacement: the semantic review stays with the roles.

## Considered options

### Option 1: `guards` in ADR frontmatter, evaluated by `doctor`, nothing executed (chosen)

Flow form only, one line, read through `JSON.parse` like `listOf` reads
`code_refs` — the only form the parser sees:

```yaml
guards: [{"forbid": "from ['\"]axios['\"]", "in": "src/**/*.ts", "not_in": "src/**/*.test.ts", "why": "HTTP goes through the shared client, see Decision"}, {"require": "bus\\.publish\\(", "in": "services/**/index.ts", "why": "every service publishes on the bus"}, {"check": "npm run arch:check", "why": "the dependency-cruiser rules encode this ADR"}]
drafted_by: {"harness": "claude", "provider": null, "date": "2026-09-04"}
```

Semantics, deliberately few:

- `forbid` fails when the pattern matches in any file selected by `in` and
  not excluded by `not_in`. `require` fails for every selected file that
  does not contain the pattern. Patterns are JavaScript regular expressions
  applied to the whole file text (so a formatter's line wrap does not hide a
  match); the finding reports the line of the first match.
- `in` and `not_in` are globs relative to the project root, matched by a
  small in-tree matcher (`**`, `*`, `?`), over the files git knows
  (`git ls-files --cached --others --exclude-standard`; a plain walk that skips
  `.git` and `node_modules` outside a repository). A guard whose `in` selects
  no file is a finding: a guard that cannot fail is worse than none.
- `check` is metadata: it names the project's own fitness command that
  encodes the decision. `doctor` prints it beside the ADR and **never runs
  it**. Running belongs to the project's test suite (option 2 below); the
  link between the decision and its check is what this field carries.
- `why` is mandatory on every guard; a guard without it is its own finding.
- Guards are evaluated for `accepted` ADRs at level `issue` (check id
  `adr-guard`, with the repair hint "change the code, or supersede the
  decision"); for `proposed` ADRs at level `info` as "would fail"; not at all
  for `superseded` ones. Only frontmatter is read, never the body.
- Bounds: each pattern is compiled in its own try/catch and a bad one is a
  per-guard finding, never an exception that stops the remaining vault
  checks; files over 1 MB and more than 5000 selected files are skipped with
  a finding; the whole guard pass is outside the vault checks' stop-on-throw
  loop. Block-form `guards:` gets the same finding block-form `specs:` has.

Provenance: `waypost draft adr --write` records `drafted_by` — `harness`,
`provider` when set, `date` — from the environment `bin/waypost` pins for
every command. It is what the environment asserted, not a verified fact, and
the ADR says so; the session id stays in commit trailers rather than in a
tracked artifact, since it embeds a hostname and a pid.

**Pros:** no model, no server, nothing executed, one file per decision; a
violation is found by the same command that finds a dangling `code_refs`; a
guard is reviewed in the same diff as the decision it protects.
**Cons:** regular expressions catch textual shapes, not architecture; some
decisions have no guard, and that is fine. The link to a real fitness
function is a name, not an execution.

### Option 2: fitness functions in the project's own test suite

**Pros:** full power of the project's tooling (dependency-cruiser, ArchUnit).
**Cons:** the test does not know which ADR it serves, and `doctor` cannot
report it; the decision and its check live apart. Kept as what `check` names,
and as the only place a command runs.

### Option 3: `run` guards executed by `doctor` behind an opt-in

Considered in the first draft and cut after the critic pass: the opt-in would
have lived in the vault's `.projectstore.json`, which travels with the vault,
so the author of a repository could commit both the opt-in and the commands
and a clone would execute them on `waypost next`; and a `proposed` ADR, which
exists from the moment `draft --write` creates it, would have run before any
critic read it. No perimeter drawn on a flag survives that. Rejected.

### Option 4: a model compares every diff with the ADRs

**Pros:** understands intent.
**Cons:** costs a role pass per commit, is not deterministic, and a false
"conforms" is silent. That is what the reviewer role is for, on demand.
Rejected as the default.

## Decision

Take option 1. Guards are optional flow-form frontmatter of vault ADRs,
checked by `doctor` as described, with nothing executed; `check` names the
project command without running it. `draft --write` records `drafted_by`. The
critic and reviewer roles stay the semantic layer; `doctor` reports what a
regular expression can settle.

Waypost's own decisions live in `docs/decisions/` outside a vault and use the
list-style header, so they cannot carry guards until they gain frontmatter;
whether to move them is a separate decision, not part of this one.

## Consequences

### Positive

- A decision can be violated only loudly: `doctor` names the ADR, the file
  and the line, on every `waypost next`.
- Provenance records who drafted a decision, honestly labelled as asserted.
- No new dependency, nothing executed, a stated bound on cost.

### Negative / risks

- A broad pattern produces noise, and noise trains people to ignore `doctor`.
  Mitigation: `why` is mandatory, `not_in` exists, and the finding shows the
  matching line.
- Regular expressions over source text miss decisions that live in structure,
  not text. Those keep relying on the roles and on `check`-named tests.
- `doctor`'s exit code now depends on source files, not only on the vault; a
  repository that adopts guards accepts that `waypost doctor` fails when the
  code drifts. That is the point.

## Verification and follow-up

- Critic pass 2026-09-04 (fresh context, Opus): verdict *revise*; the
  findings folded in above — flow form for the line-based parser, `run`
  replaced by non-executing `check`, `require` semantics named, `not_in`, the
  zero-match finding, whole-file matching, per-guard compilation outside the
  stop-on-throw loop, bounds, the `next` repair hint, the ADR-0008 citation,
  `drafted_by` labelled as asserted and without the session id.
- Tests: `forbid` and `require` on fixtures at both levels; `not_in`; a glob
  selecting nothing; a bad regex as a per-guard finding with the other vault
  checks still reported; a `check` guard printed and never executed (sentinel
  file); a guard without `why`; block-form `guards:` reported; a superseded
  ADR's guards ignored; size and count bounds; `drafted_by` written by
  `draft --write` and absent on a hand-made file; `waypost next` shows the
  repair hint for `adr-guard`.
- Live: a real vault with one guard that fails on purpose, and the fix.
- Open: whether `docs/decisions/` should move into a vault so that Waypost's
  own decisions can carry guards.
