# Claude API

[← Назад к Frontend](../02-FRONTEND.md)

> **Примечание:** Три модуля Claude содержат в сумме **43 функции**: claude-state.js (5) + claude-ui.js (5) + claude-api.js (33).

## claude-state.js (5 функций)

| Функция | Описание |
|---------|----------|
| `isProjectActive()` | Проверка активности проекта |
| `isCurrentTabProjectOwner()` | Текущая вкладка — владелец проекта? |
| `saveClaudeSettings()` | Сохранить в localStorage |
| `loadClaudeSettings()` | Загрузить настройки |
| `updateAllTabUrls()` | Обновить URL всех табов |

---

## claude-ui.js (5 функций)

| Функция | Описание |
|---------|----------|
| `createResizer()` | Создать ресайзер панелей |
| `updateResizer()` | Обновить позицию/видимость |
| `updateClaudeState()` | Получить состояние из Tauri |
| `updateClaudeUI()` | Обновить кнопки и табы |
| `updateWorkflowChatButtons()` | Обновить кнопки "Чат" в workflow |

---

## claude-api.js (33 функции)

### Core (7 функций)

| Функция | Описание |
|---------|----------|
| `evalInClaude(tab, script)` | Выполнить JS в Claude WebView |
| `navigateClaude(tab, url)` | Навигация с ожиданием загрузки |
| `sendNodeToClaude(index, chatTab)` | Отправить блок в Claude |
| `sendTextToClaude(text, tab)` | Отправить текст |
| `toggleClaude()` | Показать/скрыть панель |
| `switchClaudeTab(tab)` | Переключить таб (навигирует на claude.ai если about:blank) |
| `newChatInTab(tab, clearName)` | Создать новый чат в табе |

#### API Reference: sendNodeToClaude

```javascript
async function sendNodeToClaude(index, chatTab)
```

**Описание:** Отправляет блок по индексу в указанный таб Claude.

**Параметры:**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `index` | `number` | Индекс блока в текущей вкладке (0-based) |
| `chatTab` | `number` | Номер таба Claude (1-3) |

**Возвращает:** `Promise<void>`

**Исключения:**
- Если блок не найден
- Если таб не существует
- Если Claude WebView не готов

**Пример:**
```javascript
// Отправить первый блок в первый таб
await sendNodeToClaude(0, 1);

// С обработкой ошибок
try {
    await sendNodeToClaude(blockIndex, activeClaudeTab);
} catch (error) {
    showToast('Ошибка отправки: ' + error.message);
}
```

#### API Reference: toggleClaude

```javascript
async function toggleClaude()
```

**Описание:** Показывает или скрывает панель Claude с анимацией.

**Возвращает:** `Promise<boolean>` — новое состояние (true = видимо)

**Побочные эффекты:**
- Обновляет `AppState.claude.isVisible`
- Сохраняет в localStorage
- Вызывает `updateClaudeUI()`

```javascript
// Показать/скрыть панель Claude
await toggleClaude();

// Переключить на таб 2
await switchClaudeTab(2);

// Отправить блок 0 в таб 1
await sendNodeToClaude(0, 1);

// Создать новый чат в табе 1
await newChatInTab(1);
```

### Project API (5 функций)

| Функция | Описание |
|---------|----------|
| `getOrganizationId(tab)` | Получить org_id (кэшируется) |
| `invalidateOrgCache()` | Сброс кэша org_id |
| `createProjectViaAPI(tab)` | Создать проект через API |
| `createNewProject(tab)` | Создать с UI |
| `generateProjectName()` | Сгенерировать имя проекта |

```javascript
// Создать проект
const project = await createProjectViaAPI(1);
// { uuid: "...", name: "Project-YYYY-MM-DD" }

// Получить organization ID
const orgId = await getOrganizationId(1);

// Сбросить кэш (при смене аккаунта)
invalidateOrgCache();
```

### Wait Functions (4 функции)

| Функция | Описание |
|---------|----------|
| `waitForTabLoad(tab, timeoutMs)` | Ожидание загрузки страницы |
| `waitForClaudeInput(tab, timeout)` | Ожидание ProseMirror editor |
| `waitForFileInput(tab, timeout)` | Ожидание file input |
| `waitForFilesUploaded(tab, count, timeout)` | Ожидание загрузки файлов |

```javascript
// Дождаться загрузки страницы (10 сек)
await waitForTabLoad(1, 10000);

// Дождаться готовности input (15 сек)
await waitForClaudeInput(1, 15000);

// Дождаться загрузки 3 файлов (10 сек)
await waitForFilesUploaded(1, 3, 10000);
```

### Files (2 функции)

| Функция | Описание |
|---------|----------|
| `attachScriptsToMessage(tab, scripts)` | Прикрепить Python-скрипты |
| `attachFilesToMessage(tab, files)` | Прикрепить файлы |

```javascript
// Прикрепить скрипты
await attachScriptsToMessage(1, ['convert', 'count']);

// Прикрепить файлы
await attachFilesToMessage(1, [
    { name: 'doc.pdf', data: base64data }
]);
```

### Generation Monitor (4 функции)

| Функция | Описание |
|---------|----------|
| `injectGenerationMonitor(tab)` | Инжект монитора |
| `checkAllGenerationStatus()` | Проверить статус всех табов |
| `startGenerationMonitor()` | Запустить мониторинг |
| `stopGenerationMonitor()` | Остановить мониторинг |

```javascript
// Инжект в таб
await injectGenerationMonitor(1);

// Запустить глобальный мониторинг
startGenerationMonitor();

// Остановить
stopGenerationMonitor();
```

### Project Lifecycle (9 функций)

| Функция | Описание |
|---------|----------|
| `getProjectUUIDFromUrl(url)` | Извлечь UUID из URL проекта |
| `startProject(uuid, name, ownerTab)` | Начать работу с проектом |
| `finishProject()` | Завершить проект (снять привязку) |
| `continueProject()` | Продолжить найденный проект |
| `checkForContinueProject()` | Автопроверка URL на проект |
| `showContinueButton(uuid)` | Показать кнопку "Продолжить" |
| `hideContinueButton()` | Скрыть кнопку |
| `restoreProjectState()` | Восстановить из localStorage |
| `initProjectUrlTracking()` | Запуск отслеживания URL |

```javascript
// Получить UUID из URL
const uuid = getProjectUUIDFromUrl('https://claude.ai/project/abc-123');
// 'abc-123'

// Начать проект
startProject('abc-123', 'My Project', 'my-tab');

// Завершить
await finishProject();
```

### Init (2 функции)

| Функция | Описание |
|---------|----------|
| `restoreClaudeState()` | Восстановить при запуске приложения |
| `initClaudeHandlers()` | Инициализация обработчиков событий |

---

## Полный пример: отправка блока

```javascript
async function sendBlockToChat(blockIndex, chatTab) {
    // 1. Показать панель если скрыта
    if (!isClaudeVisible) {
        await toggleClaude();
    }
    
    // 2. Переключить на нужный таб
    await switchClaudeTab(chatTab);
    
    // 3. Дождаться готовности
    await waitForClaudeInput(chatTab, 15000);
    
    // 4. Отправить блок
    await sendNodeToClaude(blockIndex, chatTab);
}
```

## Полный пример: создание проекта

```javascript
async function createAndBindProject(tab) {
    // 1. Создать проект
    const project = await createProjectViaAPI(tab);
    
    // 2. Привязать к вкладке
    startProject(project.uuid, project.name, currentTab);
    
    // 3. Обновить UI
    updateClaudeUI();
    updateWorkflowChatButtons();
    
    return project;
}
```

---

## Паттерны и Best Practices

### Tauri Event Listener с Timeout

**Проблема:** При использовании `listen().then()` для async unlisten функции возникает race condition — если timeout сработает раньше чем резолвится Promise от listen(), `unlisten` будет null и listener останется висеть (memory leak).

**Неправильно:**
```javascript
async function waitForEvent(tab, timeoutMs) {
    let unlisten = null;  // ❌ Может остаться null при timeout
    
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            if (unlisten) unlisten();  // ❌ unlisten может быть null!
            resolve(false);
        }, timeoutMs);
        
        window.__TAURI__.event.listen('event-name', handler)
            .then(fn => { unlisten = fn; });  // ❌ Async assignment
    });
}
```

**Правильно:**
```javascript
async function waitForEvent(tab, timeoutMs) {
    let resolved = false;
    let resolvePromise;
    
    // 1. Сначала await listen() — гарантируем наличие unlisten
    const unlisten = await window.__TAURI__.event.listen('event-name', (event) => {
        if (!resolved && event.payload?.tab === tab) {
            resolved = true;
            clearTimeout(timeout);
            unlisten();  // ✅ Гарантированно существует
            resolvePromise(true);
        }
    });
    
    const promise = new Promise((resolve) => {
        resolvePromise = resolve;
    });
    
    // 2. Потом создаём timeout
    const timeout = setTimeout(() => {
        if (!resolved) {
            resolved = true;
            unlisten();  // ✅ Гарантированно существует
            resolvePromise(false);
        }
    }, timeoutMs);
    
    return promise;
}
```

### Защита от двойного клика

Для длительных операций (sendNodeToClaude) используйте флаг:

```javascript
let isOperationInProgress = false;

async function longOperation() {
    if (isOperationInProgress) {
        showToast('Операция уже выполняется...');
        return;
    }
    
    isOperationInProgress = true;
    try {
        // ... длительная операция
    } finally {
        isOperationInProgress = false;
    }
}
```

### Debounce Timeout с очисткой

При повторных вызовах очищайте предыдущий timeout:

```javascript
let debounceTimeout = null;

function debouncedAction() {
    if (debounceTimeout) {
        clearTimeout(debounceTimeout);  // ✅ Очищаем предыдущий
    }
    debounceTimeout = setTimeout(() => {
        // действие
        debounceTimeout = null;
    }, 500);
}
```

### Error Handling в критических функциях

Для функций инициализации (restoreClaudeState) используйте полный error handling:

```javascript
async function criticalInit() {
    try {
        // ... сложная логика инициализации
    } catch (e) {
        console.error('[Module] Failed to init:', e);
        showToast('Не удалось инициализировать модуль');
        // Fallback к безопасному состоянию
        await resetToDefaults();
    }
}
```

### localStorage Quota Handling

Используйте `safeSetItem()` из storage.js для защиты от переполнения:

```javascript
// storage.js уже содержит:
function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            showToast('Хранилище переполнено');
            return false;
        }
        throw e;
    }
}

// Использование через saveToStorage():
saveToStorage(STORAGE_KEYS.SOME_KEY, data);
```

---

## Связанные документы

- [../04-CLAUDE.md](../04-CLAUDE.md) — Интеграция с Claude
- [../03-BACKEND.md](../03-BACKEND.md) — Tauri commands для Claude
- [APPSTATE.md](APPSTATE.md) — Claude state в AppState
- [EMBEDDED-SCRIPTS.md](EMBEDDED-SCRIPTS.md) — Прикрепляемые скрипты
