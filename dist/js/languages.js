/**
 * AI Prompts Manager - Languages Configuration
 * Языковые данные и автоматическое склонение
 */

// ═══════════════════════════════════════════════════════════════════════════
// СКЛОНЕНИЕ ПРИЛАГАТЕЛЬНЫХ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Получить основу прилагательного (без окончания)
 * английский → английск, англоязычный → англоязычн
 */
function getAdjectiveStem(word) {
    // Убираем окончания -ий, -ый, -ой
    if (word.endsWith('ий') || word.endsWith('ый') || word.endsWith('ой')) {
        return word.slice(0, -2);
    }
    return word;
}

/**
 * Определить тип основы (мягкая или твёрдая)
 * Мягкая: оканчивается на шипящую (ч, щ, ш, ж) или мягкую согласную перед -ий
 */
function isSoftStem(stem) {
    // После шипящих и ц всегда мягкое склонение в прилагательных
    return /[чщшжн]$/.test(stem);
}

/**
 * Генерирует все формы прилагательного
 * @param {string} nominative - именительный падеж м.р. (английский)
 * @returns {Object} - объект со всеми формами
 */
function generateAdjectiveForms(nominative) {
    const stem = getAdjectiveStem(nominative);
    const soft = isSoftStem(stem);
    
    // Выбираем гласные в зависимости от типа основы
    // Для -ский/-цкий всегда используем твёрдые окончания
    const isSkij = stem.endsWith('ск') || stem.endsWith('цк');
    
    let forms;
    
    if (isSkij) {
        // Твёрдое склонение для -ский (английский, немецкий)
        forms = {
            // Мужской род
            'nom.m': stem + 'ий',      // английский
            'gen.m': stem + 'ого',     // английского
            'dat.m': stem + 'ому',     // английскому
            'acc.m': stem + 'ий',      // английский (неодуш.) / английского (одуш.)
            'ins.m': stem + 'им',      // английским
            'pre.m': stem + 'ом',      // английском
            
            // Женский род
            'nom.f': stem + 'ая',      // английская
            'gen.f': stem + 'ой',      // английской
            'dat.f': stem + 'ой',      // английской
            'acc.f': stem + 'ую',      // английскую
            'ins.f': stem + 'ой',      // английской
            'pre.f': stem + 'ой',      // английской
            
            // Средний род
            'nom.n': stem + 'ое',      // английское
            'gen.n': stem + 'ого',     // английского
            'dat.n': stem + 'ому',     // английскому
            'acc.n': stem + 'ое',      // английское
            'ins.n': stem + 'им',      // английским
            'pre.n': stem + 'ом',      // английском
            
            // Множественное число
            'nom.pl': stem + 'ие',     // английские
            'gen.pl': stem + 'их',     // английских
            'dat.pl': stem + 'им',     // английским
            'acc.pl': stem + 'ие',     // английские (неодуш.) / английских (одуш.)
            'ins.pl': stem + 'ими',    // английскими
            'pre.pl': stem + 'их'      // английских
        };
    } else if (soft || nominative.endsWith('ий')) {
        // Мягкое склонение для -ний, -чий и т.д. (англоязычный)
        forms = {
            // Мужской род
            'nom.m': stem + 'ый',      // англоязычный
            'gen.m': stem + 'ого',     // англоязычного
            'dat.m': stem + 'ому',     // англоязычному
            'acc.m': stem + 'ый',      // англоязычный
            'ins.m': stem + 'ым',      // англоязычным
            'pre.m': stem + 'ом',      // англоязычном
            
            // Женский род
            'nom.f': stem + 'ая',      // англоязычная
            'gen.f': stem + 'ой',      // англоязычной
            'dat.f': stem + 'ой',      // англоязычной
            'acc.f': stem + 'ую',      // англоязычную
            'ins.f': stem + 'ой',      // англоязычной
            'pre.f': stem + 'ой',      // англоязычной
            
            // Средний род
            'nom.n': stem + 'ое',      // англоязычное
            'gen.n': stem + 'ого',     // англоязычного
            'dat.n': stem + 'ому',     // англоязычному
            'acc.n': stem + 'ое',      // англоязычное
            'ins.n': stem + 'ым',      // англоязычным
            'pre.n': stem + 'ом',      // англоязычном
            
            // Множественное число
            'nom.pl': stem + 'ые',     // англоязычные
            'gen.pl': stem + 'ых',     // англоязычных
            'dat.pl': stem + 'ым',     // англоязычным
            'acc.pl': stem + 'ые',     // англоязычные
            'ins.pl': stem + 'ыми',    // англоязычными
            'pre.pl': stem + 'ых'      // англоязычных
        };
    } else {
        // Твёрдое склонение по умолчанию
        forms = {
            'nom.m': stem + 'ый',
            'gen.m': stem + 'ого',
            'dat.m': stem + 'ому',
            'acc.m': stem + 'ый',
            'ins.m': stem + 'ым',
            'pre.m': stem + 'ом',
            'nom.f': stem + 'ая',
            'gen.f': stem + 'ой',
            'dat.f': stem + 'ой',
            'acc.f': stem + 'ую',
            'ins.f': stem + 'ой',
            'pre.f': stem + 'ой',
            'nom.n': stem + 'ое',
            'gen.n': stem + 'ого',
            'dat.n': stem + 'ому',
            'acc.n': stem + 'ое',
            'ins.n': stem + 'ым',
            'pre.n': stem + 'ом',
            'nom.pl': stem + 'ые',
            'gen.pl': stem + 'ых',
            'dat.pl': stem + 'ым',
            'acc.pl': stem + 'ые',
            'ins.pl': stem + 'ыми',
            'pre.pl': stem + 'ых'
        };
    }
    
    return forms;
}

/**
 * Получить все уникальные формы слова (для поиска)
 * @param {string} nominative - именительный падеж
 * @returns {string[]} - массив уникальных форм
 */
function getAllWordForms(nominative) {
    const forms = generateAdjectiveForms(nominative);
    return [...new Set(Object.values(forms))];
}

/**
 * Определить форму слова (падеж и род) по окончанию
 * @param {string} word - слово в любой форме
 * @param {string} nominative - базовая форма (им.п. м.р.)
 * @returns {string|null} - ключ формы (nom.m, gen.f, etc.) или null
 */
function detectWordForm(word, nominative) {
    const forms = generateAdjectiveForms(nominative);
    
    for (const [key, form] of Object.entries(forms)) {
        if (form.toLowerCase() === word.toLowerCase()) {
            return key;
        }
    }
    return null;
}

/**
 * Преобразовать слово из одной базовой формы в другую, сохраняя падеж/род
 * @param {string} word - исходное слово (например "английского")
 * @param {string} fromBase - базовая форма исходного (английский)
 * @param {string} toBase - базовая форма целевого (немецкий)
 * @returns {string} - преобразованное слово (немецкого)
 */
function transformWord(word, fromBase, toBase) {
    const formKey = detectWordForm(word, fromBase);
    if (!formKey) return null;
    
    const toForms = generateAdjectiveForms(toBase);
    return toForms[formKey] || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// КОНФИГУРАЦИЯ СТРАН (для мультигео)
// ═══════════════════════════════════════════════════════════════════════════

const LANGUAGE_COUNTRIES = {
    en: [
        { code: 'us', name: 'США', locale: 'en-US' },
        { code: 'gb', name: 'Великобритания', locale: 'en-GB' },
        { code: 'ca', name: 'Канада', locale: 'en-CA' },
        { code: 'au', name: 'Австралия', locale: 'en-AU' },
        { code: 'nz', name: 'Новая Зеландия', locale: 'en-NZ' }
    ],
    de: [
        { code: 'de', name: 'Германия', locale: 'de-DE' },
        { code: 'at', name: 'Австрия', locale: 'de-AT' },
        { code: 'ch', name: 'Швейцария', locale: 'de-CH' }
    ],
    fr: [
        { code: 'fr', name: 'Франция', locale: 'fr-FR' },
        { code: 'ca', name: 'Канада', locale: 'fr-CA' },
        { code: 'ch', name: 'Швейцария', locale: 'fr-CH' },
        { code: 'be', name: 'Бельгия', locale: 'fr-BE' }
    ],
    nl: [
        { code: 'nl', name: 'Нидерланды', locale: 'nl-NL' },
        { code: 'be', name: 'Бельгия', locale: 'nl-BE' }
    ],
    pt: [
        { code: 'pt', name: 'Португалия', locale: 'pt-PT' },
        { code: 'br', name: 'Бразилия', locale: 'pt-BR' }
    ]
};

// ═══════════════════════════════════════════════════════════════════════════
// КОНФИГУРАЦИЯ ЯЗЫКОВ (упрощённая)
// ═══════════════════════════════════════════════════════════════════════════

const LANGUAGES = {
    en: {
        lang: 'английский',
        native: 'англоязычный',
        country: 'Великобритания',
        locale: 'en-GB',
        privacyPolicy: 'Privacy Policy',
        aboutUs: 'About Us',
        legalInfo: 'Legal Information',
        cookiePolicy: 'Cookie Policy',
    },
    de: {
        lang: 'немецкий',
        native: 'немецкоязычный',
        country: 'Германия',
        locale: 'de-DE',
        privacyPolicy: 'Datenschutzerklärung',
        aboutUs: 'Über uns',
        legalInfo: 'Impressum',
        cookiePolicy: 'Cookie-Richtlinie',
    },
    es: {
        lang: 'испанский',
        native: 'испаноязычный',
        country: 'Испания',
        locale: 'es-ES',
        privacyPolicy: 'Política de privacidad',
        aboutUs: 'Sobre nosotros',
        legalInfo: 'Información legal',
        cookiePolicy: 'Política de cookies',
    },
    it: {
        lang: 'итальянский',
        native: 'италоязычный',
        country: 'Италия',
        locale: 'it-IT',
        privacyPolicy: 'Informativa sulla privacy',
        aboutUs: 'Chi siamo',
        legalInfo: 'Informazioni legali',
        cookiePolicy: 'Informativa sui cookie',
    },
    fr: {
        lang: 'французский',
        native: 'франкоязычный',
        country: 'Франция',
        locale: 'fr-FR',
        privacyPolicy: 'Politique de confidentialité',
        aboutUs: 'À propos de nous',
        legalInfo: 'Mentions légales',
        cookiePolicy: 'Politique de cookies',
    },
    nl: {
        lang: 'голландский',
        native: 'голландскоязычный',
        country: 'Нидерланды',
        locale: 'nl-NL',
        privacyPolicy: 'Privacybeleid',
        aboutUs: 'Over ons',
        legalInfo: 'Juridische informatie',
        cookiePolicy: 'Cookiebeleid',
    },
    pl: {
        lang: 'польский',
        native: 'польскоязычный',
        country: 'Польша',
        locale: 'pl-PL',
        privacyPolicy: 'Polityka prywatności',
        aboutUs: 'O nas',
        legalInfo: 'Informacje prawne',
        cookiePolicy: 'Polityka cookies',
    },
    cz: {
        lang: 'чешский',
        native: 'чешскоязычный',
        country: 'Чехия',
        locale: 'cs-CZ',
        privacyPolicy: 'Zásady ochrany osobních údajů',
        aboutUs: 'O nás',
        legalInfo: 'Právní informace',
        cookiePolicy: 'Zásady používání cookies',
    },
    pt: {
        lang: 'португальский',
        native: 'португалоязычный',
        country: 'Португалия',
        locale: 'pt-PT',
        privacyPolicy: 'Política de Privacidade',
        aboutUs: 'Sobre nós',
        legalInfo: 'Informações legais',
        cookiePolicy: 'Política de Cookies',
    },
    dk: {
        lang: 'датский',
        native: 'датскоязычный',
        country: 'Дания',
        locale: 'da-DK',
        privacyPolicy: 'Privatlivspolitik',
        aboutUs: 'Om os',
        legalInfo: 'Juridisk information',
        cookiePolicy: 'Cookiepolitik',
    },
    gr: {
        lang: 'греческий',
        native: 'грекоязычный',
        country: 'Греция',
        locale: 'el-GR',
        privacyPolicy: 'Πολιτική Απορρήτου',
        aboutUs: 'Σχετικά με εμάς',
        legalInfo: 'Νομικές πληροφορίες',
        cookiePolicy: 'Πολιτική Cookies',
    },
    no: {
        lang: 'норвежский',
        native: 'норвежскоязычный',
        country: 'Норвегия',
        locale: 'nb-NO',
        privacyPolicy: 'Personvernpolicy',
        aboutUs: 'Om oss',
        legalInfo: 'Juridisk informasjon',
        cookiePolicy: 'Informasjonskapsler',
    },
    hu: {
        lang: 'венгерский',
        native: 'венгероязычный',
        country: 'Венгрия',
        locale: 'hu-HU',
        privacyPolicy: 'Adatvédelmi irányelvek',
        aboutUs: 'Rólunk',
        legalInfo: 'Jogi információk',
        cookiePolicy: 'Cookie szabályzat',
    },
    fi: {
        lang: 'финский',
        native: 'финноязычный',
        country: 'Финляндия',
        locale: 'fi-FI',
        privacyPolicy: 'Tietosuojakäytäntö',
        aboutUs: 'Tietoa meistä',
        legalInfo: 'Oikeudelliset tiedot',
        cookiePolicy: 'Evästekäytäntö',
    },
    sk: {
        lang: 'словацкий',
        native: 'словацкоязычный',
        country: 'Словакия',
        locale: 'sk-SK',
        privacyPolicy: 'Zásady ochrany osobných údajov',
        aboutUs: 'O nás',
        legalInfo: 'Právne informácie',
        cookiePolicy: 'Zásady používania cookies',
    },
    sl: {
        lang: 'словенский',
        native: 'словеноязычный',
        country: 'Словения',
        locale: 'sl-SI',
        privacyPolicy: 'Politika zasebnosti',
        aboutUs: 'O nas',
        legalInfo: 'Pravne informacije',
        cookiePolicy: 'Politika piškotkov',
    },
    hr: {
        lang: 'хорватский',
        native: 'хорватскоязычный',
        country: 'Хорватия',
        locale: 'hr-HR',
        privacyPolicy: 'Politika privatnosti',
        aboutUs: 'O nama',
        legalInfo: 'Pravne informacije',
        cookiePolicy: 'Politika kolačića',
    },
    se: {
        lang: 'шведский',
        native: 'шведскоязычный',
        country: 'Швеция',
        locale: 'sv-SE',
        privacyPolicy: 'Integritetspolicy',
        aboutUs: 'Om oss',
        legalInfo: 'Juridisk information',
        cookiePolicy: 'Cookiepolicy',
    },
    bg: {
        lang: 'болгарский',
        native: 'болгароязычный',
        country: 'Болгария',
        locale: 'bg-BG',
        privacyPolicy: 'Политика за поверителност',
        aboutUs: 'За нас',
        legalInfo: 'Правна информация',
        cookiePolicy: 'Политика за бисквитки',
    },
    ro: {
        lang: 'румынский',
        native: 'румыноязычный',
        country: 'Румыния',
        locale: 'ro-RO',
        privacyPolicy: 'Politica de confidențialitate',
        aboutUs: 'Despre noi',
        legalInfo: 'Informații legale',
        cookiePolicy: 'Politica de cookies',
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Получить данные языка с учётом выбранной страны
 */
function getLanguageWithCountry(langCode, countryCode) {
    const baseLang = LANGUAGES[langCode];
    if (!baseLang) return null;
    
    const countries = LANGUAGE_COUNTRIES[langCode];
    if (!countries) return baseLang;
    
    const country = countries.find(c => c.code === countryCode);
    if (!country) return baseLang;
    
    return {
        ...baseLang,
        country: country.name,
        locale: country.locale
    };
}

/**
 * Проверить, есть ли у языка выбор стран
 */
function hasCountrySelection(langCode) {
    return !!LANGUAGE_COUNTRIES[langCode];
}

/**
 * Получить список стран для языка
 */
function getCountriesForLanguage(langCode) {
    return LANGUAGE_COUNTRIES[langCode] || null;
}

/**
 * Найти язык по любой форме слова
 * @param {string} word - слово в любом падеже
 * @returns {{langCode: string, type: 'lang'|'native'}|null}
 */
function findLanguageByWord(word) {
    const wordLower = word.toLowerCase();
    
    for (const [langCode, langData] of Object.entries(LANGUAGES)) {
        // Проверяем формы lang
        const langForms = getAllWordForms(langData.lang);
        if (langForms.some(f => f.toLowerCase() === wordLower)) {
            return { langCode, type: 'lang' };
        }
        
        // Проверяем формы native
        const nativeForms = getAllWordForms(langData.native);
        if (nativeForms.some(f => f.toLowerCase() === wordLower)) {
            return { langCode, type: 'native' };
        }
    }
    
    return null;
}

/**
 * Получить все формы для языка (для поиска в тексте)
 * @param {string} langCode - код языка
 * @returns {string[]} - все формы lang + native
 */
function getAllLanguageForms(langCode) {
    const langData = LANGUAGES[langCode];
    if (!langData) return [];
    
    return [
        ...getAllWordForms(langData.lang),
        ...getAllWordForms(langData.native)
    ];
}

// ═══════════════════════════════════════════════════════════════════════════
// МЕТКИ ДЛЯ UI (формы для меню вставки)
// ═══════════════════════════════════════════════════════════════════════════

const CASE_LABELS = {
    'nom': 'именительный',
    'gen': 'родительный',
    'dat': 'дательный',
    'acc': 'винительный',
    'ins': 'творительный',
    'pre': 'предложный'
};

const GENDER_LABELS = {
    'm': 'м.р.',
    'f': 'ж.р.',
    'n': 'ср.р.',
    'pl': 'мн.ч.'
};

/**
 * Получить человекочитаемую метку для формы
 * @param {string} formKey - ключ формы (nom.m, gen.f, etc.)
 * @returns {string}
 */
function getFormLabel(formKey) {
    const [caseName, gender] = formKey.split('.');
    return `${CASE_LABELS[caseName]} ${GENDER_LABELS[gender]}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ОБРАТНАЯ СОВМЕСТИМОСТЬ
// Старые ключи для поддержки существующего кода
// ═══════════════════════════════════════════════════════════════════════════

const LANG_FORM_LABELS_GLOBAL = {
    lang: 'язык',
    native: 'носитель',
    country: 'страна',
    locale: 'код'
};

// ═══════════════════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════════════════════════

window.LANGUAGES = LANGUAGES;
window.LANGUAGE_COUNTRIES = LANGUAGE_COUNTRIES;
window.LANG_FORM_LABELS_GLOBAL = LANG_FORM_LABELS_GLOBAL;
window.CASE_LABELS = CASE_LABELS;
window.GENDER_LABELS = GENDER_LABELS;

// Функции склонения
window.generateAdjectiveForms = generateAdjectiveForms;
window.getAllWordForms = getAllWordForms;
window.detectWordForm = detectWordForm;
window.transformWord = transformWord;
window.getAdjectiveStem = getAdjectiveStem;

// Функции работы с языками
window.getLanguageWithCountry = getLanguageWithCountry;
window.hasCountrySelection = hasCountrySelection;
window.getCountriesForLanguage = getCountriesForLanguage;
window.findLanguageByWord = findLanguageByWord;
window.getAllLanguageForms = getAllLanguageForms;
window.getFormLabel = getFormLabel;
