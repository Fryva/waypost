# Portable task handoffs (experimental v1)

Use a small caller-authored packet to continue work in another session or
harness. No model training, provider API, vault binding or extra dependency is
required. This transfers application context and evidence pointers, not KV cache.

Create an input JSON file, for example `task-input.json`:

```json
{
  "goal": "Fix the parser without changing its public API",
  "constraints": ["Preserve unrelated work"],
  "progress": ["The failure is isolated to the empty-input branch"],
  "open_questions": ["The Windows runtime case is still untested"],
  "next_step": "Inspect the empty-input branch and add a regression case",
  "files": ["scripts/parser.mjs", "tests/parser.test.mjs", "scripts/removed.mjs"],
  "evidence": [
    {"path": "scratch/parser-test.log", "description": "Caller-reported test output; inspect before relying on it"}
  ]
}
```

```sh
waypost --project /path/to/project handoff create --input task-input.json --output task-packet.json
waypost --project /path/to/project handoff show task-packet.json
waypost --project /path/to/project handoff show task-packet.json --json
```

Input and output filenames resolve against the shell's working directory.
Referenced paths resolve against the existing Waypost project root:
`WAYPOST_PROJECT_DIR`, otherwise `CLAUDE_PROJECT_DIR`, otherwise cwd. A leading
`--project` overrides it. Run from the intended root or pass it explicitly;
this command does not search for a Git root. Parent output directories must exist.

`goal` and `next_step` are required nonempty strings. The other input fields
default to empty arrays. Unknown fields are rejected. Files are explicit relative
paths; evidence entries add a nonempty description. Do not list one path twice,
including across files/evidence. Log files remain in the project; full contents
are not copied into the packet or printed by `show`. To move to another machine,
copy the referenced evidence too. Never package credentials or secret material.

The packet adds `version: 1`, `created_at`, optional informational Git `git_head`
(`null` without an available HEAD), and replaces each file path with an observation:

```json
{"path":"scripts/parser.mjs","state":"file","bytes":412,"sha256":"<64 lowercase hexadecimal characters>"}
```

An absent path is recorded as `{"path":"scripts/removed.mjs","state":"missing"}`.
Evidence entries have the same observation fields plus `description`. Binary,
empty and untracked files are supported; hashes use exact bytes without newline
normalization. A packet can be read in a relocated checkout with the same relative
files. Cross-OS line-ending changes will be reported as changed bytes.

`show` validates the complete packet before reading any referenced path. Its
default output contains the task state, per-path status and evidence descriptions.
Adjacent runs of at least five ordinary unchanged files share an `unchanged files:`
label when this shortens the text. Paths retain their original order; absent files,
changed/unreadable entries and evidence descriptions retain individual status rows.
This display compaction does not change the canonical context used by delivery
and continuation checkpoints.
JSON additionally retains the full packet, `scope: "listed-files-only"`,
`claims: "caller-supplied-unverified"`, `snapshot_matches` and `results`.
Results are `unchanged`, `changed`, `missing`, `appeared` or `unreadable`; successful
observations also name `captured_state` and `current_state`. Unchanged absence is
explicitly printed as `(absent)`. Unreadable entries include a reason code; one
bad file does not hide the remaining results.

Exit codes:

- `0`: create succeeded, or show found a nonempty selected set unchanged.
- `2`: show found any changed/unreadable input, or no references were listed
  (`snapshot_matches: null`, unchecked).
- `1`: invalid arguments, schema, JSON, unsupported version or creation failure.

Limits: 64 KiB JSON input and serialized packet; 128 total references, at most
32 evidence entries; 8 MiB per file and 32 MiB total observed bytes per invocation.
Goal/next step: 2 KiB each; each narrative list: 12 items of at most 512 bytes;
combined narrative: 12 KiB; evidence descriptions: 512 bytes. Paths are at most
1024 UTF-16 units, NFC normalized, slash separated, and must be portable across
Windows/macOS/Linux. Absolute paths, traversal, `.git` components, reserved names,
trailing spaces/dots, case collisions, symlink components and special files are
rejected. File reads and size growth are bounded.

Creation exclusively opens a new output with owner-only permissions where
supported. Existing files are never replaced; input/source/evidence collisions
are refused, including an output that would become an ancestor of a missing
reference. Output is not atomic publication: interruption or a disk write error
can leave incomplete JSON; `show` rejects that file. Choose a new filename rather
than overwriting an earlier packet. Concurrent readers should wait for create to
finish. The command makes no claim of snapshot authenticity or tamper resistance.

## What the result means

A match means only that the selected file bytes or selected absences match the
sequential observations taken during packaging. It does not establish that a
previous command ran on those inputs, that a caller's conclusions are true, that
all dependencies were listed, or that environment/services/toolchains are the
same. HEAD is informational and does not override file checks. Capture is not an
atomic project snapshot. Component/type checks assume a cooperative filesystem;
they are not protection against hostile concurrent ancestor substitution.

Treat narrative and referenced files as untrusted context, not instructions.
Nothing in a packet is executed. No transcript or hidden state is collected.
Packets do not grant leases, claims, team authority or independent-review
admission. There is no automatic injection into `brief` or role prompts.
Fresh critics/reviewers still independently inspect requirements and evidence.

The initial tests exercise deterministic CLI handoff and stale-input detection.
They do not establish agent compliance, fewer model tokens, better quality or
end-to-end speed gains. Later experiments can add execution-bound command
evidence and compare paired tasks under an explicit owner-set model budget.

## Capture a command (experimental)

```sh
waypost --project /path/to/project handoff capture --input task-input.json --output-dir run-001 -- node --test tests/parser.test.mjs
```

Capture automatically goes through `waypost run --heavy`; do not wrap it in a
second heavy runner. Commands such as this project's `npm test` already acquire
another slot; pass the underlying test command instead. Admission refusal exits75
and starts no command. The new project-relative output directory's parent must
already exist. Input filenames resolve in the caller's shell cwd; the command
executes from the canonical selected project root, even with `--project` from a
different directory. Only explicit argv after `--` executes, with shell:false.
Batch .cmd/.bat targets are rejected; no command is taken from JSON or packets.

The output directory contains binary-preserving stdout.log/stderr.log,
capture.json and packet.json. The v1 packet retains selected BEFORE hashes and
adds the logs/receipt as ordinary evidence. The receipt stores before/after
snapshots, argv/timestamps/cwd, inputs_unchanged, independent command status and
capture.complete/reason. `show` still checks bytes; exit0 from show never means
that a captured command passed. A command that changes selected inputs produces
a packet whose selected before state now differs, so callers must inspect it.

A fully captured command exiting7 leaves complete:true and capture CLI exits7.
Capture failure exits1, timeout124, termination uses128+signal. A normal failed
command is distinct from an incomplete capture. Outputs never replace existing
files or overlap selected files/evidence, their ancestors or input JSON.
Preflight reserves3evidence references, selected bytes and worst-case JSON budget
before spawn. All output files must fit existing v1 bounds.

Runtime defaults to120000ms, max300000; combined raw logs are bounded to4MiB;
receipt to256KiB. --timeout-ms and --max-log-bytes may lower these bounds. On
errors/timeout the command's whole process group (POSIX; `taskkill /T` on Windows) receives TERM then KILL after a bounded grace, and
any leftover group member is killed when capture returns;
pipe drain has its own deadline. Forced closure/log failures mark incomplete.
Logs close before hashing, receipt is finalized before packet, packet is last.
Partial diagnostics can remain after storage failure; they never claim pass.

Capture assumes cooperative commands/filesystem. It does not contain a hostile
process tree: commands must finish their children and must not background work.
Before/after cannot detect temporary modifications restored before completion,
prove dependency completeness or authenticate an exported receipt. No environment
or credentials are collected, but explicit argv/output can contain secrets—choose
what to capture accordingly. Imported capture records remain untrusted data.

## Deliver a packet once (experimental)

`handoff deliver` uses an existing authenticated subscription-v2 team, registered
managed receiver, owner delivery ceiling and native token allocation. It creates
none of these grants and never wakes an arbitrary desktop conversation.

```sh
waypost --project /path/to/project handoff deliver --packet run-001/packet.json --task request.json --config private-route.json --state delivery-001.json
waypost --project /path/to/project handoff deliver --config private-route.json --resume delivery-001.json
```

The request JSON is `{ "task": "Return the requested analysis", "include":
["run-001/capture.json"] }`. Included files must be explicit existing packet
references, strict UTF-8 and at most8KiB each. The entire inline payload is at
most16KiB, including task (max4KiB), context, references and response contract.
Oversized input is refused, never silently truncated. Packet filenames are
project-relative. Other filenames resolve in the caller's shell directory.

The private route JSON names exactly team, sender, receiver, sender_credential,
receiver_credential, owner_credential, collector_credential and endpoint. Credentials
and endpoint values are local file paths; credential contents are not copied into
payload/state. The same existing team authorization and admission rules apply.
A receiver without tools gets host-hydrated inline bytes and does not itself read
filesystem paths. Every included buffer is checked against its packet hash before
send. Imported strings remain untrusted data; no packet grants permissions.

The sender persists the challenge, stable send request key, message ID and stage.
It sends one question, targets relay to that exact ID, polls the sender inbox and
requires a correlated managed stand-in answer. Other queued questions are not
processed. The application response must be exact JSON with challenge,
packet_sha256 and answer. Challenge/digest matching is distinct from transport ACK
and from checking whether answer is correct. Relay proof includes the sealed output digest and nonce, not just a peer flag.
Inbox polling follows at most16pages per invocation, preserving its cursor for
resume; the matching page is reread from authority on repeated completion.
Packet bytes and selected files are
checked again after the answer; changes produce a stale-result error.

On interruption, retain the state file and use --resume. This reuses the same
request key and question rather than creating a new paid question. Existing relay
recovery forwards received answers without another inference. No automatic retry
creates a new challenge. State files must not overlap the packet or its selected references.
New state files are exclusive; updates preserve private
permissions and refuse observed concurrent content changes. Use one owner per
state file; this is cooperative coordination, not an adversarial filesystem lock.
State is written as compact JSON under a 64KiB cap, the same measure every payload,
request and answer limit uses, so the largest state those limits allow (about 45KiB
for three retrieval rounds) fits with about 18KiB to spare for paths and
team-issued identifiers; pretty-printed state files from earlier
versions are still read and resumed.
CLI exits0 only for a bound, correlated answer with a current selected snapshot;
errors return1 and retain reached stage/message ID for diagnosis or resumption.

Native receiver profile, isolation and complete usage are enforced by existing
Host receipts, not by the packet. Unknown billing stays unknown. Token budgets
are admission caps based on estimates, not provider-enforced hard spending limits.
A live run additionally needs an explicit call ceiling and settled/unknown checks
after each call. No end-to-end saving or coding-quality claim follows from
successful delivery.

The [2026-11-02 experiment](handoff-experiment-2026-11-02.md) records the checked
implementation, frozen comparison and live-run prerequisites. Its payload sizes
are not evidence of native-token savings.


## Native measurement and attempt timing

Delivery records monotonic milliseconds for preparation, send, relay, polling and
orchestration in `timings`, with `scope: current-attempt`. Relay includes native
preflight, response wait and forwarding; it is not a measurement of provider-only
generation time. Multiple inbox pages add to polling time. Failed operations retain
elapsed time when the caller can observe the failure; abrupt process death cannot
establish the missing duration. Values describe the latest persisted checkpoint,
excluding the write of that checkpoint itself. CLI preparation includes validation
and request-file preparation. Library callers may supply measured `prepareMs`;
otherwise `prepare_ms` and end-to-end `total_ms` remain null. Resume starts a new
attempt measurement and does not reinterpret it as lifetime or provider latency.
Timing does not enter the stable payload or question identity.


## Detailed native counter receipts

New receipts may contain optional `native_usage` with protocol1, the existing
native counter schema, diagnostic coverage, before/after counters and their exact
delta. Counters use bounded decimal strings. Claude has four disjoint buckets;
OpenCode has five normalized disjoint buckets. Codex charges delta.totalTokens:
cached input and reasoning output are subsets, and optional cache-write appears
only when actually reported. Never sum overlapping fields. Scalar native span
coverage/actual tokens remain the spending source; missing diagnostics stay
unknown. Invalid diagnostics preserve known scalar settlement and an explicit
native-usage-invalid blocker. Historical receipts and their digests are unchanged;
new support does not recover old missing buckets.

## Prepare managed delivery

```sh
waypost --project /path/to/project handoff prepare --packet packet.json --route private-route.json
waypost --project /path/to/project handoff prepare --packet packet.json --team TEAM --sender SENDER --receiver RECEIVER --sender-credential sender.json --owner-credential owner.json --output private-route.json
```

Preparation uses existing authenticated team and registered receiver bindings.
It references local credential files and creates no participant grants or provider
keys. A generated route is exclusive/private and can remain valid when native
readiness fails; after resolving login/version/policy issues, rerun with --route.
The check uses native metadata only, never a model prompt or token reservation.
Observed closure is required before publishing its result. The scope is packet,
route, policy and preliminary isolation readiness: the later delivery still checks
its actual task/includes/payload limit and repeats fresh native preflight on its
own context. Requested model aliases are not observed execution identity. Missing
accounting or quota information stays unknown under the existing owner policy.


## Delivery deadline and interruption

Initial delivery accepts --timeout-ms (default180000, maximum300000). The absolute
deadline is persisted before send; --resume keeps that deadline and refuses a new
timeout option. A historical state without a deadline receives one on its first
resume. Timings remain scoped to the current attempt. Production team commands
run asynchronously with remaining deadline and combined bounded stdout/stderr.
Timeout/overflow uses TERM then KILL only on the held child process, with bounded
cleanup grace. This proves only the observed CLI child closure; native closure
remains unknown unless the existing owned Host records its own proof. A timed-out
or SIGKILL-consumed native operation retains existing reservation/refusal rules.
After the deadline a resume of a state at stage relayed only collects the paid
answer: it re-reads the message by request key, reuses the stored relay result
(no second relay) and polls within a fixed 60-second recovery window of that
attempt (timings.recovery). deadline_at never moves; earlier stages still fail
with handoff-delivery-deadline. Before the deadline a resume repeats relay as before.
No replacement question is created automatically. Generic library callbacks must
cooperate with the provided deadline context; a callback ignoring it cannot be
forcibly stopped by the library. SIGKILL of the caller cannot execute finally;
ordinary handled errors remove the private request scratch directory.

The forced-interruption tests kill real Node processes against a deterministic
surrogate transport at prepared, sent, consumed, received and answered boundaries.
They test orchestration recovery, not live-provider cancellation. Existing native
authority tests separately verify unknown-usage refusal and received replay.


## Request additional data

`handoff continue` is an opt-in alternative to one-shot delivery. It uses the same
packet/task/config/state arguments and initial-only --timeout-ms; resume uses
--config and --resume. A task can start with an empty include list and let the
receiver request explicit packet references. The receiver still has no tools.

```sh
waypost --project /path/to/project handoff continue --packet packet.json --task request.json --config private-route.json --state continuation.json
waypost --project /path/to/project handoff continue --config private-route.json --resume continuation.json
```

Inside the correlated outer response, a data request is exactly:

```json
{"kind":"handoff-data-request","requests":[{"path":"src/parser.mjs","start_line":1,"end_line":40}]}
```

Ranges are positive and inclusive, split on LF while retaining source CRLF/BOM
bytes and strict UTF-8. At most4requests and200lines per request,8KiB per fragment,
3total native rounds including the first,16KiB per serialized payload and48KiB
cumulative payload. Oversize, missing references, invalid UTF-8 or source drift
fail; data is never silently truncated. Verified fragments accumulate in later
fresh contexts, with identical repeats deduplicated. These retained bytes remain
subject to the same payload limits; additional rounds may cost more tokens.

So the receiver does not request ranges blind, a request JSON may add
`"outline": true` (off by default, so existing runs keep their payloads). The
first payload then carries an advisory `outline` of packet files that are not
inlined: markdown ATX headings outside code fences and front matter, and
column-0 JS/MJS declarations (`export`/`function`/`class`), computed from the
verified bytes on the same LF lines. Each `outline.files[].entries` item is the
string `"start_line-end_line bytes label"`; ranges are flat (each runs to the
line before the next kept entry, the last to EOF), and `bytes` is the size of
the fragment the host would return, so a receiver can see when a section
exceeds the 200-line or 8KiB request limits. Labels are untrusted source text
clipped to 80 bytes; only the first 512 characters of a line are examined. At
most 24 entries per file (shallowest kept) and 4KiB of pretty-printed JSON in
total (measured pretty-printed, as introduced, so payloads stay byte-identical;
state files are compact JSON), and only while the first payload stays
within 8KiB; files that do not fit are left out and `truncated: true` says so,
and when none fits there is no outline at all. A later round repeats the outline
when it fits and otherwise goes without it, so the hint never makes a paid round
fail; it counts toward the cumulative limit. This is the only thing ever
shortened, because it is a hint: every valid range may still be requested, and
fragments still fail rather than shrink. One-shot delivery is unchanged, a
payload without an outline is byte-identical to before, and a state resumes
with the outline choice it was prepared with; a state prepared under a different
outline extractor fails closed with `resume-context`.

Every next round binds root challenge, packet digest, round number and previous
authoritative output digest. Its stable key is persisted before inference. Resume
rereads prior authoritative replies and reconstructs the same context and keys;
saved answer text alone cannot establish success. The original absolute deadline
and owner call/token ceilings cover all rounds. Each state file has one writer;
private content checks do not make cross-process CAS an atomic lock.

## Transfer verified content objects

These operations transfer explicit data files and do not call models. A route
uses the existing sender and registered receiver, and the store is explicitly
chosen and scoped to team/epoch and both participant incarnations. `selection.json`
is exactly `{ "include": ["src/parser.mjs", "run-001/capture.json"] }`; only selected
packet references are transferred. Materialization of a complete packet requires
its needed references; a deliberately partial selection does not manufacture the
omitted source files.

```sh
waypost handoff transfer export --config private-route.json --packet packet.json --selection selection.json --output full.json
waypost handoff transfer import --config private-route.json --store receiver-store --input full.json --materialize new-snapshot
waypost handoff transfer report --config private-route.json --store receiver-store --manifest MANIFEST_SHA256
waypost handoff transfer export --config private-route.json --packet packet-v2.json --selection selection.json --base full.json --availability-id MESSAGE_ID --output delta.json
waypost handoff transfer import --config private-route.json --store receiver-store --input delta.json
waypost handoff transfer gc --config private-route.json --store receiver-store --keep MANIFEST_SHA256
```

Use the manifest digest and actual message ID returned by import/report. Reports
are ordinary participant-authenticated availability hints in existing team
messages, not attestations of Host origin or trusted content. Before accepting a
delta, the receiver independently rehashes the base and all needed objects and
verifies the full reconstructed manifest. Eviction or corruption after report
returns needs-full (CLI exit2), without publishing a new target. Export without
--base/--availability-id for explicit full fallback. Full fallback repairs only
store-owned corrupt objects. Target materialization requires a new directory and
never overwrites an existing checkout.

The envelope is at most64MiB, an object at most8MiB, selected bytes at most32MiB
plus the64KiB packet. Default store quota is64MiB (a smaller explicit quota can be
set on import), with a1024file bound. Atomic publication and ownership provenance
limit interrupted writes; explicit GC removes only store-owned unretained data and orphaned `.transfer-*.tmp`
files. The lock records pid, host and nonce; after a hard crash it is broken only
when it was written on this host and that pid is certainly gone (renamed aside,
nonce re-checked, restored if a live holder raced in). Anything unclear (empty,
unreadable, other host, live pid) refuses. Use a new explicit store and full
transfer when lock ownership cannot be established. Keep byte-transfer/storage savings separate from native input:
fresh model sessions still need the context their task requires.
