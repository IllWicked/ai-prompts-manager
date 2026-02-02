/**
 * AI Prompts Manager - Tab Selector
 * Функции для селектора вкладок с раздвижными группами (accordion)
 * 
 * Вкладки группируются по префиксам через дефис:
 * BETTING-PILLAR, BETTING-CLUSTERS → группа BETTING
 * 
 * @requires storage.js (getAllTabs)
 * @requires tabs.js (currentTab, renameTab, deleteTab, DEFAULT_TAB, showAddTabModal)
 * @requires utils.js (escapeHtml)
 * @requires config.js (STORAGE_KEYS, SVG_ICONS)
 * @requires undo.js (undoStack, redoStack, tabHistories, captureCurrentTabState, updateUndoRedoButtons)
 * @requires workflow-state.js (loadWorkflowState)
 * @requires workflow-render.js (renderWorkflow)
 * @requires workflow-zoom.js (scrollToBlocks)
 * @requires export-import.js (exportConfig, importConfig)
 */

// ═══════════════════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Получить синхронизированную задержку анимации для индикатора проекта
 * Период пульсации 2 секунды
 * @returns {string} - задержка в формате CSS
 */
function getProjectAnimationDelay() {
    const now = Date.now();
    const cycleMs = 2000;
    const offset = now % cycleMs;
    return `-${offset}ms`;
}

/**
 * Построить дерево вкладок из плоского списка
 * @param {Array} tabs - массив вкладок [{id, name, order}, ...]
 * @returns {Object} - дерево {children: {...}, tabs: [...]}
 */
function buildTabTree(tabs) {
    const root = { children: {}, tabs: [] };
    
    tabs.forEach(tab => {
        const parts = tab.name.split('-');
        let current = root;
        
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isLast = i === parts.length - 1;
            
            if (!current.children[part]) {
                current.children[part] = { children: {}, tabs: [] };
            }
            
            if (isLast) {
                current.children[part].tabs.push(tab);
            }
            
            current = current.children[part];
        }
    });
    
    return root;
}

/**
 * Получить последнюю часть имени вкладки (для отображения на кнопке)
 * @param {string} name - полное имя вкладки
 * @returns {string} - последняя часть после дефиса
 */
function getLastPart(name) {
    const parts = name.split('-');
    return parts[parts.length - 1];
}

/**
 * Рекурсивно найти первую конечную вкладку в узле дерева
 * @param {Object} node - узел дерева {children: {}, tabs: []}
 * @returns {Object|null} - первая конечная вкладка или null
 */
function getFirstFinalTab(node) {
    if (!node) return null;
    
    if (node.tabs && node.tabs.length > 0) {
        return node.tabs[0];
    }
    
    const sortedKeys = Object.keys(node.children).sort();
    for (const key of sortedKeys) {
        const result = getFirstFinalTab(node.children[key]);
        if (result) return result;
    }
    
    return null;
}

/**
 * Подсчитать общее количество конечных вкладок в узле (рекурсивно)
 * @param {Object} node - узел дерева
 * @returns {number}
 */
function countTotalTabs(node) {
    if (!node) return 0;
    let count = node.tabs ? node.tabs.length : 0;
    for (const key in node.children) {
        count += countTotalTabs(node.children[key]);
    }
    return count;
}

// ═══════════════════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ СЕЛЕКТОРА ВКЛАДОК
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Инициализация селектора вкладок
 */
function initTabSelector() {
    const dropdown = document.getElementById('tab-dropdown');
    const btn = document.getElementById('tab-btn');
    const btnText = document.getElementById('tab-btn-text');
    const menu = document.getElementById('tab-menu');
    
    // Состояние раскрытых групп (хранится между открытиями меню)
    let expandedGroups = new Set();
    
    // Состояние для inline-подтверждения удаления
    let pendingDeleteTabId = null;
    let pendingDeleteGroupPrefix = null;
    
    /**
     * Сбросить состояние ожидания удаления
     */
    function resetPendingDelete() {
        if (pendingDeleteTabId || pendingDeleteGroupPrefix) {
            pendingDeleteTabId = null;
            pendingDeleteGroupPrefix = null;
            // Восстанавливаем видимость кнопок
            menu.querySelectorAll('.tab-delete-btn, .group-delete-btn').forEach(btn => {
                btn.classList.remove('hidden');
            });
            menu.querySelectorAll('.tab-confirm-delete-btn, .group-confirm-delete-btn').forEach(btn => {
                btn.classList.add('hidden');
            });
            menu.querySelectorAll('.tab-actions.visible').forEach(actions => {
                actions.classList.remove('visible');
            });
        }
    }
    
    /**
     * Рендеринг списка вкладок (рекурсивно)
     * @param {Object} node - узел дерева
     * @param {string} prefix - текущий префикс пути
     * @param {number} level - уровень вложенности
     * @returns {string} HTML
     */
    function renderNode(node, prefix = '', level = 0) {
        let html = '';
        // Отступ: 16px за каждый уровень вложенности
        const indent = level * 16;
        
        // Сортируем ключи
        const sortedKeys = Object.keys(node.children).sort();
        
        sortedKeys.forEach(key => {
            const child = node.children[key];
            const hasChildren = Object.keys(child.children).length > 0;
            const hasTabs = child.tabs && child.tabs.length > 0;
            const fullPrefix = prefix ? `${prefix}-${key}` : key;
            const isExpanded = expandedGroups.has(fullPrefix);
            const totalTabs = countTotalTabs(child);
            
            // Если есть вложенные дети — это группа
            if (hasChildren) {
                const isPendingDelete = pendingDeleteGroupPrefix === fullPrefix;
                
                // Проверяем, содержит ли группа выбранную вкладку
                const containsSelected = currentTab && getAllTabs()[currentTab]?.name.startsWith(fullPrefix);
                
                html += `
                    <div class="tab-group" data-prefix="${escapeHtml(fullPrefix)}">
                        <div class="tab-group-header ${isExpanded ? 'expanded' : ''} ${containsSelected ? 'contains-selected' : ''}" 
                             data-prefix="${escapeHtml(fullPrefix)}" 
                             style="padding-left: ${16 + indent}px">
                            <svg class="tab-group-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                            </svg>
                            <span class="tab-group-name">${escapeHtml(key)}</span>
                            <span class="tab-group-count">${totalTabs}</span>
                            ${isAdminMode ? `
                            <div class="tab-actions group-actions ${isPendingDelete ? 'visible' : ''}">
                                <button class="tab-rename-btn group-rename-btn" data-prefix="${escapeHtml(fullPrefix)}" title="Переименовать группу">
                                    ${SVG_ICONS.editAlt}
                                </button>
                                <button class="tab-delete-btn group-delete-btn ${isPendingDelete ? 'hidden' : ''}" data-prefix="${escapeHtml(fullPrefix)}" title="Удалить группу">
                                    ${SVG_ICONS.trash}
                                </button>
                                <button class="tab-confirm-delete-btn group-confirm-delete-btn ${isPendingDelete ? '' : 'hidden'}" data-prefix="${escapeHtml(fullPrefix)}" title="Подтвердить удаление">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                </button>
                            </div>
                            ` : ''}
                        </div>
                        <div class="tab-group-content ${isExpanded ? 'expanded' : ''}">
                `;
                
                // Родительская вкладка группы (если есть вкладка с именем равным префиксу)
                if (hasTabs) {
                    child.tabs.forEach(tab => {
                        const isSelected = currentTab === tab.id;
                        const isPendingDelete = pendingDeleteTabId === tab.id;
                        const isProjectOwner = activeProject && activeProject.ownerTab === tab.id;
                        const projectIndicator = isProjectOwner ? 
                            `<span class="project-indicator" style="animation-delay: ${getProjectAnimationDelay()}"></span>` : '';
                        
                        html += `
                            <div class="tab-option tab-final ${isSelected ? 'selected' : ''}" 
                                 data-tab-id="${tab.id}"
                                 style="padding-left: ${32 + indent}px">
                                <span class="tab-option-text">${projectIndicator}${escapeHtml(key)}</span>
                                ${isAdminMode ? `
                                <div class="tab-actions ${isPendingDelete ? 'visible' : ''}">
                                    <button class="tab-rename-btn" data-tab-id="${tab.id}" title="Переименовать">
                                        ${SVG_ICONS.editAlt}
                                    </button>
                                    <button class="tab-delete-btn ${isPendingDelete ? 'hidden' : ''}" data-tab-id="${tab.id}" title="Удалить">
                                        ${SVG_ICONS.trash}
                                    </button>
                                    <button class="tab-confirm-delete-btn ${isPendingDelete ? '' : 'hidden'}" data-tab-id="${tab.id}" title="Подтвердить">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </button>
                                </div>
                                ` : ''}
                            </div>
                        `;
                    });
                }
                
                // Рекурсивно рендерим детей
                html += renderNode(child, fullPrefix, level + 1);
                
                html += `
                        </div>
                    </div>
                `;
            } else if (hasTabs) {
                // Конечная вкладка без вложенности
                child.tabs.forEach(tab => {
                    const isSelected = currentTab === tab.id;
                    const isPendingDelete = pendingDeleteTabId === tab.id;
                    const isProjectOwner = activeProject && activeProject.ownerTab === tab.id;
                    const projectIndicator = isProjectOwner ? 
                        `<span class="project-indicator" style="animation-delay: ${getProjectAnimationDelay()}"></span>` : '';
                    
                    html += `
                        <div class="tab-option tab-final ${isSelected ? 'selected' : ''}" 
                             data-tab-id="${tab.id}"
                             style="padding-left: ${16 + indent}px">
                            <span class="tab-option-text">${projectIndicator}${escapeHtml(key)}</span>
                            ${isAdminMode ? `
                            <div class="tab-actions ${isPendingDelete ? 'visible' : ''}">
                                <button class="tab-rename-btn" data-tab-id="${tab.id}" title="Переименовать">
                                    ${SVG_ICONS.editAlt}
                                </button>
                                <button class="tab-delete-btn ${isPendingDelete ? 'hidden' : ''}" data-tab-id="${tab.id}" title="Удалить">
                                    ${SVG_ICONS.trash}
                                </button>
                                <button class="tab-confirm-delete-btn ${isPendingDelete ? '' : 'hidden'}" data-tab-id="${tab.id}" title="Подтвердить">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                </button>
                            </div>
                            ` : ''}
                        </div>
                    `;
                });
            }
        });
        
        return html;
    }
    
    /**
     * Рендеринг основного меню
     */
    function renderTabMenu() {
        const allTabs = getAllTabs();
        const sortedTabs = Object.values(allTabs).sort((a, b) => a.name.localeCompare(b.name));
        const tree = buildTabTree(sortedTabs);
        
        let html = `
            <div class="tab-menu-list">
                ${renderNode(tree)}
            </div>
        `;
        
        // Кнопки действий (только в admin mode)
        if (isAdminMode) {
            html += `
                <div class="tab-menu-actions">
                    <div class="tab-menu-separator"></div>
                    <div class="tab-action-option add-tab-option">
                        ${SVG_ICONS.plus}
                        <span>Добавить</span>
                    </div>
                    <div class="tab-action-option edit-tab-option ${isEditMode ? 'active' : ''}">
                        ${SVG_ICONS.editAlt}
                        <span>${isEditMode ? 'Редактирование' : 'Редактировать'}</span>
                        ${isEditMode ? SVG_ICONS.check : ''}
                    </div>
                    <div class="tab-action-option export-tab-option">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>Экспорт</span>
                    </div>
                    <div class="tab-action-option import-tab-option">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <span>Импорт</span>
                    </div>
                </div>
            `;
        }
        
        menu.innerHTML = html;
        
        // Привязываем обработчики
        attachEventHandlers();
        
        // Скроллим к выбранной вкладке
        setTimeout(() => scrollToSelected(), 50);
    }
    
    /**
     * Скролл к выбранной вкладке
     */
    function scrollToSelected() {
        const list = menu.querySelector('.tab-menu-list');
        const selected = menu.querySelector('.tab-option.selected');
        if (list && selected) {
            const listRect = list.getBoundingClientRect();
            const selectedRect = selected.getBoundingClientRect();
            
            if (selectedRect.top < listRect.top || selectedRect.bottom > listRect.bottom) {
                selected.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
        }
    }
    
    /**
     * Привязка обработчиков событий
     */
    function attachEventHandlers() {
        // Клик на заголовок группы — раскрыть/свернуть
        menu.querySelectorAll('.tab-group-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.tab-actions')) return;
                
                const prefix = header.dataset.prefix;
                const group = header.closest('.tab-group');
                const content = group.querySelector('.tab-group-content');
                
                if (expandedGroups.has(prefix)) {
                    expandedGroups.delete(prefix);
                    header.classList.remove('expanded');
                    content.classList.remove('expanded');
                } else {
                    expandedGroups.add(prefix);
                    header.classList.add('expanded');
                    content.classList.add('expanded');
                }
            });
        });
        
        // Клик на конечную вкладку
        menu.querySelectorAll('.tab-option.tab-final').forEach(option => {
            option.addEventListener('click', (e) => {
                if (e.target.closest('.tab-actions')) return;
                if (pendingDeleteTabId || pendingDeleteGroupPrefix) {
                    resetPendingDelete();
                }
                const tabId = option.dataset.tabId;
                if (currentTab !== tabId) {
                    switchToTab(tabId);
                }
                closeMenu();
            });
        });
        
        // Кнопки переименования вкладок
        menu.querySelectorAll('.tab-rename-btn:not(.group-rename-btn)').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleRename(btn);
            });
        });
        
        // Кнопки переименования групп
        menu.querySelectorAll('.group-rename-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleGroupRename(btn);
            });
        });
        
        // Кнопки удаления вкладок (первый клик)
        menu.querySelectorAll('.tab-delete-btn:not(.group-delete-btn)').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                resetPendingDelete();
                pendingDeleteTabId = btn.dataset.tabId;
                btn.classList.add('hidden');
                const option = btn.closest('.tab-option');
                const confirmBtn = option?.querySelector('.tab-confirm-delete-btn');
                if (confirmBtn) confirmBtn.classList.remove('hidden');
                option?.querySelector('.tab-actions')?.classList.add('visible');
            });
        });
        
        // Подтверждение удаления вкладок
        menu.querySelectorAll('.tab-confirm-delete-btn:not(.group-confirm-delete-btn)').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tabId = btn.dataset.tabId;
                if (deleteTab(tabId)) {
                    pendingDeleteTabId = null;
                    if (currentTab === tabId) {
                        const allTabs = getAllTabs();
                        const firstTab = Object.values(allTabs).sort((a, b) => a.name.localeCompare(b.name))[0];
                        switchToTab(firstTab?.id || DEFAULT_TAB);
                    }
                    renderTabMenu();
                    updateSelectedUI();
                }
            });
        });
        
        // Кнопки удаления групп (первый клик)
        menu.querySelectorAll('.group-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                resetPendingDelete();
                pendingDeleteGroupPrefix = btn.dataset.prefix;
                btn.classList.add('hidden');
                const header = btn.closest('.tab-group-header');
                const confirmBtn = header?.querySelector('.group-confirm-delete-btn');
                if (confirmBtn) confirmBtn.classList.remove('hidden');
                header?.querySelector('.tab-actions')?.classList.add('visible');
            });
        });
        
        // Подтверждение удаления групп
        menu.querySelectorAll('.group-confirm-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleGroupDelete(btn.dataset.prefix);
            });
        });
        
        // Кнопки действий
        menu.querySelector('.add-tab-option')?.addEventListener('click', (e) => {
            e.stopPropagation();
            closeMenu();
            showAddTabModal();
        });
        
        menu.querySelector('.edit-tab-option')?.addEventListener('click', (e) => {
            e.stopPropagation();
            isEditMode = !isEditMode;
            toggleEditToolbar(isEditMode);
            closeMenu();
            if (workflowMode) {
                renderWorkflow();
                if (isEditMode) {
                    setTimeout(() => scrollToBlocks(), 50);
                }
            } else {
                loadPrompts();
            }
        });
        
        menu.querySelector('.export-tab-option')?.addEventListener('click', (e) => {
            e.stopPropagation();
            closeMenu();
            exportConfig();
        });
        
        menu.querySelector('.import-tab-option')?.addEventListener('click', (e) => {
            e.stopPropagation();
            closeMenu();
            importConfig();
        });
    }
    
    /**
     * Обработка переименования вкладки
     */
    function handleRename(btn) {
        const tabId = btn.dataset.tabId;
        const option = btn.closest('.tab-option');
        const span = option.querySelector('.tab-option-text');
        if (!span) return;
        
        const tabData = getAllTabs()[tabId];
        if (!tabData) return;
        
        const originalName = tabData.name || '';
        
        span.style.color = 'transparent';
        span.style.position = 'relative';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 50;
        input.className = 'tab-name-input';
        input.value = originalName;
        
        span.appendChild(input);
        input.focus();
        input.select();
        
        const cleanup = () => {
            span.style.color = '';
            span.style.position = '';
            if (input.parentNode) input.remove();
        };
        
        let saved = false;
        const save = () => {
            if (saved) return;
            saved = true;
            const newName = input.value.trim();
            cleanup();
            if (newName && newName !== originalName) {
                renameTab(tabId, newName);
                updateSelectedUI();
            }
            renderTabMenu();
        };
        
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cleanup();
                renderTabMenu();
            }
        });
        input.addEventListener('click', (e) => e.stopPropagation());
        
        pendingDeleteTabId = null;
    }
    
    /**
     * Обработка переименования группы (каскадное)
     */
    function handleGroupRename(btn) {
        const prefix = btn.dataset.prefix;
        const header = btn.closest('.tab-group-header');
        const span = header.querySelector('.tab-group-name');
        if (!span || !prefix) return;
        
        const parts = prefix.split('-');
        const displayName = parts[parts.length - 1];
        const parentPrefix = parts.slice(0, -1).join('-');
        
        const allTabs = getAllTabs();
        const affectedTabs = Object.values(allTabs).filter(tab => 
            tab.name === prefix || tab.name.startsWith(prefix + '-')
        );
        
        if (affectedTabs.length === 0) return;
        
        span.style.color = 'transparent';
        span.style.position = 'relative';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 50;
        input.className = 'tab-name-input';
        input.value = displayName;
        
        span.appendChild(input);
        input.focus();
        input.select();
        
        // Создаём превью изменений
        const preview = document.createElement('div');
        preview.className = 'group-rename-preview';
        header.style.position = 'relative';
        header.appendChild(preview);
        
        function updatePreview() {
            const newName = input.value.trim();
            const newPrefix = parentPrefix ? `${parentPrefix}-${newName}` : newName;
            
            let html = `<div class="preview-title">Будут переименованы (${affectedTabs.length}):</div>`;
            affectedTabs.slice(0, 5).forEach(tab => {
                const oldName = tab.name;
                const newTabName = oldName === prefix ? newPrefix : oldName.replace(prefix, newPrefix);
                html += `<div class="preview-item"><span class="old-name">${escapeHtml(oldName)}</span> → <span class="new-name">${escapeHtml(newTabName)}</span></div>`;
            });
            if (affectedTabs.length > 5) {
                html += `<div class="preview-more">...и ещё ${affectedTabs.length - 5}</div>`;
            }
            preview.innerHTML = html;
        }
        
        updatePreview();
        input.addEventListener('input', updatePreview);
        
        const cleanup = () => {
            span.style.color = '';
            span.style.position = '';
            header.style.position = '';
            if (input.parentNode) input.remove();
            if (preview.parentNode) preview.remove();
        };
        
        let saved = false;
        const save = () => {
            if (saved) return;
            saved = true;
            const newName = input.value.trim();
            cleanup();
            
            if (newName && newName !== displayName) {
                const newPrefix = parentPrefix ? `${parentPrefix}-${newName}` : newName;
                
                // Обновляем expandedGroups
                const newExpandedGroups = new Set();
                expandedGroups.forEach(g => {
                    if (g === prefix) {
                        newExpandedGroups.add(newPrefix);
                    } else if (g.startsWith(prefix + '-')) {
                        newExpandedGroups.add(g.replace(prefix, newPrefix));
                    } else {
                        newExpandedGroups.add(g);
                    }
                });
                expandedGroups = newExpandedGroups;
                
                affectedTabs.forEach(tab => {
                    const oldName = tab.name;
                    const newTabName = oldName === prefix ? newPrefix : oldName.replace(prefix, newPrefix);
                    if (newTabName !== oldName) {
                        renameTab(tab.id, newTabName);
                    }
                });
                
                updateSelectedUI();
            }
            renderTabMenu();
        };
        
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cleanup();
                renderTabMenu();
            }
        });
        input.addEventListener('click', (e) => e.stopPropagation());
        
        pendingDeleteTabId = null;
    }
    
    /**
     * Обработка удаления группы (каскадное)
     */
    function handleGroupDelete(prefix) {
        const allTabs = getAllTabs();
        const affectedTabs = Object.values(allTabs).filter(tab => 
            tab.name === prefix || tab.name.startsWith(prefix + '-')
        );
        
        if (affectedTabs.length === 0) {
            pendingDeleteGroupPrefix = null;
            renderTabMenu();
            return;
        }
        
        const currentTabAffected = affectedTabs.some(tab => tab.id === currentTab);
        
        affectedTabs.forEach(tab => {
            deleteTab(tab.id);
        });
        
        // Удаляем из expandedGroups
        const toRemove = [];
        expandedGroups.forEach(g => {
            if (g === prefix || g.startsWith(prefix + '-')) {
                toRemove.push(g);
            }
        });
        toRemove.forEach(g => expandedGroups.delete(g));
        
        if (currentTabAffected) {
            const remainingTabs = getAllTabs();
            const firstTab = Object.values(remainingTabs).sort((a, b) => a.name.localeCompare(b.name))[0];
            if (firstTab) {
                switchToTab(firstTab.id);
            } else {
                switchToTab(DEFAULT_TAB);
            }
        }
        
        pendingDeleteGroupPrefix = null;
        renderTabMenu();
        updateSelectedUI();
    }
    
    /**
     * Обновление UI кнопки селектора
     */
    function updateSelectedUI() {
        const allTabs = getAllTabs();
        const tab = allTabs[currentTab];
        if (!tab) return;
        
        const displayName = getLastPart(tab.name).toUpperCase();
        const maxLen = 20;
        const truncatedName = displayName.length > maxLen ? displayName.slice(0, maxLen - 1) + '…' : displayName;
        
        const isProjectOwner = activeProject && activeProject.ownerTab === currentTab;
        const projectIndicator = isProjectOwner ? 
            `<span class="project-indicator" style="animation-delay: ${getProjectAnimationDelay()}"></span>` : '';
        
        btnText.innerHTML = projectIndicator + escapeHtml(truncatedName);
        btnText.title = tab.name;
    }
    
    /**
     * Переключение меню
     */
    function toggleMenu() {
        const isOpen = !menu.classList.contains('hidden');
        if (isOpen) {
            closeMenu();
        } else {
            Dropdown.closeOthers('tab');
            pendingDeleteTabId = null;
            pendingDeleteGroupPrefix = null;
            renderTabMenu();
            menu.classList.remove('hidden');
            dropdown.classList.add('open');
        }
    }
    
    /**
     * Закрытие меню
     */
    function closeMenu() {
        menu.classList.add('hidden');
        dropdown.classList.remove('open');
        pendingDeleteTabId = null;
        pendingDeleteGroupPrefix = null;
    }
    
    // Регистрируем dropdown для взаимного закрытия
    Dropdown.register('tab', { 
        element: dropdown, 
        closeCallback: closeMenu 
    });
    
    /**
     * Переключение на вкладку
     */
    function switchToTab(newTab) {
        if (!newTab) return;
        
        const oldTab = currentTab;
        
        if (oldTab && oldTab !== newTab) {
            tabHistories[oldTab] = {
                undoStack: [...undoStack],
                redoStack: [...redoStack]
            };
        }
        
        currentTab = newTab;
        localStorage.setItem(STORAGE_KEYS.CURRENT_TAB, newTab);
        
        isEditMode = false;
        toggleEditToolbar(false);
        
        selectedNodes.clear();
        
        updateSelectedUI();
        
        if (tabHistories[newTab]) {
            undoStack = [...tabHistories[newTab].undoStack];
            redoStack = [...tabHistories[newTab].redoStack];
        } else {
            undoStack = [];
            redoStack = [];
        }
        updateUndoRedoButtons();
        
        loadWorkflowState();
        loadPrompts();
        
        const container = getWorkflowContainer();
        if (container && workflowMode) {
            setTimeout(() => scrollToBlocks(), 50);
        }
        
        setTimeout(() => {
            if (window.detectAndUpdateLanguageFromTab) {
                window.detectAndUpdateLanguageFromTab();
            }
        }, 50);
        
        if (undoStack.length === 0) {
            setTimeout(() => {
                const initialState = captureCurrentTabState();
                undoStack.push(initialState);
                tabHistories[newTab] = {
                    undoStack: [...undoStack],
                    redoStack: [...redoStack]
                };
                updateUndoRedoButtons();
            }, 100);
        }
    }
    
    // Инициализация
    updateSelectedUI();
    
    // Обработчики (только один раз)
    if (!btn._tabSelectorInitialized) {
        btn._tabSelectorInitialized = true;
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            toggleMenu();
        });
        
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });
        
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) {
                closeMenu();
            }
        });
    }
    
    // Экспорт
    window.updateTabSelectorUI = updateSelectedUI;
    window.switchToTab = switchToTab;
}

// ═══════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════════════════

window.initTabSelector = initTabSelector;
window.getProjectAnimationDelay = getProjectAnimationDelay;
