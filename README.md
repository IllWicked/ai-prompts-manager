# AI Prompts Manager

Desktop-приложение для управления промптами с интеграцией Claude AI.

**Версия:** 4.2.0 | **Платформа:** Windows | **Фреймворк:** Tauri 2.0 + Rust

## Возможности

- **Workflow редактор** — визуальное редактирование промптов с drag & drop и связями между блоками
- **Встроенный Claude AI** — три независимых чата Claude прямо в приложении
- **Автоматизация** — создание проектов и чатов через API, auto-send, прикрепление файлов
- **Система языков** — автоматическое склонение и замена языков в промптах (20 языков)
- **Встроенные скрипты** — convert.py, count.py, spellcheck.py
- **Export/Import** — обмен вкладками через JSON
- **Автообновление** — приложения и промптов через GitHub

## Быстрый старт

### Требования

- Windows 10/11
- [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
- Rust 1.75+ (для разработки)

### Установка (пользователь)

Скачайте последний релиз из [GitHub Releases](https://github.com/IllWicked/ai-prompts-manager/releases).

### Разработка

```bash
git clone https://github.com/IllWicked/ai-prompts-manager.git
cd ai-prompts-manager/src-tauri
cargo tauri dev
```

## Структура проекта

```
ai-prompts-manager/
├── dist/                    # Frontend (HTML + 35 JS модулей + CSS)
├── src-tauri/               # Backend (Rust, 20 файлов, 45 Tauri команд)
├── docs/                    # Документация
├── tests/                   # Unit-тесты (Jest)
└── project-manager/         # CLI управления промптами
```

## Документация

Полная документация: [docs/INDEX.md](docs/INDEX.md)

| Документ | Описание |
|----------|----------|
| [QUICKSTART](docs/guides/QUICKSTART.md) | Быстрый старт для разработчика |
| [01-OVERVIEW](docs/01-OVERVIEW.md) | Архитектура приложения |
| [02-FRONTEND](docs/02-FRONTEND.md) | JavaScript модули |
| [03-BACKEND](docs/03-BACKEND.md) | Rust backend и Tauri commands |
| [04-CLAUDE](docs/04-CLAUDE.md) | Интеграция с Claude AI |
| [CHANGELOG](docs/reference/CHANGELOG.md) | История изменений |

## Тестирование

```bash
npm test              # Все тесты
npm run test:watch    # Watch mode
```

Подробнее: [tests/README.md](tests/README.md)

## Лицензия

Приватный проект. © IllWicked
