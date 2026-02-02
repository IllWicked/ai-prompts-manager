# Вкладки и блоки

[← Назад к Frontend](../02-FRONTEND.md)

## tabs.js (12 функций)

| Функция | Описание |
|---------|----------|
| `getTabItems(tabId)` | Все items вкладки (блоки + разделители) |
| `getTabBlocks(tabId)` | Только блоки с нумерацией |
| `createNewTab(name)` | Создать вкладку |
| `updateTab(id, updates)` | Обновить данные |
| `renameTab(oldId, newName)` | Переименовать (меняет и name, и id) |
| `deleteTab(id)` | Удалить (кроме последней) |
| `addBlockToTab(tabId)` | Добавить блок |
| `removeItemFromTab(tabId, itemId)` | Удалить item по ID |
| `removeBlockFromTab(tabId, blockNumber)` | Удалить блок по номеру |
| `updateBlockTitle(tabId, blockNumber, title)` | Обновить заголовок |
| `updateBlockInstruction(tabId, blockNumber, instr)` | Обновить инструкцию |
| `showAddTabModal()` / `hideAddTabModal()` | Модалка добавления |

### Примеры

```javascript
// Создать вкладку
const newTab = createNewTab('My Prompts');
// { id: 'my-prompts', name: 'My Prompts', order: 2, items: [] }

// Добавить блок
addBlockToTab('my-prompts');

// Получить блоки с нумерацией
const blocks = getTabBlocks('my-prompts');
// [{ block: {...}, number: 1 }, { block: {...}, number: 2 }]

// Получить все items (включая разделители)
const items = getTabItems('my-prompts');

// Обновить заголовок
updateBlockTitle('my-prompts', 1, 'New Title');

// Удалить блок
removeBlockFromTab('my-prompts', 1);

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

## undo.js (7 функций)

Per-tab система истории изменений.

**Константы:**
- `MAX_HISTORY_SIZE = 50` — максимум записей в истории
- `UNDO_DEBOUNCE_MS = 500` — debounce объединения изменений

| Функция | Описание |
|---------|----------|
| `initTabHistory(tabId)` | Инициализация истории для вкладки |
| `captureCurrentTabState()` | Захват текущего состояния |
| `applyCurrentTabState(state)` | Применить состояние |
| `autoSaveToUndo()` | Автосохранение (debounced) |
| `executeUndoRedo(action)` | Общий helper |
| `undo()` | Отмена |
| `redo()` | Повтор |
| `updateUndoRedoButtons()` | Обновить кнопки |

### Примеры

```javascript
// Перед изменением — сохранить в историю
autoSaveToUndo();

// Выполнить изменение
updateBlockTitle('my-tab', 1, 'New Title');

// Отмена
undo();

// Повтор
redo();
```

### Структура состояния

```javascript
// captureCurrentTabState() возвращает:
{
    workflow: {
        positions: {...},
        sizes: {...},
        connections: [...]
    },
    tabData: {...},      // Данные вкладки
    fieldValues: {...}   // Значения полей
}
```

---

## Связанные документы

- [DATA-STRUCTURES.md](DATA-STRUCTURES.md) — Структуры Tab и Block
- [WORKFLOW.md](WORKFLOW.md) — Workflow редактор
- [UTILS.md](UTILS.md) — storage.js для сохранения
- [../03-BACKEND.md](../03-BACKEND.md) — Tauri commands
