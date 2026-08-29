# ADR-0004: Разделение имён: vault остаётся ProjectStore-совместимым, обвязка проекта — `.mps/`

- Status: proposed
- Date: 2026-08-29
- Deciders: не утверждено владельцем проекта; статус `proposed`
- Supersedes: —
- Superseded by: —
- Related: `scripts/lib.mjs`, `bin/mps`, `scripts/doctor.mjs`, ADR-0001, ADR-0002
- code_refs: ["scripts/lib.mjs", "bin/mps", "scripts/doctor.mjs", "scripts/sessions.mjs", ".gitignore"]

## Context

Форк переименовал инструмент (`projectstore` → `mps`), но имена встречаются в двух разных
слоях: внутри vault (политика `<vault>/.projectstore.json`, реестр сессий
`<vault>/.projectstore/sessions/`, маркер `projectstore: derived` в производных файлах) и в
обвязке проекта (`<project>/.claude/projectstore.json`, `<project>/.claude/.projectstore/`
для машинного состояния). Слепое переименование всего сразу ломает совместимость vault, а
сохранение всего — оставляет не-Claude харнесы писать в `.claude/`.

## Decision drivers

- Vault — общий артефакт команды и переносимая ценность; он должен открываться и исходным
  ProjectStore, и форком.
- Проектная обвязка — машинно-локальная и харнес-зависимая; каталог `.claude/` в проекте,
  который ведут из Codex или OpenCode, — это протечка абстракции.
- Не плодить миграции без пользы.

## Considered options

### Option 1: разделить слои (выбран)

Vault не переименовывается: `<vault>/.projectstore.json`, `<vault>/.projectstore/sessions/`,
`projectstore: derived` остаются как есть. Проектная сторона переезжает в `.mps/`:
конфиг привязки `.mps/projectstore.json` (legacy `.claude/projectstore.json` читается),
машинное состояние — `.mps/state/`.
**Плюсы:** vault совместим с исходником в обе стороны; ни один харнес не получает чужой
каталог; одна миграция, ограниченная проектной стороной.
**Минусы:** внутри vault имя инструмента отличается от имени CLI — это надо объяснять
(объяснено здесь и в `docs/how-it-works.md`).

### Option 2: переименовать всё в `mps`

**Плюсы:** полная номенклатурная чистота.
**Минусы:** vault перестаёт открываться исходным ProjectStore; существующие vault требуют
миграции ради косметики. Отвергнуто.

### Option 3: оставить всё как в исходнике

**Плюсы:** ноль правок.
**Минусы:** Codex/OpenCode пишут в `.claude/` — прямое нарушение цели форка. Отвергнуто.

## Decision

Принять вариант 1. Дополнительно: сгенерированные файлы ролей (`.claude/agents/`,
`.opencode/agent/`, `.codex/prompts/`) считаются коммитимыми (команда получает одинаковые
роли), а `.mps/` — машинно-локальным и попадает в `.gitignore`; `mps doctor --fix`
дописывает записи именно для `.mps/`.

## Consequences

### Positive

- Один vault можно вести из MPS и из ProjectStore.
- Проект, который ведут из Codex или OpenCode, не содержит `.claude/`, если Claude Code там
  не используется.
- `SOURCE_IGNORE` расширен на `.mps/`, `.opencode/`, `.codex/`: обвязка не считается
  исходным кодом при проверке «работа без истории».

## Negative / risks

- Разные имена в двух слоях — источник путаницы при чтении кода; смягчено комментариями в
  `scripts/lib.mjs` и таблицей в `docs/how-it-works.md`.
- Совместимость с исходником проверена по именам путей, а не запуском обоих инструментов на
  одном vault.

## Verification and follow-up

- `tests/harness.test.mjs` — конфиг создаётся в `.mps/projectstore.json`, doctor называет
  именно его; реестр сессий пишется в `<vault>/.projectstore/sessions/`.
- `mps doctor --fix` дописывает `.mps/projectstore.json` и `.mps/state/` в `.gitignore`
  (покрыто тестом «freshly bound … clean under doctor»).
