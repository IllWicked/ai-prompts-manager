# Инструкция по настройке автообновлений через GitHub

## Часть 1: Создание репозитория на GitHub

### Шаг 1: Регистрация на GitHub (если ещё нет аккаунта)
1. Перейди на https://github.com
2. Нажми **Sign up**
3. Введи email, придумай пароль, выбери username
4. Подтверди email

### Шаг 2: Создание нового репозитория
1. Войди в свой аккаунт GitHub
2. Нажми **+** в правом верхнем углу → **New repository**
3. Заполни:
   - **Repository name**: `claude-prompts-app`
   - **Description**: `Claude AI Prompts Manager` (опционально)
   - **Visibility**: выбери **Private** (приватный, только ты видишь)
   - НЕ ставь галочку "Add a README file"
4. Нажми **Create repository**

---

## Часть 2: Генерация ключей подписи

Ключи нужны для подписи обновлений (чтобы никто не мог подсунуть вредоносное обновление).

### Шаг 1: Открой терминал (Command Prompt или PowerShell)

### Шаг 2: Перейди в папку проекта
```
cd путь\к\claude-prompts-app
```

### Шаг 3: Сгенерируй ключи
```
npx @tauri-apps/cli signer generate -w .tauri/keys
```

Система спросит пароль — **придумай и запомни его** (или оставь пустым, нажав Enter).

Будут созданы два файла:
- `.tauri/keys/private.key` — приватный ключ (НИКОМУ не показывай!)
- `.tauri/keys/public.key` — публичный ключ

### Шаг 4: Скопируй публичный ключ
Открой файл `.tauri/keys/public.key` — там будет строка вида:
```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk...
```

---

## Часть 3: Настройка проекта

### Шаг 1: Обнови tauri.conf.json
Открой `src-tauri/tauri.conf.json` и замени:

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/ТВОЙ_USERNAME/claude-prompts-app/releases/latest/download/latest.json"
    ],
    "pubkey": "ВСТАВЬ_СЮДА_ПУБЛИЧНЫЙ_КЛЮЧ"
  }
}
```

Замени:
- `ТВОЙ_USERNAME` — на твой username на GitHub
- `ВСТАВЬ_СЮДА_ПУБЛИЧНЫЙ_КЛЮЧ` — на содержимое файла `public.key`

---

## Часть 4: Настройка секретов GitHub

### Шаг 1: Перейди в Settings репозитория
1. Открой репозиторий на GitHub
2. Нажми **Settings** (вкладка вверху)
3. В левом меню: **Secrets and variables** → **Actions**

### Шаг 2: Добавь секреты
Нажми **New repository secret** и добавь два секрета:

**Секрет 1:**
- Name: `TAURI_SIGNING_PRIVATE_KEY`
- Secret: содержимое файла `.tauri/keys/private.key`

**Секрет 2:**
- Name: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Secret: пароль, который ты ввёл при генерации ключей (или оставь пустым)

---

## Часть 5: Загрузка кода на GitHub

### Шаг 1: Установи Git (если ещё нет)
Скачай с https://git-scm.com/download/win и установи.

### Шаг 2: Открой терминал в папке проекта

### Шаг 3: Инициализируй Git и загрузи код
```bash
# Инициализация
git init

# Добавь все файлы
git add .

# Первый коммит
git commit -m "Initial commit"

# Подключи удалённый репозиторий (замени USERNAME)
git remote add origin https://github.com/USERNAME/claude-prompts-app.git

# Загрузи код
git branch -M main
git push -u origin main
```

При первом пуше GitHub попросит авторизоваться — введи свои данные.

---

## Часть 6: Выпуск обновления

### Как выпустить новую версию:

1. **Измени версию** в `src-tauri/tauri.conf.json` и `src-tauri/Cargo.toml`
   ```json
   "version": "2.9.1"
   ```

2. **Закоммить изменения:**
   ```bash
   git add .
   git commit -m "Версия 2.9.1: описание изменений"
   git push
   ```

3. **Создай тег:**
   ```bash
   git tag v2.9.1
   git push origin v2.9.1
   ```

4. **Готово!** 
   - GitHub Actions автоматически соберёт приложение
   - Создаст релиз с установщиком
   - Все пользователи получат уведомление об обновлении

### Где посмотреть статус сборки:
1. Открой репозиторий на GitHub
2. Перейди во вкладку **Actions**
3. Там будет список всех сборок и их статус

---

## Важные файлы

```
claude-prompts-app/
├── .github/
│   └── workflows/
│       └── release.yml      # Автоматическая сборка
├── .tauri/
│   └── keys/
│       ├── private.key      # НЕ загружай в Git!
│       └── public.key       # Публичный ключ
├── src-tauri/
│   ├── tauri.conf.json      # Настройки (версия, ключ)
│   └── Cargo.toml           # Версия Rust
└── dist/
    └── index.html           # Интерфейс
```

---

## Защита приватного ключа

**ВАЖНО:** Файл `private.key` нельзя загружать в Git!

Создай файл `.gitignore` в корне проекта:
```
.tauri/keys/private.key
target/
node_modules/
```

---

## Проверка работы

1. После настройки собери приложение локально: `npm run tauri build`
2. Установи его
3. Выпусти новую версию через тег
4. При следующем запуске приложение покажет окно обновления

---

## Возможные проблемы

### "Не могу подключиться к GitHub"
- Проверь интернет-соединение
- Убедись, что endpoint в tauri.conf.json правильный

### "Сборка падает в Actions"
- Проверь логи во вкладке Actions
- Убедись, что секреты добавлены правильно

### "Обновление не устанавливается"
- Проверь, что публичный ключ в tauri.conf.json совпадает с тем, которым подписан релиз
