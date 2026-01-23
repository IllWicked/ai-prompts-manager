/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLAUDE UI MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Функции UI для панели Claude: ресайзер, табы, кнопки.
 * 
 * Зависимости:
 *   - window.AppState (shared state)
 *   - isClaudeVisible, activeClaudeTab, existingTabs, panelRatio, generatingTabs, tabNames (алиасы)
 *   - resizer, isResizing, startX, startRatio, windowWidth, lastAppliedRatio, updateScheduled (алиасы)
 *   - workflowMode, currentTab, activeProject (алиасы)
 *   - Tauri API: window.__TAURI__.core.invoke
 *   - adjustWorkflowScale() из workflow-zoom.js
 *   - saveClaudeSettings() из claude-state.js
 *   - getTabBlocks(), SVG_ICONS из index.html
 *   - generateExpandedFooterHtml() из workflow-render.js
 * 
 * Экспортирует (глобально):
 *   - createResizer()
 *   - updateResizer()
 *   - updateClaudeState()
 *   - updateClaudeUI()
 *   - updateWorkflowChatButtons()
 */

/**
 * Создание ресайзера для панелей
 */
function createResizer() {
    // Проверяем существование и наличие в DOM
    if (resizer && document.body.contains(resizer)) return;
    
    // Если элемент есть но не в DOM — очищаем ссылку
    if (resizer && !document.body.contains(resizer)) {
        resizer = null;
    }
    
    // Ресайзер на правом краю
    resizer = document.createElement('div');
    resizer.className = 'panel-resizer';
    document.body.appendChild(resizer);
    
    // Форсируем reflow чтобы гарантировать что элемент добавлен в DOM
    void resizer.offsetHeight;
    
    resizer.addEventListener('pointerdown', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        startX = e.screenX;
        startRatio = panelRatio;
        lastAppliedRatio = panelRatio;
        
        // Захватываем указатель
        resizer.setPointerCapture(e.pointerId);
        
        // Получаем реальную ширину окна от Tauri
        try {
            windowWidth = await window.__TAURI__.core.invoke('get_window_width');
        } catch (err) {
            windowWidth = window.screen.availWidth;
        }
        
        resizer.classList.add('active');
        document.body.style.cursor = 'col-resize';
    });
    
    resizer.addEventListener('pointermove', (e) => {
        if (!isResizing) return;
        
        const deltaX = e.screenX - startX;
        const deltaRatio = (deltaX / windowWidth) * 100;
        const newRatio = Math.round(startRatio + deltaRatio);
        panelRatio = Math.max(35, Math.min(65, newRatio));
        
        // Обновляем позицию ресайзера
        updateResizer();
        
        // Обновляем масштаб workflow (без сброса скролла)
        if (workflowMode) {
            adjustWorkflowScale(false);
        }
        
        // Throttled update - не чаще чем раз в frame
        if (!updateScheduled && panelRatio !== lastAppliedRatio) {
            updateScheduled = true;
            requestAnimationFrame(async () => {
                if (isResizing) {
                    await window.__TAURI__.core.invoke('set_panel_ratio', { ratio: panelRatio });
                    lastAppliedRatio = panelRatio;
                }
                updateScheduled = false;
            });
        }
    });
    
    // Общий обработчик завершения ресайза
    async function finishResize(e, releaseCapture = false) {
        if (!isResizing) return;
        isResizing = false;
        
        if (releaseCapture) {
            try { resizer.releasePointerCapture(e.pointerId); } catch (err) {}
        }
        
        resizer.classList.remove('active');
        document.body.style.cursor = '';
        
        if (panelRatio !== lastAppliedRatio) {
            await window.__TAURI__.core.invoke('set_panel_ratio', { ratio: panelRatio });
        }
        await saveClaudeSettings();
    }
    
    resizer.addEventListener('pointerup', (e) => finishResize(e, true));
    resizer.addEventListener('lostpointercapture', (e) => finishResize(e, false));
}

/**
 * Обновление позиции и видимости ресайзера
 */
function updateResizer() {
    // Если resizer не существует или не в DOM — создаём
    if (!resizer || !document.body.contains(resizer)) {
        createResizer();
    }
    
    // Повторная проверка после создания
    if (!resizer) return;
    
    resizer.style.display = isClaudeVisible ? 'block' : 'none';
    if (isClaudeVisible) {
        // Ресайзер полностью на стороне UI (иначе перекрывается Claude webview)
        resizer.style.left = 'auto';
        resizer.style.right = '0';
    }
}

/**
 * Получение и обновление состояния Claude из Tauri
 */
async function updateClaudeState() {
    try {
        const [visible, active, tabs] = await window.__TAURI__.core.invoke('get_claude_state');
        isClaudeVisible = visible;
        activeClaudeTab = active;
        existingTabs = tabs;
        
        // Загружаем ratio
        panelRatio = await window.__TAURI__.core.invoke('get_panel_ratio');
        
        updateClaudeUI();
        updateResizer();
    } catch (e) {
        
    }
}

/**
 * Обновление UI элементов Claude (кнопки, табы)
 */
function updateClaudeUI() {
    // Главная кнопка Claude - только toggle класса, анимация через CSS
    const toggleBtn = document.getElementById('claude-toggle-btn');
    if (toggleBtn) {
        toggleBtn.classList.toggle('active', isClaudeVisible);
    }
    
    // Вторая строка хедера с табами - показываем только когда Claude открыт
    const tabsRow = document.getElementById('claude-tabs-row');
    if (tabsRow) {
        tabsRow.classList.toggle('hidden', !isClaudeVisible);
    }
    
    // Обновляем все табы (1, 2, 3)
    for (let i = 1; i <= 3; i++) {
        const tabBtn = document.getElementById(`claude-tab-${i}`);
        if (!tabBtn) continue;
        
        const exists = existingTabs.includes(i);
        const isActive = activeClaudeTab === i;
        const isGenerating = generatingTabs[i] || false;
        const tabName = tabNames[i] || `Чат ${i}`;
        
        // Чат 1 виден всегда (через CSS), для остальных управляем через .visible
        if (i > 1) {
            tabBtn.classList.toggle('visible', exists);
        }
        
        tabBtn.classList.toggle('active', isActive);
        tabBtn.classList.toggle('exists', exists);
        tabBtn.classList.toggle('generating', isGenerating);
        
        // Обновляем содержимое (Чат 1 всегда, остальные если существуют)
        if (i === 1 || exists) {
            const generatingHtml = isGenerating ? `<span class="generating-indicator" style="animation-delay: ${getSyncedAnimationDelay()}"></span>` : '';
            // Чат 1 без крестика, остальные с крестиком
            const closeBtn = i > 1 ? `<span class="tab-close-btn" data-tab="${i}"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 1L9 9M9 1L1 9"/></svg></span>` : '';
            tabBtn.innerHTML = `${generatingHtml}<span class="tab-text">${tabName}</span>${closeBtn}`;
        }
    }
    
    // Кнопка "+ Чат" - показывается если можно добавить чат 2 или 3
    const addBtn = document.getElementById('claude-add-tab');
    if (addBtn) {
        const canAdd = !existingTabs.includes(2) || !existingTabs.includes(3);
        addBtn.classList.toggle('visible', canAdd);
    }
    
    // Обновляем кнопки чатов в workflow
    updateWorkflowChatButtons();
}

/**
 * Обновление кнопок чатов в workflow нодах
 */
function updateWorkflowChatButtons() {
    if (!workflowMode) return;
    
    const blocks = getTabBlocks(currentTab);
    const chatTabs = existingTabs.length > 0 ? existingTabs : [1];
    
    // Проверка доступности кнопок чата (для Project Binding)
    // Показываем кнопки если нет активного проекта ИЛИ текущая вкладка — владелец
    const showChatButtons = !isProjectActive() || isCurrentTabProjectOwner();
    
    document.querySelectorAll('.workflow-node').forEach(node => {
        const index = parseInt(node.dataset.index);
        if (isNaN(index)) return;
        
        // Обновляем кнопки в footer (развёрнутый блок)
        const buttonsContainer = node.querySelector('.workflow-node-footer-buttons');
        if (buttonsContainer) {
            buttonsContainer.innerHTML = generateExpandedFooterHtml(index, chatTabs, { showChatButtons });
        }
        
        // Обновляем кнопки в header (свёрнутый блок)
        const collapsedButtons = node.querySelector('.collapsed-footer-buttons');
        if (collapsedButtons) {
            if (showChatButtons) {
                const arrowSvgSmall = SVG_ICONS.arrowSmall;
                const collapsedHtml = chatTabs.slice(0, 3).map(tab => 
                    chatTabs.length === 1
                        ? `<button class="collapsed-send-btn" onclick="event.stopPropagation(); sendNodeToClaude(${index}, ${tab})" title="Отправить в чат">${arrowSvgSmall}</button>`
                        : `<button class="collapsed-send-btn" onclick="event.stopPropagation(); sendNodeToClaude(${index}, ${tab})" title="Отправить в Чат ${tab}">${arrowSvgSmall}<span>${tab}</span></button>`
                ).join('');
                collapsedButtons.innerHTML = collapsedHtml;
            } else {
                collapsedButtons.innerHTML = '';
            }
        }
    });
}
