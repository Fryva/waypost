---
description: Bind this project to a vault (an Obsidian vault, or any markdown directory in git) where mps records artifacts, then set the vault's policy and install the agent roles.
argument-hint: <vault-path> [--layout engineering] [--lang en|ru|es|de|fr|zh]
---

You are binding this project to a markdown vault.

The mechanical half is one command; your job is the half that needs judgement —
where the vault should live, which policy it runs under, and which harnesses get
the roles. Do not hand-write any file the CLI writes.

Parse `$ARGUMENTS`: first positional is the vault path (`~` expands); optional
`--layout <name>` (default `engineering`), optional `--lang` (default `en`;
`zh` is Simplified Chinese).

## Steps

1. **Check for an existing bind**: `mps status`.
   - Bound to the same vault → say so and stop; suggest `mps scaffold` if the
     layout is incomplete.
   - Bound elsewhere → show both paths and ask which wins. `mps bind` refuses a
     silent rebind; only pass `--force` after the user has chosen it.

2. **Decide where the vault lives**, and say the trade-off in one line:
   inside the repo (versioned with the code, moves with a clone) or a separate
   vault repo (shared by several projects, needs its own clone). Both are plain
   markdown in git.

3. **Bind and scaffold**:

   ```bash
   mps bind "<vault-path>" --layout <layout> --lang <lang>
   ```

   This writes `.mps/projectstore.json`, creates the layout's folders and their
   index READMEs, and prints what it created. An existing folder is never
   touched; an existing README is never overwritten.

4. **Vault policy** — vault-side, so it survives a clone and applies to whoever
   opens the vault next. Check `<vault>/.projectstore.json`:
   - Already has `spec_policy` → respect it, print it, do not re-ask.
   - **Fresh/empty vault** → ask two questions: spec-first
     (`spec_policy: required` — every story must be covered by a spec, doctor
     enforces it) and lifecycle gates (`lifecycle_gates: on` — plan/close
     sections and evidence checks on stories). Recommend both on for new work.
   - **Existing vault with artifacts** → default to `optional` / `off` and say
     doctor will suggest enabling once specs appear. Do not impose a gate on a
     backlog that predates it.

   Write the chosen policy (approval-gated) to `<vault>/.projectstore.json`:

   ```json
   {
     "spec_policy": "required",
     "lifecycle_gates": "on",
     "spec_policy_since": "<current ISO-8601 timestamp>"
   }
   ```

   `spec_policy_since` is stamped only when `spec_policy` becomes `required` — it
   anchors the legacy exemption (stories finished before it stay exempt).

5. **Agent roles**: run `mps agents list` to show what this project's harnesses
   would get, then offer `mps agents install` and `mps agents register`. Say what
   the roles are for in one line each (critic after authoring, planner before
   implementing, reviewer before commit) — see `mps prompt agents`.

6. **Housekeeping**: run `mps doctor`. Offer `mps doctor --fix` for the
   mechanical findings (gitignore entries, `git init` in the vault). Show what it
   will do before running it.

7. **Print the summary**: the bound path, the layout's folders, and the next
   commands — `mps brief` (orientation at the start of a session),
   `mps draft adr "<first decision>" --write`,
   `mps draft epic <ID> "<title>" --write`.

## Notes

- The bind config is machine-local (it holds an absolute path): `.mps/` belongs
  in `.gitignore`. The generated role files are the opposite — commit them, so
  the whole team gets the same roles.
- No hooks, no status line, no slash commands are wired by binding. Whatever
  runs at session start runs because a rule says so — the rule to add is
  "run `mps brief` when starting work in this project".
