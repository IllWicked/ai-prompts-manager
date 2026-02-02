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

class PromptsManager:
    def __init__(self, script_dir: Path):
        self.script_dir = script_dir
        self.prompts_dir = script_dir / PROMPTS_DIR
        self.manifest_path = self.prompts_dir / MANIFEST_FILE
        self.release_notes_path = script_dir / "RELEASE_NOTES_PROMPTS.txt"
    
    def ensure_dir(self) -> None:
        self.prompts_dir.mkdir(exist_ok=True)
    
    def load_release_notes(self) -> str:
        """Загружает release notes из файла"""
        if self.release_notes_path.exists():
            return self.release_notes_path.read_text(encoding='utf-8').strip()
        return ""
    
    def load_manifest(self) -> Dict:
        if not self.manifest_path.exists():
            return {"version": "1.0.0", "updated": "", "release_notes": "", "tabs": {}}
        return json.loads(self.manifest_path.read_text(encoding='utf-8'))
    
    def save_manifest(self, manifest: Dict) -> None:
        self.ensure_dir()
        manifest["updated"] = datetime.now().strftime("%Y-%m-%d")
        # Загружаем release_notes из файла
        manifest["release_notes"] = self.load_release_notes()
        self.manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding='utf-8'
        )
    
    def load_tab(self, tab_id: str) -> Optional[Dict]:
        """Загружает вкладку и возвращает в плоском формате для внутреннего использования"""
        tab_file = self.prompts_dir / f"{tab_id}.json"
        if not tab_file.exists():
            return None
        data = json.loads(tab_file.read_text(encoding='utf-8'))
        
        # Нормализуем: если формат {tab: {...}, workflow: {...}} — конвертируем в плоский
        if 'tab' in data:
            tab_info = data['tab']
            return {
                "id": tab_info.get("id", tab_id),
                "name": tab_info.get("name", tab_id.upper()),
                "order": tab_info.get("order", 1),
                "version": tab_info.get("version", "1.0.0"),
                "items": tab_info.get("items", []),
                "workflow": data.get("workflow", {"positions": {}, "sizes": {}, "connections": []})
            }
        return data
    
    def save_tab(self, tab_id: str, data: Dict) -> None:
        """Сохраняет вкладку в формате {tab: {...}, workflow: {...}}"""
        self.ensure_dir()
        tab_file = self.prompts_dir / f"{tab_id}.json"
        
        # Конвертируем в формат приложения если нужно
        if 'tab' not in data:
            # Плоский формат — конвертируем
            output = {
                "tab": {
                    "id": data.get("id", tab_id),
                    "name": data.get("name", tab_id.upper()),
                    "order": data.get("order", 1),
                    "items": data.get("items", [])
                },
                "workflow": data.get("workflow", {"positions": {}, "sizes": {}, "connections": []})
            }
        else:
            # Уже в правильном формате
            output = data
        
        tab_file.write_text(
            json.dumps(output, ensure_ascii=False, indent=2),
            encoding='utf-8'
        )
    
    def delete_tab(self, tab_id: str) -> bool:
        tab_file = self.prompts_dir / f"{tab_id}.json"
        if tab_file.exists():
            tab_file.unlink()
            manifest = self.load_manifest()
            if tab_id in manifest.get("tabs", {}):
                del manifest["tabs"][tab_id]
                self.save_manifest(manifest)
            return True
        return False
    
    def list_tabs(self) -> List[Dict]:
        manifest = self.load_manifest()
        tabs = []
        for tab_id, info in manifest.get("tabs", {}).items():
            tab_data = self.load_tab(tab_id)
            tabs.append({
                "id": tab_id,
                "name": info.get("name", tab_id.upper()),
                "version": info.get("version", "1.0.0"),
                "order": info.get("order", 99),
                "blocks": len(tab_data.get("items", [])) if tab_data else 0
            })
        return sorted(tabs, key=lambda x: x["order"])
    
    def create_tab(self, name: str) -> str:
        tab_id = name_to_id(name)
        display_name = name.upper()
        
        manifest = self.load_manifest()
        max_order = max([t.get("order", 0) for t in manifest.get("tabs", {}).values()], default=0)
        
        tab_data = {
            "id": tab_id,
            "name": display_name,
            "order": max_order + 1,
            "version": "1.0.0",
            "items": [{
                "type": "block",
                "id": generate_item_id(),
                "title": "Первый блок",
                "content": "Содержимое первого блока.\n\nОтредактируй этот текст."
            }],
            "workflow": {"positions": {}, "sizes": {}, "connections": []}
        }
        
        self.save_tab(tab_id, tab_data)
        
        manifest["tabs"][tab_id] = {
            "name": display_name,
            "version": "1.0.0",
            "order": max_order + 1
        }
        self.save_manifest(manifest)
        
        return tab_id
    
    def rename_tab(self, tab_id: str, new_name: str) -> bool:
        manifest = self.load_manifest()
        if tab_id not in manifest.get("tabs", {}):
            return False
        
        new_display_name = new_name.upper()
        manifest["tabs"][tab_id]["name"] = new_display_name
        self.save_manifest(manifest)
        
        tab_data = self.load_tab(tab_id)
        if tab_data:
            tab_data["name"] = new_display_name
            self.save_tab(tab_id, tab_data)
        return True
    
    def bump_version(self, tab_id: str) -> Tuple[str, str]:
        """Увеличивает версию вкладки. Возвращает (old_version, new_version)"""
        manifest = self.load_manifest()
        if tab_id not in manifest.get("tabs", {}):
            return None, None
        
        current = manifest["tabs"][tab_id].get("version", "1.0.0")
        parts = current.split(".")
        parts[-1] = str(int(parts[-1]) + 1)
        new_version = ".".join(parts)
        
        manifest["tabs"][tab_id]["version"] = new_version
        self.save_manifest(manifest)
        
        # Обновляем версию в файле вкладки
        tab_file = self.prompts_dir / f"{tab_id}.json"
        if tab_file.exists():
            try:
                data = json.loads(tab_file.read_text(encoding='utf-8'))
                if 'tab' in data:
                    data['tab']['version'] = new_version
                else:
                    data['version'] = new_version
                tab_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
            except:
                pass
        
        return current, new_version
    
    def bump_all_versions(self) -> List[Tuple[str, str, str]]:
        """
        Увеличивает версию всех вкладок на 0.0.1
        Возвращает список (tab_id, old_version, new_version)
        """
        manifest = self.load_manifest()
        changes = []
        
        for tab_id in manifest.get("tabs", {}).keys():
            old_version = manifest["tabs"][tab_id].get("version", "1.0.0")
            parts = old_version.split(".")
            parts[-1] = str(int(parts[-1]) + 1)
            new_version = ".".join(parts)
            
            manifest["tabs"][tab_id]["version"] = new_version
            
            # Обновляем в файле вкладки тоже
            tab_data = self.load_tab(tab_id)
            if tab_data:
                tab_data["version"] = new_version
                self.save_tab(tab_id, tab_data)
            
            changes.append((tab_id, old_version, new_version))
        
        if changes:
            self.save_manifest(manifest)
        
        return changes
    
    def import_tab(self, json_path: Path, github_data: Optional[Dict] = None) -> Tuple[bool, str, bool]:
        """
        Импортирует вкладку из JSON файла.
        Поддерживает два формата:
        - {tab: {...}, workflow: {...}} — экспорт из приложения
        - {id, name, items, workflow, ...} — плоский формат из prompts/
        Возвращает (success, message, is_update)
        """
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Определяем формат и извлекаем данные
            if 'tab' in data:
                # Формат экспорта: {tab: {...}, workflow: {...}}
                tab_info = data['tab']
                workflow = data.get('workflow', {"positions": {}, "sizes": {}, "connections": []})
            elif 'name' in data and 'items' in data:
                # Плоский формат: {id, name, items, workflow, ...}
                tab_info = data
                workflow = data.get('workflow', {"positions": {}, "sizes": {}, "connections": []})
            else:
                return False, "Неизвестный формат JSON", False
            
            if 'name' not in tab_info:
                return False, "Нет поля 'name'", False
            if 'items' not in tab_info:
                return False, "Нет поля 'items'", False
            
            tab_name = tab_info['name']
            tab_id = tab_info.get('id', name_to_id(tab_name))
            
            # Удаляем старые файлы с таким же id (могут иметь другое имя файла)
            for old_file in self.prompts_dir.glob('*.json'):
                if old_file.name == 'manifest.json':
                    continue
                try:
                    with open(old_file, 'r', encoding='utf-8') as f:
                        old_data = json.load(f)
                    # Проверяем id в обоих форматах
                    if 'tab' in old_data:
                        old_id = old_data['tab'].get('id', '')
                    else:
                        old_id = old_data.get('id', '')
                    # Если id совпадает но файл называется иначе — удаляем
                    if old_id == tab_id and old_file.name != f"{tab_id}.json":
                        old_file.unlink()
                except:
                    pass
            
            # Проверяем существует ли уже локально
            manifest = self.load_manifest()
            is_update = tab_id in manifest.get("tabs", {})
            
            # Определяем order
            if is_update:
                order = manifest["tabs"][tab_id].get("order", 1)
            else:
                # Новая вкладка — order = max + 1
                existing_orders = [t.get("order", 0) for t in manifest.get("tabs", {}).values()]
                order = max(existing_orders, default=0) + 1
            
            # Определяем версию — берём с GitHub если есть
            github_tabs = github_data.get('tabs', {}) if github_data else {}
            if tab_id in github_tabs:
                # Есть на GitHub — берём эту версию
                version = github_tabs[tab_id].get('version', '1.0.0')
            elif is_update:
                # Нет на GitHub, но есть локально — берём локальную
                version = manifest["tabs"][tab_id].get("version", "1.0.0")
            else:
                # Нет нигде — начинаем с 1.0.0
                version = "1.0.0"
            
            # Формируем данные вкладки
            tab_data = {
                "id": tab_id,
                "name": tab_name.upper(),
                "order": order,
                "version": version,
                "items": tab_info.get('items', []),
                "workflow": workflow
            }
            
            # Сохраняем файл вкладки
            self.save_tab(tab_id, tab_data)
            
            # Обновляем манифест
            manifest["tabs"][tab_id] = {
                "name": tab_name.upper(),
                "version": version,
                "order": order
            }
            self.save_manifest(manifest)
            
            action = "обновлена" if is_update else "добавлена"
            return True, f"{tab_name.upper()} {action} (v{version})", is_update
            
        except json.JSONDecodeError as e:
            return False, f"Ошибка JSON: {e}", False
        except Exception as e:
            return False, f"Ошибка: {e}", False

# ═══════════════════════════════════════════════════════════════════════════
# GITHUB API (без git clone)
# ═══════════════════════════════════════════════════════════════════════════

GITHUB_API_BASE = "https://api.github.com"
GITHUB_OWNER = "IllWicked"
GITHUB_REPO = "ai-prompts-manager"

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

def cleanup_prompts_dir(script_dir: Path):
    """Удаляет папку prompts/"""
    import shutil
    import stat
    import sys
    
    def remove_readonly(func, path, excinfo):
        os.chmod(path, stat.S_IWRITE)
        func(path)
    
    prompts_dir = script_dir / PROMPTS_DIR
    if prompts_dir.exists():
        try:
            # onexc доступен только в Python 3.12+, для более ранних используем onerror
            if sys.version_info >= (3, 12):
                shutil.rmtree(prompts_dir, onexc=remove_readonly)
            else:
                shutil.rmtree(prompts_dir, onerror=remove_readonly)
        except:
            pass

def is_git_repo(script_dir: Path) -> bool:
    """Проверяет, является ли директория git репозиторием"""
    return (script_dir / '.git').exists()

def git_init(script_dir: Path) -> Tuple[bool, str]:
    """Инициализирует git репозиторий"""
    if is_git_repo(script_dir):
        return True, "Репозиторий уже существует"
    
    success, _, err = run_git(['init'], script_dir)
    if not success:
        return False, f"Ошибка git init: {err}"
    return True, "Репозиторий создан"

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

def git_remote_exists(script_dir: Path) -> bool:
    """Проверяет, настроен ли remote"""
    success, stdout, _ = run_git(['remote', '-v'], script_dir)
    return bool(stdout.strip())

def git_add_remote(script_dir: Path, url: str) -> Tuple[bool, str]:
    """Добавляет remote origin"""
    success, _, err = run_git(['remote', 'add', 'origin', url], script_dir)
    if not success:
        # Может уже существовать
        success, _, err = run_git(['remote', 'set-url', 'origin', url], script_dir)
        if not success:
            return False, f"Ошибка: {err}"
    return True, "Remote добавлен"

def git_commit_prompts(script_dir: Path, message: str, tab_ids: List[str] = None) -> Tuple[bool, str]:
    """Коммитит только промпты и release notes.
    Если tab_ids указан — добавляет только эти вкладки + манифест.
    """
    prompts_dir = script_dir / PROMPTS_DIR
    release_notes_file = script_dir / "RELEASE_NOTES_PROMPTS.txt"
    
    if tab_ids:
        # Добавляем только указанные файлы + манифест
        for tab_id in tab_ids:
            tab_file = prompts_dir / f"{tab_id}.json"
            if tab_file.exists():
                run_git(['add', str(tab_file)], script_dir)
        
        manifest_file = prompts_dir / 'manifest.json'
        if manifest_file.exists():
            run_git(['add', str(manifest_file)], script_dir)
    else:
        # Добавляем всю папку prompts/
        success, _, err = run_git(['add', '--ignore-removal', str(prompts_dir)], script_dir)
        if not success:
            return False, f"Ошибка git add prompts: {err}"
    
    if release_notes_file.exists():
        run_git(['add', str(release_notes_file)], script_dir)
    
    # Check if there's anything STAGED to commit
    success, stdout, _ = run_git(['diff', '--cached', '--name-only'], script_dir)
    
    if not stdout.strip():
        return True, "Нет изменений для коммита"
    
    # Commit
    success, stdout, err = run_git(['commit', '-m', message], script_dir)
    if not success:
        return False, f"Ошибка git commit: {err}"
    
    return True, "Изменения закоммичены"

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

def git_pull(script_dir: Path) -> Tuple[bool, str]:
    """Пуллит с GitHub"""
    success, stdout, err = run_git(['pull', '--no-rebase'], script_dir)
    if not success:
        # Может быть конфликт или нет upstream
        if 'no tracking information' in err or 'no upstream' in err.lower():
            return True, "Нет upstream ветки (первый пуш)"
        return False, f"Ошибка git pull: {err}"
    
    return True, "Синхронизировано с GitHub"

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
    
    return changes

def get_release_notes(script_dir: Path) -> str:
    """Читает release notes"""
    notes_file = script_dir / RELEASE_NOTES_FILE
    if notes_file.exists():
        return notes_file.read_text(encoding='utf-8')
    return ""

def save_release_notes(script_dir: Path, notes: str) -> None:
    """Сохраняет release notes"""
    notes_file = script_dir / RELEASE_NOTES_FILE
    notes_file.write_text(notes, encoding='utf-8')

# ═══════════════════════════════════════════════════════════════════════════
# ИНТЕРФЕЙС - ОТОБРАЖЕНИЕ
# ═══════════════════════════════════════════════════════════════════════════

def display_header(script_dir: Path, manager: PromptsManager):
    """Отображает заголовок"""
    app_version = get_current_app_version(script_dir)
    manifest = manager.load_manifest()
    is_repo, git_msg, has_changes = git_status(script_dir)
    
    # Ширина внутреннего содержимого (без рамок)
    W = 61
    
    def pad_line(text: str) -> str:
        """Добавляет пробелы справа до нужной ширины, учитывая кириллицу"""
        # Считаем "визуальную" ширину (кириллица = 1 символ визуально)
        visual_len = len(text)
        padding = W - visual_len
        return text + ' ' * max(0, padding)
    
    print("╔" + "═" * W + "╗")
    title = "PROJECT MANAGER - AI Prompts Manager"
    left_pad = (W - len(title)) // 2
    print("║" + " " * left_pad + title + " " * (W - left_pad - len(title)) + "║")
    print("╠" + "═" * W + "╣")
    
    line1 = f"  Приложение: v{app_version}    Промпты: v{manifest.get('version', '?')}"
    print("║" + pad_line(line1) + "║")
    
    if is_repo:
        icon = "!" if has_changes else "✓"
        line2 = f"  Git: {icon} {git_msg}"
    else:
        line2 = f"  Git: ✗ {git_msg}"
    print("║" + pad_line(line2) + "║")
    
    print("╚" + "═" * W + "╝")

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

def display_tabs_with_github(local_tabs: List[Dict], github_data: Optional[Dict]):
    """Отображает список вкладок с сравнением GitHub"""
    W = 59
    
    def pad_line(text: str) -> str:
        visual_len = len(text)
        padding = W - visual_len
        return text + ' ' * max(0, padding)
    
    github_tabs = github_data.get('tabs', {}) if github_data else {}
    
    # Собираем все вкладки (локальные + GitHub)
    all_tab_ids = set()
    local_by_id = {t.get('id', ''): t for t in local_tabs}
    for t in local_tabs:
        all_tab_ids.add(t.get('id', ''))
    for tab_id in github_tabs:
        all_tab_ids.add(tab_id)
    
    print("\n  ┌" + "─" * W + "┐")
    print("  │" + pad_line("  ВКЛАДКИ") + "│")
    print("  ├" + "─" * W + "┤")
    
    if not all_tab_ids:
        print("  │" + pad_line("  (нет вкладок)") + "│")
    else:
        i = 1
        for tab_id in sorted(all_tab_ids):
            local = local_by_id.get(tab_id)
            github = github_tabs.get(tab_id)
            
            if github:
                # Есть на GitHub
                name = github.get('name', tab_id)
                version = github.get('version', '?')
                if local:
                    status = "✓"  # Есть и локально
                else:
                    status = "●"  # Только на GitHub
                line = f"  {i}. {name:<25} v{version:<10} {status}"
            else:
                # Только локально (нет на GitHub)
                name = local['name']
                version = local['version']
                line = f"  {i}. {name:<25} v{version:<10} ○"
            
            print("  │" + pad_line(line) + "│")
            i += 1
    
    print("  └" + "─" * W + "┘")

# ═══════════════════════════════════════════════════════════════════════════
# ИНТЕРФЕЙС - МЕНЮ ПРОМПТОВ
# ═══════════════════════════════════════════════════════════════════════════

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
        print("  4. Редактировать Release Notes")
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
        elif choice == '4':
            open_in_editor(project_dir / 'RELEASE_NOTES_PROMPTS.txt')
            print("\n  ✓ Файл открыт в редакторе")
            press_any_key()

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
    """Подменю Git операций"""
    while True:
        clear_screen()
        
        print("\n  ═══════════════════════════════════════════════════════")
        print("                       PUSH ПРОМПТОВ")
        print("  ═══════════════════════════════════════════════════════\n")
        
        # JSON файлы к пушу
        json_files = [f for f in script_dir.glob('*.json') 
                      if f.name != 'manifest.json' and f.parent == script_dir]
        
        if json_files:
            print(f"  📁 JSON файлов к пушу: {len(json_files)}")
            for f in json_files:
                print(f"      - {f.name}")
        else:
            print("  📁 Нет JSON файлов для пуша")
            print("     Положи экспортированные вкладки рядом со скриптом")
        
        print("\n  ─────────────────────────────────────")
        print("  1. ↑ Push (отправить JSON на GitHub)")
        print("  ─────────────────────────────────────")
        print("  0. ← Назад")
        
        choice = input("\n  Выбор: ").strip()
        
        if choice == '0':
            break
        elif choice == '1':
            submenu_git_push(script_dir, project_dir)

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
    
    # Обновляем release_notes из локального файла (в корне проекта)
    release_notes_path = project_dir / "RELEASE_NOTES_PROMPTS.txt"
    if release_notes_path.exists():
        manifest['release_notes'] = release_notes_path.read_text(encoding='utf-8').strip()
    manifest['updated'] = datetime.now().strftime("%Y-%m-%d")
    
    # Добавляем манифест
    manifest_content = json.dumps(manifest, ensure_ascii=False, indent=2)
    files_to_push.append(("prompts/manifest.json", manifest_content))
    
    message = input("\n  Сообщение коммита (Enter = авто): ").strip()
    if not message:
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

def submenu_git_status(script_dir: Path):
    print("\n  ─── СТАТУС ИЗМЕНЕНИЙ ───\n")
    success, stdout, _ = run_git(['status', '-s'], script_dir)
    if stdout.strip():
        print(stdout)
    else:
        print("  Нет изменений")
    press_any_key()

# ═══════════════════════════════════════════════════════════════════════════
# ИНТЕРФЕЙС - МЕНЮ РЕЛИЗОВ
# ═══════════════════════════════════════════════════════════════════════════

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
    print("    4. git push")
    print("    5. git push --tags")
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
    print(f"\n  [1/5] Коммит: {message}")
    success, msg = git_commit_all(project_dir, message)
    print(f"        {'✓' if success else '✗'} {msg}")
    if not success and "Нет изменений" not in msg:
        press_any_key()
        return
    
    # 2. Tag
    tag = f"v{app_version}"
    print(f"\n  [2/5] Создание тега: {tag}")
    success, msg = git_tag(project_dir, tag, notes if notes else f"Release {tag}")
    print(f"        {'✓' if success else '✗'} {msg}")
    if not success:
        press_any_key()
        return
    
    # 3. Push
    print("\n  [3/5] Push коммитов...")
    success, msg = git_push(project_dir)
    print(f"        {'✓' if success else '✗'} {msg}")
    if not success:
        press_any_key()
        return
    
    # 4. Push tags
    print("\n  [4/5] Push тегов...")
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
        if json_files:
            print(f"\n  📁 JSON файлов к пушу: {len(json_files)}")
            for f in json_files:
                print(f"      - {f.name}")
        
        print("\n  ГЛАВНОЕ МЕНЮ:")
        print("  ═════════════════════════════════════")
        print("  1. 📝 Промпты (переименовать/порядок на GitHub)")
        print("  2. 📦 Push (отправить JSON на GitHub)")
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
