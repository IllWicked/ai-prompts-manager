/**
 * AI Prompts Manager - Modals
 * Базовые функции для работы с модальными окнами
 */

// Закрыть все модальные окна
function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.remove('open');
    });
}

// Generic hide modal helper
function hideModal(modalId) {
    document.getElementById(modalId)?.classList.remove('open');
}

// --- МОДАЛКА УВЕДОМЛЕНИЙ ---

function showAlert(message, title = 'Уведомление') {
    closeAllModals();
    const modal = document.getElementById('alert-modal');
    const titleEl = document.getElementById('alert-title');
    const messageEl = document.getElementById('alert-message');
    
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (modal) modal.classList.add('open');
}

const hideAlert = () => hideModal('alert-modal');

// --- МОДАЛЬНОЕ ОКНО СБРОСА ---

/**
 * Показывает модальное окно сброса
 */
function showResetModal() {
    closeAllModals();
    const modal = document.getElementById('reset-modal');
    if (modal) {
        modal.classList.add('open');
    }
}

/**
 * Скрывает модальное окно сброса
 */
const hideResetModal = () => hideModal('reset-modal');

// --- МОДАЛЬНОЕ ОКНО ПОДТВЕРЖДЕНИЯ РЕЖИМА РЕДАКТИРОВАНИЯ ---

function showEditModeConfirmModal() {
    closeAllModals();
    const modal = document.getElementById('edit-mode-confirm-modal');
    if (modal) modal.classList.add('open');
}

const hideEditModeConfirmModal = () => hideModal('edit-mode-confirm-modal');
