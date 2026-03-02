# Frontend API Reference

[← Назад к Frontend](../02-FRONTEND.md)

> **Примечание:** После рефакторинга v4.2.0 весь inline JavaScript вынесен в модули `dist/js/*.js`. Этот документ описывает API функций с указанием файлов, где они находятся.

Справочник функций приложения. Общее количество ~330 функций в 35 модулях (включая внутренние). В таблице ниже — **публичные API функции** (~102), сгруппированные по категориям.

---

## Сводка по категориям

| Категория | Количество | Модуль | Описание |
|-----------|------------|--------|----------|
| [Export/Import](#export--import) | 4 | `export-import.js` | Экспорт/импорт вкладок |
| [Language System](#language-system) | 10 | `language-ui.js` | Детекция и замена языков |
| [Tab Selector](#tab-selector) | 8 | `tab-selector.js` | Селектор вкладок |
| [Language Selector](#language-selector) | 4 | `language-ui.js` | Селектор языка с мультигео |
| [Edit Toolbar](#edit-toolbar) | 2 | `edit-helpers.js` | Тулбар редактирования |
| [Text Operations](#text-operations) | 4 | `edit-helpers.js` | Операции с текстом |
| [Block Collapse](#block-collapse) | 2 | `block-ui.js` | Сворачивание блоков |
| [Block Scripts](#block-scripts) | 2 | `block-ui.js` | Управление скриптами |
| [Block Automation](#block-automation) | 2 | `block-ui.js` | Флаги автоматизации |
| [Data Persistence](#data-persistence) | 9 | `persistence.js` | Хранение данных |
| [Attachments](#attachments) | 6 | `attachments.js` | Вложения файлов |
| [Input Constructor](#input-constructor) | 6 | `dynamic-input.js` | Конструктор полей |
| [Dynamic Input Modal](#dynamic-input-modal) | 3 | `dynamic-input.js` | Модалка ввода |
| [Import Confirm](#import-confirm) | 2 | `export-import.js` | Диалог импорта |
| [Settings Modal](#settings-modal) | 8 | `settings.js` | Настройки |
| [Theme](#theme) | 5 | `settings.js` | Управление темами |
| [Customization](#customization) | 8 | `settings.js` | Акцентный цвет, паттерны фона |
| [Updates](#updates) | 5 | `updates.js` | Обновления |
| [Context Menu](#context-menu) | 2 | `context-menu.js` | Контекстное меню |
| [Clipboard](#clipboard) | 2 | `context-menu.js` | Буфер обмена |
| [Dropdown](#dropdown) | 4 | `dropdown.js` | Унифицированные dropdown меню |
| [Other](#port-events) | 4 | `init.js` | Прочие функции |
| **Всего** | **~102** | | |

---

## Export / Import

| Функция | Описание |
|---------|----------|
| `exportConfig()` | Экспорт вкладки в JSON файл |
| `downloadFile(content, fileName)` | Скачивание файла через blob |
| `importConfig()` | Открытие диалога импорта |
| `handleImportFile(event)` | Обработка импортируемого файла |

---

## Language System

| Функция | Описание |
|---------|----------|
| `getActiveLanguageData()` | Получить данные языка с учётом страны |
| `showLanguageToast(langName, countryName)` | Toast с названием языка и страны |
| `insertLanguageFormAtCursor(textarea)` | Вставка формы языка (вызывает showLanguageFormMenu) |
| `showLanguageFormMenu(textarea, anchorBtn)` | Унифицированное меню форм для тулбара и модалки |
| `hasCountrySelection(langCode)` | Проверить наличие выбора стран |
| `getCountriesForLanguage(langCode)` | Получить список стран для языка |
| `detectAndUpdateLanguageFromTab()` | Синхронизация UI при переключении вкладки |

### Функции склонения (languages.js)

| Функция | Описание |
|---------|----------|
| `generateAdjectiveForms(word)` | Генерирует все 24 формы прилагательного |

### Глобальные переменные

| Переменная | Описание |
|------------|----------|
| `currentLanguage` | Код текущего языка (en, de, ...) |
| `currentCountry` | Код текущей страны (gb, us, ...) или null |

### Пример

```javascript
// Получить данные языка с учётом страны
const langData = getActiveLanguageData();
console.log(langData.lang);        // 'английский'
console.log(langData.native);      // 'англоязычный'
console.log(langData.country);     // 'США'
console.log(langData.locale);      // 'en-US'
```

---

## Tab Selector

| Функция | Описание |
|---------|----------|
| `initTabSelector()` | Инициализация селектора вкладок |
| `renderTabMenu()` | Рендеринг меню с accordion-группами |
| `updateSelectedUI()` | Обновление текста кнопки |
| `toggleMenu()` | Открыть/закрыть меню |
| `closeMenu()` | Закрыть меню |
| `switchToTab(newTab)` | Переключение на вкладку |
| `getFirstFinalTab(node)` | Рекурсивно найти первую конечную вкладку |
| `handleGroupRename(btn)` | Каскадное переименование группы вкладок |
| `handleGroupDelete(prefix)` | Каскадное удаление группы вкладок |
| `resetPendingDelete()` | Сброс состояния ожидания удаления |

### UI элементы

| ID | Описание |
|----|----------|
| `tab-dropdown` | Контейнер селектора |
| `tab-btn` | Кнопка открытия |
| `tab-menu` | Выпадающее меню |

### Accordion-группы вкладок

Вкладки группируются по префиксам через дефис: `BETTING-PILLAR`, `BETTING-CLUSTERS` → группа `BETTING`. Сортировка по алфавиту.

**Структура меню (accordion):**
```
┌─────────────────────────┐
│ .tab-menu-list          │ ← Скроллируемый (max 5 пунктов)
│   ├─ BETTING ▶ (3)      │ ← Группа (клик раскрывает)
│   │    ├─ BETTING       │ ← Родительская вкладка
│   │    ├─ PILLAR        │
│   │    └─ CLUSTERS      │
│   └─ SOLO-TAB           │ ← Конечная вкладка
├─────────────────────────┤
│ .tab-menu-actions       │ ← Кнопки (только Admin Mode)
│   + Добавить            │
│   ✏ Редактировать       │
│   ↓ Экспорт / ↑ Импорт  │
└─────────────────────────┘
```

**Особенности:**
- Группы раскрываются/сворачиваются по клику (accordion)
- Счётчик показывает количество вкладок в группе
- Группа с текущей вкладкой автоматически раскрыта
- Максимум 5 видимых пунктов, далее внутренний скролл
- Автоскролл к выбранной вкладке при открытии

**Кнопки действий для групп (в Admin Mode):**
- ✏️ Переименование — каскадное с превью затронутых вкладок
- 🗑️ Удаление — каскадное с подтверждением

**CSS классы:**
- `.tab-group` — контейнер группы
- `.tab-group-header` — заголовок (кликабельный)
- `.tab-group-header.expanded` — раскрытая группа
- `.tab-group-header.contains-selected` — содержит выбранную вкладку
- `.tab-group-content` — скрываемый контент
- `.tab-group-count` — счётчик вкладок
- `.tab-option.selected` — выбранная вкладка (оранжевый Claude)

---

## Language Selector

| Функция | Описание |
|---------|----------|
| `initLanguageSelector()` | Инициализация селектора языка с подменю стран |
| `showCountrySubmenu(langCode, optionElement)` | Показать подменю стран |
| `hideCountrySubmenu()` | Скрыть подменю стран |
| `applyLanguageWithCountry(langCode, countryCode)` | Применить язык с выбранной страной |

### UI элементы

| ID | Описание |
|----|----------|
| `language-dropdown` | Контейнер селектора |
| `language-btn` | Кнопка открытия |
| `language-menu` | Выпадающее меню |
| `language-country-submenu` | Подменю выбора страны |

### Мультигео языки

Языки en, de, fr, nl, pt имеют класс `.has-submenu` и показывают подменю при наведении.

---

## Edit Toolbar

| Функция | Описание |
|---------|----------|
| `toggleEditToolbar(show)` | Показать/скрыть тулбар редактирования |
| `updateEditModeToggle()` | Обновить состояние переключателя режима |

---

## Text Operations

| Функция | Описание |
|---------|----------|
| `insertTextIntoTextarea(textarea, text, triggerBlur)` | Вставка текста в textarea |
| `insertTextAtCursor(text)` | Вставка в активный элемент |
| `copyTextToClipboard(text)` | Копирование в буфер обмена |
| `pasteTextFromClipboard(textarea)` | Вставка из буфера |

### Пример

```javascript
// Вставить текст с триггером blur
insertTextIntoTextarea(textarea, 'Hello', true);

// Копировать в буфер
await copyTextToClipboard('Text to copy');
```

---

## Block Collapse

| Функция | Описание |
|---------|----------|
| `toggleBlockCollapsed(blockId)` | Свернуть/развернуть блок |
| `alignCollapsedToOddGrid(node, blockId)` | Выравнивание свёрнутого блока по сетке |

---

## Block Scripts

| Функция | Описание |
|---------|----------|
| `toggleBlockScript(blockId, scriptKey)` | Переключить скрипт на блоке |
| `updateBlockScriptBadges(blockId)` | Обновить бейджи скриптов |

### Скрипты

- `convert` — Markdown → HTML
- `count` — Подсчёт слов
- `spellcheck` — Проверка орфографии

---

## Block Automation

| Функция | Описание |
|---------|----------|
| `toggleBlockAutomation(blockId, flag)` | Переключить флаг автоматизации |
| `updateBlockAutomationBadges(blockId)` | Обновить бейджи автоматизации |

### Флаги

- `newProject` (P) — Создать новый проект
- `newChat` (N) — Создать новый чат

---

## Data Persistence

| Функция | Описание |
|---------|----------|
| `initializeDefaultTabs()` | Инициализация дефолтных вкладок |
| `getCurrentStorageKey()` | Получить ключ текущей вкладки |
| `saveToLocalStorage(key, content)` | Сохранение в localStorage |
| `loadFromLocalStorage()` | Загрузка из localStorage |
| `performReset()` | Выполнение сброса данных (сохраняет UI-настройки) |
| `checkAppVersionAndReset()` | Проверка версии и сброс при необходимости |
| `confirmReset()` | Ручной сброс с подтверждением |
| `initializePersistence()` | Инициализация системы хранения |
| `loadPrompts(preserveScroll)` | Загрузка промптов вкладки |

---

## Attachments

| Функция | Описание |
|---------|----------|
| `toggleAttachmentsPanel(blockId, show)` | Показать/скрыть панель вложений |
| `hasBlockAttachmentsPanel(blockId)` | Проверить наличие панели |
| `attachFilesToBlock(blockId)` | Открыть диалог выбора файлов |
| `removeAttachmentFromBlock(blockId, fileIndex)` | Удалить вложение |
| `clearBlockAttachments(blockId)` | Очистить все вложения |
| `updateBlockAttachmentsUI(blockId)` | Обновить UI вложений |

### Пример

```javascript
// Прикрепить файлы к блоку
await attachFilesToBlock('block-123');

// Удалить второй файл
removeAttachmentFromBlock('block-123', 1);
```

---

## Input Constructor

| Функция | Описание |
|---------|----------|
| `showInputConstructorModal(blockNumber)` | Открыть конструктор полей |
| `hideInputConstructorModal()` | Закрыть конструктор |
| `addConstructorFieldElement(fieldData, index)` | Добавить элемент поля |
| `updateAddFieldButton()` | Обновить кнопку добавления |
| `reindexConstructorFields()` | Переиндексировать поля |
| `saveConstructorFields()` | Сохранить поля |

---

## Dynamic Input Modal

| Функция | Описание |
|---------|----------|
| `showDynamicInputModal(blockNumber)` | Показать модалку динамического ввода |
| `hideDynamicInputModal()` | Скрыть модалку |
| `applyDynamicInput()` | Применить введённые значения |

---

## Import Confirm

| Функция | Описание |
|---------|----------|
| `showImportConfirm(message)` | Показать диалог подтверждения |
| `hideImportConfirm(result)` | Скрыть диалог с результатом |

---

## Settings Modal

| Функция | Описание |
|---------|----------|
| `showSettingsModal()` | Открыть настройки |
| `openUrlInClaude(url)` | Открыть URL в Claude WebView |
| `showArchiveLogModal()` | Показать лог архивов |
| `updateToggleButtons(btnClass, activeId)` | Обновить toggle-кнопки |
| `updateAutoUpdateButtons(enabled)` | Обновить кнопки автообновления |
| `updateThemeButtons(activeTheme)` | Обновить кнопки темы |
| `confirmReset()` | Подтверждение сброса (`persistence.js`) |
| `updateDownloadsPathDisplay()` | Обновить отображение пути загрузок (`init.js`) |

---

## Theme

| Функция | Описание |
|---------|----------|
| `setTheme(theme)` | Установить тему ('light', 'dark', 'system') |
| `applyTheme(theme)` | Применить тему к DOM |
| `syncWindowBackground()` | Синхронизировать с Tauri |
| `initThemeListener()` | Инициализировать слушатель системной темы |
| `toggleAutoUpdate(enabled)` | Переключить автообновление |

---

## Customization

| Функция | Описание |
|---------|----------|
| `setAccentColor(hex)` | Установить акцентный цвет |
| `applyAccentColor(hex)` | Применить к CSS-переменным (`--claude-*`) |
| `updateAccentUI(hex)` | Обновить UI пресетов цвета |
| `setCanvasPattern(patternId)` | Установить паттерн фона холста |
| `applyCanvasPattern(patternId)` | Применить паттерн к DOM |
| `updatePatternUI(patternId)` | Обновить UI паттернов |
| `uploadCanvasImage()` | Загрузить пользовательское изображение фона |
| `initCustomization()` | Инициализация кастомизации при старте |

---

## Updates

| Функция | Описание |
|---------|----------|
| `checkForUpdates(showModal)` | Проверить обновления приложения |
| `showUpdateModalAvailable(newVersion, releaseNotes)` | Модалка "Доступно обновление" |
| `showUpdateModalLatest(currentVersion)` | Модалка "Версия актуальна" |
| `hideUpdateModal()` | Скрыть модалку обновления |
| `installUpdate()` | Установить обновление |

---

## Context Menu

| Функция | Описание |
|---------|----------|
| `showContextMenu(x, y, items)` | Показать контекстное меню |
| `hideContextMenu()` | Скрыть контекстное меню |

### Пример

```javascript
showContextMenu(event.clientX, event.clientY, [
    { label: 'Копировать', action: () => copyBlock(blockId) },
    { label: 'Удалить', action: () => deleteBlock(blockId), danger: true },
    { type: 'separator' },
    { label: 'Отмена', action: () => {} }
]);
```

---

## Clipboard

| Функция | Описание |
|---------|----------|
| `copyBlocksToClipboard(blockIds)` | Копировать блоки (с сохранением связей) |
| `renameBlockInline(blockId)` | Inline-переименование блока |

---

## Dropdown

Унифицированная система dropdown меню. Модуль `dropdown.js` обеспечивает единообразное поведение всех выпадающих меню.

| Функция/Метод | Описание |
|---------------|----------|
| `Dropdown.register(name, config)` | Регистрация dropdown для взаимного закрытия |
| `Dropdown.closeOthers(exceptName)` | Закрыть все dropdown кроме указанного |
| `Dropdown.positionSubmenu(submenu, menu, item, container)` | Позиционирование подменю (для language selector) |
| `Dropdown.createSeparator(className)` | Создать разделитель |

### Архитектура dropdown меню

Все dropdown используют унифицированный подход:
- **CSS класс `.dropdown-animated`** — обеспечивает анимацию появления/скрытия
- **CSS класс `.hidden`** — скрытое состояние (opacity: 0, visibility: hidden, transform: translateY(-8px))
- **Показ/скрытие через classList** — не через display:none или remove()

### HTML элементы

| ID | Описание |
|----|----------|
| `tab-menu` | Меню выбора вкладок (accordion) |
| `language-menu` | Меню выбора языка |
| `language-country-submenu` | Подменю выбора страны |
| `lang-form-dropdown` | Контейнер меню форм языка |
| `lang-form-menu` | Меню форм языка (язык/носитель/страна) |
| `lang-form-submenu` | Подменю падежей |

### Поведение кликов

- **Tab selector** — клик на группу раскрывает/сворачивает accordion
- **Language selector** — hover на язык с подменю показывает страны
- **Lang-form menu** — hover показывает падежи

---

## Port Events

| Функция | Описание |
|---------|----------|
| `setupPortEvents(port)` | Настройка событий порта (для связей) |

---

## Claude Chat Selection

| Функция | Описание |
|---------|----------|
| `selectChatForNode(index)` | Показать выбор чата для блока |

---

## Download Listeners

| Функция | Описание |
|---------|----------|
| `setupDownloadListeners()` | Настройка слушателей загрузок |

---

## Utility

| Функция | Описание |
|---------|----------|
| `getInstructionIconSvg(iconType)` | Получить SVG иконки инструкции |

---

## Связанные документы

- [INDEX-HTML.md](INDEX-HTML.md) — Каталог функций приложения
- [../02-FRONTEND.md](../02-FRONTEND.md) — Frontend модули
