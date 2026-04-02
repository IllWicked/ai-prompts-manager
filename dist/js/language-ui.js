/**
 * AI Prompts Manager - Language UI
 * Функции для работы с языковым интерфейсом и переключением языков
 * 
 * @requires languages.js (LANGUAGES, LANGUAGE_COUNTRIES, getLanguageWithCountry, hasCountrySelection, getCountriesForLanguage, generateAdjectiveForms)
 * @requires config.js (STORAGE_KEYS)
 * @requires workflow-render.js (renderWorkflow)
 * @requires toast.js (showToast)
 */

// Текущая выбранная страна для мультигео языков
let currentCountry = null;

// ═══════════════════════════════════════════════════════════════════════════
// ПОЛУЧЕНИЕ АКТИВНЫХ ДАННЫХ ЯЗЫКА
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Получить активные данные языка с учётом выбранной страны
 * @returns {Object} - объект языка
 */
function getActiveLanguageData() {
    if (currentCountry && hasCountrySelection(currentLanguage)) {
        return getLanguageWithCountry(currentLanguage, currentCountry);
    }
    return LANGUAGES[currentLanguage];
}

// ═══════════════════════════════════════════════════════════════════════════
// ВСТАВКА ФОРМ ЯЗЫКА
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Вставка формы языка в textarea блока (для модалки)
 * @param {HTMLTextAreaElement} textarea - элемент textarea
 */
function insertLanguageFormAtCursor(textarea) {
    const langBtn = document.getElementById('modal-lang-btn');
    showLanguageFormMenu(textarea, langBtn);
}

/**
 * Меню выбора формы языка для вставки
 * Унифицированная функция для тулбара и модалки
 * @param {HTMLTextAreaElement} textarea - элемент textarea (опционально)
 * @param {HTMLElement} anchorBtn - кнопка-якорь для позиционирования
 */
function showLanguageFormMenu(textarea, anchorBtn) {
    const langData = getActiveLanguageData();
    if (!langData) return;
    
    // Получаем элементы из DOM
    const dropdown = document.getElementById('lang-form-dropdown');
    const menu = document.getElementById('lang-form-menu');
    const menuInner = document.getElementById('lang-form-menu-inner');
    const submenu = document.getElementById('lang-form-submenu');
    const submenuInner = document.getElementById('lang-form-submenu-inner');
    
    if (!dropdown || !menu) return;
    
    // Закрываем другие dropdown'ы
    Dropdown.closeOthers('lang-form');
    
    // Позиционирование
    if (anchorBtn) {
        const rect = anchorBtn.getBoundingClientRect();
        dropdown.style.left = rect.left + 'px';
        dropdown.style.top = (rect.bottom + 4) + 'px';
    }
    
    // Обновляем содержимое меню
    menuInner.innerHTML = `
        <div class="lang-form-option has-submenu" data-type="lang">
            <span class="lang-form-value">${langData.lang}</span>
            <span class="lang-form-label">язык <svg class="submenu-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></span>
        </div>
        <div class="lang-form-option has-submenu" data-type="native">
            <span class="lang-form-value">${langData.native}</span>
            <span class="lang-form-label">носитель <svg class="submenu-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg></span>
        </div>
        <div class="lang-form-separator"></div>
        <div class="lang-form-option" data-type="country" data-value="${langData.country}">
            <span class="lang-form-value">${langData.country}</span>
            <span class="lang-form-label">страна</span>
        </div>
        <div class="lang-form-option" data-type="locale" data-value="${langData.locale}">
            <span class="lang-form-value">${langData.locale}</span>
            <span class="lang-form-label">код</span>
        </div>
    `;
    
    // Функция закрытия меню
    function closeMenu() {
        menu.classList.add('hidden');
        submenu.classList.add('hidden');
    }
    
    // Функция скрытия подменю
    function hideSubmenu() {
        submenu.classList.add('hidden');
        menuInner.querySelectorAll('.lang-form-option').forEach(o => o.classList.remove('submenu-open'));
    }
    
    // Регистрируем для взаимного закрытия
    Dropdown.register('lang-form', {
        element: dropdown,
        closeCallback: closeMenu
    });
    
    // Функция вставки маркера (или значения для country/locale)
    function insertValue(value) {
        if (textarea) {
            insertTextIntoTextarea(textarea, value, true);
        } else {
            insertTextAtCursor(value);
        }
        closeMenu();
    }
    
    // Функция показа подменю с падежами — вставляет МАРКЕРЫ
    function showCasesSubmenu(type, optionElement) {
        const baseWord = type === 'lang' ? langData.lang : langData.native;
        const forms = generateAdjectiveForms(baseWord);
        
        submenuInner.innerHTML = '';
        
        const genders = [
            { key: 'm', label: 'МУЖСКОЙ РОД' },
            { key: 'f', label: 'ЖЕНСКИЙ РОД' },
            { key: 'n', label: 'СРЕДНИЙ РОД' },
            { key: 'pl', label: 'МНОЖЕСТВЕННОЕ' }
        ];
        
        const cases = [
            { key: 'nom', label: 'именительный' },
            { key: 'gen', label: 'родительный' },
            { key: 'dat', label: 'дательный' },
            { key: 'acc', label: 'винительный' },
            { key: 'ins', label: 'творительный' },
            { key: 'pre', label: 'предложный' }
        ];
        
        for (const gender of genders) {
            const header = document.createElement('div');
            header.className = 'lang-form-submenu-header';
            header.textContent = gender.label;
            submenuInner.appendChild(header);
            
            for (const caseInfo of cases) {
                const formKey = `${caseInfo.key}.${gender.key}`;
                const formValue = forms[formKey];
                if (!formValue) continue;
                
                const marker = `{{${type}:${formKey}}}`;
                
                const option = document.createElement('div');
                option.className = 'lang-form-option';
                option.innerHTML = `
                    <span class="lang-form-value">${formValue}</span>
                    <span class="lang-form-label">${caseInfo.label}</span>
                `;
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    insertValue(marker);
                });
                submenuInner.appendChild(option);
            }
        }
        
        // Позиционирование подменю
        const menuRect = menu.getBoundingClientRect();
        const optRect = optionElement.getBoundingClientRect();
        
        submenu.style.left = menuRect.right + 'px';
        submenu.style.top = optRect.top + 'px';
        submenu.classList.remove('hidden');
        
        // Проверяем что влезает на экран
        requestAnimationFrame(() => {
            const submenuRect = submenu.getBoundingClientRect();
            if (submenuRect.right > window.innerWidth) {
                submenu.style.left = (menuRect.left - submenuRect.width) + 'px';
            }
            if (submenuRect.bottom > window.innerHeight) {
                submenu.style.top = (window.innerHeight - submenuRect.height - 10) + 'px';
            }
        });
    }
    
    // Обработчики событий для пунктов меню
    menuInner.querySelectorAll('.lang-form-option').forEach(option => {
        const type = option.dataset.type;
        const hasSubmenu = option.classList.contains('has-submenu');
        
        if (hasSubmenu) {
            option.addEventListener('mouseenter', () => {
                menuInner.querySelectorAll('.lang-form-option').forEach(o => o.classList.remove('submenu-open'));
                option.classList.add('submenu-open');
                showCasesSubmenu(type, option);
            });
            // Клик на форму с подменю — вставляем маркер именительного мужского рода
            option.addEventListener('click', () => {
                const marker = `{{${type}:nom.m}}`;
                insertValue(marker);
            });
        } else {
            option.addEventListener('mouseenter', () => hideSubmenu());
            option.addEventListener('click', () => {
                // country и locale — вставляем маркеры
                if (type === 'country') {
                    insertValue('{{country}}');
                } else if (type === 'locale') {
                    insertValue('{{locale}}');
                } else {
                    const value = option.dataset.value;
                    if (value) insertValue(value);
                }
            });
        }
    });
    
    // Закрытие подменю при уходе мыши
    dropdown.addEventListener('mouseleave', () => {
        hideSubmenu();
    });
    
    // Показываем меню с анимацией
    // RAF чтобы браузер отрендерил hidden состояние перед анимацией
    requestAnimationFrame(() => {
        menu.classList.remove('hidden');
    });
    
    // Закрытие при клике вне
    function onClickOutside(e) {
        if (!dropdown.contains(e.target)) {
            closeMenu();
            document.removeEventListener('click', onClickOutside);
            if (parentModal) {
                parentModal.removeEventListener('click', onClickOutside);
            }
        }
    }
    // Если меню открыто из модалки — слушаем клики и на модалке
    // (modal-content имеет stopPropagation, поэтому document listener не сработает)
    const parentModal = anchorBtn?.closest('.modal-overlay');
    setTimeout(() => {
        document.addEventListener('click', onClickOutside);
        if (parentModal) {
            parentModal.addEventListener('click', onClickOutside);
        }
    }, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// УВЕДОМЛЕНИЯ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Показывает уведомление о смене языка
 * @param {string} langName - название языка
 * @param {string} [countryName] - название страны (опционально)
 */
function showLanguageToast(langName, countryName) {
    if (countryName) {
        showToast(`Язык: ${langName} (${countryName})`, 2500);
    } else {
        showToast(`Язык изменён: ${langName}`, 2500);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ СЕЛЕКТОРА ЯЗЫКА
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Инициализация селектора языка
 * Создаёт обработчики для dropdown меню выбора языка
 */
function initLanguageSelector() {
    const dropdown = document.getElementById('language-dropdown');
    const btn = document.getElementById('language-btn');
    const btnText = document.getElementById('language-btn-text');
    const menu = document.getElementById('language-menu');
    const options = document.querySelectorAll('.language-option');
    const countrySubmenu = document.getElementById('language-country-submenu');
    const countrySubmenuInner = document.getElementById('language-country-submenu-inner');
    
    // Маппинг значений к текстам
    const langTexts = {
        'bg': 'BG Болгарский',
        'cz': 'CZ Чешский',
        'de': 'DE Немецкий',
        'dk': 'DK Датский',
        'en': 'EN Английский',
        'es': 'ES Испанский',
        'et': 'ET Эстонский',
        'fi': 'FI Финский',
        'ga': 'GA Ирландский',
        'fr': 'FR Французский',
        'gr': 'GR Греческий',
        'hr': 'HR Хорватский',
        'hu': 'HU Венгерский',
        'is': 'IS Исландский',
        'it': 'IT Итальянский',
        'lb': 'LB Люксембургский',
        'lv': 'LV Латышский',
        'nl': 'NL Голландский',
        'no': 'NO Норвежский',
        'pl': 'PL Польский',
        'pt': 'PT Португальский',
        'ro': 'RO Румынский',
        'se': 'SE Шведский',
        'sk': 'SK Словацкий',
        'sl': 'SL Словенский'
    };
    
    // Функция обновления выбранного значения в UI
    function updateSelectedUI(langCode, countryCode = null) {
        let displayText = langTexts[langCode] || langTexts['en'];
        
        // Если есть страна - добавляем её
        if (countryCode && hasCountrySelection(langCode)) {
            const countries = getCountriesForLanguage(langCode);
            const country = countries?.find(c => c.code === countryCode);
            if (country) {
                const langName = LANGUAGES[langCode].lang;
                const capitalizedName = langName.charAt(0).toUpperCase() + langName.slice(1);
                displayText = `${langCode.toUpperCase()} ${capitalizedName} / ${country.name}`;
            }
        }
        
        btnText.textContent = displayText;
        options.forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.value === langCode);
        });
    }
    
    // Функция переключения меню
    let toggleMenu = function() {
        const isOpen = !menu.classList.contains('hidden');
        if (isOpen) {
            closeMenu();
        } else {
            // Закрываем другие dropdown'ы
            Dropdown.closeOthers('language');
            
            menu.classList.remove('hidden');
            dropdown.classList.add('open');
        }
    };
    
    // Функция закрытия меню
    function closeMenu() {
        menu.classList.add('hidden');
        dropdown.classList.remove('open');
        hideCountrySubmenu();
    }
    
    // Регистрируем dropdown для взаимного закрытия
    Dropdown.register('language', {
        element: dropdown,
        closeCallback: closeMenu
    });
    
    // Функция скрытия подменю стран
    function hideCountrySubmenu() {
        if (countrySubmenu) {
            countrySubmenu.classList.add('hidden');
        }
        options.forEach(opt => opt.classList.remove('submenu-open'));
    }
    
    // Функция показа подменю стран
    function showCountrySubmenu(langCode, optionElement) {
        const countries = getCountriesForLanguage(langCode);
        if (!countries || !countrySubmenu || !countrySubmenuInner) return;
        
        countrySubmenuInner.innerHTML = '';
        
        countries.forEach(country => {
            const countryOption = document.createElement('div');
            countryOption.className = 'dropdown-option country-option';
            countryOption.dataset.lang = langCode;
            countryOption.dataset.country = country.code;
            countryOption.textContent = `${country.code.toUpperCase()} ${country.name}`;
            
            if (currentLanguage === langCode && currentCountry === country.code) {
                countryOption.classList.add('selected');
            }
            
            countryOption.addEventListener('click', (e) => {
                e.stopPropagation();
                applyLanguageWithCountry(langCode, country.code);
                closeMenu();
            });
            
            countrySubmenuInner.appendChild(countryOption);
        });
        
        // Позиционируем с помощью Dropdown
        countrySubmenu.classList.remove('hidden');
        Dropdown.positionSubmenu(countrySubmenu, menu, optionElement, dropdown);
        
        options.forEach(opt => opt.classList.remove('submenu-open'));
        optionElement.classList.add('submenu-open');
    }
    
    // Функция применения языка со страной (маркерная система)
    // Маркеры в данных не меняются — меняется только их отображение
    function applyLanguageWithCountry(langCode, countryCode) {
        currentLanguage = langCode;
        currentCountry = countryCode;
        window.currentCountry = countryCode;
        const newData = getActiveLanguageData();
        
        updateSelectedUI(langCode, countryCode);
        localStorage.setItem(STORAGE_KEYS.LANGUAGE, langCode);
        localStorage.setItem(STORAGE_KEYS.CURRENT_COUNTRY, countryCode || '');
        
        // Сохраняем язык в данные текущей вкладки
        saveLanguageToTab(langCode, countryCode);
        
        // Перерендерить — маркеры раскроются в новые значения
        renderWorkflow();
        
        showLanguageToast(newData.lang, newData.country);
    }
    
    // Функция применения языка (для языков без мультигео)
    function applyLanguage(langCode) {
        currentLanguage = langCode;
        currentCountry = hasCountrySelection(langCode) ? getCountriesForLanguage(langCode)[0].code : null;
        window.currentCountry = currentCountry;
        const newData = getActiveLanguageData();
        
        updateSelectedUI(langCode, currentCountry);
        localStorage.setItem(STORAGE_KEYS.LANGUAGE, langCode);
        localStorage.setItem(STORAGE_KEYS.CURRENT_COUNTRY, currentCountry || '');
        
        // Сохраняем язык в данные текущей вкладки
        saveLanguageToTab(langCode, currentCountry);
        
        // Перерендерить — маркеры раскроются в новые значения
        renderWorkflow();
        
        showLanguageToast(newData.lang, currentCountry ? newData.country : null);
    }

    // Инициализация языка
    const savedLang = localStorage.getItem(STORAGE_KEYS.LANGUAGE);
    const savedCountry = localStorage.getItem(STORAGE_KEYS.CURRENT_COUNTRY);
    
    if (savedLang && LANGUAGES[savedLang]) {
        currentLanguage = savedLang;
        currentCountry = savedCountry || (hasCountrySelection(savedLang) ? getCountriesForLanguage(savedLang)[0].code : null);
        window.currentCountry = currentCountry;
        updateSelectedUI(savedLang, currentCountry);
    } else {
        currentLanguage = 'en';
        currentCountry = hasCountrySelection('en') ? getCountriesForLanguage('en')[0].code : null;
        window.currentCountry = currentCountry;
        updateSelectedUI('en', currentCountry);
        localStorage.setItem(STORAGE_KEYS.LANGUAGE, 'en');
        localStorage.setItem(STORAGE_KEYS.CURRENT_COUNTRY, currentCountry || '');
    }
    
    // Обработчик клика на кнопку
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleMenu();
    });
    
    btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
    });
    
    // Обработчики для пунктов меню
    options.forEach(option => {
        const langCode = option.dataset.value;
        const hasSubmenu = option.classList.contains('has-submenu');
        
        if (hasSubmenu) {
            option.addEventListener('mouseenter', () => showCountrySubmenu(langCode, option));
            // Клик на язык с подменю — выбираем первую страну
            option.addEventListener('click', () => {
                const countries = getCountriesForLanguage(langCode);
                if (countries && countries.length > 0) {
                    applyLanguageWithCountry(langCode, countries[0].code);
                }
                closeMenu();
            });
        } else {
            option.addEventListener('mouseenter', () => hideCountrySubmenu());
            option.addEventListener('click', () => {
                applyLanguage(langCode);
                closeMenu();
            });
        }
    });
    
    // Скрываем подменю при уходе с области меню + подменю
    // Используем делегирование - проверяем куда ушла мышка
    document.addEventListener('mousemove', (e) => {
        if (countrySubmenu && !countrySubmenu.classList.contains('hidden')) {
            const isOverMenu = menu.contains(e.target) || e.target === menu;
            const isOverSubmenu = countrySubmenu.contains(e.target) || e.target === countrySubmenu;
            
            if (!isOverMenu && !isOverSubmenu) {
                hideCountrySubmenu();
            }
        }
    });
    
    // Закрытие по клику вне меню
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) {
            closeMenu();
        }
    });
    
    // Сохранить язык в данные текущей вкладки
    function saveLanguageToTab(langCode, countryCode) {
        try {
            const tabs = getAllTabs();
            if (tabs[currentTab]) {
                tabs[currentTab].language = langCode;
                tabs[currentTab].country = countryCode || null;
                saveAllTabs(tabs);
            }
        } catch (e) {
            // Ignore
        }
    }
    
    // Загрузить язык из данных вкладки и обновить селектор
    function detectAndUpdateLanguageFromTab() {
        try {
            const tabs = getAllTabs();
            const tab = tabs[currentTab];
            if (tab && tab.language && LANGUAGES[tab.language]) {
                const langCode = tab.language;
                const countryCode = tab.country || (hasCountrySelection(langCode) ? getCountriesForLanguage(langCode)[0].code : null);
                
                // Обновляем только если язык отличается
                if (langCode !== currentLanguage || countryCode !== currentCountry) {
                    currentLanguage = langCode;
                    currentCountry = countryCode;
                    localStorage.setItem(STORAGE_KEYS.LANGUAGE, langCode);
                    localStorage.setItem(STORAGE_KEYS.CURRENT_COUNTRY, countryCode || '');
                    
                    // Обновляем глобальные переменные
                    window.currentCountry = currentCountry;
                    
                    updateSelectedUI(langCode, countryCode);
                    // Перерендерить маркеры с новым языком
                    renderWorkflow();
                }
                return;
            }
        } catch (e) {
            // Ignore
        }
        
        // Fallback: просто синхронизируем UI
        updateSelectedUI(currentLanguage, currentCountry);
    }
    
    window.detectAndUpdateLanguageFromTab = detectAndUpdateLanguageFromTab;
}

// ═══════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════════════════

window.currentCountry = currentCountry;
window.getActiveLanguageData = getActiveLanguageData;
window.insertLanguageFormAtCursor = insertLanguageFormAtCursor;
window.showLanguageFormMenu = showLanguageFormMenu;
window.showLanguageToast = showLanguageToast;
window.initLanguageSelector = initLanguageSelector;
