/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLAUDE STATE MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Функции сохранения и загрузки состояния панели Claude.
 * ProjectFSM — конечный автомат привязки к проекту Claude.
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
 *   - ProjectFSM
 */

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT FSM (Finite State Machine)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Конечный автомат привязки к проекту Claude
 * 
 * Состояния:
 *   idle      → нет проекта
 *   creating  → создание проекта (API вызов)
 *   bound     → проект активен, Claude таб на странице проекта
 *   detached  → проект был привязан, но Claude ушёл со страницы (grace period)
 *   finishing → анимация завершения проекта
 * 
 * Переходы:
 *   idle      → creating   (startCreating)
 *   creating  → bound      (bind)
 *   creating  → idle       (fail)
 *   bound     → detached   (detach — URL changed away from project)
 *   bound     → finishing  (finish)
 *   detached  → bound      (reattach — URL returned to project)
 *   detached  → finishing  (finish, or TTL expired)
 *   finishing → idle       (done)
 */
const ProjectFSM = {
    // Текущее состояние FSM
    _state: 'idle',
    
    // Данные проекта (null если idle)
    _data: null,
    
    // Таймер grace period для detached
    _detachTimer: null,
    
    // TTL таймер (4 часа)
    _ttlTimer: null,
    
    // Константы
    DETACH_GRACE_MS: 60000,  // 60 сек grace period для detached
    TTL_MS: 4 * 60 * 60 * 1000, // 4 часа максимальная привязка
    
    /** Текущее состояние */
    get state() { return this._state; },
    
    /** Данные проекта: { uuid, name, ownerTab (APM tab), claudeTab (1-3), boundAt } */
    get data() { return this._data; },
    
    /** UUID проекта или null */
    get uuid() { return this._data?.uuid || null; },
    
    /** Номер Claude таба (1-3) или null */
    get claudeTab() { return this._data?.claudeTab || null; },
    
    // ─── Переходы ──────────────────────────────────────────────────────
    
    /**
     * idle → creating
     * Вызывается перед API вызовом создания проекта
     */
    startCreating() {
        if (this._state !== 'idle') {
            log('ProjectFSM: cannot startCreating from', this._state);
            return false;
        }
        this._state = 'creating';
        return true;
    },
    
    /**
     * creating → bound
     * Вызывается после успешного создания проекта
     * @param {string} uuid - UUID проекта
     * @param {string} name - Название проекта
     * @param {string|number} ownerTab - APM вкладка-владелец
     * @param {number} claudeTab - Claude tab (1-3) куда привязан
     */
    bind(uuid, name, ownerTab, claudeTab) {
        if (this._state !== 'creating' && this._state !== 'idle') {
            log('ProjectFSM: cannot bind from', this._state);
            return false;
        }
        
        this._data = {
            uuid,
            name,
            ownerTab,
            claudeTab: claudeTab || activeClaudeTab,
            boundAt: Date.now()
        };
        this._state = 'bound';
        
        // Сохраняем в localStorage
        this._save();
        
        // Запускаем TTL таймер
        this._startTTL();
        
        // Обратная совместимость: обновляем activeProject
        activeProject = { uuid, name, ownerTab };
        
        return true;
    },
    
    /**
     * creating → idle (ошибка создания)
     */
    fail() {
        if (this._state !== 'creating') return;
        this._state = 'idle';
        this._data = null;
        activeProject = null;
    },
    
    /**
     * bound → detached (Claude ушёл со страницы проекта)
     * Запускает grace period таймер
     */
    detach() {
        if (this._state !== 'bound') return;
        this._state = 'detached';
        this._save();
        
        // Запускаем grace period — если не вернётся, auto-finish
        this._clearDetachTimer();
        this._detachTimer = setTimeout(() => {
            if (this._state === 'detached') {
                log('ProjectFSM: detach grace period expired, finishing');
                this.finish();
            }
        }, this.DETACH_GRACE_MS);
    },
    
    /**
     * detached → bound (Claude вернулся на страницу проекта)
     */
    reattach() {
        if (this._state !== 'detached') return;
        this._state = 'bound';
        this._clearDetachTimer();
        this._save();
    },
    
    /**
     * bound|detached → finishing → idle
     * @returns {Promise<void>}
     */
    async finish() {
        if (this._state !== 'bound' && this._state !== 'detached') return;
        
        this._state = 'finishing';
        this._clearDetachTimer();
        this._clearTTL();
        
        const projectName = this._data?.name || 'Проект';
        
        // Анимация кнопки
        const btn = document.getElementById('finish-project-btn');
        if (btn) {
            btn.classList.add('hiding');
            await delay(300);
            btn.classList.remove('visible', 'hiding');
        }
        
        // Очистка
        this._data = null;
        this._state = 'idle';
        activeProject = null;
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROJECT);
        
        // Обновляем UI
        this._updateUI();
        
        // Проверяем «продолжить проект»
        if (typeof checkForContinueProject === 'function') {
            checkForContinueProject();
        }
        
        showToast(`Проект "${projectName}" завершён`);
    },
    
    // ─── URL валидация ──────────────────────────────────────────────────
    
    /**
     * Проверяет URL и обновляет состояние FSM
     * Вызывается из обработчиков claude-page-loaded и claude-url-changed
     * @param {number} tab - Claude tab (1-3)
     * @param {string} url - текущий URL
     */
    validateUrl(tab, url) {
        if (!this._data || this._state === 'idle' || this._state === 'finishing') return;
        
        // Игнорируем about:blank, страницы логина и другие не-Claude URL
        if (!url || !url.startsWith('https://claude.ai/')) return;
        if (url.includes('/login') || url.includes('/logout') || url.includes('/sign')) return;
        
        // Проверяем только привязанный Claude таб
        if (tab !== this._data.claudeTab) return;
        
        // Убираем hash перед проверкой (generation monitor ставит #generating)
        const cleanUrl = url.split('#')[0];
        
        const isOnProject = cleanUrl.includes(`/project/${this._data.uuid}`);
        
        // /chat/{id} — нормальный URL для чата внутри проекта, НЕ считаем уходом
        const isInChat = /\/chat\/[a-f0-9-]+/i.test(cleanUrl);
        
        // Определяем явный уход: /new без контекста проекта, другой /project/, главная
        const isDifferentProject = /\/project\/[a-f0-9-]+/i.test(cleanUrl) && !isOnProject;
        const isHomePage = cleanUrl === 'https://claude.ai/' || cleanUrl === 'https://claude.ai';
        const isNewChatNoProject = cleanUrl.includes('/new');
        
        const isDefinitelyAway = isDifferentProject || isHomePage || isNewChatNoProject;
        
        if (this._state === 'bound' && !isOnProject && !isInChat && isDefinitelyAway) {
            // Явный уход со страницы проекта (не в чат)
            this.detach();
        } else if (this._state === 'detached' && isOnProject) {
            // Вернулся на страницу проекта
            this.reattach();
        }
    },
    
    // ─── TTL ──────────────────────────────────────────────────────────
    
    /** Проверяет не истёк ли TTL */
    isExpired() {
        if (!this._data?.boundAt) return false;
        return (Date.now() - this._data.boundAt) > this.TTL_MS;
    },
    
    _startTTL() {
        this._clearTTL();
        const remaining = this._data?.boundAt 
            ? this.TTL_MS - (Date.now() - this._data.boundAt)
            : this.TTL_MS;
        
        if (remaining <= 0) {
            this.finish();
            return;
        }
        
        this._ttlTimer = setTimeout(() => {
            if (this._state === 'bound' || this._state === 'detached') {
                log('ProjectFSM: TTL expired, finishing');
                this.finish();
            }
        }, remaining);
    },
    
    _clearTTL() {
        if (this._ttlTimer) {
            clearTimeout(this._ttlTimer);
            this._ttlTimer = null;
        }
    },
    
    _clearDetachTimer() {
        if (this._detachTimer) {
            clearTimeout(this._detachTimer);
            this._detachTimer = null;
        }
    },
    
    // ─── Persistence ──────────────────────────────────────────────────
    
    _save() {
        if (this._data) {
            localStorage.setItem(STORAGE_KEYS.ACTIVE_PROJECT, JSON.stringify({
                ...this._data,
                fsmState: this._state
            }));
        }
    },
    
    /**
     * Восстановление из localStorage
     */
    restore() {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_PROJECT);
            if (!saved) return;
            
            const data = JSON.parse(saved);
            if (!data?.uuid) return;
            
            // Проверяем TTL
            if (data.boundAt && (Date.now() - data.boundAt) > this.TTL_MS) {
                localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROJECT);
                return;
            }
            
            this._data = data;
            this._state = data.fsmState || 'bound';
            
            // Если было detached — проверяем grace period
            if (this._state === 'detached') {
                this._state = 'bound'; // Восстанавливаем как bound, URL проверится позже
            }
            if (this._state === 'creating' || this._state === 'finishing') {
                // Нестабильные состояния при crash — сбрасываем
                this._data = null;
                this._state = 'idle';
                localStorage.removeItem(STORAGE_KEYS.ACTIVE_PROJECT);
                return;
            }
            
            // Обратная совместимость
            activeProject = { uuid: data.uuid, name: data.name, ownerTab: data.ownerTab };
            
            // Показываем кнопку
            const btn = document.getElementById('finish-project-btn');
            if (btn) btn.classList.add('visible');
            
            // Запускаем TTL
            this._startTTL();
            
        } catch (e) {
            // Restore failed
        }
    },
    
    // ─── UI helpers ──────────────────────────────────────────────────
    
    _updateUI() {
        if (typeof adjustWorkflowScale === 'function') adjustWorkflowScale();
        if (typeof updateWorkflowChatButtons === 'function') updateWorkflowChatButtons();
        if (typeof updateTabSelectorUI === 'function') updateTabSelectorUI();
    }
};

/**
 * Проверяет, активен ли проект (обратная совместимость)
 * @returns {boolean}
 */
function isProjectActive() {
    return ProjectFSM._state === 'bound' || ProjectFSM._state === 'detached';
}

/**
 * Проверяет, является ли текущая вкладка владельцем проекта (обратная совместимость)
 * @returns {boolean}
 */
function isCurrentTabProjectOwner() {
    return isProjectActive() && ProjectFSM._data?.ownerTab === currentTab;
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
window.ProjectFSM = ProjectFSM;
