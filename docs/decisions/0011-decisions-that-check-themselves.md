# ADR-0011: Decisions that check themselves: guards and provenance in ADRs

- Status: proposed
- Date: 2026-09-04
- Deciders: not approved by the project owner; status `proposed`
- Supersedes: —
- Superseded by: —
- Related: ADR-0009 (artifact integrity checks), ADR-0008 (token budget), `scripts/doctor.mjs`, `agents/critic.md`, `agents/reviewer.md`
- code_refs: ["scripts/doctor.mjs (planned)", "scripts/draft.mjs (planned)", "templates/en/adr.md.tmpl (planned)", "tests/scripts.test.mjs (planned)"]

## Context

A decision log works only while something checks that the code still follows
it. With coding agents the failure arrives faster: an agent scaffolds a service
in minutes and, along the way, picks a database client, a transport, a
directory layout — decisions nobody wrote down and nobody asked for. The 2026
literature calls it vibe architecting, and the market answers with hosted
platforms that turn decisions into a queryable corpus tied to the live system,
with fitness functions in CI, and with per-tool hooks that ask a model to
compare each diff against the ADRs.

Waypost already has half of the answer. ADR-0009 makes `doctor` verify what an
ADR's frontmatter asserts: `code_refs` resolve, supersede links are mutual,
acceptance needs a review. `code_refs` proves that the files a decision names
still exist. It does not prove that they still do what the decision says. The
critic and reviewer roles cover the semantic half, at a price (ADR-0008: one
role pass on Opus costs about as much as a working day of `doctor` runs) and
only when someone calls them.

Separately, an ADR drafted by an agent carries no record of that: which
harness, which session, which model. Commits carry it (ADR-0006 trailers); the
artifact does not.

## Decision drivers

- Deterministic: a guard is checked by `doctor` with no model and no network.
- Files in git: the guard lives in the ADR it protects, travels with it, and
  is reviewed with it.
- Safe by default: a vault may be shared, and markdown must not become a way
  to run commands on someone else's machine.
- Narrow and explainable: a failing guard names the ADR, the file, the line
  and the reason in one sentence. A guard that cannot say why does not exist.
- Complement, not replacement: the semantic review stays with the roles.

## Considered options

### Option 1: `guards` in ADR frontmatter, evaluated by `doctor` (chosen)

```yaml
guards:
  - forbid: "from ['\"]axios['\"]"
    in: "src/**/*.ts"
    why: "HTTP goes through the shared client, see Decision"
  - require: "bus\\.publish\\("
    in: "services/**/*.ts"
    why: "services talk through the message bus"
  - run: "npm run arch:check"
    why: "the dependency-cruiser rules encode this ADR"
```

Semantics, deliberately few:

- `forbid` fails when the pattern matches in any file selected by `in`.
- `require` fails when no file selected by `in` contains the pattern.
- `run` fails when the command exits non-zero. It executes only when the
  vault's `.projectstore.json` says `guards_run: on`, and never from
  `doctor --fix`, which repairs and must not run anything from an artifact.
- Guards of `accepted` ADRs are checked at level `issue` (check id
  `adr-guard`); guards of `proposed` ADRs are reported at level `info` as
  "would fail", so a decision can be tried before it is taken.
- Patterns are JavaScript regular expressions applied line by line; `in` is a
  glob relative to the project root. Files git ignores are not read.

Provenance: `waypost draft adr --write` records `drafted_by` in the
frontmatter — `harness`, `session`, `provider` when set — from the same
environment the commit trailers use. `model` is not known to the CLI and stays
a manual field.

**Pros:** no model, no server, one file per decision; a violation is found by
the same command that finds a dangling `code_refs`; a guard is reviewed in the
same diff as the decision it protects.
**Cons:** regular expressions catch textual shapes, not architecture; some
decisions have no guard, and that is fine. Command guards need the opt-in.

### Option 2: fitness functions in the project's own test suite

**Pros:** full power of the project's tooling (dependency-cruiser, ArchUnit).
**Cons:** the test does not know which ADR it serves, and `doctor` cannot
report it; the decision and its check live apart. Kept as what `run` guards
point at, not as the mechanism.

### Option 3: a model compares every diff with the ADRs

**Pros:** understands intent.
**Cons:** costs a role pass per commit, is not deterministic, and a false
"conforms" is silent. That is what the reviewer role is for, on demand.
Rejected as the default.

## Decision

Take option 1. Guards are optional frontmatter of vault ADRs, checked by
`doctor` as described, with command guards behind an explicit vault-level
opt-in and outside `--fix`. `draft --write` records `drafted_by`. The critic
and reviewer roles stay the semantic layer; `doctor` reports what a regular
expression can settle.

Waypost's own decisions live in `docs/decisions/` outside a vault and use the
list-style header, so they cannot carry guards until they gain frontmatter;
whether to move them is a separate decision, not part of this one.

## Consequences

### Positive

- A decision can be violated only loudly: `doctor` names the ADR and the file.
- Provenance closes the attribution gap for agent-drafted decisions.
- No new dependency, no cost per run beyond reading the files the globs select.

### Negative / risks

- A broad pattern produces noise, and noise trains people to ignore `doctor`.
  Mitigation: `why` is mandatory, and the finding shows the matching line.
- Regular expressions over source text miss decisions that live in structure,
  not text. Those keep relying on the roles.
- `run` guards execute project commands; the opt-in is per vault, not per
  guard, so a shared vault with the opt-in on runs whatever an accepted ADR
  says. The critic pass before acceptance is where such a guard is read.

## Verification and follow-up

- Tests: `forbid` and `require` on fixtures, in both levels; a `run` guard
  refused without the opt-in and never executed under `--fix`; a guard without
  `why` is a doctor finding of its own; `drafted_by` written by `draft --write`
  and absent on a hand-made file.
- Live: a real vault with one guard that fails on purpose, and the fix.
- Open: whether `docs/decisions/` should move into a vault so that Waypost's
  own decisions can carry guards.
