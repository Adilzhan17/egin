#!/usr/bin/env python3
"""Build the concise, maximum-20-page report for the frozen project version."""
from __future__ import annotations
import hashlib
import html
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

import markdown
import pymupdf
from bs4 import BeautifulSoup
from weasyprint import HTML

HERE = Path(__file__).resolve().parent
DIP = HERE.parent
ROOT = DIP.parent.parent
CFG = json.loads((HERE / 'report.json').read_text())
REPO, TAG = CFG['repository'], CFG['tag']
BUILD = HERE / '_build'
BUILD.mkdir(exist_ok=True)
INPUTS = ['docs/DIP/report/' + s for s in ['sections', 'diagrams', 'build_report.py', 'style.css', 'report.json']]
EDITION_REVISION = subprocess.check_output(['git', 'log', '-1', '--format=%H', '--', *INPUTS], cwd=ROOT, text=True).strip()
TAG_COMMIT = subprocess.check_output(['git', 'rev-parse', TAG + '^{}'], cwd=ROOT, text=True).strip()
assert TAG_COMMIT == CFG['tag_commit']
APP_TREE = subprocess.check_output(['git', 'rev-parse', TAG + ':apps'], cwd=ROOT, text=True).strip()
assert APP_TREE == subprocess.check_output(['git', 'rev-parse', 'HEAD:apps'], cwd=ROOT, text=True).strip()
SECTIONS = [(HERE / 'sections' / p).resolve() for p in CFG['condensed_sections']]
SOURCES = set(SECTIONS) | {HERE / p for p in ['build_report.py', 'style.css', 'report.json', 'requirements.txt', 'validate_report.py', 'README.md']}


def remote(path: Path, fragment: str = '') -> str:
    path = path.resolve()
    if not path.exists() or not path.is_relative_to(ROOT):
        raise ValueError(f'Missing repository material: {path}')
    revision = EDITION_REVISION if path.is_relative_to(HERE) else TAG
    kind = 'tree' if path.is_dir() else 'blob'
    return f'{REPO}/{kind}/{revision}/{quote(path.relative_to(ROOT).as_posix())}' + (f'#{fragment}' if fragment else '')


def make_section(n: int, source: Path):
    text = source.read_text().replace('<!-- pagebreak -->', '<div class="pagebreak"></div>')
    soup = BeautifulSoup(markdown.markdown(text, extensions=['tables', 'fenced_code', 'toc', 'sane_lists']), 'html.parser')
    for node in soup.select('[id]'):
        node['id'] = f's{n}-' + node['id']
    h1 = soup.find('h1')
    if not h1:
        raise ValueError(f'Missing section title: {source}')
    h1['id'] = f'section-{n}'
    title = h1.get_text()
    note = soup.new_tag('p', attrs={'class': 'source'})
    detailed = soup.new_tag('a', href=remote(DIP / CFG['sections'][n-1]))
    detailed.string = 'Detailed section and supporting evidence'
    note.append(detailed)
    h1.insert_after(note)
    for a in soup.select('a[href]'):
        value = a['href']
        parsed = urlsplit(value)
        if parsed.scheme:
            if parsed.scheme not in ['https', 'http']:
                raise ValueError(value)
            continue
        if not parsed.path:
            a['href'] = '#s' + str(n) + '-' + parsed.fragment
            continue
        target = (source.parent / unquote(parsed.path)).resolve()
        if target in SECTIONS:
            a['href'] = f'#section-{SECTIONS.index(target)+1}'
        else:
            a['href'] = remote(target, parsed.fragment)
    for img in list(soup.find_all('img')):
        path = (source.parent / unquote(img['src'])).resolve()
        if not path.is_file():
            raise ValueError(f'Missing image: {path}')
        SOURCES.add(path)
        img['src'] = path.as_uri()
        if img.find_parent('figure'):
            continue
        figure = soup.new_tag('figure', attrs={'class': 'diagram'})
        parent = img.parent
        if parent.name == 'p':
            parent.replace_with(figure)
            figure.append(img.extract())
        else:
            img.wrap(figure)
        caption = soup.new_tag('figcaption')
        caption.append(img.get('alt', path.stem) + '. ')
        edit = path.with_suffix('.puml')
        if edit.exists():
            SOURCES.add(edit)
            link = soup.new_tag('a', href=remote(edit))
            link.string = 'Editable PlantUML source'
            caption.append(link)
        figure.append(caption)
    for table in soup.find_all('table'):
        cols = len(table.find('tr').find_all(['td', 'th']))
        if cols >= 5:
            table['class'] = ['comparison']
        if n == 6:
            group = soup.new_tag('colgroup')
            for width in [29, 37, 34]:
                group.append(soup.new_tag('col', style=f'width:{width}%'))
            table.insert(0, group)
    return title, str(soup)


sections = [make_section(n, path) for n, path in enumerate(SECTIONS, 1)]
escape = html.escape
cover = f'''<div class="cover"><div class="wordmark">EGIN</div><div class="rule"></div>
<p class="project-name">A cross-platform mobile and web application for managing a land plot</p>
<p class="subtitle">Probation Period 1 · Concise Report</p>
<p class="cover-meta"><strong>Group:</strong> {escape(CFG['group'])}<br>
<strong>Team:</strong> {' · '.join(CFG['team'])}<br>
<strong>Representative:</strong> {escape(CFG['representative'])}<br>
<strong>Supervisor:</strong> {escape(CFG['supervisor'])}</p>
<p class="version"><strong>Project version:</strong> <a href="{REPO}/tree/{TAG}">{TAG}</a> · {TAG_COMMIT[:7]}<br>
11 sections · key diagrams · prototype · verification and next steps</p>
<p class="date">23 October 2026 · SE-2414</p></div>'''
toc = '<div class="toc"><h1>Contents</h1><ol>' + ''.join(
    f'<li><a href="#section-{n}">{escape(title)}</a></li>' for n, (title, _) in enumerate(sections, 1)) + '</ol>'
links = [
    ('Prototype', 'https://egin.perricheno.com'),
    ('Developer portal', 'https://api-egin.perricheno.com'),
    ('Frozen project source', f'{REPO}/tree/{TAG}'),
    ('Editable summary diagrams', remote(HERE / 'diagrams')),
    ('Full architecture diagrams', remote(DIP / 'diagrams')),
    ('Screenshots and capture records', remote(DIP / 'evidence/ux')),
    ('Verification records', remote(DIP / 'evidence/verification')),
    ('Editable concise report', remote(HERE / 'sections')),
]
toc += '<h2>Prototype and supporting materials</h2><div class="resource-links">' + ' · '.join(f'<a href="{url}">{label}</a>' for label, url in links) + '</div>'
toc += f'''<p class="version-note">This concise report describes the frozen <code>{TAG}</code> implementation. Detailed specifications and historical evidence remain linked; live websites may change. Implementation, executed checks and planned acceptance are distinguished throughout. References is section 11, following the source-document order.</p></div>'''
body = cover + toc + ''.join(f'<article class="section section-{n}" data-section="{n}">{content}</article>' for n, (_, content) in enumerate(sections, 1))
document = f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>EGIN — Concise Probation Period 1 Report</title><meta name="author" content="Adilzhan Amangeldi, Rustam Seitzhan"><style>{(HERE / "style.css").read_text()}</style></head><body>{body}</body></html>'
(BUILD / 'report.html').write_text(document)
parsed = BeautifulSoup(document, 'html.parser')
ids = [a['id'] for a in parsed.select('[id]')]
assert len(ids) == len(set(ids))
for a in parsed.select('a[href^="#"]'):
    assert a['href'][1:] in ids, a['href']
candidate = BUILD / CFG['filename']
HTML(string=document, base_url=str(ROOT)).write_pdf(candidate, pdf_tags=True)
with pymupdf.open(candidate) as pdf:
    count = len(pdf)
    if count > CFG['max_pages']:
        raise ValueError(f'Page budget exceeded: {count} > {CFG["max_pages"]}; published file not overwritten')
final = HERE / CFG['filename']
final.write_bytes(candidate.read_bytes())
reference_hashes = {}
for name in CFG['sections']:
    path = (DIP / name).relative_to(ROOT).as_posix()
    reference_hashes[path] = hashlib.sha256(subprocess.check_output(['git', 'show', f'{TAG}:{path}'], cwd=ROOT)).hexdigest()
for name in ['capture-metadata.json', 'build-artifacts.json']:
    SOURCES.add(DIP / 'evidence/ux' / name)
manifest = {
    'edition': 'concise', 'pages': count, 'max_pages': CFG['max_pages'],
    'tag': TAG, 'tag_commit': TAG_COMMIT, 'app_source_tree': APP_TREE,
    'report_sources_revision': EDITION_REVISION,
    'group': CFG['group'], 'representative': CFG['representative'],
    'section_order': CFG['condensed_sections'],
    'source_files_sha256': {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(SOURCES)},
    'detailed_reference_files_at_tag_sha256': reference_hashes,
    'pdf': CFG['filename'], 'pdf_sha256': hashlib.sha256(final.read_bytes()).hexdigest(),
}
(HERE / 'source-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Created {final.name}: {count} pages, {final.stat().st_size:,} bytes, 11 sections')
