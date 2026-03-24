# index.html — Функции приложения

[← Назад к Frontend](../02-FRONTEND.md)

Каталог основных функций UI, определённых в модулях `dist/js/*.js` (~102 UI-функций из общих ~373 функций в 35 JS модулях).

> **Полный API reference:** [INDEX-HTML-API.md](INDEX-HTML-API.md) (функции по модулям)

## Export/Import (4 функции)

| Функция | Описание |
|---------|----------|
| `exportConfig()` | Экспорт вкладки в JSON |
| `downloadFile(content, fileName)` | Скачать через blob URL |
| `importConfig()` | Открыть диалог импорта |
| `handleImportFile(event)` | Обработка файла |

### Формат экспорта

```javascript
{
    version: 2,
    exportDate: "YYYY-MM-DDTHH:MM:SS.sssZ",
    tab: {
        id: "my-tab",
        name: "My Tab",
        order: 1,
        version: "1.0.0",
        items: [...]
    },
    workflow: {
        positions: {...},
        sizes: {...},
        connections: [...]
    }
}
```

---

## Language (7 функций)

| Функция | Описание |
|---------|----------|
| `getActiveLanguageData()` | Данные языка с учётом страны |
| `insertLanguageFormAtCursor(textarea)` | Вставить форму (для модалки) |
| `showLanguageFormMenu(textarea, anchorBtn)` | Унифицированное меню форм |
| `showLanguageToast(langName, countryName)` | Toast при смене |
| `hasCountrySelection(langCode)` | Есть ли выбор стран |
| `getCountriesForLanguage(langCode)` | Список стран для языка |
| `detectAndUpdateLanguageFromTab()` | Синхронизация UI при переключении вкладки |

**Функции склонения:** `generateAdjectiveForms()`

**Глобальные переменные:** `currentLanguage`, `currentCountry`

---

## Tab Selector (10 функций)

| Функция | Описание |
|---------|----------|
| `initTabSelector()` | Инициализация dropdown |
| `renderTabMenu()` | Рендеринг списка вкладок (accordion-группы) |
| `updateSelectedUI()` | Обновить выбранную |
| `toggleMenu()` | Открыть/закрыть dropdown |
| `closeMenu()` | Закрыть dropdown |
| `switchToTab(newTab)` | Переключиться на вкладку |
| `getFirstFinalTab(node)` | Рекурсивно найти первую конечную вкладку |
| `handleGroupRename(btn)` | Каскадное переименование группы |
| `handleGroupDelete(prefix)` | Каскадное удаление группы |
| `resetPendingDelete()` | Сброс состояния удаления без перерисовки |

---

## Language Selector (4 функции)

| Функция | Описание |
|---------|----------|
| `initLanguageSelector()` | Инициализация |
| `showCountrySubmenu(langCode, option)` | Показать подменю стран |
| `hideCountrySubmenu()` | Скрыть подменю стран |
| `applyLanguageWithCountry(langCode, countryCode)` | Применить язык с выбранной страной |

---

## Dropdown (4 функции)

Унифицированная система dropdown меню (`dropdown.js`).

| Функция | Описание |
|---------|----------|
| `Dropdown.register(name, config)` | Регистрация для взаимного закрытия |
| `Dropdown.closeOthers(exceptName)` | Закрыть все кроме указанного |
| `Dropdown.positionSubmenu(...)` | Позиционирование подменю |
| `Dropdown.createSeparator(className)` | Создать разделитель |

---

## Block UI (7 функций)

| Функция | Описание |
|---------|----------|
| `toggleBlockCollapsed(blockId)` | Свернуть/развернуть блок |
| `alignCollapsedToOddGrid(node, blockId)` | Выравнивание свёрнутого |
| `toggleBlockScript(blockId, scriptKey)` | Переключить скрипт |
| `updateBlockScriptBadges(blockId)` | Обновить бейджи скриптов |
| `toggleBlockAutomation(blockId, flag)` | Переключить флаг |
| `updateBlockAutomationBadges(blockId)` | Обновить бейджи автоматизации |
| `syncItemMetadata(tabId, blockId)` | Синхронизация метаданных блока |

---

## Persistence (9 функций)

| Функция | Описание |
|---------|----------|
| `initializeDefaultTabs()` | Дефолтные вкладки |
| `getCurrentStorageKey()` | Ключ хранения |
| `saveToLocalStorage(key, content)` | Сохранение (debounced) |
| `loadFromLocalStorage()` | Загрузка |
| `performReset()` | Выполнение сброса данных (сохраняет UI-настройки) |
| `checkAppVersionAndReset()` | Проверка версии и авто-сброс |
| `confirmReset()` | Ручной сброс с подтверждением |
| `initializePersistence()` | Инициализация |
| `loadPrompts(preserveScroll)` | Загрузка и рендеринг |

---

## Attachments (6 функций)

| Функция | Описание |
|---------|----------|
| `toggleAttachmentsPanel(blockId, show)` | Панель вложений |
| `hasBlockAttachmentsPanel(blockId)` | Проверка наличия |
| `attachFilesToBlock(blockId)` | Диалог выбора файлов |
| `removeAttachmentFromBlock(blockId, index)` | Удалить вложение |
| `clearBlockAttachments(blockId)` | Очистить все |
| `updateBlockAttachmentsUI(blockId)` | Обновить UI |

---

## Dynamic Input (9 функций)

### Constructor

| Функция | Описание |
|---------|----------|
| `showInputConstructorModal(blockNumber)` | Открыть конструктор |
| `hideInputConstructorModal()` | Закрыть |
| `addConstructorFieldElement(fieldData, index)` | Добавить поле |
| `updateAddFieldButton()` | Обновить кнопку |
| `reindexConstructorFields()` | Переиндексация |
| `saveConstructorFields()` | Сохранить |

### Modal

| Функция | Описание |
|---------|----------|
| `showDynamicInputModal(blockNumber)` | Модалка ввода |
| `hideDynamicInputModal()` | Закрыть |
| `applyDynamicInput()` | Применить значения |

---

## Edit Mode (3 функции)

| Функция | Описание |
|---------|----------|
| `updateEditModeToggle()` | Обновить кнопку |
| `toggleEditToolbar(show)` | Показать/скрыть тулбар |
| `getInstructionIconSvg(iconType)` | SVG иконка |

---

## Text Operations (2 функции)

| Функция | Описание |
|---------|----------|
| `insertTextIntoTextarea(textarea, text, blur)` | Вставка текста |
| `insertTextAtCursor(text)` | В позицию курсора |

---

## Settings (7 функций)

| Функция | Описание |
|---------|----------|
| `showSettingsModal()` | Показать настройки |
| `showArchiveLogModal()` | Лог архивов |
| `openUrlInClaude(url)` | Открыть в Claude |
| `updateToggleButtons(btnClass, activeId)` | Toggle кнопки |
| `updateAutoUpdateButtons(enabled)` | Автообновление |
| `updateThemeButtons(activeTheme)` | Тема |
| `confirmReset()` | Подтверждение сброса |

---

## Theme (5 функций)

| Функция | Описание |
|---------|----------|
| `setTheme(theme)` | Установить тему |
| `applyTheme(theme)` | Применить к DOM |
| `syncWindowBackground()` | Синхронизация с Tauri |
| `initThemeListener()` | Слушатель системной |
| `toggleAutoUpdate(enabled)` | Переключить |

---

## Customization (8 функций)

| Функция | Описание |
|---------|----------|
| `setAccentColor(hex)` | Установить акцентный цвет |
| `applyAccentColor(hex)` | Применить к CSS-переменным |
| `updateAccentUI(hex)` | Обновить UI пресетов |
| `setCanvasPattern(patternId)` | Установить паттерн фона |
| `applyCanvasPattern(patternId)` | Применить паттерн к DOM |
| `updatePatternUI(patternId)` | Обновить UI паттернов |
| `uploadCanvasImage()` | Загрузить пользовательское изображение |
| `initCustomization()` | Инициализация кастомизации |

---

## Updates (5 функций)

| Функция | Описание |
|---------|----------|
| `checkForUpdates(showModal)` | Проверка обновлений |
| `showUpdateModalAvailable(version, notes)` | Модалка |
| `showUpdateModalLatest(version)` | "Актуально" |
| `hideUpdateModal()` | Закрыть |
| `installUpdate()` | Установить |

---

## Context Menu (2 функции)

| Функция | Описание |
|---------|----------|
| `hideContextMenu()` | Скрыть |
| `showContextMenu(x, y, items)` | Показать в позиции |

### Иконки контекстного меню

`CONTEXT_ICONS`: `create`, `paste`, `copy`, `rename`, `delete`, `script`, `automation`, `instruction`, `collapse`, `expand`, `attach`

---

## Workflow Clipboard (4 функции)

| Функция | Описание |
|---------|----------|
| `renameBlockInline(blockId)` | Inline переименование |
| `copyBlocksToClipboard(blockIds)` | Копирование блоков |
| `copyTextToClipboard(text)` | Текст в буфер |
| `pasteTextFromClipboard(textarea)` | Вставка из буфера |

---

## Port Events (1 функция)

| Функция | Описание |
|---------|----------|
| `setupPortEvents(port)` | Настройка drag событий для портов |

---

## Chat Selection (1 функция)

| Функция | Описание |
|---------|----------|
| `selectChatForNode(index)` | Выбор чата для отправки блока |

---

## Downloads (2 функции)

| Функция | Описание |
|---------|----------|
| `setupDownloadListeners()` | Настройка Tauri events |
| `updateDownloadsPathDisplay()` | Отображение пути |

### Tauri Events

| Событие | Описание |
|---------|----------|
| `download-started` | Начало загрузки (toast) |
| `download-finished` | Завершение (toast + archive log) |
| `download-failed` | Ошибка (toast) |

---

## Modals (2 функции)

| Функция | Описание |
|---------|----------|
| `showImportConfirm(message)` | Подтверждение импорта |
| `hideImportConfirm(result)` | Закрыть |

---

## Связанные документы

- [INDEX-HTML-API.md](INDEX-HTML-API.md) — Frontend API reference (функции по модулям)
- [../02-FRONTEND.md](../02-FRONTEND.md) — Обзор frontend модулей
- [APPSTATE.md](APPSTATE.md) — Shared State
