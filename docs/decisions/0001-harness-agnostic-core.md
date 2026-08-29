# ADR-0001: Харнес-агностичное ядро: единый CLI вместо hooks/slash-команд

- Status: proposed
- Date: 2026-08-28
- Deciders: не утверждено владельцем проекта; статус `proposed`
- Supersedes: —
- Superseded by: —
- Related: `bin/mps`, `scripts/*.mjs`, `AGENTS.md`, `opencode.json`
- code_refs: ["bin/mps", "scripts/lib.mjs", "scripts/doctor.mjs", "scripts/graph.mjs", "scripts/codemap.mjs", "scripts/reconcile.mjs", "scripts/draft.mjs", "scripts/kanban.mjs", "scripts/agents.mjs", "scripts/brief.mjs", "scripts/sessions.mjs", "tests/harness.test.mjs", "AGENTS.md", "opencode.json"]

## Context

Исходный ProjectStore — плагин Claude Code: slash-команды (`/projectstore:adr`), hooks
(SessionStart/PreToolUse/Stop/PreCompact), statusLine и spawn subagents. Весь интерфейсный
слой завязан на CLI Claude Code и на env/пути `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`,
`.claude/settings.local.json`. Ядро (vault, layouts, шаблоны, doctor/graph/codemap/reconcile/
draft/kanban) — чистый node, markdown в git, харнес-агностично.

Цель форка — работать одинаково из Claude Code, Codex и OpenCode. Claude-обвязка
(slash-команды/hooks/statusLine) у Codex и OpenCode недоступна вовсе или несовместима.

## Decision drivers

- Один и тот же рабочий процесс независимо от харнеса.
- Не переписывать проверенное ядро исходника; только заменить интерфейсный слой.
- Минимум внешних зависимостей (ноль: чистый node).
- Обратная совместимость путей config для возможного Claude-плагина.

## Considered options

### Option 1: единый нейтральный CLI `mps` (выбран)
Диспетчер `bin/mps` вызывает ядровые скрипты и печатает JSON одинаково для всех харнесов.
Пути в `lib.mjs` заменены на нейтральные `MPS_PROJECT_DIR`/`MPS_HOME` с fallback на `CLAUDE_*`
и на `.mps/projectstore.json` (legacy — `.claude/projectstore.json`). Общие правила — в
`AGENTS.md`, который читают все три харнеса (Claude через `@AGENTS.md`, OpenCode через
`opencode.json` instructions).
**Плюсы:** один вход, харнес-агностично, ядро переиспользуется целиком.
**Минусы:** нет нативного slash-интерфейса (привычного в Claude); требует ручного вызова.

### Option 2: сохранить slash-команды + отдельный CLI
Полный клон обвязки Claude (commands/, hooks/, statusline/) плюс отдельный CLI.
**Плюсы:** максимальная совместимость с Claude.
**Минусы:** дублирование интерфейсов, часть харнесов не получает slash-команд, больше
поддержки. Отвергнуто — противоречит харнес-агностичности.

### Option 3: только документация к ядру без CLI
Оставить как есть (исходник), добавить только правила.
**Плюсы:** ноль правок кода.
**Минусы:** нет единого интерфейса; каждый харнес по-своему вызывает скрипты. Отвергнуто.

## Decision

Принять вариант 1: харнес-агностичное ядро с единым CLI `bin/mps`. Vault-механика исходника
переиспользуется как есть; интерфейсный слой (команды/hooks/statusLine/spawn-agents) заменён
одним диспетчером и общими правилами в `AGENTS.md`/`opencode.json`. Пути нейтрализованы в
`scripts/lib.mjs`.

## Consequences

### Positive

- Один и тот же цикл «задача → артефакт → doctor → производные представления» из любого харнеса.
- Ядро ProjectStore (проверенные doctor/graph/codemap/reconcile/draft/kanban) работает без
  переписывания.
- Ноль внешних зависимостей; минимум дублирования.

### Negative / risks

- Нет нативных slash-команд/statusLine, привычных пользователям Claude Code.
- CLI требует явного вызова агентом (дисциплина правил), а не hook-инжекции.
- Адаптация путей в `lib.mjs` — единственная правка ядра; при пересборке из исходника её нужно
  сохранять.

## Verification and follow-up

- Первая редакция этого ADR утверждала, что CLI «запущен вручную в тестовом vault». Это было
  неверно: в том состоянии ни один скрипт не парсился — массовая замена `/projectstore:X` на
  `"mps X"` порвала строковые литералы во всех `scripts/*.mjs`. Исправлено 2026-08-29 вместе с
  самим кодом; запись оставлена как предупреждение о самоподтверждающей проверке.
- Фактическая проверка (2026-08-29): `node --check` по всем `scripts/*.mjs` и `bin/mps`;
  сквозной прогон `bind → scaffold → draft adr|epic|story --write → story plan|close --write →
  kanban/graph/codemap → doctor --fix → brief → agents install/register` во временном проекте;
  `node --test tests/*.test.mjs` — 189 тестов зелёные.
- Это инфраструктура/инструмент; живая проверка на устройствах неприменима. Поведение внутри
  самих Codex и OpenCode владельцем проекта не проверялось.
