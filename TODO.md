# TODO

## Планируемые фичи

### Диагностика состояния вкладок

**Контекст:** В v4.4.20 был баг — вкладка `gamble-pillar-main` дублировалась после обновления с GitHub, лежала в `allTabs` но не отображалась в селекторе. Корневая причина: `buildTabTree` в `tab-selector.js` строит дерево по `tab.name`, а данные хранятся по `tab.id` — если две записи имеют одинаковый `name`, `getFirstFinalTab` возвращает только первую, остальные невидимы. Сейчас никакой диагностики нет, пришлось руками копаться в `tabs_data.json`.

**Что делать:**

1. **Инвариант при загрузке/обновлении:** `allTabs[key].id === key` должен выполняться всегда. Если нет — автопочинка при `applyPromptsUpdate` / `initHybridStorage` (привести ключ в соответствие с `.id` или наоборот).

2. **Детекция дубликатов по name:** при `buildTabTree` если в один `node.tabs[]` попадает больше одной вкладки — показать их все в селекторе (с disambiguation суффиксом `tabId`), а не тихо терять через `getFirstFinalTab`.

3. **Утилита «Диагностика» в Project Manager:** новый пункт в главном меню, показывает:
   - все вкладки из `tabs_data.json` (key, id, name, version, items count)
   - расхождения `key !== id`
   - дубликаты по `name`
   - осиротевшие `workflow-{tabId}` без соответствующей вкладки
   - команда «почистить всё лишнее» с подтверждением

4. **Опционально — диагностика в settings:** кнопка «Показать состояние» в разделе «Дополнительно», рендерит то же самое в модалке внутри программы (без необходимости запускать Project Manager).

---

### Расширенное логирование send pipeline

**Контекст:** В v4.4.20 у юзера падала автоматизация «Новый проект» с generic тостом «Ошибка на этапе автоматизации». Корневая причина оказалась в подписке (POST `/api/organizations/{id}/projects` возвращал ошибку из-за слетевшей подписки), но из лога диагностики этого было не видно — `writeDiagnostic` пишется только из health-check селекторов и storage. Все API-этапы и silent `catch (e) {}` по коду не логируются.

**Что делать:**

1. **Точечное логирование на пути «Новый проект»:**
   - `org_id_resolved` в `getOrganizationId` — `{ method: 'cache' | 'cookie' | 'api', tab }`
   - `org_id_failed` — оба пути отвалились, с деталями (cookie attempts, API error/status)
   - `project_create_failed` в `createProjectViaAPI` — `{ tab, reason: 'no_org_id' | 'http_error' | 'bad_response' | 'navigate_failed', status?, message? }`
   - `automation_failed` в главном catch send pipeline (`claude-api.js:869`) — `{ tab, stage, errorName, errorMessage }`

2. **Аудит всех silent catch-ов в коде:** грепнуть `catch (e) {}` / `catch (_) {}` / `.catch(() => {})` по `dist/js/`, для каждого решить — логировать или осознанно проглотить. Кандидаты на логирование:
   - `cdpEval` final timeout/error
   - `evalInClaude` ошибки
   - `navigateClaude` page-loaded timeout
   - `waitForClaudeInput` / `waitForFileInput` / `waitForFilesUploaded` таймауты
   - `attachAllFiles` ошибки batch eval
   - `sendTextToClaude` ошибки
   - `newChatInTab` ошибки
   - `applyPromptsUpdate` (связано с TODO про дубликаты вкладок)

3. **Унификация формата:** для всех событий — `tab`, `reason` или `stage`, `message`, опционально `details`. Чтобы при экспорте лога сразу видно было что/где/почему упало.

---

### Детекция ошибок подписки и квот

**Контекст:** У юзера слетела подписка → POST `/api/organizations/{id}/projects` возвращал ошибку → программа маскировала это под generic «Ошибка на этапе автоматизации». Юзер потратил часы пытаясь понять что не так с программой, при этом проблема была чисто на стороне его аккаунта Claude.

**Что делать:**

1. **Парсить ответы API Claude по семантике:**
   - 401 Unauthorized — не залогинен в Claude → toast «Войдите в Claude», возможно открыть страницу логина
   - 402 Payment Required / 403 Forbidden с маркером подписки в body — toast «Подписка Claude неактивна или истекла»
   - 429 Too Many Requests — toast «Превышен лимит запросов Claude, подождите»
   - Достижение лимита проектов на тарифе (отдельный код в body) — toast «Лимит проектов на вашем тарифе исчерпан»
   - Достижение лимита файлов в проекте — toast «Лимит файлов в проекте исчерпан, создайте новый»
   - Network errors (fetch reject, TypeError) — toast «Нет связи с Claude»

2. **Где парсить:** `createProjectViaAPI`, `attachAllFiles` (uploads), `sendTextToClaude` (если будет аналогичный API-путь), любые другие места где идёт fetch к API Claude. Внутри fetch-блока в инжектируемом скрипте читать `response.status` + body, в `catch` ловить network errors. Возвращать структурированный результат `{ success, errorCode, message }` вместо булевого, верхний уровень показывает соответствующий toast.

3. **Опционально — превентивная проверка подписки на старте:** при первом запуске / переключении табов дёргать `/api/organizations/{id}/account` или аналогичный endpoint, проверять `subscription.status`. Если неактивна — баннер в UI с кнопкой «Открыть biling Claude». Это снимает основные жалобы до того как юзер столкнётся с ошибкой автоматизации.

4. **Логирование:** все детектированные subscription/quota ошибки писать в `writeDiagnostic` с `event_type: 'claude_api_error'` и details `{ endpoint, status, errorCode, tab }`. Чтобы накопленная статистика помогла понимать какие сценарии встречаются чаще.
