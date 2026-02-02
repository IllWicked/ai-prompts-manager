# Утилиты

[← Назад к Frontend](../02-FRONTEND.md)

## config.js (1 функция)

### Константы

```javascript
const STORAGE_KEYS = {
    TABS: 'ai-prompts-manager-tabs',
    SETTINGS: 'ai-prompts-manager-settings',
    CURRENT_TAB: 'ai-prompts-manager-tab',
    LANGUAGE: 'ai-prompts-manager-language',
    DATA_VERSION: 'ai-prompts-manager-version',
    APP_VERSION: 'ai-prompts-manager-app-version',
    WORKFLOW_ZOOM: 'workflowZoom',
    COLLAPSED_BLOCKS: 'collapsed-blocks',
    BLOCK_SCRIPTS: 'block-scripts',
    BLOCK_AUTOMATION: 'block-automation',
    CLAUDE_SETTINGS: 'claudeSettings',
    CLAUDE_AUTO_SEND: 'claude_auto_send',
    ACTIVE_PROJECT: 'active-project',
    CURRENT_COUNTRY: 'currentCountry',
    // Динамические
    workflow: (tabId) => `workflow-${tabId}`,
    promptsData: (tabId) => `ai-prompts-manager-data-${tabId}`,
    fieldValue: (fieldId) => `field-value-${fieldId}`
};

const WORKFLOW_CONFIG = {
    GRID_SIZE: 40,
    NODE_MIN_WIDTH: 480,
    NODE_MIN_HEIGHT: 440,
    NODE_DEFAULT_WIDTH: 680,
    NODE_GAP_X: 40,
    NODE_GAP_Y: 40,
    CANVAS_SIZE: 5000,
    CANVAS_CENTER: 2500,
    MAGNET_DISTANCE: 30,
    ZOOM_MIN: 0.4,
    ZOOM_MAX: 1.25
};

const TIMEOUTS = {
    ANIMATION: 300,
    FOCUS: 50,
    SCROLL: 50,
    INPUT_FOCUS: 100,
    DEBOUNCE_SAVE: 2000,
    AUTOSAVE: 30000,
    MENU_SCROLL: 10,
    GENERATION_CHECK: 500,
    URL_SAVE: 2000
};
```

| Функция | Описание |
|---------|----------|
| `log(...args)` | Debug логирование (если DEBUG=true) |

---

## remote-prompts.js (18 функций)

Загрузка и обновление промптов с GitHub.

| Функция | Описание |
|---------|----------|
| `fetchWithTimeout(url, timeout)` | Fetch с AbortController |
| `fetchJSON(path)` | Загрузка JSON с BASE_URL |
| `fetchRemoteManifest()` | Получить manifest.json |
| `fetchRemoteTab(tabId)` | Загрузить данные вкладки |
| `getCachedManifest()` | Манифест из localStorage |
| `cacheManifest(manifest)` | Сохранить манифест |
| `checkForPromptsUpdate(showModal)` | Проверка обновлений |
| `convertRemoteTabToAppFormat(tabData, version)` | Конвертация формата |
| `applyPromptsUpdate(tabs, manifest, isNew)` | Применить обновления |
| `showPromptsUpdateAvailable(newTabs, updatedTabs, notes)` | Модалка обновления |
| `showPromptsUpdateLatest()` | Модалка "актуально" |
| `showPromptsUpdateError(message)` | Модалка ошибки |
| `hidePromptsUpdateModal()` | Закрыть модалку |
| `applyPendingPromptsUpdate()` | Применить ожидающее |
| `initializeRemotePrompts()` | Инициализация |
| `autoCheckPromptsUpdates()` | Автопроверка |
| `showPromptsReleaseNotes(newTabs, updatedTabs, notes)` | Release notes |
| `initPromptsUpdateHandlers()` | Обработчики |

### Пример

```javascript
// Проверка обновлений с модалкой
await checkForPromptsUpdate(true);

// Тихая проверка при запуске
await autoCheckPromptsUpdates();
```

---

## utils.js (8 функций)

| Функция | Описание |
|---------|----------|
| `delay(ms)` | Promise-based задержка |
| `debounce(func, delay)` | Устранение дребезга |
| `escapeHtml(str)` | XSS protection |
| `getCanvasScale(canvas)` | Scale из CSS transform |
| `getAppVersion()` | Версия через Tauri |
| `generateTabId()` | Уникальный ID вкладки |
| `generateItemId()` | Уникальный ID элемента |
| `getGeneratingAnimationDelay()` | Синхронизированная задержка для generating-indicator (1000ms) |

### DOM Getters (с кэшированием)

```javascript
getWorkflowContainer()  // #workflow-container
getWorkflowCanvas()     // #workflow-canvas
getWorkflowSvg()        // .workflow-svg
getWorkflowWrapper()    // .workflow-wrapper
getEditModal()          // #workflow-edit-modal
getEditTitle()          // #edit-block-title
getEditContent()        // #edit-block-content
getZoomIndicator()      // #zoom-indicator
getUndoBtn()            // #undo-btn
getRedoBtn()            // #redo-btn
```

### Примеры

```javascript
// Задержка
await delay(1000);

// Debounce для автосохранения
const debouncedSave = debounce(() => saveToLocalStorage(), 2000);
input.addEventListener('input', debouncedSave);

// XSS protection
const safe = escapeHtml('<script>alert("xss")</script>');
// &lt;script&gt;alert("xss")&lt;/script&gt;
```

---

## toast.js (1 функция)

```javascript
showToast(message = 'Скопировано', duration = 2000)
```

### Пример

```javascript
showToast('Сохранено!');
showToast('Ошибка загрузки', 3000);
```

---

## storage.js (10 функций)

| Функция | Описание |
|---------|----------|
| `getSettings()` | Настройки с дефолтами |
| `saveSettings(settings)` | Сохранить настройки |
| `loadFromStorage(key, defaultValue)` | Загрузить JSON |
| `saveToStorage(key, value)` | Сохранить JSON |
| `getAllTabs()` | Все вкладки (кэш + валидация) |
| `saveAllTabs(tabs, skipUndo)` | Сохранить вкладки |
| `setTabsCache(tabs)` | Установить кэш (для undo) |
| `isValidTab(tab)` | Валидация структуры |
| `isValidTabsStructure(tabs)` | Валидация всех |
| `repairTab(tabId, tab)` | Восстановление |

### Примеры

```javascript
// Получить настройки
const settings = getSettings();
// { autoUpdate: true, theme: 'auto', adminMode: false }

// Сохранить настройки
saveSettings({ ...settings, theme: 'dark' });

// Работа с вкладками
const tabs = getAllTabs();
tabs['new-tab'] = { id: 'new-tab', name: 'New', items: [] };
saveAllTabs(tabs);

// Произвольные данные
saveToStorage('my-key', { foo: 'bar' });
const data = loadFromStorage('my-key', {});
```

---

## modals.js (5 функций)

| Функция | Описание |
|---------|----------|
| `closeAllModals()` | Закрыть все модалки |
| `hideModal(modalId)` | Скрыть по ID |
| `showAlert(message, title)` | Уведомление |
| `showResetModal()` | Модалка сброса |
| `showEditModeConfirmModal()` | Подтверждение edit mode |

### Примеры

```javascript
// Показать уведомление
showAlert('Файл не найден', 'Ошибка');

// Закрыть всё
closeAllModals();

// Скрыть конкретную
hideModal('settings-modal');
```

---

## Связанные документы

- [DATA-STRUCTURES.md](DATA-STRUCTURES.md) — Структуры данных
- [APPSTATE.md](APPSTATE.md) — Shared State
- [../reference/GLOSSARY.md](../reference/GLOSSARY.md) — Глоссарий терминов
- [../02-FRONTEND.md](../02-FRONTEND.md) — Обзор frontend
