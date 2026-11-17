---
type: adr
id: "a-storys-scope-and-protected-zones-a-reminder-at-every-entry-a-refusal-at-commit"
title: "A story's scope and protected zones: a reminder at every entry, a refusal at commit"
status: proposed
date: 2026-11-07
authors: ["Ivan Morozov"]
tags: []
external_refs: {}
supersedes: null
superseded_by: null
review_status: pending
reviewed_at: null
drafted_by: {"harness":"claude","provider":null,"date":"2026-11-07"}
code_refs: ["scripts/commit.mjs", "scripts/doctor.mjs", "scripts/lib-frontmatter.mjs", "scripts/lib.mjs", "scripts/story-section.mjs", "scripts/sessions.mjs", "scripts/reconcile.mjs", "scripts/team-integration.mjs", "scripts/team-host.mjs", "bin/cli/artifacts.mjs", "bin/cli/core.mjs", "agents/reviewer.md", "docs/cli-reference.md", ".github/workflows/ci.yml", ".github/workflows/release.yml", "scripts/scope.mjs (planned)", "scripts/lib-glob.mjs (planned)", "scripts/lib-controls.mjs (planned)", "scripts/hooks.mjs (planned)", "tests/scope.test.mjs (planned)", ".github/workflows/scope-audit.yml (planned)"]
related: "ADR-0001 (harness-agnostic core), ADR-0006 (commit protocol; amended here), ADR-0007 (presence and leases), ADR-0008 (token budget), ADR-0009 (artifact integrity), ADR-0010 (coordination follows the repository), ADR-0011 (guards), solo-entry ADR (task trailer), rule-compliance ADR (proposed; shares the hook host)"
guards: []
---

# A story's scope and protected zones: a reminder at every entry, a refusal at commit

| Field | Value |
|---|---|
| **Status** | proposed — revised eight times (2026-11-07 … 2026-11-17) after fresh-context critic passes |
| **Date** | 2026-11-07 |
| **Authors** | Ivan Morozov |
| **Related** | ADR-0001, ADR-0006 (amended), ADR-0007, ADR-0008, ADR-0009, ADR-0010, ADR-0011, solo-entry ADR, rule-compliance ADR |

---

## Context

A coding agent drifts. Asked to add an invoice export, it rewrites the login
flow; told to stop, it returns to it after a compaction. The task and the
project's decisions live in the vault, yet nothing connects them to the files
a commit changes.

What exists today:

- **Reminders.** `brief`, `next`, the routing block, a story's acceptance
  criteria. Advisory.
- **ADR guards (ADR-0011).** Regular expressions over file text, checked by
  `doctor`, blind to which story is in flight.
- **Refusals in `waypost commit`** (`scripts/commit.mjs`): a story claimed by
  another live session, the shared-checkout sweep of `--all`, a foreign lease,
  the team gate. All protect a session from its neighbours, none from itself.
- **Everything that says "who I am and what I work on" is self-asserted.**
  `--story` resolves against the working tree; `sessions --claim` accepts any
  string; `WAYPOST_VAULT` overrides the binding; trailers can be typed by
  hand. Everything in the working copy, the git config and the git common dir
  is the agent's to change.

Eight critic passes found ways for the agent to grant itself permission —
tags, a `grants` key, the story it names, the binding, a `type:` change, an
owners file, a reconfigurable verifier, a launderable history walk, the
owner's forge credentials, "update branch" merges, recombining automatic
merges — and, in the previous revision, a basis tied to a path rather than to
a change. The premise: **nothing evaluated in the agent's environment, and
nothing the agent's credentials can reconfigure, stops a determined agent;**
**per-commit attribution through merges cannot be made sound;** so the rule
judges the net result, requires every ordinary commit touching a zone path to
carry an allowed story, and pins every signature to exact before-and-after
content. Drift is closed wherever a commit is made. Intent is closed only by
a required check on the protected default branch, run from a definition the
agent cannot change, under preconditions the owner keeps.

Constraints: ADR-0001 — no harness hook may be required (an optional git hook
is not a harness hook). ADR-0008 — this ADR adds nothing to the routing block
or the standing context. A vault written by this release must not turn an
older release's `doctor` red. `parseFrontmatter` is line-based.

## Decision

### 1. Threat model

| Threat | Local (agent's machine) | Required check on the protected branch (§3) |
|---|---|---|
| Drift through `waypost commit` | Refused before anything is written | Refused |
| Drift through plain git | Refused where the optional hook (§5) is installed; otherwise not stopped | Refused |
| Intent: an override, or a fence loosened | Possible; recorded | Refused unless an owner-signed commit pins the exact change (§3) |
| Intent: naming a story that `allow` lists | Accepted, recorded | Accepted, recorded — residual |
| The agent runs in the owner's environment (owner's `gh` token, credential helper, `ssh-agent` with the signing key) | — | **The right-hand column does not apply** |

**Preconditions for the right-hand column** (a checklist in the docs; nothing
proves them):

1. The agent runs as a separate OS user or in a sandbox, without the owner's
   forge credentials or signing key, and pushes with a fine-grained token
   without admin, secrets, workflows, checks, statuses, actions or bypass
   rights; it cannot create tags that publish releases.
2. The owner key is protected: a hardware key with touch, or a passphrase
   not cached where the agent runs.
3. The protected branch is the default branch, requires the audit check
   (source: GitHub Actions) with no bypass, requires branches to be up to
   date, and allows merge commits or squash only. No merge queue.
4. The Actions event policy allows `pull_request_target` for the audit
   workflow file (blocked by default in public repositories from 2026-12-02).
5. Open question 2 is answered on a throwaway repository before this column
   is claimed for a project.

### 2. A protected zone

```yaml
protect: [{"paths": ["src/auth"], "allow": ["WP-12", "WP-30/story-rotate-tokens"], "why": "auth was settled here"}]
```

- A top-level frontmatter key of an ADR (an unknown guard kind is an `issue`
  in today's `doctor`; an unknown key is ignored). `paths` — globs relative to
  the repository root (§6), matched case-insensitively and after Unicode NFC
  normalisation, so a case or normalisation variant of a zone path is in the
  zone. `allow` — epics or stories (`<epic>/<stem>`) of the ADR's vault; may
  be empty. `why` — mandatory, ≤ 160 characters, single-line text (§4).
- **Candidates**: files `**/adr/*.md` whose frontmatter holds a `protect`
  key. The ADR's vault is the directory above `adr/`; `allow` stories resolve
  there, never through the binding or `WAYPOST_VAULT`. Unborn `HEAD`: no
  zones.
- **The strict reader**: BOM and CRLF read the same; the opening and closing
  `---` must be whole lines; a duplicate key, a block-form or empty
  `protect:`, or a `type` other than `adr` (case-insensitive, quoted or not)
  fails.
- **Active** while the normalised `status` is `accepted`; any other value is
  inactive; `proposed` reports "would refuse" as `info`.
- **Tightening vs loosening**, syntactic and conservative. A change to a
  candidate is *tightening* when the reader succeeds on both versions, the
  status is not lowered (`accepted` → anything lowers it), and for every old
  zone the new file has a zone whose normalised `paths` include each old path
  string and whose `allow` is a subset of the old one. A new candidate, and a
  `why` change alone, are tightening. Everything else — deletion, a move out
  of `adr/`, a reader failure — is *loosening*, a **fence crossing**.
- **Overlapping zones**: a path inside several active zones needs the `allow`
  of each.
- **Exempt paths**: the vault's kanban, graph and code map, wholly generated,
  by the names the vault's layout gives them (`scripts/reconcile.mjs`). Index
  READMEs carry human prose and are not exempt.
- **Fail-closed**: a candidate the reader cannot read is an `accepted` zone
  over every path; adding one is refused; repairing one is a loosening.
- **Which story counts for `allow`**: exactly one `Waypost-Story` on the
  commit (none or several: no story). `waypost commit` writes it from
  `--story`, else from the session's live claim, also beside `--task` (amends
  ADR-0006). It must exist under the ADR's vault in the evaluation base and
  not be `done` there; a story created in the same range is not in the base,
  so the story or its epic lands first.
- **Loosening lands first**: everything is judged against the base's zones; a
  range that loosens a fence and crosses it is refused.
- **A vault in another repository, or outside git**, has no candidates in the
  code repository's tree; its zones do not apply there. `doctor` says so.

### 3. The rule, and the required check

**The rule** (one function in `scripts/scope.mjs`). Given a base `b` and a
head `h`, zones and stories come from `b`. Git runs with
`GIT_NO_REPLACE_OBJECTS=1`. Paths are compared as `(mode, object id)` from
`git ls-tree`; an absent path equals only an absent path. For each path `p`
in `diff(b, h)` with `--no-renames` (deletions and both sides of a rename
count) that lies in an active zone of `b`, one of these holds:

- (i) **every** non-merge commit in `rev-list b..h` that changed `p` relative
  to its first parent (a root commit: relative to the empty tree) carries a
  story in the `allow` of every zone of `b` over `p`, **and** at least one such
  commit exists; or
- (ii) an owner-signed commit `S` in `b..h` carries
  `Waypost-Scope-Override`, `Waypost-Signed` and `Waypost-Scope-Base: <X>`,
  with `X:p == b:p` and `h:p == S:p`.

For each candidate `F` whose change `b:F → h:F` is a loosening, an
owner-signed **fence commit** `L` in `b..h` — changing only
`<vault>/adr/*.md` and exempt paths, carrying `Waypost-Signed` and
`Waypost-Scope-Base: <X>` — has `X:F == b:F` and `h:F` equal to `L:F` or
tightening it. An override never covers a fence. Tightening needs nothing.

Merge commits are not judged one by one; recombinations and `-s ours`
reverts leave `p` in the net change and need (i) or (ii). A merge resolution
written under an allowed branch is a residual.

**Owner approval of an agent's change** is one signed commit — empty if
nothing else is needed — on top of the pull request:
`waypost commit --sign --approve --base <b>`, which writes the trailers of
(ii) or of a fence commit for every zone path the range changes. After a
rebase update of the pull request, the owner approves again.

**The required check** runs the rule with `b = merge-base(B, head)` (with
strict checks, the tip `B` of the protected branch) and `h` = the pull
request's head.

- **Trust by induction.** `B` is trusted because everything that reached it
  passed the check.
- **The trusted definition**, `.github/workflows/scope-audit.yml`:
  - `pull_request_target` only; no `if:`, `paths:`, `continue-on-error`; one
    job with a unique name; `permissions: contents: read`;
  - no `actions/checkout`: in an empty directory, `git init`, then fetch
    `pull_request.head.sha` and the protected branch **by name** (never
    `pull_request.base.*`), full history, authenticating with the read-only
    `GITHUB_TOKEN` through `http.extraheader` in private repositories;
  - Waypost from `https://registry.npmjs.org/waypost/-/waypost-<version>.tgz`,
    checked against its `dist.integrity` written in the file, unpacked into
    `$RUNNER_TEMP`, run with the runner's `node` after a `node ≥ 20` check —
    no npm, no project `.npmrc`; the pull request's tree is read as git
    objects, never executed;
  - the owner keys are SSH public keys written in the file as an
    `allowed_signers` text; a missing, empty or unreadable list exits 2, as
    does `GITHUB_ACTIONS=true` without `--keys`;
  - signatures verify with `git -c gpg.format=ssh -c
    gpg.ssh.allowedSignersFile=<keys> -c gpg.ssh.program=ssh-keygen
    verify-commit`; only `G` counts; GPG and X.509 never do.
- **The definition protects itself**: `.github/` lies in a zone with an empty
  `allow`. Workflows that run pull-request code (`ci.yml` here) declare
  read-only `permissions:`. Release tags are protected (`release.yml`
  publishes on tags).
- **Upgrading the pinned version**: the owner runs old and new versions'
  `scope audit --tree B`; each prints a canonical digest (each zone, its
  matched tracked files, its `allow`) and exits 4 on an unreadable candidate.
  The pin changes only when the digests are equal, or the difference is
  approved as a fence commit.
- **Break-glass.** When the audit cannot run (the tarball is gone, the
  runner's `node` changed, GitHub changed the event), the owner suspends the
  requirement and records why. Before re-enabling it, the owner runs `scope
  audit --range <last trusted B>..<B>`; induction resumes from a green result
  or from the owner's signed approval of the reported paths.

### 4. Override, signing, text

- `--override-scope "<reason>"` writes `Waypost-Scope-Override`: trimmed,
  non-empty, one line, ≤ 200 characters.
- `waypost commit --sign` (owner): writes the tree, prints **every** changed
  path, and signs exactly that tree (`git commit-tree -S`, a compare-and-swap
  of the branch ref, no 20-second timeout) with `Waypost-Signed` and
  `Waypost-Scope-Base`. If any change is a fence crossing, every path must be
  a fence-commit path. Refused during a merge, cherry-pick or rebase.
- **Superseding a fenced ADR** is one fence commit: the old ADR's `status`
  changes, the successor is added, with `adr/README.md`.
- **Locally**, `Waypost-Signed` and an override are recorded bases; signatures
  are verified only by the required check.
- `scripts/lib-controls.mjs` holds two sets. Single-line text — `why`,
  override reasons, and every ADR id or path printed in a refusal — is an
  allowlist of Unicode letters, marks except variation selectors, numbers,
  punctuation, symbols and the space; anything else is rejected. File content
  for `team-integration.mjs` is today's `HIDDEN_CONTROLS` plus tag characters
  U+E0000–E007F, without C0, so patches with `\n` and `\t` still pass.

### 5. Entry points

| Point | What happens |
|---|---|
| Local base | For each evaluated commit `c`: `merge-base(c, R)` for each `refs/remotes/*/<default>` `R`; the rule passes if it passes for any of them (each is a trusted ancestor locally, and locally nothing is trusted anyway). Without such a ref, or without a merge base (a shallow clone), the base is `c`'s first parent and the range is that one commit |
| `waypost scope check [--story <s>] <path…>` | Per path `ok`, `allowed`, `outside (story scope)`, `protected (ADR id, why)`, `protected (fence, ADR id)`. Exit 0 all ok/allowed, 3 some outside and none protected, 4 some protected, 2 usage error |
| `waypost commit` | Evaluates the tree it would commit — staged changes plus the derived views `runReconcile({write: false})` computes — with the pending commit's trailers and `MERGE_HEAD` (through `git rev-parse --git-path`) as parents. Exit 4 on a path without a basis, before anything is written. The refusal names the ADR, its `why` and its `allow`. `--dry-run` evaluates and prints. `waypost merge` forwards `--story`, `--task` and `--override-scope` |
| `waypost scope audit --range <b>..<h> [--keys <file>]` / `--tree <rev>` | The rule as the required check runs it; `--tree` prints the canonical digest. Exit 4 on a missing basis or an unreadable candidate; 2 on an unknown range, a missing merge base, or missing keys in CI |
| `doctor` | Validates fences and scopes, `allow` entries resolving to nothing (named: a dangling entry admits whoever creates it), a zone selecting no tracked file (`warn`, unlike a guard's `issue`: a zone may guard a path before it exists), a case collision under a zone path, a bound vault whose zones cannot apply. No history walk, no graph edge |
| `waypost-reviewer` | Receives the story's scope and the zones its diff touched |
| CI | Enforces zones only. Trailers of the rule-compliance ADR are not checked by `scope-audit.yml` |

**The optional hook** is its own story, after the rule, `commit` and the
required check. `waypost hooks install` writes one `reference-transaction`
host at `git rev-parse --git-path hooks`, refusing when that path is inside
the working tree. Host contract: checks are registered in `scripts/hooks.mjs`
in a fixed order; each runs independently and fails open with one line if it
cannot start; the first refusal aborts the transaction. This ADR registers
`scope`: in the `prepared` state, for each line updating `refs/heads/*` or
`HEAD` (skipping `ref:` lines and deletions), a `sh` prefilter skips the line
when `git rev-list <new> --not --all` is empty — no new commits, which covers
`pack-refs`, `gc`, checkouts, bisect steps, `worktree add` and pulls of
already-fetched history; otherwise it runs the rule on each new commit with
the local base. Never installed by `setup` or `brief`. Not covered: a push
from a ref outside `refs/heads`, `branch -m`, a removed hook, fast-forwards
to fetched commits (caught by `waypost commit` and CI). Latency: one `node`
start per non-skipped transaction; a rebase of N commits pays N.

### 6. A story's scope, matching, parsing

```yaml
scope: {"touches": ["src/billing", "tests/billing"], "why": "invoice export only"}
```

- Optional; written with `waypost story scope add <story> --touches <p>
  [--touches <q>…] --why "<text>"`: a preview, then `--write`.
- Read from the index; widening in the same commit is itself the record. The
  story file and exempt paths are always in scope.
- Outside scope prints the paths and the `story scope add` command; it never
  refuses (Follow-up). No story: scope does not apply; zones always do.
- `scripts/lib-glob.mjs`, a pure leaf: a dynamic-programming matcher bounded
  by O(|glob|·|path|), options `subtree` and `fold` (case and NFC), `[` and
  `{` literal. ADR-0011 guards keep their matcher; moving them is a separate
  story.
- `paths`/`touches`: non-empty lists of strings relative to the repository
  root; `./`, a leading `/` and a trailing `/` normalised away; `..`, empty,
  `*` or `**` alone rejected.
- `parseFrontmatter`: for a value beginning with `{` or `[`, find the matching
  bracket honouring JSON strings; if only `\s#…` follows it, drop that
  comment; anything else as today. Block-form `scope:` gets the finding
  block-form `guards:` has.

## Rationale

1. **Judge what lands, and every ordinary commit that touched it.** The net
   change finds what merges hide; requiring every touching commit to carry an
   allowed story stops one allowed commit from licensing another's drift;
   signatures are pinned to exact content and to a named base, so an owner
   can approve a pull request with one commit and nothing can be replayed.
2. **One rule, one base per evaluated commit**, so honest pulls, merges and
   checkouts of others' branches pass locally, and local and CI agree on
   what a commit means.
3. **Intent is stopped only where it can be**, under written preconditions,
   with a break-glass that restores the induction instead of silently
   breaking it.
4. **Tightening is free, loosening is signed and lands first.**
5. **Less machinery**: no per-commit merge inheritance, no history walk, no
   undo, no local signature checks, nothing in the standing context; the hook
   is a later, separate story.

## Alternatives Considered

### A basis tied to the path (one allowed commit anywhere in the range)
Revision 7. An allowed one-line edit licensed a later drift commit on the
same path. Replaced by "every touching commit, at least one".

### A signed basis pinned to its own parent
Revision 7. The owner could not approve a pull request without first
reverting it. Replaced by `Waypost-Scope-Base`.

### A local base from the pre-update `HEAD`
Revision 7. Refused honest pulls and checkouts after a loosening landed.
Replaced by a base per evaluated commit.

### Per-commit judgement with `merge-tree` inheritance
Revision 6. Recombining automatic merges and `-s ours` reverted zone paths
with no commit to judge. Replaced by the net-change rule.

### First-parent fence state, in-tree owners file, keys in a CI secret
Revisions 3–4. Replaced by induction and keys in the definition.

### `prepare-commit-msg`, pre-commit, post-check undo, push post-audit, `scope preflight`, a `brief` line
Earlier revisions. Blind spots, fragile undo, false alarms, proof of nothing;
the `brief` line did not fit the budgets with real ADR ids. Dropped or moved
to follow-ups.

### Narrowing the ADR; permission in the story; tags; the claim alone
Rejected by the owner.

### Team publication checks and override fields; `forbid` guards; a `protect` guard kind; `code_refs` as zone; auto-leases; a required harness hook; a model per commit
Rejected in earlier revisions.

## Consequences

**Positive**:
- A wandering agent is refused at `waypost commit` and by the required check;
  where the hook is installed, at any local commit.
- Under the preconditions, a zone cannot be opened, lifted or overridden
  without an owner signature over the exact change, and the owner approves
  an agent's pull request with one signed commit.

**Negative / residual**:
- **Named story.** An agent may name or claim a story that `allow` lists; a
  `done` story can be reopened; an epic in `allow` admits later stories; a
  dangling `allow` entry admits whoever creates it.
- **Merge resolutions** written on an allowed branch are not attributed.
- **Story lands first**: a story created in a pull request cannot be its own
  basis.
- **Preconditions**: if the agent runs in the owner's environment or with
  broader forge rights, protection against intent is gone.
- **Paths, not behaviour**: code outside a zone, a symlink inside a zone
  pointing out of it, a zone path that is itself a symlink, and a root
  `.gitattributes` (eol, encoding, filters) over zone paths can change what
  the zone's code does.
- **Free tightening**: a broad new `accepted` zone blocks others until the
  owner loosens it.
- **Signed bases persist** for their exact before/after content.
- **Version skew**: the local reader and the pinned CI version may disagree;
  CI decides.
- **Adoption**: history before adoption and the adoption pull request are not
  checked; a required check can be selected only after it ran once.
- **Break-glass** suspends protection against intent until re-enabled.
- **Locally**, without the hook, plain git is caught only by the required
  check; without branch protection, not at all.
- **GitHub behaviour is unverified** (open question 2).
- **Text injection** through `why` and ADR ids is reduced by §4, not removed.
- A committed fixture under `adr/` with `protect` is a live zone.

**What changes in code / process**:
- New `lib-glob.mjs`, `lib-controls.mjs`, `scope.mjs` (rule, `scope check`,
  `scope audit`); later `hooks.mjs`.
- `commit.mjs`: the rule on the would-be tree before writing, `--git-path`
  merge state, `--override-scope`, `--sign [--approve --base]`,
  `Waypost-Story` from the claim; `merge` forwards flags.
- `team-integration.mjs`: the content set.
- `story-section.mjs`, `bin/cli/artifacts.mjs`, `bin/cli/core.mjs`: `story
  scope add`.
- `lib-frontmatter.mjs`: bracket-aware comment cut; the strict reader.
- `agents/reviewer.md`, `docs/cli-reference.md` (preconditions checklist,
  GitHub recipe, break-glass, pin upgrade).
- This repository: `scope-audit.yml`; read-only `permissions:` and
  `fetch-depth: 0` in `ci.yml`; protected release tags.
- ADR-0006 gains "Amended by" on acceptance. The rule-compliance ADR should
  drop "and CI" from its reliance on this ADR (its call).

## Open questions for the owner

1. Release order: the rule, `commit` and `scope check`; then the required
   check after open question 2; then the hook?
2. Verify on a throwaway repository: whether the Actions event policy exists
   for a personal-account repository; whether a `pull_request_target` check
   run attaches to the pull request's head SHA (since 2025-12-08 `GITHUB_SHA`
   is the default branch's tip); how a skipped and a failed run of one check
   name resolve; whether a same-named job in a fork's own approved workflow
   can satisfy the requirement. GitHub documents `pull_request_target` as
   usable for required checks; the rest is unverified.

## Acceptance

Automated, in `tests/scope.test.mjs`, each with its expected outcome:

- **Zones**: inside, outside, protected, allowed (epic, story); overlapping
  zones need both; exempt paths by layout names; index README prose under a
  zone — refused; a case or NFD variant of a zone path — refused; a
  `protect:` example in a body — not a candidate.
- **Story**: exactly one trailer; none or two — no story; absent or `done` in
  the base — ignored; created in the same range — refused; landed first —
  accepted.
- **Classification**: tightening — `proposed` → `accepted`, a path added, an
  `allow` entry removed, `why` changed, zones reordered; loosening — a path
  string changed, a zone split, a path moved to another ADR, an `allow` entry
  added, `accepted` → `superseded`, deletion, a move out of `adr/`, a `type`
  change, a duplicate key, a block-form or empty `protect:`.
- **Rule (i)**: an allowed comment commit then an unallowed rewrite of the
  same path — refused; an allowed change, its revert, then an unallowed
  rewrite — refused; a merge commit carrying an allowed story over an
  unallowed branch — refused; a root commit touching a zone — judged against
  the empty tree.
- **Rule against merges**: `merge -s ours` reverting a zone path — refused;
  the recombination case — refused; "update branch" twice — no spurious
  refusal; loosening and crossing in one range — refused.
- **Signed bases**: an owner approval on top of an agent's pull request —
  accepted; after a rebase update without re-approval — refused; `X:p ≠ b:p`
  or `h:p ≠ S:p` — refused; replayed from an abandoned branch — refused; a
  mode-only change — compared by mode; an absent path — equals only absent;
  a fence commit with a non-fence path — refused; a supersede — accepted;
  GPG signatures, a repository-local `gpg.ssh.program`, `refs/replace` —
  ignored; an override covering a fence — refused.
- **Local base**: after a loosening and a crossing land on the remote, `git
  pull`, `waypost merge origin/main` and `git switch -c x origin/x` — pass;
  two remotes — passes if either passes; a shallow clone — one-commit range.
- **`commit`**: a refusal leaves derived views untouched; a reconcile change
  to an index README under a zone is part of the evaluated tree.
- **Audit**: range required; missing merge base — exit 2; `GITHUB_ACTIONS=true`
  without `--keys` — exit 2; empty keys — exit 2; `--tree` digests equal for
  the same version; an unreadable candidate — exit 4.
- **Text**: `why`, override reasons and printed ADR ids with C0/C1, bidi, tag
  characters or variation selectors — rejected; `team-integration` patches
  with `\n` and with `\t` — accepted.
- **Matcher**: 10 `**a` segments on a 200-character path — completes, with
  the number of matcher steps bounded by |glob|·|path|.
- **Parser**: `#` inside `why`; `tags: [a, b] # note`; `title: [WIP] x`.
- **CLI**: `scope check` exit codes 0/2/3/4; `--touches a b` reports `b` as an
  error.
- **Discovery**: candidate discovery runs a constant number of git processes
  regardless of repository size.
- **Compatibility**: the previous release, checked out with `git worktree add`
  at its tag (`fetch-depth: 0` in CI), runs its `doctor` on a fixture vault
  with `protect` and `scope` built in a temporary directory — no issue,
  `graph.md` unchanged.
- **Hook** (its own story): on both `files` and `reftable` ref formats —
  commit, `--no-verify`, amend, merge, cherry-pick, revert, `am`, rebase with
  both backends (recoverable with `--abort`), a new commit on a detached
  `HEAD` — refused on a missing basis; `pack-refs --all`, `maintenance run
  --task=pack-refs`, `gc`, checkout of an existing commit, bisect, `worktree
  add --detach`, `stash` — pass; `node` missing — fails open with one line; a
  hooks path inside the working tree — install refused.

Live, as a runbook in `docs/vault/ops/`: in two harnesses, an agent on a
billing story edits `src/auth` — refused by `waypost commit`; under an
allowed story — accepted. On a throwaway GitHub repository with the recipe:
open question 2 answered; a fork pull request widening `allow` — red; an
owner-signed fence commit — green and mergeable with the button; a pull
request crossing the opened zone — green; an agent's pull request approved by
one signed owner commit — green; a pull request editing the audit workflow —
red; a retargeted pull request — its next run judged against the default
branch; break-glass and re-enable with a range audit.

## Follow-ups

- **Whether "outside scope" should refuse.** At least 20 closed stories; the
  story text as of its first `Waypost-Story` commit; a fresh-context role
  derives `touches` before seeing any diff; the owner labels each warning.
  Refuse only if ≥ 80 % of warnings are drift and warnings occur in ≤ 20 % of
  stories.
- **A `brief`/`status` line** for the claimed story's scope and zones, within
  the existing budgets with real ADR ids.

## Verification

- Critic passes 1–6 (2026-11-07): *revise* each; the owner chose `allow` in
  the ADR and to close every gap.
- Critic pass 7 (2026-11-17): *revise* — `merge-tree` inheritance unsound;
  hook coverage; bases; replayable overrides; budgets.
- Critic pass 8 (2026-11-17): *revise* — the local base from the pre-update
  `HEAD` refused honest pulls, merges and checkouts (reproduced); basis (i)
  tied to the path let one allowed commit launder another's drift
  (reproduced); the hook's `old == new` skip broke `pack-refs` and `gc` and
  judged checkouts and bisect steps; a signature pinned to `S^1` made owner
  approval impossible; case variants shadowing zone paths on macOS; the rule
  ran before reconcile wrote index READMEs; no break-glass; local signature
  checks contradicting "override never covers a fence"; the hook host
  contract and CI scope against the rule-compliance ADR; acceptance numbers
  and missing residuals. Folded in: a base per evaluated commit from any
  remote default ref; "every touching commit carries an allowed story, at
  least one"; the hook skipping lines with no new commits; `Waypost-Scope-Base`
  and `--sign --approve`; `(mode, oid)` comparison; case and NFC folding;
  evaluation of the would-be tree including reconcile; break-glass and a
  digest for pin upgrades; the npm registry tarball with `dist.integrity`;
  recorded-only local signatures; the host contract and "CI enforces zones
  only"; an allowlist for single-line text; structural acceptance criteria;
  residuals for symlinks, `.gitattributes`, dangling `allow`, merge
  resolutions and version skew. Cut: local signature verification, the
  `brief`/`status` line (follow-up), wall-clock thresholds; the hook moved to
  its own story.
- A ninth critic pass is due before acceptance.

---

*Last updated: 2026-11-17*
