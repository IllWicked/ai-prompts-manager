/**
 * AI Prompts Manager - Language UI
 * Функции для работы с языковым интерфейсом и переключением языков
 * 
 * @requires languages.js (LANGUAGES, LANGUAGE_COUNTRIES, getLanguageWithCountry, hasCountrySelection, getCountriesForLanguage, generateAdjectiveForms, getAllWordForms, transformWord, findLanguageByWord)
 * @requires config.js (STORAGE_KEYS)
 * @requires tabs.js (getTabBlocks, getTabItems)
 * @requires storage.js (getAllTabs, saveAllTabs)
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
// ДЕТЕКТИРОВАНИЕ ЯЗЫКА
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Определяет язык из конкретного текста
 * Ищет любую форму (любой падеж/род) слов lang и native
 * @param {string} text - текст для анализа
 * @returns {string|null} - код языка или null если не определён
 */
function detectLanguageInText(text) {
    const textLower = text.toLowerCase();
    
    // Проверяем все языки
    for (const [langCode, langData] of Object.entries(LANGUAGES)) {
        // Проверяем все формы lang (английский, английского, английском...)
        const langForms = getAllWordForms(langData.lang);
        for (const form of langForms) {
            if (textLower.includes(form.toLowerCase())) {
                return langCode;
            }
        }
        
        // Проверяем все формы native (англоязычный, англоязычного...)
        const nativeForms = getAllWordForms(langData.native);
        for (const form of nativeForms) {
            if (textLower.includes(form.toLowerCase())) {
                return langCode;
            }
        }
        
        // Проверяем название страны
        if (langData.country && textLower.includes(langData.country.toLowerCase())) {
            return langCode;
        }
        
        // Проверяем технические страницы (уникальные для каждого языка)
        if (langData.privacyPolicy && langData.privacyPolicy !== 'Privacy Policy' && text.includes(langData.privacyPolicy)) {
            return langCode;
        }
    }
    
    return null;
}

/**
 * Найти ВСЕ языки в тексте (для проверки конфликтов внутри одного блока)
 * @param {string} text - текст для анализа
 * @returns {string[]} - массив кодов языков
 */
function detectAllLanguagesInText(text) {
    const foundLangs = new Set();
    const textLower = text.toLowerCase();
    
    for (const [langCode, langData] of Object.entries(LANGUAGES)) {
        // Проверяем все формы lang
        const langForms = getAllWordForms(langData.lang);
        const hasLangForm = langForms.some(form => textLower.includes(form.toLowerCase()));
        
        // Проверяем все формы native  
        const nativeForms = getAllWordForms(langData.native);
        const hasNativeForm = nativeForms.some(form => textLower.includes(form.toLowerCase()));
        
        // Проверяем страну
        const hasCountry = langData.country && textLower.includes(langData.country.toLowerCase());
        
        if (hasLangForm || hasNativeForm || hasCountry) {
            foundLangs.add(langCode);
        }
    }
    
    return [...foundLangs];
}

/**
 * Определяет язык из текста промптов (первый блок)
 * @returns {string} - код языка (по умолчанию 'en')
 */
function detectLanguageFromText() {
    // Определяем язык из первого блока
    const blocks = getTabBlocks(currentTab);
    if (blocks.length > 0 && blocks[0].content) {
        const detected = detectLanguageInText(blocks[0].content);
        return detected || 'en';
    }
    return 'en';
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
    
    // Функция вставки текста
    function insertValue(value) {
        if (textarea) {
            insertTextIntoTextarea(textarea, value, true);
        } else {
            insertTextAtCursor(value);
        }
        closeMenu();
    }
    
    // Функция показа подменю с падежами
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
                
                const option = document.createElement('div');
                option.className = 'lang-form-option';
                option.innerHTML = `
                    <span class="lang-form-value">${formValue}</span>
                    <span class="lang-form-label">${caseInfo.label}</span>
                `;
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    insertValue(formValue);
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
            // Клик на форму с подменю — вставляем первый падеж (именительный мужского рода)
            option.addEventListener('click', () => {
                const baseWord = type === 'lang' ? langData.lang : langData.native;
                const forms = generateAdjectiveForms(baseWord);
                const firstForm = forms['nom.m']; // именительный мужского рода
                if (firstForm) {
                    insertValue(firstForm);
                }
            });
        } else {
            option.addEventListener('mouseenter', () => hideSubmenu());
            option.addEventListener('click', () => {
                const value = option.dataset.value;
                if (value) insertValue(value);
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
        }
    }
    setTimeout(() => {
        document.addEventListener('click', onClickOutside);
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
        'fi': 'FI Финский',
        'fr': 'FR Французский',
        'gr': 'GR Греческий',
        'hr': 'HR Хорватский',
        'hu': 'HU Венгерский',
        'it': 'IT Итальянский',
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
    
    // Функция замены языка с объектами данных
    // Заменяет формы исходного языка на формы целевого языка
    function replaceLanguageWithData(text, fromLangCode, toLangData) {
        if (!fromLangCode || !toLangData) return text;
        let result = text;
        
        const baseLang = LANGUAGES[fromLangCode];
        if (!baseLang) return text;
        
        // Функция замены с сохранением регистра первой буквы
        function replacePreservingCase(text, fromWord, toWord) {
            const escaped = fromWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return text.replace(new RegExp(escaped, 'gi'), (match) => {
                if (match[0] === match[0].toUpperCase()) {
                    return toWord[0].toUpperCase() + toWord.slice(1);
                }
                return toWord;
            });
        }
        
        // Технические страницы
        if (baseLang.privacyPolicy && toLangData.privacyPolicy) {
            result = result.split(baseLang.privacyPolicy).join(toLangData.privacyPolicy);
        }
        if (baseLang.aboutUs && toLangData.aboutUs) {
            result = result.split(baseLang.aboutUs).join(toLangData.aboutUs);
        }
        if (baseLang.legalInfo && toLangData.legalInfo) {
            result = result.split(baseLang.legalInfo).join(toLangData.legalInfo);
        }
        if (baseLang.cookiePolicy && toLangData.cookiePolicy) {
            result = result.split(baseLang.cookiePolicy).join(toLangData.cookiePolicy);
        }
        
        // Замена названия страны
        if (baseLang.country && toLangData.country && baseLang.country !== toLangData.country) {
            result = result.split(baseLang.country).join(toLangData.country);
        }
        
        // Замена кода локали
        if (baseLang.locale && toLangData.locale && baseLang.locale !== toLangData.locale) {
            result = result.split(baseLang.locale).join(toLangData.locale);
        }
        
        // Также заменяем названия стран из LANGUAGE_COUNTRIES
        const countries = LANGUAGE_COUNTRIES[fromLangCode];
        if (countries) {
            for (const country of countries) {
                if (country.name && toLangData.country && country.name !== toLangData.country) {
                    result = result.split(country.name).join(toLangData.country);
                }
                // Заменяем также локали из списка стран
                if (country.locale && toLangData.locale && country.locale !== toLangData.locale) {
                    result = result.split(country.locale).join(toLangData.locale);
                }
            }
        }
        
        // Замена форм lang (английский → немецкий) с автоопределением падежа
        const fromLangForms = getAllWordForms(baseLang.lang);
        for (const form of fromLangForms) {
            const transformed = transformWord(form, baseLang.lang, toLangData.lang);
            if (transformed) {
                result = replacePreservingCase(result, form, transformed);
            }
        }
        
        // Замена форм native (англоязычный → немецкоязычный) с автоопределением падежа
        const fromNativeForms = getAllWordForms(baseLang.native);
        for (const form of fromNativeForms) {
            const transformed = transformWord(form, baseLang.native, toLangData.native);
            if (transformed) {
                result = replacePreservingCase(result, form, transformed);
            }
        }
        
        return result;
    }
    
    // Функция применения языка со страной
    function applyLanguageWithCountry(langCode, countryCode) {
        const oldLangCode = currentLanguage;
        currentLanguage = langCode;
        currentCountry = countryCode;
        const newData = getActiveLanguageData();
        
        updateSelectedUI(langCode, countryCode);
        localStorage.setItem(STORAGE_KEYS.LANGUAGE, langCode);
        localStorage.setItem(STORAGE_KEYS.CURRENT_COUNTRY, countryCode || '');
        
        const items = getTabItems(currentTab);
        let changed = false;
        items.forEach(item => {
            if (item.type === 'block' && item.content) {
                const newContent = replaceLanguageWithData(item.content, oldLangCode, newData);
                if (newContent !== item.content) {
                    item.content = newContent;
                    changed = true;
                }
            }
        });
        
        if (changed) {
            const allTabs = getAllTabs();
            allTabs[currentTab].items = items;
            saveAllTabs(allTabs);
            renderWorkflow();
        }
        
        showLanguageToast(newData.lang, newData.country);
    }
    
    // Функция применения языка (для языков без мультигео)
    function applyLanguage(langCode) {
        const oldLangCode = currentLanguage;
        currentLanguage = langCode;
        currentCountry = hasCountrySelection(langCode) ? getCountriesForLanguage(langCode)[0].code : null;
        const newData = getActiveLanguageData();
        
        updateSelectedUI(langCode, currentCountry);
        localStorage.setItem(STORAGE_KEYS.LANGUAGE, langCode);
        localStorage.setItem(STORAGE_KEYS.CURRENT_COUNTRY, currentCountry || '');
        
        const items = getTabItems(currentTab);
        let changed = false;
        items.forEach(item => {
            if (item.type === 'block' && item.content) {
                const newContent = replaceLanguageWithData(item.content, oldLangCode, newData);
                if (newContent !== item.content) {
                    item.content = newContent;
                    changed = true;
                }
            }
        });
        
        if (changed) {
            const allTabs = getAllTabs();
            allTabs[currentTab].items = items;
            saveAllTabs(allTabs);
            renderWorkflow();
        }
        
        showLanguageToast(newData.lang, currentCountry ? newData.country : null);
    }

    // Инициализация языка
    const savedLang = localStorage.getItem(STORAGE_KEYS.LANGUAGE);
    const savedCountry = localStorage.getItem(STORAGE_KEYS.CURRENT_COUNTRY);
    
    if (savedLang && LANGUAGES[savedLang]) {
        currentLanguage = savedLang;
        currentCountry = savedCountry || (hasCountrySelection(savedLang) ? getCountriesForLanguage(savedLang)[0].code : null);
        updateSelectedUI(savedLang, currentCountry);
    } else {
        const textLang = detectLanguageFromText();
        currentLanguage = textLang;
        currentCountry = hasCountrySelection(textLang) ? getCountriesForLanguage(textLang)[0].code : null;
        updateSelectedUI(textLang, currentCountry);
        localStorage.setItem(STORAGE_KEYS.LANGUAGE, textLang);
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
    
    // Функция определения и обновления языка из текущей вкладки
    function detectAndUpdateLanguageFromTab() {
        const blocks = getTabBlocks(currentTab);
        
        if (blocks.length === 0) {
            currentLanguage = 'en';
            currentCountry = hasCountrySelection('en') ? getCountriesForLanguage('en')[0].code : null;
            updateSelectedUI('en', currentCountry);
            localStorage.setItem(STORAGE_KEYS.LANGUAGE, 'en');
            localStorage.setItem(STORAGE_KEYS.CURRENT_COUNTRY, currentCountry || '');
            return;
        }
        
        // Собираем все уникальные формы языков (используя новую систему)
        const allLanguageForms = new Set();
        for (const [langCode, langData] of Object.entries(LANGUAGES)) {
            // Добавляем все формы lang
            getAllWordForms(langData.lang).forEach(f => allLanguageForms.add(f.toLowerCase()));
            // Добавляем все формы native
            getAllWordForms(langData.native).forEach(f => allLanguageForms.add(f.toLowerCase()));
            // Добавляем страну
            if (langData.country) allLanguageForms.add(langData.country.toLowerCase());
        }
        // Добавляем названия стран из LANGUAGE_COUNTRIES
        for (const countries of Object.values(LANGUAGE_COUNTRIES)) {
            for (const country of countries) {
                if (country.name) allLanguageForms.add(country.name.toLowerCase());
            }
        }
        
        const blockLanguages = [];
        const problematicBlocks = [];
        
        for (const block of blocks) {
            if (!block.content) continue;
            
            const contentLower = block.content.toLowerCase();
            const hasLanguageForms = [...allLanguageForms].some(form => 
                contentLower.includes(form)
            );
            
            if (!hasLanguageForms) continue;
            
            const allLangsInBlock = detectAllLanguagesInText(block.content);
            if (allLangsInBlock.length > 1) {
                problematicBlocks.push(block.title || `Блок ${block.number}`);
                continue;
            }
            
            const lang = detectLanguageInText(block.content);
            if (lang) {
                blockLanguages.push({ block, lang });
            } else {
                problematicBlocks.push(block.title || `Блок ${block.number}`);
            }
        }
        
        const uniqueLangs = [...new Set(blockLanguages.map(b => b.lang))];
        
        if (uniqueLangs.length === 0 && problematicBlocks.length === 0) {
            currentLanguage = 'en';
            currentCountry = hasCountrySelection('en') ? getCountriesForLanguage('en')[0].code : null;
            updateSelectedUI('en', currentCountry);
            localStorage.setItem(STORAGE_KEYS.LANGUAGE, 'en');
            localStorage.setItem(STORAGE_KEYS.CURRENT_COUNTRY, currentCountry || '');
            return;
        }
        
        if (uniqueLangs.length === 0 && problematicBlocks.length > 0) {
            showToast(`Ошибка языка в: ${problematicBlocks.join(', ')}`, 4000);
            currentLanguage = 'en';
            currentCountry = hasCountrySelection('en') ? getCountriesForLanguage('en')[0].code : null;
            updateSelectedUI('en', currentCountry);
            return;
        }
        
        if (uniqueLangs.length > 1) {
            const mainLang = uniqueLangs[0];
            const conflictBlocks = blockLanguages
                .filter(b => b.lang !== mainLang)
                .map(b => b.block.title || `Блок ${b.block.number}`);
            showToast(`Конфликт языков в: ${conflictBlocks.join(', ')}`, 4000);
        }
        
        if (problematicBlocks.length > 0) {
            showToast(`Ошибка языка в: ${problematicBlocks.join(', ')}`, 4000);
        }
        
        const detectedLang = uniqueLangs[0];
        currentLanguage = detectedLang;
        currentCountry = hasCountrySelection(detectedLang) ? getCountriesForLanguage(detectedLang)[0].code : null;
        updateSelectedUI(detectedLang, currentCountry);
        localStorage.setItem(STORAGE_KEYS.LANGUAGE, detectedLang);
        localStorage.setItem(STORAGE_KEYS.CURRENT_COUNTRY, currentCountry || '');
    }
    
    window.detectAndUpdateLanguageFromTab = detectAndUpdateLanguageFromTab;
}

// ═══════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════════════════

window.currentCountry = currentCountry;
window.getActiveLanguageData = getActiveLanguageData;
window.detectLanguageInText = detectLanguageInText;
window.detectAllLanguagesInText = detectAllLanguagesInText;
window.detectLanguageFromText = detectLanguageFromText;
window.insertLanguageFormAtCursor = insertLanguageFormAtCursor;
window.showLanguageFormMenu = showLanguageFormMenu;
window.showLanguageToast = showLanguageToast;
window.initLanguageSelector = initLanguageSelector;
