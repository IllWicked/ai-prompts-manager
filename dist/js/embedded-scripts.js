/**
 * AI Prompts Manager - Embedded Scripts
 * Встроенные скрипты для прикрепления к блокам
 * 
 * ⚠ ВАЖНО: Скрипты хранятся в JS template literals (` ... `).
 * Бэктики внутри Python-кода ОБЯЗАТЕЛЬНО экранировать: \`
 * Например: re.sub(r'\`code\`', ...) → re.sub(r'\\\`code\\\`', ...)
 * Иначе template literal обрежется и скрипт будет неполным.
 */
const EMBEDDED_SCRIPTS = {
    convert: {
        name: 'convert.py',
        label: 'Конвертация (HTML-merge)',
        badge: 'C',
        content: `#!/usr/bin/env python3
"""
Конвертер v5 — HTML-merge

content.html + design.html → index.html
Для пайплайнов с data-content блоками.

Использование:
  python convert.py [content.html] [design.html] [output.html]
"""
import re, sys
from pathlib import Path


# ============================================================
# ACTUAL MODE — HTML-merge v3.1
# ============================================================

def extract_blocks(html):
    """
    Извлекает data-content блоки из HTML.
    Возвращает tuple: (dict {id: innerHTML}, list дубликатов)
    """
    blocks = {}
    duplicates = []
    pattern = re.compile(
        r'(<(?P<tag>section|div|article|aside|nav)\\s[^>]*data-content="(?P<id>[^"]+)"[^>]*>)'
        r'(?P<inner>.*?)'
        r'(</(?P=tag)>)',
        re.DOTALL
    )

    for match in pattern.finditer(html):
        block_id = match.group('id')
        inner = match.group('inner').strip()
        if block_id in blocks:
            duplicates.append(block_id)
        else:
            blocks[block_id] = inner

    return blocks, duplicates


def find_component_blocks(html, css_class):
    """
    Nesting-aware: найти все <div class="...css_class...">...</div>
    с корректным учётом вложенных div.
    Возвращает list of (start, end, open_tag, inner_html).
    """
    results = []
    open_pattern = re.compile(
        r'<div\\s[^>]*class="[^"]*\\b' + re.escape(css_class) + r'\\b[^"]*"[^>]*>',
        re.DOTALL
    )
    div_open = re.compile(r'<div[\\s>]')
    div_close = re.compile(r'</div>')

    for open_match in open_pattern.finditer(html):
        open_tag = open_match.group(0)
        inner_start = open_match.end()
        depth = 1
        pos = inner_start
        while depth > 0 and pos < len(html):
            next_open = div_open.search(html, pos)
            next_close = div_close.search(html, pos)
            if next_close is None:
                break
            if next_open and next_open.start() < next_close.start():
                depth += 1
                pos = next_open.end()
            else:
                depth -= 1
                if depth == 0:
                    inner_end = next_close.start()
                    block_end = next_close.end()
                    results.append((open_match.start(), block_end, open_tag,
                                    html[inner_start:inner_end]))
                    break
                pos = next_close.end()
    return results


def count_div_children(inner_html):
    """Количество <div> верхнего уровня внутри фрагмента."""
    count = 0
    depth = 0
    for m in re.finditer(r'<(/?)div[\\s>]', inner_html):
        if m.group(1) == '':
            if depth == 0:
                count += 1
            depth += 1
        else:
            depth -= 1
    return count


def extract_top_level_divs(html_fragment):
    """
    Извлечь пары (opening_tag, inner_content) для каждого
    <div>...</div> верхнего уровня.
    """
    children = []
    depth = 0
    current_start = None
    current_tag = None
    tag_pattern = re.compile(r'(<div\\b[^>]*>)|(</div>)', re.DOTALL)

    for m in tag_pattern.finditer(html_fragment):
        if m.group(1):
            if depth == 0:
                current_start = m.end()
                current_tag = m.group(1)
            depth += 1
        elif m.group(2):
            depth -= 1
            if depth == 0 and current_start is not None:
                children.append((current_tag, html_fragment[current_start:m.start()]))
                current_start = None
    return children


def discover_css_classes(html):
    """
    Найти все CSS-классы, используемые на <div class="..."> внутри html.
    Возвращает set of class names.
    """
    classes = set()
    for m in re.finditer(r'<div\\s[^>]*class="([^"]+)"', html):
        for cls in m.group(1).split():
            classes.add(cls)
    return classes


# ============================================================
# 2. Auto-detect and fix structural mismatches
# ============================================================

def fix_all_component_structures(html, design_html, warnings):
    """
    Автоматически находит ВСЕ CSS-классы компонентов в design.html,
    сравнивает структуру div-детей в результате мержа vs design,
    и вставляет недостающие структурные (пустые) div-ы.
    """
    design_classes = discover_css_classes(design_html)

    for css_class in sorted(design_classes):
        design_blocks = find_component_blocks(design_html, css_class)
        if not design_blocks:
            continue

        result_blocks = find_component_blocks(html, css_class)
        if not result_blocks:
            continue

        # Process in reverse to preserve positions
        for i in range(len(result_blocks) - 1, -1, -1):
            r_start, r_end, r_open, result_inner = result_blocks[i]
            result_child_count = count_div_children(result_inner)

            if i < len(design_blocks):
                _, _, _, design_inner = design_blocks[i]
                design_child_count = count_div_children(design_inner)
            else:
                continue  # No design counterpart — skip

            if result_child_count == design_child_count:
                continue

            if result_child_count < design_child_count:
                fixed_inner = insert_structural_divs(
                    result_inner, design_inner, css_class
                )
                if fixed_inner != result_inner:
                    new_block = r_open + fixed_inner + '</div>'
                    html = html[:r_start] + new_block + html[r_end:]
                    warnings.append(
                        f"  ✔ .{css_class}: восстановлен структурный элемент "
                        f"({result_child_count} → {design_child_count} дочерних div)"
                    )
                    # Refresh result_blocks since positions shifted
                    result_blocks = find_component_blocks(html, css_class)
            else:
                warnings.append(
                    f"  ⚠ .{css_class}: в content больше дочерних div "
                    f"({result_child_count}) чем в design ({design_child_count})"
                )

    return html


def insert_structural_divs(content_inner, design_inner, css_class):
    """
    Найти позиции пустых/структурных div в design_inner,
    вставить их в content_inner.
    """
    design_children = extract_top_level_divs(design_inner)
    content_children = extract_top_level_divs(content_inner)

    if not design_children or not content_children:
        return content_inner

    # Найти позиции в design, где div пустой (структурный элемент)
    structural_positions = []
    for i, (tag, inner) in enumerate(design_children):
        stripped = re.sub(r'<[^>]+>', '', inner).strip()
        if len(stripped) == 0:
            structural_positions.append(i)

    if not structural_positions:
        # Нет явно пустых — найти самый короткий div
        min_len = float('inf')
        insert_pos = len(design_children) // 2
        for i, (tag, inner) in enumerate(design_children):
            if len(inner.strip()) < min_len:
                min_len = len(inner.strip())
                insert_pos = i
        structural_positions = [insert_pos]

    # Вставить структурные div в content_children
    result_children = list(content_children)
    for pos in sorted(structural_positions):
        adjusted_pos = min(pos, len(result_children))
        empty_tag = design_children[pos][0] if pos < len(design_children) else '<div>'
        result_children.insert(adjusted_pos, (empty_tag, ''))

    # Реконструировать HTML
    parts = []
    first_div = re.search(r'<div[\\s>]', content_inner)
    if first_div:
        parts.append(content_inner[:first_div.start()])
    for tag, inner in result_children:
        parts.append(f"\\n{tag}{inner}</div>")
    last_close = content_inner.rfind('</div>')
    if last_close != -1:
        parts.append(content_inner[last_close + 6:])
    return ''.join(parts)


# ============================================================
# 3. Pre-merge validation
# ============================================================

def validate_structures(content_html, design_html, warnings):
    """
    До мержа: найти компоненты с CSS-классами, которые
    есть и в design, и в content, но имеют разное количество
    дочерних div. Предупредить.
    """
    design_classes = discover_css_classes(design_html)
    content_classes = discover_css_classes(content_html)
    shared = design_classes & content_classes

    for css_class in sorted(shared):
        d_blocks = find_component_blocks(design_html, css_class)
        c_blocks = find_component_blocks(content_html, css_class)

        for i, (c_block, d_block) in enumerate(zip(c_blocks, d_blocks)):
            c_count = count_div_children(c_block[3])
            d_count = count_div_children(d_block[3])
            if c_count != d_count:
                warnings.append(
                    f"  ⚠ .{css_class}[{i}]: content={c_count} div, "
                    f"design={d_count} div — будет исправлено после мержа"
                )


# ============================================================
# 3b. Convert data-component="X" → class="X"
# ============================================================

def convert_data_component_to_class(html, design_html, warnings):
    """
    content.html использует data-component="name" для визуальных компонентов,
    а design.html — class="name". После мержа innerHTML приходит с
    data-component, и CSS-классы теряются.

    Этот шаг:
    1. Собирает все CSS-классы компонентов из design.html.
    2. Находит в результате div'ы с data-component="X", где X совпадает
       с классом из design.
    3. Заменяет data-component="X" на class="X".
    """
    design_classes = discover_css_classes(design_html)

    pattern = re.compile(r'data-component="([^"]+)"')
    converted = []

    def replacer(m):
        name = m.group(1)
        if name in design_classes:
            converted.append(name)
            return f'class="{name}"'
        return m.group(0)  # не трогаем, если нет пары в design

    html = pattern.sub(replacer, html)

    if converted:
        warnings.append(
            f"  ✔ data-component → class: {', '.join(converted)}"
        )

    # Проверка: остались ли data-component без пары
    remaining = pattern.findall(html)
    if remaining:
        warnings.append(
            f"  ⚠ data-component без пары в design (оставлены как есть): "
            f"{', '.join(remaining)}"
        )

    return html


# ============================================================
# 3c. FAQ: convert div+h3 schema.org structure → details/summary
# ============================================================

def convert_faq_to_details(html, design_html, warnings):
    """
    Если design.html использует <details><summary> для FAQ-секции,
    а content.html использует <div itemscope> + <h3> (schema.org FAQPage),
    конвертирует структуру после мержа:

    Было (content.html pattern):
      <div itemscope itemtype="...Question">
        <h3 itemprop="name">Question text</h3>
        <div itemscope itemtype="...Answer" itemprop="acceptedAnswer">
          <p itemprop="text">Answer text</p>
        </div>
      </div>

    Стало:
      <details itemscope itemtype="...Question">
        <summary itemprop="name">Question text</summary>
        <div itemscope itemtype="...Answer" itemprop="acceptedAnswer">
          <p itemprop="text">Answer text</p>
        </div>
      </details>

    Условие запуска: design.html содержит <details> внутри
    data-content секции, id которой содержит "faq".
    """
    # Проверить: есть ли <details> в FAQ-секции design.html
    faq_section_design = re.search(
        r'<(?:section|div|article)\\s[^>]*data-content="[^"]*faq[^"]*"[^>]*>'
        r'(.*?)'
        r'</(?:section|div|article)>',
        design_html, re.DOTALL
    )
    if not faq_section_design:
        return html

    if '<details' not in faq_section_design.group(1):
        return html  # design не использует details для FAQ — пропускаем

    # Найти FAQ-секцию в результате мержа
    # Используем nesting-aware подход: находим открывающий тег,
    # затем ищем парный закрывающий с учётом вложенности
    faq_open_pattern = re.compile(
        r'<(section|div|article)\\s[^>]*data-content="[^"]*faq[^"]*"[^>]*>',
        re.DOTALL
    )
    faq_open_match = faq_open_pattern.search(html)
    if not faq_open_match:
        return html

    faq_tag = faq_open_match.group(1)  # 'section', 'div', etc.
    inner_start = faq_open_match.end()

    # Найти парный закрывающий тег с учётом вложенности того же тега
    open_re = re.compile(rf'<{faq_tag}[\\s>]')
    close_re = re.compile(rf'</{faq_tag}>')
    depth = 1
    pos = inner_start
    inner_end = None
    while depth > 0 and pos < len(html):
        next_open = open_re.search(html, pos)
        next_close = close_re.search(html, pos)
        if next_close is None:
            break
        if next_open and next_open.start() < next_close.start():
            depth += 1
            pos = next_open.end()
        else:
            depth -= 1
            if depth == 0:
                inner_end = next_close.start()
                break
            pos = next_close.end()

    if inner_end is None:
        return html

    faq_inner = html[inner_start:inner_end]

    if '<details' in faq_inner:
        return html  # уже содержит details — не трогаем

    if 'schema.org/Question' not in faq_inner:
        return html  # нет schema.org Question — не трогаем

    converted_count = 0

    def convert_question_block(m):
        nonlocal converted_count
        open_tag = m.group(1)   # <div itemscope itemtype="...Question"...>
        inner = m.group(2)      # всё содержимое включая Answer-div
        # div → details (сохраняем все атрибуты: itemscope, itemtype)
        details_open = re.sub(r'^<div\\b', '<details', open_tag)
        # h3 itemprop="name" → summary itemprop="name"
        inner = re.sub(
            r'<h3\\b([^>]*itemprop="name"[^>]*)>(.*?)</h3>',
            r'<summary\\1>\\2</summary>',
            inner,
            count=1,
            flags=re.DOTALL
        )
        converted_count += 1
        return f'{details_open}{inner}</details>'

    # Паттерн для Question-блока:
    # <div ...Question...>
    #   <h3 ...>...</h3>
    #   <div ...Answer...>
    #     <p>...</p>
    #   </div>        ← закрываем Answer
    # </div>          ← закрываем Question
    question_pattern = re.compile(
        r'(<div\\s[^>]*itemtype="https?://schema\\.org/Question"[^>]*>)'
        r'(.*?'
        r'<div\\s[^>]*itemtype="https?://schema\\.org/Answer"[^>]*>'
        r'.*?</div>'   # закрываем Answer-div
        r'\\s*)'
        r'</div>',     # закрываем Question-div
        re.DOTALL
    )

    new_faq_inner = question_pattern.sub(convert_question_block, faq_inner)

    if converted_count > 0:
        html = (html[:inner_start]
                + new_faq_inner
                + html[inner_end:])
        warnings.append(
            f"  ✔ FAQ: {converted_count} вопрос(ов) сконвертирован из "
            f"div+h3 → details+summary (schema.org атрибуты сохранены)"
        )

    return html


# ============================================================
# 4. data-preserve support
# ============================================================

def restore_preserved_elements(result_html, design_html, warnings):
    """
    Элементы с data-preserve="id" в design.html,
    потерянные при мерже — предупредить.
    """
    preserve_pattern = re.compile(
        r'data-preserve="([^"]+)"'
    )
    for m in preserve_pattern.finditer(design_html):
        pid = m.group(1)
        if f'data-preserve="{pid}"' not in result_html:
            warnings.append(
                f"  ⚠ data-preserve=\\"{pid}\\" потерян после мержа"
            )
    return result_html


# ============================================================
# 4b. Merge semantic attributes from content open-tags
# ============================================================

# Атрибуты, которые переносятся с content open-tag → result open-tag
_SEMANTIC_ATTRS = re.compile(
    r'(?<!\w)(itemscope|itemtype="[^"]*"|itemprop="[^"]*"|role="[^"]*"'
    r'|aria-label="[^"]*"'
    r'|data-(?!content\b)[a-z-]+="[^"]*")',
    re.DOTALL
)


def _extract_open_tags(html):
    """
    Вернуть dict {block_id: open_tag_string} для каждого data-content блока.
    """
    pattern = re.compile(
        r'<(?:section|div|article|aside|nav)\s[^>]*data-content="([^"]+)"[^>]*>',
        re.DOTALL
    )
    tags = {}
    for m in pattern.finditer(html):
        bid = m.group(1)
        if bid not in tags:
            tags[bid] = m.group(0)
    return tags


def merge_semantic_attrs(result_html, content_html, warnings):
    """
    Пост-мерж: для каждого data-content блока, если content.html
    содержит семантические атрибуты (itemscope, itemtype, itemprop,
    role, aria-label, data-*), которых нет на открывающем теге
    в результирующем HTML — добавить их.
    """
    content_tags = _extract_open_tags(content_html)
    result_tags = _extract_open_tags(result_html)

    for bid, content_open in content_tags.items():
        if bid not in result_tags:
            continue

        result_open = result_tags[bid]

        # Собрать семантические атрибуты из content
        content_attrs = _SEMANTIC_ATTRS.findall(content_open)
        if not content_attrs:
            continue

        # Отфильтровать те, что уже есть в result
        missing = []
        for attr in content_attrs:
            attr_key = attr.split('=')[0]
            if attr_key + '=' not in result_open and attr not in result_open:
                missing.append(attr)

        if not missing:
            continue

        # Вставить перед закрывающей > открывающего тега
        inject = ' ' + ' '.join(missing)
        new_open = result_open[:-1] + inject + '>'
        result_html = result_html.replace(result_open, new_open, 1)

        # Обновить кеш
        result_tags[bid] = new_open

        warnings.append(
            f"  ✔ [{bid}]: перенесены атрибуты из content → {', '.join(missing)}"
        )

    return result_html


# ============================================================
# 5. Core merge
# ============================================================

def merge(content_html, design_html):
    content_blocks, content_dupes = extract_blocks(content_html)
    design_blocks, design_dupes = extract_blocks(design_html)

    matched = []
    missing_in_content = []
    missing_in_design = []

    result = design_html

    for block_id in design_blocks:
        if block_id == 'toc':
            continue
        if block_id in content_blocks:
            content_inner = content_blocks[block_id]
            pattern = re.compile(
                r'(<(?P<tag>section|div|article|aside|nav)\\s[^>]*data-content="'
                + re.escape(block_id)
                + r'"[^>]*>)'
                r'.*?'
                r'(</(?P=tag)>)',
                re.DOTALL
            )
            replacement = rf'\\1\\n{content_inner}\\n\\3'
            result = pattern.sub(replacement, result, count=1)
            matched.append(block_id)
        else:
            missing_in_content.append(block_id)

    for block_id in content_blocks:
        if block_id == 'toc':
            continue
        if block_id not in design_blocks:
            missing_in_design.append(block_id)

    return result, matched, missing_in_content, missing_in_design


# ============================================================
# 6. Main
# ============================================================


def main_actual():
    content_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('content.html')
    design_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('design.html')
    output_path = Path(sys.argv[3]) if len(sys.argv) > 3 else Path('index.html')

    if not content_path.exists():
        print(f"Файл не найден: {content_path}")
        sys.exit(1)
    if not design_path.exists():
        print(f"Файл не найден: {design_path}")
        sys.exit(1)

    content_html = content_path.read_text(encoding='utf-8')
    design_html = design_path.read_text(encoding='utf-8')

    content_blocks, content_dupes = extract_blocks(content_html)
    design_blocks, design_dupes = extract_blocks(design_html)

    print(f"content.html: {len(content_blocks)} блоков")
    for bid in content_blocks:
        print(f"  - {bid}")

    print(f"design.html:  {len(design_blocks)} блоков")
    for bid in design_blocks:
        print(f"  - {bid}")

    # Дубликаты
    has_errors = False
    if design_dupes:
        print(f"\\n✗ ОШИБКА: дубликаты data-content id в design.html:")
        for bid in design_dupes:
            print(f"  ✗ {bid}")
        has_errors = True
    if content_dupes:
        print(f"\\n✗ ОШИБКА: дубликаты data-content id в content.html:")
        for bid in content_dupes:
            print(f"  ✗ {bid}")
        has_errors = True
    if has_errors:
        print("\\nОстановлено. Исправь дубликаты.")
        sys.exit(1)

    # Pre-merge validation
    warnings = []
    validate_structures(content_html, design_html, warnings)
    if warnings:
        print(f"\\n⚠ Предупреждения (до мержа):")
        for w in warnings:
            print(w)
        warnings.clear()

    # Merge
    result, matched, missing_content, missing_design = merge(content_html, design_html)

    print(f"\\nСовпало: {len(matched)}")
    for bid in matched:
        print(f"  + {bid}")

    if missing_content:
        print(f"\\nНет в content.html ({len(missing_content)}):")
        for bid in missing_content:
            print(f"  ! {bid} — lorem останется")

    if missing_design:
        print(f"\\nНет в design.html ({len(missing_design)}):")
        for bid in missing_design:
            print(f"  ! {bid} — контент потерян")

    # Post-merge: auto-fix structural components
    result = fix_all_component_structures(result, design_html, warnings)

    # Post-merge: convert data-component="X" → class="X"
    result = convert_data_component_to_class(result, design_html, warnings)

    # Post-merge: FAQ div+h3 → details+summary
    result = convert_faq_to_details(result, design_html, warnings)

    # Post-merge: restore preserved elements
    result = restore_preserved_elements(result, design_html, warnings)

    # Post-merge: transfer semantic attrs from content open-tags
    result = merge_semantic_attrs(result, content_html, warnings)

    if warnings:
        print(f"\\n⚠ Структурные исправления:")
        for w in warnings:
            print(w)

    # Link images-styles.css if not present
    if 'images-styles.css' not in result:
        result = result.replace('</head>', '<link rel="stylesheet" href="images-styles.css">\\n</head>')

    output_path.write_text(result, encoding='utf-8')
    print(f"\\n✓ {content_path} + {design_path} → {output_path}")




if __name__ == '__main__':
    main_actual()
`
    },
    count: {
        name: 'count.py',
        label: 'Подсчёт слов (MD/HTML)',
        badge: 'W',
        content: `#!/usr/bin/env python3
"""
Подсчёт слов в MD и HTML файлах (только видимый контент).
Использование: python count.py file.md или python count.py file.html или python count.py *
"""

import sys
import glob
import re


def clean_markdown(text):
    """Убирает markdown-разметку, оставляет только видимый текст."""
    text = re.sub(r'\\[([^\\]]+)\\]\\([^)]+\\)', r'\\1', text)
    text = re.sub(r'!\\[([^\\]]*)\\]\\([^)]+\\)', r'\\1', text)
    text = re.sub(r'\\*\\*\\*(.+?)\\*\\*\\*', r'\\1', text)
    text = re.sub(r'\\*\\*(.+?)\\*\\*', r'\\1', text)
    text = re.sub(r'\\*(.+?)\\*', r'\\1', text)
    text = re.sub(r'___(.+?)___', r'\\1', text)
    text = re.sub(r'__(.+?)__', r'\\1', text)
    text = re.sub(r'_(.+?)_', r'\\1', text)
    text = re.sub(r'^#{1,6}\\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^[-*_]{3,}\\s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\\s*[-*+]\\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\\s*\\d+\\.\\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'\`\`\`[\\s\\S]*?\`\`\`', '', text)
    text = re.sub(r'\`([^\`]+)\`', r'\\1', text)
    text = re.sub(r'<[^>]+>', '', text)
    return text


def clean_html(text):
    """Убирает HTML-разметку, оставляет только видимый текст."""
    # Убираем <style> и <script> блоки целиком
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
    # Убираем HTML-комментарии
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)
    # Убираем все HTML-теги
    text = re.sub(r'<[^>]+>', ' ', text)
    # Убираем HTML-сущности
    text = re.sub(r'&[a-zA-Z]+;', ' ', text)
    text = re.sub(r'&#\\d+;', ' ', text)
    return text


SUPPORTED = ('.md', '.html', '.htm')

files = sys.argv[1:] or glob.glob('*.md') + glob.glob('*.html')

for f in files:
    if f.endswith(SUPPORTED):
        text = open(f, encoding='utf-8').read()
        if f.endswith('.md'):
            clean_text = clean_markdown(text)
        else:
            clean_text = clean_html(text)
        words = len(clean_text.split())
        print(f"{f}: {words} слов")
`
    }
};
