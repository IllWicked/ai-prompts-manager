/**
 * AI Prompts Manager - Embedded Scripts
 * Встроенные скрипты для прикрепления к блокам
 */
const EMBEDDED_SCRIPTS = {
    convert: {
        name: 'convert.py',
        label: 'Конвертация',
        badge: 'C',
        content: `#!/usr/bin/env python3
"""
Универсальный конвертер MD → HTML
Автоопределение: есть design.html → Pillar, нет → Clusters
"""
import re, sys, glob
from pathlib import Path

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
        text = re.sub(r'\`([^\`]+)\`', r'<code>\\1</code>', text)
        text = re.sub(r'~~(.+?)~~', r'<del>\\1</del>', text)
        text = re.sub(r'\\*\\*\\*(.+?)\\*\\*\\*', r'<strong><em>\\1</em></strong>', text)
        text = re.sub(r'\\*\\*(.+?)\\*\\*', r'<strong>\\1</strong>', text)
        text = re.sub(r'(?<!\\w)\\*([^*]+)\\*(?!\\w)', r'<em>\\1</em>', text)
        return text
    
    i = 0
    while i < len(lines):
        line, stripped = lines[i], lines[i].strip()

        if stripped.startswith('\`\`\`'):
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
    t = text.lower()
    if re.search(r'[α-ωά-ώ]', t): return 'gr'
    if re.search(r'[а-яё]', t): return 'bg'
    if re.search(r'[ąęłśźż]', t): return 'pl'
    if re.search(r'[ěřů]', t): return 'cz'
    if re.search(r'[ĺľŕ]', t): return 'sk'
    if re.search(r'[őű]', t): return 'hu'
    if re.search(r'[ășț]', t): return 'ro'
    # hr vs sl: оба имеют čšž, но hr имеет đ и специфичные слова
    if re.search(r'đ', t) or (re.search(r'[čšž]', t) and re.search(r'\\b(ili|ali|što|kako|biti|imam)\\b', t)): return 'hr'
    if re.search(r'[čšž]', t) and re.search(r'\\b(je|ali|ki|kaj|lahko|zelo)\\b', t): return 'sl'
    # dk vs no: различаем по уникальным словам
    if re.search(r'[æøå]', t) and re.search(r'\\b(af|ikke|med|har|kan|vil)\\b', t) and re.search(r'\\b(og|er|det)\\b', t): return 'dk'
    if re.search(r'[æøå]', t) and re.search(r'\\b(av|ikke|med|har|kan|vil)\\b', t) and re.search(r'\\b(og|er|det)\\b', t): return 'no'
    if re.search(r'[äöå]', t) and re.search(r'\\b(och|att|det|som|för)\\b', t): return 'se'
    if re.search(r'[äö]', t) and re.search(r'\\b(ja|on|ei|että|olla|minä)\\b', t): return 'fi'
    if re.search(r'ß', t): return 'de'
    if re.search(r'[äöü]', t) and re.search(r'\\b(und|der|die|das|ist|nicht)\\b', t): return 'de'
    if re.search(r'[ñ¿¡]', t): return 'es'
    if re.search(r'\\b(el|la|los|las|que|por|para|como|pero|este|esta|puede|tiene|sobre|entre|desde|cuando|donde|hacia|según)\\b', t) and not re.search(r'\\b(het|zijn|hebben|wordt|deze)\\b', t): return 'es'
    if re.search(r'\\b(het|een|van|zijn|hebben|wordt|deze)\\b', t): return 'nl'
    if re.search(r'[ãõ]', t): return 'pt'
    # it vs fr: итальянский имеет специфичные слова и окончания
    if re.search(r'\\b(degli|delle|sono|questo|questa|perché|anche|essere|molto|tutti)\\b', t): return 'it'
    if re.search(r"(c'est|qu'|j'ai|n'est|d'un|l'on|aujourd'hui|beaucoup|français)", t) or re.search(r'\\b(avec|pour|dans|plus|sont|cette|tout|mais|nous|vous)\\b', t): return 'fr'
    return 'en'

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

def main():
    args = sys.argv[1:]
    design_file = 'design.html' if Path('design.html').exists() else None
    md_files = [a for a in args if a.endswith('.md')] or [f for f in glob.glob('*.md') if f.lower() not in ('readme.md', 'content-plan.md')]
    if not md_files: print("Не найдены .md файлы"); return
    md_files = sorted(md_files, key=lambda f: int(re.search(r'(\\d+)', f).group(1)) if re.search(r'(\\d+)', f) else 0)
    if design_file: process_pillar(md_files[0], design_file)
    else: process_clusters(md_files)

if __name__ == '__main__': main()
`
    },
    count: {
        name: 'count.py',
        label: 'Подсчёт слов',
        badge: 'W',
        content: `#!/usr/bin/env python3
"""
Подсчёт слов в MD файлах (только видимый контент).
Использование: python count.py file.md или python count.py *.md
"""

import sys
import glob
import re

def clean_markdown(text):
    """Убирает markdown-разметку, оставляет только видимый текст."""
    # Убираем ссылки [text](url) → text
    text = re.sub(r'\\[([^\\]]+)\\]\\([^)]+\\)', r'\\1', text)
    # Убираем изображения ![alt](url)
    text = re.sub(r'!\\[([^\\]]*)\\]\\([^)]+\\)', r'\\1', text)
    # Убираем жирный и курсив
    text = re.sub(r'\\*\\*\\*(.+?)\\*\\*\\*', r'\\1', text)
    text = re.sub(r'\\*\\*(.+?)\\*\\*', r'\\1', text)
    text = re.sub(r'\\*(.+?)\\*', r'\\1', text)
    text = re.sub(r'___(.+?)___', r'\\1', text)
    text = re.sub(r'__(.+?)__', r'\\1', text)
    text = re.sub(r'_(.+?)_', r'\\1', text)
    # Убираем заголовки (оставляем текст)
    text = re.sub(r'^#{1,6}\\s+', '', text, flags=re.MULTILINE)
    # Убираем горизонтальные линии
    text = re.sub(r'^[-*_]{3,}\\s*$', '', text, flags=re.MULTILINE)
    # Убираем маркеры списков
    text = re.sub(r'^\\s*[-*+]\\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\\s*\\d+\\.\\s+', '', text, flags=re.MULTILINE)
    # Убираем блоки кода
    text = re.sub(r'\`\`\`[\\s\\S]*?\`\`\`', '', text)
    text = re.sub(r'\`([^\`]+)\`', r'\\1', text)
    # Убираем HTML-теги
    text = re.sub(r'<[^>]+>', '', text)
    return text

for f in sys.argv[1:] or glob.glob('*.md'):
    if f.endswith('.md'):
        text = open(f, encoding='utf-8').read()
        clean_text = clean_markdown(text)
        words = len(clean_text.split())
        print(f"{f}: {words} слов")
`
    }
};
