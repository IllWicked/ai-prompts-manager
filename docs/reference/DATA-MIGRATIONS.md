# Миграции данных

[← Назад к INDEX](../INDEX.md)

Документация по системе версионирования данных и миграциям.

---

## Версионирование

Приложение использует две независимые системы версий:

### 1. Версия приложения (APP_VERSION)

- **Источник:** `tauri.conf.json` → `version`
- **Хранение:** `localStorage: ai-prompts-manager-app-version`
- **Формат:** semver (например, `4.1.4`)

При изменении версии приложения:
- Сбрасываются данные вкладок (`ai-prompts-manager-tabs`)
- Очищаются legacy ключи (`ai-prompts-manager-data`, `ai-prompts-manager-data-task4`)
- **Сохраняются:** настройки темы, автообновления, язык

### 2. Версия данных (DATA_VERSION)

- **Источник:** `config.js` → `CURRENT_DATA_VERSION`
- **Хранение:** `localStorage: ai-prompts-manager-version`
- **Формат:** integer (например, `4`)
- **Текущая версия:** `4`

При увеличении версии данных:
- Очищается сохранённый язык
- Данные промптов сбрасываются

---

## История версий данных

### Версия 1 (начальная)

Базовая структура:
```javascript
{
    "ai-prompts-manager-data": {
        "1": "content of block 1",
        "2": "content of block 2"
    }
}
```

### Версия 2

Добавлена поддержка вкладок:
```javascript
{
    "ai-prompts-manager-tabs": [{
        id: "tab-id",
        name: "Tab Name",
        order: 1,
        items: [...]
    }]
}
```

### Версия 3

Добавлено:
- `version` в структуру Tab (для remote prompts)
- Workflow состояние в отдельных ключах (`workflow-{tabId}`)

### Версия 4 (текущая)

Добавлено:
- Block automation (`block-automation`)
- Embedded scripts (`block-scripts`)
- Collapsed blocks (`collapsed-blocks`)
- Active project (`active-project`)

```javascript
// block-automation
{
    "block-id-1": { "newProject": true, "newChat": false },
    "block-id-2": { "newProject": false, "newChat": true }
}

// block-scripts
{
    "block-id-1": ["convert", "count"]
}

// collapsed-blocks
["block-id-1", "block-id-3"]

// active-project
{
    "uuid": "proj-uuid-123",
    "name": "Project Name",
    "ownerTab": "tab-id"
}
```

---

## Код сброса

### performReset() — общая функция

```javascript
/**
 * Общая функция сброса данных приложения
 * @param {Object} options
 * @param {boolean} options.reloadPage - перезагружать страницу после сброса
 * @param {boolean} options.callRustCommands - вызывать Rust команды
 */
async function performReset(options = {}) {
    const { reloadPage = false, callRustCommands = false } = options;
    
    isResetting = true;
    stopGenerationMonitor();
    
    // Очищаем JS переменные
    isClaudeVisible = false;
    tabUrls = {};
    generatingTabs = {};
    activeProject = null;
    workflowPositions = {};
    workflowConnections = [];
    workflowSizes = {};
    collapsedBlocks = {};
    blockScripts = {};
    blockAutomation = {};
    
    // Сохраняем настройки
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    
    // Очищаем localStorage (все ключи кроме settings)
    // ... удаление всех ключей приложения ...
    
    // Восстанавливаем настройки
    if (savedSettings) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, savedSettings);
    }
    
    // Rust команды (только для ручного сброса)
    if (callRustCommands && window.__TAURI__?.core) {
        await window.__TAURI__.core.invoke('reset_claude_state');
        await window.__TAURI__.core.invoke('reset_app_data');
    }
    
    if (reloadPage) {
        location.reload();
    }
}
```

### checkAppVersionAndReset() — авто-сброс

```javascript
async function checkAppVersionAndReset() {
    const currentAppVersion = await getAppVersion();
    const savedAppVersion = localStorage.getItem(STORAGE_KEYS.APP_VERSION);
    
    if (currentAppVersion !== savedAppVersion) {
        // Полный сброс без перезагрузки (уже при старте)
        await performReset({ reloadPage: false, callRustCommands: false });
    }
    
    localStorage.setItem(STORAGE_KEYS.APP_VERSION, currentAppVersion);
}
```

### confirmReset() — ручной сброс

```javascript
async function confirmReset() {
    // Полный сброс с перезагрузкой и Rust командами
    await performReset({ reloadPage: true, callRustCommands: true });
}
```

### loadFromLocalStorage()

```javascript
function loadFromLocalStorage() {
    const savedVersion = parseInt(localStorage.getItem(STORAGE_KEYS.DATA_VERSION) || '0');
    
    if (savedVersion < CURRENT_DATA_VERSION) {
        // Версия устарела - очищаем
        localStorage.removeItem(STORAGE_KEYS.LANGUAGE);
        localStorage.setItem(STORAGE_KEYS.DATA_VERSION, CURRENT_DATA_VERSION.toString());
        return {};
    }
    
    return JSON.parse(localStorage.getItem(storageKey) || '{}');
}
```

---

## Добавление новой миграции

### Шаг 1: Увеличить DATA_VERSION

```javascript
// config.js
const CURRENT_DATA_VERSION = 5;  // было 4
```

### Шаг 2: Добавить логику миграции (если нужна)

В `loadFromLocalStorage()`:

```javascript
if (savedVersion === 4) {
    // Миграция 4 → 5
    const tabs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TABS) || '[]');
    tabs.forEach(tab => {
        // Добавить новое поле
        tab.newField = tab.newField || 'default';
    });
    localStorage.setItem(STORAGE_KEYS.TABS, JSON.stringify(tabs));
}
```

### Шаг 3: Документировать

Добавить описание в этот файл в раздел "История версий данных".

---

## Что сохраняется при сбросе

Авто-сброс (при обновлении версии) и ручной сброс (Reset All) используют **одинаковую логику** через `performReset()`.

| Данные | Сохраняется |
|--------|-------------|
| Тема | ✅ Да |
| Автообновление | ✅ Да |
| Путь загрузок | ✅ Да (Rust backup) |
| Archive Log | ✅ Да (Rust backup) |
| Язык | ❌ Нет |
| Вкладки | ❌ Нет |
| Workflow | ❌ Нет |
| Claude настройки | ❌ Нет |
| Активный проект | ❌ Нет |

**Различия:**
- Авто-сброс: без перезагрузки страницы, без Rust команд
- Ручной сброс: с перезагрузкой страницы, с Rust командами (`reset_claude_state`, `reset_app_data`)

---

## Связанные документы

- [STORAGE_KEYS](../frontend/UTILS.md#константы) — Ключи localStorage
- [DATA-STRUCTURES](../frontend/DATA-STRUCTURES.md) — Структуры данных
- [LIMITATIONS](LIMITATIONS.md#localstorage-5-10-mb-лимит) — Лимиты хранилища
