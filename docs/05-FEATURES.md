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

Промпт с маркерами — один текст работает на все 20 языков:

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

20 языков в `languages.js`, из них 5 с поддержкой мультигео (выбор страны):

| Код | Язык | Мультигео |
|-----|------|-----------|
| en | английский | 🌍 6 стран (US, GB, CA, AU, NZ, IE) |
| de | немецкий | 🌍 4 страны (DE, AT, CH, BE) |
| fr | французский | 🌍 4 страны (FR, CA, CH, BE) |
| nl | голландский | 🌍 2 страны (NL, BE) |
| pt | португальский | 🌍 2 страны (PT, BR) |
| es | испанский | — |
| it | итальянский | — |
| pl | польский | — |
| cz | чешский | — |
| dk | датский | — |
| gr | греческий | — |
| no | норвежский | — |
| hu | венгерский | — |
| fi | финский | — |
| sk | словацкий | — |
| sl | словенский | — |
| hr | хорватский | — |
| se | шведский | — |
| bg | болгарский | — |
| ro | румынский | — |

### Мультигео система

Для языков en, de, fr, nl, pt в селекторе появляется подменю выбора страны.

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
- **Отправка:** через `attachFilesToMessage()`

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
    tab: string,          // Номер Claude таба (1-3)
    filename: string,     // Имя файла архива
    claudeUrl: string,    // URL в Claude
    filePath: string,     // Путь к файлу (опционально)
    timestamp: string     // ISO дата
}
```

### Rust команды

| Команда | Описание |
|---------|----------|
| `add_archive_log_entry(tab, filename, claudeUrl)` | Добавить |
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

## Связанные документы

- [02-FRONTEND.md](02-FRONTEND.md) — JS модули
- [04-CLAUDE.md](04-CLAUDE.md) — Интеграция с Claude
- [frontend/EMBEDDED-SCRIPTS.md](frontend/EMBEDDED-SCRIPTS.md) — Встроенные скрипты и языки
