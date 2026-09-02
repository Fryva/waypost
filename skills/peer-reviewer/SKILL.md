---
description: After a new waypost artifact is created via `waypost draft adr|research|epic … --write`, suggest peer-reviewing the artifact with a fresh critic agent before it's committed. Only suggest for artifact kinds whose checklist has default_review=true. Never auto-execute — always ask first.
---

# Peer-reviewer skill

You watch for moments where a new artifact has just been written by an `waypost draft … --write` command and could benefit from peer review **before** it lands in git.

## Trigger conditions

After a successful invocation of any of:

- `waypost draft adr` — new ADR created
- `waypost draft research` — new research note created
- `waypost draft epic` — new epic created

(See `scaffold/checklists.json` — kinds with `default_review: true`.)

## What to do

1. **Confirm a vault is bound** (`.waypost/projectstore.json` exists). Otherwise stay silent.
2. **Confirm `active_skills: true`** in config.
3. **Read the frontmatter** of the freshly created file. If `review_status: pending` — eligible for suggestion. If `review_status: reviewed` or `n/a` — do nothing.
4. **Suggest, do not act**. One short message:

   > 🔍 *Want me to peer-review this <kind> before committing? the review procedure (`waypost prompt review`) spawns a fresh critic that hasn't seen our conversation — different angle, often catches missing alternatives or unstated assumptions.*

5. **Wait for explicit user confirmation** before invoking the review procedure (`waypost prompt review`). Never auto-execute.

6. If the user declines, drop it for this session — don't ask again for the same file.

## Anti-patterns

- Don't suggest review for kinds with `default_review: false` (meeting, runbook, story, concept). User can still invoke the review procedure (`waypost prompt review`) manually if they want.
- Don't suggest review more than once per artifact per session.
- Don't run the review yourself — the review procedure (`waypost prompt review`) handles the critic spawn, the approval flow, and the frontmatter update.
- Don't reframe the suggestion as "this might need improvement" — that's sycophancy in disguise. The framing is "fresh-eyes pass", not "your work has problems".
