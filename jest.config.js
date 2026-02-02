/**
 * Jest Configuration
 * AI Prompts Manager - Unit Tests
 */

module.exports = {
    // Тестовое окружение с поддержкой DOM
    testEnvironment: 'jsdom',
    
    // Setup файл выполняется перед каждым тестовым файлом
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    
    // Где искать тесты
    testMatch: [
        '<rootDir>/tests/unit/**/*.test.js'
    ],
    
    // Игнорировать при поиске тестов
    testPathIgnorePatterns: [
        '/node_modules/',
        '/src-tauri/'
    ],
    
    // Маппинг путей для удобного импорта
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/dist/js/$1',
        '^@mocks/(.*)$': '<rootDir>/tests/mocks/$1'
    },
    
    // Откуда собирать coverage
    collectCoverageFrom: [
        'dist/js/**/*.js',
        // Исключаем файлы с тяжёлой DOM-зависимостью
        '!dist/js/init.js',
        '!dist/js/workflow-render.js',
        '!dist/js/workflow-interactions.js',
        '!dist/js/workflow-zoom.js',
        '!dist/js/claude-api.js',
        '!dist/js/claude-ui.js',
        '!dist/js/claude-state.js',
        '!dist/js/dynamic-input.js',
        '!dist/js/block-ui.js',
        '!dist/js/context-menu.js',
        '!dist/js/language-ui.js',
        '!dist/js/tab-selector.js',
        '!dist/js/edit-helpers.js',
        '!dist/js/settings.js',
        '!dist/js/updates.js',
        '!dist/js/attachments.js',
        '!dist/js/embedded-scripts.js',
        '!dist/js/embedded-scripts-spellcheck.js'
    ],
    
    // Папка для отчётов о покрытии
    coverageDirectory: '<rootDir>/coverage',
    
    // Форматы отчётов
    coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
    
    // Пороги покрытия отключены - тесты копируют функции локально
    // вместо импорта из исходных файлов (browser-style модули)
    // coverageThreshold: {
    //     global: {
    //         branches: 50,
    //         functions: 50,
    //         lines: 50,
    //         statements: 50
    //     }
    // },
    
    // Verbose вывод
    verbose: true,
    
    // Таймаут для тестов (мс)
    testTimeout: 10000,
    
    // Очищать моки между тестами
    clearMocks: true,
    
    // Восстанавливать моки после каждого теста
    restoreMocks: true,
    
    // Показывать причину пропуска тестов
    // (полезно при отладке)
    // bail: 1,
    
    // Трансформации (не нужны, так как используем CommonJS)
    transform: {},
    
    // Расширения файлов для модулей
    moduleFileExtensions: ['js', 'json'],
    
    // Корневая директория
    rootDir: '.',
    
    // Roots для поиска файлов
    roots: [
        '<rootDir>/tests',
        '<rootDir>/dist/js'
    ]
};
