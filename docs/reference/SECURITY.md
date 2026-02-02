# Безопасность

[← Назад к INDEX](../INDEX.md)

Документация по безопасности AI Prompts Manager.

---

## Обзор архитектуры безопасности

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Window                             │
├───────────────────┬─────────────────────────────────────────┤
│   Main WebView    │   Claude WebView                        │
│   (Trusted)       │   (Sandboxed)                           │
│                   │                                         │
│   ✓ localStorage  │   ✓ claude.ai session                   │
│   ✓ Tauri IPC     │   ✓ CDP injection                       │
│   ✗ Network       │   ✓ Full network                        │
└───────────────────┴─────────────────────────────────────────┘
```

---

## Хранение данных

### localStorage (Main WebView)

| Данные | Ключ | Чувствительность |
|--------|------|------------------|
| Вкладки и блоки | `ai-prompts-manager-tabs` | Низкая |
| Настройки | `ai-prompts-manager-settings` | Низкая |
| URL чатов Claude | `claudeSettings.tabUrls` | Средняя |
| UUID активного проекта | `active-project` | Средняя |

**Риски:**
- localStorage не шифруется
- Доступен любому коду в Main WebView
- Лимит ~5-10MB

**Митигация:**
- Чувствительные данные (API ключи, пароли) **не хранятся**
- Сессия Claude хранится в WebView2, не в localStorage

### Файловая система (App Data)

| Файл | Путь | Содержимое |
|------|------|------------|
| `downloads_log.json` | `%LOCALAPPDATA%/com.ai.prompts.manager/` | Лог загрузок |
| `archive_log.json` | То же | Лог архивов |
| `downloads_settings.json` | То же | Путь загрузок |

**Защита:**
- Файлы в AppData защищены правами пользователя Windows
- `archive_log.json` бэкапится при сбросе приложения

---

## Claude WebView Security

### Session Management

- Сессия Claude.ai хранится в WebView2 (Microsoft Edge storage)
- APM **не имеет доступа** к cookies/tokens Claude
- Авторизация происходит через стандартный UI Claude

### CDP (Chrome DevTools Protocol)

APM использует CDP для:
1. Выполнения JavaScript в контексте claude.ai
2. Получения результатов async операций
3. Вставки текста в редактор

**Что может CDP:**
```javascript
// Выполнить любой JS в контексте страницы
Runtime.evaluate({ expression: "..." })

// Получить DOM элементы
// Сделать fetch запросы от имени страницы
// Читать/писать localStorage Claude
// Доступ к non-HttpOnly cookies через document.cookie (HttpOnly cookies защищены браузером)
// Примечание: APM не читает и не использует cookies by design
```

**Риски:**
- CDP имеет полный доступ к странице Claude
- Теоретически может читать чаты, историю
- Может делать API запросы от имени пользователя
- Доступ к non-HttpOnly cookies (HttpOnly защищены браузером)

**Митигация:**
- APM использует CDP только для конкретных операций
- Код инъекций открыт и проверяем (`claude_helpers.js`)
- Нет отправки данных на внешние серверы
- Cookies сессии не читаются и не передаются
- Весь код выполняется локально

### Инжектируемые скрипты

| Скрипт | Назначение |
|--------|------------|
| `initClaudeUI()` | Скрытие sidebar, ghost button |
| `setupUploadInterceptor()` | Подсчёт загруженных файлов |
| `setupUrlChangeDetection()` | Отслеживание навигации |

**Код скриптов:** `src-tauri/scripts/claude_helpers.js`

---

## Tauri Security

### Capabilities (Permissions)

```json
// src-tauri/capabilities/default.json
{
  "permissions": [
    "core:default",
    "core:app:default",
    "opener:default",
    "updater:default",
    "process:default",
    "dialog:default",
    "dialog:allow-save",
    "dialog:allow-open",
    "fs:default",
    "fs:allow-write-text-file",
    "fs:allow-read-text-file"
  ]
}
```

### IPC Security

- Все Tauri commands проходят через `invoke()`
- Параметры валидируются на Rust стороне
- Ошибки возвращаются как `Result<T, String>`

```rust
#[tauri::command]
fn example(param: String) -> Result<String, String> {
    // Валидация
    if param.is_empty() {
        return Err("Parameter required".to_string());
    }
    Ok(result)
}
```

### Input Validation

**На стороне Rust (main.rs):**

| Команда | Валидация |
|---------|-----------|
| `set_panel_ratio(ratio)` | `ratio.clamp(35, 65)` — ограничение диапазона |
| `switch_claude_tab(tab)` | `tab` должен быть 1-3 |
| `read_file_for_attachment(path)` | Проверка существования файла |
| `write_temp_file(filename, content)` | Санитизация имени файла |

**На стороне JavaScript:**

| Функция | Защита |
|---------|--------|
| `escapeHtml(str)` | XSS protection — экранирование `<>&"'` |
| `isValidTab(tab)` | Проверка структуры вкладки |
| `isValidTabsStructure(tabs)` | Валидация всех вкладок |
| `repairTab(tabId, tab)` | Восстановление повреждённых данных |

```javascript
// utils.js
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// storage.js
function isValidTab(tab) {
    return tab && 
           typeof tab.id === 'string' && 
           typeof tab.name === 'string' && 
           Array.isArray(tab.items);
}
```

**Sanitization промптов:**

Текст промптов **не санитизируется** намеренно — пользователь должен иметь возможность вставлять любой текст, включая HTML/JS для технических промптов. Экранирование происходит только при рендеринге в UI через `escapeHtml()`.

---

## Обновления

### Подпись релизов

- Все релизы подписываются приватным ключом
- Публичный ключ встроен в приложение (`tauri.conf.json`)
- WebView2 не позволяет установить неподписанное обновление

```json
// tauri.conf.json
"plugins": {
  "updater": {
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6..."
  }
}
```

### Хранение ключей

| Ключ | Где хранится | Доступ |
|------|--------------|--------|
| Приватный | GitHub Secrets | Только CI |
| Публичный | В коде приложения | Открытый |

**ВАЖНО:** Приватный ключ **никогда** не должен попадать в репозиторий.

---

## Remote Prompts Security

### Загрузка промптов

```
GitHub (raw.githubusercontent.com)
         │
         ▼
    manifest.json → версии, release_notes
         │
         ▼
    *.json → данные вкладок
         │
         ▼
    localStorage (Main WebView)
```

**Риски:**
- Компрометация GitHub аккаунта → вредоносные промпты
- MITM атака (маловероятно, HTTPS)

**Митигация:**
- Промпты — только текст, не исполняемый код
- Кастомные вкладки пользователя не перезаписываются

---

## External Dependencies

### Tailwind CSS (CDN)

**Текущий статус:** Tailwind загружается через CDN в JIT-режиме.

```html
<script src="https://cdn.tailwindcss.com"></script>
```

**Почему используется CDN:**
1. **JIT-компиляция в браузере** — Tailwind сканирует DOM и генерирует только используемые классы на лету
2. **Динамические классы** — приложение использует классы, формируемые в runtime (например, в JS-шаблонах)
3. **Отсутствие build pipeline** — проект не использует webpack/vite/etc., добавление build step усложнит разработку
4. **Риск регрессий** — переход на статический CSS может сломать стили, которые генерируются динамически

**Почему НЕ переходим на локальный bundle:**
- Потребуется полный аудит всех динамически генерируемых классов в JS
- Нужно настроить build pipeline (npm scripts, watch mode для разработки)
- Высокий риск пропустить классы и получить сломанные стили
- Трудозатраты не оправданы для внутреннего desktop-приложения

**Риски CDN:**
- При компрометации CDN — потенциальный script injection
- Без интернета стили не загрузятся (первый запуск)

**Митигация:**
- Desktop-приложение, не публичный веб-сервис
- Работает только на доверенных устройствах пользователя
- CDN Tailwind широко используется и мониторится
- После первой загрузки браузер кэширует скрипт

**Статус:** Принятое ограничение. Риск признан приемлемым для внутреннего инструмента.

---

## Рекомендации пользователям

### DO ✓

- Используй приложение только на доверенных устройствах
- Держи Windows и WebView2 в актуальном состоянии
- Выходи из Claude.ai после работы с чувствительными данными

### DON'T ✗

- Не храни API ключи или пароли в блоках промптов
- Не устанавливай приложение из непроверенных источников
- Не отключай автообновления

---

## Отчёты о безопасности

> **Примечание:** Это внутренний проект для личного использования. Публичные issue и внешние контрибьюторы не предполагаются.

---

## Связанные документы

- [LIMITATIONS.md](LIMITATIONS.md) — Ограничения
- [03-BACKEND.md](../03-BACKEND.md) — Tauri commands
- [04-CLAUDE.md](../04-CLAUDE.md) — Claude интеграция
