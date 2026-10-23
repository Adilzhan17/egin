#!/usr/bin/env python3
"""Validate concise PDF bounds, links, section order, hashes and tagged source."""
import hashlib
import json
import re
import subprocess
from pathlib import Path
import pymupdf
from bs4 import BeautifulSoup

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
cfg = json.loads((HERE/'report.json').read_text())
m = json.loads((HERE/'source-manifest.json').read_text())
path = HERE/cfg['filename']
assert hashlib.sha256(path.read_bytes()).hexdigest() == m['pdf_sha256']
for name,digest in m['source_files_sha256'].items():
 assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest() == digest,name
for name,digest in m['detailed_reference_files_at_tag_sha256'].items():
 assert hashlib.sha256(subprocess.check_output(['git','show',m['tag']+':'+name],cwd=ROOT)).hexdigest() == digest,name
assert subprocess.check_output(['git','rev-parse',m['tag']+'^{}'],cwd=ROOT,text=True).strip() == m['tag_commit']
assert subprocess.check_output(['git','rev-parse','HEAD:apps'],cwd=ROOT,text=True).strip() == m['app_source_tree']
soup=BeautifulSoup((HERE/'_build/report.html').read_text(),'html.parser')
sections=soup.select('article.section')
assert [s['data-section'] for s in sections] == [str(i) for i in range(1,12)]
assert 'DEFENSE-PREPARATION' not in soup.get_text()
ids={x['id'] for x in soup.select('[id]')}
for a in soup.select('a[href]'):
 href=a['href']
 assert href.startswith(('https://','http://','#')),href
 if href.startswith('#'):assert href[1:] in ids,href
for n in range(1,20):
 assert f'[{n}]' in sections[-1].get_text(),n
with pymupdf.open(path) as pdf:
 assert 15 <= len(pdf) <= cfg['max_pages'],len(pdf)
 outline=[x for x in pdf.get_toc() if x[0]==1 and re.match(r'^\d+\.',x[1])]
 assert len(outline)==11,outline
 links=0
 for i,page in enumerate(pdf):
  for x0,y0,x1,y1,*word in page.get_text('words'):
   assert x0>=-1 and y0>=-1 and x1<=page.rect.width+1 and y1<=page.rect.height+1,(i+1,word)
  for link in page.get_links():
   links+=1
   if 'uri' in link:assert link['uri'].startswith(('http://','https://')),link
   if 'page' in link:assert 0<=link['page']<len(pdf),link
 print(json.dumps({'result':'passed','pages':len(pdf),'sections':11,'references':19,'links':links,'version':m['tag'],'edition':'concise'},indent=2))
