# Changelog

[← Назад к INDEX](../INDEX.md)

Все значимые изменения проекта документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

---

## [4.4.13] - 2026-04-12 {#v4413}

### Исправления

- **Сдвиг холста влево при фонах «Волны»/«Квадраты» в view mode:** animated bg wraps (`position: sticky`) участвовали в потоке перед wrapper с `margin: 0 auto`, смещая центрирование. В view mode заменены на `position: absolute`.

### Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `dist/css/styles.css` | `.waves-wrap`, `.squares-wrap`, `.grid3d-wrap` → `position: absolute` в view mode |

---

## [4.4.12] - 2026-04-12 {#v4412}

### Исправления

- **Откат перехвата login-страниц:** фикс логина из v4.4.10 (`switch_claude_tab` перенавигировал с `/login`, `/oauth`, `/signin`) ломал OAuth flow — Claude использует эти URL для нормальной аутентификации, перенавигация создавала бесконечный цикл. Откачено: `switch_claude_tab` перенавигирует только с `about:blank`.

### Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `src-tauri/src/commands/claude.rs` | Откат login-page detection в `switch_claude_tab` |

---

## [4.4.11] - 2026-04-12 {#v4411}

### Новые функции

- **Вертикальное уменьшение блоков:** минимальная высота нод уменьшена с 440px до 160px. Блоки можно ресайзить до состояния «только заголовок + кнопки», textarea полностью скрывается. Минимальная высота вычисляется динамически для каждого блока (header + footer + instruction/add strips). При рендере сохранённые высоты кэмпятся к минимуму чтобы footer не обрезался.

### Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `dist/css/styles.css` | `--node-min-height` 440→160 |
| `dist/js/config.js` | `NODE_MIN_HEIGHT` 440→160 |
| `dist/js/workflow-interactions.js` | Динамический расчёт minHeight при ресайзе (header + footer + instruction + attachments-add) |
| `dist/js/workflow-render.js` | Пересчёт минимальной высоты при рендере для сохранённых размеров |

---

## [4.4.10] - 2026-04-08 {#v4410}

### Исправления

- **Кнопки чата блокируются при отправке в другой чат:** `updateWorkflowChatButtons()` делал полный `innerHTML` rebuild всех кнопок при каждом `updateClaudeUI()` (вызывается ~15 раз за отправку). DOM уничтожался и пересоздавался → клики по другим кнопкам терялись. Переписан на точечное обновление `disabled` атрибута на существующих кнопках без пересоздания DOM.
- **Чаты 2 и 3 требуют повторный логин:** после логина в табе 1 табы 2 и 3 оставались с кэшированной страницей логина. `switch_claude_tab` теперь перенавигирует табы застрявшие на `/login`, `/oauth`, `/signin` на `claude.ai/new` (куки уже есть от таба 1).
- **Ложное уведомление об обновлении:** Tauri updater мог возвращать `available: true` для уже установленной версии (CDN-кэш, edge cases). Добавлена проверка: если remote-версия совпадает с текущей (с учётом префикса `v`) — обновление не предлагается.

### Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `dist/js/claude-ui.js` | `updateWorkflowChatButtons()` — точечный `btn.disabled = busy` вместо `innerHTML` rebuild |
| `dist/js/updates.js` | Сравнение версий перед показом модалки обновления |
| `src-tauri/src/commands/claude.rs` | `switch_claude_tab` перенавигирует с login-страниц |

---

## [4.4.9] - 2026-04-08 {#v449}

### Исправления

- **Маркеры скриптов (W) возвращаются после удаления:** две причины: (1) `exportConfig()` делал `{ ...item }` spread-копию, которая включала старый `item.scripts` из данных вкладки, а условие `if (scripts.length > 0)` не срабатывало для очищенных скриптов — поле не удалялось из копии; (2) `applyPromptsUpdate()` при загрузке с GitHub перезаписывала локальные `blockScripts` данными из remote items. Исправлено: экспорт явно удаляет `scripts`/`collapsed`/`automation` если они пустые, remote-промпты не трогают локальные настройки блоков.
- **`GITHUB_API_BASE`, `GITHUB_OWNER`, `GITHUB_REPO`** — добавлены пропущенные константы в `project-manager.py` (NameError при push)

### Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `dist/js/export-import.js` | Экспорт явно удаляет scripts/collapsed/automation из spread-копии если пустые |
| `dist/js/remote-prompts.js` | `applyPromptsUpdate()` не импортирует scripts/automation из remote items |
| `project-manager/project-manager.py` | Добавлены GITHUB_API_BASE, GITHUB_OWNER, GITHUB_REPO |

---

## [4.4.8] - 2026-04-07 {#v448}

### Исправления

- **Кнопки чата пропадают после обновления:** `performReset()` (при смене версии) чистил `active-project` в localStorage, но `ProjectFSM.restore()` уже отработал до этого и установил `_state = 'bound'` в памяти. Результат: `isProjectActive()` возвращал `true` → кнопки чата скрыты на всех вкладках кроме ownerTab, при этом кнопка «Завершить проект» не отображалась (данных в localStorage уже нет). Исправлено: `performReset()` сбрасывает `ProjectFSM` в памяти, `renderWorkflow()` проверяет консистентность FSM с localStorage при каждом рендере.

### Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `dist/js/persistence.js` | `performReset()` сбрасывает `ProjectFSM._state/data` + скрывает кнопку «Завершить проект» |
| `dist/js/workflow-render.js` | Safety-net: если FSM `!= idle` но localStorage пуст → force-reset |

---

## [4.4.7] - 2026-04-06 {#v447}

### Исправления

- **Оффлайн-режим десинхронизируется:** `setOfflineMode` стал идемпотентным (проверяет текущее значение перед изменением), `renderWorkflow` вызывает `applyOfflineMode()` в начале для пересинхронизации CSS-класса body с настройками, обработчики кнопок перечитывают `getSettings().offlineMode` для визуального обновления
- **Селекторы Claude.ai v1.2.0:** усилены хвристики `sendButton` (поиск по `fieldset`, фоллбэк на последнюю кнопку в области ввода), `stopButton` (фоллбэк на кнопку с квадратной SVG-иконкой, `aria-label*="Cancel"`), `scrollContainer` (фоллбэк через `getComputedStyle` на потомков `main`)

### Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `dist/js/settings.js` | `setOfflineMode` идемпотентный |
| `dist/js/workflow-render.js` | `applyOfflineMode()` в начале `renderWorkflow` |
| `dist/js/init.js` | Обработчики оффлайн-кнопок перечитывают settings |
| `src-tauri/scripts/claude_helpers.js` | Усилены хвристики sendButton, stopButton, scrollContainer |
| `src-tauri/scripts/selectors.json` | v1.2.0 |

---

## [4.4.5] - 2026-03-27 {#v445}

### Новые функции

#### Agent Skills — скиллы Claude
- **Кнопка «Скиллы»** в настройках — скачивает `.skill` файлы с GitHub и привязывает к аккаунту Claude за один клик
- **Модуль `remote-skills.js`** — одна функция `refreshAndBindSkills()`: скачать манифест → скачать файлы → привязать через CDP
- **Функция `uploadSkillsToClaude()`** в claude-api.js — CDP eval → atob → Blob → FormData → fetch к `/api/organizations/{orgId}/skills/upload-skill?overwrite=true`
- **4 скилла в комплекте:** `content-writing-style`, `html-page-design`, `logo-and-branding`, `quality-audit`
- **Project Manager:** push скиллов в меню Push (рядом с промптами), автоинкремент версии манифеста

#### Автопочинка пайплайнов
- **`repairWorkflowState()`** в workflow-state.js — при загрузке вкладки автоматически чинит:
  - Соединения: удаление битых ссылок, self-connections, дубликатов, починка невалидных сторон
  - Позиции: удаление осиротевших, починка NaN-координат
  - Размеры: удаление осиротевших, починка невалидных значений
  - Цвета и заметки: удаление ссылок на несуществующие блоки

#### Новые языки и гео
- **Исландия (IS)** — исландский язык, locale is-IS
- **Латвия (LV)** — латышский язык, locale lv-LV
- **Эстония (ET)** — эстонский язык, locale et-EE
- **Ирландия (GA)** — ирландский язык, locale ga-IE
- **Люксембург (LB)** — люксембургский язык, locale lb-LU
- **Лихтенштейн** — добавлен в мультигео немецкого (de-LI)
- **Люксембург** — добавлен в мультигео немецкого (de-LU) и французского (fr-LU)
- **Перу** — добавлен в мультигео испанского (es-PE), ES стал мультигео
- **Финляндия (шведский)** — добавлен в мультигео шведского (sv-FI), SE стал мультигео
- Итого: 25 языков, 43 гео-варианта (было 20/32)

### Исправления

- **Мерцание кнопок при генерации:** `updateClaudeUI()` вызывается только при реальном изменении статуса, а не каждые 500мс. Убран полный innerHTML-перезапись кнопок на каждом тике
- **Мерцание hover на кнопках:** `transition: all` заменён на конкретные свойства (`background`, `border-color`, `opacity`), убраны `title` атрибуты (тултип WebView2 крал фокус мыши)
- **Marquee selection улетает:** координаты учитывают `scrollLeft/scrollTop` контейнера
- **Undo/redo троит:** throttle 200мс на `undo()` (защита от key repeat), буфер 50 → 15 шагов
- **Нагрузка на систему:** интервал поллинга генерации 500мс → 2000мс
- **Устаревшие селекторы Claude.ai:** обновлены `sendButton`, `stopButton`, `leftNav`, `scrollContainer` — добавлены case-insensitive флаги, `data-testid` фоллбэки, массивы вместо строк
- **Фон «Матрица» обрезается:** высота inner привязана к `container.clientHeight` через `ResizeObserver` вместо ненадёжных `vh`-единиц
- **Чёрный экран Claude WebView:** авто-ретрай навигации на claude.ai через 10 сек если таб не загрузился

### Изменено

- **Ширина модалки настроек:** 400px → 460px (три кнопки в ряд)
- **Project Manager:** убран ввод сообщения коммита из push (автоматический текст), убраны release notes для промптов
- **Селекторы:** версия 1.0.0 → 1.1.0

### Новые файлы

| Файл | Описание |
|------|----------|
| `dist/js/remote-skills.js` | Модуль скачивания и привязки скиллов |
| `skills/manifest.json` | Манифест скиллов для GitHub |
| `skills/*.skill` | 4 файла скиллов |

### Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `dist/index.html` | Кнопка «Скиллы», ширина 460px, убрана модалка release notes промптов, IS/LV/GA/LB/ES/SE в дропдауне |
| `dist/css/styles.css` | Анимация `#manual-skills-check-btn.checking`, точечный transition на `.workflow-node-btn` |
| `dist/js/claude-api.js` | `uploadSkillsToClaude()`, интервал поллинга 500→2000мс, `updateClaudeUI` только при `changed` |
| `dist/js/workflow-state.js` | `repairWorkflowState()` — автопочинка при загрузке |
| `dist/js/workflow-interactions.js` | Marquee координаты с учётом scroll |
| `dist/js/workflow-render.js` | Убраны title с кнопок |
| `dist/js/undo.js` | `MAX_HISTORY_SIZE` 50→15, throttle 200мс на undo |
| `dist/js/remote-prompts.js` | Убраны releaseNotes из всех функций |
| `dist/js/persistence.js` | Убрана `initializeDefaultSkills()`, очистка `remote-skills*` |
| `dist/js/init.js` | Обработчик кнопки «Скиллы», авто-ретрай загрузки Claude WebView |
| `dist/js/languages.js` | IS, LV, ET, GA, LB + мультигео LI, LU, PE, FI(sv) |
| `dist/js/language-ui.js` | IS, LV, ET, GA, LB в langTexts |
| `dist/js/settings.js` | ResizeObserver для grid3d высоты |
| `src-tauri/scripts/selectors.json` | v1.1.0 — обновлены 4 критических селектора |
| `project-manager/project-manager.py` | Push скиллов, убраны commit message и release notes промптов |

### Удалённые файлы

| Файл | Причина |
|------|---------|
| `RELEASE_NOTES_PROMPTS.txt` | Неиспользуемый функционал |

---

## [4.4.0] - 2026-03-15 {#v440}

### Новые функции

#### Claude Counter — usage и кэш в Claude WebView
- **Интеграция плагина Claude Counter v0.4.2** (MIT License) — переписан для WebView2 без monkey-patching
- **Cache timer** — обратный отсчёт 5-минутного окна кэширования после ответа Claude
- **Usage bars** — прогресс-бары session (5h) и weekly (7d) с обратным отсчётом до сброса, отображаются под toolbar чата
- **Без monkey-patching:** `window.fetch` и `history.pushState/replaceState` не патчатся — данные получаются через прямой `fetch` к `/api/organizations/{orgId}/usage` и `/chat_conversations/{id}?tree=true`
- **Generation detection** — через существующий APM-механизм URL hash `#generating`, без перехвата SSE
- **URL change detection** — через `popstate` + polling (1.5 сек), без патчинга history
- **Инжекция:** CSS через style element (`_ccs`), JS через `get_claude_init_script()` в `scripts.rs`
- **Новые файлы:** `src-tauri/scripts/claude_counter.js`, `claude_counter.css`

#### Claude WebView: toolbar auto-hide
- **Toolbar скрыт по умолчанию** — вместо него видна тонкая полоска-индикатор (36×4px)
- **Hover на индикатор** показывает toolbar с анимацией 0.2s, hover на toolbar держит его видимым
- **Auto-hide** через 1 сек после ухода мыши (задерживается, если открыт менеджер загрузок)

#### Claude WebView: скрытие дисклеймера
- **Скрыт элемент** "Claude is AI and can make mistakes" через CSS `a[href*="claude-is-providing-incorrect"]{display:none}`

#### Knowledge Upload — автозагрузка MD в проект
- **Автоматическая загрузка** скачанных `.md` файлов в knowledge активного проекта Claude
- **Поток:** `download-finished` → проверка `.md` + `isProjectActive()` → `uploadToProjectKnowledge()` → toast → удаление файла с диска
- **API:** `POST /api/organizations/{orgId}/projects/{uuid}/docs` через CDP eval с JSON body (`file_name` + `content`)
- **Чтение файла** через существующую команду `read_file_for_attachment`, удаление через `delete_download`
- **Новая функция:** `uploadToProjectKnowledge(filePath, filename)` в `claude-api.js`

#### Автосбор данных из Google (SERP Scraper)
- **Новый тип блока на холсте** — скрапер с настраиваемыми поисковыми запросами
- **Скрытый WebView2:** создаётся невидимый Chromium-инстанс, выполняет серию запросов в Google, фетчит и очищает HTML каждой страницы
- **Извлечение:** `serp_extract.js` парсит органические результаты из Google SERP
- **Интеграция с workflow:** скрапер-блок подключается к другим блокам через порты, результаты загружаются в knowledge проекта
- **3 новые Tauri-команды:** `create_scraper_webview`, `destroy_scraper_webview`, `scrape_google_serp`
- **Новые файлы:** `src-tauri/src/commands/scraper.rs`, `src-tauri/scripts/serp_extract.js`

#### Auto-Continue — автоматическое продолжение при tool-use limit
- **Адаптация плагина claude-autocontinue** (MIT License) — переписан для WebView2 без extension API
- **Двухступенчатая детекция:** видимая кнопка Continue + фраза о tool-use limit в последнем сообщении ассистента — исключает ложные срабатывания при обычном завершении задачи
- **Антибот:** рандомная задержка 1.5-3 сек перед кликом, поллинг с jitter 2-4 сек, повторная проверка перед кликом
- **button.click()** — тот же механизм, что APM использует для sendButton (claude.rs строка 620)
- **Toast через Tauri emit** → Main WebView `showToast()` — без самодельных DOM-элементов в Claude WebView
- **Настройка:** тогл в Настройки → Дополнительно, по умолчанию включён, синхронизируется во все Claude табы
- **Глобал:** `window._ac` (setEnabled/enabled), `window._emit` (кэшированный Tauri emit)
- **Новый файл:** `src-tauri/scripts/claude_autocontinue.js`

### Улучшения

#### Покраска блоков
- **Цветовая маркировка** блоков в пайплайнах через контекстное меню — 8 пресетов + произвольный цвет через color picker
- Цвет сохраняется в `workflowColors[blockId]` и применяется к заголовку блока при рендере

#### View mode: zoom и pan
- **Масштабирование колёсиком мыши** в view mode — zoom с ограничением от `viewModeBaseZoom` до `ZOOM_MAX`
- **Навигация кликом средней кнопки** — pan по холсту без переключения в edit mode

#### Новый гео: Эфиопия (ET)
- Добавлена Эфиопия (`code: 'et'`, `locale: 'en-ET'`) в список поддерживаемых стран

#### Sticky notes: увеличенная зона захвата
- **`.workflow-note-handle`** height: 20px → 32px — зона перетаскивания заметок на 60% больше

#### Workflow canvas: симметричное расширение
- **Убрано ограничение** `y = Math.max(gridSize, y)` в `onNodeDrag` и `onNodeResize` — блоки и заметки перемещаются вплоть до координат (0,0), используя полные 2500px запаса до CANVAS_CENTER
- Координаты клэмпятся в `Math.max(0, ...)` — отрицательные значения запрещены, т.к. canvas рендерится от (0,0)

### Исправления

#### Множественные загрузки: автоматическое разрешение
- **Проблема:** WebView2 (Edge) показывал диалог «Allow multiple downloads?» при скачивании нескольких файлов из Claude. Если пользователь нажимал «Нет» или пропускал окно — все множественные загрузки блокировались до переустановки
- **Решение:** `allow_claude_multiple_downloads()` в `webview/manager.rs` — прописывает разрешение `automatic_downloads` для `claude.ai` в Chromium Preferences (`EBWebView/Default/Preferences`) до создания WebView2. Запускается в `main.rs` setup. Если ранее было отказано — исправляется при следующем запуске
- **Формат:** `profile.content_settings.exceptions.automatic_downloads["https://claude.ai,*"].setting = 1` (CONTENT_SETTING_ALLOW)

#### Undo/Redo: sticky notes не удаляются
- **Проблема:** при undo/redo заметки исчезали — `applyState()` записывала workflow snapshot без `notes` в localStorage, затирая их
- **Решение:** при записи workflow в localStorage во время undo/redo сохраняются текущие `workflowNotes`: `{ ...state.workflow, notes: workflowNotes }`

#### Мелькание чёрного прямоугольника при запуске
- **Проблема:** при создании Claude WebView на `(0,0)` + `hide()` в микрозазор между `add_child` и `hide()` вебвью успевала отрисоваться поверх UI
- **Решение:** начальная позиция `(0,0)` → `(width*2, 0)` — создание за экраном, мелькание невозможно

### Улучшения UX

#### Модалка редактирования промпта (view mode)
- **Увеличена площадь:** `max-width` 900→1100px, `max-height` 88→92vh, textarea `min-height: 70vh`
- **Класс `view-mode`** на `.workflow-edit-modal-content` — отдельные стили для view mode
- **Edit mode** не затронут

### Удаление мёртвого кода

#### 9 неиспользуемых Tauri-команд (60 → 51)
- **Удалены команды:** `forward_click`, `forward_scroll` (toolbar.rs), `add_download_entry` (logs.rs), `get_tabs_file_size` (storage.rs), `increment_upload_count` (attachments.rs), `set_downloads_path` (downloads.rs), `preload_claude`, `new_chat_in_tab`, `reload_claude_tab` (claude.rs)
- **Удалены helper-функции:** `get_scroll_script()`, `get_click_script()` из scripts.rs (вызывались только из удалённых команд)
- **Удалена заглушка:** `setup_title_change_monitor()` — no-op с v4.3.4, мониторинг через JS CDP
- **Удалён файл:** `src-tauri/scripts/page_clean.js` — не подключён через `include_str!`, 0 ссылок

### Файлы

`dist/css/styles.css`, `dist/js/workflow-interactions.js`, `dist/js/workflow-render.js`, `dist/js/workflow-zoom.js`, `dist/js/context-menu.js`, `dist/js/undo.js`, `dist/js/claude-api.js`, `dist/js/init.js`, `dist/js/tabs.js`, `dist/js/languages.js`, `dist/index.html`, `dist/toolbar.html`, `src-tauri/src/webview/scripts.rs`, `src-tauri/src/webview/manager.rs`, `src-tauri/src/utils/dimensions.rs`, `src-tauri/src/commands/scraper.rs` (новый), `src-tauri/scripts/claude_counter.js` (новый), `src-tauri/scripts/claude_counter.css` (новый), `src-tauri/scripts/serp_extract.js` (новый)

---

## [4.3.7] - 2026-03-08 {#v437}

### Улучшения

#### Динамический размер холста workflow
- **`getCanvasSize()`** — размер холста вычисляется динамически: `max(CANVAS_CENTER * 2, contentMaxCoord + CANVAS_PADDING)`. Минимум 5000px (покрывает зону автопозиционирования), расширяется при перетаскивании блоков за границы
- **Кэширование:** `_cachedCanvasSize` пересчитывается только при `invalidateCanvasSize()` (drag end, resize end, render) — нулевая нагрузка во время перетаскивания
- **Live-расширение при drag:** если блок приближается к краю текущего холста, scrollable area расширяется на лету (без пересчёта bounds всех нод)
- **`CANVAS_PADDING: 1500`** — отступ за пределы контента для свободного перемещения
- Все 7 ранее захардкоженных `5000` заменены на `getCanvasSize()`: `adjustWorkflowScale`, scroll limits, pan limits, grid bounds, auto-positioning

#### Инлайн-подтверждение очистки лога
- Кнопка «Очистить лог» в модалке архива: первый клик → «Точно очистить?» (красная), второй → очистка. Автосброс через 3 секунды. Убран `confirm()` (нативный диалог ОС)

### Исправления

#### Undo/Redo: объединение действий + удаление заметок
- **Группировка ввода ослаблена:** `SNAPSHOT_DEBOUNCE_MS` 1000 → 300мс, `INPUT_GROUP_MS` 2000 → 800мс. Дискретные действия (удаление блока, перемещение) больше не схлопываются в одну операцию undo
- **Notes исключены из undo:** `captureFullState()` удаляет `tabData.notes` из snapshot. `applyState()` сохраняет текущие notes при восстановлении. Заметки больше не исчезают при Ctrl+Z

#### Вставка текста с файлами
- **`insertContent` как единственный метод:** `ClipboardEvent('paste')` убран — не работал надёжно при наличии прикреплённых файлов. `editor.commands.insertContent()` — штатный метод ProseMirror, который Claude.ai вызывает сам при любом пользовательском вводе. Работает с любым состоянием UI

#### Индикатор генерации при навигации
- **Сброс генерации при навигации:** URL hash `#generating` сбрасывается при переходе на другую страницу. Предотвращает залипание индикатора

#### Маскировка Tauri-артефактов в Claude WebView
- **Глобальные переменные замаскированы:** `window.__SEL__` → `_s`, `window.__CLAUDE_TAB__` → `_t`, `window.__generationMonitorInstalled` → `_g0`, и все остальные `__xxx__` → короткие `_xx`. Нечитаемые имена неотличимы от минифицированного кода любого extension
- **`window.__TAURI__` удаляется** из Claude WebView через 3 сек после инициализации (invoke закэширован в `window._inv`). Datadog RUM и другие скрипты больше не видят маркер Tauri
- **`tauri-custom-styles`** → `_cs` — id инжектированного style элемента замаскирован
- **Не затронуто:** main webview (dist/js/*.js) — невидим для Claude.ai, маскировка не нужна

---

## [4.3.4] - 2026-03-08 {#v434}

### Исправления

#### Антибот-совместимость: удаление monkey-patching
- **Удалён `setupFetchInterceptor()`** — перехват `window.fetch` с обёрткой `ReadableStream` для `/completion` и клонированием response для `/upload-file`. Вероятная причина блокировок аккаунтов
- **Удалён патчинг `history.pushState`/`history.replaceState`** — детектируется через `.toString()`. Заменён на `popstate` listener + `setInterval(checkUrlChange, 2000)`
- **Удалена передача данных через URL** — параметры `__apm_org` и `__apm_project` в `history.replaceState` убраны. Organization ID читается из cookie `lastActiveOrg` через CDP
- **Удалён `fetch('/api/organizations')`** — fallback для получения org_id через внутренний API Claude убран

#### Вставка текста: ClipboardEvent вместо ProseMirror API
- **`insert_text_to_claude`** — 3 fallback-уровня (`editor.commands.insertContent`, `editorView.dispatch`, `innerHTML`) заменены на `ClipboardEvent('paste')`. ProseMirror обрабатывает paste через свой штатный pipeline — идентично реальному Ctrl+V
- **Рандомная задержка перед Send** — 300–700мс вместо фиксированных 200мс

#### Мониторинг генерации: DOM polling + Rust CDP
- **Активный таб:** `setupGenerationMonitor()` — `setInterval` 700мс, проверяет stop button / streaming / thinking indicator через `document.querySelector`
- **Фоновые суспендированные табы:** `start_generation_polling()` — Rust `tokio` loop каждые 800мс, CDP `Runtime.evaluate` с `GENERATION_CHECK_SCRIPT`. Работает на суспендированных WebView2 без пробуждения. Debounce 3 проверки (~2.4 сек) перед сбросом статуса
- **Старт генерации:** сигнализируется из `sendTextToClaude` при auto-send через `set_generation_state`
- **Подсчёт загрузок:** исключительно Rust `WebResourceRequested` — JS fallback через CDP eval убран

#### Мелкие исправления
- **Оффлайн-режим:** `offlineMode: true` → `false` по умолчанию в `DEFAULT_SETTINGS`
- **Маркеры языка:** убран `title="${tooltip}"` с `<span class="lang-marker">` — всплывающие подсказки `lang:nom.m` больше не появляются

### Документация
- Обновлены `04-CLAUDE.md`, `01-OVERVIEW.md`, `03-BACKEND.md`, `SECURITY.md`, `STABILITY-IMPROVEMENTS.md`, `LIMITATIONS.md`, `ADR.md`, `QUICKSTART.md`
- Секции Upload Interceptor и URL Change Detection в `STABILITY-IMPROVEMENTS.md` помечены как решённые
- Счётчик Tauri команд 55 → 57 (`init_claude_webviews`, `set_generation_state`)
- Добавлена константа `GENERATION_CHECK_SCRIPT` в таблицу `scripts.rs`

---

## [4.3.2] - 2026-03-03 {#v432}

### Исправления

#### Мониторинг генерации в скрытых Claude табах
- **Проблема:** Когда генерация в неактивном чате заканчивалась, индикатор и тост «Claude закончил» не срабатывали, пока вручную не переключишься на этот чат
- **Причина:** `setInterval` и `MutationObserver` в скрытых WebView2 (`IsVisible=false`) throttle-ятся или откладываются — любой JS-based мониторинг ненадёжен
- **Решение:** Полностью нативный мониторинг без JS polling:
  1. Fetch interceptor ставит zero-width space (`\u200B`) в `document.title` при начале SSE-стрима `/completion`, снимает при завершении
  2. COM-событие `DocumentTitleChanged` (browser process, не renderer) ловит изменение title — работает в скрытых webview
  3. Handler обновляет `AtomicBool` в `GENERATING_STATE[tab]` и эмитит событие `generation-state-changed`
  4. Фронтенд слушает событие для мгновенной реакции + polling `check_generation_status` (читает AtomicBool — ноль eval, ноль sleep) как fallback

#### Grid3D паттерн: доработка GPU-оптимизации
- Glow-эффект возвращён через `blur(1.5px)` вместо `blur(3px)` (~4× дешевле)
- Исправлен буфер верхней плоскости (новые линии больше не появлялись из ниоткуда)
- Убран `drop-shadow` с анимированных элементов

---

## [4.3.1] - 2026-03-02 {#v431}

### Исправления

#### Grid3D паттерн: GPU-композитная анимация
- **Проблема:** Паттерн «Матрица» вызывал значительное падение FPS — анимация `background-position` на 4 плоскостях с 3D-перспективой не использовала GPU-композитинг, каждый кадр вызывал repaint. Два glow-дубля с `filter: blur(3px)` пересчитывали blur 60 раз в секунду
- **Решение:** Сетка перенесена на `::before` псевдоэлементы, анимация заменена на `transform: translateY()` (GPU-композитное — ноль перерисовок). Glow-дубли с `blur(1.5px)` вместо `blur(3px)` (~4× дешевле). Исправлен буфер верхней плоскости (новые линии больше не появлялись из ниоткуда)

#### Документация
- Исправлены устаревшие числа строк в `01-OVERVIEW.md` (`main.rs`: 157 → 174, `claude_helpers.js`: 480 → 490)
- Исправлен подсчёт функций в `02-FRONTEND.md` (Claude модули: 47 → 48, всего: 330 → 340)
- Добавлена пропущенная команда `toolbar_recreate` в `06-ADDITIONAL-WEBVIEWS.md`
- Удалена устаревшая папка `docs-backup/`

#### project-manager.py
- **Баг:** `update_app_version()` не обновлял версию в `README.md` и `package.json` — исправлено
- **Баг:** `save_tab()` теряла поле `version` при конвертации flat → structured формат — исправлено
- Добавлено поле `notes: []` в дефолтный workflow во всех 5 местах
- Исправлена нумерация шагов релиза ([1/5]…[4/5] → [1/4]…[4/4])

#### CI
- Добавлен `package-lock.json` для корректной работы `npm ci` в GitHub Actions

---

## [4.3.0] - 2026-02-26 {#v430}

### Улучшения

#### Унификация скроллбаров
- **Единый стиль:** Удалены отдельные стили для textarea/input (бледный thumb + непрозрачный track) и меню/выпадающих списков (серый thumb) — всё наследует глобальные правила (5px, прозрачный track, `rgba(0,0,0,0.2)` thumb с hover `0.3`, тёмная тема инвертирована)
- **Track margin:** Отступы сверху/снизу чтобы ползунок не выходил за закруглённые углы — глобально 12px, workflow view mode 4px, downloads 4px/12px, textarea в модале редактирования 6px
- **Downloads:** Ширина 6px → 5px, добавлен hover-эффект на thumb
- **`#scroll-container`:** `overflow-y: scroll` → `auto` — полоска появляется только при переполнении

#### Undo/Redo v3: hash comparison + input grouping + lazy capture (Stability Step 11: #11)
- **djb2 hash comparison:** `hashTabData()` и `hashWorkflow()` — быстрая проверка изменений вместо `JSON.stringify` двух полных состояний. При коллизии хеша — дополнительная проверка по content/title
- **Input grouping:** `InputGroup` объединяет быстрые правки (пауза < 2 сек) в одну операцию undo. `classify(force)` возвращает стратегию: `new` (новый snapshot), `extend` (продолжить группу, skip), `close_and_new` (завершить группу + новый snapshot)
- **Lazy workflow capture:** `captureFullState()` захватывает workflow данные (positions, connections, sizes) только если `workflowMode === true` — экономит structuredClone в list mode
- **Crash-safe restoring:** `restoring = true` ставится ДО apply, сбрасывается в `finally` блоке (вместо прежнего ручного сброса после всех операций)
- **Полная обратная совместимость:** Все 16 call sites `UndoManager.snapshot()` работают без изменений. Public API идентичен v2

#### Z-Order: SetWindowPos вместо recreate (Refactoring Phase 2)
- **`raise_toolbar_zorder()`** — поднимает z-order toolbar/downloads через Win32 `SetWindowPos(HWND_TOP)` без пересоздания webview. Мгновенная операция, нет потери состояния, нет visual flash
- **Удалён `recreate_toolbar()`** — функция закрытия + пересоздания toolbar больше не нужна
- **Удалён `TOOLBAR_NEEDS_RECREATE: AtomicBool`** — флаг отложенного пересоздания больше не нужен
- **`ensure_claude_webview`** — при создании нового Claude webview вызывает `raise_toolbar_zorder()` вместо установки флага

#### Нативное скрытие webview: hide()/show() (Refactoring Phase 0)
> **Примечание:** В v4.4.0 создание webview изменено на гибридный подход: offscreen `(width*2, 0)` + `hide()` для устранения мелькания. Неактивные табы при открытой панели используют offscreen (IsVisible=TRUE), при закрытой панели — `hide()`.

- **`webview.hide()`/`show()`** — вместо позиционирования за экран (`set_position(width*2, 0)`). WebView2 `put_IsVisible(FALSE)` throttle-ит анимации, снижает CPU, очищает GPU кэши
- **`create_claude_webview`** — создание на `(0,0)` + `hide()` вместо `(width*2, 0)`
- **`ensure_toolbar`** — создание на `(0,0)` + `hide()` вместо `(-500, 0)`
- **`resize_webviews`** — активный таб: `show()`, неактивные: `hide()`, toolbar: `show()`/`hide()`
- **`show_downloads`/`hide_downloads`** — используют `show()`/`hide()` вместо позиционирования

#### Async startup (Refactoring Phase 3a)
- **`tauri::async_runtime::spawn`** — вместо `std::thread::spawn` для startup задач
- **`tokio::time::sleep`** — вместо `std::thread::sleep` (не блокирует thread pool)
- **Задержки уменьшены:** 950ms → 250ms (50ms UI resize + 200ms перед созданием табов)
- **Цикл `for tab in 1..=3`** — вместо трёх отдельных вызовов с паузами между ними

#### Error propagation (Refactoring Phase 4a)
- **`diagnostics.json` logging** — ошибки создания webview при startup и reset записываются в лог
- **`startup-error` event** — emit в UI при ошибках создания Claude webview или toolbar
- **`eprintln!`** — дублирование в stderr для отладки

#### Suspend/Resume неактивных табов (Refactoring Phase 1)
> **Примечание:** Впоследствии отключено в v4.3.4 — `TrySuspend()` замораживал DOM и ломал querySelector/insertContent на фоновых табах. Неактивные табы остаются живыми (offscreen-позиционирование + hide).

- **`suspend_claude_tab()`** — вызывает WebView2 `ICoreWebView2_3::TrySuspend()` для паузы script timers, анимаций, минимизации CPU
- **`resume_claude_tab()`** — вызывает `ICoreWebView2_3::Resume()` для мгновенного возобновления
- **Startup** — табы 2 и 3 suspended сразу после создания
- **`toggle_claude`** — suspend при скрытии, resume при показе
- **`switch_claude_tab`** — suspend предыдущий, resume новый

#### Декомпозиция resize_webviews (Refactoring Phase 5)
- **`layout_ui()`** — позиция и размер UI панели
- **`layout_claude()`** — show/hide Claude табов
- **`layout_overlay()`** — позиция toolbar, hide downloads
- **`resize_webviews()`** — тонкий оркестратор из 3 вызовов вместо god-функции

#### localStorage: гибридное хранение + мониторинг (Stability Step 9: #9)
- **Rust: `commands/storage.rs`** — 4 команды файлового хранения: `save_tabs_to_file`, `load_tabs_from_file`, `delete_tabs_file`, `get_tabs_file_size`. Атомарная запись (temp → rename), авто-бэкап, восстановление из бэкапа при повреждении
- **`StorageMonitor`** — мониторинг использования localStorage: `getUsageBytes()`, `getUsageFormatted()`, `getBreakdown()` (топ-10 тяжёлых ключей), `checkAndWarn()` (предупреждение при >80%)
- **Гибридное хранение:** `saveAllTabs()` — синхронно пишет в localStorage (кэш) + асинхронно в файл (backup). `getAllTabs()` — синхронно из localStorage, при старте `initHybridStorage()` синхронизирует файл ↔ localStorage
- **`initHybridStorage()`** — миграционная логика: если есть файл но нет localStorage → восстанавливает; если есть localStorage но нет файла → создаёт; оба есть → синхронизирует
- **Reset:** `delete_tabs_file` вызывается при сбросе данных (persistence.js)

#### Upload Interceptor: WebView2 WebResourceRequested (Stability Step 8: #2)
- **Rust-side upload counters:** `UPLOAD_COUNTERS: [AtomicU32; 3]` в `state.rs` — один счётчик на каждый Claude таб
- **3 новые Tauri команды:** `get_upload_count(tab)`, `reset_upload_count(tab)`, `increment_upload_count(tab)`
- **Windows нативный перехват:** `setup_native_upload_interceptor()` в `manager.rs` — использует WebView2 `WebResourceRequested` для перехвата запросов к `/upload-file` на уровне сетевого стека. Не конфликтует с JS interceptors, работает с Service Workers
- **Dual counting:** JS интерсептор в `claude_helpers.js` теперь также вызывает `increment_upload_count` через Tauri — оба счётчика (Rust + JS) синхронизируются
- **`waitForFilesUploaded`:** Приоритет — Tauri команда `get_upload_count`, fallback — CDP eval `window.__uploadedFilesCount`
- **Counter reset:** `reset_upload_count` (Tauri) + CDP reset (JS) — оба сбрасываются перед каждой операцией прикрепления
- **Примечание:** Rust WebView2 код может потребовать минорных правок типов COM при первой компиляции (EventRegistrationToken path, COREWEBVIEW2_WEB_RESOURCE_CONTEXT enum)

#### sendNodeToClaude: AbortController + checkpoint recovery (Stability Step 6: #6)
- **AbortController:** `sendAbortController` — можно отменить отправку на любом этапе через `abortSendToClaude()`. При отмене на этапе attach/send — автоочистка редактора Claude
- **`checkAborted(signal)`** — проверка перед каждым этапом и между долгими операциями (7 точек проверки)
- **SendCheckpoint** — система чекпоинтов с 6 этапами: `init → open_claude → automation → attach → send → done`
  - `set(stage, context)` — устанавливает текущий этап + эмитит `send-progress` CustomEvent
  - `fail(error)` — записывает ошибку + эмитит `send-error` CustomEvent
  - `retryContext` / `failedStage` / `lastError` — данные для повторной попытки
- **Локализованные сообщения об ошибках:** Вместо общего "Ошибка при отправке" — "Ошибка на этапе прикрепления файлов" и т.д.
- **Очистка редактора** при ошибке/отмене на этапах `attach` и `send` (когда в редакторе уже может быть незавершённый контент)
- **Удалён `throw e`** из catch — ошибки обрабатываются и логируются через SendCheckpoint, не пробрасываются в вызывающий код

#### Project Binding FSM + TTL + привязка по Claude tab (Stability Step 7: #4)
- **ProjectFSM** — конечный автомат в `claude-state.js` с 5 состояниями: `idle → creating → bound → detached → finishing → idle`
- **Привязка по Claude tab:** `ProjectFSM._data.claudeTab` — номер Claude таба (1-3) куда привязан проект. URL валидация проверяет только этот таб
- **TTL 4 часа:** Автоматическое завершение проекта через `_ttlTimer`. При восстановлении из localStorage проверяется `boundAt`
- **Detach grace period 60 сек:** Если Claude уходит со страницы проекта → `bound → detached`. Если не вернётся за 60 сек → auto-finish
- **URL валидация:** `validateUrl(tab, url)` вызывается из обработчиков `claude-page-loaded` и `claude-url-changed`
- **Crash recovery:** При восстановлении нестабильные состояния (`creating`, `finishing`) сбрасываются в `idle`
- **Обратная совместимость:** `activeProject` обновляется при `bind()`/`finish()`. `isProjectActive()` и `isCurrentTabProjectOwner()` работают через FSM
- **Затронутые файлы:** `claude-state.js` (+200 строк FSM), `claude-api.js` (startProject/finishProject/restoreProjectState → FSM делегация)

#### CDP Resilience Layer: retry с backoff + adaptive timeout (Stability Step 5: #3)
- **`cdpEval(tab, script, options)`** — центральная обёртка для всех CDP eval вызовов. Retry с exponential backoff (300ms → 600ms → 1200ms), настраиваемый maxRetries (по умолчанию 2), silent mode
- **`CdpTimeout`** — адаптивный таймаут. Базовые уровни: fast (5с), standard (10с), slow (30с). При ошибках множитель растёт (1.0 → 1.5 → 2.0 → max 3.0), при успехах — плавно снижается к 1.0. Сбрасывается при restoreClaudeState
- **`cdpPipeline(steps)`** — выполнение многошаговых операций с атомарностью. При ошибке на шаге N — rollback ранее выполненных шагов в обратном порядке
- **Миграция:** Все 8 прямых вызовов `eval_in_claude_with_result` в claude-api.js заменены на `cdpEval` с подходящими параметрами:
  - Polling-функции (waitForClaudeInput, waitForFileInput, waitForFilesUploaded): maxRetries=0 (loop — retry)
  - Критичные операции (getOrganizationId, createProjectViaAPI): maxRetries=1
  - Некритичные (counter reset, project detection): silent=true

#### Dynamic Input: маркеры позиций вместо savedPosition (Stability Step 4: #8)
- **Проблема:** При скрытии опционального поля его `savedPosition` (числовой индекс) становился невалидным если текст редактировался до повторного показа поля
- **Решение:** Вместо числовой позиции — невидимый маркер `\u200B{{FIELD:blockId-fieldIdx}}\u200B` (zero-width space обёрнутый маркер)
- **Скрытие поля:** Текст (prefix + value) заменяется на маркер. Маркер остаётся в данных — при переоткрытии модалки prefix не найден → поле показывается как «скрыто»
- **Показ поля:** Маркер заменяется обратно на prefix + новое значение. Если маркер не найден (текст сильно изменён) — fallback вставка в конец
- **Отправка в Claude:** `resolveMarkersToText()` также удаляет маркеры полей через `stripFieldMarkers()` — Claude получает чистый текст
- **View mode:** `renderMarkedContent()` удаляет маркеры полей перед рендерингом
- **`savedContent` вместо `savedPosition`:** Хранит полный паттерн удалённого текста (для fallback восстановления)

#### Система маркеров языка (Stability Step 3: #12)
- **Новая архитектура:** Вместо поиска и замены слов в тексте — явные маркеры `{{lang:nom.m}}`, `{{native:gen.f}}`, `{{country}}`, `{{locale}}`
- **Маркеры в данных:** Хранятся как есть в `block.content`. При переключении языка данные НЕ меняются — меняется только отображение
- **Отображение в view mode:** Маркеры раскрываются в текущие значения с оранжевой подсветкой (цвет Claude primary). При наведении — tooltip с типом маркера
- **Отображение в edit mode:** Textarea показывает сырые маркеры. Вставка через меню «Язык» — автоматически
- **Меню вставки:** Вставляет маркеры вместо готового текста. Пользователь выбирает категорию → падеж → род, получает маркер
- **Переключение языка (`applyLanguage`):** Стало тривиальным — просто `currentLanguage = newLang` + `renderWorkflow()`. Нет сканирования/замены текста
- **Отправка в Claude:** `resolveMarkersToText()` раскрывает все маркеры перед отправкой. Claude получает чистый текст
- **Детекция языка:** Если в блоках есть маркеры — автодетекция пропускается (язык управляется селектором). Для старых промптов без маркеров — fallback на текстовую детекцию
- **Ключевые функции:** `resolveMarker()`, `resolveMarkersToText()`, `renderMarkedContent()`, `hasLanguageMarkers()`

#### Автодиагностика и эвристический поиск селекторов (Stability Step 2: #1A+1B)
- **Health-check при запуске:** `runSelectorHealthCheck()` проверяет 5 критических селекторов (proseMirror, sendButton, stopButton, leftNav, scrollContainer) через 3 сек после загрузки. Результат пишется в `diagnostics.json` — пользователь ничего не видит
- **Эвристический поиск `__findElSmart__(path)`:** Новая функция, которая сначала ищет стандартным `__findEl__` (по selectors.json), а при неудаче — пробует эвристики на основе `aria-*`, `role`, `contenteditable` и структурной навигации
- **8 эвристик:** proseMirror (contenteditable+textbox), sendButton (submit в форме рядом с редактором), fileInput, stopButton (aria-label Stop), leftNav (nav[aria-label]), pinSidebarButton, scrollContainer (overflow-y с достаточной высотой), titleContainer (truncate/font-bold в header)
- **Логирование fallback:** При срабатывании эвристики пишется `selector_heuristic_fallback` в диагностику (дедупликация: не чаще раза в 5 мин на селектор)
- **Миграция вызовов:** `hideSidebar`, `setupSidebarObserver`, `truncateChatTitle` переведены на `__findElSmart__`

#### Инструкции блоков — исправления
- **Переименование:** «Сноска» → «Инструкция» в контекстном меню, модалке конструктора и алерте валидации
- **Баг: инструкция не появлялась через контекстное меню** — контекстное меню использовало `getTabItems()` (без поля `number`), `addBlockInstruction(undefined)` молча не сохраняло данные. Исправлено на `getTabBlocks()` с корректным `block.number`
- **Иконка инструкции в collapsed блоках:** вместо показа instruction strip (который ломал порты и связи), collapsed блок с инструкцией показывает компактную иконку ⓘ в хедере. При наведении — tooltip с текстом инструкции. Если инструкция кликабельная (есть поля) — клик по тексту открывает модалку `showDynamicInputModal`

#### Заметки на canvas
- **Новый тип элемента:** текстовые заметки — чисто визуальные блоки на canvas для организации работы. Не имеют портов, не участвуют в сборке промпта
- **Добавление:** кнопка «Заметка» в тулбаре + пункт «Создать заметку» в контекстном меню canvas (ПКМ)
- **Редактирование:** textarea в edit mode, drag по рамке, resize за нижний правый угол
- **Удаление:** кнопка × при hover или через контекстное меню заметки
- **Хранение:** `workflowNotes[]` в `workflow-state` (localStorage), per-tab
- **View mode:** заметки видны как read-only текст, учитываются в расчёте bounds/zoom

#### Кастомизация оформления
- **Акцентный цвет:** 8 пресетов + произвольный цвет через color picker. Динамически пересчитывает все `--claude-*` CSS-переменные (primary, light, code, shadow, selection, dark, darker) через `<style>` inject
- **Фон холста:** 5 CSS-паттернов (точки, сетка, диагональ, кресты, соты) + загрузка своего изображения (base64 в localStorage, лимит 2MB)
- **UI:** новые секции «Акцентный цвет» и «Фон холста» в модалке настроек. Кружки цветов с галкой для акцента, квадратные плитки с мини-превью для паттернов
- **Хранение:** `accentColor` и `canvasPattern` в settings, `CUSTOM_CANVAS_IMAGE` отдельный ключ

### Исправлено
- **Auto-send галочка:** `--claude-dark` и `--claude-darker` в `.dark` не перезаписывались динамическим акцентом — хардкод `#b15730` в статическом CSS побеждал по наследованию. Добавлены в динамический `.dark`-блок `applyAccentColor()`
- **Reset сохраняет UI-настройки:** `performReset()` теперь сохраняет и восстанавливает пользовательский фон (`CUSTOM_CANVAS_IMAGE`) наравне с `SETTINGS` (тема, акцент, паттерн). Затрагивает и автосброс при обновлении, и ручной Reset All

### Удалено
- CSS-класс `scrollbar-thin` — использовался в 4 местах (HTML/JS), но не имел CSS-определения
- `detectWordForm()`, `transformWord()` из `languages.js` — мёртвый код (определены и экспортированы, но нигде не вызывались), остаток от pre-маркерного подхода с прямой заменой текста
- **Легаси автодетекция языка** — удалены 6 функций: `includesWholeWord()`, `detectLanguageInText()`, `detectAllLanguagesInText()`, `detectLanguageFromText()`, `getAllWordForms()`, `findLanguageByWord()`. Маркерная система делает автодетекцию по содержимому контрпродуктивной — язык управляется только селектором (localStorage). `detectAndUpdateLanguageFromTab()` упрощена до синхронизации UI
- Константа `TIMEOUTS.MENU_SCROLL` — определена в config.js, нигде не использовалась (артефакт удалённого кастомного скроллбара)
- Секция документации Scrollbar (функции `initCustomScrollbar`, `initScrollbarGlobalHandlers`, `updateThumb`) — функции не существовали в коде

### Затронутые файлы
`styles.css`, `index.html`, `downloads.html`, `dynamic-input.js`, `config.js`, `languages.js`, `language-ui.js`, `workflow-render.js`, `claude-api.js`, `claude_helpers.js`, `init.js`, `block-ui.js`, `connections.js`, `app-state.js`, `workflow-state.js`, `workflow-zoom.js`, `storage.js`, `settings.js`, `export-import.js`, `workflow-interactions.js`, `context-menu.js`

---

## [4.2.16] - 2026-02-20 {#v4216}

### Улучшения

#### Дедупликация лога архивов (#18)
- **Проблема:** При повторном скачивании одного и того же архива из Claude лог засорялся дублями. Windows-нумерация `файл (1).zip`, `файл (2).zip` создавала дополнительные ложные записи
- **Решение:** `write_archive_log` при записи ищет существующую запись по нормализованному `filename` + `claude_url`. При совпадении — обновляет `timestamp` на актуальную дату вместо создания дубля
- **Нормализация имён:** Функция `normalize_filename` стрипает суффиксы ` (1)`, ` (2)` и т.д., которые Windows добавляет при повторном скачивании. `project-v4 (2).zip` → `project-v4.zip`
- **Миграция старых данных:** `get_archive_log` при чтении прогоняет дедупликацию существующих записей и перезаписывает файл (одноразовая миграция)
- **Новое поле:** `download_count: u32` в `ArchiveLogEntry` (обратно совместимо через `serde(default)`)

### Затронутые файлы
`types.rs`, `commands/logs.rs`, `settings.js`

---

## [4.2.15] - 2026-02-19 {#v4215}

### Исправления

#### Экспорт/импорт вкладки игнорирует изменения метаданных блоков (#15)
- **Баг:** Снятые метки скриптов/collapsed/automation не отражались в экспорте. При обновлении промптов старые флаги сохранялись до полного сброса программы
- **Причина:** Два источника правды — отдельные localStorage ключи (`block-scripts`, `collapsed-blocks`, `block-automation`) и `item.scripts/collapsed/automation` в данных вкладки. Toggle обновлял только localStorage, item data оставалась stale. При загрузке `syncBlockStatesFromItems` восстанавливал stale данные обратно
- **Исправление:** Item data — единственный источник правды. `loadBlockScripts/Collapsed/Automation` теперь строят in-memory состояние из item data, не из localStorage. `syncItemMetadata` при каждом toggle обновляет item data. `syncBlockStatesFromItems` удалён

#### Импорт вкладки не сбрасывает метаданные блоков (#16)
- **Исправление:** Импорт сохраняет tab data через `saveAllTabs`, затем перечитывает состояния из items

#### Toolbar и менеджер загрузок могли перекрываться Claude webview (#17)
- **Баг:** При пересоздании Claude webview toolbar мог оказаться под ним
- **Исправление:** Выделена `create_claude_webview` (без пересоздания toolbar) для батчевых операций. Startup и reset используют её + один `ensure/recreate_toolbar` в конце. Одиночные операции используют `ensure_claude_webview` с автоматическим пересозданием. Startup: 0 recreate вместо 2. Reset: 1 recreate вместо 3

### Затронутые файлы
`blocks.js`, `block-ui.js`, `export-import.js`, `init.js`, `webview/manager.rs`, `webview/mod.rs`, `commands/claude.rs`, `main.rs`

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
- Перепроверен подсчёт функций claude-api.js в 02-FRONTEND.md (подтверждено: 45 функций) *(после рефакторинга v4.3+ стало 39)*
- Унифицирована версия Rust в LIMITATIONS.md (минимум 1.75+, рекомендуется 1.80+)
- Исправлено количество языков в 05-FEATURES.md (было 21, стало 26 — добавлены региональные варианты: at, ca-en, ca-fr, ch-de, ch-fr, nz) *(региональные варианты удалены в v4.2.0, текущее число — 20 базовых языков с мультигео через подменю)*
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
- Zoom (0.2-1.25) и pan навигация
- Snap to grid (40px)
- Сохранение позиций и связей

#### Скрипты автоматизации
- Встроенный convert.py (конвертация MD в HTML)
- Встроенный count.py (подсчёт слов)
- Встроенный spellcheck.py (проверка орфографии) — *удалён в более поздних версиях*
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
