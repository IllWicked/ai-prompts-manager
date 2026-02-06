# AppState — Shared State

[← Назад к Frontend](../02-FRONTEND.md)

## window.AppState

Глобальное состояние для связи между модулями.

```javascript
window.AppState = {
    workflow: {
        mode: true,              // Workflow режим активен
        connections: [],         // Связи [{from, fromSide, to, toSide}]
        positions: {},           // {blockId: {x, y}}
        sizes: {},               // {blockId: {width, height}}
        zoom: 0.6                // Текущий zoom (0.4-1.25)
    },
    interaction: {
        isResizing: false,       // Идёт resize ноды
        resizeNode: null,        // DOM элемент
        resizeStart: {           // Начальные значения
            x: 0, y: 0, 
            width: 0, height: 0, 
            left: 0, top: 0 
        },
        resizeDirection: null,   // 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'
        selectedNodes: new Set(),// Выбранные ноды (blockId)
        isDragging: false,       // Идёт drag нод
        dragOffsets: {},         // {blockId: {x, y}}
        clipboard: [],           // Скопированные блоки
        isCreatingConnection: false, // Создание связи
        connectionStart: null,   // {blockId, side}
        tempLineEl: null         // SVG элемент временной линии
    },
    claude: {
        isVisible: false,        // Панель Claude открыта
        activeTab: 1,            // Активный таб (1-3)
        generatingTabs: {},      // {tab: boolean}
        tabUrls: {},             // {tab: url}
        tabNames: {},            // {tab: name}
        panelRatio: 50,          // Соотношение панелей (35-65%)
        isResetting: false,      // Идёт сброс
        project: null            // {uuid, name, ownerTab} | null
    },
    resizer: {
        element: null,           // DOM элемент ресайзера
        isResizing: false,       // Идёт перетаскивание
        startX: 0,               // Начальная X позиция
        startRatio: 0,           // Начальное соотношение
        windowWidth: 0,          // Ширина окна
        lastAppliedRatio: 0,     // Последнее применённое
        updateScheduled: false   // Throttle флаг
    },
    app: {
        currentTab: 'default',   // ID текущей вкладки APM
        isEditMode: false,       // Режим редактирования
        isAdminMode: false,      // Режим администратора
        isAppInitialized: false, // Приложение инициализировано
        currentLanguage: 'en',   // Текущий язык
    }
};
```

---

## Алиасы для обратной совместимости

34 алиаса для упрощения доступа к состоянию:

### App State

```javascript
currentTab ↔ AppState.app.currentTab
isEditMode ↔ AppState.app.isEditMode
isAdminMode ↔ AppState.app.isAdminMode
currentLanguage ↔ AppState.app.currentLanguage
```

### Workflow

```javascript
workflowMode ↔ AppState.workflow.mode
workflowConnections ↔ AppState.workflow.connections
workflowPositions ↔ AppState.workflow.positions
workflowSizes ↔ AppState.workflow.sizes
workflowZoom ↔ AppState.workflow.zoom
```

### Interaction

```javascript
isResizingNode ↔ AppState.interaction.isResizing
resizeNode ↔ AppState.interaction.resizeNode
resizeDirection ↔ AppState.interaction.resizeDirection
selectedNodes ↔ AppState.interaction.selectedNodes
isDraggingNode ↔ AppState.interaction.isDragging
dragOffsets ↔ AppState.interaction.dragOffsets
clipboard ↔ AppState.interaction.clipboard
isCreatingConnection ↔ AppState.interaction.isCreatingConnection
connectionStart ↔ AppState.interaction.connectionStart
tempLineEl ↔ AppState.interaction.tempLineEl
```

### Claude

```javascript
isClaudeVisible ↔ AppState.claude.isVisible
activeClaudeTab ↔ AppState.claude.activeTab
generatingTabs ↔ AppState.claude.generatingTabs
tabUrls ↔ AppState.claude.tabUrls
tabNames ↔ AppState.claude.tabNames
panelRatio ↔ AppState.claude.panelRatio
isResetting ↔ AppState.claude.isResetting
activeProject ↔ AppState.claude.project
```

### Resizer

```javascript
resizer ↔ AppState.resizer.element
isResizing ↔ AppState.resizer.isResizing
startX ↔ AppState.resizer.startX
startRatio ↔ AppState.resizer.startRatio
windowWidth ↔ AppState.resizer.windowWidth
lastAppliedRatio ↔ AppState.resizer.lastAppliedRatio
updateScheduled ↔ AppState.resizer.updateScheduled
```

---

## Примеры использования

### Через алиасы (рекомендуется)

```javascript
// Читать
console.log(currentTab);      // 'my-tab'
console.log(isEditMode);      // false
console.log(workflowZoom);    // 0.6

// Записывать
currentTab = 'another-tab';
isEditMode = true;
workflowZoom = 0.8;
```

### Напрямую

```javascript
// Читать
console.log(window.AppState.app.currentTab);
console.log(window.AppState.workflow.connections.length);

// Записывать
window.AppState.workflow.zoom = 0.8;
window.AppState.claude.activeTab = 2;
```

### Работа с коллекциями

```javascript
// Позиции блоков
workflowPositions['block-123'] = { x: 100, y: 200 };
const pos = workflowPositions['block-123'];

// Выбранные ноды
selectedNodes.add('block-123');
selectedNodes.delete('block-456');
if (selectedNodes.has('block-123')) { ... }
selectedNodes.clear();

// Связи
workflowConnections.push({
    from: 'block-1',
    fromSide: 'right',
    to: 'block-2',
    toSide: 'left'
});
```

---

## Инициализация

AppState инициализируется в index.html при загрузке страницы:

```javascript
// Начальные значения
window.AppState = { ... };

// Загрузка из localStorage
const savedZoom = localStorage.getItem('workflowZoom');
if (savedZoom) {
    window.AppState.workflow.zoom = parseFloat(savedZoom);
}

// Загрузка настроек Claude
loadClaudeSettings();
```

---

## Персистенция

| Состояние | localStorage key | Модуль |
|-----------|------------------|--------|
| `workflow.*` | `workflow-{tabId}` | workflow-state.js |
| `claude.*` | `claudeSettings` | claude-state.js |
| `app.currentTab` | `ai-prompts-manager-tab` | index.html |
| `app.currentLanguage` | `ai-prompts-manager-language` | index.html |
| `workflow.zoom` | `workflowZoom` | workflow-zoom.js |
| Dynamic Input values | `field-value-{fieldId}` | index.html |

```javascript
// Сохранение workflow
saveWorkflowState();

// Сохранение Claude settings
saveClaudeSettings();
```

---

## Undo Snapshot

Undo/Redo работает **per-tab** — каждая вкладка имеет свою историю.

### Содержимое snapshot

```javascript
{
    tabId: string,           // ID вкладки
    workflow: {              // Workflow данные
        positions: {},       // {blockId: {x, y}}
        sizes: {},           // {blockId: {width, height}}
        connections: []      // [{from, fromSide, to, toSide}]
    },
    tabData: string,         // JSON.stringify(tab) - блоки, заголовки, контент
    fieldValues: {},         // {key: value} - значения полей ввода
    collapsedBlocks: {},     // {blockId: true} - состояние свёрнутых блоков
    blockScripts: {},        // {blockId: ['convert', 'count']} - прикреплённые скрипты
    blockAutomation: {}      // {blockId: {newProject, newChat}} - флаги автоматизации
}
```

### Что восстанавливается при Undo

| Данные | Восстанавливается |
|--------|-------------------|
| Позиции блоков в workflow | ✅ |
| Размеры блоков | ✅ |
| Связи между блоками | ✅ |
| Содержимое блоков (текст) | ✅ |
| Заголовки блоков | ✅ |
| Значения полей ввода | ✅ |
| Состояние свёрнутых блоков | ✅ |
| Прикреплённые скрипты | ✅ |
| Флаги автоматизации (P, N) | ✅ |
| Прикреплённые файлы | ❌ (runtime only) |

### Ограничения

- **MAX_HISTORY_SIZE = 50** — максимум записей в стеке
- **UNDO_DEBOUNCE_MS = 500** — быстрые изменения объединяются
- При удалении вкладки история удаляется
- `blockAttachments` не персистятся и не восстанавливаются

---

## Связанные документы

- [DATA-STRUCTURES.md](DATA-STRUCTURES.md) — Структуры данных
- [UTILS.md](UTILS.md) — STORAGE_KEYS и утилиты
- [WORKFLOW.md](WORKFLOW.md) — Workflow модули
- [CLAUDE-API.md](CLAUDE-API.md) — Claude состояние
