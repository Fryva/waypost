# MultiProjectStore rules

Единый источник правил — `AGENTS.md` в корне; `.claude/CLAUDE.md` только ссылается на него
(`@AGENTS.md`), а `opencode.json` подключает его через `instructions`.

Этот каталог — вспомогательный слой для правил, специфичных для Claude Code. Технические
правила здесь не дублируются: структура vault, CLI, роли агентов и процесс ADR описаны в
`AGENTS.md` и `docs/decisions/`.

Роли агентов не живут здесь: их источник — `agents/*.md`, а нативные файлы харнесов
(`.claude/agents/`, `.opencode/agent/`, `.codex/prompts/`) генерирует `mps agents install`.
