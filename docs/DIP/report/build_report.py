#!/usr/bin/env python3
"""Compile the repository's eleven report documents into one linked PDF."""
from __future__ import annotations

import hashlib
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

import markdown
from bs4 import BeautifulSoup, NavigableString
from PIL import Image
from weasyprint import HTML

HERE = Path(__file__).resolve().parent
DIP = HERE.parent
ROOT = DIP.parent.parent
CFG = json.loads((HERE / 'report.json').read_text())
TAG = CFG['tag']
REPO = CFG['repository']
BUILD = HERE / '_build'
BUILD.mkdir(exist_ok=True)
SECTION_PATHS = [(DIP / name).resolve() for name in CFG['sections']]
SOURCES: set[Path] = set(SECTION_PATHS)
SOURCES.update([HERE / 'report.json', HERE / 'style.css', HERE / 'build_report.py', HERE / 'requirements.txt'])


def remote(path: Path, fragment: str = '') -> str:
    path = path.resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError(f'Link leaves repository: {path}')
    if not path.exists():
        raise ValueError(f'Missing linked source: {path}')
    kind = 'tree' if path.is_dir() else 'blob'
    return f'{REPO}/{kind}/{TAG}/{quote(path.relative_to(ROOT).as_posix())}' + (f'#{fragment}' if fragment else '')


def links_table() -> str:
    entries = [
        ('Frozen repository version', f'{REPO}/tree/{TAG}', 'Source code, report sections and evidence at prob-period-1'),
        ('Live web prototype', 'https://egin.perricheno.com', 'Public web application; a live service may change after submission'),
        ('Staging prototype', 'https://dev-egin.perricheno.com', 'Web staging environment'),
        ('Developer API portal', 'https://api-egin.perricheno.com', 'Public API documentation and developer interface'),
        ('Editable diagram sources', remote(DIP / 'diagrams'), 'PlantUML sources and Mermaid navigation source'),
        ('Interface evidence', remote(DIP / 'evidence/ux'), 'Screenshots, reproduction script and capture metadata'),
        ('Verification evidence', remote(DIP / 'evidence/verification'), 'Retained execution record; see Section 9 for qualifications'),
        ('Editable report sources', remote(DIP), 'All eleven Markdown documents and the reproducible PDF builder'),
    ]
    return '<table class="resources"><thead><tr><th>Material</th><th>Accessible link and purpose</th></tr></thead><tbody>' + ''.join(
        f'<tr><td>{html.escape(label)}</td><td><a href="{html.escape(url)}">{html.escape(url)}</a><br>{html.escape(desc)}</td></tr>'
        for label, url, desc in entries) + '</tbody></table>'


def autolink(soup: BeautifulSoup) -> None:
    for node in list(soup.find_all(string=True)):
        if not isinstance(node, NavigableString) or node.find_parent(['a', 'script', 'style', 'pre']):
            continue
        text = str(node)
        matches = list(re.finditer(r'https?://[^\s<>"\[\]]+', text))
        if not matches:
            continue
        pieces = []
        start = 0
        for match in matches:
            url = match.group().rstrip('.,;:)')
            end = match.start() + len(url)
            pieces.append(NavigableString(text[start:match.start()]))
            a = soup.new_tag('a', href=url)
            a.string = url
            pieces.append(a)
            start = end
        pieces.append(NavigableString(text[start:]))
        for piece in pieces:
            node.insert_before(piece)
        node.extract()


def image_figure(soup: BeautifulSoup, image: Path, caption: str, number: str = '', force: str = ''):
    SOURCES.add(image)
    with Image.open(image) if image.suffix.lower() != '.svg' else _svg_size(image) as info:
        width, height = info.size
    figure = soup.new_tag('figure')
    classes = ['figure']
    if force:
        classes += force.split()
    elif width / height > 1.3:
        classes.append('landscape-figure')
    else:
        classes.append('portrait-figure')
    figure['class'] = classes
    rendered = image
    if image.parent.name == 'export' and image.suffix == '.png' and not image.stem.startswith('07-') and image.with_suffix('.svg').exists():
        rendered = image.with_suffix('.svg')
        SOURCES.add(rendered)
    img = soup.new_tag('img', src=rendered.as_uri(), alt=caption)
    figure.append(img)
    fc = soup.new_tag('figcaption')
    fc.append(f'{number + " — " if number else ""}{caption} ')
    link = soup.new_tag('a', href=remote(image))
    link.string = 'Open full-size image'
    fc.append(link)
    if image.parent.name == 'export':
        stem = image.stem
        source = image.parent.parent / f'{stem}.puml'
        if not source.exists():
            source = source.with_suffix('.mmd')
        if source.exists():
            SOURCES.add(source)
            fc.append(' · ')
            source_a = soup.new_tag('a', href=remote(source))
            source_a.string = 'Editable source'
            fc.append(source_a)
    figure.append(fc)
    return figure


class _svg_size:
    def __init__(self, path):
        svg = BeautifulSoup(path.read_text(), 'xml').svg
        vb = svg.get('viewBox', '0 0 1200 800').split()
        self.size = tuple(map(float, vb[-2:]))
    def __enter__(self): return self
    def __exit__(self, *args): pass


documents = []
heading_ids = {}
for n, source in enumerate(SECTION_PATHS, 1):
    md = source.read_text()
    if n == 11:
        md = re.sub(r'^# References\s*$', '# 11. References', md, count=1, flags=re.M)
    soup = BeautifulSoup(markdown.markdown(md, extensions=['tables', 'fenced_code', 'toc', 'sane_lists']), 'html.parser')
    for element in soup.select('[id]'):
        old = element['id']
        heading_ids[(source, old)] = f's{n}-{old}'
        element['id'] = f's{n}-{old}'
    first = soup.find('h1')
    if first is None:
        raise ValueError(f'Missing section title: {source}')
    first['id'] = f'section-{n}'
    documents.append((n, source, soup, first.get_text()))

for n, source, soup, title in documents:
    autolink(soup)
    for a in soup.find_all('a', href=True):
        href = a['href']
        parsed = urlsplit(href)
        if parsed.scheme in ('http', 'https'):
            if href.startswith(REPO + '/blob/main/') or href.startswith(REPO + '/tree/main/'):
                a['href'] = href.replace('/main/', f'/{TAG}/', 1)
            continue
        if parsed.scheme:
            continue
        target = (source.parent / unquote(parsed.path)).resolve() if parsed.path else source
        if target in SECTION_PATHS:
            target_n = SECTION_PATHS.index(target) + 1
            anchor = heading_ids.get((target, unquote(parsed.fragment))) if parsed.fragment else f'section-{target_n}'
            if not anchor:
                raise ValueError(f'Unknown section anchor: {source.name}: {href}')
            a['href'] = '#' + anchor
        else:
            a['href'] = remote(target, parsed.fragment)
            if target.is_file():
                SOURCES.add(target)
    for img in list(soup.find_all('img')):
        if urlsplit(img['src']).scheme:
            raise ValueError('Report images must be local, versioned sources')
        path = (source.parent / unquote(img['src'])).resolve()
        figure = image_figure(soup, path, img.get('alt', path.stem), force='phone' if '/evidence/ux/' in str(path) else '')
        parent = img.parent
        if parent.name == 'p' and len(parent.find_all(recursive=False)) == 1:
            parent.replace_with(figure)
        else:
            img.replace_with(figure)
    for block in list(soup.select('code.language-mermaid')):
        diagram = DIP / 'diagrams/export/07-prototype-navigation.png'
        if not diagram.exists():
            raise ValueError('Missing rendered prototype navigation diagram')
        block.parent.replace_with(image_figure(soup, diagram, 'Prototype navigation and principal user flows.', 'Figure 8.N', force='landscape-figure'))
    for index, table in enumerate(list(soup.find_all('table')), 1):
        columns = len(table.find('tr').find_all(['th', 'td'], recursive=False))
        if n == 6 and columns == 7:
            widths = [8, 24, 4, 31, 13, 10, 10]
        elif n == 6 and columns == 6:
            widths = [9, 27, 5, 37, 10, 12]
        elif n == 3 and columns == 6:
            widths = [4, 23, 12, 24, 17, 20]
        elif n == 7 and columns == 5:
            widths = [16, 19, 27, 27, 11]
        else:
            widths = []
        if widths:
            group = soup.new_tag('colgroup')
            for width in widths:
                group.append(soup.new_tag('col', style=f'width:{width}%'))
            table.insert(0, group)
        if columns >= 5:
            wrapper = soup.new_tag('div', attrs={'class': 'wide-table'})
            caption = soup.new_tag('p', attrs={'class':'table-caption'})
            caption.string = f'{title} · Table {n}.{index}'
            table.wrap(wrapper)
            wrapper.insert(0, caption)
    for figure in soup.select('figure'):
        before = figure.find_previous_sibling()
        if before and before.name == 'h2':
            figure.insert(0, before.extract())
        elif before and before.name == 'p' and before.get_text().strip().startswith('Figure 8.'):
            figure.insert(0, before.extract())
    if n == 8:
        heading = soup.find(id='s8-86-external-system-interaction-example')
        if heading is None:
            raise ValueError('Section 8.6 insertion point not found')
        gallery = soup.new_tag('div')
        note = soup.new_tag('p', attrs={'class':'gallery-note'})
        note.string = 'Additional interface figures from the same controlled capture. Original files and their provenance remain linked. Tall screens are split into consecutive readable panels.'
        gallery.append(note)
        captions = {
            '02-fields.png': ('Figure 8.2', 'Saved synthetic plot, boundary and plot controls; basemap unavailable.'),
            '03-weather.png': ('Figure 8.3', 'Plot-specific forecast using the repository weather fixture.'),
            '04-events.png': ('Figure 8.4', 'Event centre and preserved synthetic history.'),
            '06-reports.png': ('Figure 8.6', 'Report-export controls; generation was not exercised by this capture.'),
            '07-auth.png': ('Figure 8.7', 'Sign-in interface; no authentication ceremony was executed.'),
            '08-market.png': ('Figure 8.8', 'Marketplace with an intentionally empty fixture catalogue.'),
            '09-developer-portal.png': ('Figure 8.9', 'Public developer API reference; no keys were issued.'),
        }
        for name, (number, caption) in captions.items():
            image = DIP / 'evidence/ux' / name
            SOURCES.add(image)
            with Image.open(image) as original:
                width, height = original.size
                if height / width > 2.6:
                    step = round(width * 2.35)
                    count = (height + step - 1) // step
                    for part, top in enumerate(range(0, height, step), 1):
                        crop = BUILD / f'{image.stem}-panel-{part}.png'
                        original.crop((0, top, width, min(height, top + step))).save(crop)
                        figure = soup.new_tag('figure', attrs={'class':'figure phone'})
                        figure.append(soup.new_tag('img', src=crop.as_uri(), alt=f'{caption} Panel {part} of {count}.'))
                        fc = soup.new_tag('figcaption')
                        fc.append(f'{number}, panel {part}/{count} — {caption} ')
                        link = soup.new_tag('a', href=remote(image))
                        link.string = 'Open the complete original screenshot'
                        fc.append(link)
                        figure.append(fc)
                        gallery.append(figure)
                else:
                    gallery.append(image_figure(soup, image, caption, number, force='landscape-figure' if width > height else 'phone'))
        heading.insert_before(gallery)
    source_p = soup.new_tag('p', attrs={'class':'source'})
    a = soup.new_tag('a', href=remote(source))
    a.string = f'Editable section source · {source.name}'
    source_p.append(a)
    soup.find('h1').insert_after(source_p)

date = datetime.now(timezone.utc).strftime('%d %B %Y')
cover = f'''<div class="cover">
<div class="wordmark">EGIN</div><div class="rule"></div>
<p class="project-name">A cross-platform mobile and web application for managing a land plot</p>
<p class="subtitle">{html.escape(CFG['subtitle'])}</p>
<div class="metadata"><strong>Group:</strong> {CFG['group']}<br>
<strong>Team:</strong> {' · '.join(CFG['team'])}<br>
<strong>Representative:</strong> {CFG['representative']}<br>
<strong>Supervisor:</strong> {CFG['supervisor']}</div>
<div class="version"><strong>Submission version:</strong> <a href="{REPO}/tree/{TAG}">{TAG}</a><br>
Eleven report sections · editable diagram sources · supporting evidence</div>
<p class="date">{date}</p></div>'''
toc = '<div class="toc"><h1>Contents</h1><p>Report sections in the order of the source documentation.</p><ol class="toc-list">' + ''.join(
    f'<li><a href="#section-{n}">{html.escape(title)}</a></li>' for n, _, _, title in documents) + '</ol></div>'
materials = f'''<div class="materials"><h1>Submission version and supporting materials</h1>
<p>This PDF combines Sections 1–10 and References as Section 11 from <code>docs/DIP</code>. The report, editable sources and evidence are packaged in the repository version tagged <a href="{REPO}/tree/{TAG}">{TAG}</a>.</p>
<p>The application source baseline is <a href="{REPO}/commit/{CFG['source_baseline']}">{CFG['source_baseline'][:7]}</a>. Historical source inspection and verification results recorded in the sections retain their original <a href="{REPO}/commit/{CFG['historical_audit_baseline']}">{CFG['historical_audit_baseline'][:7]}</a> attribution. The submission does not convert historical or incomplete checks into new successful runs.</p>
{links_table()}
<p class="note">Delivery state: the web/PWA implementation is available; Capacitor support is configured. A tested store-ready Android/iOS release, pending integrations and completed outcome evaluation are separate milestones. Live prototype links are convenience access points; the tagged repository and capture metadata define the report's evidence version.</p>
</div>'''
body = cover + toc + materials + ''.join(f'<article class="section{" wide-section" if soup.select(".wide-table") else ""}" data-section="{n}">{soup}</article>' for n, _, soup, _ in documents)
document = f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{html.escape(CFG["title"])} — Probation Period 1</title><meta name="author" content="{html.escape(", ".join(CFG["team"]))}"><meta name="description" content="Eleven-section project report for SE-2414, version prob-period-1"><style>{(HERE / "style.css").read_text()}</style></head><body>{body}</body></html>'
(BUILD / 'report.html').write_text(document)

# Every internal destination must exist before rendering.
final_soup = BeautifulSoup(document, 'html.parser')
ids = [e['id'] for e in final_soup.select('[id]')]
if len(ids) != len(set(ids)):
    raise ValueError('Duplicate internal PDF destinations')
for a in final_soup.select('a[href^="#"]'):
    if a['href'][1:] not in ids:
        raise ValueError(f'Unresolved internal link: {a["href"]}')

pdf = HERE / CFG['filename']
HTML(string=document, base_url=str(ROOT)).write_pdf(pdf, pdf_tags=True)
for path in (DIP / 'diagrams').glob('*'):
    if path.suffix in ('.puml', '.mmd'):
        SOURCES.add(path)
for name in ['capture.cjs', 'capture-metadata.json', 'build-artifacts.json', 'README.md']:
    SOURCES.add(DIP / 'evidence/ux' / name)
manifest = {
    'tag': TAG,
    'group': CFG['group'],
    'representative': CFG['representative'],
    'section_order': CFG['sections'],
    'source_baseline': CFG['source_baseline'],
    'historical_audit_baseline': CFG['historical_audit_baseline'],
    'source_files_sha256': {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(SOURCES)},
    'pdf': CFG['filename'],
    'pdf_sha256': hashlib.sha256(pdf.read_bytes()).hexdigest(),
}
(HERE / 'source-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(f'Created {pdf} ({pdf.stat().st_size:,} bytes)')
print(f'Sections: {len(documents)}; source files: {len(SOURCES)}')
