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
