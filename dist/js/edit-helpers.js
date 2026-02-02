/**
 * AI Prompts Manager - Edit Helpers
 * Вспомогательные функции для режима редактирования
 * 
 * @requires app-state.js (isAdminMode, activeTextarea, currentTab)
 * @requires storage.js (getAllTabs, saveAllTabs, getTabItems)
 * @requires workflow-render.js (renderWorkflow)
 */

// ═══════════════════════════════════════════════════════════════════════════
// SVG ИКОНКИ ДЛЯ ИНСТРУКЦИЙ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Получить SVG иконку для инструкции
 * @param {string} iconType - Тип иконки: info, edit, paperclip, warning, refresh
 * @returns {string} - SVG разметка
 */
function getInstructionIconSvg(iconType) {
    const icons = {
        info: `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
        edit: `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>`,
        paperclip: `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>`,
        warning: `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`,
        refresh: `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>`
    };
    return icons[iconType] || icons.info;
}

// ═══════════════════════════════════════════════════════════════════════════
// УПРАВЛЕНИЕ ТУЛБАРОМ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Показать/скрыть тулбар редактирования
 * @param {boolean} show - Показать или скрыть
 */
function toggleEditToolbar(show) {
    const toolbar = document.getElementById('edit-toolbar');
    if (toolbar) {
        if (show) {
            toolbar.classList.remove('hidden');
        } else {
            toolbar.classList.add('hidden');
        }
    }
}

/**
 * Показать инструменты промпта
 */
function showPromptTools() {
    document.getElementById('prompt-tools')?.classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════════════════════════
// ВСТАВКА ТЕКСТА
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Вставка текста в textarea с поддержкой undo
 * @param {HTMLTextAreaElement} textarea - Целевой textarea
 * @param {string} text - Текст для вставки
 * @param {boolean} triggerBlur - Триггерить blur событие после вставки
 */
function insertTextIntoTextarea(textarea, text, triggerBlur = false) {
    if (!textarea) return;
    
    textarea.focus();
    
    const success = document.execCommand('insertText', false, text);
    
    if (!success) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;
        
        textarea.value = value.substring(0, start) + text + value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
    }
    
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    if (triggerBlur) {
        textarea.dispatchEvent(new Event('blur', { bubbles: true }));
    }
}

/**
 * Вставить текст в активный textarea
 * @param {string} text - Текст для вставки
 */
function insertTextAtCursor(text) {
    if (!activeTextarea) return;
    insertTextIntoTextarea(activeTextarea, text);
}

// ═══════════════════════════════════════════════════════════════════════════
// РЕЖИМ РЕДАКТИРОВАНИЯ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Обновить состояние кнопок режима редактирования
 */
function updateEditModeToggle() {
    const onBtn = document.getElementById('edit-mode-on');
    const offBtn = document.getElementById('edit-mode-off');
    if (isAdminMode) {
        onBtn?.classList.add('active');
        offBtn?.classList.remove('active');
    } else {
        onBtn?.classList.remove('active');
        offBtn?.classList.add('active');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// МОДАЛЬНОЕ ОКНО ПОДТВЕРЖДЕНИЯ ИМПОРТА
// ═══════════════════════════════════════════════════════════════════════════

let importConfirmResolve = null;

/**
 * Показать модальное окно подтверждения импорта
 * @param {string} message - Сообщение для отображения
 * @returns {Promise<boolean>} - Promise с результатом
 */
function showImportConfirm(message) {
    return new Promise((resolve) => {
        importConfirmResolve = resolve;
        const modal = document.getElementById('import-confirm-modal');
        const messageEl = document.getElementById('import-confirm-message');
        if (messageEl) messageEl.textContent = message;
        if (modal) modal.classList.add('open');
    });
}

/**
 * Скрыть модальное окно подтверждения импорта
 * @param {boolean} result - Результат (true = подтверждено)
 */
function hideImportConfirm(result) {
    const modal = document.getElementById('import-confirm-modal');
    if (modal) modal.classList.remove('open');
    if (importConfirmResolve) {
        importConfirmResolve(result);
        importConfirmResolve = null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ПРИВЯЗКА ЧАТА К НОДЕ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Выбор чата для привязки к ноде workflow
 * @param {number} index - Индекс блока
 */
function selectChatForNode(index) {
    const chat = prompt('Привязать к чату (1, 2, 3 или пусто для отвязки):');
    if (chat === null) return;
    
    const items = getTabItems(currentTab);
    const blocks = items.filter(item => item.type === 'block');
    
    if (blocks && blocks[index]) {
        if (chat === '' || chat === '0') {
            delete blocks[index].chatTab;
        } else if (['1', '2', '3'].includes(chat)) {
            blocks[index].chatTab = parseInt(chat);
        }
        
        // Сохраняем
        const allTabs = getAllTabs();
        allTabs[currentTab].items = items;
        saveAllTabs(allTabs);
        
        renderWorkflow();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════
window.getInstructionIconSvg = getInstructionIconSvg;
window.toggleEditToolbar = toggleEditToolbar;
window.showPromptTools = showPromptTools;
window.insertTextIntoTextarea = insertTextIntoTextarea;
window.insertTextAtCursor = insertTextAtCursor;
window.updateEditModeToggle = updateEditModeToggle;
window.showImportConfirm = showImportConfirm;
window.hideImportConfirm = hideImportConfirm;
window.selectChatForNode = selectChatForNode;
