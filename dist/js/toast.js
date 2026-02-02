/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TOAST NOTIFICATIONS MODULE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Модуль для показа всплывающих уведомлений.
 * 
 * Зависимости:
 *   - DOM элементы: #toast, #toast-text
 * 
 * Экспортирует (глобально):
 *   - showToast(message, duration)
 */

/**
 * Показывает всплывающее уведомление.
 * @param {string} message - Текст уведомления
 * @param {number} duration - Длительность показа в мс (по умолчанию 2000)
 */
function showToast(message = 'Скопировано в буфер', duration = 2000) {
    const toast = document.getElementById('toast');
    const textSpan = document.getElementById('toast-text');
    if (!toast || !textSpan) return;
    
    // Всегда устанавливаем текст явно
    textSpan.textContent = message;
    
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// Экспорт
window.showToast = showToast;
