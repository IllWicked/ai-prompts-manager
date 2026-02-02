/**
 * AI Prompts Manager - Updates
 * Функции для проверки и установки обновлений приложения
 * 
 * @requires utils.js (delay, getAppVersion)
 * @requires modals.js (closeAllModals)
 */

// ═══════════════════════════════════════════════════════════════════════════
// СОСТОЯНИЕ
// ═══════════════════════════════════════════════════════════════════════════

/** @type {Object|null} Результат последней проверки обновлений */
let lastUpdateCheck = null;

// ═══════════════════════════════════════════════════════════════════════════
// ПРОВЕРКА ОБНОВЛЕНИЙ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Проверить наличие обновлений
 * @param {boolean} showModal - показать модальное окно с результатом
 * @returns {Promise<Object>} - { available: boolean, version: string, body?: string }
 */
async function checkForUpdates(showModal = false) {
    // Небольшая задержка 
    await delay(300);
    
    // Получаем текущую версию
    const currentVersion = await getAppVersion();
    
    // Проверяем, что мы в Tauri для updater
    if (window.__TAURI__?.updater) {
        try {
            const { check } = window.__TAURI__.updater;
            const update = await check();
            
            if (update?.available) {
                lastUpdateCheck = { available: true, version: update.version, body: update.body || '' };
                if (showModal) {
                    showUpdateModalAvailable(update.version, update.body);
                }
                return lastUpdateCheck;
            } else {
                lastUpdateCheck = { available: false, version: currentVersion };
                if (showModal) {
                    showUpdateModalLatest(currentVersion);
                }
                return lastUpdateCheck;
            }
        } catch (e) {
            // Проверка обновлений не удалась
        }
    }
    
    // Fallback - показываем текущую версию
    lastUpdateCheck = { available: false, version: currentVersion };
    if (showModal) {
        showUpdateModalLatest(currentVersion);
    }
    return lastUpdateCheck;
}

// ═══════════════════════════════════════════════════════════════════════════
// МОДАЛЬНЫЕ ОКНА
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Показать модальное окно "Доступно обновление"
 * @param {string} newVersion - новая версия
 * @param {string} releaseNotes - описание изменений (markdown)
 */
function showUpdateModalAvailable(newVersion, releaseNotes = '') {
    closeAllModals();
    const modal = document.getElementById('update-modal');
    const availableState = document.getElementById('update-available-state');
    const latestState = document.getElementById('update-latest-state');
    const versionSpan = document.getElementById('update-version');
    const installBtn = document.getElementById('install-update-btn');
    const notesContainer = document.getElementById('update-notes');
    const notesContent = document.getElementById('update-notes-content');
    
    if (versionSpan) versionSpan.textContent = newVersion;
    if (installBtn) {
        installBtn.disabled = false;
        installBtn.textContent = 'Обновить сейчас';
    }
    
    // Отображаем патчноуты если есть
    if (notesContainer && notesContent) {
        if (releaseNotes && releaseNotes.trim()) {
            // Простое форматирование markdown-подобного текста
            let formattedNotes = releaseNotes
                .replace(/\r\n/g, '\n')
                .replace(/^### (.+)$/gm, '<strong class="block mt-2 mb-1">$1</strong>')
                .replace(/^- (.+)$/gm, '<div class="flex gap-2"><span class="text-claude-accent">•</span><span>$1</span></div>')
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/`(.+?)`/g, '<code class="bg-gray-200 dark:bg-gray-600 px-1 rounded text-xs">$1</code>')
                .replace(/\n/g, '<br>');
            notesContent.innerHTML = formattedNotes;
            notesContainer.classList.remove('hidden');
        } else {
            notesContainer.classList.add('hidden');
        }
    }
    
    if (availableState) availableState.classList.remove('hidden');
    if (latestState) latestState.classList.add('hidden');
    if (modal) modal.classList.add('open');
}

/**
 * Показать модальное окно "Версия актуальна"
 * @param {string} currentVersion - текущая версия
 */
function showUpdateModalLatest(currentVersion) {
    closeAllModals();
    const modal = document.getElementById('update-modal');
    const availableState = document.getElementById('update-available-state');
    const latestState = document.getElementById('update-latest-state');
    const versionSpan = document.getElementById('current-version');
    
    if (versionSpan) versionSpan.textContent = currentVersion;
    if (availableState) availableState.classList.add('hidden');
    if (latestState) latestState.classList.remove('hidden');
    if (modal) modal.classList.add('open');
}

/**
 * Скрыть модальное окно обновления
 */
function hideUpdateModal() {
    const modal = document.getElementById('update-modal');
    if (modal) modal.classList.remove('open');
}

// ═══════════════════════════════════════════════════════════════════════════
// УСТАНОВКА ОБНОВЛЕНИЙ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Установить обновление и перезапустить приложение
 */
async function installUpdate() {
    if (!window.__TAURI__ || !window.__TAURI__.updater) return;
    
    const btn = document.getElementById('install-update-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Загрузка...';
    }
    
    try {
        const { check } = window.__TAURI__.updater;
        const update = await check();
        
        if (update?.available) {
            await update.downloadAndInstall();
            // После установки перезапускаем приложение
            const { relaunch } = window.__TAURI__.process;
            await relaunch();
        }
    } catch (e) {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Ошибка. Попробовать снова';
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════════════════

window.checkForUpdates = checkForUpdates;
window.showUpdateModalAvailable = showUpdateModalAvailable;
window.showUpdateModalLatest = showUpdateModalLatest;
window.hideUpdateModal = hideUpdateModal;
window.installUpdate = installUpdate;
