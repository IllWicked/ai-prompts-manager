# Глоссарий

[← Назад к INDEX](../INDEX.md)

## Термины проекта

| Термин | Описание |
|--------|----------|
| **APM** | AI Prompts Manager — это приложение |
| **Block** | Блок промпта — элемент с заголовком и текстом |
| **Workflow** | Режим визуального редактора с drag & drop и связями |
| **Connection** | Связь между блоками (стрелка) |
| **Port** | Точка подключения на блоке (top, right, bottom, left) |
| **Tab (APM)** | Вкладка приложения с набором блоков |
| **Tab (Claude)** | Один из трёх независимых чатов Claude (1/2/3) |
| **Separator** | Разделитель между блоками в списке |

## Технологии

| Термин | Описание |
|--------|----------|
| **Tauri** | Фреймворк для desktop-приложений (Rust + WebView) |
| **WebView2** | Встроенный браузер на базе Edge/Chromium (Windows) |
| **Tauri command** | Rust-функция, вызываемая из JavaScript через `invoke()` |
| **Tauri event** | Событие для коммуникации Rust ↔ JS через `emit()`/`listen()` |
| **CDP** | Chrome DevTools Protocol — протокол для управления браузером |
| **ProseMirror** | Rich-text редактор, используемый в Claude.ai |
| **Tiptap** | Обёртка над ProseMirror (используется Claude) |

## Архитектура

| Термин | Описание |
|--------|----------|
| **Main WebView** | Основной UI приложения (`index.html`) |
| **Claude WebView** | Встроенный claude.ai (до 3 экземпляров) |
| **Toolbar WebView** | Плавающий тулбар над Claude |
| **Downloads WebView** | Popup менеджера загрузок |
| **Init Script** | JavaScript, инжектируемый в Claude WebView при загрузке |

## Селекторы Claude

| Термин | Описание |
|--------|----------|
| **Selector** | CSS-селектор для поиска элемента на странице |
| **Fallback selector** | Альтернативный селектор, если основной не работает |
| **Ghost button** | Невидимая кнопка, которую нужно скрывать |
| **Left nav** | Левый сайдбар Claude с историей чатов |
| **generation.stopButton** | Селектор кнопки остановки генерации |
| **generation.streamingIndicator** | Селектор индикатора потоковой генерации |
| **generation.thinkingIndicator** | Селектор индикатора "думающего" состояния |

## Project Binding

| Термин | Описание |
|--------|----------|
| **Active Project** | Проект Claude, к которому привязана вкладка APM |
| **Owner Tab** | Вкладка APM, которая "владеет" проектом |
| **Project UUID** | Уникальный идентификатор проекта Claude |
| **Organization ID** | ID организации пользователя Claude (для API) |

## Claude Counter

| Термин | Описание |
|--------|----------|
| **Claude Counter** | Встроенный плагин: cache timer, usage bars |
| **Cache timer** | Обратный отсчёт 5-мин окна кэширования |
| **Session bar** | Progress bar 5-часового окна использования |
| **Weekly bar** | Progress bar 7-дневного окна использования |

## Knowledge Upload

| Термин | Описание |
|--------|----------|
| **Knowledge Upload** | Автозагрузка скачанных MD-файлов в knowledge проекта |
| **uploadToProjectKnowledge()** | Функция: read file → base64 → CDP fetch POST → delete file |

## SERP Scraper

| Термин | Описание |
|--------|----------|
| **SERP Scraper** | Блок на холсте: выполняет поисковые запросы в Google, собирает и очищает HTML страниц |
| **scraper-блок** | Тип элемента `type: "scraper"` — максимум 1 на вкладку |
| **serp_extract.js** | Инжектируемый скрипт для извлечения органических результатов из Google SERP |
| **create_scraper_webview** | Tauri-команда: создание скрытого WebView для скрапинга |
| **scrape_google_serp** | Tauri-команда: выполнение серии запросов и сбор результатов |

## Auto-Continue

| Термин | Описание |
|--------|----------|
| **Auto-Continue** | Автоматический клик Continue при tool-use limit в Claude WebView |
| **claude_autocontinue.js** | Инжектируемый скрипт (~137 строк), поллинг + двухступенчатая детекция + button.click() |
| **window._ac** | Глобал auto-continue: `_ac.enabled`, `_ac.setEnabled(bool)` |
| **window._emit** | Кэшированный `__TAURI__.event.emit` для отправки toast из Claude WebView в Main WebView |

## Автоматизация

| Термин | Описание |
|--------|----------|
| **Flag P** | Флаг "New Project" — создаёт новый проект перед отправкой |
| **Flag N** | Флаг "New Chat" — создаёт новый чат перед отправкой |
| **Embedded Script** | Python-скрипт, прикрепляемый к блоку |
| **Instruction** | Кнопка с действием на блоке |
| **Instruction.input** | Инструкция с полями для ввода и замены текста |
| **Instruction.info** | Информационная инструкция без ввода |
| **Dynamic Input** | Модалка с полями для замены текста в промпте |

## Встроенные скрипты

| Термин | Описание |
|--------|----------|
| **convert.py** | Скрипт HTML-merge: content.html + design.html → index.html |
| **count.py** | Скрипт подсчёта слов в тексте |

## Хранение данных

| Термин | Описание |
|--------|----------|
| **localStorage** | Браузерное хранилище для данных приложения |
| **App Data Dir** | `%LOCALAPPDATA%/com.ai.prompts.manager/` |
| **Hybrid Storage** | Гибридное хранение: localStorage (кэш) + файл `tabs_data.json` (backup). С v4.2.5 |
| **StorageMonitor** | Мониторинг использования localStorage: usage, breakdown, предупреждения при >80% |
| **Downloads Log** | Лог скачанных файлов (`downloads_log.json`) |
| **Archive Log** | Лог скачанных архивов (`archive_log.json`) |
| **Diagnostics Log** | Лог диагностики селекторов (`diagnostics.json`) |
| **Manifest** | Файл с версиями и метаданными вкладок |
| **CLAUDE_AUTO_SEND** | Настройка автоматической отправки сообщения (localStorage: `claude_auto_send`) |

## Обновления

| Термин | Описание |
|--------|----------|
| **Remote Prompts** | Вкладки, загружаемые с GitHub |
| **Auto Update** | Автоматическое обновление приложения |
| **Signing Key** | Ключ подписи для безопасных обновлений |
| **Release Tag** | Git-тег, триггерящий сборку (например `v4.1.4`) |

## UI/UX

| Термин | Описание |
|--------|----------|
| **Edit Mode** | Режим редактирования вкладок |
| **Admin Mode** | Расширенный режим с дополнительными опциями |
| **View Mode** | Режим просмотра (zoom подстраивается под контент) |
| **Toast** | Всплывающее уведомление |
| **Context Menu** | Контекстное меню по правому клику |

## Сокращения в коде

<details>
<summary>Показать стандартные сокращения (для новичков)</summary>

| Сокращение | Полное название |
|------------|-----------------|
| `el` | Element |
| `btn` | Button |
| `msg` | Message |
| `pos` | Position |
| `conn` | Connection |
| `idx` | Index |
| `cfg` | Config |
| `ws` | Workflow State |
| `cb` | Callback |

</details>

## CDP-специфичные термины

| Термин | Описание |
|--------|----------|
| **Runtime.evaluate** | CDP метод для выполнения JavaScript |
| **awaitPromise** | Флаг для ожидания Promise в CDP |
| **returnByValue** | Флаг для возврата значения (а не reference) |
| **Timeout** | Время ожидания ответа CDP (5-30 сек) |
| **Fire-and-forget** | Выполнение JS без ожидания результата (`eval_in_claude`) |

## Паттерны и механизмы

| Термин | Описание |
|--------|----------|
| **Retry механизм** | Система повторных попыток загрузки Claude табов (до 3 раз) |
| **Debounce** | Задержка сохранения для группировки изменений (2 сек) |
| **Throttle** | Ограничение частоты вызовов функции |
| **Auto-cleanup** | Автоматическое удаление записей для несуществующих файлов |
| **Fallback** | Резервный вариант (например, альтернативный селектор) |
| **InputGroup** | Группировка быстрых правок (пауза < 2 сек) в одну undo-операцию (v3) |
| **Suspend/Resume** | ОТКЛЮЧЕНО. Неактивные табы позиционируются за экран (DOM живой). `TrySuspend()` замораживал DOM. |
| **Hash Comparison** | djb2-хеширование для быстрой проверки изменений при undo snapshot |

## Тестирование

| Термин | Описание |
|--------|----------|
| **Jest** | Фреймворк для unit-тестирования JavaScript |
| **jsdom** | Эмуляция браузерного DOM для Node.js |
| **Unit-тест** | Изолированный тест отдельной функции |
| **Mock** | Заглушка для эмуляции зависимостей (localStorage, DOM) |

## Workflow-специфичные термины

| Термин | Описание |
|--------|----------|
| **Canvas** | Холст 5000x5000px для размещения блоков |
| **Grid** | Сетка 40x40px для выравнивания |
| **Zoom** | Масштаб (0.2 - 1.25) |
| **Pan** | Перемещение холста |
| **Magnet** | Притяжение к ближайшему порту (30px) |
| **Bezier** | S-образная кривая для связей |

## STORAGE_KEYS

| Ключ | Описание |
|------|----------|
| `ai-prompts-manager-tabs` | Данные всех вкладок |
| `ai-prompts-manager-settings` | Настройки приложения |
| `ai-prompts-manager-tab` | ID текущей вкладки |
| `ai-prompts-manager-language` | Текущий язык |
| `currentCountry` | Текущая страна для мультигео языков |
| `ai-prompts-manager-version` | Версия формата данных |
| `ai-prompts-manager-app-version` | Версия приложения (для миграций) |
| `workflowZoom` | Текущий zoom |
| `workflowCameraX` | Позиция камеры X (hardcoded, не в STORAGE_KEYS) |
| `workflowCameraY` | Позиция камеры Y (hardcoded, не в STORAGE_KEYS) |
| `collapsed-blocks` | Объект свёрнутых блоков ({blockId: true}) |
| `block-scripts` | Скрипты блоков |
| `block-automation` | Флаги автоматизации |
| `claudeSettings` | Настройки Claude панели |
| `claude_auto_send` | Автоотправка сообщений (true/false) |
| `active-project` | Привязка к проекту Claude |
| `workflow-{tabId}` | Позиции, связи, размеры, заметки и цвета блоков (динамический) |
| `ai-prompts-manager-data-{tabId}` | Данные промптов вкладки (динамический) |
| `field-value-{tabId}-{blockId}-{index}` | Значение поля динамического ввода |

---

## Связанные документы

- [../INDEX.md](../INDEX.md) — Навигация по документации
- [../frontend/DATA-STRUCTURES.md](../frontend/DATA-STRUCTURES.md) — Структуры данных
- [../frontend/UTILS.md](../frontend/UTILS.md) — Константы и утилиты
- [FAQ.md](FAQ.md) — Часто задаваемые вопросы
