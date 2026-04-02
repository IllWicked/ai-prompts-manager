# Функции приложения

[← Назад к INDEX](INDEX.md)

## Language Detection System

Детекция и замена языков в тексте с автоматическим склонением и поддержкой мультигео.

### Архитектура

Система использует **автоматическое склонение** прилагательных. Для каждого языка хранятся только базовые формы:

```javascript
en: {
    lang: 'английский',      // склоняется автоматически (24 формы)
    native: 'англоязычный',  // склоняется автоматически (24 формы)
    country: 'Великобритания', // название страны (без склонения)
    locale: 'en-GB',         // код локали (BCP 47)
}
```

### Функции склонения

| Функция | Описание |
|---------|----------|
| `generateAdjectiveForms(word)` | Генерирует все 24 формы (6 падежей × 4 рода) |

### Маркерная система

| Функция | Описание |
|---------|----------|
| `getActiveLanguageData()` | Данные языка с учётом страны |
| `insertLanguageFormAtCursor(textarea)` | Вставка формы (для модалки) |
| `showLanguageFormMenu(textarea, anchorBtn)` | Унифицированное меню форм с подменю падежей |

### Меню вставки форм

Кнопка "Язык" в тулбаре редактирования открывает меню выбора формы для вставки:

```
┌───────────────────────────┐
│ французский       язык ▶  │ ──┐
├───────────────────────────┤   │   ┌─────────────────────────────┐
│ франкоязычный  носитель ▶ │   └─▶ │ МУЖСКОЙ РОД                │
├───────────────────────────┤       │ французский   именительный  │
│ Канада            страна  │       │ французского   родительный  │
│ fr-CA               код   │       │ французскому    дательный   │
└───────────────────────────┘       │ ...                         │
                                    │ ЖЕНСКИЙ РОД                 │
                                    │ французская   именительный  │
                                    │ ...                         │
                                    └─────────────────────────────┘
```

**Расположение кнопки:**
- Тулбар редактирования (при редактировании блока в основном интерфейсе)
- Модалка редактирования блока (при двойном клике на блок в workflow)

**Структура меню:**
- `lang` — прилагательное языка с подменю падежей (24 формы)
- `native` — "носитель языка" с подменю падежей (24 формы)
- `country` — название страны (просто вставка)
- `locale` — код локали, например `fr-CA` (просто вставка)

### Пример работы маркеров

Промпт с маркерами — один текст работает на все 25 языков:

```
// Данные блока (хранятся маркеры):
'для {{native:gen.f}} аудитории в {{lang:pre.m}} сегменте'

// При языке = EN отображается:
'для англоязычной аудитории в английском сегменте'

// При языке = DE отображается:
'для немецкоязычной аудитории в немецком сегменте'

// Маркеры {{country}} и {{locale}} тоже раскрываются:
'Страна: {{country}}'  →  'Страна: Великобритания' / 'Страна: Германия'
'Локаль: {{locale}}'   →  'Локаль: en-GB' / 'Локаль: de-DE'
```

### Поддерживаемые языки

25 языков в `languages.js`, из них 7 с поддержкой мультигео (выбор страны):

| Код | Язык | Мультигео |
|-----|------|-----------|
| en | английский | 🌍 6 стран (US, GB, CA, AU, NZ, IE) |
| de | немецкий | 🌍 6 стран (DE, AT, CH, BE, LI, LU) |
| es | испанский | 🌍 2 страны (ES, PE) |
| fr | французский | 🌍 5 стран (FR, CA, CH, BE, LU) |
| nl | голландский | 🌍 2 страны (NL, BE) |
| pt | португальский | 🌍 2 страны (PT, BR) |
| se | шведский | 🌍 2 страны (SE, FI) |
| bg | болгарский | — |
| cz | чешский | — |
| dk | датский | — |
| et | эстонский | — |
| fi | финский | — |
| ga | ирландский | — |
| gr | греческий | — |
| hr | хорватский | — |
| hu | венгерский | — |
| is | исландский | — |
| it | итальянский | — |
| lb | люксембургский | — |
| lv | латышский | — |
| no | норвежский | — |
| pl | польский | — |
| ro | румынский | — |
| sk | словацкий | — |
| sl | словенский | — |

### Мультигео система

Для языков en, de, es, fr, nl, pt, se в селекторе появляется подменю выбора страны.

При выборе страны меняются поля `country` (название страны) и `locale` (код локали).

```javascript
// Вспомогательные функции
hasCountrySelection('en');  // true
getCountriesForLanguage('en');  
// → [{code: 'us', name: 'США', locale: 'en-US'}, ...]
getLanguageWithCountry('en', 'us');  
// → { lang: 'английский', native: 'англоязычный', country: 'США', 
//     locale: 'en-US', ... }
```

---

## Theme Management

### Функции

| Функция | Описание |
|---------|----------|
| `setTheme(theme)` | 'light', 'dark', 'system' |
| `applyTheme(theme)` | Применить к DOM |
| `syncWindowBackground()` | Синхронизировать с Tauri |
| `initThemeListener()` | Отслеживание системной |

### Автоматическое отслеживание

При `system` — автопереключение через `matchMedia('(prefers-color-scheme: dark)')`.

---

## File Attachments System

### Функции

| Функция | Описание |
|---------|----------|
| `attachFilesToBlock(blockId)` | Диалог выбора файлов |
| `removeAttachmentFromBlock(blockId, fileIndex)` | Удалить вложение |
| `clearBlockAttachments(blockId)` | Очистить все |
| `updateBlockAttachmentsUI(blockId)` | Обновить UI |
| `toggleAttachmentsPanel(blockId, show)` | Показать/скрыть |
| `hasBlockAttachmentsPanel(blockId)` | Проверить наличие |

### Хранение

- **Runtime:** `blockAttachments[blockId]` — `{name, type, path, data}`
- **Отправка:** через `attachAllFiles()` (batch — один eval, все файлы за раз)

---

## Dynamic Input System

### Input Constructor

| Функция | Описание |
|---------|----------|
| `showInputConstructorModal(blockNumber)` | Открыть конструктор |
| `hideInputConstructorModal()` | Закрыть |
| `addConstructorFieldElement(fieldData, index)` | Добавить поле |
| `saveConstructorFields()` | Сохранить |

### Dynamic Input Modal

| Функция | Описание |
|---------|----------|
| `showDynamicInputModal(blockNumber)` | Модалка ввода |
| `hideDynamicInputModal()` | Скрыть |
| `applyDynamicInput()` | Применить значения |

### Опциональные поля

При скрытии поля с `optional: true`:
1. Текст удаляется из промпта
2. Позиция → `savedPosition`
3. При показе — вставка обратно

### Структура instruction.fields

```javascript
{
  instruction: {
    type: "input",
    icon: "edit",
    text: "Заменить ключ",
    fields: [
      {
        label: "Ключ",
        placeholder: "example",
        prefix: "по ключу",
        optional: false,
        savedPosition: 123
      }
    ]
  }
}
```

---

## Workflow Clipboard

### Функции

| Функция | Описание |
|---------|----------|
| `copyBlocksToClipboard(blockIds)` | Копирование блоков (с сохранением связей) |
| `renameBlockInline(blockId)` | Inline-переименование блока |
| `copyTextToClipboard(text)` | Копирование текста в буфер |
| `pasteTextFromClipboard(textarea)` | Вставка из буфера |

### Сохранение связей

1. Связи → `window.clipboardConnections`
2. При вставке восстанавливаются
3. ID пересоздаются, топология сохраняется

---

## Auto-positioning

```javascript
autoPositionNodes(promptsData)
```

Используется при:
- Импорте без позиций
- Создании блоков
- Сбросе layout

---

## Tauri Events

События для загрузок:

| Событие | Описание |
|---------|----------|
| `download-started` | Начало загрузки (toast) |
| `download-finished` | Завершение (toast + archive log) |
| `download-failed` | Ошибка (toast) |

```javascript
// Инициализация
function setupDownloadListeners()
```

---

## Archive Log

Лог скачанных архивов.

**Структура `ArchiveLogEntry`:**
```javascript
{
    tab: number,          // Номер Claude таба (1-3), u8 в Rust
    filename: string,     // Имя файла архива
    claudeUrl: string,    // URL в Claude
    filePath: string,     // Путь к файлу (опционально, serde default)
    projectName: string,  // Имя проекта из URL (опционально, serde default)
    downloadCount: number,// Счётчик скачиваний, дубли объединяются (default 1)
    timestamp: string     // Дата в формате "YYYY-MM-DD HH:MM:SS"
}
```

### Rust команды

| Команда | Описание |
|---------|----------|
| `add_archive_log_entry(tab, filename, claudeUrl, filePath?)` | Добавить |
| `get_archive_log()` | Получить |
| `clear_archive_log()` | Очистить |

### UI

- Модальное окно из настроек
- Кнопка "Открыть в Claude"

---

## Downloads Log

**Структура `DownloadEntry`:**
```javascript
{
    filename: string,     // Имя файла
    file_path: string,    // Полный путь
    timestamp: string     // ISO дата
}
```

### Особенности

- Лимит 500 записей
- Auto-cleanup несуществующих файлов
- Multi-select с Shift+click

---

## Кастомизация оформления

### Акцентный цвет

8 пресетов + произвольный цвет через color picker. При выборе цвета динамически пересчитываются все CSS-переменные `--claude-*` (primary, light, code, shadow, selection, dark, darker) через `<style>` inject.

Хранение: `accentColor` в settings.

### Фон холста

5 паттернов (сетка, диагональ, волны, квадраты, матрица) + загрузка пользовательского изображения (base64, хранится в IndexedDB с fallback на localStorage).

Хранение: `canvasPattern` в settings, изображение в IndexedDB (с fallback на localStorage `CUSTOM_CANVAS_IMAGE`).

### Функции

| Функция | Файл | Описание |
|---------|------|----------|
| `setAccentColor(hex)` | settings.js | Установить и сохранить цвет |
| `applyAccentColor(hex)` | settings.js | Пересчитать CSS-переменные |
| `setCanvasPattern(patternId)` | settings.js | Установить и сохранить паттерн |
| `applyCanvasPattern(patternId)` | settings.js | Применить паттерн к DOM |
| `uploadCanvasImage()` | settings.js | Загрузить пользовательское изображение |
| `initCustomization()` | settings.js | Инициализация при старте |

---

## Диагностика

Система автодиагностики селекторов Claude.ai и экспорт логов.

### Health-check при запуске

`runSelectorHealthCheck()` проверяет 5 критических селекторов (proseMirror, sendButton, stopButton, leftNav, scrollContainer) через 3 сек после загрузки. Результат пишется в `diagnostics.json` в App Data Dir — пользователь ничего не видит.

### Эвристический fallback

При неудаче стандартного поиска по `selectors.json` функция `__findElSmart__` пробует 8 эвристик на основе `aria-*`, `role`, `contenteditable` и структурной навигации.

### Экспорт диагностики

Кнопка «Экспорт» в секции «Диагностика» модала настроек. Вызывает Tauri-команду `export_diagnostics`, которая сохраняет `diagnostics.json` на рабочий стол и показывает toast с путём к файлу.

### Функции

| Функция | Файл | Описание |
|---------|------|----------|
| `writeDiagnostic(eventType, details)` | utils.js | Запись события в диагностику |
| `export_diagnostics` | logs.rs | Tauri: экспорт файла диагностики |

---

## Knowledge Upload

Автозагрузка скачанных MD-файлов в knowledge проекта Claude.

### Как работает

При скачивании файла из Claude WebView проверяется:
1. Расширение `.md`
2. Наличие активного проекта (`isProjectActive()`)

Если оба условия выполнены — файл загружается в knowledge через `POST /api/organizations/{orgId}/projects/{uuid}/docs`, после чего удаляется с диска.

### Функции

| Функция | Файл | Описание |
|---------|------|----------|
| `uploadToProjectKnowledge(filePath, filename)` | claude-api.js | Чтение файла (Rust) → base64 → CDP eval fetch → delete |

### Toast-уведомления

| Ситуация | Toast |
|----------|-------|
| Успешная загрузка | `📎 file.md → knowledge` |
| Ошибка загрузки | `⚠️ Knowledge upload failed: {error}` |

---

## SERP Scraper

Автосбор данных из Google — новый тип блока на холсте workflow.

### Как работает

1. Пользователь добавляет скрапер-блок на canvas (максимум 1 на вкладку)
2. Задаёт ключевое слово и поисковые запросы через модалку (⚙)
3. Нажимает Start — приложение создаёт скрытый WebView, выполняет запросы в Google
4. Для каждого результата фетчит и очищает HTML страницы
5. Собранные файлы загружаются в knowledge активного проекта Claude

### Tauri-команды

| Команда | Описание |
|---------|----------|
| `create_scraper_webview` | Создание скрытого WebView2 для скрапинга |
| `destroy_scraper_webview` | Закрытие скрапер-WebView |
| `scrape_google_serp` | Выполнение серии запросов, извлечение и сохранение результатов |

### Файлы

| Файл | Описание |
|------|----------|
| `src-tauri/src/commands/scraper.rs` | Backend-логика скрапинга |
| `src-tauri/scripts/serp_extract.js` | Извлечение органических результатов из SERP |

---

## Auto-Continue

Автоматический клик Continue при достижении tool-use limit в Claude.

### Как работает

Скрипт `claude_autocontinue.js` инжектируется в каждый Claude WebView. Поллит DOM каждые 2-4 сек (с jitter). При обнаружении кнопки Continue **и** фразы о tool-use limit в последнем сообщении — кликает с задержкой 1.5-3 сек. Toast через Tauri emit в Main WebView.

### Настройка

Тогл: Настройки → Дополнительно → Auto-continue. По умолчанию выключен. Сохраняется в `settings.autoContinue`.

→ Подробнее: [04-CLAUDE.md](04-CLAUDE.md#auto-continue-v440)

---

## Agent Skills {#agent-skills}

Скиллы (`.skill` файлы) — ZIP-архивы (5-18 KB), содержащие `SKILL.md` + `references/` + `scripts/`. Привязываются к аккаунту Claude через внутренний API.

### Как работает

Одна кнопка «Скиллы» в настройках. При нажатии: скачать манифест с GitHub → скачать все `.skill` файлы → привязать к аккаунту Claude. Без проверки версий, без кэша — каждый раз свежие данные.

Модуль `remote-skills.js` (одна функция `refreshAndBindSkills`): загружает `skills/manifest.json` с GitHub, скачивает каждый `.skill` как base64, временно кладёт в localStorage, вызывает `uploadSkillsToClaude()` из `claude-api.js` (CDP eval → `atob` → `Blob` → `FormData` → `fetch('/api/organizations/{orgId}/skills/upload-skill?overwrite=true')`), после привязки чистит localStorage.

### Project Manager

Push скиллов интегрирован в меню Push (рядом с push промптов). `.skill` файлы кладутся рядом со скриптом, пушатся на GitHub через API, удаляются после успешной загрузки. Версия манифеста автоинкрементится.

---

## Workflow Repair {#workflow-repair}

Автопочинка состояния пайплайнов при загрузке вкладки.

### Как работает

Функция `repairWorkflowState()` в `workflow-state.js` вызывается при каждом `loadWorkflowState()`. Собирает валидные ID блоков из данных вкладки и проверяет целостность всех структур.

### Что чинится

- **Соединения:** удаление ссылок на несуществующие блоки, self-connections, дубликатов (по паре from→to). Починка невалидных сторон (fallback: right→left).
- **Позиции:** удаление осиротевших записей, починка NaN-координат (fallback: 50,50).
- **Размеры:** удаление осиротевших, починка невалидной ширины (fallback: 340px).
- **Цвета:** удаление ссылок на несуществующие блоки.
- **Заметки:** фильтрация невалидных объектов.

При обнаружении проблем — автосохранение, лог в консоль.

---

## Связанные документы

- [02-FRONTEND.md](02-FRONTEND.md) — JS модули
- [04-CLAUDE.md](04-CLAUDE.md) — Интеграция с Claude
- [frontend/EMBEDDED-SCRIPTS.md](frontend/EMBEDDED-SCRIPTS.md) — Встроенные скрипты и языки
