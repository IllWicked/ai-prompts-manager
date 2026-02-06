# AI Prompts Manager — Документация

> **Версия:** 4.2.5 | [CHANGELOG](reference/CHANGELOG.md)

## Быстрый старт

```bash
cd src-tauri && cargo tauri dev
```

**Новый разработчик?** → [QUICKSTART](guides/QUICKSTART.md)

---

## Архитектура

```
┌─────────────────────────────────────────────────┐
│                  Main Window                     │
├───────────────────┬─────────────────────────────┤
│   Main WebView    │   Claude WebView (Tab 1-3) │
│   (UI приложения) │   (claude.ai)              │
│   - index.html    ├─────────────────────────────┤
│   - 35 JS модулей │   Toolbar + Downloads       │
└───────────────────┴─────────────────────────────┘
```

```
┌──────────┐    invoke()    ┌──────────┐    CDP     ┌──────────┐
│  index   │ ─────────────► │  main.rs │ ────────► │  Claude  │
│  .html   │ ◄───────────── │  (Rust)  │ ◄──────── │  WebView │
└──────────┘    result      └──────────┘   result  └──────────┘
     │                           │
     │  localStorage             │  App Data Dir
     ▼                           ▼
┌──────────┐              ┌──────────┐
│  Tabs,   │              │  Logs,   │
│  Settings│              │  Settings│
└──────────┘              └──────────┘
```

---

## Навигация

### Архитектура

| Документ | Описание |
|----------|----------|
| [01-OVERVIEW](01-OVERVIEW.md) | Архитектура, структура проекта |
| [02-FRONTEND](02-FRONTEND.md) | JavaScript модули |
| [03-BACKEND](03-BACKEND.md) | Rust backend, Tauri commands |
| [04-CLAUDE](04-CLAUDE.md) | Интеграция с Claude.ai |
| [05-FEATURES](05-FEATURES.md) | Language, Theme, Attachments |
| [06-ADDITIONAL-WEBVIEWS](06-ADDITIONAL-WEBVIEWS.md) | Toolbar, Downloads |

### Frontend (`frontend/`)

| Документ | Описание |
|----------|----------|
| [DATA-STRUCTURES](frontend/DATA-STRUCTURES.md) | Tab, Block, Workflow State |
| [INDEX-HTML-API](frontend/INDEX-HTML-API.md) | API reference (функции) |
| [INDEX-HTML](frontend/INDEX-HTML.md) | Каталог функций по назначению |
| [WORKFLOW](frontend/WORKFLOW.md) | state, zoom, render, connections |
| [CLAUDE-API](frontend/CLAUDE-API.md) | claude-state, claude-api |
| [APPSTATE](frontend/APPSTATE.md) | Shared State |
| [UTILS](frontend/UTILS.md) | config, utils, storage |
| [TABS-BLOCKS](frontend/TABS-BLOCKS.md) | tabs.js, blocks.js, undo.js |
| [EMBEDDED-SCRIPTS](frontend/EMBEDDED-SCRIPTS.md) | embedded-scripts, languages |

### Guides (`guides/`)

| Документ | Описание |
|----------|----------|
| [QUICKSTART](guides/QUICKSTART.md) | Быстрый старт |
| [CONTRIBUTING](guides/CONTRIBUTING.md) | Разработка |
| [TESTING](guides/TESTING.md) | Чеклист тестирования |
| [PROMPTS-WORKFLOW](guides/PROMPTS-WORKFLOW.md) | Работа с промптами |
| [SETUP_GITHUB](guides/SETUP_GITHUB.md) | Настройка GitHub |

### Reference (`reference/`)

| Документ | Описание |
|----------|----------|
| [CHANGELOG](reference/CHANGELOG.md) | История изменений |
| [FAQ](reference/FAQ.md) | Часто задаваемые вопросы |
| [GLOSSARY](reference/GLOSSARY.md) | Глоссарий терминов |
| [LIMITATIONS](reference/LIMITATIONS.md) | Ограничения |
| [ADR](reference/ADR.md) | Архитектурные решения |
| [SECURITY](reference/SECURITY.md) | Безопасность |
| [DATA-MIGRATIONS](reference/DATA-MIGRATIONS.md) | Версионирование данных |
| [PROJECT-MANAGER](reference/PROJECT-MANAGER.md) | CLI управления |
| [TROUBLESHOOTING-SELECTORS](reference/TROUBLESHOOTING-SELECTORS.md) | Диагностика селекторов |

### Tests

| Документ | Описание |
|----------|----------|
| [tests/README](../tests/README.md) | Документация unit-тестов |

---

## Quick Reference

### Горячие клавиши (Workflow)

| Клавиша | Действие |
|---------|----------|
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+Scroll` | Zoom |
| `Space+Drag` | Pan |
| `Ctrl+Click` | Multi-select |
| `Ctrl+A/C/V` | Select all / Copy / Paste |
| `Delete` | Delete selected |
| `F2` | Rename block |

### localStorage Keys

| Ключ | Описание |
|------|----------|
| `ai-prompts-manager-tabs` | Данные вкладок |
| `ai-prompts-manager-settings` | Настройки |
| `workflow-{tabId}` | Позиции и связи workflow |
| `claudeSettings` | Состояние Claude панели |
| `active-project` | Привязка к проекту |

---

## Структура проекта

```
ai-prompts-manager/
├── dist/                    # Frontend
│   ├── index.html           # UI + подключение JS модулей
│   ├── js/                  # 35 JS модулей
│   └── css/                 # Стили
│
├── src-tauri/               # Backend
│   ├── src/main.rs          # Rust код
│   └── scripts/             # Инжектируемые скрипты
│
├── tests/                   # Unit-тесты (Jest)
├── docs/                    # Документация
└── project-manager/         # CLI управления
```

---

## Алфавитный указатель

| Термин | Документ |
|--------|----------|
| Active Project | [04-CLAUDE](04-CLAUDE.md) |
| AppState | [frontend/APPSTATE](frontend/APPSTATE.md) |
| Block | [frontend/DATA-STRUCTURES](frontend/DATA-STRUCTURES.md) |
| Block Automation | [frontend/TABS-BLOCKS](frontend/TABS-BLOCKS.md) |
| CDP | [03-BACKEND](03-BACKEND.md) |
| Claude WebView | [01-OVERVIEW](01-OVERVIEW.md) |
| Connection | [frontend/WORKFLOW](frontend/WORKFLOW.md) |
| Downloads Manager | [06-ADDITIONAL-WEBVIEWS](06-ADDITIONAL-WEBVIEWS.md) |
| Dynamic Input | [05-FEATURES](05-FEATURES.md) |
| eval_in_claude | [03-BACKEND](03-BACKEND.md) |
| Export/Import | [frontend/INDEX-HTML](frontend/INDEX-HTML.md) |
| File Attachments | [05-FEATURES](05-FEATURES.md) |
| Language System | [05-FEATURES](05-FEATURES.md) |
| localStorage | [reference/LIMITATIONS](reference/LIMITATIONS.md) |
| ProseMirror | [04-CLAUDE](04-CLAUDE.md) |
| Project Binding | [04-CLAUDE](04-CLAUDE.md) |
| Remote Prompts | [frontend/UTILS](frontend/UTILS.md) |
| Selectors | [04-CLAUDE](04-CLAUDE.md) |
| STORAGE_KEYS | [frontend/UTILS](frontend/UTILS.md) |
| Tab | [frontend/DATA-STRUCTURES](frontend/DATA-STRUCTURES.md) |
| Tauri command | [03-BACKEND](03-BACKEND.md) |
| Theme | [05-FEATURES](05-FEATURES.md) |
| Toolbar | [06-ADDITIONAL-WEBVIEWS](06-ADDITIONAL-WEBVIEWS.md) |
| Undo/Redo | [frontend/TABS-BLOCKS](frontend/TABS-BLOCKS.md) |
| Workflow | [frontend/WORKFLOW](frontend/WORKFLOW.md) |

→ Полный глоссарий: [reference/GLOSSARY](reference/GLOSSARY.md)
