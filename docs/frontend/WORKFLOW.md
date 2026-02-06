# Workflow

[← Назад к Frontend](../02-FRONTEND.md)

## Поток данных

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interaction                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
   ┌───────────┐    ┌───────────┐    ┌───────────┐
   │  Drag     │    │  Resize   │    │ Connection│
   │  Block    │    │  Block    │    │  Create   │
   └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
         │                │                │
         └────────────────┼────────────────┘
                          │
                          ▼
                  ┌───────────────┐
                  │  AppState     │
                  │  .workflow    │
                  │  .interaction │
                  └───────┬───────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
      ┌───────────────┐       ┌───────────────┐
      │ renderWorkflow│       │ renderConnect-│
      │      ()       │       │    ions()     │
      └───────┬───────┘       └───────┬───────┘
              │                       │
              └───────────┬───────────┘
                          │
                          ▼
                  ┌───────────────┐
                  │saveWorkflow   │
                  │   State()     │
                  └───────┬───────┘
                          │
                          ▼
                  ┌───────────────┐
                  │  localStorage │
                  │ workflow-{id} │
                  └───────────────┘
```

---

## workflow-state.js (2 функции)

| Функция | Описание |
|---------|----------|
| `saveWorkflowState(skipUndo)` | Сохранить в `workflow-{tabId}` |
| `loadWorkflowState()` | Загрузить состояние |

### Примеры

```javascript
// После перемещения блока
saveWorkflowState();

// С пропуском записи в undo
saveWorkflowState(true);

// При загрузке вкладки
loadWorkflowState();
```

---

## workflow-grid.js (2 функции)

| Функция | Описание |
|---------|----------|
| `updateGridOverlay(x, y, width, height)` | Показать сетку вокруг блока |
| `clearGridOverlay()` | Очистить сетку |

Сетка показывает точки вокруг перетаскиваемого блока с градиентом размера и цвета в зависимости от расстояния.

---

## workflow-zoom.js (5 функций)

| Функция | Описание |
|---------|----------|
| `adjustWorkflowScale(resetScroll)` | Масштабирование под контейнер |
| `calculateContentBounds()` | Вычисление границ контента |
| `calculateViewModeZoom()` | Расчёт zoom для view mode |
| `setupWorkflowZoom()` | Настройка обработчиков |
| `scrollToBlocks()` | Скролл к блокам |

### Режимы

**Edit mode:**
- Применяется `workflowZoom` из localStorage
- Большой холст 5000x5000
- Ctrl+Scroll для zoom
- Средняя кнопка / Space+Drag для pan

**View mode:**
- Автоматический zoom чтобы все блоки были видны
- Скролл отключён

### Примеры

```javascript
// Настроить при инициализации
setupWorkflowZoom();

// Подстроить масштаб (view mode)
adjustWorkflowScale();

// Прокрутить к блокам
scrollToBlocks();
```

---

## workflow-interactions.js (6 функций)

| Функция | Описание |
|---------|----------|
| `clearNodeSelection()` | Очистить выделение |
| `onNodeDrag(e)` | Обработчик перетаскивания |
| `onNodeDragEnd()` | Завершение перетаскивания |
| `onNodeResize(e)` | Обработчик изменения размера |
| `onNodeResizeEnd(e)` | Завершение изменения размера |
| `resetDragResizeState()` | Сброс состояний (при потере фокуса) |

### Горячие клавиши

| Клавиша | Действие |
|---------|----------|
| `Ctrl+Click` | Multi-select |
| `Ctrl+A` | Select all |
| `Delete` | Delete selected |
| `F2` | Rename block |

---

## workflow-render.js (14 функций)

| Функция | Описание |
|---------|----------|
| `initWorkflow()` | Инициализация workflow режима |
| `scrollToCanvasCenter(container)` | Скролл к центру холста |
| `renderWorkflow(preserveScroll)` | Рендеринг всех блоков |
| `autoPositionNodes(promptsData)` | Автоматическое размещение |
| `generateExpandedFooterHtml(index, chatTabs, opts)` | HTML footer блока |
| `createWorkflowNode(block, index)` | Создание DOM ноды |
| `createWorkflowInstruction(block, index)` | Создание инструкции |
| `setupNodeEvents(node, index)` | Настройка событий ноды |
| `editWorkflowNode(index)` | Открытие редактирования |
| `showBlockEditModal(block, index)` | Показать модалку |
| `hideWorkflowEditModal()` | Скрыть модалку |
| `saveWorkflowEdit()` | Сохранить изменения |
| `deleteWorkflowBlock(index)` | Удалить блок |
| `saveBlockContent(blockId, content)` | Сохранить контент |

### Примеры

```javascript
// Перерендерить workflow
renderWorkflow();

// С сохранением позиции скролла
renderWorkflow(true);

// Авторазмещение при импорте без позиций
autoPositionNodes(promptsData);

// Редактирование блока
editWorkflowNode(0);  // Первый блок
```

### Modal State

В модалке редактирования есть локальный undo/redo:

```javascript
const modalState = {
    undoStack: [],
    redoStack: []
};
```

---

## connections.js (10 функций)

| Функция | Описание |
|---------|----------|
| `getPortPosition(blockId, side)` | Позиция порта |
| `buildBezierPath(startX, startY, startSide, endX, endY, endSide)` | SVG Bezier S-кривая |
| `findNearestPort(x, y, excludeBlockId)` | Поиск ближайшего порта |
| `wouldCreateCycle(fromBlockId, toBlockId)` | Проверка на циклы |
| `addConnection(from, fromSide, to, toSide)` | Добавить связь |
| `removeConnection(from, fromSide, to, toSide)` | Удалить связь |
| `renderConnections()` | Рендеринг всех связей |
| `onConnectionDrag(e)` | Обработчик drag связи |
| `onConnectionEnd(e)` | Завершение создания |
| `setupPortEvents(port)` | Настройка обработчиков событий на порте |

### Порты

Каждый блок имеет 4 порта: `top`, `right`, `bottom`, `left`.

### Примеры

```javascript
// Добавить связь
addConnection('block-1', 'right', 'block-2', 'left');

// Проверить на цикл перед добавлением
if (!wouldCreateCycle('block-1', 'block-2')) {
    addConnection('block-1', 'right', 'block-2', 'left');
}

// Удалить связь
removeConnection('block-1', 'right', 'block-2', 'left');

// Перерендерить все связи
renderConnections();

// Получить позицию порта
const pos = getPortPosition('block-1', 'right');
// { x: 780, y: 350 }
```

### Структура связи

```javascript
{
    from: "block-123",
    fromSide: "right",   // "top" | "right" | "bottom" | "left"
    to: "block-456",
    toSide: "left"
}
```

---

## Связанные документы

- [DATA-STRUCTURES.md](DATA-STRUCTURES.md) — Workflow State структура
- [TABS-BLOCKS.md](TABS-BLOCKS.md) — Вкладки и блоки
- [UTILS.md](UTILS.md) — WORKFLOW_CONFIG константы
- [APPSTATE.md](APPSTATE.md) — Shared State
