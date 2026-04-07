# Backend — Rust и Tauri

[← Назад к INDEX](INDEX.md)

## Модульная архитектура

Backend разбит на модули по функциональности:

```
src-tauri/src/
├── main.rs              (144 строк)  — точка входа, Tauri Builder
├── lib.rs               (23 строки)  — реэкспорт модулей
├── types.rs             (74 строки)  — структуры данных
├── state.rs             (56 строк)   — глобальные состояния
├── commands/              (51 команда)  — Tauri команды
│   ├── mod.rs           — реэкспорт
│   ├── app.rs           — управление приложением
│   ├── claude.rs        — взаимодействие с Claude
│   ├── toolbar.rs       — навигация и тулбар
│   ├── downloads.rs     — управление загрузками
│   ├── logs.rs          — работа с логами
│   ├── storage.rs       — хранение вкладок (файловая система)
│   ├── attachments.rs   — аттачменты
│   └── scraper.rs       — автосбор данных из Google
├── downloads/           — логика загрузок
│   ├── mod.rs
│   └── paths.rs         — пути к файлам
├── utils/               — утилиты
│   ├── mod.rs
│   ├── mime.rs          — MIME-типы
│   ├── platform.rs      — платформо-зависимые
│   └── dimensions.rs    — константы и размеры
└── webview/             — управление WebView
    ├── mod.rs
    ├── scripts.rs       — JS скрипты для инжекции
    └── manager.rs       — создание и resize webview
```

### Основные модули

| Модуль | Описание |
|--------|----------|
| `types` | Структуры: `ArchiveLogEntry`, `DownloadEntry`, `DownloadsSettings`, `FileData`, `DiagnosticEntry` |
| `state` | Глобальные: `CLAUDE_VISIBLE`, `ACTIVE_TAB`, `PANEL_RATIO`, Mutex locks |
| `commands` | 53 Tauri команды, разбитых по доменам |
| `downloads` | Пути к логам, настройкам, генерация уникальных имён |
| `utils` | MIME-типы, платформо-зависимые функции, константы |
| `webview` | JS скрипты, создание/resize webview, z-order |

---

## Полный список Tauri Commands

Всего **53 команды**. Вызов из JS: `window.__TAURI__.core.invoke('command', { params })`

### Downloads & Files (`commands/downloads.rs`)

| Команда | Параметры | Возврат | Описание |
|---------|-----------|---------|----------|
| `get_downloads_path` | — | `String` | Путь загрузок |
| `pick_downloads_folder` | — | `String` | Диалог выбора |
| `open_file` | `file_path` | — | Открыть в системе |
| `delete_download` | `file_path` | `bool` | Удалить |
| `delete_all_downloads` | — | `u32` | Очистить все |

### Logs (`commands/logs.rs`)

| Команда | Параметры | Возврат | Описание |
|---------|-----------|---------|----------|
| `get_downloads_log` | — | `Vec<DownloadEntry>` | Лог (auto-cleanup) |
| `get_archive_log` | — | `Vec<ArchiveLogEntry>` | Лог архивов |
| `add_archive_log_entry` | `tab, filename, claudeUrl, filePath?` | — | Добавить |
| `clear_archive_log` | — | — | Очистить |
| `write_diagnostic` | `event_type, details` | — | Записать диагностику |
| `export_diagnostics` | — | `String` | Экспортировать диагностику |

### Attachments (`commands/attachments.rs`)

| Команда | Параметры | Возврат | Описание |
|---------|-----------|---------|----------|
| `read_file_for_attachment` | `path` | `FileData` | Читать для вложения |
| `write_temp_file` | `filename, content` | `String` | Записать temp |
| `attach_file_to_claude` | `tab, path` | — | Прикрепить файл |
| `attach_files_batch` | `tab, paths` | — | Прикрепить несколько файлов (batch) |
| `get_upload_count` | `tab` | `u32` | Счётчик загруженных файлов |
| `reset_upload_count` | `tab` | — | Сбросить счётчик |

### Storage (`commands/storage.rs`)

| Команда | Параметры | Возврат | Описание |
|---------|-----------|---------|----------|
| `save_tabs_to_file` | `data` | — | Атомарная запись вкладок в файл (temp → rename) |
| `load_tabs_from_file` | — | `Option<String>` | Загрузка вкладок из файла |
| `delete_tabs_file` | — | — | Удалить файл вкладок |

### Claude WebView (`commands/claude.rs`)

| Команда | Параметры | Возврат | Описание |
|---------|-----------|---------|----------|
| `toggle_claude` | — | `bool` | Показать/скрыть |
| `get_active_tab` | — | `u8` | Активный таб |
| `switch_claude_tab` | `tab` | — | Переключить (навигирует на claude.ai если about:blank) |
| `switch_claude_tab_with_url` | `tab, url` | — | С навигацией |
| `get_tab_url` | `tab` | `String` | URL таба |
| `get_claude_state` | — | `(bool, u8, Vec<u8>)` | visible, active, tabs |
| `recreate_claude_tab` | `tab` | — | Пересоздать webview (для зависших табов) |
| `navigate_claude_tab` | `tab, url` | — | Навигация |
| `notify_url_change` | `tab, url` | — | От helpers.js |
| `reset_claude_state` | — | — | Сбросить |

### Claude Interaction (`commands/claude.rs`)

| Команда | Параметры | Возврат | Описание |
|---------|-----------|---------|----------|
| `eval_in_claude` | `tab, script` | — | JS fire-and-forget |
| `eval_in_claude_with_result` | `tab, script, timeout?` | `String` | JS с результатом (CDP) |
| `insert_text_to_claude` | `tab, text, autoSend` | — | Вставить текст (insertContent) |
| `inject_generation_monitor` | `tab` | — | Мониторинг генерации |
| `check_generation_status` | `tab` | `bool` | Статус генерации (читает AtomicBool) |
| `set_generation_state` | `tab, generating` | — | Установить статус генерации (из Claude WebView) |
| `init_claude_webviews` | — | — | Инициализация всех Claude webview и toolbar |

### Panel & Window (`commands/claude.rs`, `commands/app.rs`)

| Команда | Параметры | Возврат | Описание |
|---------|-----------|---------|----------|
| `set_panel_ratio` | `ratio` | — | Соотношение (35-65) |
| `get_panel_ratio` | — | `u32` | Получить |
| `get_window_width` | — | `f64` | Ширина окна |
| `set_window_background` | `r, g, b` | — | Цвет фона |

### Toolbar (`commands/toolbar.rs`)

| Команда | Параметры | Возврат | Описание |
|---------|-----------|---------|----------|
| `toolbar_back` | — | — | Назад |
| `toolbar_forward` | — | — | Вперёд |
| `toolbar_reload` | — | — | Перезагрузить |
| `toolbar_recreate` | — | — | Пересоздать webview (двойной клик reload в toolbar) |
| `show_downloads` | — | — | Показать менеджер |
| `hide_downloads` | — | — | Скрыть |

### App (`commands/app.rs`)

| Команда | Параметры | Возврат | Описание |
|---------|-----------|---------|----------|
| `reset_app_data` | — | — | Сброс данных |
| `open_app_data_dir` | — | — | Открыть папку |

> Команды `set_window_background` и `get_window_width` также в `app.rs` — см. [Panel & Window](#panel--window-commandsclauders-commandsapprs).

### SERP Scraper (`commands/scraper.rs`)

| Команда | Параметры | Возврат | Описание |
|---------|-----------|---------|----------|
| `create_scraper_webview` | — | — | Создание скрытого WebView для скрапинга |
| `destroy_scraper_webview` | — | — | Закрытие скрапер-WebView |
| `scrape_google_serp` | keyword, geo?, num_results?, lang?, queries? | Result<String> | Выполнение серии поисковых запросов в Google, извлечение и сохранение результатов |

> Скрапер создаёт невидимый WebView2, выполняет поисковые запросы, фетчит и очищает HTML каждой страницы. Результаты сохраняются как файлы для загрузки в knowledge проекта Claude.

---

## Ключевые функции по модулям

### webview/manager.rs

| Функция | Описание |
|---------|----------|
| `ensure_claude_webview(app, tab, url)` | Создание Claude WebView с обработчиками |
| `create_claude_webview(app, tab, url)` | Низкоуровневое создание без toolbar |
| `ensure_toolbar(app)` | Создание toolbar и downloads popup |
| `raise_toolbar_zorder(app)` | Поднятие z-order через Win32 `SetWindowPos(HWND_TOP)` |
| `resize_webviews(app)` | Оркестратор: вызывает layout_ui/claude/overlay |
| `allow_claude_multiple_downloads()` | Разрешение множественных загрузок с claude.ai в Chromium Preferences |
| `layout_ui(...)` | Позиция и размер UI панели |
| `layout_claude(...)` | Show/hide Claude табов |
| `layout_overlay(...)` | Позиция toolbar, hide downloads |

### webview/scripts.rs

| Функция/Константа | Описание |
|-------------------|----------|
| `CLAUDE_HELPERS_JS` | JS helpers из `scripts/claude_helpers.js` |
| `CLAUDE_COUNTER_JS` | Claude Counter (логика) из `scripts/claude_counter.js` |
| `CLAUDE_COUNTER_CSS` | Claude Counter (стили) из `scripts/claude_counter.css` |
| `CLAUDE_SELECTORS_JSON` | Селекторы из `scripts/selectors.json` |
| `CLAUDE_AUTOCONTINUE_JS` | Auto-Continue из `scripts/claude_autocontinue.js` |
| `get_claude_init_script(tab)` | Генерация init script для таба |
| `get_generation_monitor_script()` | Скрипт мониторинга генерации |

> **Примечание:** Константа `SERP_EXTRACT_JS` (из `scripts/serp_extract.js`) определена в `commands/scraper.rs`, а не в `scripts.rs`.

### downloads/paths.rs

| Функция | Описание |
|---------|----------|
| `get_app_data_dir()` | Путь к папке данных приложения |
| `get_archive_log_path()` | Путь к `archive_log.json` |
| `get_downloads_log_path()` | Путь к `downloads_log.json` |
| `get_downloads_settings_path()` | Путь к `downloads_settings.json` |
| `get_diagnostics_log_path()` | Путь к `diagnostics.json` |
| `get_custom_downloads_path()` | Чтение кастомного пути |
| `save_custom_downloads_path(path)` | Сохранение кастомного пути |
| `get_unique_filepath(dir, filename)` | Генерация уникального имени |

### utils/

| Модуль | Функции |
|--------|---------|
| `mime.rs` | `get_mime_type(extension)` — определение MIME-типа |
| `platform.rs` | `set_window_icon_from_exe()`, `open_file_in_system()`, `open_directory_in_system()` |
| `dimensions.rs` | `get_dimensions(app)`, константы `animation::*`, `sizes::*`, `limits::*` |

---

## Tauri Events

События для коммуникации между Rust и JavaScript.

### Диаграмма потока событий

```mermaid
sequenceDiagram
    participant CH as Claude WebView<br/>(helpers.js)
    participant RS as Rust Backend<br/>(webview/manager.rs)
    participant MV as Main WebView<br/>(index.html)
    participant DL as Downloads WebView

    Note over CH,MV: Навигация Claude
    CH->>RS: notify_url_change(tab, url)
    RS->>MV: emit("claude-url-changed")
    MV->>MV: checkForContinueProject()

    Note over CH,MV: Загрузка страницы
    RS->>MV: emit("claude-page-loaded")
    MV->>MV: injectGenerationMonitor()

    Note over RS,DL: Загрузка файла
    RS->>MV: emit("download-started")
    RS->>DL: emit("download-started")
    RS->>MV: emit("download-finished")
    RS->>DL: emit("refresh-downloads")
    MV->>MV: addArchiveLogEntry()

    Note over MV,DL: Закрытие popup
    DL->>RS: hide_downloads()
    RS->>MV: emit("downloads-closed")
```

### Полный список событий

| Событие | Направление | Payload | Описание |
|---------|-------------|---------|----------|
| `claude-page-loaded` | Rust → JS | `{tab: number}` | Страница Claude загружена |
| `claude-url-changed` | Rust → JS | `{tab: number, url: string}` | URL изменился |
| `download-started` | Rust → JS | `string` (filename) | Начало загрузки |
| `download-finished` | Rust → JS | `{filename, tab, url, file_path}` | Загрузка завершена |
| `download-failed` | Rust → JS | `string` (filename) | Ошибка загрузки |
| `refresh-downloads` | Rust → JS | `()` | Обновить список |
| `downloads-closed` | Rust → JS | `()` | Popup закрыт |
| `scraper-progress` | Rust → JS | `ScrapeProgress` | Прогресс скрапинга |
| `auto-continue-toast` | Claude JS → Main JS | `string` (сообщение) | Toast при автопродолжении |

---

## Synchronization & Thread Safety

### Mutex Guards (`state.rs`, `commands/scraper.rs`)

| Mutex | Назначение |
|-------|------------|
| `WEBVIEW_CREATION_LOCK` | Защита от параллельного создания Claude webview |
| `TOOLBAR_CREATION_LOCK` | Защита от race condition при создании toolbar |
| `DOWNLOADS_LOG_LOCK` | Синхронизация записи в downloads_log.json |
| `ARCHIVE_LOG_LOCK` | Синхронизация записи в archive_log.json |
| `DIAGNOSTICS_LOG_LOCK` | Синхронизация записи в diagnostics.json |
| `SCRAPER_LOCK` | Защита от параллельных операций скрапинга (`commands/scraper.rs`, `std::sync::LazyLock`) |

### Atomic State (`state.rs`)

| Переменная | Тип | Назначение |
|------------|-----|------------|
| `CLAUDE_VISIBLE` | `AtomicBool` | Видимость панели Claude |
| `ACTIVE_TAB` | `AtomicU8` | Активный таб Claude (1-3) |
| `PANEL_RATIO` | `AtomicU32` | Соотношение панелей (35-65) |
| `UPLOAD_COUNTERS` | `[AtomicU32; 3]` | Счётчики загруженных файлов по табам |
| `GENERATING_STATE` | `[AtomicBool; 3]` | Статус генерации по табам (устанавливается из Claude WebView через `set_generation_state`) |

```rust
// Пример использования (webview/manager.rs)
fn ensure_claude_webview(...) -> Result<(), String> {
    let _guard = WEBVIEW_CREATION_LOCK.lock()
        .map_err(|_| "Lock poisoned")?;
    
    if app.get_webview(&label).is_some() {
        return Ok(()); // Double-check под локом
    }
    // ... создание webview + hide()
    // ... raise_toolbar_zorder() для z-order
}

fn ensure_toolbar(...) -> Result<(), String> {
    let _guard = TOOLBAR_CREATION_LOCK.lock()
        .map_err(|_| "Lock poisoned")?;
    // ... создание toolbar/downloads + hide()
}
```

---

## Константы (`utils/dimensions.rs`)

### Анимация

| Константа | Значение | Описание |
|-----------|----------|----------|
| `ANIMATION_STEPS` | 8 | Шагов анимации панели |
| `ANIMATION_DELAY_MS` | 20 | Задержка между шагами |

### Размеры UI

| Константа | Значение | Описание |
|-----------|----------|----------|
| `TOOLBAR_WIDTH` | 152.0 | Ширина тулбара |
| `TOOLBAR_HEIGHT` | 56.0 | Высота тулбара (toolbar 42px + indicator 4px + gaps) |
| `TOOLBAR_BOTTOM_OFFSET` | 5.0 | Отступ от низа |
| `DOWNLOADS_WIDTH` | 320.0 | Ширина popup |
| `DOWNLOADS_HEIGHT` | 360.0 | Высота popup |
| `DOWNLOADS_MARGIN` | 8.0 | Отступ от тулбара |

### Лимиты

| Константа | Значение | Описание |
|-----------|----------|----------|
| `MAX_ATTACHMENT_SIZE` | 50 MB | Макс. размер аттачмента |
| `MAX_ARCHIVE_LOG_ENTRIES` | 1000 | Макс. записей в archive_log |
| `MAX_DOWNLOADS_LOG_ENTRIES` | 500 | Макс. записей в downloads_log |
| `MAX_DIAGNOSTICS_ENTRIES` | 500 | Макс. записей в diagnostics.json |

---

## CDP (Chrome DevTools Protocol)

Для получения результата из JS в Claude WebView (`commands/claude.rs`):

```rust
let cdp_params = r#"{"expression":"...","awaitPromise":true,"returnByValue":true}"#;
core.CallDevToolsProtocolMethod("Runtime.evaluate", cdp_params, &handler);
```

### CDP Timeouts

| Операция | Timeout | Пример |
|----------|---------|--------|
| DOM чтение | 5 сек | `getOrganizationId()` |
| Стандартные | 10 сек | По умолчанию |
| HTTP запросы | 30 сек | `createProjectViaAPI()` |

---

## Централизованные селекторы Claude

### Архитектура

```
src-tauri/scripts/selectors.json    ← Единый источник селекторов
        ↓
    include_str!()
        ↓
webview/scripts.rs::CLAUDE_SELECTORS_JSON
        ↓
get_claude_init_script()
        ↓
window._s                      ← Доступно в Claude WebView
```

**При обновлении Claude.ai редактировать ТОЛЬКО** `src-tauri/scripts/selectors.json`

См. [TROUBLESHOOTING-SELECTORS.md](reference/TROUBLESHOOTING-SELECTORS.md)

---

## Добавление новых команд

1. Определить модуль: `commands/app.rs`, `commands/claude.rs`, etc.
2. Добавить функцию с `#[tauri::command]`
3. Реэкспортировать в `commands/mod.rs`
4. Зарегистрировать в `main.rs` в `invoke_handler`

```rust
// commands/mymodule.rs
#[tauri::command]
pub fn my_command(param: String) -> Result<String, String> {
    Ok(format!("Hello, {}", param))
}

// commands/mod.rs
pub use mymodule::my_command;

// main.rs
.invoke_handler(tauri::generate_handler![
    // ...
    commands::my_command,
])
```

---

## Связанные документы

- [02-FRONTEND.md](02-FRONTEND.md) — JavaScript модули
- [04-CLAUDE.md](04-CLAUDE.md) — Интеграция с Claude
- [TROUBLESHOOTING-SELECTORS.md](reference/TROUBLESHOOTING-SELECTORS.md) — Диагностика селекторов
