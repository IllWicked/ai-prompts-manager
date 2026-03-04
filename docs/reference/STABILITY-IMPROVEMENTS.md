# Анализ стабильности и план улучшений

[← Назад к INDEX](../INDEX.md)

**Дата:** 2026-02-22  
**Версия:** 4.3.2

Анализ 12 наиболее хрупких подсистем приложения с конкретными рекомендациями по улучшению.

---

## 1. Селекторы Claude.ai — самое уязвимое место

**Проблема:** Claude.ai обновляет DOM без предупреждения. Все fallback-селекторы могут протухнуть одновременно.

### Рекомендации

**A. Автодиагностика селекторов при запуске**

Добавить в `claude_helpers.js` health-check, который при каждой загрузке страницы проверяет все критические селекторы и репортит в Tauri:

```javascript
function runSelectorHealthCheck() {
    const critical = ['input.proseMirror', 'input.sendButton', 'generation.stopButton'];
    const broken = [];
    
    for (const path of critical) {
        if (!__findEl__(path)) {
            broken.push(path);
        }
    }
    
    if (broken.length > 0) {
        window.__TAURI__.core.invoke('notify_broken_selectors', { 
            selectors: broken 
        });
    }
}
```

При обнаружении сломанных селекторов — писать результат в технический лог диагностики (см. пункт 1C). Пользователь ничего не видит — он всё равно не может починить селекторы сам.

**B. Стратегия "resilient selectors" — поиск по контексту**

Помимо fallback-массивов с конкретными селекторами, добавить эвристический поиск. Лучшая практика из web scraping: искать через стабильных родителей и навигировать к потомкам, а не целиться напрямую в элемент:

```javascript
function __findElSmart__(path) {
    // 1. Стандартный поиск по селекторам
    const el = __findEl__(path);
    if (el) return el;
    
    // 2. Эвристический fallback
    const heuristics = {
        'input.proseMirror': () => {
            // ProseMirror всегда contenteditable div
            return document.querySelector('[contenteditable="true"][role="textbox"]')
                || document.querySelector('[contenteditable="true"].ProseMirror');
        },
        'input.sendButton': () => {
            // Кнопка Send — всегда button рядом с editor
            const editor = __findElSmart__('input.proseMirror');
            if (!editor) return null;
            const form = editor.closest('form') || editor.parentElement?.parentElement;
            return form?.querySelector('button[type="submit"]')
                || form?.querySelector('button:last-of-type');
        }
    };
    
    return heuristics[path]?.() || null;
}
```

Ключевая идея из индустрии web scraping: `aria-*` атрибуты и `role` — самые стабильные, т.к. они связаны с accessibility и ломаются реже.

**C. Версионирование селекторов**

**C. Технический лог диагностики**

Отдельный файл `diagnostics.json` в AppData. Пишутся все технические события: сломанные селекторы, CDP-таймауты, ошибки отправки, переполнение localStorage. Кнопка «Экспорт диагностики» в доп. настройках — копирует файл в папку загрузок. При проблемах пользователь скидывает этот файл разработчику, и картина сразу ясна.

```json
[
  {
    "timestamp": "2026-02-22T14:30:00Z",
    "type": "selector_broken",
    "details": { "path": "input.sendButton", "allVariantsTried": 4 }
  },
  {
    "timestamp": "2026-02-22T14:31:00Z",
    "type": "cdp_timeout",
    "details": { "operation": "createProject", "timeout": 30000, "tab": 1 }
  }
]
```

Команда Rust для записи:

```rust
// commands/logs.rs
#[tauri::command]
pub fn write_diagnostic(event_type: String, details: String) -> Result<(), String> {
    let path = get_app_data_dir()?.join("diagnostics.json");
    // Дописать в массив, ротация при > 500 записей
}

#[tauri::command]
pub fn export_diagnostics() -> Result<String, String> {
    // Копировать в папку загрузок, вернуть путь
}
```

**Трудозатраты:** ~4-6 часов  
**Приоритет:** 🔴 Высокий — ломается чаще всего

---

## 2. Upload Interceptor — monkey-patch fetch

**Проблема:** Перехват `window.fetch` в чужом production-сайте. Может конфликтовать с другими interceptors, не работает с Service Workers, зависит от endpoint `/upload-file`.

### Рекомендации

**A. Перенести перехват на уровень WebView2 (Rust)**

WebView2 предоставляет нативный API `WebResourceRequested` для перехвата сетевых запросов на уровне хост-приложения. Это намного надёжнее, чем monkey-patch в JS:

```rust
// В webview/manager.rs при создании Claude WebView
webview.add_web_resource_requested_filter(
    "*/upload-file*", 
    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL
)?;

webview.on_web_resource_requested(|_webview, args| {
    let uri = args.request().uri()?;
    if uri.contains("/upload-file") {
        // Инкрементировать счётчик загрузок в state.rs
        UPLOAD_COUNTER.fetch_add(1, Ordering::SeqCst);
    }
    Ok(()) // Не блокируем запрос, только считаем
})?;
```

**Преимущества:**
- Работает на уровне сетевого стека, не зависит от JS-контекста
- Не конфликтует с другими fetch-interceptors
- Работает даже если Claude.ai использует Service Workers
- Таури через `wry` предоставляет доступ к `on_web_resource_request`

**B. Если нативный перехват невозможен — Proxy вместо replacement**

Использовать `ES6 Proxy` вместо замены `window.fetch`. Proxy невидим для `toString()` проверок и менее инвазивен:

```javascript
window.fetch = new Proxy(window.fetch, {
    apply(target, thisArg, args) {
        const [url] = args;
        if (typeof url === 'string' && url.includes('/upload-file')) {
            window.__uploadedFilesCount++;
        }
        return Reflect.apply(target, thisArg, args);
    }
});
```

**C. Множественные паттерны endpoint'а**

Вместо хардкода `/upload-file` использовать массив паттернов с wildcard:

```javascript
const UPLOAD_PATTERNS = ['/upload-file', '/api/upload', '/files/upload', '/upload'];
```

**Трудозатраты:** A — ~8-12 часов (требует изучения wry API), B — ~2 часа  
**Приоритет:** 🟡 Средний — работает стабильно, пока не изменится endpoint

---

## 3. CDP Runtime.evaluate — цепочки с таймаутами

**Проблема:** Все async-операции с Claude идут через CDP. Три уровня таймаутов (5/10/30 сек), длинные цепочки при создании проекта.

### Рекомендации

**A. Retry с экспоненциальным backoff**

Обернуть `eval_in_claude_with_result` в retry-логику:

```rust
async fn eval_with_retry(
    webview: &Webview, 
    script: &str, 
    timeout_ms: u64, 
    max_retries: u32
) -> Result<String, String> {
    let mut attempt = 0;
    let mut delay = 500; // ms
    
    loop {
        match eval_in_claude_with_result_inner(webview, script, timeout_ms).await {
            Ok(result) => return Ok(result),
            Err(e) if attempt < max_retries => {
                attempt += 1;
                tokio::time::sleep(Duration::from_millis(delay)).await;
                delay = (delay * 2).min(5000); // Max 5 sec
            }
            Err(e) => return Err(format!("After {} retries: {}", attempt, e)),
        }
    }
}
```

**B. Разбить длинные CDP-цепочки на атомарные шаги**

Вместо одного огромного JS-выражения для `createProjectViaAPI`, разбить на 3 отдельных CDP-вызова с checkpoint'ами:

1. `getOrganizationId()` → сохранить org_id
2. `createProject(org_id)` → сохранить uuid
3. `navigateToProject(uuid)` → финализировать

Каждый шаг — отдельный CDP-вызов с собственным таймаутом и retry. При провале на шаге 2 — не нужно повторять шаг 1.

**C. Адаптивные таймауты**

Замерять реальное время выполнения CDP-операций и корректировать таймауты:

```rust
static CDP_AVG_TIME: AtomicU64 = AtomicU64::new(5000);

fn get_adaptive_timeout(base: u64) -> u64 {
    let avg = CDP_AVG_TIME.load(Ordering::Relaxed);
    // Таймаут = max(base, avg * 3)
    base.max(avg * 3)
}
```

**Трудозатраты:** ~6-10 часов  
**Приоритет:** 🟡 Средний — проблема проявляется при медленном интернете

---

## 4. Project Binding System — сложная state machine

**Проблема:** Множество точек входа, неконсистентные переходы, зависимость от URL-парсинга и кэша org_id.

### Рекомендации

**A. Формализовать как конечный автомат (FSM)**

Текущая реализация — набор разрозненных функций. Переписать как явную state machine. Не обязательно подключать XState (слишком тяжёлый для Vanilla JS проекта), но достаточно паттерна:

```javascript
const ProjectFSM = {
    state: 'idle', // idle | creating | active | finishing
    
    transitions: {
        idle:     { CREATE: 'creating', CONTINUE: 'active' },
        creating: { SUCCESS: 'active',  FAILURE: 'idle' },
        active:   { FINISH: 'finishing', DISCONNECT: 'idle' },
        finishing:{ DONE: 'idle',       FAILURE: 'active' }
    },
    
    send(event, payload) {
        const nextState = this.transitions[this.state]?.[event];
        if (!nextState) {
            console.warn(`[ProjectFSM] Invalid transition: ${this.state} + ${event}`);
            return false;
        }
        const prevState = this.state;
        this.state = nextState;
        this.onTransition(prevState, nextState, event, payload);
        return true;
    }
};
```

**Преимущества:**
- Невозможные переходы отклоняются явно (нельзя `finishProject()` из `idle`)
- Легко логировать все переходы для отладки
- Визуализируемо — можно нарисовать диаграмму из определения
- Все side-effects привязаны к конкретным переходам

**B. Таймаут для "зависших" проектов**

Добавить TTL для active-project. Если проект активен > 24 часов без действий — автозавершение:

```javascript
function checkProjectStaleness() {
    const project = loadFromStorage('active-project');
    if (project && Date.now() - project.lastActivity > 24 * 60 * 60 * 1000) {
        finishProject(); // Автозавершение
    }
}
```

**C. Сделать привязку по Claude tab, а не по APM tab**

Сейчас `ownerTab` — это ID вкладки APM, что создаёт путаницу при переименовании. Привязывать к номеру Claude tab (1-3), который стабилен.

**Трудозатраты:** A — ~8-12 часов, B+C — ~3-4 часа  
**Приоритет:** 🟡 Средний — баги проявляются при нетипичном usage

---

## ~~5. URL Change Detection — перехват history.pushState~~

**Статус:** Снято с плана.

Текущий перехват `pushState` + `replaceState` + `popstate` + backup polling работает стабильно. Navigation API — теоретическое улучшение на случай если Anthropic сменит механизм навигации. Переход на Navigation API у них потребует масштабных изменений, поэтому превентивный рефакторинг не оправдан. Если сломается — добавляется за ~2 часа по факту.

---

## 6. sendNodeToClaude — длинная async-цепочка

**Проблема:** Зависание на середине цепочки → неконсистентное состояние.

### Рекомендации

**A. Abort Controller для всей цепочки**

Добавить возможность отмены на любом этапе:

```javascript
let currentSendController = null;

async function sendNodeToClaude(index, chatTab) {
    if (currentSendController) {
        currentSendController.abort();
    }
    currentSendController = new AbortController();
    const signal = currentSendController.signal;
    
    try {
        // Каждый шаг проверяет signal
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        await waitForClaudeInput(chatTab, 15000);
        
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        await insertTextToClaude(chatTab, text);
        // ...
    } catch (e) {
        if (e.name === 'AbortError') {
            showToast('Отправка отменена');
        } else {
            throw e;
        }
    } finally {
        currentSendController = null;
    }
}
```

**B. Checkpoint-based recovery**

Сохранять прогресс цепочки, чтобы при провале можно было продолжить:

```javascript
const SendProgress = {
    step: 0,    // 0-idle, 1-project, 2-newchat, 3-wait, 4-attach, 5-insert, 6-send
    blockId: null,
    tab: null,
    
    async resume() {
        // Продолжить с последнего успешного шага
    }
};
```

**C. Визуальный индикатор прогресса**

Показывать пользователю текущий этап отправки (создание проекта → ожидание → вставка → отправка) вместо просто "загрузка".

**Трудозатраты:** ~6-8 часов  
**Приоритет:** 🟡 Средний

---

## 7. Z-Order WebView — ~~recreate_toolbar()~~ → raise_toolbar_zorder()

**Проблема:** ~~Пересоздание toolbar/downloads для z-order — архитектурный костыль.~~ **РЕШЕНО.**

### Реализация (v4.3.0)

Вместо пересоздания toolbar применён комплексный рефакторинг WebView coordination:

- **`raise_toolbar_zorder()`** — Win32 `SetWindowPos(HWND_TOP)` через `with_webview`. Мгновенное поднятие z-order без пересоздания, без потери состояния.
- **`webview.hide()`/`show()`** — WebView2 `put_IsVisible(FALSE)` вместо позиционирования за экран. Throttle CPU/GPU.
- **`TrySuspend()`/`Resume()`** — ICoreWebView2_3 для паузы script timers в неактивных табах.
- **Async startup** — `tauri::async_runtime::spawn` вместо `thread::spawn`, задержки 950ms → 250ms.
- **Error logging** — ошибки создания webview пишутся в `diagnostics.json` + emit `startup-error`.
- **Декомпозиция** — `resize_webviews` → `layout_ui` + `layout_claude` + `layout_overlay`.

Удалены: `recreate_toolbar()`, `TOOLBAR_NEEDS_RECREATE`, deferred recreate логика, все off-screen позиционирования.

**Статус:** ✅ Реализовано  
**ADR:** [ADR-011](ADR.md#adr-011-webview-coordination--setwindowpos--hideshow--suspend)

---

## 8. Dynamic Input — optional fields с savedPosition

**Проблема:** При изменении текста между скрытием и показом поля — позиция невалидна.

### Рекомендации

**A. Маркеры вместо позиций**

Вместо числовой позиции использовать уникальные невидимые маркеры в тексте:

```javascript
const FIELD_MARKER_START = '\u200B{{FIELD:';  // Zero-width space + marker
const FIELD_MARKER_END = '}}\u200B';

function hideOptionalField(fieldId, text) {
    // Вместо savedPosition — оставить маркер
    const marker = `${FIELD_MARKER_START}${fieldId}${FIELD_MARKER_END}`;
    return text.replace(fieldContent, marker);
}

function showOptionalField(fieldId, text, content) {
    const marker = `${FIELD_MARKER_START}${fieldId}${FIELD_MARKER_END}`;
    return text.replace(marker, content);
}
```

**Преимущества:**
- Позиция не ломается при любых редактированиях
- Маркер перемещается вместе с текстом
- Zero-width space невидим для пользователя

**B. Очистка маркеров перед отправкой**

При `sendNodeToClaude` — убирать все оставшиеся маркеры скрытых полей:

```javascript
function cleanFieldMarkers(text) {
    return text.replace(/\u200B\{\{FIELD:.*?\}\}\u200B/g, '');
}
```

**Трудозатраты:** ~4-6 часов  
**Приоритет:** 🟡 Средний — баг проявляется редко, но критичен

---

## 9. localStorage — единственное хранилище

**Проблема:** Лимит 5-10 MB, синхронный API блокирует main thread, нет шифрования.

### Рекомендации

**A. Гибридное хранение: localStorage + файловая система**

Тяжёлые данные (workflow positions, attachment metadata) выносить в файл через Tauri:

```javascript
// Лёгкие данные → localStorage (быстро, синхронно)
saveToStorage('settings', settingsData);
saveToStorage('claudeSettings', claudeState);

// Тяжёлые данные → файл через Tauri (без лимита)
await invoke('save_tabs_data', { data: JSON.stringify(allTabs) });
await invoke('save_workflow_data', { tabId, data: JSON.stringify(positions) });
```

```rust
// commands/storage.rs (новый модуль)
#[tauri::command]
pub fn save_tabs_data(data: String) -> Result<(), String> {
    let path = get_app_data_dir()?.join("tabs_data.json");
    std::fs::write(&path, data).map_err(|e| e.to_string())
}
```

**B. Мониторинг использования**

Добавить в settings.js показ текущего использования localStorage:

```javascript
function getStorageUsage() {
    let total = 0;
    for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
            total += (localStorage[key].length + key.length) * 2;
        }
    }
    return { used: total, limit: 5 * 1024 * 1024, percent: (total / (5*1024*1024) * 100).toFixed(1) };
}
```

Показывать предупреждение при > 80% заполненности.

**C. Ленивая загрузка вкладок**

Загружать содержимое вкладок только при переключении, а не все сразу:

```javascript
function getTabContent(tabId) {
    const cached = tabContentCache.get(tabId);
    if (cached) return cached;
    
    const data = loadFromStorage(`tab-content-${tabId}`);
    tabContentCache.set(tabId, data);
    return data;
}
```

**Трудозатраты:** A — ~8-12 часов, B — ~2 часа, C — ~6-8 часов  
**Приоритет:** 🟡 Средний — станет критичным при росте количества вкладок

---

## ~~10. Remote Prompts — перезапись без merge~~

**Статус:** Снято с плана.

Текущее поведение — intended. Remote-вкладки управляются разработчиком пайплайнов, перезапись при обновлении — штатный flow. Проблемы с пайплайном решаются на стороне разработчика: починить, залить, сказать пользователям обновиться. Merge/backup/детекция изменений избыточны и засоряют интерфейс.

---

## 11. Undo/Redo — snapshot всего состояния

**Проблема:** `structuredClone` всего состояния на каждое действие — потенциально тяжело.

### Рекомендации

**A. Incremental snapshots (операционный лог)**

Вместо полного клона — сохранять только дельту:

```javascript
class UndoManager {
    constructor(maxSize = 50) {
        this.operations = [];  // [{type, tabId, blockId, before, after}]
        this.pointer = -1;
        this.maxSize = maxSize;
    }
    
    record(type, tabId, blockId, before, after) {
        // Отсечь redo-историю
        this.operations = this.operations.slice(0, this.pointer + 1);
        this.operations.push({ type, tabId, blockId, before, after, timestamp: Date.now() });
        this.pointer++;
        
        // Обрезать старые
        if (this.operations.length > this.maxSize) {
            this.operations.shift();
            this.pointer--;
        }
    }
    
    undo() {
        if (this.pointer < 0) return null;
        const op = this.operations[this.pointer--];
        return { ...op, value: op.before }; // Применить before
    }
    
    redo() {
        if (this.pointer >= this.operations.length - 1) return null;
        const op = this.operations[++this.pointer];
        return { ...op, value: op.after }; // Применить after
    }
}
```

**Преимущества:**
- Потребление памяти пропорционально количеству изменений, а не размеру данных
- Можно показать пользователю историю действий
- Легче отлаживать

**B. Группировка операций набора текста**

Текущий debounce 1 сек — нормально, но добавить группировку по "паузам в печати":

```javascript
// Группировать, пока пользователь печатает
// Новый snapshot — только когда пауза > 1.5 сек
```

**Трудозатраты:** A — ~8-12 часов (полный рефакторинг), B — ~2 часа  
**Приоритет:** 🟢 Низкий — текущая реализация работает после рефакторинга в 4.2.12

---

## 12. Language System — переход на маркеры

**Проблема:** Текущая система `changeLanguage()` ищет все вхождения языковых форм в тексте и заменяет. Это создаёт коллизии (случайные замены обычных слов) и не поддерживает промпты с двумя языками одновременно (например, пайплайн перевода с исходного на целевой).

### Рекомендация: маркеры текущего языка

Полная переработка системы. Вместо поиска слов по словарю — явные маркеры в тексте промпта.

**Принцип:** Маркер = «текущий выбранный язык в нужной форме». Переключатель языка меняет только маркированные места. Всё остальное — обычный текст, не трогается.

**Формат маркеров в данных:**

```
{{lang:nominative}}     → "английский" / "французский" / ...
{{lang:genitive}}       → "английского" / "французского" / ...
{{native:nominative}}   → "англоязычный" / "франкоязычный" / ...
{{country:nominative}}  → "Великобритания" / "Франция" / ...
{{locale}}              → "en-GB" / "fr-FR" / ...
```

Полный набор форм: 6 падежей × 4 рода для каждой категории (lang, native, country), плюс locale без склонения.

**Отображение в редакторе:**

Пользователь НЕ видит `{{lang:nominative}}`. Он видит раскрытое значение «английский», подсвеченное оранжевым цветом (акцентная `--accent-color` из CSS-переменных). При наведении — tooltip с типом маркера.

```javascript
function renderBlockContent(text) {
    return text.replace(/\{\{(\w+):?(\w*)\}\}/g, (match, type, form) => {
        const value = resolveMarker(type, form, currentLanguage);
        return `<span class="lang-marker" data-marker="${match}" title="${type}:${form}">${value}</span>`;
    });
}
```

```css
.lang-marker {
    color: var(--accent-color);  /* Оранжевый */
    cursor: default;
}
```

**Меню вставки (кнопка «Язык»):**

Интерфейс остаётся таким же: пользователь выбирает категорию (язык / национальность / страна / локаль) → падеж → род. Результат — вставляется маркер в текст, но пользователь видит только раскрытое слово в оранжевом цвете.

```javascript
function insertLanguageForm(category, caseForm, gender) {
    const marker = `{{${category}:${caseForm}${gender ? ':' + gender : ''}}}`;
    insertAtCursor(marker);
    // Редактор рендерит маркер как оранжевое слово
}
```

**Переключение языка (`changeLanguage`):**

Становится тривиальным — никакого поиска по тексту:

```javascript
function changeLanguage(newLang) {
    currentLanguage = newLang;
    // Перерендерить все блоки — маркеры раскроются в новые значения
    rerenderAllBlocks();
    saveToStorage('current-language', newLang);
}
```

Маркеры в данных (`{{lang:nominative}}`) не меняются — меняется только их отображение.

**Отправка в Claude:**

При `sendNodeToClaude` маркеры раскрываются в финальный текст:

```javascript
function resolveMarkersForSend(text) {
    return text.replace(/\{\{(\w+):?(\w*):?(\w*)\}\}/g, (match, type, form, gender) => {
        return resolveMarker(type, form, currentLanguage, gender);
    });
}
```

Claude получает чистый текст без маркеров.

**Промпты с двумя языками:**

Маркер покрывает только «текущий выбранный язык» (источник). Целевой язык пишется автором промпта вручную как обычный текст или выносится в Dynamic Input (модалку). Пользователь меняет целевой язык через уже работающие модалки.

Пример промпта: `Переведи {{lang:nominative}} текст на немецкий язык.`
При выборе французского: `Переведи французский текст на немецкий язык.`

**Миграция:** Обратная совместимость со старой системой не нужна. Все промпты будут переделаны автором на маркеры.

**Трудозатраты:** ~12-16 часов (рефакторинг системы языков + рендеринг маркеров + обновление меню вставки)  
**Приоритет:** 🟡 Средний — решает фундаментальную архитектурную проблему

---

## План выполнения

Порядок определён зависимостями между пунктами и логикой переиспользования.

| Шаг | Пункт | Что делаем | Трудозатраты | Зависимости |
|-----|-------|-----------|-------------|-------------|
| ~~1~~ | ~~**1C**~~ | ~~Диагностика: `diagnostics.json` + кнопка экспорта~~ | ~~3-4 ч~~ | ~~—~~ |
| ~~2~~ | ~~**1A+1B**~~ | ~~Селекторы: health-check + эвристический поиск~~ | ~~4-6 ч~~ | ~~Шаг 1 (пишет в лог)~~ |
| ~~3~~ | ~~**12**~~ | ~~Language System: маркеры `{{lang:form}}` + рендеринг~~ | ~~12-16 ч~~ | ~~—~~ |
| ~~4~~ | ~~**8**~~ | ~~Dynamic Input: маркеры позиций вместо savedPosition~~ | ~~4-6 ч~~ | ~~Шаг 3 (паттерн маркеров)~~ |
| ~~5~~ | ~~**3**~~ | ~~CDP: retry с backoff + атомарные шаги + adaptive timeout~~ | ~~6-10 ч~~ | ~~—~~ |
| ~~6~~ | ~~**6**~~ | ~~sendNodeToClaude: AbortController + checkpoint recovery~~ | ~~6-8 ч~~ | ~~Шаг 5 (надёжный CDP)~~ |
| ~~7~~ | ~~**4**~~ | ~~Project Binding: FSM + TTL + привязка по Claude tab~~ | ~~8-12 ч~~ | ~~Шаг 6 (корректные ошибки)~~ |
| ~~8~~ | ~~**2**~~ | ~~Upload Interceptor: WebView2 `WebResourceRequested`~~ | ~~8-12 ч~~ | ~~—~~ |
| ~~9~~ | ~~**9**~~ | ~~localStorage: гибридное хранение + мониторинг + lazy load~~ | ~~8-12 ч~~ | ~~Шаг 1 (мониторинг в лог)~~ |
| ~~10~~ | ~~**7**~~ | ~~Z-Order: single recreate при старте + отложенный флаг~~ | ~~3-4 ч~~ | ~~—~~ |
| ~~11~~ | ~~**11**~~ | ~~Undo/Redo: incremental snapshots + группировка ввода~~ | ~~8-12 ч~~ | ~~—~~ |

**Снято с плана:** ~~5 (URL Detection)~~, ~~10 (Remote Prompts merge)~~

**Общая оценка:** ~70-100 часов.

**Статус: ✅ ВСЕ 11 ШАГОВ ЗАВЕРШЕНЫ**

### Логика порядка

**Шаги 1-2:** Инфраструктура диагностики → сразу самый хрупкий компонент. Все дальнейшие улучшения пишут ошибки в диагностику.

**Шаги 3-4:** Блок маркеров. Language System — крупный рефакторинг, создаёт паттерн. Dynamic Input — применяет тот же паттерн, делается быстрее по горячим следам.

**Шаги 5-7:** Блок надёжности отправки. CDP retry → sendNodeToClaude abort → Project FSM. Каждый следующий опирается на предыдущий.

**Шаги 8-11:** Независимые улучшения в порядке убывания приоритета.

---

## Связанные документы

- [LIMITATIONS.md](LIMITATIONS.md) — Текущие ограничения
- [ADR.md](ADR.md) — Архитектурные решения
- [CHANGELOG.md](CHANGELOG.md) — История изменений
