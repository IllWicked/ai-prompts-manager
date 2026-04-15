/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REMOTE PROMPTS MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Загрузка и обновление промптов с GitHub.
 * 
 * Функции:
 *   - fetchRemoteManifest() - загрузка манифеста
 *   - fetchRemoteTab(tabId) - загрузка данных вкладки
 *   - checkForPromptsUpdate() - проверка обновлений
 *   - applyPromptsUpdate() - применение обновлений
 *   - initializeRemotePrompts() - инициализация при первом запуске
 *   - showPromptsUpdateModal() - показать модалку обновлений
 */

// ═══════════════════════════════════════════════════════════════════════════
// КОНФИГУРАЦИЯ
// ═══════════════════════════════════════════════════════════════════════════

const REMOTE_PROMPTS_CONFIG = {
    // URL для загрузки промптов (GitHub raw)
    BASE_URL: 'https://raw.githubusercontent.com/IllWicked/ai-prompts-manager/main/prompts',
    
    // Ключи localStorage
    STORAGE: {
        MANIFEST: 'remote-prompts-manifest',
        LAST_CHECK: 'remote-prompts-last-check'
    },
    
    // Таймаут fetch запросов (мс)
    FETCH_TIMEOUT: 10000
};

// Состояние последней проверки (для модалки)
let lastPromptsCheck = null;

// ═══════════════════════════════════════════════════════════════════════════
// УТИЛИТЫ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch с таймаутом
 */
async function fetchWithTimeout(url, timeout = REMOTE_PROMPTS_CONFIG.FETCH_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, { 
            signal: controller.signal,
            cache: 'no-cache'
        });
        clearTimeout(timeoutId);
        return response;
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
}

/**
 * Загрузка JSON с GitHub
 */
async function fetchJSON(path) {
    const url = `${REMOTE_PROMPTS_CONFIG.BASE_URL}/${path}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// ЗАГРУЗКА ДАННЫХ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Загружает манифест с GitHub
 * @returns {Promise<Object|null>}
 */
async function fetchRemoteManifest() {
    try {
        return await fetchJSON('manifest.json');
    } catch (e) {
        console.error('[RemotePrompts] Failed to fetch manifest:', e);
        return null;
    }
}

/**
 * Загружает данные вкладки с GitHub
 * @param {string} tabId 
 * @returns {Promise<Object|null>}
 */
async function fetchRemoteTab(tabId) {
    try {
        return await fetchJSON(`${tabId}.json`);
    } catch (e) {
        console.error(`[RemotePrompts] Failed to fetch tab "${tabId}":`, e);
        return null;
    }
}

/**
 * Получает закэшированный манифест
 * @returns {Object|null}
 */
function getCachedManifest() {
    try {
        const cached = localStorage.getItem(REMOTE_PROMPTS_CONFIG.STORAGE.MANIFEST);
        return cached ? JSON.parse(cached) : null;
    } catch (e) {
        return null;
    }
}

/**
 * Сохраняет манифест в кэш
 * @param {Object} manifest 
 */
function cacheManifest(manifest) {
    localStorage.setItem(REMOTE_PROMPTS_CONFIG.STORAGE.MANIFEST, JSON.stringify(manifest));
    localStorage.setItem(REMOTE_PROMPTS_CONFIG.STORAGE.LAST_CHECK, Date.now().toString());
}

// ═══════════════════════════════════════════════════════════════════════════
// ПРОВЕРКА ОБНОВЛЕНИЙ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Проверяет наличие обновлений промптов
 * @param {boolean} showModal - показать модалку с результатом
 * @returns {Promise<{hasUpdates: boolean, newTabs: string[], updatedTabs: string[], removedTabs: string[]}>}
 */
async function checkForPromptsUpdate(showModal = false) {
    const remoteManifest = await fetchRemoteManifest();
    if (!remoteManifest) {
        if (showModal) {
            showPromptsUpdateError('Не удалось связаться с сервером');
        }
        return { hasUpdates: false, newTabs: [], updatedTabs: [], removedTabs: [] };
    }
    
    const cachedManifest = getCachedManifest();
    const newTabs = [];
    const updatedTabs = [];
    const removedTabs = [];
    
    // Получаем реальные версии вкладок из приложения
    const localTabs = typeof getAllTabs === 'function' ? getAllTabs() : {};
    const remoteTabs = remoteManifest.tabs || {};
    
    // Проверяем каждую вкладку в удалённом манифесте
    for (const [tabId, remoteInfo] of Object.entries(remoteTabs)) {
        const localTab = localTabs[tabId];
        const localVersion = localTab?.version || '0.0.0';
        
        if (!localTab) {
            // Новая вкладка (нет локально)
            newTabs.push({ id: tabId, name: remoteInfo.name, version: remoteInfo.version });
        } else if (remoteInfo.version !== localVersion) {
            // Обновлённая вкладка (версии отличаются)
            // Проверяем был ли флаг userModified (пользователь изменял вкладку)
            const isUserModified = localTab.userModified === true;
            updatedTabs.push({ 
                id: tabId, 
                name: remoteInfo.name, 
                oldVersion: localVersion,
                newVersion: remoteInfo.version,
                userModified: isUserModified
            });
        }
    }
    
    // Обратная проверка: локальные remote-вкладки, которых НЕТ в манифесте → удалены
    for (const [tabId, localTab] of Object.entries(localTabs)) {
        // Только remote-вкладки (у них есть version), пропускаем пользовательские
        if (!localTab.version) continue;
        
        if (!remoteTabs[tabId]) {
            removedTabs.push({ id: tabId, name: localTab.name || tabId });
        }
    }
    
    const hasUpdates = newTabs.length > 0 || updatedTabs.length > 0 || removedTabs.length > 0;
    
    // Сохраняем результат для модалки
    lastPromptsCheck = {
        hasUpdates,
        newTabs,
        updatedTabs,
        removedTabs,
        remoteManifest
    };
    
    if (showModal) {
        if (hasUpdates) {
            showPromptsUpdateAvailable(newTabs, updatedTabs, removedTabs);
        } else {
            showPromptsUpdateLatest();
        }
    }
    
    return { hasUpdates, newTabs, updatedTabs, removedTabs, remoteManifest };
}

// ═══════════════════════════════════════════════════════════════════════════
// ПРИМЕНЕНИЕ ОБНОВЛЕНИЙ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Конвертирует данные вкладки из JSON в формат приложения
 * @param {Object} tabData - данные из JSON
 * @param {string} version - версия вкладки из манифеста
 * @returns {Object} - данные в формате приложения
 */
function convertRemoteTabToAppFormat(tabData, version = null) {
    // Поддержка обоих форматов: {tab: {...}, workflow: {...}} и плоского
    const tabInfo = tabData.tab || tabData;
    const items = tabInfo.items || [];
    
    return {
        id: tabInfo.id,
        name: tabInfo.name,
        version: version || tabInfo.version || '1.0.0',
        items: items.map(item => {
            // Копируем все поля item как есть
            const converted = { ...item };
            // Устанавливаем дефолты только если поля отсутствуют
            if (!converted.type) converted.type = 'block';
            return converted;
        })
    };
}

/**
 * Применяет обновления промптов
 * @param {Object[]} tabs - список вкладок для обновления [{id, ...}]
 * @param {Object} remoteManifest - удалённый манифест
 * @param {boolean} isNewTabs - это новые вкладки (не обновление)
 * @param {boolean} skipReload - не вызывать loadPrompts/initTabSelector (при инициализации)
 * @returns {Promise<{success: boolean, updated: string[], failed: string[]}>}
 */
async function applyPromptsUpdate(tabs, remoteManifest, isNewTabs = false, skipReload = false) {
    const updated = [];
    const failed = [];
    
    // Получаем текущие вкладки
    const allTabs = typeof getAllTabs === 'function' ? getAllTabs() : {};
    
    // Загружаем collapsed из отдельного хранилища
    // ВАЖНО: blockScripts и blockAutomation — локальные настройки, не трогаем
    let collapsedBlocks = {};
    
    try {
        collapsedBlocks = JSON.parse(localStorage.getItem(STORAGE_KEYS.COLLAPSED_BLOCKS) || '{}');
    } catch (e) {
        console.error('[RemotePrompts] Error loading block data:', e);
    }
    
    for (const tab of tabs) {
        const tabId = tab.id || tab;
        const tabData = await fetchRemoteTab(tabId);
        if (!tabData) {
            failed.push(tabId);
            continue;
        }
        
        // Получаем версию из манифеста
        const tabVersion = remoteManifest.tabs?.[tabId]?.version || tab.version || tab.newVersion;
        
        // Конвертируем в формат приложения
        const appTabData = convertRemoteTabToAppFormat(tabData, tabVersion);
        
        // Переносим collapsed из items в отдельные хранилища
        // ВАЖНО: scripts и automation из remote items НЕ трогаем blockScripts/blockAutomation
        // (они не сохраняются в эти хранилища — см. ниже, сохраняется только collapsed)
        const tabItems = (tabData.tab || tabData).items || [];
        for (const item of tabItems) {
            if (!item.id) continue;
            if (item.collapsed) {
                collapsedBlocks[item.id] = true;
            }
        }
        
        // Добавляем/обновляем вкладку
        allTabs[tabId] = appTabData;
        
        // Сохраняем workflow данные (всегда перезаписываем при обновлении)
        if (tabData.workflow) {
            localStorage.setItem(STORAGE_KEYS.workflow(tabId), JSON.stringify(tabData.workflow));
        }
        
        updated.push(tabId);
    }
    
    // Сохраняем все вкладки
    if (updated.length > 0) {
        // Удаляем fallback-вкладку DEFAULT если она была создана при неудачной загрузке
        if (allTabs['default'] && allTabs['default'].name === 'DEFAULT') {
            delete allTabs['default'];
            // Чистим localStorage от fallback-данных
            localStorage.removeItem(STORAGE_KEYS.promptsData('default'));
            localStorage.removeItem(STORAGE_KEYS.workflow('default'));
            // Переключаемся на первую реальную вкладку если были на default
            if (currentTab === 'default') {
                const firstTab = Object.keys(allTabs)[0];
                if (firstTab) {
                    currentTab = firstTab;
                    localStorage.setItem(STORAGE_KEYS.CURRENT_TAB, firstTab);
                }
            }
        }
        
        if (typeof saveAllTabs === 'function') {
            saveAllTabs(allTabs);
        }
        
        // Сохраняем отдельные хранилища
        localStorage.setItem(STORAGE_KEYS.COLLAPSED_BLOCKS, JSON.stringify(collapsedBlocks));
        
        // Перезагружаем данные в память
        if (typeof loadCollapsedBlocks === 'function') loadCollapsedBlocks();
        if (typeof loadBlockScripts === 'function') loadBlockScripts();
        if (typeof loadBlockAutomation === 'function') loadBlockAutomation();
        
        // Обновляем кэшированный манифест
        cacheManifest(remoteManifest);
        
        // Перезагружаем UI (пропускаем при инициализации — initApp вызовет сам)
        if (!skipReload) {
            if (typeof loadPrompts === 'function') {
                loadPrompts();
            }
            if (typeof initTabSelector === 'function') {
                initTabSelector();
            }
        }
    }
    
    return { success: failed.length === 0, updated, failed };
}

/**
 * Удаляет локальные remote-вкладки, которых больше нет в манифесте GitHub.
 * Полная очистка: вкладка + workflow + collapsed + scripts + automation + промпт-данные.
 * 
 * @param {Object[]} removedTabs - список вкладок для удаления [{id, name}]
 * @returns {{removed: string[], skipped: string[]}}
 */
function removeObsoleteTabs(removedTabs) {
    if (!removedTabs || removedTabs.length === 0) return { removed: [], skipped: [] };
    
    const allTabs = typeof getAllTabs === 'function' ? getAllTabs() : {};
    const removed = [];
    const skipped = [];
    
    // Загружаем отдельные хранилища для cleanup
    let collapsedBlocks = {};
    
    try {
        collapsedBlocks = JSON.parse(localStorage.getItem(STORAGE_KEYS.COLLAPSED_BLOCKS) || '{}');
    } catch (e) {
        console.error('[RemotePrompts] Error loading block data for cleanup:', e);
    }
    
    for (const tab of removedTabs) {
        const tabId = tab.id;
        const localTab = allTabs[tabId];
        
        if (!localTab) {
            skipped.push(tabId);
            continue;
        }
        
        // Нельзя удалить последнюю вкладку
        if (Object.keys(allTabs).length <= 1) {
            console.warn('[RemotePrompts] Skipping removal of last tab:', tabId);
            skipped.push(tabId);
            continue;
        }
        
        // Очищаем per-block данные
        const tabItems = localTab.items || [];
        for (const item of tabItems) {
            if (!item.id) continue;
            delete collapsedBlocks[item.id];
            delete blockScripts[item.id];
            delete blockAutomation[item.id];
            // Runtime attachments
            if (typeof blockAttachments !== 'undefined' && blockAttachments[item.id]) {
                delete blockAttachments[item.id];
            }
        }
        
        // Очищаем undo history
        UndoManager.deleteTab(tabId);
        
        // Удаляем localStorage ключи вкладки
        localStorage.removeItem(STORAGE_KEYS.workflow(tabId));
        localStorage.removeItem(STORAGE_KEYS.promptsData(tabId));
        localStorage.removeItem(`ai-prompts-manager-${tabId}`);
        
        // Удаляем вкладку
        delete allTabs[tabId];
        removed.push(tabId);
        
        console.log(`[RemotePrompts] Removed obsolete tab: ${tabId} (${tab.name})`);
    }
    
    if (removed.length > 0) {
        // Если удалённая вкладка была текущей — переключаемся на первую доступную
        if (typeof currentTab !== 'undefined' && !allTabs[currentTab]) {
            const firstTabId = Object.keys(allTabs)[0];
            if (firstTabId) {
                currentTab = firstTabId;
                window.currentTab = firstTabId;
            }
        }
        
        // Сохраняем всё
        if (typeof saveAllTabs === 'function') {
            saveAllTabs(allTabs);
        }
        localStorage.setItem(STORAGE_KEYS.COLLAPSED_BLOCKS, JSON.stringify(collapsedBlocks));
        
        // Перезагружаем данные в память
        if (typeof loadCollapsedBlocks === 'function') loadCollapsedBlocks();
        if (typeof loadBlockScripts === 'function') loadBlockScripts();
        if (typeof loadBlockAutomation === 'function') loadBlockAutomation();
    }
    
    return { removed, skipped };
}

// ═══════════════════════════════════════════════════════════════════════════
// UI - МОДАЛЬНЫЕ ОКНА
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Показывает модалку "Обновление доступно"
 */
function showPromptsUpdateAvailable(newTabs, updatedTabs, removedTabs = []) {
    if (typeof closeAllModals === 'function') closeAllModals();
    
    const modal = document.getElementById('prompts-update-modal');
    const availableState = document.getElementById('prompts-update-available-state');
    const latestState = document.getElementById('prompts-update-latest-state');
    const listEl = document.getElementById('prompts-update-list');
    const titleEl = document.getElementById('prompts-update-title');
    const subtitleEl = document.getElementById('prompts-update-subtitle');
    const hintEl = document.getElementById('prompts-update-hint');
    const applyBtn = document.getElementById('prompts-update-apply-btn');
    const laterBtn = document.getElementById('prompts-update-later-btn');
    const doneBtn = document.getElementById('prompts-update-done-btn');
    
    // Восстанавливаем заголовок
    if (titleEl) titleEl.textContent = '📝 Доступно обновление промптов!';
    if (subtitleEl) subtitleEl.textContent = 'Доступны обновления для вкладок:';
    if (hintEl) hintEl.classList.remove('hidden');
    
    // Формируем список обновлений
    let listHtml = '';
    if (newTabs.length > 0) {
        listHtml += '<div class="mb-2"><span class="text-xs font-medium text-green-600">Новые вкладки:</span></div>';
        newTabs.forEach(tab => {
            const safeName = typeof escapeHtml === 'function' ? escapeHtml(tab.name) : tab.name;
            listHtml += `<div class="flex items-center gap-2 mb-1">
                <span class="text-green-500">+</span>
                <span>${safeName}</span>
                <span class="text-xs text-gray-400">v${tab.version}</span>
            </div>`;
        });
    }
    if (updatedTabs.length > 0) {
        if (newTabs.length > 0) listHtml += '<div class="mt-3"></div>';
        listHtml += '<div class="mb-2"><span class="text-xs font-medium text-blue-600">Обновления:</span></div>';
        
        const modifiedTabs = updatedTabs.filter(t => t.userModified);
        
        updatedTabs.forEach(tab => {
            const warningIcon = tab.userModified ? '<span class="text-yellow-500 ml-1" title="Вкладка была изменена">⚠️</span>' : '';
            const safeName = typeof escapeHtml === 'function' ? escapeHtml(tab.name) : tab.name;
            listHtml += `<div class="flex items-center gap-2 mb-1">
                <span class="text-blue-500">↑</span>
                <span>${safeName}${warningIcon}</span>
                <span class="text-xs text-gray-400">v${tab.oldVersion} → v${tab.newVersion}</span>
            </div>`;
        });
        
        if (modifiedTabs.length > 0) {
            listHtml += `<div class="mt-3 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded text-xs text-yellow-700 dark:text-yellow-300">
                <strong>⚠️ Внимание:</strong> ${modifiedTabs.length} вкладка(и) с пометкой ⚠️ были изменены вами. 
                При обновлении ваши изменения будут потеряны.
            </div>`;
        }
    }
    if (removedTabs.length > 0) {
        if (newTabs.length > 0 || updatedTabs.length > 0) listHtml += '<div class="mt-3"></div>';
        listHtml += '<div class="mb-2"><span class="text-xs font-medium text-red-600">Будут удалены:</span></div>';
        removedTabs.forEach(tab => {
            const safeName = typeof escapeHtml === 'function' ? escapeHtml(tab.name) : tab.name;
            listHtml += `<div class="flex items-center gap-2 mb-1">
                <span class="text-red-500">−</span>
                <span>${safeName}</span>
            </div>`;
        });
    }
    if (listEl) listEl.innerHTML = listHtml;
    
    // Показываем кнопки "Обновить" и "Позже", скрываем "OK"
    if (applyBtn) applyBtn.classList.remove('hidden');
    if (laterBtn) laterBtn.classList.remove('hidden');
    if (doneBtn) doneBtn.classList.add('hidden');
    
    if (availableState) availableState.classList.remove('hidden');
    if (latestState) latestState.classList.add('hidden');
    if (modal) modal.classList.add('open');
}

/**
 * Показывает модалку "Промпты актуальны"
 */
function showPromptsUpdateLatest() {
    if (typeof closeAllModals === 'function') closeAllModals();
    
    const modal = document.getElementById('prompts-update-modal');
    const availableState = document.getElementById('prompts-update-available-state');
    const latestState = document.getElementById('prompts-update-latest-state');
    
    if (availableState) availableState.classList.add('hidden');
    if (latestState) latestState.classList.remove('hidden');
    if (modal) modal.classList.add('open');
}

/**
 * Показывает ошибку
 */
function showPromptsUpdateError(message) {
    if (typeof showToast === 'function') {
        showToast(message, 3000);
    }
}

/**
 * Скрывает модалку обновления промптов
 */
function hidePromptsUpdateModal() {
    const modal = document.getElementById('prompts-update-modal');
    if (modal) modal.classList.remove('open');
}

/**
 * Применяет обновления из lastPromptsCheck
 */
async function applyPendingPromptsUpdate() {
    if (!lastPromptsCheck || !lastPromptsCheck.hasUpdates) return;
    
    const { newTabs, updatedTabs, removedTabs = [], remoteManifest } = lastPromptsCheck;
    const allTabs = [...newTabs, ...updatedTabs];
    
    if (allTabs.length === 0 && removedTabs.length === 0) return;
    
    // Показываем индикатор загрузки
    const applyBtn = document.getElementById('prompts-update-apply-btn');
    if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.textContent = 'Обновление...';
    }
    
    try {
        // Удаляем устаревшие вкладки
        if (removedTabs.length > 0) {
            removeObsoleteTabs(removedTabs);
        }
        
        // Применяем обновления/добавления
        let result = { updated: [], failed: [] };
        if (allTabs.length > 0) {
            result = await applyPromptsUpdate(allTabs, remoteManifest, newTabs.length > 0);
        }
        
        // Обновляем кэш манифеста
        cacheManifest(remoteManifest);
        
        hidePromptsUpdateModal();
        
        if (result.updated.length > 0 || removedTabs.length > 0) {
            showPromptsReleaseNotes(newTabs, updatedTabs, removedTabs);
        }
        if (result.failed.length > 0) {
            if (typeof showToast === 'function') {
                showToast(`Не удалось обновить: ${result.failed.join(', ')}`, 5000);
            }
        }
    } finally {
        if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.textContent = 'Обновить';
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Инициализирует промпты при первом запуске (нет данных в localStorage)
 * @returns {Promise<{success: boolean, tabs?: Array}>}
 */
async function initializeRemotePrompts() {
    // Загружаем манифест
    const manifest = await fetchRemoteManifest();
    if (!manifest || !manifest.tabs) {
        console.error('[RemotePrompts] Failed to load manifest');
        return { success: false };
    }
    
    const tabIds = Object.keys(manifest.tabs).map(id => ({ id }));
    
    // Собираем инфо о вкладках для модалки
    const newTabs = tabIds.map(t => ({
        id: t.id,
        name: manifest.tabs[t.id].name,
        version: manifest.tabs[t.id].version
    }));
    
    // Загружаем все вкладки (skipReload=true — initApp вызовет loadPrompts сам)
    const result = await applyPromptsUpdate(tabIds, manifest, true, true);
    
    if (result.success) {
        return { 
            success: true, 
            tabs: newTabs
        };
    } else {
        console.error('[RemotePrompts] Initialization failed:', result.failed);
        return { success: false };
    }
}

/**
 * Автоматическая проверка обновлений при запуске
 * Вызывается ПОСЛЕ проверки обновлений программы
 * @returns {Promise<void>}
 */
async function autoCheckPromptsUpdates() {
    try {
        const result = await checkForPromptsUpdate(false);
        
        if (result.hasUpdates) {
            // Удаляем вкладки, которых больше нет в манифесте
            if (result.removedTabs.length > 0) {
                removeObsoleteTabs(result.removedTabs);
            }
            
            // Новые вкладки добавляем автоматически
            if (result.newTabs.length > 0) {
                await applyPromptsUpdate(result.newTabs, result.remoteManifest, true, true);
            }
            
            // Обновления существующих вкладок - тоже автоматически
            if (result.updatedTabs.length > 0) {
                await applyPromptsUpdate(result.updatedTabs, result.remoteManifest, false, true);
            }
            
            // Обновляем кэш манифеста (чтобы removedTabs не детектились повторно)
            cacheManifest(result.remoteManifest);
            
            // Перезагружаем UI после всех изменений
            if (typeof loadPrompts === 'function') loadPrompts();
            if (typeof initTabSelector === 'function') initTabSelector();
            
            // Показываем модалку "Что нового" после обновления
            showPromptsReleaseNotes(result.newTabs, result.updatedTabs, result.removedTabs);
        }
    } catch (e) {
        console.error('[RemotePrompts] Auto-check failed:', e);
    }
}

/**
 * Показывает модалку "Что нового" после автоматического обновления
 */
function showPromptsReleaseNotes(newTabs, updatedTabs, removedTabs = []) {
    if (typeof closeAllModals === 'function') closeAllModals();
    
    const modal = document.getElementById('prompts-update-modal');
    const availableState = document.getElementById('prompts-update-available-state');
    const latestState = document.getElementById('prompts-update-latest-state');
    const listEl = document.getElementById('prompts-update-list');
    const titleEl = document.getElementById('prompts-update-title');
    const subtitleEl = document.getElementById('prompts-update-subtitle');
    const hintEl = document.getElementById('prompts-update-hint');
    const applyBtn = document.getElementById('prompts-update-apply-btn');
    const laterBtn = document.getElementById('prompts-update-later-btn');
    const doneBtn = document.getElementById('prompts-update-done-btn');
    
    // Меняем заголовок на "Промпты обновлены"
    if (titleEl) titleEl.textContent = '✅ Промпты обновлены';
    if (subtitleEl) subtitleEl.textContent = 'Обновлены вкладки:';
    if (hintEl) hintEl.classList.add('hidden');
    
    // Формируем список обновлений
    let listHtml = '';
    if (newTabs.length > 0) {
        listHtml += '<div class="mb-2"><span class="text-xs font-medium text-green-600">Добавлены вкладки:</span></div>';
        newTabs.forEach(tab => {
            listHtml += `<div class="flex items-center gap-2 mb-1">
                <span class="text-green-500">+</span>
                <span>${tab.name}</span>
                <span class="text-xs text-gray-400">v${tab.version}</span>
            </div>`;
        });
    }
    if (updatedTabs.length > 0) {
        if (newTabs.length > 0) listHtml += '<div class="mt-3"></div>';
        listHtml += '<div class="mb-2"><span class="text-xs font-medium text-blue-600">Обновлены:</span></div>';
        updatedTabs.forEach(tab => {
            listHtml += `<div class="flex items-center gap-2 mb-1">
                <span class="text-blue-500">↑</span>
                <span>${tab.name}</span>
                <span class="text-xs text-gray-400">v${tab.oldVersion || tab.version} → v${tab.newVersion || tab.version}</span>
            </div>`;
        });
    }
    if (removedTabs.length > 0) {
        if (newTabs.length > 0 || updatedTabs.length > 0) listHtml += '<div class="mt-3"></div>';
        listHtml += '<div class="mb-2"><span class="text-xs font-medium text-red-600">Удалены:</span></div>';
        removedTabs.forEach(tab => {
            const safeName = typeof escapeHtml === 'function' ? escapeHtml(tab.name) : tab.name;
            listHtml += `<div class="flex items-center gap-2 mb-1">
                <span class="text-red-500">−</span>
                <span>${safeName}</span>
            </div>`;
        });
    }
    if (listEl) listEl.innerHTML = listHtml;
    
    // Скрываем кнопки "Обновить" и "Позже", показываем только "OK"
    if (applyBtn) applyBtn.classList.add('hidden');
    if (laterBtn) laterBtn.classList.add('hidden');
    if (doneBtn) doneBtn.classList.remove('hidden');
    
    if (availableState) availableState.classList.remove('hidden');
    if (latestState) latestState.classList.add('hidden');
    if (modal) modal.classList.add('open');
}

/**
 * Инициализация обработчиков событий для модалки
 */
function initPromptsUpdateHandlers() {
    // Кнопка "Позже"
    document.getElementById('prompts-update-later-btn')?.addEventListener('click', hidePromptsUpdateModal);
    
    // Кнопка "Обновить"
    document.getElementById('prompts-update-apply-btn')?.addEventListener('click', applyPendingPromptsUpdate);
    
    // Кнопка "ОК" (в состоянии "актуальны")
    document.getElementById('prompts-update-ok-btn')?.addEventListener('click', hidePromptsUpdateModal);
    
    // Кнопка "ОК" (после обновления)
    document.getElementById('prompts-update-done-btn')?.addEventListener('click', hidePromptsUpdateModal);
    
    // Клик по оверлею
    document.getElementById('prompts-update-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'prompts-update-modal') {
            hidePromptsUpdateModal();
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════════════════

// Делаем функции глобальными
window.fetchRemoteManifest = fetchRemoteManifest;
window.fetchRemoteTab = fetchRemoteTab;
window.checkForPromptsUpdate = checkForPromptsUpdate;
window.applyPromptsUpdate = applyPromptsUpdate;
window.removeObsoleteTabs = removeObsoleteTabs;
window.initializeRemotePrompts = initializeRemotePrompts;
window.autoCheckPromptsUpdates = autoCheckPromptsUpdates;
window.initPromptsUpdateHandlers = initPromptsUpdateHandlers;
window.showPromptsUpdateAvailable = showPromptsUpdateAvailable;
window.showPromptsUpdateLatest = showPromptsUpdateLatest;
window.showPromptsReleaseNotes = showPromptsReleaseNotes;
window.hidePromptsUpdateModal = hidePromptsUpdateModal;
