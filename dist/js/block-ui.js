/**
 * AI Prompts Manager - Block UI
 * Функции для управления UI блоков (сворачивание, скрипты, автоматизация)
 * 
 * @requires blocks.js (collapsedBlocks, saveCollapsedBlocks, isBlockCollapsed, 
 *                      blockScripts, saveBlockScripts, getBlockScripts,
 *                      blockAutomation, saveBlockAutomation, getBlockAutomationFlags,
 *                      blockAttachments)
 * @requires storage.js (getAllTabs)
 * @requires attachments.js (clearBlockAttachments, attachFilesToBlock)
 * @requires workflow-state.js (workflowPositions, workflowSizes, saveWorkflowState)
 * @requires connections.js (renderConnections)
 * @requires config.js (NODE_DEFAULT_WIDTH, SVG_ICONS)
 * @requires embedded-scripts.js (EMBEDDED_SCRIPTS)
 */

// ═══════════════════════════════════════════════════════════════════════════
// СВОРАЧИВАНИЕ БЛОКОВ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Переключить состояние свёрнутости блока
 * @param {string} blockId - ID блока
 */
function toggleBlockCollapsed(blockId) {
    if (collapsedBlocks[blockId]) {
        delete collapsedBlocks[blockId];
    } else {
        collapsedBlocks[blockId] = true;
    }
    saveCollapsedBlocks();
    
    // Обновляем только эту ноду без полного перерендера
    const node = document.querySelector(`.workflow-node[data-block-id="${blockId}"]`);
    if (node) {
        const isNowCollapsed = !!collapsedBlocks[blockId];
        node.classList.toggle('collapsed', isNowCollapsed);
        
        // Обновляем иконку кнопки
        const btn = node.querySelector('.workflow-collapse-btn');
        if (btn) {
            btn.innerHTML = isNowCollapsed ? SVG_ICONS.chevronDown : SVG_ICONS.chevronUp;
        }
        
        // Управляем кнопкой файлов в хедере
        const header = node.querySelector('.workflow-node-header');
        const existingFilesBtn = header?.querySelector('.collapsed-files-btn');
        
        // Проверяем hasAttachments у блока
        const allTabs = getAllTabs();
        const items = allTabs[currentTab]?.items || [];
        const block = items.find(item => item.type === 'block' && item.id === blockId);
        const hasAttachments = block?.hasAttachments;
        
        if (isNowCollapsed && hasAttachments && !existingFilesBtn) {
            // Сворачиваем и есть hasAttachments — добавляем кнопку
            const filesCount = blockAttachments[blockId]?.length || 0;
            const filesBtn = document.createElement('button');
            filesBtn.className = 'collapsed-files-btn';
            filesBtn.dataset.blockId = blockId;
            filesBtn.title = filesCount > 0 ? 'Очистить файлы' : 'Прикрепить файлы';
            filesBtn.innerHTML = filesCount > 0 
                ? `<span class="files-count">${filesCount}</span>` 
                : SVG_ICONS.plus18;
            
            filesBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (blockAttachments[blockId] && blockAttachments[blockId].length > 0) {
                    clearBlockAttachments(blockId);
                } else {
                    attachFilesToBlock(blockId);
                }
            });
            filesBtn.addEventListener('mousedown', (e) => e.stopPropagation());
            
            // Вставляем после кнопки collapse (или в начало если её нет)
            const collapseBtn = header.querySelector('.workflow-collapse-btn');
            if (collapseBtn) {
                collapseBtn.after(filesBtn);
            } else {
                header.prepend(filesBtn);
            }
        } else if (!isNowCollapsed && existingFilesBtn) {
            // Разворачиваем — удаляем кнопку
            existingFilesBtn.remove();
        }
        
        // Выравнивание collapsed блока по нечётной сетке
        if (isNowCollapsed) {
            // Убираем inline height чтобы CSS мог работать
            node.style.height = '';
            // Даём DOM обновиться
            requestAnimationFrame(() => {
                alignCollapsedToOddGrid(node, blockId);
                renderConnections();
            });
        } else {
            // При разворачивании возвращаем сохранённую ширину или дефолтную
            const size = workflowSizes[blockId];
            node.style.width = (size && size.width) ? size.width + 'px' : NODE_DEFAULT_WIDTH + 'px';
            if (size && size.height) {
                node.style.height = size.height + 'px';
            }
            renderConnections();
        }
    }
}

/**
 * Выравнивание collapsed блока по чётной сетке (для центрирования)
 * @param {HTMLElement} node - DOM элемент ноды
 * @param {string} blockId - ID блока
 */
function alignCollapsedToOddGrid(node, blockId) {
    const gridSize = 40;
    const title = node.querySelector('.workflow-node-title');
    if (!title) return;
    
    // Убираем inline height и width для измерения
    node.style.height = '';
    node.style.width = '';
    
    // Создаём временный элемент для точного измерения ширины текста
    const measure = document.createElement('span');
    measure.style.cssText = 'position: absolute; visibility: hidden; white-space: nowrap; font-weight: 600; font-size: 26px;';
    measure.textContent = title.textContent;
    document.body.appendChild(measure);
    const titleWidth = measure.offsetWidth;
    document.body.removeChild(measure);
    
    // Измеряем ширину badges
    const badgesContainer = node.querySelector('.script-badges');
    let badgesWidth = 0;
    if (badgesContainer && badgesContainer.children.length > 0) {
        badgesWidth = badgesContainer.offsetWidth + 14; // + gap между title и badges
    }
    
    // Измеряем ширину кнопки файлов
    const filesBtn = node.querySelector('.collapsed-files-btn');
    let filesBtnWidth = 0;
    if (filesBtn) {
        filesBtnWidth = 40 + 14; // 40px кнопка + 14px gap
    }
    
    // padding хедера 22px * 2 = 44px
    const headerPadding = 44;
    const contentWidth = titleWidth + badgesWidth + filesBtnWidth + headerPadding;
    
    // Находим минимальное ЧЁТНОЕ количество шагов
    let steps = Math.ceil(contentWidth / gridSize);
    if (steps < 2) steps = 2;
    // Делаем чётным - если нечётное, добавляем 1
    if (steps % 2 !== 0) steps += 1;
    const alignedWidth = steps * gridSize;
    
    // Устанавливаем выровненную ширину
    node.style.width = alignedWidth + 'px';
    
    // Также выравниваем позицию по сетке
    const currentX = parseFloat(node.style.left) || 0;
    const alignedX = Math.round(currentX / gridSize) * gridSize;
    node.style.left = alignedX + 'px';
    workflowPositions[blockId] = { 
        x: alignedX, 
        y: parseFloat(node.style.top) || 0 
    };
    
    saveWorkflowState(true);
}

// ═══════════════════════════════════════════════════════════════════════════
// СКРИПТЫ БЛОКОВ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Переключить скрипт для блока
 * @param {string} blockId - ID блока
 * @param {string} scriptKey - ключ скрипта (например 'convert', 'count')
 */
function toggleBlockScript(blockId, scriptKey) {
    if (!blockScripts[blockId]) blockScripts[blockId] = [];
    const idx = blockScripts[blockId].indexOf(scriptKey);
    if (idx >= 0) {
        blockScripts[blockId].splice(idx, 1);
    } else {
        blockScripts[blockId].push(scriptKey);
        // Сортируем чтобы C был перед W (convert перед count)
        blockScripts[blockId].sort((a, b) => a === 'convert' ? -1 : 1);
    }
    if (blockScripts[blockId].length === 0) delete blockScripts[blockId];
    saveBlockScripts();
    updateBlockScriptBadges(blockId);
}

/**
 * Обновить badges скриптов для блока
 * @param {string} blockId - ID блока
 */
function updateBlockScriptBadges(blockId) {
    const node = document.querySelector(`.workflow-node[data-block-id="${blockId}"]`);
    if (!node) return;
    
    const badgesContainer = node.querySelector('.script-badges');
    if (!badgesContainer) return;
    
    const scripts = getBlockScripts(blockId);
    const automation = getBlockAutomationFlags(blockId);
    
    // Собираем HTML для скриптов
    let badgesHtml = scripts.map(s => 
        `<span class="script-badge" data-script="${s}" title="${EMBEDDED_SCRIPTS[s]?.label || s}">${EMBEDDED_SCRIPTS[s]?.badge || s[0].toUpperCase()}</span>`
    ).join('');
    
    // Добавляем automation badges
    if (automation.newProject) {
        badgesHtml += `<span class="automation-badge" data-automation="newProject" title="Новый проект">P</span>`;
    }
    if (automation.newChat) {
        badgesHtml += `<span class="automation-badge" data-automation="newChat" title="Новый чат">N</span>`;
    }
    
    badgesContainer.innerHTML = badgesHtml;
    
    // Перепривязываем обработчики для скриптов
    badgesContainer.querySelectorAll('.script-badge').forEach(badge => {
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleBlockScript(blockId, badge.dataset.script);
        });
    });
    
    // Обработчики для automation
    badgesContainer.querySelectorAll('.automation-badge').forEach(badge => {
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleBlockAutomation(blockId, badge.dataset.automation);
        });
    });
    
    // Пересчитываем ширину если блок свёрнут
    if (isBlockCollapsed(blockId)) {
        alignCollapsedToOddGrid(node, blockId);
        renderConnections();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// АВТОМАТИЗАЦИЯ БЛОКОВ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Переключить флаг автоматизации для блока
 * @param {string} blockId - ID блока
 * @param {string} flag - флаг автоматизации ('newProject', 'newChat')
 */
function toggleBlockAutomation(blockId, flag) {
    if (!blockAutomation[blockId]) blockAutomation[blockId] = {};
    
    if (blockAutomation[blockId][flag]) {
        delete blockAutomation[blockId][flag];
    } else {
        blockAutomation[blockId][flag] = true;
    }
    
    // Очищаем если все флаги сняты
    if (Object.keys(blockAutomation[blockId]).length === 0) {
        delete blockAutomation[blockId];
    }
    
    saveBlockAutomation();
    updateBlockAutomationBadges(blockId);
}

/**
 * Обновить badges автоматизации для блока
 * @param {string} blockId - ID блока
 */
function updateBlockAutomationBadges(blockId) {
    const node = document.querySelector(`.workflow-node[data-block-id="${blockId}"]`);
    if (!node) return;
    
    const badgesContainer = node.querySelector('.script-badges');
    if (!badgesContainer) return;
    
    // Получаем текущие скрипты
    const scripts = getBlockScripts(blockId);
    const automation = getBlockAutomationFlags(blockId);
    
    // Собираем HTML для скриптов
    let badgesHtml = scripts.map(s => 
        `<span class="script-badge" data-script="${s}" title="${EMBEDDED_SCRIPTS[s]?.label || s}">${EMBEDDED_SCRIPTS[s]?.badge || s[0].toUpperCase()}</span>`
    ).join('');
    
    // Добавляем automation badges
    if (automation.newProject) {
        badgesHtml += `<span class="automation-badge" data-automation="newProject" title="Новый проект">P</span>`;
    }
    if (automation.newChat) {
        badgesHtml += `<span class="automation-badge" data-automation="newChat" title="Новый чат">N</span>`;
    }
    
    badgesContainer.innerHTML = badgesHtml;
    
    // Перепривязываем обработчики для скриптов
    badgesContainer.querySelectorAll('.script-badge').forEach(badge => {
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleBlockScript(blockId, badge.dataset.script);
        });
    });
    
    // Обработчики для automation
    badgesContainer.querySelectorAll('.automation-badge').forEach(badge => {
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleBlockAutomation(blockId, badge.dataset.automation);
        });
    });
    
    // Пересчитываем ширину если блок свёрнут
    if (isBlockCollapsed(blockId)) {
        alignCollapsedToOddGrid(node, blockId);
        renderConnections();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════════════════

window.toggleBlockCollapsed = toggleBlockCollapsed;
window.alignCollapsedToOddGrid = alignCollapsedToOddGrid;
window.toggleBlockScript = toggleBlockScript;
window.updateBlockScriptBadges = updateBlockScriptBadges;
window.toggleBlockAutomation = toggleBlockAutomation;
window.updateBlockAutomationBadges = updateBlockAutomationBadges;
