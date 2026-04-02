/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WORKFLOW STATE MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Функции сохранения и загрузки состояния workflow.
 * 
 * Зависимости:
 *   - window.AppState (shared state)
 *   - currentTab, DEFAULT_TAB (алиасы)
 *   - workflowPositions, workflowConnections, workflowSizes (алиасы)
 * 
 * @requires config.js (STORAGE_KEYS)
 * 
 * Экспортирует (глобально):
 *   - saveWorkflowState()
 *   - loadWorkflowState()
 */

/**
 * Сохранение состояния workflow в localStorage
 */
function saveWorkflowState() {
    const tabId = currentTab || DEFAULT_TAB;
    
    const workflowData = {
        positions: workflowPositions,
        connections: workflowConnections,
        sizes: workflowSizes,
        notes: workflowNotes,
        colors: workflowColors
    };
    
    localStorage.setItem(STORAGE_KEYS.workflow(tabId), JSON.stringify(workflowData));
}

/**
 * Загрузка состояния workflow из localStorage
 */
function loadWorkflowState() {
    const tabId = currentTab || DEFAULT_TAB;
    
    // Сначала сбрасываем
    workflowPositions = {};
    workflowConnections = [];
    workflowSizes = {};
    workflowNotes = [];
    workflowColors = {};
    
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.workflow(tabId));
        if (saved) {
            const data = JSON.parse(saved);
            workflowPositions = data.positions || {};
            workflowConnections = data.connections || [];
            workflowSizes = data.sizes || {};
            workflowNotes = data.notes || [];
            workflowColors = data.colors || {};
        }
    } catch (e) {
        // JSON parse failed — state already reset to defaults
    }
    
    // Автопочинка
    if (repairWorkflowState(tabId)) {
        saveWorkflowState();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// АВТОПОЧИНКА WORKFLOW STATE
// ═══════════════════════════════════════════════════════════════════════════

const VALID_SIDES = new Set(['left', 'right', 'top', 'bottom']);

/**
 * Проверяет и чинит workflow state.
 * @param {string} tabId
 * @returns {boolean} true если были исправления
 */
function repairWorkflowState(tabId) {
    let repaired = false;
    
    // Собираем валидные ID блоков из данных вкладки
    const validIds = new Set();
    try {
        const items = typeof getTabItems === 'function' ? getTabItems(tabId) : [];
        items.forEach(item => { if (item?.id) validIds.add(item.id); });
    } catch (e) {
        return false; // Нет доступа к вкладке — не чиним
    }
    
    if (validIds.size === 0) return false;
    
    // 1. Починка connections
    const originalLen = workflowConnections.length;
    const seen = new Set();
    
    workflowConnections = workflowConnections.filter(conn => {
        // Проверяем структуру
        if (!conn || typeof conn !== 'object') return false;
        if (!conn.from || !conn.to) return false;
        if (typeof conn.from !== 'string' || typeof conn.to !== 'string') return false;
        
        // Проверяем что блоки существуют
        if (!validIds.has(conn.from) || !validIds.has(conn.to)) return false;
        
        // Проверяем self-connection
        if (conn.from === conn.to) return false;
        
        // Починка сторон
        if (!VALID_SIDES.has(conn.fromSide)) conn.fromSide = 'right';
        if (!VALID_SIDES.has(conn.toSide)) conn.toSide = 'left';
        
        // Дубликаты (по паре from→to)
        const key = `${conn.from}->${conn.to}`;
        if (seen.has(key)) return false;
        seen.add(key);
        
        return true;
    });
    
    if (workflowConnections.length !== originalLen) {
        repaired = true;
        console.log(`[Repair] Connections: ${originalLen} → ${workflowConnections.length}`);
    }
    
    // 2. Починка positions
    for (const id of Object.keys(workflowPositions)) {
        if (!validIds.has(id)) {
            delete workflowPositions[id];
            repaired = true;
            continue;
        }
        const pos = workflowPositions[id];
        if (!pos || typeof pos !== 'object') {
            delete workflowPositions[id];
            repaired = true;
            continue;
        }
        // Починка NaN/undefined координат
        if (typeof pos.x !== 'number' || isNaN(pos.x)) { pos.x = 50; repaired = true; }
        if (typeof pos.y !== 'number' || isNaN(pos.y)) { pos.y = 50; repaired = true; }
    }
    
    // 3. Починка sizes
    for (const id of Object.keys(workflowSizes)) {
        if (!validIds.has(id)) {
            delete workflowSizes[id];
            repaired = true;
            continue;
        }
        const size = workflowSizes[id];
        if (!size || typeof size !== 'object') {
            delete workflowSizes[id];
            repaired = true;
            continue;
        }
        if (typeof size.width !== 'number' || isNaN(size.width) || size.width < 100) {
            size.width = 340;
            repaired = true;
        }
    }
    
    // 4. Починка colors
    if (workflowColors && typeof workflowColors === 'object') {
        for (const id of Object.keys(workflowColors)) {
            if (!validIds.has(id)) {
                delete workflowColors[id];
                repaired = true;
            }
        }
    } else {
        workflowColors = {};
    }
    
    // 5. Починка notes
    if (!Array.isArray(workflowNotes)) {
        workflowNotes = [];
        repaired = true;
    } else {
        const notesLen = workflowNotes.length;
        workflowNotes = workflowNotes.filter(n => 
            n && typeof n === 'object' && typeof n.id === 'string'
        );
        if (workflowNotes.length !== notesLen) repaired = true;
    }
    
    if (repaired) {
        console.log(`[Repair] Workflow state repaired for tab "${tabId}"`);
    }
    
    return repaired;
}
