/**
 * AI Prompts Manager - Embedded Script: Spellcheck
 * Проверка орфографии и типографики
 */
EMBEDDED_SCRIPTS.spellcheck = {
    name: 'spellcheck.py',
    label: 'Проверка текста',
    badge: 'S',
    content: `#!/usr/bin/env python3
"""
Комплексная проверка текстов на разных языках.
Использование: python spellcheck.py <lang_code> <file.md> [file2.md ...]

Проверки:
1. Орфография (hunspell) — слова не в словаре
2. Смешанные алфавиты — латиница+кириллица и т.д. в одном слове
3. Баланс пунктуации — ¿?, ¡!, «», „"

Поддерживаемые языки:
  en, de, es, it, fr, nl, pl, cz, pt, dk, gr, no, hu, fi, sk, sl, hr, se, bg, ro
"""

import sys
import re
import subprocess


# =============================================================================
# КОНФИГУРАЦИЯ ЯЗЫКОВ
# =============================================================================

# Коды словарей hunspell для каждого языка
HUNSPELL_DICTS = {
    'en': 'en_US',
    'de': 'de_DE',
    'es': 'es_ES',
    'it': 'it_IT',
    'fr': 'fr_FR',
    'nl': 'nl_NL',
    'pl': 'pl_PL',
    'cz': 'cs_CZ',
    'pt': 'pt_PT',
    'dk': 'da_DK',
    'gr': 'el_GR',
    'no': 'nb_NO',
    'hu': 'hu_HU',
    'fi': 'fi_FI',
    'sk': 'sk_SK',
    'sl': 'sl_SI',
    'hr': 'hr_HR',
    'se': 'sv_SE',
    'bg': 'bg_BG',
    'ro': 'ro_RO',
    # Региональные варианты
    'at': 'de_AT',
    'ch-de': 'de_CH',
    'ch-fr': 'fr_CH',
    'ca-en': 'en_CA',
    'ca-fr': 'fr_CA',
    'nz': 'en_NZ',
}

# Названия пакетов apt для установки словарей
HUNSPELL_PACKAGES = {
    'en': 'hunspell-en-us',
    'de': 'hunspell-de-de',
    'es': 'hunspell-es',
    'it': 'hunspell-it',
    'fr': 'hunspell-fr',
    'nl': 'hunspell-nl',
    'pl': 'hunspell-pl',
    'cz': 'hunspell-cs',
    'pt': 'hunspell-pt-pt',
    'dk': 'hunspell-da',
    'gr': 'hunspell-el',
    'no': 'hunspell-no',
    'hu': 'hunspell-hu',
    'fi': 'hunspell-fi',
    'sk': 'hunspell-sk',
    'sl': 'hunspell-sl',
    'hr': 'hunspell-hr',
    'se': 'hunspell-sv',
    'bg': 'hunspell-bg',
    'ro': 'hunspell-ro',
    # Региональные варианты
    'at': 'hunspell-de-at',
    'ch-de': 'hunspell-de-ch',
    'ch-fr': 'hunspell-fr-comprehensive',
    'ca-en': 'hunspell-en-ca',
    'ca-fr': 'hunspell-fr-comprehensive',
    'nz': 'hunspell-en-au',
}

# Парные знаки препинания для проверки баланса
PAIRED_PUNCTUATION = {
    'es': [('¿', '?'), ('¡', '!')],
    'fr': [('«', '»')],
    'de': [('„', '"')],
    'pl': [('„', '"')],
    'cz': [('„', '"')],
    'sk': [('„', '"')],
    'hu': [('„', '"')],
    'ro': [('„', '"')],
    'bg': [('„', '"')],
    'hr': [('„', '"')],
    'sl': [('„', '"')],
}


# =============================================================================
# ПРОВЕРКА 1: ОРФОГРАФИЯ (HUNSPELL)
# =============================================================================

def clean_markdown(text: str) -> str:
    """Убирает markdown-разметку для проверки орфографии."""
    text = re.sub(r'^#{1,6}\\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'\\*\\*([^*]+)\\*\\*', r'\\1', text)
    text = re.sub(r'\\*([^*]+)\\*', r'\\1', text)
    text = re.sub(r'\\[([^\\]]+)\\]\\([^)]+\\)', r'\\1', text)
    text = re.sub(r'\`[^\`]+\`', '', text)
    return text


def check_dictionary_exists(lang: str) -> tuple:
    """Проверяет, установлен ли словарь hunspell для языка."""
    dict_code = HUNSPELL_DICTS.get(lang)
    if not dict_code:
        return False, f"Язык '{lang}' не поддерживается"
    
    try:
        result = subprocess.run(
            ['hunspell', '-D'],
            capture_output=True,
            text=True,
            timeout=5
        )
        available = result.stderr.lower()
        
        dict_variants = [
            dict_code.lower(),
            dict_code.lower().replace('_', '-'),
            dict_code.lower().replace('_', ''),
        ]
        
        found = any(v in available for v in dict_variants)
        
        if found:
            return True, "OK"
        else:
            package = HUNSPELL_PACKAGES.get(lang, f'hunspell-{lang}')
            return False, f"Словарь не найден. Установи: apt install {package}"
            
    except FileNotFoundError:
        return False, "hunspell не установлен. Установи: apt install hunspell"
    except Exception as e:
        return False, f"Ошибка проверки: {e}"


def check_spelling(text: str, lang: str) -> list:
    """Проверяет орфографию через hunspell."""
    dict_code = HUNSPELL_DICTS.get(lang)
    if not dict_code:
        return []
    
    exists, message = check_dictionary_exists(lang)
    if not exists:
        return [f'[{message}]']
    
    clean_text = clean_markdown(text)
    
    try:
        result = subprocess.run(
            ['hunspell', '-d', dict_code, '-l'],
            input=clean_text,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if 'error' in result.stderr.lower() or "can't open" in result.stderr.lower():
            package = HUNSPELL_PACKAGES.get(lang, f'hunspell-{lang}')
            return [f'[Словарь {dict_code} не найден. Установи: apt install {package}]']
        
        words = result.stdout.strip().split('\\n') if result.stdout.strip() else []
        seen = set()
        unique = []
        for w in words:
            if w and w not in seen:
                seen.add(w)
                unique.append(w)
        return unique
    except FileNotFoundError:
        return ['[hunspell не установлен. Установи: apt install hunspell]']
    except subprocess.TimeoutExpired:
        return ['[таймаут hunspell]']
    except Exception as e:
        return [f'[ошибка: {e}]']


# =============================================================================
# ПРОВЕРКА 2: СМЕШАННЫЕ АЛФАВИТЫ
# =============================================================================

def get_char_alphabet(char: str):
    """Определяет алфавит символа."""
    code = ord(char)
    
    if 0x0041 <= code <= 0x007A:
        return 'latin'
    if 0x00C0 <= code <= 0x024F:
        return 'latin'
    if 0x1E00 <= code <= 0x1EFF:
        return 'latin'
    
    if 0x0400 <= code <= 0x052F:
        return 'cyrillic'
    
    if 0x0370 <= code <= 0x03FF:
        return 'greek'
    if 0x1F00 <= code <= 0x1FFF:
        return 'greek'
    
    return None


def check_mixed_alphabets(text: str) -> list:
    """Ищет слова со смешанными алфавитами."""
    word_pattern = re.compile(
        r'[a-zA-Zа-яА-ЯёЁα-ωΑ-Ω\\u00C0-\\u024F\\u0400-\\u04FF\\u0370-\\u03FF]+'
    )
    
    issues = []
    lines = text.split('\\n')
    
    for line_num, line in enumerate(lines, 1):
        for match in word_pattern.finditer(line):
            word = match.group()
            
            alphabets = {}
            for char in word:
                alpha = get_char_alphabet(char)
                if alpha:
                    if alpha not in alphabets:
                        alphabets[alpha] = []
                    alphabets[alpha].append(char)
            
            if len(alphabets) > 1:
                start = match.start()
                ctx_start = max(0, start - 10)
                ctx_end = min(len(line), match.end() + 10)
                context = line[ctx_start:ctx_end]
                
                issues.append({
                    'line': line_num,
                    'word': word,
                    'alphabets': alphabets,
                    'context': context
                })
    
    return issues


def format_alphabets(alphabets: dict) -> str:
    """Форматирует информацию об алфавитах."""
    names = {'latin': 'лат', 'cyrillic': 'кир', 'greek': 'греч'}
    parts = []
    for alpha, chars in alphabets.items():
        unique = ''.join(sorted(set(chars)))
        parts.append(f"{names.get(alpha, alpha)}:{unique}")
    return ' + '.join(parts)


# =============================================================================
# ПРОВЕРКА 3: БАЛАНС ПУНКТУАЦИИ
# =============================================================================

def check_punctuation_balance(text: str, lang: str) -> list:
    """Проверяет баланс парных знаков препинания."""
    issues = []
    
    pairs = PAIRED_PUNCTUATION.get(lang, [])
    for open_char, close_char in pairs:
        open_count = text.count(open_char)
        close_count = text.count(close_char)
        if open_count != close_count:
            issues.append(f"{open_char}{close_char}: {open_count} откр. / {close_count} закр.")
    
    return issues


# =============================================================================
# ГЛАВНАЯ ФУНКЦИЯ
# =============================================================================

def check_file(filepath: str, lang: str) -> dict:
    """Выполняет все проверки для файла."""
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()
    
    return {
        'spelling': check_spelling(text, lang),
        'mixed': check_mixed_alphabets(text),
        'punctuation': check_punctuation_balance(text, lang)
    }


def print_results(filepath: str, lang: str, results: dict):
    """Выводит результаты проверки."""
    print(f"\\n{'='*60}")
    print(f"ПРОВЕРКА: {filepath}")
    print(f"Язык: {lang}")
    print('='*60)
    
    print("\\n[Орфография — hunspell]")
    spelling = results['spelling']
    if not spelling:
        print("✓ Все слова в словаре")
    elif spelling[0].startswith('['):
        print(f"⚠ {spelling[0]}")
    else:
        print(f"Найдено {len(spelling)} слов не в словаре:")
        for word in spelling[:20]:
            print(f"  • {word}")
        if len(spelling) > 20:
            print(f"  ... и ещё {len(spelling) - 20}")
    
    print("\\n[Смешанные алфавиты]")
    mixed = results['mixed']
    if not mixed:
        print("✓ Не найдено")
    else:
        print(f"⚠ Найдено {len(mixed)} проблемных слов:")
        for item in mixed[:10]:
            print(f"  • Строка {item['line']}: {item['word']}")
            print(f"    {format_alphabets(item['alphabets'])}")
        if len(mixed) > 10:
            print(f"  ... и ещё {len(mixed) - 10}")
    
    print("\\n[Баланс пунктуации]")
    punct = results['punctuation']
    if not punct:
        print("✓ Сбалансировано")
    else:
        print("⚠ Дисбаланс:")
        for issue in punct:
            print(f"  • {issue}")


def main():
    if len(sys.argv) < 3:
        print("Использование: python spellcheck.py <lang> <file.md> [file2.md ...]")
        print(f"\\nЯзыки: {', '.join(sorted(HUNSPELL_DICTS.keys()))}")
        print("\\nПроверки:")
        print("  1. Орфография (hunspell)")
        print("  2. Смешанные алфавиты (омоглифы)")
        print("  3. Баланс пунктуации")
        sys.exit(1)
    
    lang = sys.argv[1].lower()
    files = sys.argv[2:]
    
    if lang not in HUNSPELL_DICTS:
        print(f"Неизвестный язык: {lang}")
        print(f"Доступные: {', '.join(sorted(HUNSPELL_DICTS.keys()))}")
        sys.exit(1)
    
    total_spelling = 0
    total_mixed = 0
    total_punct = 0
    
    for filepath in files:
        try:
            results = check_file(filepath, lang)
            print_results(filepath, lang, results)
            
            if results['spelling'] and not results['spelling'][0].startswith('['):
                total_spelling += len(results['spelling'])
            total_mixed += len(results['mixed'])
            total_punct += len(results['punctuation'])
            
        except FileNotFoundError:
            print(f"\\n⚠ Файл не найден: {filepath}")
        except Exception as e:
            print(f"\\n⚠ Ошибка при проверке {filepath}: {e}")
    
    print(f"\\n{'='*60}")
    print("ИТОГО")
    print('='*60)
    print(f"  Орфография: {total_spelling} слов (требует ручной проверки)")
    print(f"  Смешанные алфавиты: {total_mixed}")
    print(f"  Пунктуация: {total_punct} проблем")
    
    has_critical = total_mixed > 0 or total_punct > 0
    sys.exit(1 if has_critical else 0)


if __name__ == "__main__":
    main()
`
};
