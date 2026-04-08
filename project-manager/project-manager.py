#!/usr/bin/env python3
"""
Project Manager - Менеджер AI Prompts Manager

Полное управление проектом:
- Управление вкладками и промптами (хранятся на GitHub)
- Релизы приложения (версионирование + сборка + публикация)
- Git операции (init, push, pull, tag)
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Tuple

# ═══════════════════════════════════════════════════════════════════════════
# КОНФИГУРАЦИЯ
# ═══════════════════════════════════════════════════════════════════════════

PROMPTS_DIR = 'prompts'
MANIFEST_FILE = 'manifest.json'
RELEASE_NOTES_FILE = 'RELEASE_NOTES.txt'
DEFAULT_REMOTE_URL = 'https://github.com/IllWicked/ai-prompts-manager.git'
GITHUB_API_BASE = 'https://api.github.com'
GITHUB_OWNER = 'IllWicked'
GITHUB_REPO = 'ai-prompts-manager'

# ═══════════════════════════════════════════════════════════════════════════
# УТИЛИТЫ
# ═══════════════════════════════════════════════════════════════════════════

def clear_screen() -> None:
    """Очистка экрана"""
    os.system('cls' if os.name == 'nt' else 'clear')

def press_any_key() -> None:
    """Ожидание любой клавиши"""
    print("\n  Нажми любую клавишу...")
    try:
        import msvcrt
        msvcrt.getch()
    except ImportError:
        import termios
        import tty
        fd = sys.stdin.fileno()
        old = termios.tcgetattr(fd)
        try:
            tty.setraw(fd)
            sys.stdin.read(1)
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)

def confirm(message: str) -> bool:
    """Запрос подтверждения"""
    response = input(f"\n  {message} (y/n): ").strip().lower()
    return response == 'y'

def open_in_editor(file_path: Path):
    """Открывает файл в системном редакторе"""
    import platform
    system = platform.system()
    
    # Создаём файл если не существует
    if not file_path.exists():
        file_path.write_text("", encoding='utf-8')
    
    try:
        if system == 'Windows':
            os.startfile(str(file_path))
        elif system == 'Darwin':  # macOS
            subprocess.run(['open', str(file_path)])
        else:  # Linux
            subprocess.run(['xdg-open', str(file_path)])
    except Exception as e:
        print(f"\n  ✗ Не удалось открыть файл: {e}")

def run_cmd(args: List[str], cwd: Optional[Path] = None, show_output: bool = False) -> Tuple[bool, str, str]:
    """Запуск команды"""
    try:
        result = subprocess.run(
            args,
            cwd=cwd,
            capture_output=True,
            text=True
        )
        if show_output and result.stdout:
            print(result.stdout)
        return result.returncode == 0, result.stdout, result.stderr
    except Exception as e:
        return False, '', str(e)

def run_git(args: List[str], cwd: Optional[Path] = None) -> Tuple[bool, str, str]:
    """Запуск git команды"""
    return run_cmd(['git'] + args, cwd)

def name_to_id(name: str) -> str:
    """Конвертирует display name в ID"""
    id_str = re.sub(r'[^a-zA-Z0-9\s\-_]', '', name)
    id_str = re.sub(r'[\s_]+', '-', id_str)
    return id_str.lower().strip('-')

def generate_item_id() -> str:
    """Генерирует уникальный ID для блока"""
    import random
    import string
    timestamp = int(datetime.now().timestamp() * 1000)
    suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=9))
    return f"item_{timestamp}_{suffix}"

def get_current_app_version(script_dir: Path) -> str:
    """Получает текущую версию приложения"""
    tauri_conf = script_dir / 'src-tauri' / 'tauri.conf.json'
    if tauri_conf.exists():
        try:
            data = json.loads(tauri_conf.read_text(encoding='utf-8'))
            return data.get('version', '0.0.0')
        except:
            pass
    return '0.0.0'

# ═══════════════════════════════════════════════════════════════════════════
# РАБОТА С ПРОМПТАМИ
# ═══════════════════════════════════════════════════════════════════════════

def get_github_token() -> Optional[str]:
    """Получает GitHub token из переменной окружения или git config"""
    # Сначала проверяем переменную окружения
    token = os.environ.get('GITHUB_TOKEN')
    if token:
        return token
    
    # Пробуем получить из git config
    try:
        result = subprocess.run(
            ['git', 'config', '--global', 'github.token'],
            capture_output=True, text=True
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except:
        pass
    
    return None

def github_api_get_file(path: str, token: str) -> Optional[Dict]:
    """Получает информацию о файле через GitHub API"""
    import urllib.request
    import urllib.error
    
    url = f"{GITHUB_API_BASE}/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{path}"
    
    req = urllib.request.Request(url)
    req.add_header('Authorization', f'token {token}')
    req.add_header('Accept', 'application/vnd.github.v3+json')
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None  # Файл не существует
        raise
    except:
        return None

def github_api_put_file(path: str, content: str, message: str, token: str, sha: str = None) -> Tuple[bool, str]:
    """Создаёт или обновляет файл через GitHub API"""
    import urllib.request
    import urllib.error
    import base64
    
    url = f"{GITHUB_API_BASE}/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{path}"
    
    # Кодируем контент в base64
    content_b64 = base64.b64encode(content.encode('utf-8')).decode('utf-8')
    
    data = {
        "message": message,
        "content": content_b64,
        "branch": "main"
    }
    
    # Если файл существует — нужен sha для обновления
    if sha:
        data["sha"] = sha
    
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), method='PUT')
    req.add_header('Authorization', f'token {token}')
    req.add_header('Accept', 'application/vnd.github.v3+json')
    req.add_header('Content-Type', 'application/json')
    
    try:
        with urllib.request.urlopen(req, timeout=30):
            return True, "OK"
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        return False, f"HTTP {e.code}: {error_body[:200]}"
    except Exception as e:
        return False, str(e)

def github_api_put_binary_file(path: str, binary_data: bytes, message: str, token: str, sha: str = None) -> Tuple[bool, str]:
    """Создаёт или обновляет бинарный файл через GitHub API"""
    import urllib.request
    import urllib.error
    import base64
    
    url = f"{GITHUB_API_BASE}/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{path}"
    
    content_b64 = base64.b64encode(binary_data).decode('utf-8')
    
    data = {
        "message": message,
        "content": content_b64,
        "branch": "main"
    }
    
    if sha:
        data["sha"] = sha
    
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), method='PUT')
    req.add_header('Authorization', f'token {token}')
    req.add_header('Accept', 'application/vnd.github.v3+json')
    req.add_header('Content-Type', 'application/json')
    
    try:
        with urllib.request.urlopen(req, timeout=30):
            return True, "OK"
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        return False, f"HTTP {e.code}: {error_body[:200]}"
    except Exception as e:
        return False, str(e)

def github_api_delete_file(path: str, message: str, token: str, sha: str) -> Tuple[bool, str]:
    """Удаляет файл через GitHub API"""
    import urllib.request
    import urllib.error
    
    url = f"{GITHUB_API_BASE}/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/{path}"
    
    data = {
        "message": message,
        "sha": sha,
        "branch": "main"
    }
    
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), method='DELETE')
    req.add_header('Authorization', f'token {token}')
    req.add_header('Accept', 'application/vnd.github.v3+json')
    req.add_header('Content-Type', 'application/json')
    
    try:
        with urllib.request.urlopen(req, timeout=30):
            return True, "OK"
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        return False, f"HTTP {e.code}: {error_body[:200]}"
    except Exception as e:
        return False, str(e)

def push_prompts_via_api(files_to_push: List[Tuple[str, str]], message: str) -> Tuple[bool, str]:
    """
    Пушит файлы через GitHub API.
    files_to_push: список (path, content) - путь относительно корня репо и содержимое
    """
    token = get_github_token()
    if not token:
        return False, "Нет GitHub токена. Установи GITHUB_TOKEN или 'git config --global github.token YOUR_TOKEN'"
    
    for path, content in files_to_push:
        # Проверяем существует ли файл (нужен sha для обновления)
        existing = github_api_get_file(path, token)
        sha = existing.get('sha') if existing else None
        
        success, err = github_api_put_file(path, content, message, token, sha)
        if not success:
            return False, f"Ошибка загрузки {path}: {err}"
        
        print(f"     ✓ {path}")
    
    return True, "Файлы загружены"

def github_download_file(path: str) -> Optional[str]:
    """Скачивает файл с GitHub, возвращает содержимое"""
    import base64
    token = get_github_token()
    if not token:
        return None
    
    file_info = github_api_get_file(path, token)
    if not file_info or 'content' not in file_info:
        return None
    
    try:
        return base64.b64decode(file_info['content']).decode('utf-8')
    except:
        return None

def is_git_repo(script_dir: Path) -> bool:
    """Проверяет, является ли директория git репозиторием"""
    return (script_dir / '.git').exists()

def git_status(script_dir: Path) -> Tuple[bool, str, bool]:
    """Проверяет статус git. Возвращает (is_repo, message, has_changes)"""
    if not is_git_repo(script_dir):
        return False, "Не git репозиторий", False
    
    # Проверяем локальные изменения
    success, stdout, _ = run_git(['status', '--porcelain'], script_dir)
    has_local_changes = bool(stdout.strip())
    
    # Проверяем непушнутые коммиты
    has_unpushed = False
    success, stdout, _ = run_git(['rev-list', '--count', '@{u}..HEAD'], script_dir)
    if success and stdout.strip().isdigit() and int(stdout.strip()) > 0:
        has_unpushed = True
    
    if has_local_changes and has_unpushed:
        return True, "Есть изменения и непушнутые коммиты", True
    elif has_local_changes:
        return True, "Есть несохранённые изменения", True
    elif has_unpushed:
        return True, "Есть непушнутые коммиты", True
    return True, "Всё синхронизировано", False

def git_commit_all(script_dir: Path, message: str) -> Tuple[bool, str]:
    """Коммитит все изменения"""
    # Add all
    success, _, err = run_git(['add', '-A'], script_dir)
    if not success:
        return False, f"Ошибка git add: {err}"
    
    # Check if there's anything to commit
    success, stdout, _ = run_git(['status', '--porcelain'], script_dir)
    if not stdout.strip():
        return True, "Нет изменений для коммита"
    
    # Commit
    success, _, err = run_git(['commit', '-m', message], script_dir)
    if not success:
        return False, f"Ошибка git commit: {err}"
    
    return True, "Изменения закоммичены"

def git_push(script_dir: Path, force: bool = False) -> Tuple[bool, str]:
    """Пушит на GitHub"""
    # Определяем текущую ветку
    success, branch, _ = run_git(['rev-parse', '--abbrev-ref', 'HEAD'], script_dir)
    branch = branch.strip() if success else 'main'
    
    # Если detached HEAD, используем main
    if branch == 'HEAD':
        branch = 'main'
    
    args = ['push']
    if force:
        args.append('-f')
    args.extend(['-u', 'origin', branch])
    
    success, _, err = run_git(args, script_dir)
    if not success:
        return False, f"Ошибка git push: {err}"
    
    return True, "Успешно отправлено!"

def git_tag(script_dir: Path, tag: str, message: str = None) -> Tuple[bool, str]:
    """Создаёт тег"""
    args = ['tag']
    if message:
        args.extend(['-a', tag, '-m', message])
    else:
        args.append(tag)
    
    success, _, err = run_git(args, script_dir)
    if not success:
        return False, f"Ошибка git tag: {err}"
    return True, f"Тег {tag} создан"

def git_push_tags(script_dir: Path) -> Tuple[bool, str]:
    """Пушит теги"""
    success, _, err = run_git(['push', '--tags'], script_dir)
    if not success:
        return False, f"Ошибка: {err}"
    return True, "Теги отправлены"

def ensure_git_ready(script_dir: Path, silent: bool = False) -> Tuple[bool, str]:
    """
    Убеждается что git готов к работе.
    Клонирует репозиторий если нет .git
    """
    # Если уже есть .git — готово
    if is_git_repo(script_dir):
        # Делаем pull для синхронизации
        run_git(['pull', '--rebase', 'origin', 'main'], script_dir)
        return True, "Git готов"
    
    if not silent:
        print("\n  📦 Клонирование репозитория...")
    
    # Клонируем во временную папку, потом копируем .git
    import tempfile
    import shutil
    
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir) / "repo"
        
        success, stdout, err = run_cmd(['git', 'clone', DEFAULT_REMOTE_URL, str(tmp_path)])
        if not success:
            return False, f"Ошибка clone: {err}"
        
        # Копируем .git из клона
        src_git = tmp_path / '.git'
        dst_git = script_dir / '.git'
        
        if dst_git.exists():
            shutil.rmtree(dst_git, ignore_errors=True)
        shutil.copytree(src_git, dst_git)
        
        # Копируем prompts/ если есть (для мержа манифеста)
        src_prompts = tmp_path / 'prompts'
        dst_prompts = script_dir / 'prompts'
        if src_prompts.exists():
            if dst_prompts.exists():
                # Мержим манифест
                src_manifest = src_prompts / 'manifest.json'
                dst_manifest = dst_prompts / 'manifest.json'
                if src_manifest.exists() and dst_manifest.exists():
                    try:
                        with open(src_manifest, 'r', encoding='utf-8') as f:
                            remote = json.load(f)
                        with open(dst_manifest, 'r', encoding='utf-8') as f:
                            local = json.load(f)
                        # Remote tabs добавляем к локальным
                        for tab_id, info in remote.get('tabs', {}).items():
                            if tab_id not in local.get('tabs', {}):
                                local.setdefault('tabs', {})[tab_id] = info
                        with open(dst_manifest, 'w', encoding='utf-8') as f:
                            json.dump(local, f, ensure_ascii=False, indent=2)
                    except:
                        pass
            else:
                shutil.copytree(src_prompts, dst_prompts)
    
    if not silent:
        print("     ✓ Репозиторий клонирован")
    
    return True, "Git готов"

# ═══════════════════════════════════════════════════════════════════════════
# УПРАВЛЕНИЕ ВЕРСИЯМИ ПРИЛОЖЕНИЯ
# ═══════════════════════════════════════════════════════════════════════════

def update_app_version(script_dir: Path, new_version: str) -> List[str]:
    """Обновляет версию во всех файлах"""
    changes = []
    
    # tauri.conf.json
    tauri_conf = script_dir / 'src-tauri' / 'tauri.conf.json'
    if tauri_conf.exists():
        content = tauri_conf.read_text(encoding='utf-8')
        new_content = re.sub(r'"version":\s*"[^"]+"', f'"version": "{new_version}"', content, count=1)
        if new_content != content:
            tauri_conf.write_text(new_content, encoding='utf-8')
            changes.append("tauri.conf.json")
    
    # Cargo.toml
    cargo_toml = script_dir / 'src-tauri' / 'Cargo.toml'
    if cargo_toml.exists():
        content = cargo_toml.read_text(encoding='utf-8')
        new_content = re.sub(r'^version\s*=\s*"[^"]+"', f'version = "{new_version}"', content, flags=re.MULTILINE)
        if new_content != content:
            cargo_toml.write_text(new_content, encoding='utf-8')
            changes.append("Cargo.toml")
    
    # index.html - два места
    index_html = script_dir / 'dist' / 'index.html'
    if index_html.exists():
        content = index_html.read_text(encoding='utf-8')
        original = content
        # 1. Версия в настройках: <span id="settings-version">X.X.X</span>
        content = re.sub(
            r'(<span id="settings-version">)[^<]+(</span>)',
            f'\\g<1>{new_version}\\g<2>',
            content
        )
        # 2. Версия в ASCII-баннере: AI PROMPTS MANAGER vX.X.X
        content = re.sub(
            r'(AI PROMPTS MANAGER v)[0-9]+\.[0-9]+\.[0-9]+',
            f'\\g<1>{new_version}',
            content
        )
        if content != original:
            index_html.write_text(content, encoding='utf-8')
            changes.append("index.html")
    
    # docs/INDEX.md — версия документации
    index_md = script_dir / 'docs' / 'INDEX.md'
    if index_md.exists():
        content = index_md.read_text(encoding='utf-8')
        new_content = re.sub(
            r'(\*\*Версия:\*\*\s*)[0-9]+\.[0-9]+\.[0-9]+',
            f'\\g<1>{new_version}',
            content
        )
        if new_content != content:
            index_md.write_text(new_content, encoding='utf-8')
            changes.append("docs/INDEX.md")
    
    # README.md — версия в шапке
    readme_md = script_dir / 'README.md'
    if readme_md.exists():
        content = readme_md.read_text(encoding='utf-8')
        new_content = re.sub(
            r'(\*\*Версия:\*\*\s*)[0-9]+\.[0-9]+\.[0-9]+',
            f'\\g<1>{new_version}',
            content
        )
        if new_content != content:
            readme_md.write_text(new_content, encoding='utf-8')
            changes.append("README.md")
    
    # package.json — версия пакета
    package_json = script_dir / 'package.json'
    if package_json.exists():
        content = package_json.read_text(encoding='utf-8')
        new_content = re.sub(
            r'("version":\s*")[^"]+"',
            f'\\g<1>{new_version}"',
            content,
            count=1
        )
        if new_content != content:
            package_json.write_text(new_content, encoding='utf-8')
            changes.append("package.json")
    
    return changes

def get_release_notes(script_dir: Path) -> str:
    """Читает release notes"""
    notes_file = script_dir / RELEASE_NOTES_FILE
    if notes_file.exists():
        return notes_file.read_text(encoding='utf-8')
    return ""

def display_tabs(tabs: List[Dict]):
    """Отображает список вкладок"""
    W = 59
    
    def pad_line(text: str) -> str:
        visual_len = len(text)
        padding = W - visual_len
        return text + ' ' * max(0, padding)
    
    print("\n  ┌" + "─" * W + "┐")
    print("  │" + pad_line("  ГОТОВО К ПУШУ (prompts/)") + "│")
    print("  ├" + "─" * W + "┤")
    
    if not tabs:
        print("  │" + pad_line("  (нет вкладок)") + "│")
    else:
        for i, tab in enumerate(tabs, 1):
            line = f"  {i}. {tab['name']:<20} v{tab['version']:<8} ({tab['blocks']} блоков)"
            print("  │" + pad_line(line) + "│")
    
    print("  └" + "─" * W + "┘")

def fetch_github_manifest() -> Optional[Dict]:
    """Загружает манифест с GitHub через API (без кэша)"""
    import urllib.request
    import json
    import base64
    
    # GitHub API не кэшируется так агрессивно как raw.githubusercontent
    url = "https://api.github.com/repos/IllWicked/ai-prompts-manager/contents/prompts/manifest.json"
    
    try:
        req = urllib.request.Request(url, headers={
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'ai-prompts-manager'
        })
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            # API возвращает base64-encoded content
            content = base64.b64decode(data['content']).decode('utf-8')
            return json.loads(content)
    except Exception:
        # Fallback на raw с cache-busting
        import time
        cache_bust = int(time.time())
        url = f"https://raw.githubusercontent.com/IllWicked/ai-prompts-manager/main/prompts/manifest.json?t={cache_bust}"
        try:
            req = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req, timeout=10) as response:
                return json.loads(response.read().decode('utf-8'))
        except:
            return None

def fetch_github_app_version() -> Optional[str]:
    """Загружает версию последнего релиза с GitHub"""
    import urllib.request
    import json
    
    url = "https://api.github.com/repos/IllWicked/ai-prompts-manager/releases/latest"
    
    try:
        req = urllib.request.Request(url, headers={
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'ai-prompts-manager'
        })
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            tag = data.get('tag_name', '')
            # Убираем 'v' в начале если есть
            return tag.lstrip('v') if tag else None
    except:
        return None

def menu_prompts(script_dir: Path, project_dir: Path):
    """Подменю управления промптами"""
    while True:
        clear_screen()
        print("\n  ═══════════════════════════════════════════════════════")
        print("                    УПРАВЛЕНИЕ ПРОМПТАМИ")
        print("  ═══════════════════════════════════════════════════════")
        
        # Загружаем данные с GitHub
        print("\n  Загрузка данных с GitHub...", end="", flush=True)
        github_data = fetch_github_manifest()
        print("\r" + " " * 40 + "\r", end="")  # Очищаем строку
        
        if github_data and github_data.get('tabs'):
            print("\n  Вкладки на GitHub:")
            tabs = sorted(github_data['tabs'].items(), key=lambda x: x[1].get('order', 99))
            for i, (tab_id, info) in enumerate(tabs, 1):
                print(f"    {i}. {info.get('name', tab_id)} (v{info.get('version', '?')})")
        else:
            print("\n  ⚠ Нет вкладок на GitHub или не удалось загрузить")
        
        # Показываем JSON файлы рядом со скриптом (готовы к пушу)
        json_files = [f for f in script_dir.glob('*.json') 
                      if f.name != 'manifest.json' and f.parent == script_dir]
        
        if json_files:
            print(f"\n  📁 JSON файлов к пушу: {len(json_files)}")
            for f in json_files:
                print(f"      - {f.name}")
        
        print("\n  1. Переименовать вкладку (GitHub)")
        print("  2. Удалить вкладку (GitHub)")
        print("  3. Изменить порядок вкладок (GitHub)")
        print("  ─────────────────────────────────────")
        print("  0. ← Назад")
        
        choice = input("\n  Выбор: ").strip()
        
        if choice == '0':
            break
        elif choice == '1':
            submenu_rename_tab(script_dir)
        elif choice == '2':
            submenu_delete_tab(script_dir)
        elif choice == '3':
            submenu_reorder_tabs(script_dir)

def submenu_rename_tab(script_dir: Path):
    print("\n  ─── ПЕРЕИМЕНОВАНИЕ ВКЛАДКИ (GitHub) ───")
    
    # Проверяем токен
    if not get_github_token():
        print("\n  ⚠ Нет GitHub токена!")
        press_any_key()
        return
    
    # Загружаем манифест с GitHub
    print("\n  Загрузка с GitHub...", end="", flush=True)
    github_data = fetch_github_manifest()
    print(" ✓" if github_data else " ✗")
    
    if not github_data or not github_data.get('tabs'):
        print("\n  ⚠ Нет вкладок на GitHub!")
        press_any_key()
        return
    
    tabs = sorted(github_data['tabs'].items(), key=lambda x: x[1].get('order', 99))
    
    print("\n  Вкладки:")
    for i, (tab_id, info) in enumerate(tabs, 1):
        print(f"    {i}. {info.get('name', tab_id)} (v{info.get('version', '?')})")
    
    try:
        num = int(input("\n  Номер вкладки (0 - отмена): ").strip())
        if num == 0:
            return
        if 1 <= num <= len(tabs):
            tab_id, tab_info = tabs[num - 1]
            old_name = tab_info.get('name', tab_id)
            print(f"\n  Текущее имя: {old_name}")
            new_name = input("  Новое имя: ").strip()
            
            if not new_name:
                print("\n  ⚠ Имя не может быть пустым!")
                press_any_key()
                return
            
            # Скачиваем файл вкладки
            print("\n  Скачивание...", end="", flush=True)
            tab_content = github_download_file(f"prompts/{tab_id}.json")
            if not tab_content:
                print(" ✗")
                print("\n  ⚠ Не удалось скачать вкладку!")
                press_any_key()
                return
            print(" ✓")
            
            # Редактируем
            data = json.loads(tab_content)
            if 'tab' in data:
                data['tab']['name'] = new_name.upper()
            else:
                data['name'] = new_name.upper()
            
            # Обновляем манифест
            github_data['tabs'][tab_id]['name'] = new_name.upper()
            
            # Пушим
            files_to_push = [
                (f"prompts/{tab_id}.json", json.dumps(data, ensure_ascii=False, indent=2)),
                ("prompts/manifest.json", json.dumps(github_data, ensure_ascii=False, indent=2))
            ]
            
            print("  Отправка...", end="", flush=True)
            success, msg = push_prompts_via_api(files_to_push, f"Rename {old_name} → {new_name.upper()}")
            print()
            
            if success:
                print(f"\n  ✓ Переименовано: {old_name} → {new_name.upper()}")
            else:
                print(f"\n  ✗ {msg}")
        else:
            print("\n  ⚠ Неверный номер!")
    except ValueError:
        print("\n  ⚠ Введи число!")
    press_any_key()

def submenu_delete_tab(script_dir: Path):
    """Удаление вкладки с GitHub"""
    print("\n  ─── УДАЛЕНИЕ ВКЛАДКИ (GitHub) ───")
    
    # Проверяем токен
    token = get_github_token()
    if not token:
        print("\n  ⚠ Нет GitHub токена!")
        press_any_key()
        return
    
    # Загружаем манифест с GitHub
    print("\n  Загрузка с GitHub...", end="", flush=True)
    github_data = fetch_github_manifest()
    print(" ✓" if github_data else " ✗")
    
    if not github_data or not github_data.get('tabs'):
        print("\n  ⚠ Нет вкладок на GitHub!")
        press_any_key()
        return
    
    tabs = sorted(github_data['tabs'].items(), key=lambda x: x[1].get('order', 99))
    
    print("\n  Вкладки:")
    for i, (tab_id, info) in enumerate(tabs, 1):
        print(f"    {i}. {info.get('name', tab_id)} (v{info.get('version', '?')})")
    
    try:
        num = int(input("\n  Номер для удаления (0 - отмена): ").strip())
        if num == 0:
            return
        if 1 <= num <= len(tabs):
            tab_id, tab_info = tabs[num - 1]
            tab_name = tab_info.get('name', tab_id)
            
            if not confirm(f"Удалить '{tab_name}' с GitHub?"):
                return
            
            # Получаем sha файла вкладки
            print("\n  Удаление...", end="", flush=True)
            file_info = github_api_get_file(f"prompts/{tab_id}.json", token)
            if not file_info:
                print(" ✗")
                print("\n  ⚠ Файл не найден на GitHub!")
                press_any_key()
                return
            
            # Удаляем файл
            success, msg = github_api_delete_file(
                f"prompts/{tab_id}.json",
                f"Delete {tab_name}",
                token,
                file_info['sha']
            )
            
            if not success:
                print(" ✗")
                print(f"\n  ✗ {msg}")
                press_any_key()
                return
            
            # Обновляем манифест
            del github_data['tabs'][tab_id]
            manifest_content = json.dumps(github_data, ensure_ascii=False, indent=2)
            
            success, msg = push_prompts_via_api(
                [("prompts/manifest.json", manifest_content)],
                f"Update manifest after deleting {tab_name}"
            )
            print()
            
            if success:
                print(f"\n  ✓ Вкладка '{tab_name}' удалена с GitHub!")
            else:
                print(f"\n  ⚠ Файл удалён, но манифест не обновлён: {msg}")
        else:
            print("\n  ⚠ Неверный номер!")
    except ValueError:
        print("\n  ⚠ Введи число!")
    press_any_key()

def submenu_reorder_tabs(script_dir: Path):
    """Изменение порядка вкладок на GitHub"""
    print("\n  ─── ИЗМЕНЕНИЕ ПОРЯДКА (GitHub) ───")
    
    # Проверяем токен
    if not get_github_token():
        print("\n  ⚠ Нет GitHub токена!")
        press_any_key()
        return
    
    # Загружаем манифест с GitHub
    print("\n  Загрузка с GitHub...", end="", flush=True)
    github_data = fetch_github_manifest()
    print(" ✓" if github_data else " ✗")
    
    if not github_data or not github_data.get('tabs'):
        print("\n  ⚠ Нет вкладок на GitHub!")
        press_any_key()
        return
    
    tabs = sorted(github_data['tabs'].items(), key=lambda x: x[1].get('order', 99))
    
    if len(tabs) < 2:
        print("\n  ⚠ Нужно минимум 2 вкладки!")
        press_any_key()
        return
    
    print("\n  Текущий порядок:")
    for i, (tab_id, info) in enumerate(tabs, 1):
        print(f"    {i}. {info.get('name', tab_id)}")
    
    print("\n  Введи новый порядок номеров через пробел")
    print("  Пример: 2 1 3 (поменять первую и вторую местами)")
    
    order_input = input("\n  Новый порядок: ").strip()
    
    if not order_input:
        print("\n  Отменено.")
        press_any_key()
        return
    
    try:
        new_order = [int(x) for x in order_input.split()]
        
        if len(new_order) != len(tabs):
            print(f"\n  ⚠ Нужно указать {len(tabs)} номеров!")
            press_any_key()
            return
        
        if sorted(new_order) != list(range(1, len(tabs) + 1)):
            print(f"\n  ⚠ Номера должны быть от 1 до {len(tabs)} без повторов!")
            press_any_key()
            return
        
        # Скачиваем все файлы вкладок
        print("\n  Скачивание вкладок...")
        files_to_push = []
        
        for new_pos, old_pos in enumerate(new_order, 1):
            tab_id, tab_info = tabs[old_pos - 1]
            
            # Обновляем порядок в манифесте
            github_data['tabs'][tab_id]['order'] = new_pos
            
            # Скачиваем и обновляем файл вкладки
            tab_content = github_download_file(f"prompts/{tab_id}.json")
            if tab_content:
                data = json.loads(tab_content)
                if 'tab' in data:
                    data['tab']['order'] = new_pos
                else:
                    data['order'] = new_pos
                files_to_push.append((f"prompts/{tab_id}.json", json.dumps(data, ensure_ascii=False, indent=2)))
                print(f"    ✓ {tab_info.get('name', tab_id)}: позиция {new_pos}")
        
        # Добавляем манифест
        files_to_push.append(("prompts/manifest.json", json.dumps(github_data, ensure_ascii=False, indent=2)))
        
        # Пушим
        print("\n  Отправка на GitHub...")
        success, msg = push_prompts_via_api(files_to_push, "Reorder tabs")
        
        if success:
            print("\n  ✓ Порядок изменён!")
        else:
            print(f"\n  ✗ {msg}")
        
    except ValueError:
        print("\n  ⚠ Введи числа через пробел!")
    
    press_any_key()

# ═══════════════════════════════════════════════════════════════════════════
# ИНТЕРФЕЙС - МЕНЮ GIT
# ═══════════════════════════════════════════════════════════════════════════

def menu_git(script_dir: Path, project_dir: Path):
    """Подменю Push операций"""
    
    while True:
        clear_screen()
        
        print("\n  ═══════════════════════════════════════════════════════")
        print("                          PUSH")
        print("  ═══════════════════════════════════════════════════════\n")
        
        # JSON файлы к пушу промптов
        json_files = [f for f in script_dir.glob('*.json') 
                      if f.name != 'manifest.json' and f.parent == script_dir]
        
        if json_files:
            print(f"  📝 JSON файлов к пушу: {len(json_files)}")
            for f in json_files:
                print(f"      - {f.name}")
        else:
            print("  📝 Нет JSON файлов для пуша промптов")
        
        # .skill файлы к пушу (лежат рядом со скриптом)
        skill_files = sorted(script_dir.glob('*.skill'))
        if skill_files:
            print(f"\n  ⚡ Скиллов к пушу: {len(skill_files)}")
            for sf in skill_files:
                print(f"      - {sf.name} ({sf.stat().st_size / 1024:.1f} KB)")
        else:
            print("\n  ⚡ Нет .skill файлов для пуша")
        
        print("\n  ─────────────────────────────────────")
        print("  1. ↑ Push промптов на GitHub")
        print("  2. ↑ Push скиллов на GitHub")
        print("  ─────────────────────────────────────")
        print("  0. ← Назад")
        
        choice = input("\n  Выбор: ").strip()
        
        if choice == '0':
            break
        elif choice == '1':
            submenu_git_push(script_dir, project_dir)
        elif choice == '2':
            _push_skills(script_dir)

def submenu_git_push(script_dir: Path, project_dir: Path):
    print("\n  ─── PUSH ПРОМПТОВ НА GITHUB ───")
    
    # Проверяем токен
    token = get_github_token()
    if not token:
        print("\n  ⚠ Нет GitHub токена!")
        print("\n  Установи токен одним из способов:")
        print("    1. Переменная окружения: set GITHUB_TOKEN=твой_токен")
        print("    2. Git config: git config --global github.token твой_токен")
        print("\n  Токен создаётся на GitHub → Settings → Developer settings → Personal access tokens")
        press_any_key()
        return
    
    # Проверяем есть ли JSON файлы для отправки
    json_files = [f for f in script_dir.glob('*.json') 
                  if f.name != 'manifest.json' and f.parent == script_dir]
    
    if not json_files:
        print("\n  ⚠ Нет вкладок для отправки!")
        print("  Положи JSON файлы рядом со скриптом.")
        press_any_key()
        return
    
    # Загружаем данные с GitHub для определения версий
    print("\n  📡 Загрузка данных с GitHub...")
    github_data = fetch_github_manifest()
    print(f"  {'✓' if github_data else '!'} {'Загружено' if github_data else 'Новый репозиторий'}")
    
    # Собираем файлы для загрузки
    files_to_push = []  # [(path, content), ...]
    manifest = github_data.copy() if github_data else {"tabs": {}}
    
    print(f"\n  📂 Подготовка файлов ({len(json_files)})...")
    
    for json_file in json_files:
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            tab_info = data.get('tab', data)
            tab_id = tab_info.get('id', json_file.stem)
            tab_name = tab_info.get('name', tab_id.upper())
            
            # Определяем версию
            if github_data and tab_id in github_data.get('tabs', {}):
                # Есть на GitHub — увеличиваем версию
                old_version = github_data['tabs'][tab_id].get('version', '1.0.0')
                parts = old_version.split('.')
                parts[-1] = str(int(parts[-1]) + 1)
                new_version = '.'.join(parts)
            else:
                # Новая вкладка
                old_version = None
                new_version = '1.0.0'
            
            # Обновляем версию в данных
            if 'tab' in data:
                data['tab']['version'] = new_version
            else:
                data['version'] = new_version
            
            # Добавляем в манифест
            manifest.setdefault('tabs', {})[tab_id] = {
                'name': tab_name.upper(),
                'version': new_version,
                'order': tab_info.get('order', len(manifest.get('tabs', {})) + 1)
            }
            
            # Добавляем файл для загрузки
            content = json.dumps(data, ensure_ascii=False, indent=2)
            files_to_push.append((f"prompts/{tab_id}.json", content))
            
            if old_version:
                print(f"     {tab_name.upper()}: v{old_version} → v{new_version}")
            else:
                print(f"     {tab_name.upper()}: v{new_version} (новая)")
            
        except Exception as e:
            print(f"     ✗ {json_file.name}: {e}")
    
    if not files_to_push:
        print("\n  ⚠ Нечего загружать!")
        press_any_key()
        return
    
    # Нормализуем order — убираем дубликаты
    if manifest.get('tabs'):
        tabs_sorted = sorted(manifest['tabs'].items(), key=lambda x: x[1].get('order', 99))
        for i, (tab_id, info) in enumerate(tabs_sorted, 1):
            manifest['tabs'][tab_id]['order'] = i
    
    manifest.pop('release_notes', None)
    manifest['updated'] = datetime.now().strftime("%Y-%m-%d")
    
    # Добавляем манифест
    manifest_content = json.dumps(manifest, ensure_ascii=False, indent=2)
    files_to_push.append(("prompts/manifest.json", manifest_content))
    
    message = f"Prompts update {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    
    if not confirm(f"Отправить {len(files_to_push)} файлов?"):
        return
    
    print("\n  📤 Загрузка на GitHub...")
    success, msg = push_prompts_via_api(files_to_push, message)
    print(f"\n  {'✓' if success else '✗'} {msg}")
    
    if success:
        # Очистка
        print("\n  🧹 Очистка...")
        for json_file in json_files:
            try:
                json_file.unlink()
            except:
                pass
        
        # Удаляем папку prompts/
        import shutil
        import stat
        import sys
        
        def remove_readonly(func, path, excinfo):
            os.chmod(path, stat.S_IWRITE)
            func(path)
        
        prompts_dir = script_dir / PROMPTS_DIR
        if prompts_dir.exists():
            try:
                if sys.version_info >= (3, 12):
                    shutil.rmtree(prompts_dir, onexc=remove_readonly)
                else:
                    shutil.rmtree(prompts_dir, onerror=remove_readonly)
            except:
                pass
        
        print("  ✓ Готово!")
    
    press_any_key()

def menu_release(project_dir: Path):
    """Подменю релизов"""
    while True:
        clear_screen()
        app_version = get_current_app_version(project_dir)
        github_version = fetch_github_app_version()
        
        print("\n  ═══════════════════════════════════════════════════════")
        print("                     РЕЛИЗЫ ПРИЛОЖЕНИЯ")
        print("  ═══════════════════════════════════════════════════════\n")
        
        print(f"  Локальная версия:  v{app_version}")
        if github_version:
            if github_version == app_version:
                print(f"  Последний релиз:   v{github_version} ✓")
            else:
                print(f"  Последний релиз:   v{github_version} ≠")
        else:
            print(f"  Последний релиз:   не удалось загрузить")
        
        notes = get_release_notes(project_dir)
        if notes:
            preview = notes.split('\n')[0][:50]
            print(f"\n  Release notes: {preview}...")
        
        print("\n  ─────────────────────────────────────")
        print("  1. Изменить версию")
        print("  2. Редактировать Release Notes")
        print("  3. 🚀 СОЗДАТЬ РЕЛИЗ (tag + push)")
        print("  ─────────────────────────────────────")
        print("  0. ← Назад")
        
        choice = input("\n  Выбор: ").strip()
        
        if choice == '0':
            break
        elif choice == '1':
            submenu_change_version(project_dir)
        elif choice == '2':
            submenu_edit_release_notes(project_dir)
        elif choice == '3':
            submenu_create_release(project_dir)

def submenu_change_version(project_dir: Path):
    current = get_current_app_version(project_dir)
    print("\n  ─── ИЗМЕНЕНИЕ ВЕРСИИ ───")
    print(f"\n  Текущая: v{current}")
    
    new_version = input("  Новая версия (например 4.1.0): ").strip()
    
    if new_version:
        changes = update_app_version(project_dir, new_version)
        if changes:
            print(f"\n  ✓ Обновлено: {', '.join(changes)}")
        else:
            print("\n  ⚠ Ничего не изменилось")
    press_any_key()

def submenu_edit_release_notes(project_dir: Path):
    release_notes_path = project_dir / RELEASE_NOTES_FILE
    open_in_editor(release_notes_path)
    print("\n  ✓ Файл открыт в редакторе")
    press_any_key()

def submenu_create_release(project_dir: Path):
    """Создание полного релиза"""
    print("\n  ═══════════════════════════════════════════════════════")
    print("                    🚀 СОЗДАНИЕ РЕЛИЗА")
    print("  ═══════════════════════════════════════════════════════\n")
    
    app_version = get_current_app_version(project_dir)
    
    # Автоматически настраиваем git если нужно
    success, msg = ensure_git_ready(project_dir)
    if not success:
        print(f"\n  ✗ {msg}")
        press_any_key()
        return
    
    print(f"\n  Версия приложения: v{app_version}")
    print(f"  Будет создан тег: v{app_version}")
    
    notes = get_release_notes(project_dir)
    if notes:
        print("\n  Release notes:\n  ─────────────────────────")
        for line in notes.split('\n')[:5]:
            print(f"  {line}")
        if len(notes.split('\n')) > 5:
            print("  ...")
    
    print("\n  ─────────────────────────────────────")
    print("  Это действие выполнит:")
    print("    1. git add -A")
    print("    2. git commit")
    print(f"    3. git tag v{app_version}")
    print("    4. git push + push --tags")
    print("\n  После push с тегом GitHub Actions автоматически")
    print("  соберёт и опубликует релиз.")
    print("  ─────────────────────────────────────")
    
    if not confirm("Создать релиз?"):
        print("\n  Отменено.")
        press_any_key()
        return
    
    # Выполняем
    print("\n  Выполнение...")
    
    # 1. Commit
    message = f"Release v{app_version}"
    print(f"\n  [1/4] Коммит: {message}")
    success, msg = git_commit_all(project_dir, message)
    print(f"        {'✓' if success else '✗'} {msg}")
    if not success and "Нет изменений" not in msg:
        press_any_key()
        return
    
    # 2. Tag
    tag = f"v{app_version}"
    print(f"\n  [2/4] Создание тега: {tag}")
    success, msg = git_tag(project_dir, tag, notes if notes else f"Release {tag}")
    print(f"        {'✓' if success else '✗'} {msg}")
    if not success:
        press_any_key()
        return
    
    # 3. Push
    print("\n  [3/4] Push коммитов...")
    success, msg = git_push(project_dir)
    print(f"        {'✓' if success else '✗'} {msg}")
    if not success:
        press_any_key()
        return
    
    # 4. Push tags
    print("\n  [4/4] Push тегов...")
    success, msg = git_push_tags(project_dir)
    print(f"        {'✓' if success else '✗'} {msg}")
    
    print("\n  ═══════════════════════════════════════════════════════")
    print("  ✓ РЕЛИЗ СОЗДАН!")
    print("  ═══════════════════════════════════════════════════════")
    print("\n  GitHub Actions начнёт сборку автоматически.")
    print("  Следи за прогрессом: GitHub → Actions")
    
    press_any_key()

# ═══════════════════════════════════════════════════════════════════════════
# ГЛАВНОЕ МЕНЮ
# ═══════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════
# PUSH СКИЛЛОВ
# ═══════════════════════════════════════════════════════════════════════════

def _push_skills(script_dir: Path):
    """Пушит скиллы на GitHub. .skill файлы лежат рядом со скриптом, удаляются после пуша."""
    print("\n  ─── PUSH СКИЛЛОВ НА GITHUB ───")
    
    token = get_github_token()
    if not token:
        print("\n  ⚠ Нет GitHub токена!")
        print("  Установи: set GITHUB_TOKEN=твой_токен")
        press_any_key()
        return
    
    # Ищем .skill файлы рядом со скриптом
    skill_files = sorted(script_dir.glob('*.skill'))
    if not skill_files:
        print("\n  ⚠ Нет .skill файлов для отправки!")
        print("  Положи .skill файлы рядом со скриптом.")
        press_any_key()
        return
    
    # Загружаем текущий манифест с GitHub для определения версии
    print("\n  📡 Загрузка данных с GitHub...", end="", flush=True)
    github_manifest = None
    try:
        import urllib.request
        import base64
        url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/contents/skills/manifest.json"
        req = urllib.request.Request(url, headers={
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': f'token {token}',
            'User-Agent': 'ai-prompts-manager'
        })
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))
            github_manifest = json.loads(base64.b64decode(data['content']).decode('utf-8'))
    except:
        pass
    print(f" {'✓' if github_manifest else '!'} {'Загружено' if github_manifest else 'Новый репозиторий'}")
    
    # Определяем версию (автоинкремент)
    old_version = github_manifest.get('version', '0.0.0') if github_manifest else None
    if old_version:
        parts = old_version.split('.')
        parts[-1] = str(int(parts[-1]) + 1)
        new_version = '.'.join(parts)
    else:
        new_version = '1.0.0'
    
    # Собираем манифест из файлов к пушу
    skills_list = []
    print(f"\n  📂 Подготовка файлов ({len(skill_files)})...\n")
    for sf in skill_files:
        skills_list.append({
            "name": sf.stem,
            "file": sf.name,
            "size": sf.stat().st_size
        })
        if old_version:
            print(f"     {sf.name} ({sf.stat().st_size / 1024:.1f} KB)")
        else:
            print(f"     {sf.name} ({sf.stat().st_size / 1024:.1f} KB) (новый)")
    
    manifest = {
        "version": new_version,
        "updated": datetime.now().strftime("%Y-%m-%d"),
        "skills": skills_list
    }
    
    if old_version:
        print(f"\n  Версия: v{old_version} → v{new_version}")
    else:
        print(f"\n  Версия: v{new_version}")
    
    message = f"Skills v{new_version}"
    
    if not confirm(f"Отправить {len(skill_files) + 1} файлов?"):
        return
    
    print("\n  📤 Загрузка на GitHub...")
    errors = []
    
    # Загружаем .skill файлы (бинарные)
    for sf in skill_files:
        path = f"skills/{sf.name}"
        existing = github_api_get_file(path, token)
        sha = existing.get('sha') if existing else None
        success, err = github_api_put_binary_file(path, sf.read_bytes(), message, token, sha)
        print(f"     {'✓' if success else '✗'} {sf.name}" + (f": {err}" if not success else ""))
        if not success:
            errors.append(sf.name)
    
    # Загружаем манифест (текстовый)
    manifest_content = json.dumps(manifest, ensure_ascii=False, indent=4)
    path = "skills/manifest.json"
    existing = github_api_get_file(path, token)
    sha = existing.get('sha') if existing else None
    success, err = github_api_put_file(path, manifest_content, message, token, sha)
    print(f"     {'✓' if success else '✗'} manifest.json" + (f": {err}" if not success else ""))
    if not success:
        errors.append("manifest.json")
    
    if not errors:
        # Очистка — удаляем .skill файлы рядом со скриптом
        print("\n  🧹 Очистка...")
        for sf in skill_files:
            try:
                sf.unlink()
            except:
                pass
        print(f"  ✓ Готово! ({len(skill_files)} скиллов, v{new_version})")
    else:
        print(f"\n  ⚠ Ошибки: {', '.join(errors)}")
    
    press_any_key()

def main_menu():
    """Главное меню"""
    script_dir = Path(__file__).parent  # project-manager/
    project_dir = script_dir.parent     # корень проекта (на уровень выше)
    
    while True:
        clear_screen()
        
        # Заголовок
        app_version = get_current_app_version(project_dir)
        print("\n╔" + "═" * 61 + "╗")
        title = "PROJECT MANAGER - AI Prompts Manager"
        left_pad = (61 - len(title)) // 2
        print("║" + " " * left_pad + title + " " * (61 - left_pad - len(title)) + "║")
        print("╠" + "═" * 61 + "╣")
        print("║" + f"  Приложение: v{app_version}".ljust(61) + "║")
        print("╚" + "═" * 61 + "╝")
        
        # JSON файлы к пушу (лежат рядом со скриптом)
        json_files = [f for f in script_dir.glob('*.json') 
                      if f.name != 'manifest.json' and f.parent == script_dir]
        skill_files = sorted(script_dir.glob('*.skill'))
        
        if json_files or skill_files:
            print()
            if json_files:
                print(f"  📝 JSON файлов к пушу: {len(json_files)}")
                for f in json_files:
                    print(f"      - {f.name}")
            if skill_files:
                print(f"  ⚡ Скиллов к пушу: {len(skill_files)}")
                for f in skill_files:
                    print(f"      - {f.name}")
        
        print("\n  ГЛАВНОЕ МЕНЮ:")
        print("  ═════════════════════════════════════")
        print("  1. 📝 Промпты (переименовать/порядок на GitHub)")
        print("  2. 📦 Push (промпты и скиллы на GitHub)")
        print("  3. 🚀 Релизы (новая версия программы)")
        print("  ═════════════════════════════════════")
        print("  0. Выход")
        
        choice = input("\n  Выбор (0-3): ").strip()
        
        if choice == '0':
            print("\n  Выход...")
            break
        elif choice == '1':
            menu_prompts(script_dir, project_dir)
        elif choice == '2':
            menu_git(script_dir, project_dir)
        elif choice == '3':
            menu_release(project_dir)

def main():
    try:
        main_menu()
    except KeyboardInterrupt:
        print("\n\n  Прервано.")
        sys.exit(0)
    except Exception as e:
        print(f"\n  ОШИБКА: {e}")
        import traceback
        traceback.print_exc()
        press_any_key()
        sys.exit(1)

if __name__ == '__main__':
    main()
