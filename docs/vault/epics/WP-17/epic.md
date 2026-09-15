---
type: epic
id: "WP-17"
title: "Disk hygiene by discovery"
status: planned
priority: p2
created: 2026-09-14
updated: 2026-09-14
external_refs: {}
tags: []
code_refs: ["toolchains/", "scripts/toolchains.mjs", "scripts/discovery.mjs (planned)", "scripts/sizes.mjs", "scripts/cleanup.mjs (planned)", "bin/waypost", "package.json", "scripts/doctor.mjs", "scripts/presence.mjs", "prompts/cleanup.md (planned)", "skills/waypost-doctor/SKILL.md", "docs/toolchains.md", "tests/sizes.test.mjs", "tests/toolchains.test.mjs", "tests/discovery.test.mjs (planned)", "tests/scripts.test.mjs", "tests/cleanup.test.mjs (planned)", "README.md", "AGENTS.md", "CHANGELOG.md"]
review_status: pending
reviewed_at: null
---

# WP-17: Disk hygiene by discovery

| Field | Value |
|---|---|
| **Status** | planned |
| **Priority** | p2 |
| **Created** | 2026-09-14 |
| **Updated** | 2026-09-14 |

---

## Goal

Waypost, installed on any operating system and used with any development
tools and any harness, discovers what the machine and the project use, shows
how much disk their build output and caches take, says what can and what
should be removed, and removes only after a yes. Tool knowledge is data; the
core names no tool.

## Context

Build and cache directories filled the owner's disk (26 GB free on
2026-09-12; one cargo `target/` at 35 GB; ~25 GB in custom
`CARGO_TARGET_DIR`s). The first remedy was a personal bash script and a Claude
Code hook on one machine; the first Waypost implementation carried Xcode and
that machine into its core, and the owner stopped it on 2026-09-14. The
decision is the ADR
[Disk hygiene by discovery](../../adr/disk-hygiene-by-discovery-a-toolchain-registry-a-machine-and-project-profile-and-cleanup-only-after-a-yes.md)
(proposed).

## Stories

Each story is blocked by the one above it.

| Story | Status | Description |
|-------|--------|-------------|
| `story-waypost-size-the-read-only-scan-project-and-global` | in-progress | the toolchain registry (`toolchains/*.json`, `scripts/toolchains.mjs`) and a tool-agnostic `waypost size`, keeping the first scan's walk invariants |
| `story-discovery-and-the-profile-the-scheme-of-what-waypost-works-with` | planned | `waypost profile`: tools present, cache paths asked from the tools, the machine and project profiles, per-machine calibration |
| `story-waypost-clean-a-classified-plan-removal-after-a-yes-the-setup-audit` | planned | `scripts/cleanup.mjs`, `waypost clean`, the yes and its log, the setup audit, `prompts/cleanup.md` |
| `story-doctor-and-next-surface-build-artifacts-the-cleanup-prompt` | planned | the `build-artifacts` warning in `doctor`, the `next` item pointing at `waypost clean`, the docs |
| `story-verified-on-linux-and-windows-virtual-machines` | planned | `npm test`, `profile`, `size` and a `clean` plan on the owner's Linux and Windows virtual machines; `verified` per OS from those runs |

## Expected Results

- [ ] `waypost profile` shows, on macOS, Linux and Windows, which tools are
      present, where their caches really are and how each path was found.
- [ ] `waypost size` measures project artifacts and machine caches with no
      tool named in its core.
- [ ] `waypost setup` audits and `waypost clean` removes only after a yes,
      never what is in use, leased or tracked.
- [ ] `waypost doctor` warns above the limit and `waypost next` names
      `waypost clean`; no new standing-context text.
- [ ] Runs recorded on the Linux and Windows virtual machines; the owner's
      personal script and Stop hook can be retired.

## Dependencies

- The ADR above, accepted; ADR-0001, ADR-0004, ADR-0005, ADR-0007, ADR-0008,
  ADR-0011.

## Open Questions

- [x] The ADR's open questions — answered by the owner on 2026-09-14: 7 days
      for project artifacts and 30 for machine caches; `can` items only by id;
      project toolchain entries are data only; one fixed `doctor` budget.

## Related

- Prototype: `~/.claude/hooks/build-size-check.sh` (owner's machine,
  2026-09-13).

---

*Last updated: 2026-09-14*
