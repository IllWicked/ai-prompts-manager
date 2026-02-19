# Changelog

[← Назад к INDEX](../INDEX.md)

Все значимые изменения проекта документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

---

## [4.2.13] - 2026-02-19 {#v4213}

### Исправления

#### Импорт вкладки не сбрасывает метаданные блоков (#15)
- **Баг:** При экспорте вкладки со снятыми метками скриптов (или collapsed/automation) и последующем импорте с перезаписью — старые метки восстанавливались из localStorage
- **Причина:** Импорт перезаписывал данные вкладки в `tabs`, но не очищал `blockScripts`, `collapsedBlocks` и `blockAutomation` для блоков этой вкладки. Новые значения добавлялись поверх старых, а при отсутствии в JSON — старые оставались
- **Исправление:** Перед импортом метаданных — полная очистка `blockScripts`, `collapsedBlocks`, `blockAutomation` для всех блоков импортируемой вкладки, затем запись новых значений из JSON

#### Toolbar и менеджер загрузок могли перекрываться Claude webview (#16)
- **Баг:** При пересоздании Claude webview (recreate, reset) toolbar мог оказаться под ним — z-order в Tauri определяется порядком создания
- **Причина:** `ensure_claude_webview` вызывал `ensure_toolbar` (создаёт только если не существует), не поднимая z-order существующего toolbar. Также `drop(_guard)` создавал окно для race condition
- **Исправление:** Выделена `create_claude_webview` (без пересоздания toolbar) для батчевых операций. Startup и reset используют её + один `ensure/recreate_toolbar` в конце. Одиночные операции используют `ensure_claude_webview` с автоматическим пересозданием. Startup: 0 recreate вместо 2. Reset: 1 recreate вместо 3

### Затронутые файлы
`export-import.js`, `webview/manager.rs`, `webview/mod.rs`, `commands/claude.rs`, `main.rs`

---

## [4.2.12] - 2026-02-18 {#v4212}

### Исправления

#### Undo после удаления блока теряет позицию (#13)
- **Баг:** После удаления блока и нажатия Ctrl+Z блок восстанавливался в позиции (0,0) — левый верхний угол за пределами холста
- **Причина:** Позиция блока удалялась из `workflowPositions` до создания undo-snapshot

#### Undo/Redo система переписана с нуля (#14)
- **Проблемы v1:** двойные записи (одно действие → 2-3 snapshot), откат по 2 шага, snapshot из localStorage (неконсистентный), debounce 500ms не привязан к действиям, redo мог ломаться из-за debounced save после undo, 6+ файлов напрямую манипулировали стеками
- **Решение:** Command-based архитектура — snapshot создаётся один раз перед каждым действием пользователя. Save-функции (`saveAllTabs`, `saveWorkflowState`, `saveToLocalStorage`) больше не триггерят undo
- **UndoManager API:** единый модуль с методами `snapshot(force)`, `undo()`, `redo()`, `init()`, `switchTab()`, `renameTab()`, `deleteTab()`, `isRestoring`
- **Snapshot из памяти:** состояние захватывается из глобальных переменных и кэша `getAllTabs()` через `structuredClone`, а не парсится из localStorage
- **Debounce только для набора текста:** деструктивные операции (удаление, вставка, переименование) — принудительный snapshot; набор текста — debounce 1s; blur — force-snapshot (граница редактирования)
- **Autosave не создаёт лишних записей:** `saveBlockContent` пропускает snapshot если контент не изменился
- **Убран параметр `skipUndo`** из `saveAllTabs()`, `saveWorkflowState()`, `removeItemFromTab()`

### Точки snapshot (действия пользователя)

| Действие | Файл |
|---|---|
| Удаление блоков (Del/кнопка) | init.js, workflow-render.js |
| Создание блока (+) | init.js |
| Вставка блоков (Ctrl+V) | init.js |
| Перемещение стрелками | init.js |
| Drag (начало перемещения) | workflow-render.js |
| Resize (начало ресайза) | workflow-render.js |
| Редактирование текста (blur/debounce) | workflow-render.js |
| Сохранение модалки | workflow-render.js |
| Создание/удаление соединения | connections.js |
| Переименование блока | context-menu.js |
| Dynamic input (применение) | dynamic-input.js |
| Изменение instruction | tabs.js |
| Изменение chatTab | edit-helpers.js |
| Изменение аттачментов | attachments.js |
| Смена языка | language-ui.js |

### Затронутые файлы (15)

`undo.js` (перезапись), `storage.js`, `workflow-state.js`, `persistence.js`, `tabs.js`, `init.js`, `workflow-render.js`, `workflow-interactions.js`, `connections.js`, `context-menu.js`, `dynamic-input.js`, `tab-selector.js`, `edit-helpers.js`, `attachments.js`, `language-ui.js` + cleanup в `block-ui.js`, `export-import.js`, `remote-prompts.js`

---

## [4.2.11] - 2026-02-17 {#v4211}

### Исправления

#### Ложное срабатывание детекции языка на подстроках (#12)
- **Баг:** Тост «Ошибка языка в: Pillar — дизайн» при открытии вкладки с промптами, не содержащими языковых форм
- **Причина:** `detectAllLanguagesInText()` и `detectLanguageInText()` использовали `String.includes()` для поиска названий стран — подстрока «дания» находилась внутри слов «создания», «основания», «издания», «здания», «задания»
- **Исправление:** Добавлена функция `includesWholeWord()` с Unicode-aware проверкой границ слов через `\p{L}` (т.к. стандартный `\b` не работает с кириллицей). Заменены все `includes()` в функциях детекции языка на `includesWholeWord()`
- **Затронутые файлы:** `dist/js/language-ui.js`

---

## [4.2.10] - 2026-02-13 {#v4210}

### Исправления

#### isAdminMode double declaration (#4)
- Убрано дублирование `let isAdminMode` в index.html:823 — `defineProperty` в app-state.js уже создаёт глобальный алиас

#### Zoom scroll conflict (#2)
- Canvas wrapper получает размер `canvasSize * zoom` в edit mode
- `maxScroll` в wheel и pan обработчиках учитывает `workflowZoom`

#### Project unblocking after finishProject (#9)
- `updateWorkflowChatButtons()` теперь снимает/ставит `project-restricted` класс на collapsed нодах

#### Dynamic Input field limit (#10)
- Лимит кастомных полей увеличен 4 → 10 (скролл уже работал через `modal-scroll-area`)

#### Lang form menu в модалке (#7)
- `onClickOutside` listener теперь вешается и на `.modal-overlay` (обход `stopPropagation` на `.modal-content`)

#### Toolbar исчезает при recreate (#6)
- `recreate_claude_tab` вызывает `recreate_toolbar()` после создания webview для восстановления z-order

#### Generation blocking (#1)
- Early return в `sendNodeToClaude` при `generatingTabs[targetTab]`
- Кнопки чатов получают `disabled` атрибут при генерации (expanded + collapsed)
- CSS `.workflow-node-btn.primary:disabled`

#### Chat tabs redesign (#8)
- Кнопки чатов переделаны в равноширинные табы (`flex: 1`, `border-bottom` indicator вместо `background`)
- Убраны gap, border-radius, фоновый цвет у неактивных табов

### Новые возможности

#### Marquee selection (#3)
- Left click + drag на пустом месте в edit mode → прямоугольник выделения нод
- Ctrl + drag → добавление к текущему выделению
- Space + drag → panning (перенесено с обычного левого клика)
- Средняя кнопка → panning (без изменений)
- CSS: `#marquee-selection-rect` с dashed border цвета claude-primary

### Обновления скриптов (#11)

#### convert.py → unified (895 строк)
- Объединён старый (MD → HTML) и новый (HTML-merge v3.1) в один скрипт
- Автоопределение: `content.html` + `design.html` → ACTUAL, иначе → LEGACY
- Флаги `--actual` / `--legacy` для принудительного режима
- ACTUAL: мерж data-content блоков, авто-фикс структурных div, data-component → class, FAQ details/summary, data-preserve
- LEGACY: без изменений (pillar/clusters, scoring языков)

#### count.py
- Добавлена `clean_html()` для подсчёта слов в HTML файлах
- Поддержка `.html`, `.htm` в дополнение к `.md`

#### spellcheck.py
- `clean_markdown()` → `clean_markup()`: убирает и HTML-теги, и MD-разметку
- Поддержка `.html` файлов

#### Документация
- Обновлён EMBEDDED-SCRIPTS.md (convert.py unified, count.py MD/HTML, spellcheck.py MD/HTML)

## [4.2.5] - 2026-02-06 {#v425}

### Исправления

#### Race condition при сбросе/загрузке промптов
- **Баг:** После сброса (особенно авто-сброса при обновлении) ломалась вёрстка промптов — collapsed блоки отображались развёрнутыми, позиции съезжали
- **Причина 1:** `performReset()` не сбрасывал `_tabsCache` — после очистки localStorage `getAllTabs()` возвращал старые данные из кэша, новые вкладки мержились со старыми
- **Причина 2:** Двойной вызов `loadPrompts()`/`initTabSelector()` — сначала из `applyPromptsUpdate()`, затем из `initApp()`, второй рендер перетирал первый в середине `requestAnimationFrame`
- **Исправление:** Добавлен `setTabsCache(null)` в `performReset()`, добавлен параметр `skipReload` в `applyPromptsUpdate()` для предотвращения двойного рендера

### UI

#### Адаптивные кнопки футера workflow нод
- **Было:** При сужении ноды текст кнопок обрезался до многоточия («Ред...», «Ч...»)
- **Стало:** Кнопка «Редактировать» при сужении показывает иконку + «Ред.», затем только иконку карандаша; кнопки чатов скрывают слово «Чат», оставляя стрелку и номер
- Реализовано через CSS container queries на `.workflow-node`

### Контент

#### Новые локали
- Английский для Ирландии (`en-IE`)
- Немецкий для Бельгии (`de-BE`)

### Инструменты

#### Project Manager — обновление версии в документации
- `update_app_version()` теперь обновляет `docs/INDEX.md` (паттерн `**Версия:** X.Y.Z`)
- Количество обновляемых файлов: 3 → 4 (tauri.conf.json, Cargo.toml, index.html, docs/INDEX.md)

---

## [4.2.3] - 2026-02-02 {#v423}

### Исправления

#### Race condition при создании toolbar/downloads webview
- **Баг:** При запуске приложения возникала ошибка `a webview with label 'downloads' already exists`, которая приводила к рассинхронизации UI Claude
- **Причина:** `ensure_toolbar` и `recreate_toolbar` могли выполняться параллельно из разных потоков
- **Исправление:** Добавлен мьютекс `TOOLBAR_CREATION_LOCK` для синхронизации создания toolbar/downloads

#### Оптимизация создания webview при старте
- `ensure_claude_webview` теперь вызывает `ensure_toolbar` вместо `recreate_toolbar`
- `recreate_toolbar` вызывается один раз после создания всех Claude webview
- Увеличена задержка в `recreate_toolbar` до 50ms + проверка закрытия webview

#### Унификация логики сброса
- **Баг:** Авто-сброс (при обновлении версии) и ручной сброс (Reset All) имели разную логику
- **Исправление:** Создана общая функция `performReset(options)` в persistence.js
- Теперь оба типа сброса очищают одинаковые данные (вкладки, workflow, блоки, Claude настройки)
- Различие только в опциях: `reloadPage` и `callRustCommands`

### UI

#### Светлая тема — улучшение контрастности
- Хедер (`--bg-header`): `#dcdcde` → `#e2e2e5` (светлее, но отличается от основного фона)
- Ресайзер панели теперь заметен (добавлены переменные `--bg-resizer`, `--bg-resizer-hover`)

### Рефакторинг

- `confirmReset()` перенесена из settings.js в persistence.js
- Добавлена общая функция `performReset(options)` для унификации сброса
- Добавлен `TOOLBAR_CREATION_LOCK` в state.rs

### Документация

- Обновлена документация по сбросу в DATA-MIGRATIONS.md

---

## [4.2.2] - 2026-02-02 {#v422}

### Исправления

#### Сброс приложения — сохранение Claude табов
- **Баг:** При ручном сбросе (Reset All) исчезали Чат 2 и Чат 3
- **Причина:** `reset_claude_state` закрывал webview, но не пересоздавал их
- **Исправление:** Теперь все 3 webview пересоздаются вместо закрытия

#### Автоматизация — ожидание загрузки страницы
- **Баг:** Флаги P (новый проект) и N (новый чат) не работали если страница Claude не загрузилась
- **Причина:** WebView2 не загружает страницу пока webview за пределами экрана
- **Исправление:** Добавлено `waitForClaudeInput()` перед выполнением автоматизаций

#### Claude Tabs — единый URL при старте
- Все 3 таба теперь создаются с URL `claude.ai/new` (раньше табы 2-3 были на `about:blank`)

### UI

#### Индикатор проекта — унификация стиля
- Индикатор активного проекта теперь белый как в кнопке селектора, так и в выбранной вкладке списка

### Удалено (очистка мёртвого кода)

#### Динамическое количество чатов
Раньше чаты можно было добавлять/удалять. Теперь всегда 3 чата.

**Удалённые функции:**
- `closeClaudeTab()` (JS)
- `addNewChatTab()` (JS)
- `close_claude_tab` (Rust command)

**Удалённые переменные:**
- `existingTabs` — больше не нужна, всегда `[1, 2, 3]`

**Удалённые CSS:**
- `.claude-add-btn` — кнопка "+" 
- `.claude-tab-btn.visible` — логика показа табов

### Документация

- Обновлена документация по Claude Tabs в 04-CLAUDE.md

---

## [4.2.0] - 2026-01-31 {#v420}

### Основные изменения

#### Claude Tabs — preload при старте
Все три таба создаются при старте приложения:
- Таб 1 загружается на `claude.ai/new`
- Табы 2 и 3 создаются с `about:blank`, загружаются при первом переключении
- Убраны кнопка "+" и крестики закрытия
- Решает проблему случайного зависания WebView2 при создании webview "на лету"

**Новые команды:**
- `recreate_claude_tab` — пересоздание зависшего webview
- `toolbar_recreate` — двойной клик на reload в toolbar пересоздаёт webview

#### Accordion-меню вкладок
Полностью переработан селектор вкладок: вместо выпадающих подменю (submenu) теперь используются раскрывающиеся группы (accordion).

**Было:** Hover на группу → подменю справа (неинтуитивно, терялся курсор)
**Стало:** Клик на группу → раскрывающийся список внутри меню

**Структура меню:**
```
┌─────────────────────────┐
│ .tab-menu-list          │ ← Скроллируемый (max 5 пунктов)
│   ├─ BETTING ▶ (3)      │ ← Группа (клик раскрывает)
│   │    ├─ BETTING       │
│   │    ├─ PILLAR        │
│   │    └─ CLUSTERS      │
│   └─ SOLO-TAB           │
├─────────────────────────┤
│ .tab-menu-actions       │ ← Кнопки (только Admin Mode)
└─────────────────────────┘
```

**Особенности:**
- Группы раскрываются/сворачиваются по клику
- Счётчик вкладок в группе (круглый бейдж)
- Группа с текущей вкладкой автораскрыта
- Максимум 5 видимых пунктов, далее скролл
- Автоскролл к выбранной вкладке

**Удалено:**
- `tab-submenu-container` — больше не нужен
- `showSubmenu()` — заменён на accordion-логику
- CSS классы `.submenu-open`, `.in-selected-path`

**Добавлено:**
- CSS классы `.tab-group`, `.tab-group-header`, `.tab-group-content`, `.tab-group-count`
- Класс `.tab-group-header.contains-selected` — группа содержит выбранную вкладку

#### Унифицированная система языков с автосклонением
Полностью переработана система языков: автоматическое склонение прилагательных вместо ручного хранения падежей.

**Было:** 7 полей на язык (name, genitive, prepositional, adjective, adjectivePlural, segment, segmentAudience)
**Стало:** 5 полей (lang, native, country, locale, localeShort) + автоматическое склонение

**Новая архитектура:**
```javascript
en: {
    lang: 'английский',      // автосклонение → 24 формы
    native: 'англоязычный',  // автосклонение → 24 формы
    country: 'Великобритания',
    locale: 'en-GB',         // код локали полный (BCP 47)
    localeShort: 'en'        // код локали короткий
}
```

**Функции склонения:**
- `generateAdjectiveForms(word)` — генерирует все 24 формы (6 падежей × 4 рода)
- `getAllWordForms(word)` — уникальные формы для поиска
- `transformWord(word, fromBase, toBase)` — преобразует с сохранением падежа

**Преимущества:**
- Детекция работает для ЛЮБОЙ формы слова (не нужно угадывать падеж)
- Замена автоматически сохраняет падеж и регистр первой буквы
- Меньше данных, проще добавлять языки

#### Мультигео система
5 языков с поддержкой выбора страны:
- EN Английский → США, Великобритания, Канада, Австралия, Новая Зеландия
- DE Немецкий → Германия, Австрия, Швейцария  
- FR Французский → Франция, Канада, Швейцария, Бельгия
- NL Голландский → Нидерланды, Бельгия
- PT Португальский → Португалия, Бразилия

При выборе страны меняются `country` (название) и `locale` (код).

→ [05-FEATURES.md](../05-FEATURES.md#language-detection-system) | [frontend/EMBEDDED-SCRIPTS.md](../frontend/EMBEDDED-SCRIPTS.md#languagesjs)

#### Модульная архитектура Backend
Монолитный `main.rs` (2140 строк) разбит на 20 файлов по функциональности.
→ [03-BACKEND.md](../03-BACKEND.md) | [ADR-010](ADR.md#adr-010-модульная-архитектура-backend)

**Новая структура:**
```
src-tauri/src/
├── main.rs        (131 строк) — точка входа
├── lib.rs         — реэкспорт модулей
├── types.rs       — структуры данных
├── state.rs       — глобальные состояния
├── commands/      — 6 модулей с 45 командами
├── downloads/     — пути и настройки
├── utils/         — MIME, платформа, размеры
└── webview/       — скрипты и управление
```

#### Централизация селекторов Claude
Селекторы вынесены в `src-tauri/scripts/selectors.json` — единый источник для всех CSS-селекторов Claude.ai.
→ [TROUBLESHOOTING-SELECTORS.md](TROUBLESHOOTING-SELECTORS.md) | [ADR-004](ADR.md#adr-004-централизованные-селекторы-claude)

#### Unit-тесты (Jest)
Добавлена инфраструктура тестирования: 265 тестов (260 passed, 5 skipped) для 7 модулей (storage, tabs, undo, connections, utils, export-import).
→ [tests/README.md](../../tests/README.md)

#### Переработка detect_language() в convert.py
Система подсчёта очков вместо цепочки if-else. Поддержка 20 языков.

### Добавлено
- **Автосклонение:** `generateAdjectiveForms()`, `getAllWordForms()`, `detectWordForm()`, `transformWord()`
- **Мультигео:** `LANGUAGE_COUNTRIES`, `getLanguageWithCountry()`, `hasCountrySelection()`, `getCountriesForLanguage()`, `currentCountry`
- **Поиск языка:** `findLanguageByWord()`, `getAllLanguageForms()`
- **UI форм:** Меню вставки форм с подменю падежей по родам
- **Backend Modules:** types, state, commands/*, downloads, utils, webview
- **Константы:** Централизованы в `utils/dimensions.rs` (animation, sizes, limits)
- **Документация:** Rustdoc комментарии для всех публичных функций
- **Synchronization:** Mutex-защита для webview creation, downloads/archive log
- **File Safety:** Лимит 50MB для attachments, fallback при counter > 9999
- **Claude Integration:** Session ID для upload counter, инвалидация org_id cache
- **Frontend:** Полный cleanup данных при удалении блока, расширенный undo snapshot

#### Унификация dropdown меню
Новый модуль `dropdown.js` с единым API для всех выпадающих меню:
- `Dropdown.register()` — регистрация для взаимного закрытия
- `Dropdown.closeOthers()` — закрыть все кроме указанного
- `Dropdown.positionSubmenu()` — позиционирование подменю

**Архитектура:**
- CSS класс `.dropdown-animated` для анимаций
- CSS класс `.hidden` для скрытия (не display:none)
- Подменю переиспользуются, не пересоздаются

**Клик на пункты с подменю** выбирает первый конечный элемент:
- Tab selector → первая вкладка в группе (рекурсивно)
- Language selector → первая страна
- Lang-form menu → именительный падеж мужского рода

### Изменено
- `languages.js` — новая структура: `lang`, `native`, `country`, `locale`, `localeShort` вместо 7 падежных полей
- `LANGUAGE_COUNTRIES` — добавлено поле `locale` для каждой страны
- `replaceLanguage()` — автоопределение падежа, сохранение регистра первой буквы, замена кодов локали
- `detectLanguageInText()` — ищет любую форму слова (все 24 падежа)
- `showLanguageFormMenu()` — унифицированное меню для тулбара и модалки с подменю падежей, добавлены пункты locale/localeShort
- `language-ui.js` — добавлена поддержка currentCountry и подменю стран
- `tab-selector.js` — переход на show/hide вместо create/remove для подменю; добавлено каскадное переименование и удаление групп вкладок; родительская вкладка группы показывается отдельным пунктом в подменю
- `index.html` — обновлён селектор языков с подменю, меню форм языка перенесено в конец body
- `styles.css` — стили для подменю стран, единый класс `.dropdown-animated`, стили для group-actions
- **main.rs:** Уменьшен с 2140 до 131 строки (в 16 раз)
- **Error handling:** Добавлены комментарии к пустым catch блокам в JS
- **Logging:** Добавлено логирование для критичных ошибок записи в downloads log

### Удалено
- Региональные варианты языков как отдельные коды (at, ca-en, ca-fr, ch-de, ch-fr, nz)
- `updateLangMenu()` — заменена на `showLanguageFormMenu()`
- `#lang-insert-menu` HTML элемент — меню генерируется динамически
- **Modules:** Флаг `userModified` для remote tabs, предупреждение при обновлении

### Исправлено (ключевые)
- Пустые error handlers в JS (claude-api.js, undo.js, claude_helpers.js)
- Race conditions: webview creation, upload counter, parallel log writes
- Memory/Performance: объединённый MutationObserver, оптимизация hideGhostButton
- Security: XSS в tabName (escapeHtml), path traversal в write_temp_file
- UX: защита от двойного клика, корректная очистка таймеров
- **Dropdown:** Убран `pointer-events: none` с `tab-submenu-container` — решена проблема потери курсора при переходе к подменю

<details>
<summary>Полный список исправлений по фазам</summary>

**Phase 1 - Rust Backend:**
- [1.2.1] Race condition при создании webview табов
- [1.3.2] Конкурентная запись в лог файлы
- [1.1.2] Неполное экранирование скриптов (unicode separators)
- [1.3.3] Отсутствие лимита размера для attachments
- [1.1.3] Panic при poisoned mutex в CDP callback

**Phase 2 - Claude Integration:**
- [2.2.1] Org ID cache не инвалидировался при смене аккаунта
- [2.2.3] Race condition в upload counter
- [2.1.3] Два отдельных MutationObserver на document.body
- [2.2.4] Partial failure в sendNodeToClaude

**Phase 3-5 - Frontend:**
- [3.3.3] Orphaned field-values при удалении блока
- [3.2.1] Неполный undo snapshot
- [5.1.1] Отсутствие защиты от двойного клика
- [5.1.2] Async unlisten race condition

**Phase 7 - Security:**
- [7.3.1] XSS в tabName и remote-prompts.js
- [7.4.2] Path traversal в write_temp_file

</details>

### Документация
Обновлены: [03-BACKEND](../03-BACKEND.md), [04-CLAUDE](../04-CLAUDE.md), [APPSTATE](../frontend/APPSTATE.md), [DATA-STRUCTURES](../frontend/DATA-STRUCTURES.md), [LIMITATIONS](LIMITATIONS.md), [SECURITY](SECURITY.md)

---

## [4.1.4] - 2026-01-27 {#v414}

### Добавлено
- **Документация:**
  - CHANGELOG.md — история изменений в формате Keep a Changelog
  - FAQ.md — часто задаваемые вопросы (15+ вопросов) + секция "Типичные ошибки в консоли"
  - TROUBLESHOOTING-SELECTORS.md — диагностика селекторов Claude + примеры ошибок
  - Расширенный GLOSSARY — 50+ терминов с категориями
  - ADR.md — 8 записей архитектурных решений (включая ADR-008 о тестировании)
  - SECURITY.md — документация по безопасности + секция Input Validation
  - PROJECT-MANAGER.md — документация к скрипту управления + настройка GitHub Token
  - Mermaid диаграммы для сложных потоков (Project Binding)
  - Полная sequence diagram потока данных в INDEX.md и 01-OVERVIEW.md
  - Сводная таблица по категориям в INDEX-HTML-API.md
- **Reference:**
  - Таблица системных требований в LIMITATIONS.md
  - Таблица совместимости компонентов

### Изменено
- Обновлена структура документации (добавлена папка reference/)
- Унифицированы обратные ссылки во всех документах
- Улучшена навигация в INDEX.md
- Унифицирован стиль (убраны эмодзи для консистентности)
- Удалён ARCHITECTURE.md (legacy) — весь контент перенесён в модульную документацию
- Сокращено дублирование (CDP timeouts теперь только в 03-BACKEND.md со ссылками из других документов)
- Упрощена секция обновления селекторов в CONTRIBUTING.md (ссылка на TROUBLESHOOTING-SELECTORS)
- Стандартные сокращения в GLOSSARY вынесены в collapsed секцию

### Исправлено
- Исправлена команда сборки в SETUP_GITHUB.md (`cargo tauri build` вместо `npm run`)
- Уточнена информация о CDP и cookies в SECURITY.md
- Перепроверен подсчёт функций claude-api.js в 02-FRONTEND.md (подтверждено: 45 функций)
- Унифицирована версия Rust в LIMITATIONS.md (минимум 1.75+, рекомендуется 1.80+)
- Исправлено количество языков в 05-FEATURES.md (было 21, стало 26 — добавлены региональные варианты: at, ca-en, ca-fr, ch-de, ch-fr, nz)
- Исправлена фраза в QUICKSTART.md ("скачает и скомпилирует" вместо "скачает")
- Унифицированы даты в ADR.md (добавлены месяцы: Ноябрь 2025, Декабрь 2025, Январь 2026)

---

## [4.1.3] - 2026-01-20

### Добавлено
- Archive Log — лог скачанных архивов с быстрым доступом к проектам Claude
- Кнопка "Продолжить проект" при открытии страницы проекта
- Индикатор активного проекта в селекторе вкладок

### Исправлено
- Исправлена работа мониторинга генерации
- Нормализация order вкладок при push (устранение дубликатов)

---

## [4.1.0] - 2026-01-16

### Добавлено
- **CDP (Chrome DevTools Protocol)** — выполнение async скриптов с возвратом результата
- Создание проектов и чатов через внутренний API Claude (без UI automation)
- Project Binding System — привязка вкладки APM к проекту Claude
- Флаги автоматизации P (New Project) и N (New Chat)
- Downloads Manager с multi-select и кастомной директорией
- Toolbar WebView над Claude

### Изменено
- Переработана система отправки блоков в Claude
- Улучшена система ожидания загрузки файлов
- Селекторы Claude централизованы в main.rs

### Исправлено
- Исправлена утечка памяти в Rust backend (Arc вместо std::mem::forget)
- Исправлен селектор кнопки Send (`"Send message"` вместо `"Send Message"`)

---

## [4.0.0] - 2026-01-09

### Добавлено

#### Встроенный Claude AI
- Split-view панель с тремя независимыми чатами
- Кнопка "Отправить в Claude" на каждом блоке
- Привязка блоков к конкретному чату (1, 2 или 3)
- Auto-send режим с прикреплением файлов
- Мониторинг генерации с индикатором
- Сохранение URL чатов между сессиями

#### Workflow режим
- Визуальный редактор промптов на canvas
- Drag and drop перемещение блоков
- Соединения между блоками (DAG)
- Zoom (0.4-1.25) и pan навигация
- Snap to grid (40px)
- Сохранение позиций и связей

#### Скрипты автоматизации
- Встроенный convert.py (конвертация MD в HTML)
- Встроенный count.py (подсчёт слов)
- Встроенный spellcheck.py (проверка орфографии)
- Запуск скриптов через интерфейс

### Изменено
- Полностью переработан UI
- Новая модульная архитектура JavaScript (21 модуль)
- Расширенный Rust backend (~2000 строк)

### Улучшено
- Новая иконка приложения
- Undo/Redo с per-tab историей (50 состояний)
- Улучшенная валидация данных
- Debounced автосохранение (2 сек) + периодическое (30 сек)

---

## [3.5.0] - 2025-12 (legacy)

### Функциональность (legacy)
- Базовое управление вкладками и блоками
- Интеграция с Claude WebView (один таб)
- Система тем (light/dark/system)
- Export/Import вкладок
- Автообновление приложения через GitHub Releases
- Remote prompts — загрузка вкладок с GitHub

---

> **Примечание:** Точные даты релизов уточняются по git тегам.
> Для детальной истории изменений см. коммиты в репозитории.

---

## Связанные документы

- [DATA-MIGRATIONS.md](DATA-MIGRATIONS.md) — Версионирование данных
- [../INDEX.md](../INDEX.md) — Навигация по документации
- [ADR.md](ADR.md) — Архитектурные решения
