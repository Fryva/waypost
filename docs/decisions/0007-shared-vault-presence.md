# ADR-0007: Working from several devices and operating systems: presence, leases, network drives

- Status: proposed
- Date: 2026-09-01
- Deciders: not approved by the project owner; status `proposed`
- Supersedes: —
- Superseded by: —
- Related: ADR-0006 (commit protocol), `scripts/presence.mjs`, `scripts/lib.mjs`
- code_refs: ["scripts/presence.mjs", "scripts/sessions.mjs", "scripts/commit.mjs", "scripts/doctor.mjs", "scripts/brief.mjs", "scripts/lib.mjs", "tests/presence.test.mjs"]

## Context

ADR-0006 described a commit protocol for parallel sessions but silently assumed
one machine: liveness came from file mtimes, temp files were reaped by pid
liveness, and "working now" meant "recently, by the local clock".

The real case is wider: the vault may live on iCloud, Dropbox or an SMB share,
with sessions running on macOS, Windows and Linux at the same time, and everyone
needs to see who is doing what **right now** without stepping on each other. On
that substrate three assumptions that hold for one machine are false:

1. **Clocks agree.** Two laptops can differ by minutes; a TTL that compares a
   remote timestamp with the local `now` then reports a live session as dead, or
   the reverse.
2. **mtime means something.** On SMB it is the server's clock, on FAT/exFAT it is
   rounded to two seconds, and a sync client rewrites it on download.
3. **A write is atomic and unique.** A cloud client creates a second copy
   ("… 2.json", "…conflicted copy…") instead of failing, so `O_EXCL` is not
   mutual exclusion — and `flock` is not reliable over SMB/NFS/iCloud.

Plus a cross-OS layer: a filename legal on macOS cannot be checked out on
Windows; two artifacts differing only in case collapse into one on a
case-insensitive filesystem; and without a line-ending policy a Windows session
turns every file it touches into a whole-file diff that conflicts with every
parallel edit.

## Decision drivers

- No server: coordination only through files that are already synchronised.
- Honesty over convenience: a lock that occasionally lies is worse than an
  explicit "this is advisory".
- No check may depend on clocks agreeing between devices.
- Destructive actions (deleting someone's temp file, overwriting someone's edit)
  must be impossible even when the information is stale.

## Considered options

### Option 1: a counter-based presence, advisory leases, cross-OS checks (chosen)

**Liveness without a shared clock.** Each session writes
`<vault>/.projectstore/presence/<id>.json` with a counter it increments itself.
An observer records **locally** when it first saw each value
(`.waypost/state/peers.json`) and treats a session as live while its counter has
changed within N seconds **by the local clock**. Every time comparison happens
inside one clock. The single exception is the first sight of a peer: there is no
history yet, so its own timestamp is trusted for one window, and the output says
so (`basis`).

**The window depends on the storage.** `storageOf()` recognises
iCloud/Dropbox/Google Drive/OneDrive/Yandex Disk, UNC shares and network
filesystems (`nfs/smbfs/cifs/afpfs/webdav/sshfs/…`) and widens both the liveness
window and the settle wait to cover propagation delay. Commands say plainly:
"presence from another device can lag ~N s".

**Path leases.** `waypost lease <path…>` announces "I am editing these files right
now". Acquisition is not a lock but a protocol: write → settle → re-read →
deterministic tie-break (`acquired_at`, then session id; the function is
symmetric, so both devices compute the same winner) → the loser removes its
record and reports it. A lease lives as long as its session: a crashed harness
must not hold a file forever, and a takeover is recorded (`taken_over_from`)
rather than silent.

**Gates.** `waypost commit` refuses to commit files leased by another live session;
`waypost story plan` claims the story; `waypost brief` and `waypost status` show who is
working and on what; `waypost watch` keeps a session live and prints other devices'
events. Every command that implies work beats the heartbeat by itself, so
presence works without anyone remembering to touch it.

**Pruning stale presence.** A presence file is never removed just because its
session is currently quiet — a session merely idle for a few minutes must not
be reaped, and liveness alone cannot tell "idle" from "gone" (assumption 2:
mtime means nothing reliable either). `waypost sessions --prune` is the normal
path: it removes a presence record only once it is both not live and quiet for
24h+ by either evidence — this device's own observation of the record standing
still, or the record's own timestamp, a remote clock the 24h threshold dwarfs
(the same threshold the legacy per-session registry already reaped stale files
at) — and never a record that is self, live, or a conflicted copy. This is
not an exception to "never delete what is not yours" — it is the same rule
`acquire`'s lease takeover already establishes: a threshold-bounded, mechanical
reap of data whose own owner will simply recreate it next time it beats, as
opposed to a human guessing which record is safe to delete by hand.

**Cross-OS.** doctor reports non-portable names (`<>:"|?*`, segments ending in a
space or dot, reserved `CON/NUL/COM1…`, long paths) and case collisions;
`--fix` writes `* text=auto` into `.gitattributes`. Atomic-write temp files now
carry the host that made them and only this host's are swept: another machine's
pid means nothing here, and deleting its temp destroys a write in flight there.

**Pros:** works on any synchronised directory with no daemon and no server; no
decision depends on someone else's clock; destructive operations are limited to
one's own files.
**Cons:** this is detection, not prevention — two devices can still start editing
one file within the sync window; "real time" means "to the precision of the
storage"; presence requires a session to beat.

### Option 2: real locks (lockfile + flock / atomic rename)

**Pros:** mutual exclusion, if it worked.
**Cons:** `flock` is not portable to SMB/NFS/iCloud; `O_EXCL` does not survive a
sync client that duplicates files; the result is a "lock" that occasionally lies,
which is the worst kind of coordination. Rejected.

### Option 3: an external coordination server (Redis, an HTTP service)

**Pros:** correct locks and real-time events.
**Cons:** destroys the tool's defining property — plain markdown in git, no
server — and makes collaboration impossible exactly where there is no network
between devices but there is a shared drive. Rejected.

## Decision

Take option 1. Presence, leases and the cross-OS checks are part of the core,
and everything they report carries an estimate of how stale it may be. The
contract every interface repeats: **this is advisory coordination, not mutual
exclusion.** The only hard guarantees are the ones that do not depend on
freshness: never sweep another host's temp file, never overwrite a file waypost did
not generate, and never commit over a live foreign lease without `--force`.

## Consequences

### Positive

- Sessions on different operating systems and devices see each other and what
  each holds.
- Clock skew between machines no longer affects liveness decisions.
- A shared vault on a cloud drive stopped being a source of silent corruption:
  conflicted copies are named out loud, other hosts' temp files are untouchable.
- Non-portable names and the line-ending policy are caught before another OS
  sees them.

### Negative / risks

- The sync window remains: on iCloud two devices can start editing one file and
  learn about it tens of seconds later. That is a property of the substrate.
- Presence needs a heartbeat; a session that is merely open and runs nothing is
  quiet. (Mitigated: every working command beats.)
- `waypost watch` is polling — bounded below by the storage's own delay.
- Session identity still leans on `WAYPOST_SESSION_ID` / the terminal (ADR-0006).

## Verification and follow-up

- `tests/presence.test.mjs`: a peer whose clock is ±6 hours off is judged by our
  clock; a counter that stops moving goes quiet; iCloud/Dropbox conflicted copies
  are not read as peers; a lease is refused while its holder is live and taken
  over once it is not, with the takeover recorded; the tie-break is symmetric;
  `release` touches only one's own leases; `waypost commit` refuses to write over a
  live foreign lease and proceeds with `--force`; storage classification;
  non-portable names and case collisions; `--fix` writing the line-ending policy;
  another host's temp file surviving a sweep.
- Live: two sessions (claude/codex) on one vault, `waypost watch` reporting
  join/quiet/claim and foreign leases, `waypost lease` refusing a second session.
- **Not verified on real network storage**: iCloud/Dropbox/SMB behaviour was
  reproduced logically (conflicted copies, delays), not between two machines on
  a shared drive; the delay estimates (0/3/60 s) are conservative assumptions,
  not measurements.
