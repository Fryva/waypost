---

projectstore: derived
generated_at: 2026-09-15T15:43:13.555Z

---

# Code map

Epic ↔ code mapping, derived from frontmatter `code_refs` (source of truth).
Regenerate via `waypost codemap`; edit refs via `waypost codemap set`.

| Epic | Title | Status | code_refs |
|------|-------|--------|-----------|
| [[epics/WP-14/epic\|WP-14]] | Skills as the portable layer, and the first verified harnesses | planned | — |
| [[epics/WP-15/epic\|WP-15]] | Coordination follows the repository, and ready work | planned | — |
| [[epics/WP-16/epic\|WP-16]] | Decisions that check themselves | planned | — |
| [[epics/WP-17/epic\|WP-17]] | Disk hygiene by discovery | planned | `toolchains/`, `scripts/toolchains.mjs`, `scripts/discovery.mjs (planned)`, `scripts/sizes.mjs`, `scripts/cleanup.mjs (planned)`, `bin/waypost`, `package.json`, `scripts/doctor.mjs`, `scripts/presence.mjs`, `prompts/cleanup.md (planned)`, `skills/waypost-doctor/SKILL.md`, `docs/toolchains.md`, `tests/sizes.test.mjs`, `tests/toolchains.test.mjs`, `tests/discovery.test.mjs (planned)`, `tests/scripts.test.mjs`, `tests/cleanup.test.mjs (planned)`, `README.md`, `AGENTS.md`, `CHANGELOG.md` |
| [[epics/WP-18/epic\|WP-18]] | Heavy work sized to the machine | planned | `scripts/capacity.mjs`, `scripts/lib.mjs`, `scripts/presence.mjs`, `scripts/agents.mjs`, `templates/agents-block.md.tmpl`, `bin/waypost`, `AGENTS.md`, `package.json`, `scripts/test.mjs`, `prompts/heavy.md`, `tests/sizes.test.mjs`, `tests/capacity.test.mjs`, `tests/slots.test.mjs`, `tests/test-runner.test.mjs`, `tests/harness.test.mjs`, `README.md`, `CHANGELOG.md` |

## Story-level refs (files each story touched)

| Epic | Story | code_refs |
|------|-------|-----------|
| WP-17 | Discovery and the profile: the scheme of what Waypost works with | `scripts/discovery.mjs (planned)`, `scripts/toolchains.mjs`, `toolchains/`, `scripts/sizes.mjs`, `scripts/presence.mjs`, `bin/waypost`, `docs/toolchains.md`, `tests/discovery.test.mjs (planned)`, `tests/toolchains.test.mjs`, `tests/sizes.test.mjs`, `tests/scripts.test.mjs`, `CHANGELOG.md` |
| WP-17 | doctor and next surface build artifacts | `scripts/doctor.mjs`, `bin/waypost`, `README.md`, `AGENTS.md`, `CHANGELOG.md` |
| WP-17 | Verified on Linux and Windows virtual machines | `toolchains/`, `docs/toolchains.md` |
| WP-17 | waypost clean: a classified plan, removal after a yes, the setup audit | `scripts/cleanup.mjs (planned)`, `scripts/sizes.mjs`, `scripts/presence.mjs`, `bin/waypost`, `prompts/cleanup.md (planned)`, `skills/waypost-doctor/SKILL.md`, `tests/cleanup.test.mjs (planned)` |
| WP-17 | The toolchain registry and a tool-agnostic waypost size | `toolchains/`, `scripts/toolchains.mjs`, `scripts/sizes.mjs`, `bin/waypost`, `package.json`, `docs/toolchains.md`, `tests/sizes.test.mjs`, `tests/toolchains.test.mjs`, `CHANGELOG.md` |
| WP-18 | Capacity verified on Linux and Windows virtual machines | `scripts/capacity.mjs`, `bin/waypost` |
| WP-18 | The heavy-work rule in every project, and Waypost's own heavy work | `templates/agents-block.md.tmpl`, `scripts/agents.mjs`, `AGENTS.md`, `prompts/heavy.md`, `package.json`, `scripts/test.mjs`, `bin/waypost`, `tests/harness.test.mjs`, `tests/capacity.test.mjs`, `tests/sizes.test.mjs`, `tests/slots.test.mjs`, `tests/test-runner.test.mjs`, `README.md`, `CHANGELOG.md` |
| WP-18 | waypost capacity: the machine's real free resources, measured by each OS | `scripts/capacity.mjs`, `scripts/lib.mjs`, `bin/waypost`, `tests/capacity.test.mjs`, `CHANGELOG.md` |
| WP-18 | waypost run --heavy: a machine-wide slot for heavy work | `bin/waypost`, `scripts/capacity.mjs`, `scripts/lib.mjs`, `scripts/presence.mjs`, `tests/capacity.test.mjs`, `tests/slots.test.mjs`, `CHANGELOG.md` |
