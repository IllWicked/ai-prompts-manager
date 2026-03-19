# Встроенные скрипты и языки

[← Назад к Frontend](../02-FRONTEND.md)

## embedded-scripts.js

Встроенные Python-скрипты для прикрепления к блокам.

### Структура

```javascript
const EMBEDDED_SCRIPTS = {
    convert: {
        name: 'convert.py',             // Имя файла
        label: 'Конвертация (HTML-merge)', // Метка в UI
        badge: 'C',                     // Буква для бейджа
        content: `...`                  // Содержимое скрипта (~690 строк)
    },
    count: {
        name: 'count.py',
        label: 'Подсчёт слов (MD/HTML)',
        badge: 'W',
        content: `...`
    }
};
```

### convert.py (HTML-merge, ~690 строк)

**Назначение:** Мерж content.html + design.html → index.html для пайплайнов с data-content блоками.

**Вход:** `content.html` + `design.html` → `index.html`

**Пайплайн (5 пост-мерж шагов):**
1. `fix_all_component_structures` — автоматический фикс структурных расхождений (сравнение дочерних `<div>` по CSS-классам)
2. `convert_data_component_to_class` — конвертация `data-component="X"` → `class="X"` по пулу классов design
3. `convert_faq_to_details` — FAQ: `div+h3` (schema.org) → `details+summary` если design использует accordion
4. `restore_preserved_elements` — `data-preserve` поддержка: предупреждение о потерянных элементах
5. `merge_semantic_attrs` — перенос семантических атрибутов (`itemscope`, `itemprop`, `role`, `aria-label`, `data-*`) с content open-tags на результат

**Дополнительно:**
- Мерж innerHTML каждого `data-content` блока из content в design
- Восстановление структурных (пустых) div-ов из design
- Валидация дубликатов data-content id
- Pre-merge и post-merge диагностика

**Использование:**
```bash
python convert.py                              # content.html + design.html → index.html
python convert.py content.html design.html     # явные пути
python convert.py src.html tpl.html out.html   # произвольные имена
```

### count.py

**Назначение:** Подсчёт слов в Markdown и HTML файлах (только видимый текст).

**Что убирается:**
- **MD:** Markdown-разметка (ссылки, изображения, форматирование, заголовки, маркеры списков, блоки кода)
- **HTML:** `<style>`, `<script>` блоки, HTML-комментарии, все теги, HTML-сущности

**Поддерживаемые форматы:** `.md`, `.html`, `.htm`

**Использование:**
```bash
python count.py file.md
python count.py file.html
python count.py *.md *.html
```

**Выход:**
```
article.md: 1523 слов
index.html: 2105 слов
```

---


---

## languages.js

Языковые данные и автоматическое склонение для замены в промптах.

### Архитектура

Система использует **автоматическое склонение** русских прилагательных. Для каждого языка хранятся только базовые формы (именительный падеж м.р.):

```javascript
const LANGUAGES = {
    en: {
        lang: 'английский',      // склоняется автоматически
        native: 'англоязычный',  // склоняется автоматически  
        country: 'Великобритания', // название страны (без склонения)
        locale: 'en-GB',         // код локали (BCP 47)
        privacyPolicy: 'Privacy Policy',
        aboutUs: 'About Us',
        legalInfo: 'Legal Information',
        cookiePolicy: 'Cookie Policy'
    },
    // ... ещё 19 языков
};

// Конфигурация стран для мультигео языков
const LANGUAGE_COUNTRIES = {
    en: [
        { code: 'us', name: 'США', locale: 'en-US' },
        { code: 'gb', name: 'Великобритания', locale: 'en-GB' },
        { code: 'ca', name: 'Канада', locale: 'en-CA' },
        { code: 'au', name: 'Австралия', locale: 'en-AU' },
        { code: 'nz', name: 'Новая Зеландия', locale: 'en-NZ' },
        { code: 'ie', name: 'Ирландия', locale: 'en-IE' },
        { code: 'et', name: 'Эфиопия', locale: 'en-ET' }
    ],
    de: [...],  // Германия, Австрия, Швейцария, Бельгия
    fr: [...],  // Франция, Канада, Швейцария, Бельгия
    nl: [...],  // Нидерланды, Бельгия
    pt: [...]   // Португалия, Бразилия
};
```

### Функции склонения

| Функция | Описание |
|---------|----------|
| `generateAdjectiveForms(word)` | Генерирует все 24 формы (6 падежей × 4 рода) |
| `getAdjectiveStem(word)` | Извлечение основы прилагательного |
| `isSoftStem(stem)` | Проверка мягкой основы |

```javascript
// Пример: генерация форм
generateAdjectiveForms('английский');
// → { 'nom.m': 'английский', 'gen.m': 'английского', 'pre.m': 'английском',
//     'nom.f': 'английская', 'gen.f': 'английской', ... }
```

### Функции маркерной системы (v4.3.0+)

| Функция | Описание |
|---------|----------|
| `resolveMarker(type, form, langCode, countryCode)` | Раскрытие одного маркера в текст |
| `resolveMarkersToText(text, langCode, countryCode)` | Раскрытие всех маркеров в тексте для отправки в Claude |
| `renderMarkedContent(text, langCode, countryCode)` | Рендеринг маркеров в HTML с подсветкой (view mode) |
| `hasLanguageMarkers(text)` | Проверка наличия маркеров `{{...}}` в тексте |
| `stripFieldMarkers(text)` | Удаление служебных маркеров полей `{{FIELD:...}}` |
| `escapeHtmlForMarkers(str)` | XSS-безопасное экранирование для рендеринга маркеров |

```javascript
// Раскрытие маркеров перед отправкой
resolveMarkersToText('для {{native:gen.f}} аудитории', 'en', 'us');
// → 'для англоязычной аудитории'

// Проверка наличия маркеров
hasLanguageMarkers('текст {{lang:nom.m}}');  // true
hasLanguageMarkers('обычный текст');          // false
```

### Поддерживаемые языки (20)

| Код | Язык | Страна | Код | Язык | Страна |
|-----|------|--------|-----|------|--------|
| `en` | Английский | 🌍 7 стран | `hu` | Венгерский | Венгрия |
| `de` | Немецкий | 🌍 4 страны | `ro` | Румынский | Румыния |
| `es` | Испанский | Испания | `hr` | Хорватский | Хорватия |
| `it` | Итальянский | Италия | `sl` | Словенский | Словения |
| `fr` | Французский | 🌍 4 страны | `no` | Норвежский | Норвегия |
| `nl` | Голландский | 🌍 2 страны | `dk` | Датский | Дания |
| `pl` | Польский | Польша | `fi` | Финский | Финляндия |
| `cz` | Чешский | Чехия | `se` | Шведский | Швеция |
| `sk` | Словацкий | Словакия | `gr` | Греческий | Греция |
| `pt` | Португальский | 🌍 2 страны | `bg` | Болгарский | Болгария |

🌍 — языки с поддержкой нескольких стран (мультигео)

### Мультигео языки

Для 5 языков доступен выбор страны через подменю:

| Язык | Страны (по умолчанию первая) |
|------|------------------------------|
| EN Английский | США, Великобритания, Канада, Австралия, Новая Зеландия, Ирландия, Эфиопия |
| DE Немецкий | Германия, Австрия, Швейцария, Бельгия |
| FR Французский | Франция, Канада, Швейцария, Бельгия |
| NL Голландский | Нидерланды, Бельгия |
| PT Португальский | Португалия, Бразилия |

При выборе страны меняются поля `country` и `locale`.

### Поля языка

| Ключ | Описание | Пример (en) |
|------|----------|-------------|
| `lang` | Прилагательное языка (склоняется) | английский |
| `native` | "Носитель языка" (склоняется) | англоязычный |
| `country` | Название страны | Великобритания |
| `locale` | Код локали (BCP 47) | en-GB |

### Вспомогательные функции

```javascript
// Получить данные языка с учётом страны
getLanguageWithCountry('en', 'us');
// → { lang: 'английский', native: 'англоязычный', country: 'США', 
//     locale: 'en-US', ... }

// Проверить, есть ли у языка выбор стран
hasCountrySelection('en');  // true
hasCountrySelection('pl');  // false

// Получить список стран для языка
getCountriesForLanguage('en');
// → [{ code: 'us', name: 'США', locale: 'en-US' }, 
//    { code: 'gb', name: 'Великобритания', locale: 'en-GB' }, ...]
```

### Связанные функции

В `language-ui.js`:
- `currentCountry` — текущая выбранная страна (глобальная переменная)
- `getActiveLanguageData()` — получить данные языка с учётом текущей страны
- `showLanguageFormMenu(textarea, anchorBtn)` — меню вставки форм с подменю падежей

### Меню вставки форм

Унифицированное меню для кнопки "Язык" в тулбаре и модалке редактирования.

**Структура:**
- Основное меню: `lang`, `native`, `country`, `locale`
- Подменю (для `lang` и `native`): 24 формы сгруппированные по родам (м.р., ж.р., ср.р., мн.ч.)
- Внутри рода: 6 падежей (им., род., дат., вин., тв., пр.)

**HTML элементы** (в конце body):
- `#lang-form-dropdown` — контейнер (position: fixed)
- `#lang-form-menu` — основное меню
- `#lang-form-submenu` — подменю с падежами

**CSS классы:**
- `.lang-form-menu` — основное меню
- `.lang-form-submenu` — подменю с падежами
- `.lang-form-option` — пункт меню
- `.lang-form-submenu-header` — заголовок группы (род)
- `.dropdown-animated` — унифицированная анимация
- `.hidden` — скрытое состояние

**Поведение:**
- Клик на пункт с подменю вставляет именительный падеж мужского рода
- Подменю не пересоздаётся, переиспользуется

---

## Прикрепление скриптов к блоку

### UI

1. ПКМ по блоку → "Добавить инструкцию"
2. Выбрать скрипт (convert, count)
3. Бейдж появится на блоке

### Хранение

```javascript
// localStorage: block-scripts
{
    "block-123": ["convert", "count"],
}
```

### При отправке в Claude

```javascript
// claude-api.js
await attachAllFiles(tab, scripts, files);
// Создаёт временные файлы и прикрепляет через attach_file_to_claude
```

---

## Связанные документы

- [CLAUDE-API.md](CLAUDE-API.md) — отправка блоков с файлами
- [04-CLAUDE.md](../04-CLAUDE.md) — интеграция с Claude
