# Как устроен MPS

MultiProjectStore — харнес-агностичный форк ProjectStore. Ядро (vault, layouts,
шаблоны, doctor/graph/codemap/reconcile/draft/kanban) перенесено как есть;
интерфейсный слой Claude Code (slash-команды, hooks, statusLine, spawn subagents)
заменён на единый CLI `mps`, нейтральные определения ролей и адаптеры под
конкретные харнесы.

## Vault

Vault — каталог с артефактами как plain markdown в git. Layout по умолчанию —
`engineering` (`scaffold/layouts/engineering.json`):

```
vault/
  adr/        <slug>.md
  specs/      <slug>.md
  epics/      <id>/epic.md, <id>/stories/story-<slug>.md
  research/   <slug>.md
  concepts/   <slug>.md
  meetings/   <date>-<slug>.md
  ops/        <slug>.md
  diagrams/
  kanban.md    (derived)
  graph.md     (derived)
  code-map.md  (derived)
  .projectstore.json      политика vault (spec_policy, lifecycle_gates)
  .projectstore/sessions/ реестр активных сессий (не коммитится)
```

Vault остаётся совместимым с исходным ProjectStore: имена служебных файлов внутри
vault не переименованы, поэтому один и тот же vault открывается обоими
инструментами (ADR-0004).

## Проверенный цикл

задача → артефакт (ADR / spec / epic / story) → critic → бэклог → planner →
reviewer → done. Каждый шаг проверки — отдельный проход со свежим контекстом,
а механическую часть берёт на себя детерминированный `mps doctor` (без LLM).

## Единый CLI

`bin/mps` — диспетчер: он владеет всеми записями на диск, а скрипты в `scripts/`
остаются чистым вычислением и печатают JSON. Именно поэтому doctor может
перезапустить генератор и сравнить результат с тем, что лежит на диске.

| Команда | Что делает |
|---|---|
| `mps bind <vault>` | привязать vault и развернуть layout (`--layout`, `--lang`, `--force`) |
| `mps scaffold` | до-создать папки layout и их README-индексы |
| `mps brief` | пакет ориентации на старте сессии (замена SessionStart-хука) |
| `mps draft <kind> "<title>" [--write]` | черновик артефакта; `--write` создаёт и пересобирает представления |
| `mps story plan\|close <path> [--write]` | гейты жизненного цикла истории |
| `mps kanban` / `graph` / `codemap` | пересоздать одно производное представление |
| `mps reconcile [--write]` | пересобрать все представления и индексы |
| `mps doctor [--install\|--vault] [--fix]` | детерминированная диагностика |
| `mps diff-refs` | изменённые файлы как доказательная база для `code_refs` |
| `mps agents …` | роли: list / show / install / register / model |
| `mps prompt [name]` / `mps skill [name]` | процедуры цикла и скиллы |
| `mps sessions [--touch] [--file]` | реестр активных сессий |
| `mps status` | сводка привязки и состояния ролей |
| `mps tokens` | стоимость цикла по транскриптам Claude Code (единственная харнес-специфичная команда) |

## Роли агентов в трёх харнесах

Одно определение роли — `agents/<role>.md` с нейтральным frontmatter
(`model: reasoning|balanced|fast`, `effort`, `access`, `tools`). `mps agents install`
рендерит его в формат каждого харнеса:

| Харнес | Файл | Во что превращается |
|---|---|---|
| Claude Code | `.claude/agents/mps-<role>.md` | субагент (`mps-critic`, …) |
| OpenCode | `.opencode/agent/mps-<role>.md` | агент `mode: subagent` с картой инструментов |
| Codex | `.codex/prompts/mps-<role>.md` | пользовательский промпт (`/mps-critic`) |
| любой другой | — | `mps agents show <role>` как системный промпт |

Каждый сгенерированный файл несёт строку происхождения с хешем источника —
по ней `mps doctor` отличает «установлено и актуально» от «устарело», а
`mps agents uninstall` понимает, какие файлы его.

`mps agents register` пишет блок маршрутизации между маркерами в `AGENTS.md`
(и `CLAUDE.md`, если он есть): когда какую роль звать. Повторный запуск заменяет
блок на месте, а не дублирует его.

## Doctor

`mps doctor` — детерминированная проверка без AI:

- **install**: привязка, layout и шаблоны, роли по харнесам, блок маршрутизации,
  `.gitignore`, git в vault.
- **vault**: статусы ↔ доска ↔ индексы, допустимые имена/slug, критерии приёмки,
  ссылки (wikilinks и относительные), `code_refs`, гейты spec/lifecycle.
- `--fix` чинит только механическое: записи в `.gitignore`, `git init` в vault,
  перегенерацию ролей и блока маршрутизации. Vault чинится `mps reconcile --write`.

## Пути и окружение

- `MPS_PROJECT_DIR` — корень проекта (fallback: `CLAUDE_PROJECT_DIR`, cwd).
- `MPS_HOME` — корень инструмента (fallback: `CLAUDE_PLUGIN_ROOT`, каталог выше `scripts/`).
- `MPS_SESSION_ID` — идентификатор сессии для реестра (иначе `<host>-<ppid>`).
- Конфиг привязки — `.mps/projectstore.json` (legacy — `.claude/projectstore.json`).

## Что изменено относительно ProjectStore

| Было (Claude Code) | Стало (MPS) |
|---|---|
| slash-команды `/projectstore:*` | `bin/mps` + процедуры `mps prompt <name>` |
| hooks (SessionStart/PreToolUse/Stop/PreCompact) | `mps brief`, `mps sessions --touch [--file]` по правилу |
| statusLine | нет (снято вместе с обвязкой) |
| субагенты только Claude | `agents/*.md` + адаптеры на три харнеса |
| `CLAUDE_*`, `.claude/.projectstore/` | `MPS_*`, `.mps/` |
| marketplace/auto-update проверки | нет; версия берётся из `package.json` |

Ядро сохранено без изменений по смыслу: `lib`, `doctor`, `graph`, `codemap`,
`reconcile`, `draft`, `kanban`, `diff-refs`, `story-section`, `tokens`, layouts,
шаблоны, механика vault.

## Тесты

`npm test` (или `node --test tests/*.test.mjs`) — предикаты ядра, скрипты
(draft/reconcile/graph/story-section), локали и харнес-слой (роли, адаптеры, CLI).
