/**
 * AI Prompts Manager - Context Menu
 * Функции для работы с контекстными меню
 * 
 * @requires config.js (SVG_ICONS)
 * @requires storage.js (getAllTabs, saveAllTabs)
 * @requires tabs.js (getTabBlocks)
 * @requires blocks.js (isBlockCollapsed, getBlockScripts, getBlockAutomationFlags)
 * @requires workflow-state.js (workflowPositions, workflowSizes, workflowConnections)
 */

// ═══════════════════════════════════════════════════════════════════════════
// БАЗОВЫЕ ФУНКЦИИ КОНТЕКСТНОГО МЕНЮ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Скрыть контекстное меню
 */
function hideContextMenu() {
    const menu = document.querySelector('.custom-context-menu');
    if (menu) menu.remove();
}

/**
 * Показать контекстное меню
 * @param {number} x - координата X
 * @param {number} y - координата Y
 * @param {Array<{label?: string, icon?: string, action?: Function, separator?: boolean, disabled?: boolean, submenu?: Array}>} items - пункты меню
 */
function showContextMenu(x, y, items) {
    hideContextMenu();
    
    const menu = document.createElement('div');
    menu.className = 'custom-context-menu';
    
    items.forEach(item => {
        if (item.separator) {
            const sep = document.createElement('div');
            sep.className = 'context-menu-separator';
            menu.appendChild(sep);
            return;
        }
        
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item' + (item.disabled ? ' disabled' : '') + (item.submenu ? ' has-submenu' : '');
        
        if (item.icon) {
            menuItem.innerHTML = item.icon;
        }
        
        const text = document.createElement('span');
        text.textContent = item.label;
        menuItem.appendChild(text);
        
        // Галочка для checked пунктов (справа, не submenu)
        if (item.checked && !item.submenu) {
            const check = document.createElement('span');
            check.className = 'check-icon';
            check.textContent = '✓';
            menuItem.appendChild(check);
        }
        
        // Подменю
        if (item.submenu) {
            const arrow = document.createElement('span');
            arrow.className = 'submenu-arrow';
            arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>';
            menuItem.appendChild(arrow);
            
            const submenu = document.createElement('div');
            submenu.className = 'context-submenu';
            
            item.submenu.forEach(subItem => {
                const subMenuItem = document.createElement('div');
                subMenuItem.className = 'context-menu-item';
                
                const subText = document.createElement('span');
                subText.textContent = subItem.label;
                subMenuItem.appendChild(subText);
                
                // Галочка для checked пунктов submenu (справа)
                if (subItem.checked) {
                    const check = document.createElement('span');
                    check.className = 'check-icon';
                    check.textContent = '✓';
                    subMenuItem.appendChild(check);
                }
                
                if (subItem.action) {
                    subMenuItem.addEventListener('click', (e) => {
                        e.stopPropagation();
                        hideContextMenu();
                        subItem.action();
                    });
                }
                
                submenu.appendChild(subMenuItem);
            });
            
            menuItem.appendChild(submenu);
        } else if (!item.disabled && item.action) {
            menuItem.addEventListener('click', () => {
                hideContextMenu();
                item.action();
            });
        }
        
        menu.appendChild(menuItem);
    });
    
    document.body.appendChild(menu);
    
    // Корректируем позицию чтобы не выходить за границы экрана
    const rect = menu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) {
        x = window.innerWidth - rect.width - 10;
    }
    if (y + rect.height > window.innerHeight) {
        y = window.innerHeight - rect.height - 10;
    }
    
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

// ═══════════════════════════════════════════════════════════════════════════
// ИКОНКИ ДЛЯ МЕНЮ
// ═══════════════════════════════════════════════════════════════════════════

/** @type {Object} Иконки для контекстного меню */
const CONTEXT_ICONS = {
    create: SVG_ICONS.plus,
    paste: SVG_ICONS.paste,
    copy: SVG_ICONS.copy,
    rename: SVG_ICONS.rename,
    edit: SVG_ICONS.edit,
    script: SVG_ICONS.script,
    automation: SVG_ICONS.automation,
    attachment: SVG_ICONS.plus, // Используем плюс для файлов
    delete: SVG_ICONS.trash
};

// ═══════════════════════════════════════════════════════════════════════════
// ПЕРЕИМЕНОВАНИЕ БЛОКА
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Переименование блока inline
 * @param {string} blockId - ID блока
 */
function renameBlockInline(blockId) {
    const node = document.querySelector(`.workflow-node[data-block-id="${blockId}"]`);
    if (!node) return;
    
    const titleElement = node.querySelector('.workflow-node-title');
    if (!titleElement) return;
    
    const currentTitle = titleElement.textContent;
    const maxLength = 30;
    
    // Создаём input для редактирования
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentTitle;
    input.maxLength = maxLength;
    input.className = 'workflow-title-edit-input';
    input.draggable = false;
    input.style.cssText = `
        width: 100%;
        background: transparent;
        border: none;
        border-bottom: 2px solid rgba(255,255,255,0.8);
        outline: none;
        font-size: 26px;
        font-weight: 600;
        color: white;
        padding: 0;
        cursor: text !important;
        caret-color: white;
        user-select: text;
        -webkit-user-select: text;
    `;
    
    // Останавливаем drag при взаимодействии с input
    ['mousedown', 'mousemove', 'mouseup'].forEach(evt => {
        input.addEventListener(evt, e => e.stopPropagation());
    });
    ['dragstart', 'drag', 'dragover', 'drop'].forEach(evt => {
        input.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); });
    });
    // Блокируем selectstart на родителе
    const header = node.querySelector('.workflow-node-header');
    if (header) {
        header.onselectstart = null;
    }
    
    // Заменяем title на input
    titleElement.style.display = 'none';
    titleElement.parentNode.insertBefore(input, titleElement.nextSibling);
    input.focus();
    input.select();
    
    let saved = false;
    const saveTitle = () => {
        if (saved || !input.parentNode) return; // Уже сохранено или удалено
        saved = true;
        const newTitle = input.value.trim() || currentTitle;
        titleElement.textContent = newTitle;
        titleElement.style.display = '';
        input.remove();
        
        // Удаляем глобальный обработчик
        document.removeEventListener('mousedown', handleGlobalClick, true);
        
        // Сохраняем в данные
        const tabs = getAllTabs();
        if (tabs[currentTab]) {
            const item = tabs[currentTab].items.find(i => i.id === blockId);
            if (item) {
                item.title = newTitle;
                saveAllTabs(tabs);
            }
        }
    };
    
    // Глобальный обработчик для клика вне input
    const handleGlobalClick = (e) => {
        if (e.target !== input) {
            saveTitle();
        }
    };
    
    // Добавляем с небольшой задержкой чтобы не сработал на текущий клик
    setTimeout(() => {
        document.addEventListener('mousedown', handleGlobalClick, true);
    }, 10);
    
    input.addEventListener('blur', saveTitle);
    input.addEventListener('keydown', (e) => {
        e.stopPropagation(); // Предотвращаем глобальные хоткеи
        if (e.key === 'Enter') {
            e.preventDefault();
            saveTitle();
        }
        if (e.key === 'Escape') {
            input.value = currentTitle;
            saveTitle();
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// КОПИРОВАНИЕ БЛОКОВ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Копировать блоки в буфер (для ПКМ и Ctrl+C)
 * @param {string[]} blockIds - массив ID блоков
 */
function copyBlocksToClipboard(blockIds) {
    const blocks = getTabBlocks(currentTab);
    
    let minX = Infinity, minY = Infinity;
    blockIds.forEach(id => {
        const pos = workflowPositions[id];
        if (pos) {
            minX = Math.min(minX, pos.x);
            minY = Math.min(minY, pos.y);
        }
    });
    
    // Создаём Set для быстрой проверки
    const blockIdSet = new Set(blockIds);
    
    // Копируем блоки
    clipboard = [];
    blockIds.forEach(id => {
        const block = blocks.find(b => b.id === id);
        const pos = workflowPositions[id] || {x: 0, y: 0};
        const size = workflowSizes[id];
        if (block) {
            // Читаем состояния из отдельных хранилищ
            const collapsed = isBlockCollapsed(id);
            const scripts = getBlockScripts(id);
            const automation = getBlockAutomationFlags(id);
            
            clipboard.push({
                origId: id,  // Сохраняем оригинальный ID для маппинга соединений
                title: block.title,
                content: block.content,
                instruction: block.instruction,
                collapsed: collapsed || undefined,
                scripts: scripts && scripts.length > 0 ? [...scripts] : undefined,
                automation: automation && Object.keys(automation).length > 0 ? {...automation} : undefined,
                hasAttachments: block.hasAttachments,
                relX: pos.x - minX,
                relY: pos.y - minY,
                origX: pos.x,
                origY: pos.y,
                width: size?.width,
                height: size?.height
            });
        }
    });
    
    // Копируем соединения между выделенными блоками
    window.clipboardConnections = workflowConnections.filter(conn => 
        blockIdSet.has(conn.from) && blockIdSet.has(conn.to)
    ).map(conn => ({
        from: conn.from,
        to: conn.to,
        fromSide: conn.fromSide,
        toSide: conn.toSide
    }));
}

// ═══════════════════════════════════════════════════════════════════════════
// РАБОТА С БУФЕРОМ ОБМЕНА
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Копировать текст в буфер обмена
 * @param {string} text - текст для копирования
 */
async function copyTextToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        // Ошибка копирования
    }
}

/**
 * Вставить текст из буфера в textarea
 * @param {HTMLTextAreaElement} textarea - элемент textarea
 */
async function pasteTextFromClipboard(textarea) {
    try {
        const text = await navigator.clipboard.readText();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = textarea.value.substring(0, start);
        const after = textarea.value.substring(end);
        textarea.value = before + text + after;
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        textarea.focus();
        
        // Триггерим событие для сохранения
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (err) {
        // Ошибка вставки
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════════════════

window.hideContextMenu = hideContextMenu;
window.showContextMenu = showContextMenu;
window.CONTEXT_ICONS = CONTEXT_ICONS;
window.renameBlockInline = renameBlockInline;
window.copyBlocksToClipboard = copyBlocksToClipboard;
window.copyTextToClipboard = copyTextToClipboard;
window.pasteTextFromClipboard = pasteTextFromClipboard;
