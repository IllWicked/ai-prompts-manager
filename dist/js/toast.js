/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TOAST NOTIFICATIONS MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Горизонтально стакающиеся тосты: 1 тост = полная ширина,
 * 2+ тостов = делят ширину поровну. Исчезают по цепочке слева направо.
 * 
 * Экспортирует (глобально):
 *   - showToast(message, duration)
 */

const _toasts = [];
const MAX_TOASTS = 3;

function showToast(message = 'Скопировано в буфер', duration = 2000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    // Если уже MAX — выкинуть самый старый мгновенно
    if (_toasts.length >= MAX_TOASTS) {
        _removeToast(_toasts[0], true);
    }
    
    const pill = document.createElement('div');
    pill.className = 'toast-pill';
    const span = document.createElement('span');
    span.textContent = message;
    pill.appendChild(span);
    container.appendChild(pill);
    
    const entry = { pill, timer: null };
    _toasts.push(entry);
    
    entry.timer = setTimeout(() => _removeToast(entry), duration);
}

function _removeToast(entry, instant) {
    const idx = _toasts.indexOf(entry);
    if (idx === -1) return;
    
    clearTimeout(entry.timer);
    _toasts.splice(idx, 1);
    
    if (instant) {
        entry.pill.remove();
        return;
    }
    
    entry.pill.classList.add('exiting');
    entry.pill.addEventListener('animationend', () => entry.pill.remove(), { once: true });
    // Fallback если animationend не сработает
    setTimeout(() => entry.pill.remove(), 400);
}

window.showToast = showToast;
