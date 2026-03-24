# Project Manager

[← Назад к INDEX](../INDEX.md)

CLI-скрипт для управления промптами, скиллами и релизами AI Prompts Manager.

---

## Расположение

Скрипт находится в папке `project-manager/`:

```
project-root/
├── project-manager/
│   └── project-manager.py    ← скрипт
├── src-tauri/
├── dist/
├── RELEASE_NOTES.txt
└── skills/
```

---

## Запуск

```bash
cd project-manager
python project-manager.py
```

Откроется интерактивное меню.

---

## Главное меню

```
╔═══════════════════════════════════════════════════════════════╗
║              PROJECT MANAGER - AI Prompts Manager              ║
╠═══════════════════════════════════════════════════════════════╣
║  Приложение: v4.4.0                                           ║
╚═══════════════════════════════════════════════════════════════╝

  📁 JSON файлов к пушу: 2
      - bet-pillar.json
      - bet-clusters.json

  ГЛАВНОЕ МЕНЮ:
  ═════════════════════════════════════
  1. 📝 Промпты (переименовать/порядок на GitHub)
  2. 📦 Push (промпты и скиллы на GitHub)
  3. 🚀 Релизы (новая версия программы)
  ═════════════════════════════════════
  0. Выход
```

---

## 1. Меню "Промпты"

Управление вкладками промптов на GitHub.

| Пункт | Описание |
|-------|----------|
| **Переименовать вкладку** | Изменить display name вкладки |
| **Удалить вкладку** | Удалить вкладку с GitHub |
| **Изменить порядок вкладок** | Изменить сортировку |

### Переименование

1. Скрипт показывает список вкладок на GitHub
2. Выбираешь номер вкладки
3. Вводишь новое имя
4. Изменения пушатся автоматически

### Изменение порядка

```
  Текущий порядок:
    1. BET-PILLAR
    2. BET-PILLAR-CLKEYS
    3. BET-CLUSTERS

  Введи новый порядок номеров через пробел
  Пример: 2 1 3 (поменять первую и вторую местами)

  Новый порядок: 3 1 2
```

---

## 2. Меню "Push"

Отправка промптов и скиллов на GitHub. Два пункта:

| Пункт | Описание |
|-------|----------|
| **Push промптов** | JSON-файлы вкладок из `project-manager/` → GitHub (автоинкремент версии) |
| **Push скиллов** | `.skill` файлы из `skills/` → GitHub (автоинкремент версии манифеста) |

### Push промптов — Workflow

1. Экспортируй вкладку из приложения (Настройки → Экспорт)
2. Положи JSON-файл **в папку `project-manager/`** (рядом со скриптом)
3. Запусти скрипт — он покажет файлы к пушу
4. Выбери "Push" → подтверди

### Что происходит при Push

1. **Автоинкремент версии** — patch-версия каждой вкладки увеличивается
2. **Обновление manifest.json** — добавляются новые вкладки, обновляются версии
3. **Git push** — файлы отправляются на GitHub через API
4. **Удаление JSON** — после успешного пуша файлы удаляются из папки `project-manager/`

### Структура manifest.json

```json
{
  "version": "1.2.0",
  "updated": "2026-01-27",
  "release_notes": "Обновление промптов...",
  "tabs": {
    "bet-pillar": {
      "name": "BET-PILLAR",
      "version": "1.0.3",
      "order": 1,
      "file": "bet-pillar.json"
    }
  }
}
```

---

### Push скиллов — Workflow

1. Положи `.skill` файлы в папку `skills/`
2. Запусти скрипт → Push → Push скиллов
3. Версия манифеста автоинкрементится, файлы загружаются на GitHub

В отличие от промптов (текстовые JSON), скиллы — бинарные ZIP-файлы. Push использует `github_api_put_binary_file()` для корректной загрузки (base64-кодирование бинарных данных). Манифест пересобирается автоматически по фактическим `.skill` файлам.

---

## 3. Меню "Релизы"

Управление версиями приложения.

| Пункт | Описание |
|-------|----------|
| **Изменить версию** | Обновить версию в tauri.conf.json, Cargo.toml, index.html, docs/INDEX.md |
| **Редактировать Release Notes** | Открыть RELEASE_NOTES.txt в редакторе |
| **Создать релиз** | Полный цикл: commit → tag → push |

### Изменение версии

Обновляет версию в четырёх файлах:
- `src-tauri/tauri.conf.json` → `"version": "X.Y.Z"`
- `src-tauri/Cargo.toml` → `version = "X.Y.Z"`
- `dist/index.html` → `<span id="settings-version">` + ASCII-баннер
- `docs/INDEX.md` → `**Версия:** X.Y.Z`

### Создание релиза

```
  ═══════════════════════════════════════════════════════
                    🚀 СОЗДАНИЕ РЕЛИЗА
  ═══════════════════════════════════════════════════════

  Версия приложения: v4.4.0
  Будет создан тег: v4.4.0

  Release notes:
  ─────────────────────────
  Версия 4.3.2
  - Улучшена документация
  ...

  ─────────────────────────────────────
  Это действие выполнит:
    1. git add -A
    2. git commit
    3. git tag v4.4.0
    4. git push
    5. git push --tags

  После push с тегом GitHub Actions автоматически
  соберёт и опубликует релиз.
  ─────────────────────────────────────
```

---

## Файлы

| Файл | Расположение | Описание |
|------|--------------|----------|
| `RELEASE_NOTES.txt` | Корень проекта | Release notes для приложения |
| `prompts/manifest.json` | GitHub | Манифест вкладок |
| `prompts/*.json` | GitHub | JSON-файлы вкладок |
| `skills/manifest.json` | GitHub | Манифест скиллов |
| `skills/*.skill` | GitHub | ZIP-архивы скиллов |
| `*.json` (для пуша) | `project-manager/` | Экспортированные вкладки |

---

## GitHub API

Скрипт использует GitHub API для push без локального git:

```python
def push_prompts_via_api(files: List[Tuple[str, str]], message: str) -> Tuple[bool, str]:
    """
    Пушит файлы напрямую через GitHub API.
    files: [(path, content), ...]
    """
```

**Требования:**
- GitHub token в переменной окружения или `.env` файле
- Права на запись в репозиторий

### Настройка GitHub Token

**Шаг 1:** Создай Personal Access Token на GitHub:
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. Scopes: `repo` (полный доступ к репозиториям)
4. Скопируй токен (покажется только один раз!)

**Шаг 2:** Создай файл `.env` в папке `project-manager/`:
```bash
# project-manager/.env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Шаг 3:** Добавь `.env` в `.gitignore` (уже добавлен по умолчанию)

**Альтернатива:** Переменная окружения:
```bash
# Windows PowerShell
$env:GITHUB_TOKEN = "ghp_xxx..."

# Windows CMD
set GITHUB_TOKEN=ghp_xxx...

# Linux/macOS
export GITHUB_TOKEN=ghp_xxx...
```

### Rate Limits

GitHub API имеет лимиты:
- **С токеном:** 5000 запросов/час
- **Без токена:** 60 запросов/час

При превышении лимита скрипт выдаст ошибку `403 rate limit exceeded`. Подожди час или используй другой токен.

---

## Конфигурация

```python
# project-manager.py

PROMPTS_DIR = 'prompts'
SKILLS_DIR = 'skills'
MANIFEST_FILE = 'manifest.json'
RELEASE_NOTES_FILE = 'RELEASE_NOTES.txt'
DEFAULT_REMOTE_URL = 'https://github.com/IllWicked/ai-prompts-manager.git'
```

> **Примечание:** Папки `prompts/` и `skills/` создаются автоматически при первом push. До этого они отсутствуют в репозитории.

---

## Troubleshooting

### "Нечего загружать"

JSON-файлы должны лежать **в папке `project-manager/`** (рядом со скриптом), не в корне проекта и не в подпапках.

### "Ошибка при push"

- Проверь интернет-соединение
- Проверь GitHub token
- Убедись, что репозиторий существует

### Версия не обновляется

Скрипт ищет паттерны:
- `"version": "X.Y.Z"` в tauri.conf.json
- `version = "X.Y.Z"` в Cargo.toml
- `<span id="settings-version">X.Y.Z</span>` в index.html
- `**Версия:** X.Y.Z` в docs/INDEX.md

Если формат отличается — версия не обновится.

---

## Связанные документы

- [SETUP_GITHUB.md](../guides/SETUP_GITHUB.md) — Настройка GitHub
- [CHANGELOG.md](CHANGELOG.md) — История изменений
