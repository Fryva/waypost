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
code_refs: ["scripts/commit.mjs", "scripts/doctor.mjs", "scripts/lib-frontmatter.mjs", "scripts/lib.mjs", "scripts/story-section.mjs", "scripts/sessions.mjs", "scripts/reconcile.mjs", "scripts/cleanup-limit.mjs", "scripts/agents-detection.mjs", "bin/cli/artifacts.mjs", "bin/cli/core.mjs", "agents/reviewer.md", "docs/cli-reference.md", ".github/workflows/ci.yml", ".github/workflows/release.yml", "scripts/scope.mjs (planned)", "scripts/lib-glob.mjs (planned)", "scripts/lib-controls.mjs (planned)", "scripts/hooks.mjs (planned)", "tests/scope.test.mjs (planned)", ".github/workflows/scope-audit.yml (planned)"]
related: "ADR-0001 (harness-agnostic core), ADR-0006 (commit protocol; amended here), ADR-0007 (presence and leases), ADR-0008 (token budget), ADR-0009 (artifact integrity), ADR-0010 (coordination follows the repository), ADR-0011 (guards), solo-entry ADR (task trailer), rule-compliance ADR (proposed; owner gate, shared hook host)"
protect: [{"paths": [".github"], "allow": [], "why": "the audit definition and CI change only with the owner's approval"}]
guards: []
---

# A story's scope and protected zones: a reminder at every entry, a refusal at commit

| Field | Value |
|---|---|
| **Status** | proposed — revised ten times (2026-11-07 … 2026-11-17) after fresh-context critic passes |
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

Ten critic passes found ways for the agent to grant itself permission —
tags, a `grants` key, the story it names, the binding, a `type:` change, an
owners file, a reconfigurable verifier, a launderable history walk, the
owner's forge credentials, "update branch" merges, recombining automatic
merges, a basis tied to a path, a replayable signature, a tag named like the
default branch, Unicode variants that a filesystem merges, and trailers typed
into a commit message. The premise: **nothing evaluated in the agent's
environment, and nothing the agent's credentials can reconfigure, stops a
determined agent;** **per-commit attribution through merges cannot be made
sound;** so the rule judges the net result, requires every ordinary commit
touching a zone path to carry an allowed story, and pins every signature to
a base on which the path has not moved since. Locally the rule catches drift
— an agent that is not trying to get around it. Intent is closed only by a
required check on the protected default branch, run from a definition the
agent cannot change, under preconditions the owner keeps.

Constraints: ADR-0001 — no harness hook may be required (an optional git hook
is not a harness hook). ADR-0008 — this ADR adds nothing to the routing block
or the standing context. A vault written by this release must not turn an
older release's `doctor` red. `parseFrontmatter` is line-based.

## Decision

### 1. Threat model

| Threat | Local (agent's machine) | Required check on the protected branch (§3) |
|---|---|---|
| Drift through `waypost commit` | Refused before the commit is made | Refused |
| Drift through plain git | Refused where the optional hook (§5) is installed; otherwise not stopped | Refused |
| Intent: an override, a fence loosened, typed trailers | Possible through plain git with hand-typed trailers; recorded; `waypost commit` refuses `Waypost-*` trailers in a message | Refused unless an owner-signed commit pins the exact change (§3) |
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
  in today's `doctor`; an unknown key is ignored). `paths` — globs relative to
  the repository root (§6). `allow` — epics or stories (`<epic>/<stem>`) of
  the ADR's vault; may be empty. `why` — mandatory, ≤ 160 characters,
  single-line text (§4); printed only as quoted data. This ADR itself carries
  `protect` over `.github` with an empty `allow`.
- **Folding.** A path is in a zone when the glob matches the raw path, **or**
  the folded glob matches the folded path. The fold is: NFC; removal of the
  code points HFS+ ignores (U+200C–200F, U+202A–202E, U+206A–206F, U+FEFF);
  then `toLowerCase()`, `toUpperCase()`, `toLowerCase()`. It is idempotent and
  joins every class APFS, NTFS and HFS+ treat as one name: `src/acceẞ/a`
  (U+1E9E) and `src/access/a`; `ſrc/a` (U+017F) and `src/a`; `src/Kit`
  (Kelvin sign) and `src/kit`. `doctor`'s collision check uses the same fold.
- **Candidates**: files `**/adr/*.md` whose frontmatter holds a `protect`
  key. The ADR's vault is the directory above `adr/`; `allow` stories, exempt
  paths and the rest resolve against the vaults of the **base**, never
  through the binding or `WAYPOST_VAULT`. Unborn `HEAD`: no zones. A zone path
  inside a submodule matches nothing; `doctor` says so.
- **The strict reader**: BOM and CRLF read the same; the opening and closing
  `---` must be whole lines; a duplicate frontmatter key, a duplicate key
  inside the `protect` JSON, a block-form or empty `protect:`, or a `type`
  missing or other than `adr` (case-insensitive, quoted or not) fails.
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
- **Exempt paths**: the kanban, graph and code map of the base's vaults, by
  the names their layout gives them (`scripts/reconcile.mjs`). Index READMEs
  carry human prose and are not exempt.
- **Fail-closed**: a candidate the reader cannot read is an `accepted` zone
  over every path; adding one is refused; repairing one is a loosening.
- **Which story counts for `allow`**: exactly one `Waypost-Story` on the
  commit (none or several: no story). `waypost commit` writes it from
  `--story`, else from the session's live claim, also beside `--task` (amends
  ADR-0006). It must exist under the ADR's vault in the base and not be
  `done` there. A story created in the same range is not in the base, so it
  lands first; a story closed on the base before its branch lands no longer
  counts, so the branch lands before the close, or the owner approves it.
- **Loosening lands first**: zones and `allow` come from the base. A loosened
  `allow` in the same range grants nothing; a crossing in that range needs
  the base's `allow` or an owner approval of its own.
- **A vault in another repository, or outside git**, has no candidates in the
  code repository's tree; its zones do not apply there. `doctor` says so.

### 3. The rule, and the required check

**The rule** (one function in `scripts/scope.mjs`). Git runs with
`GIT_NO_REPLACE_OBJECTS=1` and `GIT_LITERAL_PATHSPECS=1` (only candidate
discovery uses `:(glob)`), full ref names and full object ids. Given a base
`b`, a head `h` and the zones of `b`, paths are compared as `(mode, object
id)` from `git ls-tree`; an absent path equals only an absent path. For each
path `p` in `diff(b, h)` with `--no-renames` (deletions and both sides of a
rename count) that lies in an active zone, one holds:

- (i) every non-merge commit in `rev-list --full-history b..h -- p` that
  changed `p` relative to its first parent (a root commit: relative to the
  empty tree) carries a story in the `allow` of every zone over `p`, and at
  least one such commit exists. A commit discarded by a merge (`-s ours`)
  still counts — conservative; or
- (ii) a commit `S` in `b..h` carries `Waypost-Scope-Override` and
  `Waypost-Scope-Base: <X>`, where `X` is a full object id and an ancestor of
  `b`, `p` lies in an active zone of `X`, `git log --full-history
  --format=%H X..b -- p` is empty (so `X:p == b:p`), and `h:p == S:p`; in the
  required check `S` is also owner-signed and carries `Waypost-Signed`.

For each candidate `F` whose change `b:F → h:F` is a loosening, an
owner-signed **fence commit** `L` in `b..h` — changing only `<vault>/adr/*.md`
and exempt paths, carrying `Waypost-Signed` and `Waypost-Scope-Base: <X>` with
the same conditions on `X` for `F` — has `h:F` equal to `L:F` or tightening
it. An override never covers a fence. Tightening needs nothing.

Merge commits are not judged one by one; recombinations and `-s ours`
reverts leave `p` in the net change and need (i) or (ii). A merge resolution
on a branch whose commits on `p` are allowed is not attributed (bounded: at
least one allowed commit on `p` must exist, so an empty `allow` admits none).

Cost: one `rev-list --full-history --name-only b..h` and one `log
--full-history --name-only X..b` per distinct `X`, not one per path.

**Owner approval of an agent's change** is one signed commit on top of the
pull request, made from the owner's own clone without touching its working
tree: `waypost commit --approve --base <b> <h>` runs `git -c safe.directory=
-c gpg.format=ssh -c gpg.ssh.program=ssh-keygen commit-tree <h>^{tree} -p <h>
-S` with the trailers of (ii) or of a fence commit, prints `X:p → S:p` per
zone path, and pushes the new commit to the pull request's branch.
`safe.directory=` refuses a repository owned by another user on every
platform. Any later edit of `p` voids (ii) — `h:p` no longer equals `S:p` — so
an approval lands before further work on the path, or is repeated. Closing
a pull request does not revoke an approval; it lapses when `p` changes on
the base, or by rotating the key.

**The required check.** `B` is the tip of the protected branch. If `B` is not
an ancestor of the pull request's head, the audit exits 2 ("update the
branch"); otherwise it runs the rule with `b = B`, `h` = the head.

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
  an owner approval (ii). Release tags are protected (`release.yml`
  publishes on tags).
- **Break-glass.** When the audit cannot run, the owner suspends the
  requirement, records `B` and the reason in an ops note, runs `scope audit
  --range <recorded B>..<B>` for information, and re-enables it; induction
  restarts from `B` by the owner's decision, and the note says so.

### 4. Override, signing, text

- `waypost commit` refuses a message whose trailer block already holds a key
  starting with `Waypost-` (any case): Waypost writes those trailers, the
  author does not.
- `--override-scope "<reason>"` writes `Waypost-Scope-Override` and
  `Waypost-Scope-Base` (the local base): trimmed, non-empty, one line, ≤ 200
  characters. It passes the owner gate (`limitDecision` in
  `scripts/cleanup-limit.mjs`, harness detection in
  `scripts/agents-detection.mjs`): a `[y/N]` question in an interactive
  terminal with no harness detected; refused inside a harness's terminal and
  when the profile exports a harness's variables (`CODEX_HOME`,
  `OPENCODE_CONFIG`, …) — the owner uses a plain terminal. A refusal never
  mentions it.
- `waypost commit --sign` (owner, fence commits): stages nothing; signs the
  current index's tree with the same `git -c safe.directory= -c
  gpg.format=ssh -c gpg.ssh.program=ssh-keygen commit-tree -S`, prints
  **every** changed path, and requires every path to be a fence-commit path
  when any change is a fence crossing. Refused during a merge, cherry-pick or
  rebase. Other configuration (`include.path`,
  `gpg.ssh.defaultKeyCommand`) is the owner's own clone's, under
  precondition 2.
- **Superseding a fenced ADR** is one fence commit: the old ADR's `status`
  changes, the successor is added, with `adr/README.md`.
- **Locally**, (ii) is checked on content like in CI but signatures are not
  verified.
- `scripts/lib-controls.mjs` holds the single-line text set: an allowlist of
  Unicode letters, marks except variation selectors, numbers, punctuation,
  symbols and the space. `why` and override reasons outside it are rejected
  on write; ADR ids, paths and `why` are escaped when printed.

### 5. Entry points

| Point | What happens |
|---|---|
| Local base | For an evaluated commit `c`: for every remote, each existing `refs/remotes/<r>/<n>` with `<n>` the target of `refs/remotes/<r>/HEAD`, `main` or `master`. Bases are `merge-base --all c R` for each such `R`; zones are those of the base plus the candidates, as they are at `c`, changed by commits in `rev-list c --not <every R>`. The rule passes if it passes for any base. Without such a ref or base (no remote, a shallow clone), `b = c^1` with the zones of `c^1`, and the range is `c^1..c`. A refusal names the base it used |
| Local verdict | `waypost commit` refuses only the paths whose verdict the new commit worsens relative to `c^1` (newly without a basis); paths already without a basis earlier in the unpushed history are printed as warnings, and CI judges the whole range |
| `waypost scope check [--story <s>] <path…>` | Per path `ok`, `allowed`, `outside (story scope)`, `protected (ADR id, why)`, `protected (fence, ADR id)`. Exit 0 all ok/allowed, 3 some outside and none protected, 4 some protected, 2 usage error |
| `waypost commit` | Holds `$(git rev-parse --git-path index.lock)` from copying the index to replacing it, so a neighbour's `git add` waits instead of being lost. Builds the candidate in a temporary index (as `--dry-run` does) with only the derived views this mode stages, from `runReconcile({write: false})`; runs `git hook run pre-commit` on it and `commit-msg` on the message; evaluates the rule with the pending trailers and `MERGE_HEAD` (through `git rev-parse --git-path`). On success: `GIT_INDEX_FILE=<tmp> git -c core.hooksPath=<empty dir> commit -F <msg> --cleanup=verbatim`, so git moves `HEAD`, signs per `commit.gpgSign`, clears merge state and writes the reflog; then `git hook run post-commit`; then the views are written and the temporary index replaces the real one. On refusal, exit 4: the commit, the index and the views are as before. Needs git ≥ 2.36 (`git hook run`). The refusal names the ADR, its quoted `why`, its `allow`, the commits without a basis, the base, and the ways out: restore `p` to the base's content, rebase the commits away, or ask the owner to approve |
| `waypost merge` | `git merge --no-commit` brings the merged artifacts onto disk before views can be computed, so a refusal leaves the merge in progress and says to run `git merge --abort`; otherwise as `waypost commit`. Forwards `--story`, `--task` and `--override-scope` |
| `waypost scope audit --range <b>..<h> [--keys <file>]` | The rule as the required check runs it. Exit 4 on a missing basis or an unreadable candidate; 2 on an unknown range, a base that is not an ancestor of the head, or missing keys in CI |
| `doctor` | Validates fences and scopes, `allow` entries resolving to nothing (a dangling entry admits whoever creates it), a zone selecting no tracked file (`warn`; a zone may guard a path before it exists), a zone inside a submodule, a bound vault whose zones cannot apply. No history walk, no graph edge |
| `waypost-reviewer` | Receives the story's scope and the zones its diff touched |
| CI | Enforces zones only; trailers of the rule-compliance ADR are not checked by `scope-audit.yml` |

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
  by O(|glob|·|path|), options `subtree` and `fold` (§2), `[` and `{`
  literal. ADR-0011 guards keep their matcher; moving them is a separate
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
   an approval is pinned to a base on which the path has not moved and to the
   exact content it approved.
2. **One rule; bases from every remote default and every merge base; a local
   verdict on what the new commit changes**, so honest pulls, merges and
   checkouts pass, unpushed decisions apply, and one old commit does not
   block every later one.
3. **`waypost commit` stays a `git commit`**: hooks, signing, merge state and
   reflog behave as before; only the rule is added, on the exact tree that
   is committed.
4. **Intent is stopped only where it can be**, under written preconditions.
5. **Tightening is free, loosening is signed and lands first.**
6. **Less machinery**: no per-commit merge inheritance, no walk beyond `b..h`
   and `X..b`, no local signature checks, nothing in the standing context; the
   hook is a later story.

## Alternatives Considered

### `commit-tree` plus a compare-and-swap for every commit
Revision 9. Skipped `pre-commit`, `commit-msg` and `post-commit`, ignored
`commit.gpgSign`, left merge state behind. Replaced by `git commit` on a
temporary index with hooks run explicitly.

### Fold by NFC → upper → lower
Revision 9. Not idempotent: `ẞ` lowers to `ß`, which does not join `ss`, so
`src/acceẞ` replaced `src/access` on APFS while CI saw a path outside the
zone. Replaced by lower → upper → lower and raw-or-folded matching.

### Rejecting a whole branch for one old commit without a basis
Revision 9. Every later `waypost commit` was refused whatever it touched.
Replaced by the local verdict; CI still judges the range.

### `merge-base(B, head)` in CI
Revision 9. With strict checks `B` is an ancestor of the head; anything else
is "update the branch". Replaced by `b = B`.

### Earlier revisions
Signed bases checked only against `b:p` and `h:p`, short-name fetches,
`toLowerCase` folding, a single merge base, a free local override, a
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
- A wandering agent is refused at `waypost commit` and by the required check;
  where the hook is installed, at any local commit.
- Under the preconditions, a zone cannot be opened, lifted or overridden
  without an owner signature over the exact change, and the owner approves
  an agent's pull request with one signed commit from their own clone.

**Negative / residual**:
- **Named story.** An agent may name or claim a story that `allow` lists; a
  `done` story can be reopened; an epic in `allow` admits later stories; a
  dangling `allow` entry admits whoever creates it.
- **Merge resolutions** on an allowed branch are not attributed.
- **Approvals persist** until the path changes on the base or the key
  rotates; closing a pull request does not revoke them; any later edit of the
  path voids them.
- **Discarded commits count**: a commit dropped by `-s ours` still needs a
  basis in CI.
- **Story lands first; a closed story stops counting**.
- **Fork pull requests** without "allow edits by maintainers" cannot take the
  owner's approval commit; the owner pushes the branch to the base repository
  or asks the contributor to.
- **Preconditions**: if the agent runs in the owner's environment, with
  broader forge rights, or can push tags, protection against intent is gone.
- **Paths, not behaviour**: code outside a zone, symlinks into or out of a
  zone, a root `.gitattributes` over zone paths, and Windows 8.3 aliases can
  change what the zone's code does.
- **Folding over-refuses on any filesystem**: it joins the equivalences of
  APFS, NTFS and HFS+, so names one filesystem keeps apart are treated as
  one.
- **Free tightening**: a broad new `accepted` zone blocks others until the
  owner loosens it; a `why` change is free and reaches every refusal, printed
  as quoted data.
- **The owner gate refuses inside a harness's terminal**: the owner overrides
  from a plain terminal.
- **Version skew**: the local reader and the pinned CI version may disagree;
  CI decides. Upgrading the pin is an owner approval; a reader-equivalence
  digest is a follow-up.
- **Adoption** and **break-glass** leave unchecked spans by the owner's
  decision.
- **Locally**, without the hook, plain git is caught only by the required
  check; without branch protection, not at all.
- **GitHub behaviour is partly unverified** (open question 2).
- A committed fixture under `adr/` with `protect` is a live zone.

**What changes in code / process**:
- New `lib-glob.mjs`, `lib-controls.mjs`, `scope.mjs` (rule, `scope check`,
  `scope audit`); later `hooks.mjs`.
- `commit.mjs`: the temporary-index candidate under `index.lock`, explicit
  hooks, `git commit` on that index, `--git-path` merge state, refusal of
  typed `Waypost-*` trailers, `--override-scope` behind the owner gate,
  `--sign` and `--approve` through `commit-tree -S`, `Waypost-Story` from the
  claim; `merge` forwards flags and names `git merge --abort` on refusal.
- `story-section.mjs`, `bin/cli/artifacts.mjs`, `bin/cli/core.mjs`: `story
  scope add`.
- `lib-frontmatter.mjs`: bracket-aware comment cut; the strict reader.
- `agents/reviewer.md`, `docs/cli-reference.md` (preconditions checklist,
  GitHub recipe, break-glass, approval, git ≥ 2.36).
- This repository: `scope-audit.yml`; read-only `permissions:` and
  `fetch-depth: 0` in `ci.yml`; protected release tags; a tag ruleset; this
  ADR's `protect` over `.github` takes effect on acceptance.
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
3. The rule-compliance ADR relies on "the optional hook and CI of the scope
   ADR" to refuse untrailered commits; this ADR's CI checks zones only.
   Agree the wording before either is accepted.

## Acceptance

Automated, in `tests/scope.test.mjs`, each with its expected outcome:

- **Zones**: inside, outside, protected, allowed (epic, story); overlapping
  zones need both; exempt paths from the base's vaults by layout names, and
  a new candidate in the range exempts nothing; index README prose under a
  zone — refused; `src/acceẞ/a` under `src/access`, `ſrc/a` under `src`,
  `src/Kit/a` under `src/kit`, an NFD variant and a zero-width-joined
  variant — refused; a glob `stra?e` still matches `straße`; a path `[id].ts`
  inside a zone — matched literally; a `protect:` example in a body — not a
  candidate; a zone inside a submodule — `doctor` warns.
- **Reader**: missing `type`, duplicate key in the `protect` JSON — fail.
- **Story**: exactly one trailer; none or two — no story; absent or `done` in
  the base — ignored; created in the same range — refused; landed first —
  accepted; closed on the base before the branch lands — refused.
- **Classification**: tightening — `proposed` → `accepted`, a path added, an
  `allow` entry removed, `why` changed, zones reordered; loosening — a path
  string changed, a zone split, a path moved to another ADR, an `allow` entry
  added, `accepted` → `superseded`, deletion, a move out of `adr/`, a `type`
  change, a duplicate key, a block-form or empty `protect:`.
- **Rule (i)**: an allowed commit then an unallowed rewrite — refused; an
  allowed change, its revert, an unallowed rewrite — refused; a merge with an
  allowed story over an unallowed branch — refused; a root commit — against
  the empty tree; a commit discarded by `-s ours` — counted.
- **Rule against merges**: `-s ours` revert — refused; recombination —
  refused; "update branch" twice — no spurious refusal; a loosened `allow`
  and a crossing relying on it in one range — refused.
- **Approvals**: an owner approval on top of an agent's pull request —
  accepted; a further allowed edit of the approved path — refused until
  approved again; after a rebase update without re-approval — refused;
  squash, owner revert on the base, then the old branch with its approval —
  refused; an abandoned pull request's approval with `p` unchanged on the
  base — accepted (residual); `X` not an ancestor of `b`, unresolvable, or
  with `p` outside a zone at `X` — refused; a mode-only change compared by
  mode; an absent path equals only absent; a fence commit with a non-fence
  path — refused; a supersede — accepted; GPG, a repository-local
  `gpg.ssh.program`, `refs/replace` — ignored; an override covering a fence —
  refused; `--approve` in a repository owned by another user — refused (via
  `GIT_TEST_ASSUME_DIFFERENT_OWNER=1`).
- **Fetch**: a remote with a tag `main` beside the branch `main` — the audit
  uses the branch. A head without `B` as ancestor — exit 2.
- **Local base**: after a loosening and a crossing land on the remote, `git
  pull`, `waypost merge origin/main`, `git switch -c x origin/x` — pass; a
  criss-cross with two merge bases — the same verdict whatever the commit
  dates; a stale `origin/HEAD` after a `master` → `main` rename — `main` is
  tried too; an unpushed `protect` commit — applies; no remote — `c^1..c`
  with the zones of `c^1`.
- **Local verdict**: an earlier unpushed commit without a basis — a later
  commit touching other paths passes with a warning; a later commit worsening
  a path — refused.
- **`commit`**: a `-m` with a `Waypost-Scope-Override` trailer — refused; a
  pre-commit hook that rejects — honoured; a pre-commit hook that edits the
  index — its result is evaluated; `commit-msg` and `post-commit` run;
  `commit.gpgSign=true` — the commit is signed; a merge commit — merge state
  cleared; a neighbour's `git add` during the commit — not lost; a refusal —
  commit, index and views unchanged; with explicit paths only the views that
  mode stages are evaluated; the committed tree equals the evaluated tree.
- **`merge`**: a refusal leaves the merge in progress and names `git merge
  --abort`.
- **Override**: `[y/N]` in a plain terminal; refused inside a harness and with
  `CODEX_HOME` exported; writes `Waypost-Scope-Base`.
- **Audit**: range required; `GITHUB_ACTIONS=true` without `--keys` — exit 2;
  empty keys — exit 2; an unreadable candidate — exit 4.
- **Text**: `why` and override reasons with C0/C1, bidi, tag characters or
  variation selectors — rejected on write; printed ids and paths with them —
  escaped.
- **Matcher**: 10 `**a` segments on a 200-character path — matcher steps
  bounded by |glob|·|path|.
- **Parser**: `#` inside `why`; `tags: [a, b] # note`; `title: [WIP] x`.
- **CLI**: `scope check` exit codes 0/2/3/4; `--touches a b` reports `b` as an
  error.
- **Scale**: discovery and the rule run a number of git processes that does
  not grow with the number of zone paths.
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
- **A reader-equivalence digest** (`scope audit --tree`) for pin upgrades.
- **Folded collisions under zones in `doctor`** across the whole tree.
- **`team-integration.mjs`'s content set** gains tag characters.

## Verification

- Critic passes 1–8 (2026-11-07 … 2026-11-17): *revise* each; the owner chose
  `allow` in the ADR and to close every gap.
- Critic pass 9 (2026-11-17, on 14ef4c6): *revise* — replayable approvals, a
  tag named `main`, `ſ` on APFS, local bases, the committed tree, a free
  override, break-glass.
- Critic pass 10 (2026-11-17): *revise* — the fold missed `ẞ ~ ß ~ ss` and let
  `src/acceẞ` replace `src/access` on APFS (reproduced), and the Kelvin
  example was wrong; `commit-tree` skipped hooks and `commit.gpgSign` and
  left merge state; typed `Waypost-*` trailers in `-m` bypassed the owner gate
  and `--sign` locally; `waypost merge` cannot evaluate before writing;
  paths passed to git as pathspecs (`[id]`, `:(exclude)`); a stale
  `origin/HEAD` and undefined unpushed candidates; `--sign`'s owner check not
  portable; references to revision 8 text. Folded in: the lower-upper-lower
  fold with raw-or-folded matching and corrected examples; `git commit` on a
  temporary index under `index.lock` with explicit hooks; refusal of typed
  `Waypost-*` trailers; `git merge --abort` named for merges; literal
  pathspecs; every remote's `HEAD` target, `main` and `master`, candidates as
  at `c`; `safe.directory=` and `commit-tree` for `--sign` and `--approve`;
  the restored classification and hook lists; `X` with `p` in a zone at `X`;
  a local verdict on what the new commit worsens; exempt paths from the
  base; stories closed on the base; approvals voided by later edits; batched
  git calls; this ADR's `protect` over `.github`; `b = B` in CI. Cut: the
  `X:p == b:p` condition (implied), evaluation under the team gate's lock,
  the `--tree` digest and the whole-tree collision walk (follow-ups).
- An eleventh critic pass is due before acceptance.

---

*Last updated: 2026-11-17*
