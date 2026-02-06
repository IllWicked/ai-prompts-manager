# Структуры данных

[← Назад к Frontend](../02-FRONTEND.md)

## Диаграмма связей

```mermaid
erDiagram
    TAB ||--o{ BLOCK : contains
    TAB ||--o{ SEPARATOR : contains
    TAB ||--|| WORKFLOW_STATE : has
    
    BLOCK ||--o| INSTRUCTION : may_have
    INSTRUCTION ||--o{ FIELD : has
    
    WORKFLOW_STATE ||--o{ POSITION : stores
    WORKFLOW_STATE ||--o{ SIZE : stores
    WORKFLOW_STATE ||--o{ CONNECTION : stores
    
    CONNECTION }o--|| BLOCK : from
    CONNECTION }o--|| BLOCK : to
    
    BLOCK ||--o| BLOCK_SCRIPTS : may_have
    BLOCK ||--o| BLOCK_AUTOMATION : may_have
    
    TAB {
        string id PK
        string name
        string version
    }
    
    BLOCK {
        string id PK
        string type
        string title
        string content
    }
    
    CONNECTION {
        string from FK
        string fromSide
        string to FK
        string toSide
    }
    
    ACTIVE_PROJECT {
        string uuid
        string name
        string ownerTab FK
    }
```

---

## Tab (вкладка)

```javascript
{
    id: "my-tab",           // Уникальный ID (lowercase slug от name)
    name: "MY-TAB",         // Отображаемое имя (всегда UPPERCASE)
    version: "1.0.0",       // Версия (для remote prompts)
    items: [                // Массив элементов
        { type: "block", ... },
        { type: "separator", id: "sep-123" }
    ]
}
```

**Правила именования:**
- `name` — всегда в ВЕРХНЕМ регистре
- `id` — всегда в нижнем регистре (генерируется из name)
- Пробелы в name заменяются на дефисы в id

Вкладки сортируются по алфавиту (по полю `name`).

## Block (блок промпта)

```javascript
{
    id: "block-123",        // Уникальный ID
    type: "block",          // Тип элемента
    title: "Title",         // Заголовок
    content: "Prompt text", // Текст промпта
    instruction: {          // Опционально: инструкция
        type: "input",      // "input" | "info"
        icon: "edit",       // Иконка кнопки
        text: "Button",     // Текст кнопки
        fields: [           // Поля для ввода
            {
                label: "Name",
                placeholder: "Enter...",
                prefix: "by name",
                optional: false,
                savedPosition: null  // Для скрытых optional полей
            }
        ]
    }
}
```

## Separator (разделитель)

```javascript
{
    id: "sep-123",
    type: "separator"
}
```

## Workflow State

```javascript
// localStorage: workflow-{tabId}
{
    positions: {            // Позиции блоков на canvas
        "block-123": { x: 100, y: 200 }
    },
    sizes: {                // Размеры блоков
        "block-123": { width: 680, height: 500 }
    },
    connections: [          // Связи между блоками
        {
            from: "block-123",
            fromSide: "right",  // "top" | "right" | "bottom" | "left"
            to: "block-456",
            toSide: "left"
        }
    ]
}
```

## Claude Settings

```javascript
// localStorage: claudeSettings
{
    isVisible: false,          // Панель Claude открыта
    activeTab: 1,              // Активный таб (1-3)
    tabUrls: {                 // URL каждого таба
        "1": "https://claude.ai/chat/...",
        "2": "https://claude.ai/chat/..."
    },
    tabNames: {                // Названия чатов
        "1": "My Chat"
    },
    panelRatio: 50             // Соотношение панелей (35-65)
}
```

## Active Project

```javascript
// localStorage: active-project
{
    uuid: "proj-uuid-123",  // UUID проекта Claude
    name: "Project Name",   // Название
    ownerTab: "my-tab"      // Вкладка APM — владелец
}
```

## Settings

```javascript
// localStorage: ai-prompts-manager-settings
{
    autoUpdate: true,       // Автообновление приложения
    theme: "auto",          // "light" | "dark" | "auto"
    adminMode: false        // Режим администратора
}
```

## Claude Auto-Send

```javascript
// localStorage: claude_auto_send
"true" | "false"            // Автоматическая отправка при вставке в Claude
```

## Block Scripts

```javascript
// localStorage: block-scripts
{
    "block-123": ["convert", "count"],
    "block-456": ["spellcheck"]
}
```

## Block Automation

```javascript
// localStorage: block-automation
{
    "block-123": {
        newProject: true,   // Флаг P
        newChat: false      // Флаг N
    }
}
```

## Collapsed Blocks

```javascript
// localStorage: collapsed-blocks
// Объект с ID свёрнутых блоков (ключ = blockId, значение = true)
{
    "block-123": true,
    "block-789": true
}
```

---

## Cleanup при удалении блока

При удалении блока через `removeItemFromTab()` автоматически очищаются связанные данные:

| Данные | Очистка |
|--------|---------|
| `field-value-{tabId}-{blockId}-*` | ✅ Удаляются из localStorage |
| `collapsedBlocks[blockId]` | ✅ Удаляется из памяти и storage |
| `blockScripts[blockId]` | ✅ Удаляется из памяти и storage |
| `blockAutomation[blockId]` | ✅ Удаляется из памяти и storage |
| `blockAttachments[blockId]` | ✅ Удаляется из памяти (runtime only) |
| `workflowPositions[blockId]` | ❌ Очищается при saveWorkflowState() |
| `workflowSizes[blockId]` | ❌ Очищается при saveWorkflowState() |
| `workflowConnections` с блоком | ❌ Очищается при saveWorkflowState() |

> **Примечание:** Workflow данные очищаются отдельно в вызывающем коде после `removeItemFromTab()` через `saveWorkflowState()`.

---

## Связанные документы

- [APPSTATE.md](APPSTATE.md) — Shared State
- [UTILS.md](UTILS.md) — STORAGE_KEYS
- [TABS-BLOCKS.md](TABS-BLOCKS.md) — Работа с вкладками и блоками
- [../reference/GLOSSARY.md](../reference/GLOSSARY.md) — Глоссарий терминов
