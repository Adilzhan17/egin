#!/usr/bin/env python3
"""Validate generated PDF structure, links, bounds and input integrity."""
import hashlib
import json
import subprocess
from pathlib import Path

import pymupdf
from bs4 import BeautifulSoup
from pypdf import PdfReader

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
config = json.loads((HERE / 'report.json').read_text())
manifest = json.loads((HERE / 'source-manifest.json').read_text())
pdf = HERE / config['filename']
assert hashlib.sha256(pdf.read_bytes()).hexdigest() == manifest['pdf_sha256']
for name, expected in manifest['source_files_sha256'].items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name
source = BeautifulSoup((HERE / '_build/report.html').read_text(), 'html.parser')
sections = source.select('article.section')
assert len(sections) == 11
assert [a['data-section'] for a in sections] == [str(i) for i in range(1, 12)]
assert 'DEFENSE-PREPARATION' not in source.get_text()
ids = {a['id'] for a in source.select('[id]')}
for a in source.select('a[href]'):
    href = a['href']
    assert href.startswith(('http://', 'https://', '#')), href
    if href.startswith('#'):
        assert href[1:] in ids, href
    if href.startswith(config['repository'] + '/blob/') or href.startswith(config['repository'] + '/tree/'):
        assert '/' + config['tag'] + '/' in href or href.endswith('/' + config['tag']), href
doc = pymupdf.open(pdf)
section_bookmarks = [row for row in doc.get_toc() if row[0] == 1 and row[1][:1].isdigit()]
assert len(section_bookmarks) == 11
links = 0
for i, page in enumerate(doc):
    for x0, y0, x1, y1, *rest in page.get_text('words'):
        assert x0 >= -1 and y0 >= -1 and x1 <= page.rect.width + 1 and y1 <= page.rect.height + 1, (i + 1, rest)
    for link in page.get_links():
        links += 1
        if 'uri' in link:
            assert link['uri'].startswith(('http://', 'https://')), link
        if 'page' in link:
            assert 0 <= link['page'] < len(doc), link
assert len(PdfReader(pdf).pages) == len(doc)
capture = json.loads((HERE.parent / 'evidence/ux/capture-metadata.json').read_text())
tree = subprocess.check_output(['git', 'rev-parse', 'HEAD:apps'], cwd=ROOT, text=True).strip()
assert tree == capture['buildProvenance']['sourceAppsTree']
print(json.dumps({'result': 'passed', 'sections': 11, 'pages': len(doc), 'links': links, 'tag': config['tag'], 'app_source_tree': tree}, indent=2))
