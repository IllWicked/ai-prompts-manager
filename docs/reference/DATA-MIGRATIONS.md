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

## Код миграции

### checkAppVersionAndReset()

```javascript
async function checkAppVersionAndReset() {
    const currentAppVersion = await getAppVersion();
    const savedAppVersion = localStorage.getItem(STORAGE_KEYS.APP_VERSION) || '0.3.0';
    
    // Сброс если версия изменилась
    const needsReset = currentAppVersion !== savedAppVersion;
    
    if (needsReset && savedAppVersion !== '0.3.0') {
        // Сбрасываем данные вкладок
        localStorage.removeItem(STORAGE_KEYS.TABS);
        // Очистка legacy ключей
        localStorage.removeItem('ai-prompts-manager-data');
        localStorage.removeItem('ai-prompts-manager-data-task4');
        // НЕ трогаем: настройки, язык
    }
    
    localStorage.setItem(STORAGE_KEYS.APP_VERSION, currentAppVersion);
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

| Данные | Сохраняются при сбросе APP | Сохраняются при Reset All |
|--------|---------------------------|--------------------------|
| Тема | ✅ Да | ✅ Да |
| Автообновление | ✅ Да | ✅ Да |
| Язык | ❌ Нет | ❌ Нет |
| Вкладки | ❌ Нет | ❌ Нет |
| Workflow | ❌ Нет | ❌ Нет |
| Путь загрузок | ✅ Да | ✅ Да |
| Archive Log | ✅ Да | ✅ Да |

---

## Связанные документы

- [STORAGE_KEYS](../frontend/UTILS.md#константы) — Ключи localStorage
- [DATA-STRUCTURES](../frontend/DATA-STRUCTURES.md) — Структуры данных
- [LIMITATIONS](LIMITATIONS.md#localstorage-5-10-mb-лимит) — Лимиты хранилища
