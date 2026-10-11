---
type: adr
id: "owner-assigned-team-roles-by-default-with-calibration-as-an-optional-check"
title: "Owner-assigned team roles by default with calibration as an optional check"
status: accepted
date: 2026-10-10
authors: ["Ivan Morozov"]
tags: ["wp-20", "calibration", "roles", "policy"]
external_refs: {}
supersedes: null
superseded_by: null
review_status: reviewed
reviewed_at: 2026-10-10
drafted_by: {"harness":"claude","provider":null,"date":"2026-10-10"}
guards: []
code_refs: ["scripts/team.mjs", "scripts/team-state.mjs", "scripts/team-host.mjs", "scripts/team-native-work.mjs", "scripts/team-native-work-review.mjs", "scripts/team-native-action.mjs", "scripts/team-native-quota.mjs", "scripts/team-native-integration.mjs", "scripts/team-integration.mjs", "scripts/team-cli.mjs", "scripts/model-strength.mjs", "scripts/team-role-calibration.mjs", "bin/waypost", "tests/native-owner-assigned.test.mjs", "tests/native-owner-assigned-host.test.mjs", "tests/native-owner-assigned-work.test.mjs", "tests/native-owner-assigned-publish.test.mjs", "tests/native-owner-assigned-lifetime.test.mjs"]
---

# Owner-assigned team roles by default with calibration as an optional check

| Field | Value |
|---|---|
| **Status** | accepted |
| **Date** | 2026-10-10 |
| **Authors** | Ivan Morozov |

---

## Owner acceptance

The owner accepted this ADR on 2026-10-10 after one fresh waypost-critic pass
(verdict revise; every finding resolved in the text or decided by the owner) and
authorized implementation.

## Context

The accepted team ADR
([[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]])
lets an owner-approved policy rank models ("The owner can attest identity and
priority"), and protocol 1 still has that `manual` mode with `approved_by` /
`approved_at` (`validatePolicy`, `scripts/team.mjs`). On 2026-09-30 the owner asked
for automatic determination; the proposed ADR
[[automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation]]
rejected "ask the owner to sort models every time" as the normal mode, and
[[native-configuration-profiles-ranked-by-fresh-role-specific-calibration]] built
protocol 2 on fresh calibration. Protocol 2 accepts only `mode:
automatic-calibration` (`validateNativePolicy`, `scripts/team.mjs`).

Calibration does two jobs in protocol 2. It measures role strength, and it is the
only source of participant identity: `native_admission` is written only by policy
install from cohort captures (`installNativePolicy`, `scripts/team-state.mjs`), and
every control action's native profile must equal a calibration capture
(`profileCapture`, `scripts/team-native-action.mjs`).

The live runs of 2026-10-08/09 measured the first job's cost:

1. Calibration spent ≈2.25M tokens over four cohorts and reruns (owner-approved
   budget 1.72M + 0.6M; 706d96e); the joint three-profile cohort alone ≈1.07M
   (cfb67bd). The team's actual work — leader ACK, execution, review — took ≈21K.
2. Results are unstable between days: Claude opus-5-5 qualified for review at 22/24
   on 2026-10-08 and was unqualified at 21/24 on 2026-10-09. Qualification needs
   exactly 24 captures, so one uncertain slot disqualifies a profile.
3. Implement calibration measures only a tiny class (≤2 files, ≤1.5 KiB, ≤40 ASCII
   lines; contract 29(b)). A calibrated executor is refused any real work.
4. Overlapping Wilson intervals give no strict order between strong profiles (the
   2026-10-09 review tier holds Codex and OpenCode together), and the slice-5
   executor pick chooses among everyone who passes the gate without regard to
   strength.

The identity job, by contrast, is cheap: the 2026-10-09 identity probes of three
participants took ≈13K tokens.

## Decision drivers

- A team must be startable without spending a calibration cohort.
- The owner already chooses which harnesses and models join; roles are chosen at
  the same moment, for the models actually present.
- Identity stays observed by a collector, never declared by a participant.
- Independent review stays mandatory; nothing lowers it silently.
- Shortest diff: reuse the existing rank-based selection code.

## Decision

1. **Owner-assigned policy.** A protocol-2 team may install `mode: owner-assigned`
   instead of `automatic-calibration`. Before the team becomes active,
   `waypost team roles` lists the joined participants (harness, exact model id,
   reasoning, tool surface, admitted native profile) and, where a fresh calibration
   exists, its per-role summary as a hint only. The owner gives per role an
   ordered list: coordinator (with optional ordered alternates), reviewers
   (ordered), executors. The policy is stored as owner-given priorities per role
   bound to participants — the protocol-1 `manual` shape — so the existing
   rank-based code (coordinator selection, reviewer candidate, review floor,
   publication rank checks, stronger-reviewer refusal, quota frontier) works on it
   unchanged. `approved_by` records the authenticated owner actor (owner hash),
   never the credential; `approved_at` the time. It claims no calibration provenance.
2. **Identity without calibration.** Each participant's Host runs one identity-purpose
   native call with no measurement. The reducer creates `native_admission` from
   that authenticated, settled capture, with the fields of contract 15. For an
   owner-assigned team the action-time native profile is compared with this
   admitted profile instead of a calibration capture; control requests and the
   publication reservation pin `assignment_digest` instead of `calibration_digest`.
   No path requires a calibration cohort; every path still requires a fresh
   collector-observed identity.
3. **Calibration is optional.** `automatic-calibration` policies stay valid and
   unchanged. A team is one mode for its whole life; switching mode inside a team
   is refused.
4. **The assign command carries selectors only**: participant ids per role, alternates,
   `expires_at` (at most 7 days) and a reason. The reducer derives bindings
   (participant id, incarnation, model revision, descriptor digest, admitted native
   profile, collector) from its own state. It is refused unless the coordinator and
   every alternate and executor each have at least one independent listed reviewer.
   It is owner-only and records the issuing harness and session; an agent issues it
   only after the owner's explicit answer in chat (`--yes --reason`). The event joins
   the `DEFERRED` set until its publication fence is written.
5. **Review.** Only an approval by the highest-listed reviewer independent of the
   work counts for publication; a lower-listed reviewer's verdict is preliminary.
   A busy or departed higher reviewer never lowers this silently — only a new team
   with a new assignment does. A reviewer is a different participant from the work's
   executor and the coordinator, and **a different native configuration from the
   executor**. It may share the coordinator's model and native configuration (owner
   decision 2026-10-10; spec 6.4 excluded that). It uses a fresh read-only context
   that did not author or implement the target; the authority never approves
   model-written work. If no independent listed reviewer remains, review is blocked.
6. **Executor.** An owner-assigned executor runs under a new work mode
   (`executor: owner-assigned`) with a new prompt template revision and the
   leader-baseline limits (≤64 paths, ≤32 KiB per file, ≤48 KiB of inputs,
   prompt/answer 64 KiB, whole-file rewrites). Neither the calibrated manifest size
   class nor the Host `SIZE_CLASS` applies. The manifest's executor must be in the
   owner's executor list. The revise loop (template 2, slice 2) applies to it.
   Unchanged protections: fresh owned no-tools context (Codex only under
   `codex-no-exec-r1`); the executor never writes the project; only a sealed,
   validated whole-file patch reaches the dedicated team checkout; tests are recorded
   as not run; publication goes only to the private team ref, which the owner merges.
   New: the Host refuses model-written content that adds U+202A–U+202E,
   U+2066–U+2069 or zero-width characters absent from the base file (the ASCII rule
   of the measured class used to exclude them).
7. **Lifetime is one team.**
   - The coordinator loses its role (any binding change, revoke, leave, profile
     mismatch at action time, quota with no listed alternate): unfinished work is
     cancelled and the team is closed; the owner assigns a new team. Quota handover
     goes only to a listed alternate that still has an independent reviewer.
   - An executor loses its role: its unfinished work is cancelled.
   - A reviewer loses its role: its unpublished approvals are void; the team
     continues while an independent listed reviewer remains.
   - An expired assignment refuses every protected action, as an expired policy does.
   - Participants joining an active owner-assigned team get no role; there is no
     automatic handover on a stronger arrival.
8. **Labels.** Owner-assigned work is labelled `owner-assigned-unmeasured` and its
   review `owner-assigned-review`; neither claims "strongest" or "calibrated".

## Amends (owner-assigned teams only)

Calibrated teams keep every item below unchanged. For an owner-assigned team:

- Accepted team ADR: "grants control to the strongest eligible joined participant",
  "Once policy exists selection is automatic", "Stronger eligible arrival triggers
  acknowledged handover" — replaced by owner order and decision 7.
- Accepted team ADR review floor and spec 6.1 — the floor is the highest-listed
  independent reviewer; rebaseline means a new team.
- Spec 3.1 and 3.3 (ranking, promotion), 6.3 (stronger review admission forces
  recheck), 6.4 (coordinator diff supervision and independent top-strength approval;
  reviewer excluded when admitted under the leader's native configuration)
  — replaced by owner order, Host checks and decision 5.
- Calibration spec contracts 13, 15, 16, 20, 21, 24, 26, 29(b), 31, 32 — identity
  from decision 2, bindings from decision 4, size class removed by decision 6.
- WP-20 acceptance "Strongest selection…" / "demonstrate promotion" — an
  owner-assigned branch is added.

## Rationale

1. Role choice by the owner costs seconds; a cohort costs about a million tokens,
   fifty times the team's real work in the first live run.
2. A one-capture swing flips qualification day to day, so automatic results are not
   a more reliable judgement than the owner's for the current model set.
3. The accepted ADR and spec 6.4 require coordinator diff supervision and a
   top-strength independent approval. The owner replaced supervision with Host
   checks for leader-baseline work (2026-10-06) and for measured-class calibrated
   work (2026-10-07). On 2026-10-10 the owner extended this to owner-assigned
   executors doing unmeasured, larger work, accepting that model strength is no
   longer measured, and kept independent review as the gate.
4. Storing the assignment as owner priorities reuses the rank-based selection, floor
   and quota code; the new code is identity admission, the assign event, the
   executor mode and the bidi check.
5. One team per assignment fits protocol 2's no-adoption rule (contract 30): a
   handover waits until all work is finished or cancelled, so closing is simplest.

## Alternatives Considered

### Calibration first, ask only when no profile qualifies

**Pros**:
- Keeps the automatic path normal.

**Cons**:
- Pays the cohort before every first assignment; would ask often anyway.

**Rejected because**: the owner chose the owner-assigned default on 2026-10-10.

### A separate role-assignment structure beside the rank code

**Pros**:
- Explicit roles in the state.

**Cons**:
- Every rank-based site (selection, floor, quota frontier, publication gate) needs
  a second branch.

**Rejected because**: owner priorities in the existing shape give the same result
with a shorter diff.

### Keep the measured class for an assigned executor

**Pros**:
- Smaller blast radius per work.

**Cons**:
- Real stories never fit ≤2 files ≤1.5 KiB.

**Rejected because**: the owner chose review and Host checks as the gate.

### Pause and reassign within the team on coordinator loss

**Pros**:
- Keeps finished work in the same team.

**Cons**:
- Needs policy reinstall under a live leader and in-flight work rules; protocol 2
  has no adoption.

**Rejected because**: the owner chose closing the team.

## Consequences

**Positive**:
- A team starts with one identity call per participant instead of a cohort.
- Executors can take medium-size work within the leader-baseline limits.

**Negative / trade-offs**:
- Role quality rests on the owner's judgement; nothing measures it unless the owner
  runs a cohort.
- Owner-assigned executors have no measured resistance to injected instructions and
  no measured scope refusal; the reviewer is measured on protocol review, not code
  review (`WORK_REVIEW_LABEL`).
- The owner credential decides roles; whoever holds the file (including a session
  driving the Host in-process) can assign — the same property as every owner-only
  action today. Mitigated by recording the issuing harness/session and by the owner
  merging the private ref.
- Larger work makes each review more expensive and more important.
- The leader-baseline limits still exclude large files (this repository's
  `team-host.mjs`, `bin/waypost`) as inputs.

**What changes in code / process**:
- `validateNativePolicy` accepts `mode: owner-assigned` (owner provenance, per-role
  priorities, alternates, `expires_at`); owner-only `native-policy-assign-v2`
  derives bindings in the reducer; added to `DEFERRED` until fenced.
- Identity-purpose call and a reducer path creating `native_admission` from it;
  `profileCapture`, control-request builders, work-review request and
  `nativePublicationGate` branch on mode (pin `assignment_digest`).
- `native-work-enable-v2` gets `executor: owner-assigned`; `executorRefusal` uses the
  role binding and identity admission; slice-5 pick limited to the executor list;
  revise allowed for it; labels per decision 8; bidi/zero-width check in the Host.
- Reviewer selection respects listed order and the native-configuration rule.
- `waypost team roles` (CLI, `bin/waypost`) lists participants and calibration hints
  and writes the assignment.
- Spec 3.1/3.3/6.1/6.3/6.4, calibration spec contracts listed above, WP-20
  acceptance, the team runbook and the Memory topic are updated in the same change.

## Verification

- The golden logs `tests/fixtures/native-slice{1,2,4}-authority` replay byte for byte.
- End-to-end owner-assigned team with zero cohorts: identity calls → assign → leader
  ACK → work → review → publication.
- Accepted: reviewer of the coordinator's model and native configuration in a
  separate participant session.
- Refusals: reviewer = executor of the same work; same native configuration as the
  executor; coordinator as the only reviewer; caller-supplied
  bindings; changed native profile at action time; revoked reviewer's approval at
  publication; lower-listed approval while a higher independent reviewer exists;
  expired assignment; mode switch inside a team; bidi/zero-width characters added.
- Coordinator loss closes the team and cancels unfinished work.

## Implementation notes (2026-10-10)

Recorded while planning the implementation; they make the decision precise and change
no choice above.

- **Policy shape.** "The protocol-1 `manual` shape" means owner provenance and owner
  priorities, not the protocol-1 record (keyed by model). The stored policy is a
  protocol-2 policy with `mode: owner-assigned`, one row per participant (two
  participants may share one native configuration), and priority = list length − index.
- **Busy versus departed reviewer** (owner, 2026-10-10). A busy, unavailable or
  quota-exhausted higher reviewer keeps the floor and review waits. One revoked, left
  or rebound (new incarnation, model revision or descriptor) is out, and the next
  listed reviewer becomes the top — the owner's list already names it, so this is not a
  silent lowering.
- **"The team is closed".** A closed team rejects every later event, settlement
  included, so closing cannot be atomic with the loss. Coordinator loss sets a latch:
  the team pauses, cannot resume, cancellable work is cancelled, and the owner closes
  it with `close-v1` once every call has settled.
- **Profile mismatch at action time** is a refusal of that action (a refused event
  records nothing); the owner then revokes the participant or closes the team.
- **Publication fence.** Membership of `native-policy-assign-v2` in `DEFERRED` is the
  fence; there is no per-event fence.
- **Identity call.** `team host --operation subscription-bootstrap` on a team without a
  protocol-2 policy captures `native-identity-capture-v2`; the admission is created at
  assign time and expires with the assignment. The 7-day bound counts from the earliest
  bound identity observation. `issued_by` is declared by the CLI, not authenticated.
- **Review size.** The review prompt, including the diff, is capped at 64 KiB, so a work
  larger than that could be executed but never reviewed. A work whose inputs cannot fit
  a review prompt is refused before execution, so no execution tokens are spent on it.

- **Status of the code (2026-10-11).** Implemented in slices 1-5 (commits 62d9dcf to 315451b). Leadership audit for owner-assigned teams is still refused (`owner-assigned-audit-unsupported`). Live run 2026-10-11 (two Claude Code participants and OpenCode, ≈19.2K tokens, zero cohorts) published one reviewed work, and a three-harness run (Claude Code leader, Codex reviewer, OpenCode executor, ≈28.8K) published another after the Codex surface revision (2b04738). Role loss of the executor and the coordinator was verified live with real revokes (≈16.2K); quota hand-over is verified by tests only.

## References

- [[model-aware-teams-across-harness-sessions-with-one-authority-and-independent-review]]
- [[automatic-model-strength-discovery-with-expiring-evidence-and-periodic-revalidation]]
- [[native-configuration-profiles-ranked-by-fresh-role-specific-calibration]]
- `docs/vault/specs/cross-harness-team-coordination-protocol.md` §3.1, §3.3, §6.1–6.4
- `docs/vault/specs/objective-native-configuration-calibration-for-protocol-roles.md`
- Live runs: 706d96e, cfb67bd. Critic pass 2026-10-10 (waypost-critic, revise →
  this revision).

---

*Last updated: 2026-10-10*
