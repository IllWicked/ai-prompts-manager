/**
 * AI Prompts Manager - Embedded Scripts
 * Встроенные скрипты для прикрепления к блокам
 */
const EMBEDDED_SCRIPTS = {
    convert: {
        name: 'convert.py',
        label: 'Конвертация (unified)',
        badge: 'C',
        content: `#!/usr/bin/env python3
"""
Конвертер v4 (unified)

Два режима работы (автоопределение):
  ACTUAL — HTML-merge v3.1: content.html + design.html → index.html
           Для текущих пайплайнов с data-content блоками.
  LEGACY — MD → HTML конвертер с автоопределением языка.
           Для старых пайплайнов с .md файлами.

Автоопределение: если в текущей директории есть content.html → ACTUAL,
иначе → LEGACY.

Принудительный запуск:
  python convert.py --actual [content.html] [design.html] [output.html]
  python convert.py --legacy [file1.md file2.md ...]
"""
import re, sys, glob
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

    if warnings:
        print(f"\\n⚠ Структурные исправления:")
        for w in warnings:
            print(w)

    # Link images-styles.css if not present
    if 'images-styles.css' not in result:
        result = result.replace('</head>', '<link rel="stylesheet" href="images-styles.css">\\n</head>')

    output_path.write_text(result, encoding='utf-8')
    print(f"\\n✓ {content_path} + {design_path} → {output_path}")




# ============================================================
# LEGACY MODE — MD → HTML конвертер
# ============================================================

def md_to_html(md_text):
    lines = md_text.split('\\n')
    result = []
    in_ul = in_ol = in_blockquote = in_code_block = False
    code_block_content, code_lang, paragraph, blockquote_content = [], '', [], []
    
    def flush_paragraph():
        nonlocal paragraph
        if paragraph:
            result.append(f'<p>{process_inline(" ".join(paragraph))}</p>')
            paragraph = []
    
    def close_lists():
        nonlocal in_ul, in_ol
        if in_ul: result.append('</ul>'); in_ul = False
        if in_ol: result.append('</ol>'); in_ol = False
    
    def flush_blockquote():
        nonlocal in_blockquote, blockquote_content
        if in_blockquote and blockquote_content:
            result.append(f'<blockquote><p>{process_inline(" ".join(blockquote_content))}</p></blockquote>')
            blockquote_content = []
            in_blockquote = False
    
    def process_inline(text):
        text = re.sub(r'!\\[([^\\]]*)\\]\\(([^)]+)\\)', r'<img src="\\2" alt="\\1">', text)
        text = re.sub(r'\\[([^\\]]+)\\]\\(([^)]+)\\)', r'<a href="\\2">\\1</a>', text)
        text = re.sub(r'\\\`([^\\\`]+)\\\`', r'<code>\\1</code>', text)
        text = re.sub(r'~~(.+?)~~', r'<del>\\1</del>', text)
        text = re.sub(r'\\*\\*\\*(.+?)\\*\\*\\*', r'<strong><em>\\1</em></strong>', text)
        text = re.sub(r'\\*\\*(.+?)\\*\\*', r'<strong>\\1</strong>', text)
        text = re.sub(r'(?<!\\w)\\*([^*]+)\\*(?!\\w)', r'<em>\\1</em>', text)
        return text
    
    i = 0
    while i < len(lines):
        line, stripped = lines[i], lines[i].strip()

        if stripped.startswith('\\\`\\\`\\\`'):
            if not in_code_block:
                flush_paragraph(); flush_blockquote(); close_lists()
                in_code_block = True; code_lang = stripped[3:].strip(); code_block_content = []
            else:
                code_text = '\\n'.join(code_block_content).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                result.append(f'<pre><code class="language-{code_lang}">{code_text}</code></pre>' if code_lang else f'<pre><code>{code_text}</code></pre>')
                in_code_block = False; code_block_content = []; code_lang = ''
            i += 1; continue

        if in_code_block: code_block_content.append(line); i += 1; continue

        if stripped.startswith('|') and stripped.endswith('|'):
            flush_paragraph(); flush_blockquote(); close_lists()
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith('|') and lines[i].strip().endswith('|'):
                table_lines.append(lines[i].strip()); i += 1
            if len(table_lines) >= 2:
                result.append('<table>')
                header_cells = [c.strip() for c in table_lines[0].split('|')[1:-1]]
                result.append('<thead><tr>' + ''.join(f'<th>{process_inline(c)}</th>' for c in header_cells) + '</tr></thead>')
                result.append('<tbody>')
                for row in table_lines[2:]:
                    cells = [c.strip() for c in row.split('|')[1:-1]]
                    result.append('<tr>' + ''.join(f'<td>{process_inline(c)}</td>' for c in cells) + '</tr>')
                result.append('</tbody></table>')
            continue

        if not stripped: flush_paragraph(); flush_blockquote(); close_lists(); i += 1; continue
        if re.match(r'^-{3,}$|^\\*{3,}$|^_{3,}$', stripped): flush_paragraph(); flush_blockquote(); close_lists(); i += 1; continue

        header_match = re.match(r'^(#{1,6})\\s+(.+)$', stripped)
        if header_match:
            flush_paragraph(); flush_blockquote(); close_lists()
            level, text = len(header_match.group(1)), header_match.group(2)
            # Поддержка {#id} синтаксиса для якорей
            id_match = re.match(r'^(.+?)\\s*\\{#([a-zA-Z0-9_-]+)\\}\\s*$', text)
            if id_match:
                text, header_id = id_match.group(1).strip(), id_match.group(2)
                result.append(f'<h{level} id="{header_id}">{process_inline(text)}</h{level}>')
            else:
                result.append(f'<h{level}>{process_inline(text)}</h{level}>')
            i += 1; continue

        if stripped.startswith('>'): flush_paragraph(); close_lists(); in_blockquote = True; blockquote_content.append(stripped[1:].strip()) if stripped[1:].strip() else None; i += 1; continue
        if in_blockquote and stripped and not stripped.startswith('>'): blockquote_content.append(stripped); i += 1; continue

        if re.match(r'^[-*]\\s+', stripped):
            flush_paragraph(); flush_blockquote()
            if not in_ul: close_lists(); result.append('<ul>'); in_ul = True
            result.append(f'<li>{process_inline(re.sub(r"^[-*]\\s+", "", stripped))}</li>')
            i += 1; continue

        if re.match(r'^\\d+\\.\\s+', stripped):
            flush_paragraph(); flush_blockquote()
            if not in_ol: close_lists(); result.append('<ol>'); in_ol = True
            result.append(f'<li>{process_inline(re.sub(r"^\\d+\\.\\s+", "", stripped))}</li>')
            i += 1; continue

        flush_blockquote(); close_lists(); paragraph.append(stripped); i += 1
    
    flush_paragraph(); flush_blockquote(); close_lists()
    return '\\n'.join(result)

def detect_language(text):
    """Определение языка методом подсчёта очков (scoring)."""
    t = text.lower()
    scores = {}
    
    # === УНИКАЛЬНЫЕ СИМВОЛЫ (вес 50 за каждое вхождение) ===
    char_rules = [
        ('gr', r'[α-ωά-ώΑ-Ω]'),           # греческий
        ('bg', r'[а-яёА-ЯЁ]'),             # болгарский/кириллица
        ('pl', r'[ąęłńśźżćĄĘŁŃŚŹŻĆ]'),    # польский
        ('cz', r'[ěřůĚŘŮ]'),               # чешский
        ('sk', r'[ĺľŕĹĽŔ]'),               # словацкий
        ('hu', r'[őűŐŰ]'),                 # венгерский
        ('ro', r'[ășțĂȘȚ]'),               # румынский
        ('hr', r'[đĐ]'),                   # хорватский (уникальный đ)
        ('de', r'ß'),                      # немецкий (эсцет)
        ('es', r'[ñÑ¿¡]'),                 # испанский
        ('pt', r'[ãõÃÕ]'),                 # португальский
    ]
    for lang, pattern in char_rules:
        count = len(re.findall(pattern, t))
        if count: scores[lang] = scores.get(lang, 0) + count * 50
    
    # === ДИАКРИТИКА С НЕОДНОЗНАЧНОСТЬЮ (вес 10) ===
    # Эти символы встречаются в нескольких языках
    if re.search(r'[čšžČŠŽ]', t):  # hr, sl, cz, sk
        scores['hr'] = scores.get('hr', 0) + 10
        scores['sl'] = scores.get('sl', 0) + 10
    if re.search(r'[äöüÄÖÜ]', t):  # de, fi, se
        scores['de'] = scores.get('de', 0) + 10
        scores['fi'] = scores.get('fi', 0) + 10
        scores['se'] = scores.get('se', 0) + 10
    if re.search(r'[æøåÆØÅ]', t):  # dk, no
        scores['dk'] = scores.get('dk', 0) + 10
        scores['no'] = scores.get('no', 0) + 10
    if re.search(r'å', t):  # se тоже имеет å
        scores['se'] = scores.get('se', 0) + 5
    
    # === ХАРАКТЕРНЫЕ СЛОВА (вес 3 за слово) ===
    word_rules = {
        'en': {'the','and','is','are','was','were','have','has','had','been','being','will','would','could','should','this','that','these','those','which','what','where','when','who','how','there','their','they','them','from','with','about','into','through','during','before','after','above','below','between','because','although','however','therefore','also','just','only','very','more','most','other','some','any','each','every','both','few','many','much','such','than','then','now','here','but','not','all','can','may','must','shall','might'},
        'de': {'und','der','die','das','ist','sind','war','waren','haben','hat','hatte','werden','wird','wurde','nicht','auch','aber','oder','wenn','weil','dass','kann','können','muss','müssen','soll','sollen','wird','werden','nach','bei','mit','von','für','auf','aus','über','unter','vor','hinter','neben','zwischen','durch','ohne','gegen','bis','sein','ihr','sie','wir','ich','du','er','es'},
        'es': {'el','la','los','las','un','una','unos','unas','que','de','en','por','para','con','sin','sobre','entre','pero','como','más','muy','también','porque','cuando','donde','quien','cual','este','esta','estos','estas','ese','esa','esos','esas','ser','estar','tener','hacer','poder','decir','ir','ver','dar','saber','querer','llegar','pasar','deber','poner','parecer','quedar','creer','hablar','llevar','dejar','seguir','encontrar','llamar','venir','pensar','salir','volver','tomar','conocer','vivir','sentir','tratar','mirar','contar','empezar','esperar','buscar','existir','entrar','trabajar','escribir','perder','producir','ocurrir','entender','pedir','recibir','recordar','terminar','permitir','aparecer','conseguir','comenzar','servir','sacar','necesitar','mantener','resultar','leer','caer','cambiar','presentar','crear','abrir','considerar','oír','acabar','convertir','ganar','formar'},
        'fr': {'le','la','les','un','une','des','de','du','et','est','sont','a','ont','être','avoir','faire','dire','aller','voir','venir','pouvoir','vouloir','devoir','falloir','savoir','avec','pour','dans','sur','par','plus','pas','ne','que','qui','ce','cette','ces','son','sa','ses','leur','leurs','nous','vous','ils','elles','lui','elle','tout','tous','toute','toutes','autre','autres','même','bien','encore','aussi','donc','car','mais','ou','où','si','quand','comme','très','peu','beaucoup','trop','assez','moins','plus'},
        'it': {'il','lo','la','i','gli','le','un','uno','una','di','da','in','su','per','con','tra','fra','che','chi','cui','quale','quanto','come','dove','quando','perché','se','non','anche','già','ancora','sempre','mai','solo','molto','poco','tanto','troppo','più','meno','bene','male','essere','avere','fare','dire','andare','venire','stare','dare','sapere','potere','volere','dovere','vedere','sentire','parlare','pensare','trovare','prendere','mettere','lasciare','tenere','portare','credere','seguire','restare','leggere','aprire','chiudere','questo','questa','questi','queste','quello','quella','quelli','quelle','suo','sua','suoi','sue','nostro','nostra','nostri','nostre','loro'},
        'nl': {'de','het','een','van','en','in','is','op','te','dat','die','voor','met','zijn','aan','niet','ook','als','maar','bij','of','om','er','tot','uit','kan','naar','dan','wat','nog','wel','zo','door','over','veel','waar','hoe','wie','moet','zou','zal','worden','hebben','kunnen','zullen','mogen','willen','gaan','komen','maken','zien','laten','nemen','geven','vinden','denken','weten','staan','zitten','liggen','houden','krijgen','brengen','lopen','spreken','beginnen','blijven','proberen','nodig','eigen','nieuw','goed','groot','klein','lang','kort','hoog','laag','oud','jong'},
        'pt': {'o','a','os','as','um','uma','uns','umas','de','da','do','das','dos','em','na','no','nas','nos','por','para','com','sem','que','qual','quais','como','onde','quando','porque','se','não','também','já','ainda','sempre','nunca','só','muito','pouco','mais','menos','bem','mal','ser','estar','ter','haver','fazer','dizer','ir','vir','ver','dar','poder','querer','dever','saber','ficar','passar','deixar','levar','trazer','pôr','tomar','conhecer','viver','sentir','pensar','parecer','partir','seguir','encontrar','tornar','voltar','chamar','começar','acabar','conseguir','manter','este','esta','estes','estas','esse','essa','esses','essas','aquele','aquela','aqueles','aquelas','seu','sua','seus','suas','nosso','nossa','nossos','nossas'},
        'pl': {'i','w','nie','na','to','jest','się','z','do','jak','co','ale','za','od','tak','po','czy','tylko','lub','tym','już','jego','jej','ich','też','może','tego','tej','te','ten','ta','przez','dla','ze','być','mieć','mój','twój','swój','który','która','które','bardzo','więc','kiedy','gdzie','tutaj','tam','teraz','wtedy','zawsze','nigdy','często','rzadko','dobrze','źle','dużo','mało','pierwszy','ostatni','nowy','stary','wielki','mały','dobry','zły'},
        'cz': {'a','i','v','na','je','se','že','to','s','z','do','pro','ale','jak','co','za','po','tak','jsou','jeho','její','jejich','být','mít','tento','tato','toto','který','která','které','nebo','jako','když','kde','tam','zde','teď','pak','vždy','nikdy','často','málo','hodně','velmi','dobře','špatně','první','poslední','nový','starý','velký','malý','dobrý','zlý'},
        'sk': {'a','i','v','na','je','sa','že','to','s','z','do','pre','ale','ako','čo','za','po','tak','sú','jeho','jej','ich','byť','mať','tento','táto','toto','ktorý','ktorá','ktoré','alebo','keď','kde','tam','tu','teraz','potom','vždy','nikdy','často','málo','veľa','veľmi','dobre','zle','prvý','posledný','nový','starý','veľký','malý','dobrý','zlý'},
        'hu': {'a','az','és','van','volt','lesz','nem','is','de','hogy','mint','ha','vagy','csak','meg','már','még','ki','mi','ez','az','egy','két','sok','kevés','nagy','kis','jó','rossz','új','régi','első','utolsó','itt','ott','most','akkor','mindig','soha','gyakran','ritkán','nagyon','kevéssé','jól','rosszul','én','te','ő','mi','ti','ők'},
        'ro': {'și','în','la','de','pe','cu','un','o','nu','da','sau','că','este','sunt','a','fost','fi','avea','face','zice','merge','veni','vedea','ști','putea','trebui','vrea','acest','această','acești','aceste','care','ce','cum','unde','când','dacă','foarte','mai','mult','puțin','bine','rău','nou','vechi','mare','mic','bun','primul','ultimul','aici','acolo','acum','apoi','mereu','niciodată'},
        'hr': {'i','u','na','je','se','da','za','s','od','ali','kao','što','ili','koji','koja','koje','ovaj','ova','ovo','taj','ta','to','onaj','ona','ono','biti','imati','moći','htjeti','trebati','znati','vidjeti','reći','ići','doći','raditi','misliti','živjeti','vrlo','više','manje','dobro','loše','novi','stari','veliki','mali','dobar','loš','prvi','zadnji','sada','onda','uvijek','nikad','često','rijetko','ovdje','tamo'},
        'sl': {'in','v','na','je','se','da','za','s','od','ali','kot','ki','ta','to','biti','imeti','moči','hoteti','morati','vedeti','videti','reči','iti','priti','delati','misliti','živeti','zelo','več','manj','dobro','slabo','nov','star','velik','majhen','dober','slab','prvi','zadnji','zdaj','potem','vedno','nikoli','pogosto','redko','tukaj','tam','lahko','kaj','kako','kje','kdaj','zakaj'},
        'dk': {'og','i','at','er','en','et','den','det','de','til','på','med','for','af','som','har','var','kan','vil','skal','han','hun','jeg','du','vi','ikke','men','om','eller','hvis','så','nu','da','efter','over','under','fra','ud','ind','op','ned','mange','få','stor','lille','god','dårlig','ny','gammel','første','sidste','her','der','hvor','hvad','hvem','hvordan','hvorfor','hvornår'},
        'no': {'og','i','at','er','en','et','den','det','de','til','på','med','for','av','som','har','var','kan','vil','skal','han','hun','jeg','du','vi','ikke','men','om','eller','hvis','så','nå','da','etter','over','under','fra','ut','inn','opp','ned','mange','få','stor','liten','god','dårlig','ny','gammel','første','siste','her','der','hvor','hva','hvem','hvordan','hvorfor','når'},
        'se': {'och','i','att','är','en','ett','den','det','de','till','på','med','för','av','som','har','var','kan','vill','ska','han','hon','jag','du','vi','inte','men','om','eller','när','så','nu','då','efter','över','under','från','ut','in','upp','ner','många','få','stor','liten','god','dålig','ny','gammal','första','sista','här','där','var','vad','vem','hur','varför'},
        'fi': {'ja','on','ei','se','että','kun','jos','niin','tai','mutta','vaan','kanssa','ilman','ennen','jälkeen','yli','ali','sisällä','ulkona','tämä','tuo','nämä','nuo','minä','sinä','hän','me','te','he','olla','tulla','mennä','tehdä','sanoa','nähdä','tietää','voida','haluta','täytyä','saada','ottaa','antaa','pitää','jättää','löytää','etsiä','paljon','vähän','hyvin','huonosti','uusi','vanha','suuri','pieni','hyvä','huono','ensimmäinen','viimeinen','täällä','siellä','missä','mitä','kuka','miten','miksi','milloin'},
    }
    
    words = set(re.findall(r'[a-zA-ZÀ-ÿ]+', t))
    for lang, lang_words in word_rules.items():
        matches = len(words & lang_words)
        if matches: scores[lang] = scores.get(lang, 0) + matches * 3
    
    # === ПАТТЕРНЫ-ФРАЗЫ (вес 20) ===
    phrase_rules = [
        ('fr', r"(c'est|qu'il|qu'elle|d'un|d'une|l'on|n'est|j'ai|aujourd'hui)"),
        ('it', r"(l'|dell'|all'|nell'|sull')"),
        ('de', r"\\b(ich bin|du bist|er ist|wir sind|sie sind)\\b"),
    ]
    for lang, pattern in phrase_rules:
        if re.search(pattern, t):
            scores[lang] = scores.get(lang, 0) + 20
    
    # === ОПРЕДЕЛЕНИЕ ПОБЕДИТЕЛЯ ===
    if not scores:
        return 'en'  # fallback
    
    max_score = max(scores.values())
    winners = [lang for lang, score in scores.items() if score == max_score]
    
    # При равенстве очков - приоритет по частоте использования
    priority = ['en','de','es','fr','it','nl','pt','pl','cz','sk','hu','ro','hr','sl','no','dk','se','fi','gr','bg']
    for lang in priority:
        if lang in winners:
            return lang
    
    return winners[0]

def extract_title(text):
    match = re.search(r'^#\\s+(.+)$', text, re.MULTILINE)
    return match.group(1).strip() if match else 'Article'

CONTENT_MARKER = '{{CONTENT}}'
IMAGES_CSS = '.hero-image{width:100%;margin:0 0 2rem}.hero-image img{width:100%;height:auto;border-radius:12px}.article-image{margin:2rem 0;text-align:center}.article-image img{max-width:100%;height:auto;border-radius:8px}'

def process_clusters(md_files):
    for md_file in md_files:
        md_path = Path(md_file)
        md_content = open(md_path, 'r', encoding='utf-8').read()
        lang, title = detect_language(md_content), extract_title(md_content)
        html_content = md_to_html(md_content)
        seo_desc = re.sub(r'<[^>]+>', '', html_content)[:160].strip()
        full_html = f'<!DOCTYPE html>\\n<html lang="{lang}">\\n<head>\\n<meta charset="UTF-8">\\n<meta name="viewport" content="width=device-width,initial-scale=1.0">\\n<title>{title[:70]}</title>\\n<meta name="description" content="{seo_desc}">\\n</head>\\n<body>\\n<article>\\n{html_content}\\n</article>\\n</body>\\n</html>'
        html_path = md_path.parent / f"{md_path.stem}.html"
        open(html_path, 'w', encoding='utf-8').write(full_html)
        print(f"✓ {md_file} → {html_path.name} ({len(md_content.split())} слов)")

def process_pillar(md_path, design_path):
    md_content = open(md_path, 'r', encoding='utf-8').read()
    design_content = open(design_path, 'r', encoding='utf-8').read()
    marker = next((m for m in ['{{CONTENT}}', '{{content}}', '{{Content}}'] if m in design_content), None)
    if not marker: raise ValueError("Маркер {{CONTENT}} не найден (проверены варианты регистра)")
    lang, title = detect_language(md_content), extract_title(md_content)
    html_content = md_to_html(md_content)
    final_html = design_content.replace(marker, html_content)
    final_html = re.sub(r'<html[^>]*lang="[^"]*"', f'<html lang="{lang}"', final_html)
    final_html = re.sub(r'<title>[^<]*</title>', f'<title>{title[:70]}</title>', final_html)
    if 'images-styles.css' not in final_html: final_html = final_html.replace('</head>', '<link rel="stylesheet" href="images-styles.css">\\n</head>')
    open('index.html', 'w', encoding='utf-8').write(final_html)
    open('images-styles.css', 'w', encoding='utf-8').write(IMAGES_CSS)
    print(f"✓ {md_path} + {design_path} → index.html ({len(md_content.split())} слов, {lang})")


def main_legacy():
    args = sys.argv[1:]
    design_file = 'design.html' if Path('design.html').exists() else None
    md_files = [a for a in args if a.endswith('.md')] or [f for f in glob.glob('*.md') if f.lower() not in ('readme.md', 'content-plan.md')]
    if not md_files: print("Не найдены .md файлы"); return
    md_files = sorted(md_files, key=lambda f: int(re.search(r'(\\d+)', f).group(1)) if re.search(r'(\\d+)', f) else 0)
    if design_file: process_pillar(md_files[0], design_file)
    else: process_clusters(md_files)



# ============================================================
# MAIN — автоопределение режима
# ============================================================

def main():
    args = sys.argv[1:]

    # Принудительный режим
    if '--actual' in args:
        args.remove('--actual')
        sys.argv = [sys.argv[0]] + args
        main_actual()
        return
    if '--legacy' in args:
        args.remove('--legacy')
        sys.argv = [sys.argv[0]] + args
        main_legacy()
        return

    # Автоопределение
    content_path = Path(args[0]) if args and args[0].endswith('.html') else Path('content.html')
    design_path = Path('design.html')

    if content_path.exists() and design_path.exists() and content_path.name != 'design.html':
        print(f"[ACTUAL] Обнаружен {content_path.name} + design.html → HTML-merge")
        main_actual()
    else:
        print("[LEGACY] MD → HTML конвертер")
        main_legacy()


if __name__ == '__main__':
    main()
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
