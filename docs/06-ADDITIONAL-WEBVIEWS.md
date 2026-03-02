# Дополнительные WebView

[← Назад к INDEX](INDEX.md)

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                       Main Window                            │
├───────────────────┬─────────────────────────────────────────┤
│                   │   Claude WebView (1-3)                  │
│   Main WebView    │   ┌─────────────────────────────────┐   │
│   (index.html)    │   │        claude.ai                │   │
│                   │   │                                 │   │
│                   │   │   ┌─────────────────────────┐   │   │
│                   │   │   │   Downloads WebView     │   │   │
│                   │   │   │   (downloads.html)      │   │   │
│                   │   │   │   320x360               │   │   │
│                   │   │   └─────────────────────────┘   │   │
│                   │   │                                 │   │
│                   │   │   ┌──────────────────┐          │   │
│                   │   │   │ Toolbar WebView  │          │   │
│                   │   │   │ (toolbar.html)   │          │   │
│                   │   │   │ 152x44           │          │   │
│                   │   │   └──────────────────┘          │   │
│                   │   └─────────────────────────────────┘   │
└───────────────────┴─────────────────────────────────────────┘
```

---

## toolbar.html (~128 строк)

Плавающий тулбар над Claude WebView.

### Расположение

- **Размер:** 152x44 пикселей
- **Позиция:** по центру Claude WebView, внизу
- **Z-Order:** выше Claude WebView

### Кнопки

| Кнопка | ID | Tauri Command | Описание |
|--------|-----|---------------|----------|
| ← | `btn-back` | `toolbar_back` | Назад в истории |
| → | `btn-forward` | `toolbar_forward` | Вперёд в истории |
| ↻ | `btn-reload` | `toolbar_reload` | Перезагрузить страницу |
| ↓ | `btn-downloads` | `show_downloads` / `hide_downloads` | Toggle popup загрузок |

### События

```javascript
// Закрытие popup при уведомлении от downloads webview
listen('downloads-closed', () => {
    isPopupOpen = false;
    btnDownloads.classList.remove('active');
});
```

> **Примечание:** Закрытие popup при клике в Claude WebView реализовано через `setupGlobalClickListener()` в `claude_helpers.js`, который напрямую вызывает `invoke('hide_downloads')`.

### Стили

- Полупрозрачный фон (#2D2D2D)
- Rounded corners (10px)
- Hover эффекты на кнопках
- Active state для кнопки Downloads

---

## downloads.html (~600 строк)

Менеджер загруженных файлов (popup).

### Расположение

- **Размер:** 320x360 пикселей
- **Позиция:** над toolbar
- **Z-Order:** выше toolbar

### Структура

```html
<div class="downloads-popup">
    <div class="downloads-header">
        <span class="downloads-title">Загрузки</span>
        <div class="header-actions">
            <button class="send-selected-btn">Отправить</button>
            <button class="delete-all-btn">Удалить все</button>
        </div>
    </div>
    <div class="downloads-list">
        <!-- Список файлов -->
    </div>
</div>
```

### Функции

| Функция | Описание |
|---------|----------|
| `loadDownloads()` | Загрузка списка из `get_downloads_log` |
| `renderDownloads()` | Отрисовка списка файлов |
| `openFile(path)` | Открыть файл в системе |
| `sendToClaude(filePath)` | Отправить файл в Claude |
| `sendSelectedToClaude()` | Отправить выбранные файлы |
| `deleteDownload(path)` | Удалить запись из лога |
| `deleteAllDownloads()` | Очистить весь лог |
| `closePopup()` | Закрыть popup |

### Выбор файлов

```javascript
// Shift+Click для диапазона
if (e.shiftKey && lastClickedIndex !== -1) {
    const start = Math.min(lastClickedIndex, index);
    const end = Math.max(lastClickedIndex, index);
    for (let i = start; i <= end; i++) {
        selectedFiles.add(downloads[i].file_path);
    }
}

// Обычный клик — toggle selection
if (selectedFiles.has(filePath)) {
    selectedFiles.delete(filePath);
} else {
    selectedFiles.add(filePath);
}
```

### Иконки

Определяются по расширению файла:

| Расширение | Иконка |
|------------|--------|
| `.zip`, `.rar`, `.7z`, `.tar`, `.gz` | 📦 Archive |
| `.doc`, `.docx`, `.pdf`, `.txt`, `.md`, `.html` | 📄 Document |
| `.jpg`, `.jpeg`, `.png`, `.gif`, `.svg`, `.webp` | 🖼 Image |
| `.mp4`, `.mov`, `.avi`, `.mkv` | 🎬 Video |
| `.mp3`, `.wav`, `.flac`, `.ogg` | 🎵 Audio |
| `.py`, `.js`, `.ts`, `.rs`, `.json` | 💻 Code |
| `.xls`, `.xlsx`, `.csv` | 📊 Spreadsheet |
| `.ppt`, `.pptx` | 📽 Presentation |
| Остальные | 📁 File |

### События

```javascript
// Обновление списка
listen('refresh-downloads', () => loadDownloads());

// Начало загрузки
listen('download-started', (event) => {
    // Показать индикатор
});

// Завершение загрузки
listen('download-finished', (event) => {
    loadDownloads();
});
```

---

## Z-Order и видимость

### Проблема

При создании нового Claude WebView (табы 2 и 3) он создаётся ПОВЕРХ toolbar и downloads — Tauri/WebView2 child windows не имеют встроенного механизма управления z-order.

### Решение: SetWindowPos (v4.3.0+)

Вместо пересоздания toolbar при каждом добавлении Claude webview, используется нативный Win32 API `SetWindowPos(HWND_TOP)` для поднятия z-order без потери состояния:

```rust
fn raise_toolbar_zorder(app: &AppHandle) {
    // Получаем HWND через with_webview + controller().ParentWindow()
    // Вызываем SetWindowPos(hwnd, HWND_TOP, 0, 0, 0, 0,
    //     SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
    // Для обоих: "toolbar" и "downloads"
}
```

**Преимущества перед recreate:**
- Нет потери состояния toolbar/downloads
- Нет visual flash при пересоздании
- Нет задержек (`thread::sleep`) на ожидание закрытия/создания
- Мгновенная операция (~0ms vs ~150ms)

### Скрытие webview: hide()/show()

Неактивные webview скрываются через нативный `webview.hide()` вместо позиционирования за экран:

| Метод | CPU | GPU | RAM | Visual |
|-------|-----|-----|-----|--------|
| `hide()` (WebView2 `put_IsVisible(FALSE)`) | Throttle | Off | Кэши очищены | Нет |
| Off-screen `set_position(width*2, 0)` | 100% | Render продолжается | Кэши активны | Нет |

### Suspend/Resume неактивных табов

Дополнительно к `hide()`, неактивные Claude табы приостанавливаются через WebView2 `ICoreWebView2_3`:

```rust
// Suspend: паузит script timers, анимации, минимизирует CPU
core3.TrySuspend(None);

// Resume: мгновенное возобновление
core3.Resume();
```

Вызывается при переключении табов и при toggle панели Claude.

---

## Tauri Commands (Toolbar)

| Команда | Описание |
|---------|----------|
| `toolbar_back` | Навигация назад в Claude WebView |
| `toolbar_forward` | Навигация вперёд |
| `toolbar_reload` | Перезагрузка страницы |
| `toolbar_recreate` | Пересоздать webview (двойной клик reload в toolbar) |
| `show_downloads` | Показать popup загрузок |
| `hide_downloads` | Скрыть popup |
| `forward_scroll` | Проброс скролла на Claude |
| `forward_click` | Проброс клика на Claude |

---

## Tauri Commands (Downloads)

| Команда | Параметры | Возврат | Описание |
|---------|-----------|---------|----------|
| `get_downloads_log` | — | `Vec<DownloadEntry>` | Список загрузок |
| `add_download_entry` | `filename, file_path` | — | Добавить запись |
| `delete_download` | `file_path` | `bool` | Удалить запись |
| `delete_all_downloads` | — | `u32` | Удалить все |
| `open_file` | `file_path` | — | Открыть в системе |
| `read_file_for_attachment` | `path` | `FileData` | Читать для Claude |

→ Структура `DownloadEntry`: [03-BACKEND.md](03-BACKEND.md#downloads--files-commandsdownloadsrs)

---

## Связанные документы

- [01-OVERVIEW.md](01-OVERVIEW.md) — Multi-WebView архитектура
- [03-BACKEND.md](03-BACKEND.md) — Tauri commands
- [05-FEATURES.md](05-FEATURES.md) — Downloads Manager
