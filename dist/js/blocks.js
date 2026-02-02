/**
 * AI Prompts Manager - Blocks Data Management
 * Функции управления данными блоков (collapsed, scripts, automation)
 */

// ═══════════════════════════════════════════════════════════════════════════
// СЕКЦИЯ: COLLAPSED BLOCKS
// ═══════════════════════════════════════════════════════════════════════════

/** 
 * Хранение свёрнутых блоков: { blockId: true }
 * @type {Object.<string, boolean>}
 */
let collapsedBlocks = {};

/**
 * Загрузить состояние свёрнутых блоков из storage
 */
function loadCollapsedBlocks() {
    collapsedBlocks = loadFromStorage(STORAGE_KEYS.COLLAPSED_BLOCKS);
}

/**
 * Сохранить состояние свёрнутых блоков в storage
 */
function saveCollapsedBlocks() {
    saveToStorage(STORAGE_KEYS.COLLAPSED_BLOCKS, collapsedBlocks);
}

/**
 * Проверить свёрнут ли блок
 * @param {string} blockId - ID блока
 * @returns {boolean}
 */
function isBlockCollapsed(blockId) {
    return !!collapsedBlocks[blockId];
}

// ═══════════════════════════════════════════════════════════════════════════
// СЕКЦИЯ: BLOCK SCRIPTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Хранение скриптов блоков: { blockId: ['convert', 'count'] }
 * @type {Object.<string, string[]>}
 */
let blockScripts = {};

/**
 * Загрузить скрипты блоков из storage
 */
function loadBlockScripts() {
    blockScripts = loadFromStorage(STORAGE_KEYS.BLOCK_SCRIPTS);
}

/**
 * Сохранить скрипты блоков в storage
 */
function saveBlockScripts() {
    saveToStorage(STORAGE_KEYS.BLOCK_SCRIPTS, blockScripts);
}

/**
 * Проверить есть ли у блока скрипт
 * @param {string} blockId - ID блока
 * @param {string} scriptKey - Ключ скрипта
 * @returns {boolean}
 */
function hasBlockScript(blockId, scriptKey) {
    return blockScripts[blockId]?.includes(scriptKey) || false;
}

/**
 * Получить список скриптов блока
 * @param {string} blockId - ID блока
 * @returns {string[]}
 */
function getBlockScripts(blockId) {
    return blockScripts[blockId] || [];
}

// ═══════════════════════════════════════════════════════════════════════════
// СЕКЦИЯ: BLOCK AUTOMATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Хранение automation флагов: { blockId: { newProject: true, newChat: true } }
 * @type {Object.<string, Object>}
 */
let blockAutomation = {};

/**
 * Загрузить automation флаги из storage
 */
function loadBlockAutomation() {
    blockAutomation = loadFromStorage(STORAGE_KEYS.BLOCK_AUTOMATION);
}

/**
 * Сохранить automation флаги в storage
 */
function saveBlockAutomation() {
    saveToStorage(STORAGE_KEYS.BLOCK_AUTOMATION, blockAutomation);
}

/**
 * Проверить есть ли у блока automation флаг
 * @param {string} blockId - ID блока
 * @param {string} flag - Название флага
 * @returns {boolean}
 */
function hasBlockAutomation(blockId, flag) {
    return blockAutomation[blockId]?.[flag] || false;
}

/**
 * Получить все automation флаги блока
 * @param {string} blockId - ID блока
 * @returns {Object}
 */
function getBlockAutomationFlags(blockId) {
    return blockAutomation[blockId] || {};
}

// ═══════════════════════════════════════════════════════════════════════════
// СЕКЦИЯ: BLOCK ATTACHMENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Хранение прикреплённых файлов: { blockId: [{name, type, data}] }
 * @type {Object.<string, Array>}
 */
let blockAttachments = {};

// ═══════════════════════════════════════════════════════════════════════════
// СЕКЦИЯ: BLOCK INSTRUCTIONS (wrappers)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Удалить инструкцию блока
 * @param {string} blockNumber - Номер блока
 */
function removeBlockInstruction(blockNumber) {
    updateBlockInstruction(currentTab, blockNumber, null);
    loadPrompts();
}

/**
 * Добавить инструкцию блока
 * @param {string} blockNumber - Номер блока
 * @param {string} type - Тип инструкции ('info' или 'keyword-replace')
 */
function addBlockInstruction(blockNumber, type = 'info') {
    const instruction = {
        type: type,
        text: type === 'keyword-replace' ? 'Заменить ключевое слово' : 'Инструкция'
    };
    updateBlockInstruction(currentTab, blockNumber, instruction);
    loadPrompts();
}
