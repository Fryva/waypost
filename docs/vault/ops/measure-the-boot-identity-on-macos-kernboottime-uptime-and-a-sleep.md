---
type: runbook
slug: "measure-the-boot-identity-on-macos-kernboottime-uptime-and-a-sleep"
title: "Measure the boot identity on macOS: kern.boottime, uptime and a sleep"
status: draft
date: 2026-09-17
authors: ["Ivan Morozov"]
tags: []
---

# Measure the boot identity on macOS: kern.boottime, uptime and a sleep

## Purpose

WP-18 measured the slot's boot identity on Linux and on Windows, and both
machines broke it in ways nobody predicted from reading the code. macOS is the
one host still unmeasured, and the three amendments to
[Heavy work sized to the machine](../adr/heavy-work-sized-to-the-machine-waypost-capacity-a-machine-wide-slot-and-a-rule-to-check-first.md)
explicitly do **not** cover it. This runbook is the list of numbers that would
close it, each with the prediction it is meant to falsify — the point is to find
out, not to confirm.

Why it matters: `slotLive()` decides whether a heavy job still holds the
machine's only slot, and `claimSlot()` **deletes** what it judges stale. On
Linux a host suspend made every live holder look dead; on Windows it did the
same by a different route, and the value that looked like an authority
(`LastBootUpTime`) turned out to be a cache that lies for the first minutes
after a wake — exactly when someone verifying a fix would read it.

## Prerequisites

- [ ] The owner's macOS host, with the shared checkout and a terminal.
- [ ] One sleep the owner performs by hand (lid, or `pmset sleepnow`), and
      later one restart. Neither can be driven from inside a session.
- [ ] Nothing else heavy running: step 5 holds the machine's only slot.

## Steps

### 1. Are the cheap answer and the "authority" the same number?

`bootIdentity()` returns `kern.boottime` on darwin, and libuv computes
`os.uptime()` there as `time(NULL) - kern.boottime.tv_sec`. If that is so, the
two are one number by construction, and the confirm-on-mismatch rule from the
first amendment can never help macOS.

```bash
sysctl -n kern.boottime
node -e "const os=require('os');console.log('now - uptime =', Math.round(Date.now()/1000 - os.uptime()))"
```

**Prediction:** the `sec =` field and `now - uptime` are the same second.
Record both. If they differ, say by how much and why — that would be news.

### 2. Is there a stored boot timestamp, the way Windows has one?

Windows' answer turned out to be the System process's creation time (pid 4),
because the kernel stores it once and never recomputes it. macOS's analogue is
launchd (pid 1), plus `kern.bootsessionuuid`, which has no relation to the
clock at all and would be the better identity if it exists here.

```bash
sysctl -n kern.bootsessionuuid
ps -o lstart= -p 1
sysctl -n kern.monotonicclock_usecs 2>/dev/null || echo "(no kern.monotonicclock_usecs on this release)"
```

Record all three. A missing sysctl is an answer too.

### 3. Sleep the machine, then read everything again

Take the readings from steps 1 and 2 first. Then sleep the Mac for **at least
five minutes** (the epoch tolerance is 120 s, and the Linux and Windows
measurements used 368 s, 429 s, 534 s and 1603 s). Wake it, and read them again
**twice**: once within a minute, and once twenty minutes later.

```bash
# before, and both times after
date -u +%s
sysctl -n kern.boottime
sysctl -n kern.bootsessionuuid
ps -o lstart= -p 1
node -e "const os=require('os');console.log(JSON.stringify({now:Math.round(Date.now()/1000),uptime:os.uptime()}))"
```

The second reading is not padding. On Windows `LastBootUpTime` read correctly
six minutes after the wake and had drifted by twenty; a check built on the
early reading would have passed every test and failed in use.

**Predictions, in order of how much they matter:**

1. `kern.boottime` moves forward by roughly the sleep duration (it is stated
   relative to the current clock, and the clock is corrected on wake). If so,
   `sameBoot()` — which compares it for **exact** equality — calls every record
   written before the sleep a different boot, and the next claim deletes a live
   holder's record. That is the Linux failure with a macOS spelling.
2. `os.uptime()` does **not** decrease. It should come out roughly unchanged
   across the sleep (both terms move together), which is what the uptime rule
   of the second amendment needs: uptime is allowed to confirm "another boot"
   only because it never goes backwards. **If it ever reads lower after a wake
   than before, stop and say so — that rule is unsound on macOS and the code
   must not ship there.**
3. `kern.bootsessionuuid` is unchanged, and `ps -o lstart= -p 1` is unchanged.
   Either would be a real authority. On Linux `ps -o lstart` moved with the
   clock (it is btime + ticks); macOS stores a process's start as a real
   timestamp, so it should hold — but that is precisely the kind of
   "should" this epic has been wrong about twice.

### 4. Restart, and see whether a holder's record survives

Linux and Windows disagreed here: a clean Linux shutdown lets the wrapper
release its record, a clean Windows restart does not, so on Windows every
restart with a heavy job running leaves a record behind. Which is macOS?

```bash
# with a live holder running:
waypost run --heavy -- sleep 7200 &
ls "$(node -e "import('./scripts/discovery.mjs').then(m=>console.log(m.machineStateDir()))")"/slots.*/
# then restart the machine normally, and afterwards:
ls "$(node -e "import('./scripts/discovery.mjs').then(m=>console.log(m.machineStateDir()))")"/slots.*/
waypost capacity
```

Also worth planting, before the restart, a record naming pid 1 (launchd exists
on every boot, so only the boot identity can decide about it) — that is what
made the Linux and Windows restarts informative rather than trivial.

### 5. The end-to-end check, which is the one that counts

With a live holder on the slot, sleep the machine, wake it, and then — read-only
first, because a claim prunes what it judges stale:

```bash
waypost capacity            # is the holder still listed?
waypost run --heavy -- echo second   # must be refused, exit 75
ls "$(node -e "import('./scripts/discovery.mjs').then(m=>console.log(m.machineStateDir()))")"/slots.*/
```

## Verification

- [ ] Every number from steps 1–3 recorded, with the wake readings taken twice.
- [ ] Whether `os.uptime()` is monotonic across a macOS sleep, stated plainly.
- [ ] Whether `kern.bootsessionuuid` and pid 1's start time survive a sleep.
- [ ] Whether a clean macOS restart leaves a holder's record behind.
- [ ] The end-to-end result: does a live holder stay a holder across a sleep.
- [ ] Findings written into
      `epics/WP-18/stories/story-capacity-verified-on-linux-and-windows-virtual-machines.md`
      beside the Linux and Windows tables, and a fourth amendment to the ADR if
      the identity has to change.

## Rollback

Nothing here writes to the vault or the machine except step 4's and step 5's
holders, which release on exit; a record left behind by an unclean stop is
cleared with `waypost capacity --release <id> --force`. If a claim has already
deleted a live holder's record — the failure this is looking for — the job
itself is unaffected: it keeps running, and only the slot table is wrong.

## Notes

The three amendments this closes out are all in Decision 2 of the ADR, and all
three came from a measurement rather than a review:

- a host suspend moves `now - uptime` by the frozen duration (Linux 368/429 s,
  Windows 534/1603 s), so an epoch mismatch may never delete a record;
- `LastBootUpTime` on Windows is a cache that reads correctly for the first
  minutes after a wake and drifts afterwards, so the authority there is the
  System process's creation time;
- uptime never decreases within one boot, so it confirms "another boot" for
  free — and that free signal is what the slow post-restart window needed.

macOS is the only host where none of this has been read off the machine.
