/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLAUDE STATE MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Функции сохранения и загрузки состояния панели Claude.
 * 
 * Зависимости:
 *   - window.AppState.claude (shared state)
 *   - isClaudeVisible, activeClaudeTab, panelRatio, tabUrls, isResetting (алиасы)
 *   - activeProject, currentTab (алиасы)
 *   - Tauri API: window.__TAURI__.core.invoke
 * 
 * @requires config.js (STORAGE_KEYS)
 * 
 * Экспортирует (глобально):
 *   - saveClaudeSettings()
 *   - loadClaudeSettings()
 *   - updateAllTabUrls()
 *   - isProjectActive()
 *   - isCurrentTabProjectOwner()
 */

/**
 * Проверяет, активен ли проект
 * @returns {boolean}
 */
function isProjectActive() {
    return activeProject !== null;
}

/**
 * Проверяет, является ли текущая вкладка владельцем проекта
 * @returns {boolean}
 */
function isCurrentTabProjectOwner() {
    return activeProject && activeProject.ownerTab === currentTab;
}

/**
 * Сохранение состояния Claude в localStorage
 */
async function saveClaudeSettings() {
    // Не сохраняем если идёт сброс
    if (isResetting) return;
    
    try {
        // Обновляем URL всех табов перед сохранением
        await updateAllTabUrls();
        
        const claudeSettings = {
            visible: isClaudeVisible,
            activeTab: activeClaudeTab,
            panelRatio: panelRatio,
            tabUrls: tabUrls,
            tabNames: tabNames
        };
        localStorage.setItem(STORAGE_KEYS.CLAUDE_SETTINGS, JSON.stringify(claudeSettings));
    } catch (e) {
        
    }
}

/**
 * Обновить URL всех табов Claude
 */
async function updateAllTabUrls() {
    for (const tab of [1, 2, 3]) {
        try {
            const url = await window.__TAURI__.core.invoke('get_tab_url', { tab });
            // Не сохраняем пустые URL
            if (url && url !== 'about:blank' && url.startsWith('https://claude.ai')) {
                tabUrls[tab] = url;
            }
        } catch (e) {
            // Ignore
        }
    }
}

/**
 * Загрузка состояния Claude из localStorage
 * @returns {Object|null} Сохранённые настройки или null
 */
function loadClaudeSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEYS.CLAUDE_SETTINGS);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        
    }
    return null;
}

// Экспорт
window.saveClaudeSettings = saveClaudeSettings;
window.loadClaudeSettings = loadClaudeSettings;
