# Claude AI Prompts - Tauri версия

Легковесная версия приложения (~3-5 МБ вместо 150 МБ Electron).

## Требования для сборки

### Windows
1. **Rust** - https://rustup.rs/
2. **Microsoft C++ Build Tools** - https://visualstudio.microsoft.com/visual-cpp-build-tools/
   - Установи "Desktop development with C++"
3. **WebView2** - обычно уже есть в Windows 10/11

### Установка Rust (если ещё нет)
```bash
# Windows - скачай и запусти rustup-init.exe с https://rustup.rs/
# После установки перезапусти терминал
```

## Сборка

```bash
cd src-tauri

# Первый раз - скачает зависимости (может занять несколько минут)
cargo build --release

# Или собрать установщик
cargo tauri build
```

## Результат сборки

После `cargo tauri build`:
- `src-tauri/target/release/claude-prompts.exe` - портативный exe (~3-5 МБ)
- `src-tauri/target/release/bundle/` - установщики (msi, nsis)

## Разработка

```bash
cargo tauri dev
```

## Иконки

Для полной сборки нужны иконки в папке `src-tauri/icons/`:
- `icon.ico` (Windows) ✓
- `icon.icns` (macOS)
- `32x32.png`
- `128x128.png`
- `128x128@2x.png`

Можно сгенерировать из одной картинки: https://tauri.app/v1/guides/features/icons/

## Примечания

- Данные (localStorage) хранятся в `%APPDATA%/com.claude.prompts/`
- Приложение использует системный WebView2, поэтому размер минимальный
