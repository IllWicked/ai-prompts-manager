# Вкладки и блоки

[← Назад к Frontend](../02-FRONTEND.md)

## tabs.js (10 функций)

| Функция | Описание |
|---------|----------|
| `getTabItems(tabId)` | Все items вкладки (блоки + разделители) |
| `getTabBlocks(tabId)` | Только блоки с нумерацией |
| `createNewTab(name)` | Создать вкладку |
| `renameTab(oldId, newName)` | Переименовать (меняет и name, и id) |
| `deleteTab(id)` | Удалить (кроме последней) |
| `removeItemFromTab(tabId, itemId)` | Удалить item по ID |
| `updateBlockInstruction(tabId, blockNumber, instr)` | Обновить инструкцию |
| `markTabAsModified(tabId)` | Пометить remote-вкладку как изменённую |
| `showAddTabModal()` / `hideAddTabModal()` | Модалка добавления |

### Примеры

```javascript
// Создать вкладку
const newTab = createNewTab('My Prompts');
// { id: 'my-prompts', name: 'My Prompts', order: 2, items: [] }

// Получить блоки с нумерацией
const blocks = getTabBlocks('my-prompts');
// [{ block: {...}, number: 1 }, { block: {...}, number: 2 }]

// Получить все items (включая разделители)
const items = getTabItems('my-prompts');

// Удалить item по ID
removeItemFromTab('my-prompts', 'item_123456');

// Переименовать вкладку
renameTab('my-prompts', 'Better Name');
// Вкладка теперь имеет id: 'better-name', name: 'Better Name'
```

---

## blocks.js (13 функций)

### Collapsed Blocks (свёрнутые блоки)

| Функция | Описание |
|---------|----------|
| `loadCollapsedBlocks()` | Загрузить из storage |
| `saveCollapsedBlocks()` | Сохранить |
| `isBlockCollapsed(blockId)` | Проверка свёрнут ли |

```javascript
// Проверить
if (isBlockCollapsed('block-123')) {
    // Блок свёрнут
}
```

### Block Scripts (скрипты блоков)

| Функция | Описание |
|---------|----------|
| `loadBlockScripts()` | Загрузить из storage |
| `saveBlockScripts()` | Сохранить |
| `hasBlockScript(blockId, scriptKey)` | Проверить скрипт |
| `getBlockScripts(blockId)` | Получить все скрипты |

```javascript
// Проверить конкретный скрипт
if (hasBlockScript('block-123', 'convert')) {
    // convert.py прикреплён
}

// Получить все скрипты блока
const scripts = getBlockScripts('block-123');
// ['convert', 'count']
```

### Block Automation (флаги автоматизации)

| Функция | Описание |
|---------|----------|
| `loadBlockAutomation()` | Загрузить из storage |
| `saveBlockAutomation()` | Сохранить |
| `hasBlockAutomation(blockId, flag)` | Проверить флаг |
| `getBlockAutomationFlags(blockId)` | Получить все флаги |

```javascript
// Проверить флаг
if (hasBlockAutomation('block-123', 'newProject')) {
    // Флаг P активен
}

// Получить все флаги
const flags = getBlockAutomationFlags('block-123');
// { newProject: true, newChat: false }
```

### Block Instructions (инструкции)

| Функция | Описание |
|---------|----------|
| `removeBlockInstruction(blockNumber)` | Удалить инструкцию |
| `addBlockInstruction(blockNumber, type)` | Добавить инструкцию |

```javascript
// Добавить инструкцию типа 'input'
addBlockInstruction(1, 'input');

// Добавить инструкцию типа 'info'
addBlockInstruction(2, 'info');

// Удалить
removeBlockInstruction(1);
```

---

## undo.js — UndoManager v2

Command-based per-tab система истории изменений.

**Принцип:** snapshot создаётся только по явной команде из точки действия пользователя (ДО изменения). Save-функции (`saveAllTabs`, `saveWorkflowState`) не триггерят undo.

**Константы:**
- `MAX_HISTORY_SIZE = 50` — максимум записей в истории
- `SNAPSHOT_DEBOUNCE_MS = 1000` — debounce для набора текста

### UndoManager API

| Метод | Описание |
|-------|----------|
| `UndoManager.snapshot(force?)` | Сохранить текущее состояние в undo-стек. `force=true` обходит debounce |
| `UndoManager.undo()` | Отмена |
| `UndoManager.redo()` | Повтор |
| `UndoManager.init()` | Инициализация (захват начального состояния) |
| `UndoManager.switchTab(old, new)` | Сохранить/загрузить стеки при переключении вкладки |
| `UndoManager.renameTab(oldId, newId)` | Перенести историю при ренейме |
| `UndoManager.deleteTab(tabId)` | Очистить историю при удалении |
| `UndoManager.isRestoring` | Геттер: идёт ли восстановление состояния |
| `UndoManager.updateButtons()` | Обновить состояние кнопок Undo/Redo |

### Примеры

```javascript
// Перед деструктивным действием — принудительный snapshot
UndoManager.snapshot(true);
deleteBlock(blockId);

// Перед набором текста — snapshot с debounce
UndoManager.snapshot();
saveBlockContent(blockId, newContent);

// Отмена / Повтор
UndoManager.undo();
UndoManager.redo();
```

### Структура состояния (snapshot)

```javascript
{
    tabId: 'tab-id',
    workflow: {
        positions: {...},   // из глобальных переменных (не localStorage)
        connections: [...],
        sizes: {...}
    },
    tabData: {...},          // deep clone из getAllTabs() кэша
    fieldValues: {...},      // из localStorage (field-value-*)
    collapsedBlocks: {...},  // из глобального collapsedBlocks
    blockScripts: {...},     // из глобального blockScripts
    blockAutomation: {...}   // из глобального blockAutomation
}
```

### Backward-compatible shims

Удалены — вся кодовая база мигрирована на UndoManager.

---

## Связанные документы

- [DATA-STRUCTURES.md](DATA-STRUCTURES.md) — Структуры Tab и Block
- [WORKFLOW.md](WORKFLOW.md) — Workflow редактор
- [UTILS.md](UTILS.md) — storage.js для сохранения
- [../03-BACKEND.md](../03-BACKEND.md) — Tauri commands
