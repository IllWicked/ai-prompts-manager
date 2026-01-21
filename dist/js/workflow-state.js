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
 *   - autoSaveToUndo() из undo.js
 * 
 * Экспортирует (глобально):
 *   - saveWorkflowState(skipUndo)
 *   - loadWorkflowState()
 */

/**
 * Сохранение состояния workflow в localStorage
 * @param {boolean} skipUndo - Пропустить автосохранение в undo
 */
function saveWorkflowState(skipUndo = false) {
    const tabId = currentTab || DEFAULT_TAB;
    
    const workflowData = {
        positions: workflowPositions,
        connections: workflowConnections,
        sizes: workflowSizes
    };
    
    localStorage.setItem(`workflow-${tabId}`, JSON.stringify(workflowData));
    if (!skipUndo) {
        autoSaveToUndo();
    }
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
    
    try {
        const saved = localStorage.getItem(`workflow-${tabId}`);
        if (saved) {
            const data = JSON.parse(saved);
            workflowPositions = data.positions || {};
            workflowConnections = data.connections || [];
            workflowSizes = data.sizes || {};
        }
    } catch (e) {
        
    }
    
}
