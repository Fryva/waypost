# ADR-0002: Layout `engineering` как стандарт, vault — markdown в git

- Status: proposed
- Date: 2026-08-28
- Deciders: не утверждено владельцем проекта; статус `proposed`
- Supersedes: —
- Superseded by: —
- Related: `scaffold/layouts/engineering.json`, `README.md`, `AGENTS.md`
- code_refs: ["scaffold/layouts/engineering.json", "bin/mps", "AGENTS.md", "README.md", "tests/harness.test.mjs"]

## Context

ProjectStore определяет структуру vault через layouts (JSON). Единственный поставляемый layout —
`engineering` (adr/, specs/, epics/<id>/stories/, research/, concepts/, meetings/, ops/, diagrams/).
Форк должен решить, какой layout использовать по умолчанию и где хранить vault.

## Decision drivers

- Совместимость с исходником (layouts/шаблоны переиспользуются как есть).
- Vault — plain markdown в git: переносимость, git, Obsidian/GitHub-рендер, никакого сервера.
- Конфиг привязки — в проекте (`.mps/projectstore.json`), чтобы vault «ехал» с репо.

## Considered options

### Option 1: layout `engineering` по умолчанию, vault в git (выбран)
`mps bind` использует `engineering`, если не указано иное; vault — markdown в git; конфиг —
`.mps/projectstore.json` в корне проекта.
**Плюсы:** совместимо с исходником, минимум новых решений, переносимость.
**Минусы:** layout-структура фиксирована (не гибкая под продуктовые/дата-проекты).

### Option 2: кастомизация через `mps bind --layout <name>`
Поддержать выбор layout при привязке.
**Плюсы:** гибкость.
**Минусы:** пока поставляется только `engineering`, так что выбор ничего не меняет.
Компромисс: флаг реализован и валидируется (неизвестное имя отвергается с перечислением
доступных), но дефолт остаётся `engineering` — вариант 1 в силе.

### Option 3: vault вне git (внешний каталог-хранилище)
Не привязывать vault к репо.
**Плюсы:** vault можно шарить между репо.
**Минусы:** теряется «vault едет с проектом», усложняется навигация. Отвергнуто.

## Decision

Принять вариант 1: layout `engineering` по умолчанию; vault — plain markdown в git; конфиг
привязки — `.mps/projectstore.json` в корне проекта (vault может жить в том же репо или в
отдельном vault-репо для команд).

## Consequences

### Positive

- Полная совместимость с исходным выбранным layout и шаблонами.
- Vault переносим: git, GitHub/Obsidian/любой редактор; no-proprietary format.

### Negative / risks

- Фиксированная структура layout требует нового layout-файла для не-engineering проектов.
- Vault в отдельном репо требует ручной навигации между репо проекта и vault-репо.

## Verification and follow-up

- `bin/mps bind <vault>` создаёт структуру `engineering` и `.mps/projectstore.json`
  (проверено тестом «bind scaffolds the layout…» в `tests/harness.test.mjs`).
- `bin/mps status` корректно читает `vault_path`/`layout`.
- `--layout`/`--lang` реализованы и валидируются до записи: неизвестное значение отвергается,
  ничего не пишется (тест «bind rejects an unknown layout or language»).
