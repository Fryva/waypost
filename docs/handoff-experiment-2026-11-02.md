# Handoff experiment — 2026-11-02

Status: capture, actual managed delivery and the frozen analytical comparison
verified on macOS. Packet arms used 36.78% fewer native tokens in this four-call
comparison, with identical correct classifications. Latency and general coding
quality were not measured.

## Implementation and validation

`handoff capture` records bounded command output and selected source observations
before and after execution. `handoff deliver` hydrates explicit packet references
and uses the existing authenticated team mailbox and managed native delivery.
Its persisted challenge, request key and message ID support recovery of the same
question. Imported context grants no permissions and is never executable input.

The final checked source manifest contains 424 files under bin/scripts/tests.
All hashes matched before and after 62 focused tests and 9 CLI guard tests:
71 passed, 0 failed. An actual CLI capture also ran through automatic heavy
admission from another working directory. Independent review approved capture
and the delivery implementation for the live experiment. This is macOS-only
evidence; the full npm suite and other operating systems were not exercised.

## Frozen comparison

The owner authorized 500000 native tokens, including input, cached input and
output. The existing 17520-token ledger is preserved. Temporary admission policy
sets total 517520 and retains the old schema cap; restoration preserves entries
and events. This is estimate-based admission, not a provider-enforced hard cap.

Six actual captures exercise unchanged passing input, input changed during the
command, failed command, truncated logs, no selected source, and source changed
after capture. Full history and compact facts contain identical decision facts.
The classification oracle is separate from both model inputs. Four frozen arms
use the same task and checkpoint in baseline/packet/packet/baseline order:

| Arm | Condition | Payload bytes | Native tokens | Quality |
|---|---|---:|---|---|
| 0 | Full history | 12115 | 9266 | 6/6 correct |
| 1 | Packet | 6981 | 5877 | 6/6 correct |
| 2 | Packet | 6981 | 5805 | 6/6 correct |
| 3 | Full history | 12115 | 9212 | 6/6 correct |

Full-history arms total 18478 native tokens; packet arms 11682, difference 6796
(36.778872%). Control cost 2027; all five measured calls total 32187, leaving 467813
of the owner allocation. Each call had complete coverage, a unique retired native
context, verified isolation and actual provider anthropic/model claude-sonnet-5-5,
reasoning unknown. Both packet arms used the public CLI resume path and ended in
answered with a correlated managed proof. All four answers matched the separate
quality oracle. The previous admission policy was restored; machine ledger now
retains historical 17520 plus new 32187 =49707, reserved 0.

The payload-size difference itself is not a native-token measurement. Fixture preparation
and hydration use zero additional model calls. One-time implementation, reviews
and the driving chat are outside this operational comparison. A single counted
synthetic control must pass before the four analytical calls. Every call must
have complete settled usage, verified fresh/no-tools isolation and the same actual
receiver profile. Failures, unknown usage or profile drift stop the run.

The current normalized Host ledger exposes a complete native total but discards
raw per-bucket usage. Input, cache-read, cache-creation and output breakdowns remain
unknown, never zero. A complete total comparison would not establish these
separate bucket totals. This bounded analytical task does not measure general
coding quality, weekly subscription quota or KV-cache transfer.

## Stopped attempts

1. An absolute Claude executable path was rejected by the owned-supervision
   guard before transport or inference. Native expense: 0; prior policy restored.
2. The supported installed Claude 2.1.296 was selected through a private child
   PATH, leaving the system installation unchanged. The symlink target and
   `claude --version` were verified, and the frozen inputs independently reviewed.
   Preflight then refused `native-claude-first-party-subscription-route-unverified`
   before inference. A direct metadata-only check and `auth status` confirmed
   `loggedIn:false`, `authMethod:none`. Native expense: 0; prior policy restored.

The owner then completed native login. Fresh metadata-only preflight verified
the first-party fresh/no-tools route and owned closure. An independently reviewed
continuation reused the frozen inputs, with a new control nonce and a separate
results file; its five calls completed successfully. The two earlier refusals are
retained and cost 0 native tokens. Version pins and route/isolation guards were
not weakened. Never blindly retry a call whose consumption or settlement is unknown.

## Retained evidence

Machine-local experiment project:
`~/.local/state/waypost/experiments/wp24-handoff-5eb30b0a-cd1b-4a69-92a6-3c6b5d45964d/`.
Its private credentials stay local and must not be published. The `evidence/`
directory retains the v5 source manifest, complete test logs, actual capture
smoke, prelive manifests, frozen payload manifests, comparison driver and both
stopped-attempt results. The `attempt2/` evidence contains version proof and the
earlier retained native preflight refusal. Team authority remains in the project vault,
so machine-budget charges can still be derived from retained invocation records.

Final native outcomes are in evidence/attempt2/live-results-authenticated.json.
Delivery acceptance is supported by real receiver receipts. The comparison has
complete native totals but its requested raw bucket breakdown remains an explicit
evidence gap; do not close that full criterion as measured. Only two observations
per condition on one synthetic analytical task were collected, with no statistical
claim or evidence about unfamiliar real coding tasks. The packet ADR remains
proposed. No commit or release was performed.
