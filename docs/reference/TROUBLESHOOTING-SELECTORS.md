# Troubleshooting: Селекторы Claude.ai

[← Назад к INDEX](../INDEX.md)

> **Последняя проверка:** 2026-03-18
>
> Claude.ai регулярно обновляет разметку. Этот документ помогает быстро диагностировать и исправлять сломанные селекторы.

---

## Архитектура селекторов (v4.2.0)

С версии 4.2.0 селекторы централизованы в **одном файле**:

```
src-tauri/scripts/selectors.json   ← ЕДИНСТВЕННОЕ МЕСТО ДЛЯ РЕДАКТИРОВАНИЯ
```

Этот файл:
- Загружается в Rust через `include_str!`
- Передаётся в WebView как `window._s`
- Используется в `claude_helpers.js` и evaluate-скриптах

---

## Текущие селекторы

### Структура selectors.json

```
selectors.json
├── generation/          # Индикаторы генерации
│   ├── stopButton       # Массив селекторов кнопки Stop
│   ├── streamingIndicator
│   └── thinkingIndicator
├── input/               # Элементы ввода
│   ├── proseMirror      # Редактор сообщений
│   ├── contentEditable  # Fallback редактор
│   ├── textarea         # Fallback textarea
│   ├── sendButton       # Массив селекторов кнопки Send
│   └── fileInput        # Input для файлов
├── attachments/
│   └── attachButtonAriaPattern  # Паттерн для кнопки Attach
├── navigation/          # Навигация
│   ├── leftNav          # Левый сайдбар
│   ├── pinSidebarButton # Кнопка закрепления
│   └── scrollContainer  # Массив селекторов скролла
├── project/             # Проекты
│   ├── projectLinkInHeader
│   ├── projectLinkGeneric
│   └── pageTitle
└── ui/                  # Косметика
    ├── ghostButtonIndicator
    ├── titleContainer
    └── artifactControls
```

### Статус селекторов

| Путь | Назначение | Статус | Проверка |
|------|------------|--------|----------|
| `generation.stopButton` | Кнопка остановки | ✅ | 2026-01-29 |
| `generation.streamingIndicator` | Индикатор стрима | ✅ | 2026-01-29 |
| `generation.thinkingIndicator` | Индикатор "думает" | ✅ | 2026-01-29 |
| `input.proseMirror` | Редактор | ✅ | 2026-01-29 |
| `input.contentEditable` | Fallback для contenteditable | ✅ | 2026-02-22 |
| `input.textarea` | Fallback для textarea | ✅ | 2026-02-22 |
| `input.sendButton` | Кнопка отправки | ✅ | 2026-01-29 |
| `input.fileInput` | Input файлов | ✅ | 2026-01-29 |
| `attachments.attachButtonAriaPattern` | Паттерн aria-label кнопки прикрепления | ✅ | 2026-02-22 |
| `navigation.leftNav` | Сайдбар | ✅ | 2026-01-29 |
| `navigation.pinSidebarButton` | Кнопка pin сайдбара | ✅ | 2026-02-22 |
| `navigation.scrollContainer` | Скролл контейнер | ✅ | 2026-01-29 |
| `project.projectLinkInHeader` | Ссылка на проект в хедере | ✅ | 2026-02-22 |
| `project.projectLinkGeneric` | Общая ссылка на проект | ✅ | 2026-02-22 |
| `project.pageTitle` | Заголовок страницы | ✅ | 2026-02-22 |
| `ui.ghostButtonIndicator` | Ghost кнопка | ✅ | 2026-01-29 |
| `ui.titleContainer` | Заголовок чата | ✅ | 2026-01-29 |
| `ui.artifactControls` | Контролы артифактов | ✅ | 2026-02-22 |

---

## Быстрая диагностика

### Шаг 1: Определи симптом

| Симптом | Вероятный селектор | Приоритет |
|---------|-------------------|-----------|
| Сайдбар не скрывается | `navigation.leftNav` | 🔴 Высокий |
| Отправка не работает | `input.proseMirror`, `input.sendButton` | 🔴 Высокий |
| Мониторинг генерации сломан | `generation.*` | 🟡 Средний |
| Ghost button появляется | `ui.ghostButtonIndicator` | 🟢 Низкий |
| Скролл не работает | `navigation.scrollContainer` | 🟡 Средний |

### Шаг 2: Проверь в DevTools

1. **Запусти приложение** в dev-режиме:
   ```bash
   cd src-tauri && cargo tauri dev
   ```

2. **Открой DevTools** в Claude WebView (F12)

3. **Проверь селекторы** в консоли:
   ```javascript
   // Все селекторы
   console.log(window._s);
   
   // Конкретная секция
   console.log(window._s.generation);
   console.log(window._s.input);
   
   // Проверить селектор
   document.querySelector(window._s.input.proseMirror);
   
   // Проверить массив селекторов
   window._s.generation.stopButton.forEach(sel => {
       console.log(sel, !!document.querySelector(sel));
   });
   ```

---

## Исправление селекторов

### Шаг 1: Найди новый селектор в DevTools

```javascript
// Поиск кнопки отправки
document.querySelectorAll('button').forEach(b => {
    if (b.textContent.includes('Send') || b.ariaLabel?.includes('Send')) {
        console.log(b, b.className, b.ariaLabel);
    }
});

// Поиск индикатора генерации
document.querySelectorAll('[aria-label*="Stop"]');

// Поиск редактора
document.querySelectorAll('[contenteditable]');
```

### Шаг 2: Обнови selectors.json

```json
{
  "generation": {
    "stopButton": [
      "button[aria-label='Stop Response']",
      "button[aria-label='Stop']",
      "[data-testid='stop-button']"
    ]
  }
}
```

**Важно:** Файл `selectors.json` — единственное место, которое нужно редактировать!

### Шаг 3: Протестируй

```
□ Перезапусти cargo tauri dev
□ Проверь в консоли: window._s
□ Проверь функциональность
□ Проверь во всех 3 табах Claude
```

---

## Как создать robust селектор

### Приоритеты (от лучшего к худшему)

1. **aria-* атрибуты** (самые стабильные):
   ```css
   button[aria-label='Stop Response']
   ```

2. **data-testid** (для тестов, стабильные):
   ```css
   [data-testid='send-button']
   ```

3. **Уникальные классы** (могут меняться):
   ```css
   .ProseMirror
   ```

4. **Структурные пути** (последний fallback):
   ```css
   body > div.root > div > div.shrink-0 > div > nav
   ```

### Пример массива с fallback

```json
"sendButton": [
  "button[aria-label='Send message']",
  "button[aria-label='Send Message']",
  "button[aria-label='Send']",
  "[data-testid='send-button']"
]
```

---

## Скрипт автопроверки

Вставь в консоль Claude WebView (F12):

```javascript
// ═══════════════════════════════════════════════════════════
// APM Selector Health Check v2 (для selectors.json структуры)
// ═══════════════════════════════════════════════════════════

(function checkSelectors() {
    const SEL = window._s;
    
    if (!SEL) {
        console.error('❌ window._s не найден');
        return;
    }
    
    console.log('🔍 Проверка селекторов APM...\n');
    
    const results = [];
    
    function checkSelector(path, value) {
        if (typeof value === 'string') {
            const found = !!document.querySelector(value);
            results.push({ path, status: found ? '✅' : '❌', selector: value });
        } else if (Array.isArray(value)) {
            let found = false;
            let workingSel = null;
            for (const sel of value) {
                if (document.querySelector(sel)) {
                    found = true;
                    workingSel = sel;
                    break;
                }
            }
            results.push({ 
                path, 
                status: found ? '✅' : '⚠️', 
                selector: workingSel || value[0],
                note: found ? '' : `0/${value.length} fallbacks работают`
            });
        }
    }
    
    function traverse(obj, prefix = '') {
        for (const [key, value] of Object.entries(obj)) {
            if (key.startsWith('_')) continue;
            const path = prefix ? `${prefix}.${key}` : key;
            if (typeof value === 'object' && !Array.isArray(value)) {
                traverse(value, path);
            } else {
                checkSelector(path, value);
            }
        }
    }
    
    traverse(SEL);
    
    const working = results.filter(r => r.status === '✅').length;
    const warnings = results.filter(r => r.status === '⚠️').length;
    
    console.log('═══════════════════════════════════════════════════');
    console.log('         РЕЗУЛЬТАТЫ ПРОВЕРКИ СЕЛЕКТОРОВ            ');
    console.log('═══════════════════════════════════════════════════');
    console.log(`✅ Работают: ${working}/${results.length}`);
    if (warnings) console.log(`⚠️ Не найдены (возможно OK): ${warnings}`);
    console.log('');
    console.table(results.map(r => ({
        'Путь': r.path,
        'Статус': r.status,
        'Примечание': r.note || ''
    })));
    console.log(`\n📅 Проверка: ${new Date().toISOString().split('T')[0]}`);
})();
```

**Примечание:** Некоторые селекторы (например `generation.stopButton`) могут показывать `⚠️` когда Claude не генерирует ответ — это нормально.

---

## История изменений

### 2026-02-22 (v4.3.0)

- **Эвристический поиск `__findElSmart__`** — при сломанном selectors.json автоматически пробует поиск через aria-*, role, contenteditable
- **Health-check при запуске** — `runSelectorHealthCheck()` проверяет 5 критических селекторов, сломанные логирует в `diagnostics.json`
- **Дедупликация логов** — fallback не логируется чаще раза в 5 минут на селектор
- `hideSidebar`, `setupSidebarObserver`, `truncateChatTitle` переведены на `__findElSmart__`

### 2026-01-29 (v4.2.0)

- **Полная централизация селекторов** в `selectors.json`
- Удалены хардкоженные селекторы из main.rs
- Новая структура: `generation.*`, `input.*`, `navigation.*`, `project.*`, `ui.*`
- Удалён неиспользуемый `fieldsetButtons`
- Обновлён скрипт автопроверки для новой структуры

### 2026-01-27 (v4.2.0)

- Все селекторы проверены и работают
- Добавлены `STREAMING_INDICATOR`, `THINKING_INDICATOR`

### 2026-01-16 (v4.1.0)

- Исправлен `SEND_BUTTON`: регистр "Send message"
- Начальная централизация селекторов

---

## Связанные документы

- [04-CLAUDE.md](../04-CLAUDE.md) — Интеграция с Claude
- [03-BACKEND.md](../03-BACKEND.md) — Rust backend
- [FAQ.md](FAQ.md) — Типичные проблемы
