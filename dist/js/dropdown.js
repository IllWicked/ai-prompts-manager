/**
 * AI Prompts Manager - Dropdown Utilities
 * Унифицированные утилиты для dropdown-меню
 * 
 * Используется в:
 * - tab-selector.js (селектор вкладок)
 * - language-ui.js (селектор языков, меню форм)
 */

const Dropdown = {
    // Зарегистрированные dropdown'ы для взаимного закрытия
    _registered: {},
    
    /**
     * Регистрация dropdown для управления
     * @param {string} id - уникальный ID (например 'tab', 'language')
     * @param {Object} config - { element, closeCallback }
     */
    register(id, config) {
        this._registered[id] = config;
    },
    
    /**
     * Закрыть dropdown по ID
     * @param {string} id - ID dropdown'а для закрытия
     */
    closeById(id) {
        const config = this._registered[id];
        if (config && config.closeCallback) {
            config.closeCallback();
        }
    },
    
    /**
     * Закрыть все dropdown'ы кроме указанного
     * @param {string} exceptId - ID который не закрывать
     */
    closeOthers(exceptId) {
        for (const id in this._registered) {
            if (id !== exceptId) {
                this.closeById(id);
            }
        }
    },
    
    /**
     * Позиционирование подменю впритык к родительскому меню
     * @param {HTMLElement} submenu - элемент подменю
     * @param {HTMLElement} anchorMenu - родительское меню (для позиции по X)
     * @param {HTMLElement} anchorItem - пункт меню (для позиции по Y)
     * @param {HTMLElement} container - контейнер для относительного позиционирования
     * @returns {Object} - { left, top } в пикселях относительно container
     */
    positionSubmenu(submenu, anchorMenu, anchorItem, container) {
        const menuRect = anchorMenu.getBoundingClientRect();
        const itemRect = anchorItem.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Позиционируем вплотную справа от меню, на уровне пункта
        let left = menuRect.right - containerRect.left;
        let top = itemRect.top - containerRect.top;
        
        // Применяем позицию
        submenu.style.position = 'absolute';
        submenu.style.left = left + 'px';
        submenu.style.top = top + 'px';
        
        // Проверяем что влезает на экран (после рендера)
        requestAnimationFrame(() => {
            const submenuRect = submenu.getBoundingClientRect();
            
            // Если не влезает справа - показываем слева
            if (submenuRect.right > window.innerWidth - 10) {
                left = menuRect.left - containerRect.left - submenuRect.width;
                submenu.style.left = left + 'px';
            }
            
            // Если не влезает снизу - поднимаем
            if (submenuRect.bottom > window.innerHeight - 10) {
                top = window.innerHeight - submenuRect.height - containerRect.top - 10;
                submenu.style.top = top + 'px';
            }
        });
        
        return { left, top };
    },
    
    /**
     * Создать разделитель для меню
     * @param {string} className - класс CSS (по умолчанию 'dropdown-separator')
     * @returns {HTMLElement}
     */
    createSeparator(className = 'dropdown-separator') {
        const sep = document.createElement('div');
        sep.className = className;
        return sep;
    },
    
    /**
     * Создать пункт меню
     * @param {Object} options - { text, value, selected, hasSubmenu, onClick }
     * @param {string} className - базовый класс (по умолчанию 'dropdown-option')
     * @returns {HTMLElement}
     */
    createOption(options, className = 'dropdown-option') {
        const { text, value, selected, hasSubmenu, onClick } = options;
        
        const option = document.createElement('div');
        option.className = className;
        if (selected) option.classList.add('selected');
        if (hasSubmenu) option.classList.add('has-submenu');
        if (value !== undefined) option.dataset.value = value;
        
        option.innerHTML = `
            <span class="dropdown-option-text">${text}</span>
            ${hasSubmenu ? `
                <svg class="submenu-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/>
                </svg>
            ` : ''}
        `;
        
        if (onClick) {
            option.addEventListener('click', onClick);
        }
        
        return option;
    }
};

// Экспорт
window.Dropdown = Dropdown;
