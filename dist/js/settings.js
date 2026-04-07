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
    
    // Устанавливаем состояние оффлайн-режима
    updateOfflineModeButtons(settings.offlineMode);
    
    // Устанавливаем состояние auto-continue
    updateAutoContinueButtons(settings.autoContinue);
    
    // Устанавливаем активную тему
    updateThemeButtons(settings.theme);
    
    // Заполняем UI кастомизации
    populateCustomizationUI();
    
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
    
    // Сворачиваем "Дополнительно" и убираем скролл
    const modalContent = modal?.querySelector('.modal-content');
    modalContent?.classList.remove('has-scroll');
    const advContent = document.getElementById('advanced-settings-content');
    const advArrow = document.getElementById('advanced-settings-arrow');
    if (advContent) advContent.classList.add('hidden');
    if (advArrow) advArrow.style.transform = '';
    
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
                </tr>`).join('');
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
// АКЦЕНТНЫЙ ЦВЕТ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Преобразование hex → {r, g, b}
 */
function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Преобразование hex → {h, s, l} (h: 0-360, s/l: 0-100)
 */
function hexToHsl(hex) {
    let { r, g, b } = hexToRgb(hex);
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Применить акцентный цвет — создаёт динамический <style> с переопределением CSS-переменных
 */
function applyAccentColor(hex) {
    if (!hex) hex = '#ec7441';
    const { r, g, b } = hexToRgb(hex);
    const { h, s, l } = hexToHsl(hex);
    
    let styleEl = document.getElementById('custom-accent-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'custom-accent-style';
        document.head.appendChild(styleEl);
    }
    
    styleEl.textContent = `
        :root {
            --claude-primary: ${hex};
            --accent-rgb: ${r}, ${g}, ${b};
            --claude-light: hsl(${h}, ${Math.round(s * 0.3)}%, 97%);
            --claude-code: hsl(${h}, ${Math.round(s * 0.3)}%, 94%);
            --claude-shadow: rgba(${r}, ${g}, ${b}, 0.3);
            --claude-selection: rgba(${r}, ${g}, ${b}, 0.35);
            --claude-selection-dark: rgba(${r}, ${g}, ${b}, 0.45);
            --claude-dark: hsl(${h}, ${s}%, ${Math.max(l - 15, 10)}%);
            --claude-darker: hsl(${h}, ${s}%, ${Math.max(l - 30, 5)}%);
        }
        .dark {
            --claude-light: hsl(${h}, ${Math.min(Math.round(s * 0.6), 60)}%, 12%);
            --claude-code: hsl(${h}, ${Math.min(Math.round(s * 0.5), 50)}%, 18%);
            --claude-dark: hsl(${h}, ${s}%, ${Math.max(l - 15, 10)}%);
            --claude-darker: hsl(${h}, ${s}%, ${Math.max(l - 30, 5)}%);
        }
    `;
}

/**
 * Установить акцентный цвет (UI handler)
 */
function setAccentColor(hex) {
    const settings = getSettings();
    settings.accentColor = hex;
    saveSettings(settings);
    applyAccentColor(hex);
    updateAccentUI(hex);
    // Обновить waves/squares/grid3d если активны (цвет зависит от акцента)
    const animPatterns = ['waves', 'squares', 'grid3d'];
    if (animPatterns.includes(settings.canvasPattern)) {
        const container = document.querySelector('.workflow-container');
        if (container) {
            _removeWaves(container);
            _removeSquares(container);
            _removeGrid3d(container);
            if (settings.canvasPattern === 'waves') _createWaves(container);
            else if (settings.canvasPattern === 'squares') _createSquares(container);
            else _createGrid3d(container);
        }
    }
}

/**
 * Обновить UI выбора акцентного цвета (кружок с галкой)
 */
function updateAccentUI(hex) {
    document.querySelectorAll('.accent-swatch').forEach(el => {
        el.classList.toggle('active', el.dataset.color === hex);
    });
    const customInput = document.getElementById('accent-custom-input');
    if (customInput) customInput.value = hex;
}

// ═══════════════════════════════════════════════════════════════════════════
// ФОНОВЫЙ ПАТТЕРН CANVAS
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// IndexedDB для хранения изображений (обходит лимит localStorage ~5-10MB)
// ═══════════════════════════════════════════════════════════════════════════

function _openImageDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('apm-images', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('images');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function _saveImage(key, data) {
    const db = await _openImageDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('images', 'readwrite');
        tx.objectStore('images').put(data, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function _loadImage(key) {
    const db = await _openImageDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('images', 'readonly');
        const req = tx.objectStore('images').get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Применить паттерн фона к workflow-container
 */
async function applyCanvasPattern(patternId) {
    const container = document.querySelector('.workflow-container');
    if (!container) return;
    
    // Убираем все классы паттернов и inline фон
    container.classList.remove('pattern-grid', 'pattern-diagonal');
    container.style.backgroundImage = '';
    container.style.backgroundSize = '';
    container.style.backgroundPosition = '';
    container.style.backgroundRepeat = '';
    
    // Убираем waves, squares и grid3d если были
    _removeWaves(container);
    _removeSquares(container);
    _removeGrid3d(container);
    
    if (patternId === 'waves') {
        _createWaves(container);
    } else if (patternId === 'squares') {
        _createSquares(container);
    } else if (patternId === 'grid3d') {
        _createGrid3d(container);
    } else if (patternId === 'custom') {
        try {
            // Пробуем IndexedDB
            let imgData = await _loadImage('canvas-bg');
            // Fallback: мигрируем старые данные из localStorage
            if (!imgData) {
                imgData = localStorage.getItem(STORAGE_KEYS.CUSTOM_CANVAS_IMAGE);
                if (imgData) {
                    await _saveImage('canvas-bg', imgData);
                    localStorage.removeItem(STORAGE_KEYS.CUSTOM_CANVAS_IMAGE);
                }
            }
            if (imgData) {
                container.style.backgroundImage = `url(${imgData})`;
                container.style.backgroundSize = 'cover';
                container.style.backgroundPosition = 'center';
                container.style.backgroundRepeat = 'no-repeat';
            }
        } catch (e) {
            // IndexedDB недоступна — fallback на localStorage
            const imgData = localStorage.getItem(STORAGE_KEYS.CUSTOM_CANVAS_IMAGE);
            if (imgData) {
                container.style.backgroundImage = `url(${imgData})`;
                container.style.backgroundSize = 'cover';
                container.style.backgroundPosition = 'center';
                container.style.backgroundRepeat = 'no-repeat';
            }
        }
    } else if (patternId && patternId !== 'none') {
        container.classList.add(`pattern-${patternId}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// WAVES PATTERN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Создать waves элементы
 */
function _createWaves(container) {
    const wrap = document.createElement('div');
    wrap.className = 'waves-wrap';
    
    const inner = document.createElement('div');
    inner.className = 'waves-inner';
    
    // Цвет волны = акцентный
    const settings = getSettings();
    const hex = settings.accentColor || '#ec7441';
    
    const wave = document.createElement('div');
    wave.className = 'waves-base';
    wave.style.background = hex;
    
    // 3 вращающихся круга с разной скоростью и радиусом
    const speeds = [15, 30, 45];
    const radii = ['45%', '40%', '42.5%'];
    const opacities = [1, 0.5, 0.5];
    
    for (let i = 0; i < 3; i++) {
        const span = document.createElement('div');
        span.className = 'waves-circle';
        span.style.borderRadius = radii[i];
        span.style.opacity = opacities[i];
        span.style.animationDuration = speeds[i] + 's';
        wave.appendChild(span);
    }
    
    inner.appendChild(wave);
    wrap.appendChild(inner);
    container.insertBefore(wrap, container.firstChild);
    container.classList.add('has-animated-bg');
}

/**
 * Удалить waves элементы
 */
function _removeWaves(container) {
    container.querySelector('.waves-wrap')?.remove();
    container.classList.remove('has-animated-bg');
}

// ═══════════════════════════════════════════════════════════════════════════
// SQUARES PATTERN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Создать squares — геометрические квадраты, всплывающие снизу вверх с вращением
 */
function _createSquares(container) {
    const wrap = document.createElement('div');
    wrap.className = 'squares-wrap';
    
    const inner = document.createElement('div');
    inner.className = 'squares-inner';
    
    // 10 квадратов с разными размерами, скоростями, задержками и blur
    const configs = [
        { w: 1,   h: 1,    delay: 0,   duration: 19,  blur: 0 },
        { w: 3,   h: 1.5,  delay: 1,   duration: 34,  blur: 5 },
        { w: 1,   h: 2,    delay: 1.5, duration: 16,  blur: 0 },
        { w: 1.5, h: 1,    delay: 0.5, duration: 26,  blur: 3 },
        { w: 2,   h: 1.25, delay: 4,   duration: 22,  blur: 2 },
        { w: 2,   h: 2.5,  delay: 2,   duration: 18,  blur: 1 },
        { w: 2,   h: 5,    delay: 0,   duration: 24,  blur: 2.5 },
        { w: 3,   h: 1,    delay: 5,   duration: 36,  blur: 6 },
        { w: 2,   h: 1.5,  delay: 0,   duration: 18,  blur: 0.5 },
        { w: 2.4, h: 3,    delay: 6,   duration: 24,  blur: 0.5 }
    ];
    
    configs.forEach(cfg => {
        const sq = document.createElement('div');
        sq.className = 'sq-item';
        sq.style.width = cfg.w + 'em';
        sq.style.height = cfg.h + 'em';
        sq.style.animationDelay = cfg.delay + 's';
        sq.style.animationDuration = cfg.duration + 's';
        if (cfg.blur > 0) sq.style.filter = `blur(${cfg.blur}px)`;
        inner.appendChild(sq);
    });
    
    wrap.appendChild(inner);
    container.insertBefore(wrap, container.firstChild);
    container.classList.add('has-animated-bg');
}

/**
 * Удалить squares
 */
function _removeSquares(container) {
    container.querySelector('.squares-wrap')?.remove();
    container.classList.remove('has-animated-bg');
}

// ═══════════════════════════════════════════════════════════════════════════
// GRID3D PATTERN (MATRIX)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Создать grid3d — 3D перспективная сетка в стиле Tron/Matrix
 * Структура: .grid3d-wrap > .grid3d-inner > .grid3d-plane(x2) + .grid3d-glow(x2)
 * Сетка рендерится через ::before (GPU-анимация), затухание через ::after
 * Glow — статичные элементы с blur (кэшируется GPU, не анимируются)
 */
function _createGrid3d(container) {
    const wrap = document.createElement('div');
    wrap.className = 'grid3d-wrap';
    
    const inner = document.createElement('div');
    inner.className = 'grid3d-inner';
    
    // Нижняя плоскость (пол) — анимированная
    const floor = document.createElement('div');
    floor.className = 'grid3d-plane';
    
    // Верхняя плоскость (потолок) — анимированная
    const ceil = document.createElement('div');
    ceil.className = 'grid3d-plane grid3d-plane-top';
    
    // Glow пола — статичный, с blur (кэшируется)
    const floorGlow = document.createElement('div');
    floorGlow.className = 'grid3d-plane grid3d-glow';
    
    // Glow потолка — статичный, с blur (кэшируется)
    const ceilGlow = document.createElement('div');
    ceilGlow.className = 'grid3d-plane grid3d-plane-top grid3d-glow';
    
    inner.appendChild(floor);
    inner.appendChild(ceil);
    inner.appendChild(floorGlow);
    inner.appendChild(ceilGlow);
    
    wrap.appendChild(inner);
    container.insertBefore(wrap, container.firstChild);
    container.classList.add('has-animated-bg');
    
    // Синхронизируем высоту inner с контейнером (vh ненадёжен при зуме WebView2)
    const syncHeight = () => {
        inner.style.height = container.clientHeight + 'px';
    };
    syncHeight();
    
    if (!container._grid3dObserver) {
        container._grid3dObserver = new ResizeObserver(syncHeight);
        container._grid3dObserver.observe(container);
    }
}

/**
 * Удалить grid3d
 */
function _removeGrid3d(container) {
    container.querySelector('.grid3d-wrap')?.remove();
    container.classList.remove('has-animated-bg');
    if (container._grid3dObserver) {
        container._grid3dObserver.disconnect();
        container._grid3dObserver = null;
    }
}

/**
 * Установить паттерн (UI handler)
 */
function setCanvasPattern(patternId) {
    const settings = getSettings();
    settings.canvasPattern = patternId;
    saveSettings(settings);
    applyCanvasPattern(patternId);
    updatePatternUI(patternId);
}

/**
 * Обновить UI выбора паттерна
 */
function updatePatternUI(patternId) {
    document.querySelectorAll('.pattern-swatch').forEach(el => {
        el.classList.toggle('active', el.dataset.pattern === patternId);
    });
}

/**
 * Загрузка пользовательского изображения для фона canvas
 */
function uploadCanvasImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        document.body.removeChild(input);
        if (!file) return;
        
        // Лимит 20MB (IndexedDB хранит сотни мегабайт)
        if (file.size > 20 * 1024 * 1024) {
            showToast('Изображение слишком большое (макс. 20MB)');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                await _saveImage('canvas-bg', ev.target.result);
                setCanvasPattern('custom');
                showToast('Фон установлен');
            } catch (err) {
                showToast('Ошибка сохранения изображения');
            }
        };
        reader.readAsDataURL(file);
    });
    
    // Fallback — удалить input если пользователь отменил
    input.addEventListener('cancel', () => {
        document.body.removeChild(input);
    });
    
    input.click();
}

// ═══════════════════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ КАСТОМИЗАЦИИ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Применить сохранённые настройки кастомизации при загрузке
 */
function initCustomization() {
    const settings = getSettings();
    applyAccentColor(settings.accentColor);
    applyCanvasPattern(settings.canvasPattern);
}

/**
 * Заполнить UI кастомизации при открытии настроек
 */
function populateCustomizationUI() {
    const settings = getSettings();
    
    // Акцентный цвет — создаём кружки
    const accentContainer = document.getElementById('accent-swatches');
    if (accentContainer && !accentContainer.dataset.init) {
        accentContainer.dataset.init = '1';
        accentContainer.innerHTML = '';
        
        ACCENT_PRESETS.forEach(preset => {
            const swatch = document.createElement('div');
            swatch.className = 'accent-swatch' + (preset.color === settings.accentColor ? ' active' : '');
            swatch.style.backgroundColor = preset.color;
            swatch.dataset.color = preset.color;
            swatch.title = preset.name;
            swatch.addEventListener('click', () => setAccentColor(preset.color));
            accentContainer.appendChild(swatch);
        });
        
        // Кастомный цвет
        const customWrap = document.createElement('div');
        customWrap.className = 'accent-swatch custom-color-wrap';
        customWrap.title = 'Свой цвет';
        const customInput = document.createElement('input');
        customInput.type = 'color';
        customInput.id = 'accent-custom-input';
        customInput.value = settings.accentColor;
        customInput.addEventListener('input', (e) => setAccentColor(e.target.value));
        customWrap.appendChild(customInput);
        const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgEl.setAttribute('viewBox', '0 0 24 24');
        svgEl.setAttribute('fill', 'none');
        svgEl.setAttribute('stroke', 'currentColor');
        svgEl.setAttribute('stroke-width', '2');
        svgEl.innerHTML = '<path d="M12 5v14M5 12h14"/>';
        customWrap.appendChild(svgEl);
        customWrap.addEventListener('click', (e) => {
            if (e.target !== customInput) customInput.click();
        });
        accentContainer.appendChild(customWrap);
    }
    updateAccentUI(settings.accentColor);
    
    // Паттерны — создаём превью
    const patternContainer = document.getElementById('pattern-swatches');
    if (patternContainer && !patternContainer.dataset.init) {
        patternContainer.dataset.init = '1';
        patternContainer.innerHTML = '';
        
        PATTERN_PRESETS.forEach(preset => {
            const swatch = document.createElement('div');
            swatch.className = 'pattern-swatch' + (preset.id === settings.canvasPattern ? ' active' : '');
            swatch.dataset.pattern = preset.id;
            swatch.title = preset.name;
            
            if (preset.id === 'custom') {
                swatch.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`;
                swatch.addEventListener('click', () => uploadCanvasImage());
            } else {
                if (preset.id !== 'none') {
                    // Мини-превью паттерна
                    const inner = document.createElement('div');
                    inner.className = 'pattern-preview pattern-preview-' + preset.id;
                    swatch.appendChild(inner);
                } else {
                    swatch.innerHTML = '<span style="font-size:10px;opacity:0.5">∅</span>';
                }
                swatch.addEventListener('click', () => setCanvasPattern(preset.id));
            }
            
            patternContainer.appendChild(swatch);
        });
    }
    updatePatternUI(settings.canvasPattern);
}

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
// ОФФЛАЙН-РЕЖИМ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Проверить, включён ли оффлайн-режим
 * @returns {boolean}
 */
function isOfflineMode() {
    return getSettings().offlineMode === true;
}

/**
 * Обновить состояние кнопок оффлайн-режима
 * @param {boolean} enabled
 */
function updateOfflineModeButtons(enabled) {
    updateToggleButtons('offline-mode-btn', enabled ? 'offline-mode-on' : 'offline-mode-off');
}

/**
 * Переключить оффлайн-режим
 * @param {boolean} enabled
 */
function setOfflineMode(enabled) {
    const settings = getSettings();
    
    // Идемпотентность: не делаем ничего если значение не изменилось
    if (settings.offlineMode === enabled) return;
    
    settings.offlineMode = enabled;
    saveSettings(settings);
    applyOfflineMode(enabled);
    
    // Перерендерим workflow чтобы кнопки обновились сразу
    if (typeof renderWorkflow === 'function') {
        renderWorkflow();
    }
    
    showToast(enabled 
        ? 'Оффлайн-режим включён. Перезапустите для полного применения.' 
        : 'Оффлайн-режим выключен. Перезапустите для загрузки Claude.'
    );
}

/**
 * Применить оффлайн-режим (CSS-класс на body)
 * @param {boolean} [enabled] - если не передан, берёт из настроек
 */
function applyOfflineMode(enabled) {
    const offline = enabled !== undefined ? enabled : isOfflineMode();
    document.body.classList.toggle('offline-mode', offline);
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-CONTINUE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Обновить состояние кнопок auto-continue
 * @param {boolean} enabled
 */
function updateAutoContinueButtons(enabled) {
    updateToggleButtons('auto-continue-btn', enabled ? 'auto-continue-on' : 'auto-continue-off');
}

/**
 * Переключить auto-continue и синхронизировать с Claude WebView
 * @param {boolean} enabled
 */
function setAutoContinue(enabled) {
    const settings = getSettings();
    settings.autoContinue = enabled;
    saveSettings(settings);
    syncAutoContinueToWebViews(enabled);
    showToast(enabled ? 'Auto-continue включён' : 'Auto-continue выключён');
}

/**
 * Синхронизировать auto-continue во все Claude WebView
 * @param {boolean} enabled
 */
function syncAutoContinueToWebViews(enabled) {
    const script = `if(window._ac)window._ac.setEnabled(${!!enabled})`;
    for (let tab = 1; tab <= 3; tab++) {
        try { evalInClaude(tab, script); } catch(e) {}
    }
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
window.updateOfflineModeButtons = updateOfflineModeButtons;
window.updateThemeButtons = updateThemeButtons;
window.setTheme = setTheme;
window.syncWindowBackground = syncWindowBackground;
window.applyTheme = applyTheme;
window.initThemeListener = initThemeListener;
window.toggleAutoUpdate = toggleAutoUpdate;
window.isOfflineMode = isOfflineMode;
window.setOfflineMode = setOfflineMode;
window.applyOfflineMode = applyOfflineMode;
window.updateAutoContinueButtons = updateAutoContinueButtons;
window.setAutoContinue = setAutoContinue;
window.syncAutoContinueToWebViews = syncAutoContinueToWebViews;
window.applyAccentColor = applyAccentColor;
window.setAccentColor = setAccentColor;
window.applyCanvasPattern = applyCanvasPattern;
window.setCanvasPattern = setCanvasPattern;
window.uploadCanvasImage = uploadCanvasImage;
window.initCustomization = initCustomization;
window.populateCustomizationUI = populateCustomizationUI;
