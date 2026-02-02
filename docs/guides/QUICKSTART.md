# Быстрый старт для разработчика

[← Назад к INDEX](../INDEX.md)

## Требования

| Компонент | Версия | Установка |
|-----------|--------|-----------|
| **Rust** | 1.75+ (рекомендуется 1.80+) | [rustup.rs](https://rustup.rs) |
| **Tauri CLI** | 2.0+ | `cargo install tauri-cli` |
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org) |
| **WebView2 Runtime** | Latest | [Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |

> **Windows only:** Проект использует Windows-specific APIs и WebView2.

---

## Первый запуск (2 минуты)

```bash
# 1. Клонируй репозиторий
git clone https://github.com/IllWicked/ai-prompts-manager.git
cd ai-prompts-manager

# 2. Запусти в dev-режиме
cd src-tauri
cargo tauri dev
```

При первом запуске Cargo скачает и скомпилирует зависимости (~2-5 минут).

---

## Структура проекта за 2 минуты

```
ai-prompts-manager/
├── dist/                    # 🎨 Frontend (то, что видит пользователь)
│   ├── index.html           # Главный UI + подключение JS модулей
│   ├── toolbar.html         # Тулбар над Claude
│   ├── downloads.html       # Менеджер загрузок
│   ├── css/styles.css       # Стили
│   └── js/                  # 35 JavaScript модулей
│
├── src-tauri/               # ⚙️ Backend (Rust)
│   ├── src/                 # Модульная структура (20 файлов)
│   │   ├── main.rs          # Точка входа (~131 строка)
│   │   ├── commands/        # Tauri команды (45 команд)
│   │   ├── webview/         # Управление WebView
│   │   └── utils/           # Утилиты
│   ├── scripts/
│   │   └── claude_helpers.js # Инжектируется в Claude WebView
│   └── tauri.conf.json      # Конфигурация Tauri
│
├── prompts/                 # 📝 Вкладки с промптами (создаётся при первом push)
│   ├── manifest.json        # Манифест версий
│   └── *.json               # Файлы вкладок
│
├── project-manager/         # 🛠 CLI для управления промптами и релизами
│   └── project-manager.py   # Скрипт управления (push/pull промптов, release)
│
├── tests/                   # 🧪 Unit-тесты (Jest)
│   ├── unit/                # Тестовые файлы по модулям
│   └── mocks/               # Моки (localStorage, DOM, AppState)
│
└── docs/                    # 📚 Документация
```

---

## Куда смотреть при разработке

### Добавить UI-функцию
```
dist/js/*.js          — 35 JavaScript модулей (~290 функций)
dist/index.html       — HTML разметка + подключение модулей
dist/css/styles.css   — стили (TailwindCSS)
```

### Добавить Tauri command
```
src-tauri/src/commands/   — Tauri команды (6 модулей, 45 команд)
src-tauri/src/main.rs     — регистрация команд в invoke_handler
```

### Изменить селекторы Claude.ai
```
src-tauri/scripts/selectors.json   ← Единственный файл для редактирования
```

### Изменить поведение в Claude WebView
```
src-tauri/scripts/claude_helpers.js
```

---

## Ключевые файлы

| Файл | Что делает |
|------|------------|
| `dist/index.html` | UI + подключение JS модулей (основной файл frontend) |
| `src-tauri/src/main.rs` | Точка входа Rust, регистрация команд |
| `src-tauri/src/commands/` | Tauri команды (45 команд в 6 модулях) |
| `dist/js/claude-api.js` | Claude интеграция |
| `dist/js/workflow-render.js` | Рендеринг workflow |
| `dist/js/remote-prompts.js` | Обновление промптов |

---

## Типичные задачи

### Задача: Добавить новую кнопку в UI

1. **HTML** — добавь в `dist/index.html`
2. **Стили** — добавь классы в `dist/css/styles.css`
3. **Логика** — добавь обработчик в inline JS или создай модуль в `dist/js/`

### Задача: Добавить Tauri command

1. **Выбери модуль** в `src-tauri/src/commands/`:
   - `app.rs` — управление приложением
   - `claude.rs` — взаимодействие с Claude
   - `toolbar.rs` — навигация и тулбар
   - `downloads.rs` — управление загрузками
   - `logs.rs` — работа с логами
   - `attachments.rs` — вложения

2. **Добавь функцию** в выбранный модуль (например `commands/app.rs`):
```rust
#[tauri::command]
pub fn my_command(param: String) -> Result<String, String> {
    Ok(format!("Hello {}", param))
}
```

3. **Реэкспортируй** в `commands/mod.rs`:
```rust
pub use app::my_command;
```

4. **Зарегистрируй** в `main.rs` в `.invoke_handler()`:
```rust
.invoke_handler(tauri::generate_handler![
    // ... существующие
    commands::my_command,
])
```

5. **Вызов из JS**:
```javascript
const result = await window.__TAURI__.core.invoke('my_command', { param: 'World' });
```

→ Подробнее: [03-BACKEND.md](../03-BACKEND.md#добавление-новых-команд)

### Задача: Исправить сломавшийся селектор Claude

1. Открой приложение
2. В Claude WebView нажми F12 (DevTools)
3. Найди элемент через Inspector
4. Обнови селектор в `src-tauri/scripts/selectors.json`
5. Перезапусти `cargo tauri dev`

→ Подробнее: [TROUBLESHOOTING-SELECTORS.md](../reference/TROUBLESHOOTING-SELECTORS.md)

---

## Полезные команды

```bash
# Dev-режим с hot reload
cd src-tauri && cargo tauri dev

# Production сборка
cd src-tauri && cargo tauri build

# Unit-тесты
npm test                    # Все тесты
npm run test:watch          # Watch mode
npm run test:storage        # Конкретный модуль

# Управление промптами и релизами
python project-manager.py

# Очистка кэша сборки
cd src-tauri && cargo clean
```

---

## Debug Mode

Для детального логирования:

1. Открой `dist/js/config.js`
2. Установи `DEBUG = true`
3. Смотри консоль Main WebView (F12)

---

## Следующие шаги

- [01-OVERVIEW.md](../01-OVERVIEW.md) — архитектура приложения
- [02-FRONTEND.md](../02-FRONTEND.md) — JavaScript модули
- [03-BACKEND.md](../03-BACKEND.md) — Tauri commands
- [04-CLAUDE.md](../04-CLAUDE.md) — интеграция с Claude
- [CONTRIBUTING.md](CONTRIBUTING.md) — troubleshooting
