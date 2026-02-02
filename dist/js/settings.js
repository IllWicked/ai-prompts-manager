/**
 * AI Prompts Manager - Settings
 * Функции для работы с настройками приложения и темами
 * 
 * @requires storage.js (getSettings, saveSettings)
 * @requires modals.js (closeAllModals, hideModal)
 * @requires toast.js (showToast)
 * @requires config.js (STORAGE_KEYS)
 * @requires claude-ui.js (updateClaudeState)
 * @requires claude-api.js (navigateClaude, stopGenerationMonitor)
 */

// ═══════════════════════════════════════════════════════════════════════════
// МОДАЛЬНОЕ ОКНО НАСТРОЕК
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Показать модальное окно настроек
 */
function showSettingsModal() {
    closeAllModals();
    const modal = document.getElementById('settings-modal');
    const settings = getSettings();
    
    // Устанавливаем состояние кнопок автообновлений
    updateAutoUpdateButtons(settings.autoUpdate);
    
    // Устанавливаем активную тему
    updateThemeButtons(settings.theme);
    
    // Устанавливаем состояние режима редактирования
    updateEditModeToggle();
    
    // Устанавливаем версию
    const versionSpan = document.getElementById('settings-version');
    if (versionSpan && window.__TAURI__) {
        window.__TAURI__.core.invoke('plugin:app|version').then(v => {
            versionSpan.textContent = v;
        }).catch(() => {
            versionSpan.textContent = '0.3.0';
        });
    }
    
    modal?.classList.add('open');
}

/**
 * Скрыть модальное окно настроек
 */
const hideSettingsModal = () => hideModal('settings-modal');

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION В CLAUDE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Открытие URL в webview Claude (в текущей вкладке Claude)
 * @param {string} url - URL для открытия
 */
async function openUrlInClaude(url) {
    try {
        // Показываем панель Claude если скрыта (не ждём анимацию)
        if (!isClaudeVisible && window.__TAURI__?.core?.invoke) {
            window.__TAURI__.core.invoke('toggle_claude').then(() => updateClaudeState());
        }
        // Навигация сразу — webview уже существует
        await navigateClaude(activeClaudeTab, url);
    } catch (e) {
        showToast('❌ Ошибка навигации', 2000);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ЛОГ СКАЧИВАНИЙ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Показать модальное окно лога скачиваний
 */
async function showArchiveLogModal() {
    closeAllModals();
    const modal = document.getElementById('archive-log-modal');
    const tbody = document.getElementById('archive-log-tbody');
    const searchInput = document.getElementById('archive-log-search');
    
    if (searchInput) searchInput.value = '';
    
    try {
        const log = await window.__TAURI__.core.invoke('get_archive_log');
        
        if (log.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="archive-log-empty">Лог пуст</td></tr>';
        } else {
            // Показываем в обратном порядке (новые сверху)
            tbody.innerHTML = log.reverse().map(entry => `
                <tr class="archive-log-row">
                    <td class="archive-log-cell archive-log-timestamp">${entry.timestamp}</td>
                    <td class="archive-log-cell archive-log-filename">${escapeHtml(entry.filename)}</td>
                    <td class="archive-log-cell">
                        <button onclick="openUrlInClaude('${escapeHtml(entry.claude_url)}')" class="archive-log-link">
                            Открыть в Claude
                        </button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="3" class="archive-log-error">Ошибка загрузки лога</td></tr>';
    }
    
    modal?.classList.add('open');
}

/**
 * Скрыть модальное окно лога скачиваний
 */
const hideArchiveLogModal = () => hideModal('archive-log-modal');

// ═══════════════════════════════════════════════════════════════════════════
// TOGGLE КНОПКИ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generic функция обновления toggle кнопок
 * @param {string} btnClass - CSS класс кнопок
 * @param {string} activeId - ID активной кнопки
 */
function updateToggleButtons(btnClass, activeId) {
    document.querySelectorAll(`.${btnClass}`).forEach(btn => btn.classList.remove('active'));
    document.getElementById(activeId)?.classList.add('active');
}

/**
 * Обновить состояние кнопок автообновления
 * @param {boolean} enabled - включено ли автообновление
 */
function updateAutoUpdateButtons(enabled) {
    updateToggleButtons('auto-update-btn', enabled ? 'auto-update-on' : 'auto-update-off');
}

/**
 * Обновить состояние кнопок темы
 * @param {string} activeTheme - активная тема ('light', 'dark', 'auto')
 */
function updateThemeButtons(activeTheme) {
    updateToggleButtons('theme-btn', `theme-${activeTheme}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// ТЕМЫ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Установить тему
 * @param {string} theme - тема ('light', 'dark', 'auto')
 */
function setTheme(theme) {
    const settings = getSettings();
    settings.theme = theme;
    saveSettings(settings);
    updateThemeButtons(theme);
    applyTheme(theme);
}

/**
 * Синхронизация фона окна с темой (для устранения белых полос при resize)
 */
async function syncWindowBackground() {
    try {
        const isDark = document.body.classList.contains('dark');
        await window.__TAURI__.core.invoke('set_window_background', { dark: isDark });
    } catch (e) {
        // Игнорируем если не Tauri
    }
}

/**
 * Применить тему к документу
 * @param {string} theme - тема ('light', 'dark', 'auto')
 */
function applyTheme(theme) {
    const body = document.body;
    
    if (theme === 'dark') {
        body.classList.add('dark');
    } else if (theme === 'light') {
        body.classList.remove('dark');
    } else {
        // Auto - следуем системной теме
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            body.classList.add('dark');
        } else {
            body.classList.remove('dark');
        }
    }
    
    // Синхронизируем фон окна
    syncWindowBackground();
}

/**
 * Инициализация слушателя изменения системной темы
 */
function initThemeListener() {
    const settings = getSettings();
    applyTheme(settings.theme);
    
    // Слушаем изменения системной темы для auto режима
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const currentSettings = getSettings();
        if (currentSettings.theme === 'auto') {
            if (e.matches) {
                document.body.classList.add('dark');
            } else {
                document.body.classList.remove('dark');
            }
            syncWindowBackground();
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// АВТООБНОВЛЕНИЕ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Переключить автообновление
 * @param {boolean} enabled - включить или выключить
 */
function toggleAutoUpdate(enabled) {
    const settings = getSettings();
    settings.autoUpdate = enabled;
    saveSettings(settings);
}

// ═══════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════════════════

// confirmReset экспортируется из persistence.js

window.showSettingsModal = showSettingsModal;
window.hideSettingsModal = hideSettingsModal;
window.openUrlInClaude = openUrlInClaude;
window.showArchiveLogModal = showArchiveLogModal;
window.hideArchiveLogModal = hideArchiveLogModal;
window.updateToggleButtons = updateToggleButtons;
window.updateAutoUpdateButtons = updateAutoUpdateButtons;
window.updateThemeButtons = updateThemeButtons;
window.setTheme = setTheme;
window.syncWindowBackground = syncWindowBackground;
window.applyTheme = applyTheme;
window.initThemeListener = initThemeListener;
window.toggleAutoUpdate = toggleAutoUpdate;
