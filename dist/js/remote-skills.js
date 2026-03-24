/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REMOTE SKILLS MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Скачивание .skill файлов с GitHub и привязка к аккаунту Claude.
 * Одно действие: скачать → привязать. Без проверки версий.
 * 
 * Функции:
 *   - refreshAndBindSkills(onStatus) - скачать с GitHub + привязать к Claude
 */

// ═══════════════════════════════════════════════════════════════════════════
// КОНФИГУРАЦИЯ
// ═══════════════════════════════════════════════════════════════════════════

const REMOTE_SKILLS_CONFIG = {
    BASE_URL: 'https://raw.githubusercontent.com/IllWicked/ai-prompts-manager/main/skills',
    FETCH_TIMEOUT: 15000
};

// ═══════════════════════════════════════════════════════════════════════════
// СКАЧИВАНИЕ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch с таймаутом
 */
async function fetchSkillWithTimeout(url, timeout = REMOTE_SKILLS_CONFIG.FETCH_TIMEOUT) {
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
 * Загружает манифест скиллов с GitHub
 */
async function fetchSkillsManifest() {
    try {
        const url = `${REMOTE_SKILLS_CONFIG.BASE_URL}/manifest.json`;
        const response = await fetchSkillWithTimeout(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    } catch (e) {
        console.error('[RemoteSkills] Failed to fetch manifest:', e);
        return null;
    }
}

/**
 * Скачивает один .skill файл как base64
 */
async function fetchSkillFile(filename) {
    try {
        const url = `${REMOTE_SKILLS_CONFIG.BASE_URL}/${filename}`;
        const response = await fetchSkillWithTimeout(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    } catch (e) {
        console.error(`[RemoteSkills] Failed to fetch "${filename}":`, e);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ОСНОВНАЯ ФУНКЦИЯ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Скачивает скиллы с GitHub и привязывает к аккаунту Claude.
 * @param {function} [onStatus] - колбэк (message)
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function refreshAndBindSkills(onStatus) {
    // 1. Скачиваем манифест
    if (onStatus) onStatus('Манифест...');
    const manifest = await fetchSkillsManifest();
    if (!manifest?.skills?.length) {
        return { success: false, message: 'Не удалось загрузить манифест' };
    }
    
    // 2. Скачиваем все .skill файлы
    const skills = {};
    for (let i = 0; i < manifest.skills.length; i++) {
        const skill = manifest.skills[i];
        if (onStatus) onStatus(`${i + 1}/${manifest.skills.length}...`);
        const base64 = await fetchSkillFile(skill.file);
        if (base64) {
            skills[skill.name] = base64;
        }
    }
    
    const downloaded = Object.keys(skills).length;
    if (downloaded === 0) {
        return { success: false, message: 'Не удалось скачать скиллы' };
    }
    
    // 3. Привязываем к Claude
    if (typeof uploadSkillsToClaude !== 'function') {
        return { success: false, message: 'Claude WebView не готов' };
    }
    
    // Кладём в localStorage для uploadSkillsToClaude (getCachedSkills читает оттуда)
    localStorage.setItem('remote-skills-data', JSON.stringify(skills));
    
    if (onStatus) onStatus('Привязка...');
    const result = await uploadSkillsToClaude((current, total, name) => {
        if (onStatus) onStatus(`Привязка ${current}/${total}...`);
    });
    
    // Чистим — не нужен, при следующем нажатии скачаем заново
    localStorage.removeItem('remote-skills-data');
    
    if (result.success) {
        return { success: true, message: `✓ Скиллы привязаны (${result.uploaded}/${result.total})` };
    } else if (result.uploaded > 0) {
        return { success: false, message: `⚠ Привязано ${result.uploaded}/${result.total}` };
    } else {
        return { success: false, message: result.errors?.[0] || 'Ошибка привязки' };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Читает кэшированные скиллы из localStorage
 * Используется в uploadSkillsToClaude (claude-api.js)
 */
function getCachedSkills() {
    try {
        const cached = localStorage.getItem('remote-skills-data');
        return cached ? JSON.parse(cached) : {};
    } catch (e) {
        return {};
    }
}

window.refreshAndBindSkills = refreshAndBindSkills;
window.getCachedSkills = getCachedSkills;
