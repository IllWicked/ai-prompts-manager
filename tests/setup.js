/**
 * Jest Setup File
 * Инициализирует глобальное окружение перед каждым тестом
 */

const { LocalStorageMock } = require('./mocks/localStorage');
const { setupGlobalMocks } = require('./mocks/globals');

// Создаём глобальный localStorage mock
const localStorageMock = new LocalStorageMock();

// Настраиваем глобальные моки
const { resetAppState } = setupGlobalMocks(localStorageMock);

// Сохраняем для использования в тестах
global.resetAppState = resetAppState;
global.localStorageMock = localStorageMock;

// Очищаем localStorage перед каждым тестом
beforeEach(() => {
    global.localStorage.clear();
    resetAppState();
    jest.clearAllMocks();
});

// Подавляем console.error в тестах (опционально)
// Раскомментировать если нужно чистый вывод
// global.console.error = jest.fn();
// global.console.warn = jest.fn();
