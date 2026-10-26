# How Waypost works

Waypost is a harness-agnostic fork of ProjectStore. The core (vault,
layouts, templates, doctor/graph/codemap/reconcile/draft/kanban) is carried over
as it was; the Claude Code interface layer (slash commands, hooks, status line,
spawned subagents) is replaced by one CLI, neutral role definitions, and adapters
for specific harnesses.

## Getting started

```bash
waypost setup        # bind a vault, scaffold it, install and register the roles,
                 # repair the mechanical findings — one command, idempotent
waypost              # is this set up, and what does it need right now
waypost next         # the same question, ranked, with the command for each
```

`waypost setup --dry-run` shows what it would do first. It adopts a vault the
project already has (`vault/`, `docs/vault/`, `knowledge/`) rather than creating
a second one.

## Vault

A directory of artifacts as plain markdown in git. The default layout is
`engineering` (`scaffold/layouts/engineering.json`):

```
vault/
  adr/        <slug>.md
  specs/      <slug>.md
  epics/      <id>/epic.md, <id>/stories/story-<slug>.md
  research/   <slug>.md
  concepts/   <slug>.md
  meetings/   <date>-<slug>.md
  ops/        <slug>.md
  diagrams/
  kanban.md    (derived)
  graph.md     (derived)
  code-map.md  (derived)
  .projectstore.json      vault policy (spec_policy, lifecycle_gates, acceptance_gate, self_install)
  .projectstore/          runtime data: sessions, presence, leases (not committed)
```

The vault stays compatible with upstream ProjectStore: service file names inside
it are not renamed, so one vault opens in either tool (ADR-0004).

## Shared helpers

`scripts/lib.mjs` remains the common facade. Pure frontmatter scalar, flow-list
and bare-reference parsing lives in `scripts/lib-frontmatter.mjs`; existing
callers keep importing the facade. Artifact identity, matching and ordering live
in `scripts/lib-identity.mjs`. Vault navigation rendering lives in
`scripts/lib-skeleton.mjs`. These leaves need no filesystem, process environment,
clock or external dependency.

`scripts/lib-node-index.mjs` builds the graph node universe and its per-call
lookup maps, preserving discovery order and node references.
`scripts/lib-vault-policy.mjs` owns the vault policy helpers, including the explicit
policy writer. `scripts/lib-vault-facts.mjs` owns budgeted fact collection and its
existing deadline and late-result behavior.
`scripts/lib-resources.mjs` owns tool-root resolution, layout loading and template
rendering. The heading registry and its per-facade cache remain in `lib.mjs`.
`scripts/lib-links.mjs` owns link parsing and resolution; its caller-owned
`ctx._fileSet` cache and injected attachment lookup retain their existing behavior.
`scripts/lib-vault-files.mjs` owns read-only vault discovery, story references,
containment and activity checks. It reads the filesystem at call time and shares
its functions through the same facade.

## The verified loop

task → artifact (ADR / spec / epic / story) → critic → backlog → planner →
reviewer → done. Every verification step is a separate pass with a fresh
context, and the mechanical half is handled by a deterministic `waypost doctor` with
no LLM involved.

## One CLI

`bin/waypost` is the stable shim; `bin/waypost.mjs` dispatches commands and statically
imports shared state and helpers from `bin/cli/core.mjs`. Generators that doctor
re-runs stay pure so it can compare their output with disk. Writes belong to
`bin/` and scripts owning stores or `--write` modes: reconcile, presence, sessions,
commit, agents/skills install, launcher, `doctor --fix` and team commands.

See the [CLI reference](cli-reference.md) for commands and option details.

The [accepted CLI split decision](vault/adr/the-cli-as-a-thin-entry-with-per-command-modules-each-readable-in-one-pass.md)
sets permanent UTF-8 ceilings:14000bytes for the entry and24000 for each module.
The13998-byte entry statically imports only core from the CLI tree; commands load
lazily from20 modules in `bin/cli/`. Core owns inherited identity, the live clock
and lazy authority state. Module ownership is acyclic and covered by namespace,
syntax/import and closure guards. The16000-byte module threshold is advisory;
clean-plan and auto-clean remain below the hard24000-byte ceiling. Source size
changes alone do not establish token savings.

`waypost brief` lists folder paths, kinds and counts in the default orientation;
`--full` adds their README descriptions and the reading tutorial. JSON facts keep
the full detail in either mode.

Doctor's text renderer lives in `scripts/doctor-report.mjs`. It formats supplied
findings and version/date metadata without loading diagnostic checks or reading
the filesystem; `scripts/doctor.mjs` supplies live metadata and owns CLI behavior.
Ordinary text groups two or more canonical declarative ADR check notes into one
count; repeat the same command with `--full` to see commands and reasons.
Warnings, issues and other information stay complete. `--fix` keeps the full
pre-repair report; JSON and startup diagnostics are unchanged. Programmatic
rendering remains full unless its caller opts into `compactChecks`.

ADR guard evaluation and its project-file cache live in `scripts/doctor-guards.mjs`;
Doctor keeps the original public exports and registers the check.
Artifact code references, supersede links and acceptance review gates live in
`scripts/doctor-integrity.mjs`, with the same public exports through Doctor.
The shared vault walk, artifact identity, external-ref form and filename checks
live in `scripts/doctor-artifacts.mjs`; graph keeps its existing Doctor import.
Portable path and line-ending checks live in `scripts/doctor-portability.mjs`;
Doctor keeps orchestration and repairs.
Specification link, coverage and acceptance checks live in `scripts/doctor-specs.mjs`;
Doctor retains the public exports and lifecycle checks.
Generated-view consistency checks live in `scripts/doctor-generated.mjs`, preserving
the real subprocess generators and public exports through Doctor.
Story/epic status and lifecycle-gate checks live in `scripts/doctor-lifecycle.mjs`;
Doctor retains their public exports and guarded-loop registration.
Explicit mechanical repairs live in `scripts/doctor-repairs.mjs`; Doctor retains
the public `applyFixes` export and its existing CLI gate.
Repository, shared-state, launcher and process-table checks live in
`scripts/doctor-coordination.mjs`; Doctor keeps their exports and repair helper.
Harness configuration, templates, instructions, roles and skills diagnostics live in
`scripts/doctor-install.mjs`; Doctor retains their public exports and repair flow.
Remaining vault scan, policy, links and workflow checks live in `scripts/doctor-vault.mjs`;
Doctor keeps their public bindings, orchestration and repairs.

## Agent roles across harnesses

One definition per role — `agents/<role>.md` with neutral frontmatter
(`model: reasoning|balanced|fast`, `summary`, `effort`, `access`, `tools`).
`waypost agents install` renders it into each harness's own format.

The harness itself is data too: `harnesses/<id>.json` (ADR-0005). Shipped:
`claude` (verified); `codex`, `opencode`, `gemini`, `copilot`, `cursor`,
`windsurf`, `cline`, `roo`, `kimi`, `qwen`, `zcode`, `codebuddy`, `lingma`,
`dsh` (documented); `trae`, `iflow` (inferred). Add your own as a file in
`.waypost/harnesses/` — see `docs/harnesses.md`. `waypost harnesses` prints the list and
marks what is detected in this project.

Separately, model providers (`harnesses/providers/*.json`): DeepSeek, Moonshot,
GLM, MiniMax, DashScope. Those are not harnesses — roles are installed for the
harness you actually run, and the provider is detected from the endpoint or a
vendor key and recorded in the commit as an `Waypost-Provider` trailer.

Every generated file carries a provenance line with a hash of the render: that is
how `waypost doctor` tells "installed and current" from "stale", and how
`waypost agents uninstall` knows which files are its own.

`waypost agents register` writes a routing block between markers into `AGENTS.md`
(and into whichever instruction file each detected harness reads): when to reach
for which role. Re-running replaces the block in place rather than duplicating it.

## Agent Skills (WP-14)

Waypost's procedures ship as standard [Agent Skills](https://agentskills.io/):
one `SKILL.md` per skill in `skills/` of the tool root, the same file for every
harness. A harness loads each skill's `name` and `description` at startup and
the body only when a task matches, so the descriptions are triggers and their
total is pinned by a test (ADR-0008). `waypost skills install` copies them into
the directory each harness discovers — registry data (`skills.dir` in
`harnesses/*.json`): eleven harnesses read the shared `.agents/skills/`, so one
copy there serves them all; the rest get their brand directory
(`.claude/skills/`, `.qwen/skills/`, …). An installed copy carries
`metadata.waypost-source` and `waypost-hash`, which is how `doctor` tells a
current copy from a stale or hand-edited one and how install knows a file is
ours before touching it. `waypost brief` installs the running harness's skills
when they are missing, as it does roles (not when the vault policy says
`"self_install": "off"`); `waypost skill <name>` prints one.

## Parallel sessions (ADR-0006)

- `waypost commit -m "…" [--story <id>] [--task <id>]` — reconciles the views, checks other
  sessions' claims, and writes `Waypost-Harness` / `Waypost-Session` / `Waypost-OS` / `Waypost-Provider` /
  `Waypost-Story` trailers, plus `Waypost-Task` for an external tracker's id (never looked up).
- `waypost log [--story|--task|--harness|--provider|--session|--os <v>]` — reads that back.
- `waypost merge <ref>` — merge without auto-commit, reconcile, then commit, so the
  board in the merge commit matches the merged vault.
- `waypost merge-derived` — the git merge driver: a conflict in a generated file is
  resolved by regeneration rather than line by line. Installed by
  `waypost doctor --fix`.
- `waypost sessions --claim/--release` (and automatically at the story gates) — who
  is working on what.

## Several devices and operating systems (ADR-0007)

- `waypost watch` — heartbeat plus other devices' events (who joined, went quiet,
  took a story). Any working command also beats on its own.
- `waypost lease <path…>` / `lease list` / `lease release` — advisory path leases
  with a deterministic race resolution; `waypost commit` respects live foreign leases.
- `waypost sessions`, `waypost brief`, `waypost status` — who is live, on which harness, OS
  and device.
- `waypost storage` — storage kind (local/network/cloud) and the presence lag estimate.
- Liveness is computed with the local clock only (a peer's counter plus a local
  observation), so clock skew between machines affects nothing.
- doctor: non-portable names, case collisions, `* text=auto`, sync conflicted
  copies, stale foreign leases.
- Coordination follows the repository (ADR-0010): inside a git repository the
  presence and lease records live in `.git/waypost/<vault>/`, shared by every
  worktree; a linked worktree inherits the main worktree's binding and needs no
  setup; sibling worktrees are named as such. Outside a repository the records
  stay in `<vault>/.projectstore/`. `waypost storage` names the directory in use.
- A shared *checkout* (a session on another host, live, in this very project
  root, or with its vault at the same offset inside its checkout, or with the
  project root on a cloud/network drive) is named by `brief`, `sessions` and
  `status`, and `waypost commit --all`/`--tracked` refuses to sweep it without
  `--force`: git has no hook before `checkout`/`restore`/`stash`/`reset`/`clean`,
  so an uncommitted edit there is protected only by committing it at once.

Storage classification and coordination path resolution live in
`scripts/presence-storage.mjs`, including the shared lazy path cache.
The facade keeps the five original public bindings; readers and writers keep
their existing primary and legacy locations.

Peer liveness, observation persistence and stale-presence pruning live in
`scripts/presence-liveness.mjs`; the facade preserves the three public bindings.
Heartbeat and lease writers retain their existing behavior.

Checkout identity, lease path normalization and shared-checkout advice live in
`scripts/presence-checkout.mjs`; the facade preserves all five public bindings.
Exact-root and containment checks keep their existing platform semantics.

Host process evidence lives in `scripts/presence-process.mjs`;
`scripts/presence.mjs` preserves its five public bindings alongside coordination.
The process probe uses a child-only C locale and keeps unknown evidence distinct
from a completed process.

## Guards: decisions that check themselves (ADR-0011)

An accepted ADR may carry `guards` in its frontmatter — flow form, one line,
since the frontmatter reader is line-based: `forbid` fails on any match in a
file the `in` glob selects (`not_in` excludes), `require` on every selected
file without a match; patterns run over the whole file, and the finding names
the ADR, the file, the line and the guard's `why`. A glob that selects nothing
is a finding of its own; a pattern that does not compile is one finding, and
the next guard still runs; files over 1 MB and selections over 5000 files are
skipped and said so. `check` names the project's own fitness command and is
never executed — `doctor` runs unattended on every clone through `waypost next`,
so nothing in an artifact may run a command. `draft adr --write` records
`drafted_by` (harness, provider, date) as the environment asserts it.

## Context spend (ADR-0008)

Historical measurements for the ADR-0008 fixture: the routing block (197 tokens), the role descriptions a
harness injects (92), and `waypost brief` (409) — about 700 tokens, and that number
does not grow with the vault. Only derived views grow, which is why they are
never read whole: `waypost graph --for <path>` (44 against 1119) and
`waypost search "<text>"` (91 against 1516 for one index). Detail is behind a flag:
`brief --full`, `harnesses --all`, `agents list -v`, `draft --json`. The budgets
are pinned by tests.

### Measure before optimizing

`waypost tokens --summary --since 2026-10-08 --until 2026-10-15` is the compact
offline report. Dates are UTC: `--since` is inclusive and `--until` exclusive.
Requests are assigned by their first observed assistant-block timestamp, after
deduplication; all usage blocks of that request are included even if cumulative
output finishes across midnight. Navigation events use the timestamp window, so
out-of-period tool results can remain missing evidence. Unknown inline-subagent
identity never establishes shared retained context with the main thread.
Use `--json --navigation` for reproducible evidence and file hotspots; redirect
that JSON to a local scratch file rather than feeding every field back into an
agent's context. These commands do not invoke a model.

The default report reads retained **Claude Code** history, including
subagent transcripts whose metadata is missing (their attribution stays unknown).
Use `--harness codex` for the separate Codex report below; OpenCode history is
not imported. Neither mode measures the subscription's weekly quota.
Claude native totals include input, cache creation, cache reads and output once;
cache lifetime breakdowns are not extra tokens. `native_totals` and `token_shares`
are nullable when usage or source coverage is incomplete. Legacy numeric columns
remain for compatibility; an unpriced model's legacy `$0` is a placeholder,
while the authoritative API-price estimate is unknown. API prices do not convert
to subscription billing or quota percentages.

The JSON records the requested/observed period, project and analyzer revisions,
analyzer hashes, input-file hashes, contexts and parse/coverage diagnostics.
Files are read sequentially: this is not an atomic snapshot of a live session.
Keep reports locally; fingerprints and paths identify their inputs, and raw
transcript contents are never included in the report.

Navigation evidence counts requests **issuing** recognized navigation calls.
Their usage precedes the returned tool text, and does not measure that text's
cost or its reuse in later contexts. These counters overlap native totals and
must not be added to them. Unbounded `Read` is a request shape, not proof that
the entire file was returned. Identical successful returned text in one context
is a repeated-result signal; edits and compaction invalidate tracking. Missing,
failed, truncated and unsupported calls remain explicit gaps. The evidence alone
never authorizes skipping a freshness check or independent review.

Planner, critic and reviewer start with an available index or scoped search,
then relevant symbols/ranges, expanding to contracts, callers, dependencies and
full files as needed. Stale or missing indexes fall back to direct reads/search.
Use `waypost search` / `graph --for` for vault orientation. Reuse evidence within
one context only while source identity is unchanged; branch/revision/file changes
or uncertainty require refresh. After editing, inspect the diff and affected
dependencies rather than automatically re-reading unchanged files.

The review skill carries a compact handoff: task/artifact and original AC/spec
links, base/head and dirty state, exact diff scope including untracked files,
paths/symbols, and validation command/status/counts/log path. Identify dirty and
untracked inputs with content hashes or a retained patch/manifest and bind logs
to the checked snapshot. A dirty flag alone is not reproducible. Missing fields
remain explicit gaps or are discovered independently; caller conclusions and
logs from an unidentified snapshot are not proof. The reviewer starts fresh and
can expand beyond the handoff to original requirements and related contracts.

Keep full successful test logs locally and return results/errors with a log
pointer. Renderer/installation checks verify delivery of this policy, not agent
compliance or token savings. Compare total tokens for a fixed task cohort,
including failed attempts and independent quality checks, before claiming savings.
Live comparisons need an owner-set numeric token allocation.

### Codex offline counters

`waypost tokens --harness codex --summary --since 2026-10-08` reads plain and supported compressed rollouts
under `CODEX_HOME/sessions` (default `~/.codex/sessions`), without starting a model.
Exact normalized `session_meta.cwd` selects the project; worktrees and aliases
are not guessed. `--json` includes source/analyzer hashes, context identity,
explicit roles, discovery gaps and native-span diagnostics. `--sessions` shows
context totals in text. `--runs` and `--navigation` are explicitly unsupported
in this mode. The Claude report and its counter schema remain separate.
`session_meta.id` identifies a native context; the Desktop's `session_id` may be
shared by parent/subagent rollouts and is only an opaque label, not a dedup key.

A Codex snapshot is cumulative, not a request. The analyzer subtracts consecutive
monotonic snapshots, using native `total_tokens` once. Cached input and reasoning
are subsets of input/output; adding them again would inflate consumption. A first
nonzero snapshot is an **uncharged baseline**, even when it equals `last_token_usage`:
it may contain inherited history. Only an explicit zero establishes a zero anchor.
Copied events before session creation are skipped. Parent identity alone does not
anchor counters. One older same-project parent `session_meta` immediately after
the current header is recognized only with a consistent explicit parent identity
(`parent_thread_id`, `forked_from_id`, or the subagent spawn link). Contradictory,
empty, non-string or self links invalidate the header; absent/null links cannot
authorize this exception. The outer event timestamp may be rewritten
when history is copied; the older parent creation time and exact prefix position
are checked instead. This exception never merges parent counters, assigns an
unknown first prefix or changes the child's role. Later, repeated, unrelated or
invalid metadata remains conflicting; accepted normalized parent metadata is bound
across replay copies and the registry of discovered first headers, including foreign
projects. A contradictory parent identity quarantines children using that prefix
exception. Outer copied-record timestamps are excluded from this identity check.
Identical repetitions of the current header retain their previous behavior; they
do not reopen the parent-header slot. `coverage.inherited_parent_headers` counts recognized matching-file header
occurrences, including replay copies, not token requests. Missing/malformed events,
invalid or decreasing timestamps, reset
counters, conflicting snapshots and optional-schema changes break continuity;
the next valid snapshot only rebases. Divergent same-id histories are quarantined.
Duplicate files must have compatible prefix token histories to merge.

UTC periods select spans by the **endpoint snapshot** after constructing the chain
with pre-period baselines. This is an accounting assignment, not exact per-call
timing; spans crossing a requested boundary are counted explicitly. Missing first
responses are not reconstructed or assigned estimated tokens.

Prefix diagnostics distinguish all classified retained histories from the selected
UTC period: `coverage.unknown_prefix_contexts` counts unique reduced contexts with
an uncharged first prefix; `unknown_prefix_contexts_overlapping_period` counts
those whose first observation is at/after `since` and creation is before `until`,
using the existing completeness guard. Per-context coverage exposes the matching
`unknown_prefixes_overlapping_period` count. A first snapshot after `until` can
still leave the period's prefix unknown. Replay is deduplicated; quarantined
contexts are excluded from these counts. Zero overlap cannot prove full coverage:
empty histories, gaps, read/discovery failures and quarantine remain separate
limitations. These diagnostics appear in JSON and detailed text; `--summary`,
accounting decisions and observed/full totals are unchanged.

`observed_waypost_percent` describes explicitly labelled `waypost-*` roles over
covered spans only. Unlabelled contexts stay unattributed. Full retained-source
totals/shares remain null when discovery/history is incomplete; even complete
retained sources cannot prove provider-exhaustive history. `.jsonl.gz` and
`.jsonl.br` use Node's built-in streaming decoders; `.jsonl.zst` is supported only
when the runtime exposes a native Zstandard decoder. Other codecs (`.xz`) and
unavailable native decoders remain explicitly skipped. No external commands or
dependencies are used. Archive reads are capped at 8 MiB compressed and 64 MiB
decompressed per pass, with a 64 MiB maximum Zstandard window. Headers are probed
before project filtering; unrelated archive tails are not integrity-checked.
Matching archives require a successful full decode including the trailer and
consumption of every input byte. Fully decoded concatenated frames are counted
together. Ignored tails or additional unsupported compressed
members invalidate the context rather than hide observations. Hashes
cover the original compressed bytes. Decode/read/limit failures quarantine matching
contexts, including valid replay copies, and leave full totals unknown.
Unidentifiable headers, unreadable files and oversized lines also stay visible.
The reader bounds line storage to 1 MiB and never emits prompt/tool bodies.
No API prices, combined Claude/Codex total or subscription-quota percentage is
calculated. Observed spans omit unknown prefixes and are not a complete invoice.

## Doctor

`waypost doctor` is deterministic and AI-free:

- **install**: the bind, the layout and templates, the roles per harness, the
  routing block, `.gitignore`, git in the vault, the merge driver, the
  line-ending policy.
- **vault**: statuses ↔ board ↔ indexes, legal names and slugs, acceptance
  criteria, links (wiki and relative), `code_refs`, supersede links, spec and
  lifecycle gates, portable names, shared-vault state.
- `--fix` repairs only the mechanical things: `.gitignore` entries, `git init` in
  a vault outside the repository, re-rendering roles and the routing block, the
  merge driver and the line-ending policy. The vault side is repaired by
  `waypost reconcile --write`.

Artifact integrity (ADR-0009): a `code_refs` path that no longer resolves is an
issue for an in-progress or done artifact and a warning at any other status —
annotate it `(waiting)`, `(planned)` or `(deleted)` to say it is a promise rather
than a claim. A `supersedes` / `superseded_by` entry naming nothing is an issue;
a one-directional link, or a replaced artifact whose status is not `superseded`,
is a warning. `acceptance_gate: on` in the vault config adds the acceptance gate:
`status: accepted` requires `review_status` to hold an answer rather than
`pending`. Its own key, because `lifecycle_gates` is story-scoped and recommended
by default — a project that wanted story gates never asked for a policy on how
decisions get accepted.

## Paths and environment

- `WAYPOST_PROJECT_DIR` — the project root (fallback: `CLAUDE_PROJECT_DIR`, cwd).
- `WAYPOST_HOME` — the tool root for a script run directly (fallback:
  `CLAUDE_PLUGIN_ROOT`, the directory above `scripts/`). `bin/waypost` always uses
  the tree it belongs to and sets this for its own children.
- `WAYPOST_SESSION_ID`, `WAYPOST_HARNESS`, `WAYPOST_PROVIDER` — session identity and labels.
- `WAYPOST_NO_BEAT=1` — disable the automatic presence heartbeat.
- Bind config: `.waypost/projectstore.json` (legacy `.claude/projectstore.json`);
  `vault_path` is relative to the project root when the vault is inside it.

## What changed relative to ProjectStore

| Upstream (Claude Code) | Waypost |
|---|---|
| `/projectstore:*` slash commands | `bin/waypost` plus `waypost prompt <name>` procedures |
| hooks (SessionStart/PreToolUse/Stop/PreCompact) | `waypost brief`, `waypost sessions`, an automatic heartbeat |
| status line | none (removed with the wiring it described) |
| Claude-only subagents | `agents/*.md` plus a registry of seventeen harnesses |
| `CLAUDE_*`, `.claude/.projectstore/` | `WAYPOST_*`, `.waypost/` |
| marketplace/auto-update checks | none; the version comes from `package.json` |

The core is preserved in meaning: `lib`, `doctor`, `graph`, `codemap`,
`reconcile`, `draft`, `kanban`, `diff-refs`, `story-section`, `tokens`, the
layouts, the templates and the vault mechanics.

## Tests

`npm test` (or `node --test tests/*.test.mjs`) — core predicates, the scripts
(draft/reconcile/graph/story-section), locales, the harness layer (roles,
adapters, registry, CLI, token budgets), the commit protocol, and presence.
