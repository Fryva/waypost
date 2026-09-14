---

projectstore: derived
generated_at: 2026-09-14T20:18:50.230Z

---

# Code map

Epic ↔ code mapping, derived from frontmatter `code_refs` (source of truth).
Regenerate via `waypost codemap`; edit refs via `waypost codemap set`.

| Epic | Title | Status | code_refs |
|------|-------|--------|-----------|
| [[epics/WP-14/epic\|WP-14]] | Skills as the portable layer, and the first verified harnesses | planned | — |
| [[epics/WP-15/epic\|WP-15]] | Coordination follows the repository, and ready work | planned | — |
| [[epics/WP-16/epic\|WP-16]] | Decisions that check themselves | planned | — |
| [[epics/WP-17/epic\|WP-17]] | Disk hygiene by discovery | planned | `toolchains/`, `scripts/toolchains.mjs`, `scripts/sizes.mjs`, `scripts/cleanup.mjs (planned)`, `bin/waypost`, `package.json`, `scripts/doctor.mjs`, `scripts/presence.mjs`, `prompts/cleanup.md (planned)`, `skills/waypost-doctor/SKILL.md`, `docs/toolchains.md`, `tests/sizes.test.mjs`, `tests/toolchains.test.mjs`, `tests/cleanup.test.mjs (planned)`, `README.md`, `AGENTS.md`, `CHANGELOG.md` |

## Story-level refs (files each story touched)

| Epic | Story | code_refs |
|------|-------|-----------|
| WP-17 | Discovery and the profile: the scheme of what Waypost works with | `scripts/toolchains.mjs`, `toolchains/`, `scripts/sizes.mjs`, `bin/waypost`, `docs/toolchains.md`, `tests/toolchains.test.mjs` |
| WP-17 | doctor and next surface build artifacts | `scripts/doctor.mjs`, `bin/waypost`, `README.md`, `AGENTS.md`, `CHANGELOG.md` |
| WP-17 | Verified on Linux and Windows virtual machines | `toolchains/`, `docs/toolchains.md` |
| WP-17 | waypost clean: a classified plan, removal after a yes, the setup audit | `scripts/cleanup.mjs (planned)`, `scripts/sizes.mjs`, `scripts/presence.mjs`, `bin/waypost`, `prompts/cleanup.md (planned)`, `skills/waypost-doctor/SKILL.md`, `tests/cleanup.test.mjs (planned)` |
| WP-17 | The toolchain registry and a tool-agnostic waypost size | `toolchains/`, `scripts/toolchains.mjs`, `scripts/sizes.mjs`, `bin/waypost`, `package.json`, `docs/toolchains.md`, `tests/sizes.test.mjs`, `tests/toolchains.test.mjs`, `CHANGELOG.md` |
