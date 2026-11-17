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
code_refs: ["scripts/commit.mjs", "scripts/doctor.mjs", "scripts/lib-frontmatter.mjs", "scripts/lib.mjs", "scripts/story-section.mjs", "scripts/sessions.mjs", "scripts/reconcile.mjs", "scripts/team-legacy.mjs", "scripts/team-integration.mjs", "bin/cli/artifacts.mjs", "bin/cli/core.mjs", "agents/reviewer.md", "docs/cli-reference.md", ".github/workflows/ci.yml", ".github/workflows/release.yml", "scripts/scope.mjs (planned)", "scripts/lib-controls.mjs (planned)", "scripts/hooks.mjs (planned)", "tests/scope.test.mjs (planned)", ".github/workflows/scope-audit.yml (planned)"]
related: "ADR-0001 (harness-agnostic core), ADR-0006 (commit protocol; amended here), ADR-0007 (presence and leases), ADR-0008 (token budget), ADR-0009 (artifact integrity), ADR-0010 (coordination follows the repository), ADR-0011 (guards), solo-entry ADR (task trailer), rule-compliance ADR (proposed; shared hook host)"
protect: [{"paths": [".github"], "allow": [], "why": "the audit definition and CI change only with the owner's approval"}]
guards: []
---

# A story's scope and protected zones: a reminder at every entry, a refusal at commit

| Field | Value |
|---|---|
| **Status** | proposed — revised twelve times (2026-11-07 … 2026-11-17) after fresh-context critic passes |
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

Twelve critic passes found ways for the agent to grant itself permission —
tags, a `grants` key, the story it names, the binding, a `type:` change, an
owners file, a reconfigurable verifier, a launderable history walk, the
owner's forge credentials, "update branch" merges, recombining automatic
merges, a basis tied to a path, a replayable signature, a tag named like the
default branch, Unicode variants a filesystem merges, glob metacharacters,
trailers typed into a message, and renames a porcelain log hides — and showed
that replacing `git commit` breaks users who never use zones. The premise:
**nothing evaluated in the agent's environment, and nothing the agent's
credentials can reconfigure, stops a determined agent;** **per-commit
attribution through merges cannot be made sound;** so the rule judges the net
result, requires every ordinary commit touching a zone path to carry an
allowed story, and pins every approval to a point on the base's first-parent
line after which the path has not moved. Locally the rule catches drift.
Intent is closed only by a required check on the protected default branch,
run from a definition the agent cannot change, under preconditions the owner
keeps. A repository without zones keeps today's behaviour except one
harmless parser change (§6).

Constraints: ADR-0001 — no harness hook may be required (an optional git hook
is not a harness hook). ADR-0008 — this ADR adds nothing to the routing block
or the standing context. A vault written by this release must not turn an
older release's `doctor` red. `parseFrontmatter` is line-based.

## Decision

### 1. Threat model

| Threat | Local (agent's machine) | Required check on the protected branch (§3) |
|---|---|---|
| Drift through `waypost commit` | Refused for every zone path the commit touches without a basis | Refused |
| Drift through plain git | Refused where the optional hook (§5) is installed; otherwise not stopped | Refused |
| Intent: an approval, a fence loosened, typed trailers | Possible through plain git with hand-typed trailers; recorded; `waypost commit` refuses `Waypost-*` trailers in a message | Refused unless an owner-signed commit pins the exact change (§3) |
| Intent: naming a story that `allow` lists | Accepted, recorded | Accepted, recorded — residual |
| The agent runs in the owner's environment (owner's `gh` token, credential helper, `ssh-agent` with the signing key) | — | **The right-hand column does not apply** |

**Preconditions for the right-hand column** (a checklist in the docs; nothing
proves them):

1. The agent runs as a separate OS user or in a sandbox, without the owner's
   forge credentials or signing key, and pushes with a fine-grained token
   without admin, secrets, workflows, checks, statuses, actions or bypass
   rights. A ruleset forbids the agent creating tags.
2. The owner key is protected (a hardware key with touch, or a passphrase not
   cached where the agent runs), and the owner signs from a clone of their
   own, with their own git configuration and Waypost install.
3. The protected branch is the default branch, requires the audit check
   (source: GitHub Actions) with no bypass, requires branches to be up to
   date, and allows merge commits or squash only. No merge queue.
4. Every workflow that runs on refs the agent can push has read-only
   `permissions:`, and the repository's default token permission is read.
5. The Actions event policy allows `pull_request_target` for the audit
   workflow file (blocked by default in public repositories from 2026-12-02).
6. Open question 2 is answered on a throwaway repository before this column
   is claimed for a project.

### 2. A protected zone

```yaml
protect: [{"paths": ["src/auth"], "allow": ["WP-12", "WP-30/story-rotate-tokens"], "why": "auth was settled here"}]
```

- A top-level frontmatter key of an ADR (an unknown guard kind is an `issue`
  in today's `doctor`; an unknown key is ignored). `paths` — **literal path
  prefixes** relative to the repository root: a path is in the zone when,
  after folding, it equals an entry or starts with the entry followed by `/`.
  `allow` — epics or stories (`<epic>/<stem>`) of the ADR's vault; may be
  empty. `why` — ≤ 160 characters, single-line text (§4); printed only as
  quoted data. This ADR itself carries `protect` over `.github` with an empty
  `allow`.
- **Folding**, applied to entries and paths alike: map Georgian Asomtavruli
  (U+10A0–10C5, 10C7, 10CD) and Nuskhuri (U+2D00–2D25, 2D27, 2D2D) to
  Mkhedruli, as HFS+ does; remove the code points HFS+ ignores (U+200C–200F,
  U+202A–202E, U+206A–206F, U+FEFF); NFD; map each code point through
  `toLowerCase()`, `toUpperCase()`, `toLowerCase()`; NFD again. It is
  idempotent, never creates or removes `/`, and joins every pair APFS, exFAT
  (NTFS's up-case table) and HFS+ treat as one name in a probe of 8 588 code
  points and the multi-code-point forms (`ss`, `i̇`, `ff`, `st`, Hangul
  jamo); it joins some pairs they keep apart (`ı` and `i`) — over-refusal,
  never under.
- **Candidates**: files whose path is `adr/<name>.md` or ends in
  `/adr/<name>.md` (a vault may sit at the repository root), found with `git
  ls-tree -r -z --name-only <rev>` and a filter in Waypost, whose frontmatter
  holds a `protect` key. The ADR's vault is the directory above `adr/`;
  `allow` stories and exempt paths resolve against the vaults of the
  **base**, never through the binding or `WAYPOST_VAULT`. Unborn `HEAD`: no
  zones. Discovery is cached by the base's tree id; a commit's own candidates
  come from `diff(b, c)`.
- **The strict reader** (in `scope.mjs`, not `parseFrontmatter`) fails on:
  opening or closing `---` that is not a whole line; a duplicate frontmatter
  key; a duplicate key inside the `protect` JSON; `protect` not a JSON list of
  objects; `paths` not a non-empty list of strings; an entry empty, absolute,
  with a `.` or `..` segment, or containing `*`, `?` or `[`; `allow` not a list
  of strings; a `type` missing or other than `adr` (case-insensitive, quoted
  or not). BOM and CRLF read the same. A missing or too-long `why` is a
  `doctor` issue, not a reader failure.
- **Active** while the normalised `status` is `accepted`; any other value is
  inactive; `proposed` reports "would refuse" as `info`.
- **Fail-closed**: a candidate the reader cannot read is an `accepted` zone
  over every path, unless a raw scan of its frontmatter finds a `status:`
  line with another value; adding such a candidate is refused; repairing one
  is a loosening.
- **Tightening vs loosening**, syntactic and conservative. A change to a
  candidate is *tightening* when the reader succeeds on both versions, the
  status is not lowered (`accepted` → anything lowers it), and for every old
  zone the new file has a zone whose `paths` include each old entry and whose
  `allow` is a subset of the old one. A new candidate, and a `why` change
  alone, are tightening. Everything else — deletion, a move out of `adr/`, a
  reader failure — is *loosening*, a **fence crossing**.
- **Overlapping zones**: a path inside several active zones needs the `allow`
  of each; zones of two vaults over one path cannot both be satisfied by one
  story unless both `allow` it, otherwise only an approval passes.
- **Exempt paths**: the kanban, graph and code map of the base's vaults, by
  the names their layout gives them (`scripts/reconcile.mjs`). Index READMEs
  carry human prose and are not exempt.
- **Which story counts for `allow`**: exactly one `Waypost-Story` on the
  commit (none or several: no story). With zones, `waypost commit` writes it
  from `--story`, else from the session's live claim, also beside `--task`
  (amends ADR-0006); a claim-derived story is not checked for foreign claims
  (only `--story` is, as today), and a refusal for a missing story names
  `--story`. It must exist under the ADR's vault in the base and not be
  `done` there. A story created in the same range lands first; a story
  closed on the base before its branch lands no longer counts.
- **Loosening lands first**: zones and `allow` come from the base. A loosened
  `allow` in the same range grants nothing; a crossing in that range needs
  the base's `allow` or an owner approval of its own.
- **A vault in another repository, or outside git**, has no candidates in the
  code repository's tree; its zones do not apply there. `doctor` says so.

### 3. The rule, and the required check

**The rule** (one function in `scripts/scope.mjs`). Git runs with
`GIT_NO_REPLACE_OBJECTS=1` and `GIT_LITERAL_PATHSPECS=1` (only for the rule's
own calls), full ref names and full object ids, and plumbing only: `git
rev-list --parents` and `git diff-tree -r -z --no-renames --name-only
--stdin` over (commit, first parent) pairs, a root commit against the empty
tree — no porcelain log, so user configuration (`log.showSignature`,
`core.quotePath`, rename detection) cannot change the result. Given a base
`b`, a head `h` and the zones of `b`, paths are compared as `(mode, object
id)` from `git ls-tree`; an absent path equals only an absent path. For each
path `p` in `diff(b, h)` with `--no-renames` (deletions and both sides of a
rename count) that lies in an active zone, one holds:

- (i) every non-merge commit in `b..h` whose diff against its first parent
  (renames as delete plus add) touches `p` carries a story in the `allow` of
  every zone over `p`, and at least one such commit exists. A commit
  discarded by a merge (`-s ours`) still counts — conservative; or
- (ii) a commit `A` in `b..h` carries `Waypost-Scope-Approval` and
  `Waypost-Scope-Base: <X>`, where `X` is a full object id on the first-parent
  line of `b` (`rev-list --first-parent b` contains it), `p` lies in an
  active zone of `X`, no first-parent step in `X..b` changed `p` (each step
  diffed against its first parent), and `h:p == A:p`; in the required check
  `A` is also owner-signed.

For each candidate `F` whose change `b:F → h:F` is a loosening, an
owner-signed **fence commit** `L` in `b..h` — changing only `<vault>/adr/*.md`
and exempt paths, carrying `Waypost-Scope-Fence` and `Waypost-Scope-Base: <X>`
with `X` on the first-parent line of `b` and no first-parent step in `X..b`
changing `F` — has `h:F` equal to `L:F` or tightening it. An approval never
covers a fence. Tightening needs nothing.

Merge commits are not judged one by one; recombinations and `-s ours`
reverts leave `p` in the net change and need (i) or (ii). A merge resolution
on a branch whose commits on `p` are allowed is not attributed (bounded: at
least one allowed commit on `p` must exist, so an empty `allow` admits none).
A branch merged into the base after an approval does not void it unless the
base's first-parent step changed `p`.

Cost: one `rev-list` and one `diff-tree --stdin` over `b..h`, and per distinct
`X` one over the first-parent steps of `X..b` — not one call per path.

**Owner approval of an agent's change** is one signed commit on top of the
pull request, made from the owner's own clone without touching its working
tree: `waypost commit --approve --base <b> <h>` runs `git -c safe.directory=
-c gpg.format=ssh -c gpg.ssh.program=ssh-keygen commit-tree <h>^{tree} -p <h>
-S` with `Waypost-Scope-Approval` and `Waypost-Scope-Base: <b>`, prints the
diff `b:p → h:p` for every zone path the range changes, and prints the `git
push` that adds it to the pull request's branch (a plain push fails if the
branch moved). `safe.directory=` refuses a repository owned by another user.
Approvals cover zone paths only. Any later edit of `p` voids (ii), so an
approval lands before further work on the path, or is repeated. Closing a
pull request does not revoke an approval; it lapses when the base's
first-parent line changes `p`, or by rotating the key.

**The required check.** `B` is the tip of the protected branch. If `B` is not
an ancestor of the pull request's head, the audit exits 2 ("update the
branch"); otherwise it runs the rule with `b = B`, `h` = the head, and the
zones of `B`.

- **Trust by induction.** `B` is trusted because everything that reached it
  passed the check.
- **The trusted definition**, `.github/workflows/scope-audit.yml`:
  - `pull_request_target` only; no `if:`, `paths:`, `continue-on-error`; one
    job with a unique name; `permissions: contents: read`;
  - no `actions/checkout`: in an empty directory, `git init`, then `git fetch
    --no-tags origin +refs/heads/<default>:refs/remotes/origin/<default>
    <pull_request.head.sha>` (never `pull_request.base.*`, never a short ref
    name, which git resolves to a tag of the same name first), full history,
    authenticating with the read-only `GITHUB_TOKEN` through `http.extraheader`
    in private repositories;
  - Waypost from `https://registry.npmjs.org/waypost/-/waypost-<version>.tgz`,
    checked against its `dist.integrity` (`sha512-…`) written in the file,
    unpacked into `$RUNNER_TEMP`, run with the runner's `node` after a
    `node ≥ 20` check — no npm, no project `.npmrc`; the pull request's tree
    is read as git objects, never executed;
  - the owner keys are SSH public keys written in the file as an
    `allowed_signers` text; a missing, empty or unreadable list exits 2, as
    does `GITHUB_ACTIONS=true` without `--keys`;
  - signatures verify with `git -c gpg.format=ssh -c
    gpg.ssh.allowedSignersFile=<keys> -c gpg.ssh.program=ssh-keygen
    verify-commit`; only `G` counts; GPG and X.509 never do.
- **The definition protects itself**: `.github` lies in this ADR's zone with
  an empty `allow`; changing the audit, including its pinned version, needs
  an owner approval. Before approving a pin upgrade, the owner reads `git
  diff <old>..<new> -- bin scripts package.json` of Waypost: the audit runs
  that code. Release tags are protected (`release.yml` publishes on tags).
- **Adoption.** The pull request that adds `scope-audit.yml` and read-only
  `permissions:` to `ci.yml` lands before this ADR becomes `accepted` (after
  that, `.github` is a zone); it is not checked, and the check can be made
  required only after its first run. The starting `B` is recorded in an ops
  note.
- **Break-glass.** When the audit cannot run, the owner suspends the
  requirement, records `B` and the reason in an ops note, runs `scope audit
  --range <recorded B>..<B>` for information, and re-enables it; induction
  restarts from `B` by the owner's decision, and the note says so.

### 4. Trailers, signing, text

- **One trailer parser.** Waypost reads trailers with `git -c
  trailer.separators=: interpret-trailers --parse --no-divider` on a message
  and `git -c trailer.separators=: log --format=%(trailers:key=…,valueonly,unfold)`
  on a commit — the rule, the audit and `waypost log` alike.
- **With zones**, `waypost commit` passes the author's message through that
  parser and refuses it if any trailer key starts with `Waypost-` (any case):
  Waypost writes those trailers, the author does not.
- **There is no local override.** A zone path without a story basis needs an
  owner approval (`--approve`), which locally is checked on content but not
  on signature, and in CI only counts signed.
- `waypost commit --sign --base <b>` (owner, fence commits): stages nothing;
  refuses on an unborn `HEAD` and during a merge, cherry-pick or rebase;
  prints **every** changed path of the index against `HEAD` and the diff of
  each candidate; requires every path to be a fence-commit path; signs the
  index's tree with `git -c safe.directory= -c gpg.format=ssh -c
  gpg.ssh.program=ssh-keygen commit-tree -S` with `Waypost-Scope-Fence` and
  `Waypost-Scope-Base: <b>`; moves the branch with `git update-ref -m
  "waypost: signed fence commit" HEAD <new> <old>`; on a detached `HEAD` it
  prints the push to `refs/heads/<branch>` instead.
- **Superseding a fenced ADR** is one fence commit: the old ADR's `status`
  changes, the successor is added, with `adr/README.md`.
- `scripts/lib-controls.mjs` holds the single-line text set: an allowlist of
  Unicode letters, marks except variation selectors, numbers, punctuation,
  symbols and the space. `why` outside it is a `doctor` issue; ADR ids, paths
  and `why` are escaped when printed.

### 5. Entry points

| Point | What happens |
|---|---|
| Repositories without zones | When neither the base nor the commit holds a candidate, `waypost commit` and `waypost merge` behave as today: no story from the claim, no trailer refusal, no evaluation. `doctor`'s existing collision check is unchanged; the fold is used only by the zone checks. A candidate blob missing locally (a partial clone offline) is a warning; CI decides |
| Local base | For an evaluated commit `c`: the remote default refs are, for every remote, each existing `refs/remotes/<r>/<n>` with `<n>` the target of `refs/remotes/<r>/HEAD`, `main` or `master`. The bases are the maximal ones (`git merge-base --independent`) among `merge-base --all c R`. Zones are the union of the zones of every base. The rule passes if it passes against any base under those zones. Without such a ref or base (no remote, a shallow clone), `b = c^1` with the zones of `c^1`. A refusal names the base |
| Local verdict | `waypost commit` refuses every zone path in `diff(c^1, c)` without a basis in `c`; zone paths without a basis that `c` does not touch are printed as warnings. CI judges the whole range |
| `waypost commit` with zones | As today, reconcile writes the views; they are staged with `--all`, `--tracked` or when named. Then the rule runs on `git write-tree` with the pending trailers and `MERGE_HEAD` (through `git rev-parse --git-path`); a refusal exits 4 before `git commit` and prints `git restore --staged <zone paths>` for what it staged. Then the usual `git commit -F -` — every hook, `commit.gpgSign`, merge state and reflog behave as in git; the team gate wraps it as today. Afterwards `HEAD^{tree}`, the parents and the parsed `Waypost-*` trailers are compared with what was evaluated; if anything differs, the rule runs again on the commit, and a refusal then exits 4 with the commit's id and leaves the commit in place (locally nothing is trusted; CI refuses it). `--dry-run` evaluates and prints. The refusal names the ADR, its quoted `why`, its `allow`, the commits without a basis, the base, and the ways out: restore `p` to the base's content, rebase the commits away, or ask the owner to approve |
| `waypost merge` with zones | `git merge --no-commit` brings the merged artifacts onto disk first; then as `waypost commit`; a refusal leaves the merge in progress and names `git merge --abort`. Forwards `--story` and `--task` |
| `waypost scope check [--story <s>] <path…>` | Before editing: per path `ok`, `allowed`, `outside (story scope)`, `protected (ADR id, why)`, `protected (fence, ADR id)`. Exit 0 all ok/allowed, 3 some outside and none protected, 4 some protected, 2 usage error |
| `waypost scope audit --range <b>..<h> [--keys <file>]` | The rule as the required check runs it. Exit 4 on a missing basis or an unreadable candidate; 2 on an unknown range, a base that is not an ancestor of the head, or missing keys in CI |
| `doctor` | Validates fences and scopes, `allow` entries resolving to nothing (a dangling entry admits whoever creates it), a missing or too-long `why`, a zone selecting no tracked file (`warn`), a zone entry inside a submodule, a bound vault whose zones cannot apply, a folded collision under a zone entry among tracked files. No history walk, no graph edge |
| `waypost-reviewer` | Receives the story's scope and the zones its diff touched |
| CI | Enforces zones only. Refusing untrailered commits is the rule-compliance ADR's matter, not this audit's |
| Team publications | `publishCandidate` writes `refs/waypost/teams/…` with `commit-tree`; it is not checked. The owner's merge of it is a pull request judged by the required check |

**The optional hook** is its own story, after the rule, `commit` and the
required check. `waypost hooks install` writes one `reference-transaction`
host at `git rev-parse --git-path hooks`, refusing when that path is inside
the working tree. Host contract: checks registered in `scripts/hooks.mjs` in
a fixed order; each runs independently and fails open with one line if it
cannot start; the first refusal aborts the transaction. This ADR registers
`scope`: in the `prepared` state, for each line updating `refs/heads/*` or
`HEAD` (skipping `ref:` lines and deletions), a `sh` prefilter skips the line
when `git rev-list <new> --not --all` is empty; otherwise it runs the rule on
each new commit with the local base and the local verdict. Never installed by
`setup` or `brief`. Not covered: a push from a ref outside `refs/heads`,
`branch -m`, a removed hook, fast-forwards to fetched commits. Latency: one
`node` start per non-skipped transaction.

### 6. A story's scope and parsing

```yaml
scope: {"touches": ["src/billing", "tests/billing"], "why": "invoice export only"}
```

- Optional; written with `waypost story scope add <story> --touches <p>
  [--touches <q>…] --why "<text>"`: a preview, then `--write`. `touches` are
  literal path prefixes with the same shape rules as zone `paths`.
- Read from the index; widening in the same commit is itself the record. The
  story file and exempt paths are always in scope.
- Outside scope prints the paths and the `story scope add` command; it never
  refuses (Follow-up). No story: scope does not apply; zones always do.
- `parseFrontmatter`: for a value beginning with `{` or `[`, find the matching
  bracket honouring JSON strings; if only `\s#…` follows it, drop that
  comment; anything else as today. This applies to every repository; it only
  keeps a `#` inside a JSON string from being cut. Block-form `scope:` gets
  the finding block-form `guards:` has.

## Rationale

1. **Judge what lands, and every ordinary commit that touched it**, read with
   plumbing so renames and user configuration cannot hide a touch; pin
   approvals to the base's first-parent line, so unrelated merges do not
   void them and a later change to the path does.
2. **Bases from every remote default, maximal only, with the union of their
   zones; a local verdict on the paths a commit touches**, so honest pulls,
   merges and checkouts pass and drift on a path is refused every time it is
   touched.
3. **`git commit` stays `git commit`**; repositories without zones see no
   change beyond a parser fix.
4. **Literal prefixes and an idempotent fold** that joins whatever a
   filesystem joins.
5. **Intent is stopped only where it can be**, under written preconditions;
   there is no local override, only owner approvals that CI checks signed.
6. **Tightening is free, loosening is signed and lands first.**

## Alternatives Considered

### A porcelain `git log` walk
Revision 11. Missed a later unallowed `git mv` of an allowed path, printed
quoted paths, followed `log.showSignature`, and with `--diff-merges=separate`
voided approvals after unrelated merges. Replaced by `rev-list` plus
`diff-tree --no-renames -z` over first parents, and a first-parent line for
`X..b`.

### A local `--override-scope` behind the owner gate
Revisions 8–11. CI never accepted it unsigned; the owner already has
`--approve`. Removed with its gate.

### Unpushed tightenings in the local zones
Revisions 9–11. Undefined per commit or net, and could be implemented to
let a loosen-then-tighten sequence net-loosen. Removed: local zones are the
union of the bases' zones.

### Earlier revisions
A temporary-index `git commit`, globs in zone paths, NFC before case mapping,
fence approvals through `--approve` (rev 10); `commit-tree` for every commit,
NFC → upper → lower folding, rejecting a branch for one old commit,
`merge-base(B, head)` in CI (rev 9); signed bases checked only against `b:p`
and `h:p`, short-name fetches, `toLowerCase` folding, a single merge base, a
break-glass that resumed from a green range (rev 8); per-commit `merge-tree`
inheritance (rev 6); "total change" with a base-side basis (rev 5);
first-parent fence state, an in-tree owners file, keys in a CI secret (revs
3–4); `prepare-commit-msg`, pre-commit, post-check undo, push post-audit,
`scope preflight`, a `brief` line; narrowing the ADR, permission in the
story, tags, the claim alone, team publication checks, `forbid` guards, a
`protect` guard kind, `code_refs` as zone, auto-leases, a required harness
hook, a model per commit — rejected for the reasons recorded in their
revisions.

## Consequences

**Positive**:
- A wandering agent is refused at `waypost commit` on every touch of a zone
  path without a basis, and by the required check; where the hook is
  installed, at any local commit.
- Under the preconditions, a zone cannot be opened, lifted or crossed
  without a story it allows or an owner signature over the exact change, and
  the owner approves an agent's pull request with one signed commit.
- Repositories without zones are untouched.

**Negative / residual**:
- **Named story.** An agent may name or claim a story that `allow` lists; a
  `done` story can be reopened; an epic in `allow` admits later stories; a
  dangling `allow` entry admits whoever creates it.
- **Merge resolutions** on an allowed branch are not attributed.
- **Approvals persist** until the base's first-parent line changes the path
  or the key rotates; closing a pull request does not revoke them; any later
  edit of the path voids them.
- **Discarded commits count**: a commit dropped by `-s ours` still needs a
  basis in CI.
- **Story lands first; a closed story stops counting.**
- **Diverged remotes**: with two remotes whose defaults differ, the union of
  zones keeps the stricter one until they are synchronised.
- **A hook that changes the tree** after evaluation can leave a refused
  commit in place locally; CI refuses it.
- **Fork pull requests** without "allow edits by maintainers" cannot take the
  owner's approval commit; the owner pushes the branch to the base repository
  or asks the contributor to.
- **Team publications** are unchecked until the owner's merge reaches CI.
- **Preconditions**: if the agent runs in the owner's environment, with
  broader forge rights, or can push tags, protection against intent is gone.
- **Paths, not behaviour**: code outside a zone, symlinks into or out of a
  zone, any `.gitattributes` above a zone path or in `.git/info/attributes`,
  and Windows 8.3 aliases can change what the zone's code does.
- **The audit runs Waypost's own code** from the pinned version; an approved
  pin upgrade trusts everything merged into Waypost since the last pin.
- **Folding over-refuses** where it joins names a filesystem keeps apart;
  case mappings follow the Unicode version of the runner's `node` (CI
  decides).
- **Free tightening**: a broad new `accepted` zone blocks others until the
  owner loosens it; a `why` change is free and reaches every refusal, printed
  as quoted data.
- **Fail-closed** on a corrupted accepted candidate blocks the repository
  until a signed fence commit repairs it.
- **Version skew**: the local reader and the pinned CI version may disagree;
  CI decides.
- **Adoption** and **break-glass** leave unchecked spans by the owner's
  decision.
- **Locally**, without the hook, plain git is caught only by the required
  check; without branch protection, not at all.
- **GitHub behaviour is partly unverified** (open question 2).
- A committed fixture under `adr/` with `protect` is a live zone.

**What changes in code / process**:
- New `lib-controls.mjs`, `scope.mjs` (fold, prefix match, strict reader,
  rule, `scope check`, `scope audit`); later `hooks.mjs`.
- `commit.mjs`: with zones only — evaluation on `write-tree` before `git
  commit`, a tree, parent and trailer check after it, `--git-path` merge
  state, one trailer parser and refusal of typed `Waypost-*` trailers,
  `--sign` and `--approve` through `commit-tree -S`, `Waypost-Story` from the
  claim; `merge` forwards flags and names `git merge --abort` on refusal.
- `story-section.mjs`, `bin/cli/artifacts.mjs`, `bin/cli/core.mjs`: `story
  scope add`.
- `lib-frontmatter.mjs`: bracket-aware comment cut.
- `agents/reviewer.md`, `docs/cli-reference.md` (preconditions checklist,
  GitHub recipe, adoption, break-glass, approval, pin-upgrade review).
- This repository: `scope-audit.yml`; read-only `permissions:` and
  `fetch-depth: 0` in `ci.yml`; protected release tags; a tag ruleset — all
  before acceptance, then this ADR's `protect` over `.github` takes effect.
- ADR-0006 gains "Amended by" on acceptance.

## Open questions for the owner

1. Release order: the rule, `commit` and `scope check`; then the required
   check after question 2; then the hook?
2. Verify on a throwaway repository: the Actions event policy for a
   personal-account repository; that a `pull_request_target` check run
   attaches to the pull request's head SHA; that a same-named job in a fork's
   own approved workflow, or a check run created through the API by any
   workflow, cannot satisfy the requirement under precondition 4; whether a
   fine-grained token can push a tag named like the default branch. GitHub
   documents that a skipped run counts as success (hence no `if:`) and that
   `pull_request_target` is usable for required checks.
3. The rule-compliance ADR (uncommitted, proposed) relies on "the optional
   hook and CI of the scope ADR" to refuse untrailered commits and refers to
   an open question about the routing block that no longer exists here. This
   ADR states that CI enforces zones only; that ADR's text should drop "and
   CI" and the stale reference before either is accepted.

## Acceptance

Automated, in `tests/scope.test.mjs`, each with its expected outcome:

- **No zones**: a repository without candidates — `waypost commit` and
  `waypost merge` produce the same commits, trailers, hooks and index as
  before; `doctor`'s existing collision findings unchanged.
- **Zones**: inside, outside, protected, allowed (epic, story); overlapping
  zones need both; zones of two vaults over one path; prefix at a segment
  boundary (`src/auth` covers `src/auth/x`, not `src/authx`); a vault at the
  repository root (`adr/x.md`) is a candidate; exempt paths from the base's
  vaults, and a new candidate in the range exempts nothing; index README
  prose under a zone — refused; a `protect:` example in a body — not a
  candidate; a zone inside a submodule — `doctor` warns.
- **Reader**: missing `type`, duplicate key in the `protect` JSON, an entry
  with `*`, `?`, `[`, `..` or a leading `/` — fail; a missing `why` — a
  `doctor` issue, the zone still active; a corrupted candidate whose raw
  `status:` says `proposed` — inactive.
- **Fold**: under `src/access`, `src/acceẞ/a` — in; under `src`, `ſrc/a` — in;
  under `src/kit`, `src/Kit/a` — in; under `src/świat`, `src/ſ́wiat/a` —
  in; an Asomtavruli and a Mkhedruli spelling — one name; NFC and NFD forms
  — in; `cafe‌́` and `café` — one name; idempotent on every code point and
  on random strings. A probe creating `x<c>y` for the 8 588-code-point set on
  an APFS volume and an HFS+ image finds no pair the filesystem joins that
  the fold keeps apart (run in the hook story's CI on macOS, documented
  otherwise).
- **Story**: exactly one trailer; none or two — no story; absent or `done` in
  the base — ignored; created in the same range — refused; landed first —
  accepted; closed on the base before the branch lands — refused; a missing
  claim — the refusal names `--story`.
- **Classification**: tightening — `proposed` → `accepted`, a path added, an
  `allow` entry removed, `why` changed, zones reordered; loosening — a path
  entry changed, a zone split, a path moved to another ADR, an `allow` entry
  added, `accepted` → `superseded`, deletion, a move out of `adr/`, a `type`
  change, a duplicate key, a block-form or empty `protect:`.
- **Rule (i)**: an allowed commit then an unallowed rewrite — refused; an
  allowed change, its revert, an unallowed rewrite — refused; an allowed edit
  of `p`, then an unallowed `git mv p` out of the zone — refused; a merge
  with an allowed story over an unallowed branch — refused; a root commit —
  against the empty tree; a commit discarded by `-s ours` — counted; paths
  with non-ASCII names and `log.showSignature=true` set — same verdict.
- **Rule against merges**: `-s ours` revert — refused; recombination —
  refused; "update branch" twice — no spurious refusal; a loosened `allow`
  and a crossing relying on it in one range — refused.
- **Approvals**: an owner approval on top of an agent's pull request —
  accepted; a further allowed edit of the approved path — refused until
  approved again; after a rebase update without re-approval — refused;
  squash, owner revert on the base, then the old branch with its approval —
  refused; an owner-approved evil merge on the base changing `p` only in the
  merge — the old approval refused; an unrelated branch merged into the base
  after the approval, `p` unchanged on the first-parent line — still
  accepted; an abandoned pull request's approval with `p` unchanged —
  accepted (residual); `X` off the first-parent line, unresolvable, or with
  `p` outside a zone at `X` — refused; a mode-only change compared by mode;
  an absent path equals only absent; a fence commit with a non-fence path —
  refused; a supersede — accepted; GPG, a repository-local
  `gpg.ssh.program`, `refs/replace` — ignored; an approval covering a fence —
  refused; `--approve` in a repository owned by another user — refused (via
  `GIT_TEST_ASSUME_DIFFERENT_OWNER=1`).
- **`--sign`**: unborn `HEAD` — refused; detached `HEAD` — prints the push.
- **Fetch**: a remote with a tag `main` beside the branch `main` — the audit
  uses the branch. A head without `B` as ancestor — exit 2.
- **Local base**: after a loosening and a crossing land on the remote, `git
  pull`, `waypost merge origin/main`, `git switch -c x origin/x` — pass; a
  criss-cross with two merge bases — the same verdict whatever the commit
  dates; a stale `origin/HEAD` after a `master` → `main` rename — `main` is
  tried too; a stale fork remote without zones beside an up-to-date one — the
  zones still apply; no remote — `c^1..c` with the zones of `c^1`.
- **Local verdict**: a second unallowed edit of a path already without a
  basis — refused; an unrelated commit after it — passes with a warning.
- **`commit` with zones**: a `-m` with a `Waypost-Scope-Approval` trailer,
  also after a `---` paragraph — refused; a refusal before `git commit` — no
  commit, the `git restore --staged` hint printed; `pre-commit`,
  `prepare-commit-msg`, `commit-msg`, `post-commit` and configured
  `hook.<name>.*` hooks each run once; a pre-commit hook that adds a zone
  file — the commit stays, exit 4 with its id; a post-commit hook that
  amends — detected by the parent check; `commit.gpgSign` — the commit is
  signed; merge state cleared after a merge commit; `--all` with
  `GIT_LITERAL_PATHSPECS` unset for staging.
- **`merge`**: a refusal leaves the merge in progress and names `git merge
  --abort`.
- **Audit**: range required; `GITHUB_ACTIONS=true` without `--keys` — exit 2;
  empty keys — exit 2; an unreadable candidate — exit 4.
- **Text**: `why` with C0/C1, bidi, tag characters or variation selectors — a
  `doctor` issue; printed ids, paths and `why` — escaped.
- **Parser**: `#` inside `why`; `tags: [a, b] # note`; `title: [WIP] x`.
- **CLI**: `scope check` exit codes 0/2/3/4; `--touches a b` reports `b` as an
  error.
- **Scale**: the number of git processes grows with the number of remotes
  and distinct approval bases, not with the number of zone paths or commits.
- **Compatibility**: the previous release, checked out with `git worktree add`
  at its tag (`fetch-depth: 0`), runs its `doctor` on a fixture vault with
  `protect` and `scope` built in a temporary directory — no issue,
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
owner-signed fence commit — green, mergeable with the button; a pull request
crossing the opened zone — green; an agent's pull request approved by one
signed owner commit — green; a pull request editing the audit workflow —
red; the agent pushing a tag `main` — refused by the ruleset, and the audit
still uses the branch; break-glass with its ops note.

## Follow-ups

- **Whether "outside scope" should refuse** — at least 20 closed stories,
  `touches` derived blind from the story text, owner-labelled warnings;
  refuse only if ≥ 80 % are drift and warnings occur in ≤ 20 % of stories.
- **A `brief`/`status` line** for the claimed story's scope and zones, within
  the existing budgets.
- **A reader-equivalence digest** for pin upgrades.
- **`team-integration.mjs`'s content set** gains tag characters.

## Verification

- Critic passes 1–10 (2026-11-07 … 2026-11-17): *revise* each; the owner
  chose `allow` in the ADR and to close every gap.
- Critic pass 11 (2026-11-17, on 8cbde34): *revise* — the temporary-index
  commit, local drift accumulation, a stale fork remote, the fold on strings
  and globs, merge-only changes in `X..b`, fence approvals via `--approve`.
- Critic pass 12 (2026-11-17, on 9395996): *revise*, no blockers — the
  porcelain walk missed a later unallowed `git mv` of an allowed path, quoted
  non-ASCII paths and followed `log.showSignature` (reproduced);
  `--diff-merges=separate` voided approvals after unrelated merges
  (reproduced); the fold missed HFS+'s Georgian pairs (reproduced on an
  HFS+ image); a vault at the repository root had no candidates; a `---`
  paragraph hid typed trailers from the refusal while `interpret-trailers`
  read them (reproduced); "no change without zones" overstated; unpushed
  tightenings undefined; the staged-views text; the post-commit check
  ignored parents; `--sign` on unborn and detached `HEAD`. Folded in:
  plumbing over first parents with `--no-renames -z`, a first-parent line
  for `X..b`, the Georgian pre-map, root-vault candidates, one trailer
  parser, a precise "without zones", the `git restore --staged` hint, a
  parent check, `--sign` edge cases, reader-versus-`doctor` errors,
  fail-closed only without a readable non-accepted status, the pin-upgrade
  review, wider `.gitattributes` and diverged-remote residuals. Cut: the
  local `--override-scope` and its owner gate, unpushed tightenings,
  `Waypost-Signed`, the explicit `X:p == b:p` (implied by the first-parent
  walk).
- A thirteenth critic pass is due before acceptance.

---

*Last updated: 2026-11-17*
