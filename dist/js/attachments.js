/**
 * AI Prompts Manager - Attachments
 * Функции для работы с прикреплёнными файлами к блокам
 * 
 * @requires blocks.js (blockAttachments)
 * @requires storage.js (getAllTabs, saveAllTabs)
 * @requires tabs.js (currentTab)
 * @requires undo.js (autoSaveToUndo)
 * @requires workflow-render.js (renderWorkflow)
 * @requires utils.js (escapeHtml)
 * @requires toast.js (showToast)
 */

// ═══════════════════════════════════════════════════════════════════════════
// ПАНЕЛЬ ВЛОЖЕНИЙ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Добавить/убрать панель файлов для блока
 * @param {string} blockId - ID блока
 * @param {boolean} show - показать или скрыть панель
 */
function toggleAttachmentsPanel(blockId, show) {
    const allTabs = getAllTabs();
    const items = allTabs[currentTab]?.items || [];
    
    // Ищем блок по id
    const block = items.find(item => item.type === 'block' && item.id === blockId);
    if (!block) return;
    
    autoSaveToUndo();
    
    if (show) {
        block.hasAttachments = true;
    } else {
        delete block.hasAttachments;
        // Также очищаем прикреплённые файлы
        delete blockAttachments[blockId];
    }
    
    saveAllTabs(allTabs);
    renderWorkflow(true);
}

/**
 * Проверить есть ли у блока панель файлов
 * @param {string} blockId - ID блока
 * @returns {boolean}
 */
function hasBlockAttachmentsPanel(blockId) {
    const allTabs = getAllTabs();
    const items = allTabs[currentTab]?.items || [];
    const block = items.find(item => item.type === 'block' && item.id === blockId);
    return block?.hasAttachments || false;
}

// ═══════════════════════════════════════════════════════════════════════════
// ПРИКРЕПЛЕНИЕ ФАЙЛОВ К БЛОКАМ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Открыть диалог выбора файлов для блока
 * @param {string} blockId - ID блока
 */
async function attachFilesToBlock(blockId) {
    try {
        const result = await window.__TAURI__.dialog.open({
            multiple: true,
            title: 'Выберите файлы для прикрепления'
        });
        
        if (!result) return;
        
        // result может быть строкой или массивом
        const paths = Array.isArray(result) ? result : [result];
        
        if (!blockAttachments[blockId]) {
            blockAttachments[blockId] = [];
        }
        
        paths.forEach(path => {
            // Извлекаем имя файла из пути
            const name = path.split(/[/\\]/).pop();
            blockAttachments[blockId].push({ path, name });
        });
        
        // Обновляем отображение
        updateBlockAttachmentsUI(blockId);
        
        showToast(`Прикреплено файлов: ${paths.length}`);
    } catch (e) {
        showToast('Ошибка при выборе файлов');
    }
}

/**
 * Удалить файл из блока
 * @param {string} blockId - ID блока
 * @param {number} fileIndex - индекс файла в массиве
 */
function removeAttachmentFromBlock(blockId, fileIndex) {
    if (blockAttachments[blockId]) {
        blockAttachments[blockId].splice(fileIndex, 1);
        if (blockAttachments[blockId].length === 0) {
            delete blockAttachments[blockId];
        }
        updateBlockAttachmentsUI(blockId);
    }
}

/**
 * Очистить все файлы блока
 * @param {string} blockId - ID блока
 */
function clearBlockAttachments(blockId) {
    delete blockAttachments[blockId];
    updateBlockAttachmentsUI(blockId);
}

/**
 * Обновить UI списка файлов
 * @param {string} blockId - ID блока
 */
function updateBlockAttachmentsUI(blockId) {
    // Обновляем список файлов в обычном блоке
    const filesList = document.querySelector(`.workflow-attached-files[data-block-id="${blockId}"]`);
    if (filesList) {
        filesList.innerHTML = '';
        
        if (blockAttachments[blockId] && blockAttachments[blockId].length > 0) {
            blockAttachments[blockId].forEach((file, fileIndex) => {
                const fileChip = document.createElement('div');
                fileChip.className = 'workflow-file-chip';
                fileChip.innerHTML = `
                    <span class="file-name">${escapeHtml(file.name)}</span>
                    <button class="file-remove" data-block-id="${blockId}" data-file-index="${fileIndex}" title="Удалить">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                `;
                filesList.appendChild(fileChip);
            });
        }
    }
    
    // Обновляем кнопку файлов в collapsed блоке
    const collapsedFilesBtn = document.querySelector(`.collapsed-files-btn[data-block-id="${blockId}"]`);
    if (collapsedFilesBtn) {
        const filesCount = blockAttachments[blockId]?.length || 0;
        collapsedFilesBtn.innerHTML = filesCount > 0 
            ? `<span class="files-count">${filesCount}</span>` 
            : SVG_ICONS.plus18;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════════════════

window.toggleAttachmentsPanel = toggleAttachmentsPanel;
window.hasBlockAttachmentsPanel = hasBlockAttachmentsPanel;
window.attachFilesToBlock = attachFilesToBlock;
window.removeAttachmentFromBlock = removeAttachmentFromBlock;
window.clearBlockAttachments = clearBlockAttachments;
window.updateBlockAttachmentsUI = updateBlockAttachmentsUI;
