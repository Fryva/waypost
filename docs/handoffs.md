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
errors/timeout the direct child receives TERM then KILL after a bounded grace;
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
