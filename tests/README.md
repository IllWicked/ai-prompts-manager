# AI Prompts Manager - Unit Tests

## Обзор

Unit-тесты для AI Prompts Manager v4.2.0. Тесты написаны на Jest с использованием jsdom для эмуляции браузерного окружения.

## Статистика

| Метрика | Значение |
|---------|----------|
| Test Suites | 7 passed |
| Tests | 265 total (260 passed, 5 skipped) |
| Время выполнения | ~3.6s |

### Покрытие по модулям

| Модуль | Тестов | Статус |
|--------|--------|--------|
| smoke.test.js | 11 | ✅ Passed |
| storage.test.js | 52 (2 skipped) | ✅ Passed |
| tabs.test.js | 51 | ✅ Passed |
| undo.test.js | 44 | ✅ Passed |
| connections.test.js | 35 | ✅ Passed |
| utils.test.js | 39 (3 skipped) | ✅ Passed |
| export-import.test.js | 28 | ✅ Passed |

### Пропущенные тесты (5)

- **storage.js** (2): Тесты `QuotaExceededError` - jsdom Storage не позволяет подменять методы
- **utils.js** (3): Тесты `getCanvasScale()` с transform - jsdom не поддерживает `DOMMatrix`

## Структура

```
tests/
├── setup.js                 # Jest setup, глобальные моки
├── mocks/
│   ├── index.js            # Экспорт всех моков
│   ├── localStorage.js     # Mock localStorage
│   ├── dom.js              # Mock DOM элементов workflow
│   └── globals.js          # Mock AppState, STORAGE_KEYS
└── unit/
    ├── smoke.test.js       # Проверка работы Jest и моков
    ├── storage/
    │   └── storage.test.js # Тесты storage.js
    ├── tabs/
    │   └── tabs.test.js    # Тесты tabs.js
    ├── undo/
    │   └── undo.test.js    # Тесты undo.js
    ├── workflow/
    │   └── connections.test.js # Тесты connections.js
    ├── utils/
    │   └── utils.test.js   # Тесты utils.js
    └── export-import/
        └── export-import.test.js # Тесты export-import.js
```

## Команды

```bash
# Запуск всех тестов
npm test

# Запуск с watch mode (перезапуск при изменениях)
npm run test:watch

# Запуск с отчётом покрытия
npm run test:coverage

# Запуск конкретного модуля
npm run test:storage
npm run test:tabs
npm run test:undo
npm run test:workflow
npm run test:utils
npm run test:export-import
```

## Покрытые функции

### Priority 1 (Critical)

#### storage.js (52 теста)
- `getSettings()` - получение настроек с defaults
- `saveSettings()` - сохранение настроек
- `loadFromStorage()` - загрузка JSON из localStorage
- `safeSetItem()` - безопасная запись (QuotaExceededError)
- `saveToStorage()` - сериализация и сохранение
- `setTabsCache()` - установка кэша вкладок
- `isValidTab()` - валидация структуры вкладки (16 тестов)
- `isValidTabsStructure()` - валидация всех вкладок
- `repairTab()` - восстановление повреждённой вкладки (12 тестов)

#### tabs.js (51 тест)
- `getTabItems()` - получение items вкладки
- `getTabBlocks()` - получение только блоков с нумерацией
- `createNewTab()` - создание новой вкладки
- `updateTab()` - обновление данных вкладки
- `renameTab()` - переименование с изменением ID (8 тестов)
- `deleteTab()` - удаление вкладки с cleanup
- `addBlockToTab()` - добавление блока
- `removeItemFromTab()` - удаление с cleanup field-values
- `removeBlockFromTab()` - удаление блока по номеру
- `updateBlockTitle()` - обновление заголовка
- `updateBlockInstruction()` - обновление инструкции
- `markTabAsModified()` - пометка remote вкладки как изменённой

#### undo.js (44 теста)
- `captureCurrentTabState()` - захват состояния (9 тестов)
- `applyCurrentTabState()` - применение состояния (8 тестов)
- `autoSaveToUndo()` - автосохранение с debounce (9 тестов)
- `undo()` - отмена действия
- `redo()` - повтор действия
- `updateUndoRedoButtons()` - обновление UI кнопок

#### connections.js (35 тестов)
- `getPortPosition()` - позиция порта по стороне (6 тестов)
- `buildBezierPath()` - построение SVG path (6 тестов)
- `findNearestPort()` - поиск ближайшего порта (5 тестов)
- `wouldCreateCycle()` - проверка на цикл (7 тестов)
- `addConnection()` - добавление связи (5 тестов)
- `removeConnection()` - удаление связи (4 теста)

### Priority 2 (Important)

#### utils.js (39 тестов)
- `escapeHtml()` - экранирование HTML/XSS (9 тестов)
- `debounce()` - устранение дребезга (7 тестов)
- `generateTabId()` - генерация уникального ID вкладки (5 тестов)
- `generateItemId()` - генерация уникального ID элемента
- `delay()` - Promise-based задержка
- `getCanvasScale()` - получение scale из CSS transform
- `getGeneratingAnimationDelay()` - синхронизация анимаций
- DOM getters (`getWorkflowContainer`, etc.) - кэширование элементов

#### export-import.js (28 тестов)
- `prepareExportData()` - подготовка данных для экспорта (8 тестов)
- `processImportData()` - парсинг импортируемых данных (6 тестов)
- `applyImportedData()` - применение импорта (7 тестов)
- `generateSafeFileName()` - безопасное имя файла (5 тестов)
- Интеграционные тесты export→import (2 теста)

## Архитектура тестов

### Подход к тестированию

Проект использует browser-style модули (глобальные функции через `window.`), а не ES6 modules. Поэтому:

1. **Функции копируются** внутрь тестовых файлов для изолированного тестирования
2. **Моки** предоставляют глобальное окружение (localStorage, STORAGE_KEYS, AppState)
3. **Coverage** отражает 0% так как не импортируются реальные файлы

### Моки

```javascript
// localStorage с поддержкой clear() между тестами
const { LocalStorageMock } = require('./mocks/localStorage');

// DOM элементы для workflow
const { createMockNode, createMockPort } = require('./mocks/dom');

// Глобальное состояние
const { createMockAppState, MOCK_STORAGE_KEYS } = require('./mocks/globals');
```

## Добавление новых тестов

1. Создайте файл в соответствующей папке `tests/unit/<module>/`
2. Скопируйте тестируемые функции в начало файла
3. Используйте моки из `tests/mocks/`
4. Следуйте паттерну:

```javascript
describe('moduleName.js', () => {
    beforeEach(() => {
        // Reset state
    });

    describe('functionName()', () => {
        it('должен ...', () => {
            // Arrange
            // Act
            // Assert
        });
    });
});
```

## CI/CD

Для интеграции с GitHub Actions создайте `.github/workflows/test.yml`:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: npm test
```

## Известные ограничения

1. **jsdom не поддерживает DOMMatrix** - тесты `getCanvasScale()` с transform пропущены
2. **jsdom Storage нельзя мокать** - тесты `QuotaExceededError` пропущены
3. **Нет интеграционных тестов** с реальным DOM - требуется Playwright/Cypress
4. **Tauri API не тестируется** - требуется e2e тестирование

## Следующие шаги

- [ ] Добавить тесты для `blocks.js`
- [ ] Добавить тесты для `remote-prompts.js`
- [ ] Добавить тесты для `persistence.js`
- [ ] Настроить GitHub Actions CI
- [ ] Добавить E2E тесты с Playwright
