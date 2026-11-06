"""Rebuild the local Kazakhstan gazetteer from GeoNames CC BY 4.0."""
import hashlib
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

url = 'https://download.geonames.org/export/dump/KZ.zip'
with urlopen(Request(url, headers={'User-Agent': 'EGIN-place-index'}), timeout=90) as response:
    archive = response.read(30 * 1024 * 1024)
with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
    rows = [line.split('\t') for line in zipped.read('KZ.txt').decode('utf-8').splitlines()]
# Explicit present-day display names for major cities; historical names stay aliases.
display = {'Astana':'Астана','Almaty':'Алматы','Shymkent':'Шымкент','Qyzylorda':'Кызылорда','Kyzylorda':'Кызылорда','Karagandy':'Караганда','Aqtobe':'Актобе','Aktobe':'Актобе','Oral':'Орал','Atyrau':'Атырау','Aktau':'Актау','Taraz':'Тараз','Kokshetau':'Кокшетау','Kostanay':'Костанай','Petropavl':'Петропавловск','Pavlodar':'Павлодар','Turkistan':'Туркестан','Semey':'Семей','Oskemen':'Усть-Каменогорск','Taldykorgan':'Талдыкорган'}
def names(row):
    return list(dict.fromkeys([row[1], row[2], *row[3].split(',')]))
def name(row):
    choices = names(row)
    if row[7].startswith('ADM'):
        administrative = next((n for n in choices if re.fullmatch(r'[А-Яа-яЁё\s-]+', n) and re.search(r'(ская\s+область|ский\s+район)$', n, re.I)), None)
        if administrative:
            return re.sub(r'Область|Район', lambda m: m.group().lower(), administrative)
    return display.get(row[1]) or display.get(row[2]) or next((n for n in choices if re.fullmatch(r'[А-Яа-яЁё\s-]+', n)), row[1])
regions = {r[10]: name(r) for r in rows if r[7]=='ADM1'}
districts = {(r[10], r[11]): name(r) for r in rows if r[7]=='ADM2'}
places=[]
for r in rows:
    if not (r[7] in ['ADM1','ADM2','ADM3'] or r[6]=='P' and r[7] not in ['PPLQ','PPLW','PPLH']):
        continue
    title=name(r)
    aliases=sorted([n for n in names(r) if n and n!=title and re.search(r'[a-zA-ZА-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі]',n)], key=lambda n: 0 if re.search(r'[А-Яа-яӘәҒғҚқҢңӨөҰұҮүҺһІі]',n) else 1)[:40]
    places.append({'id':'geonames:'+r[0], 'name':title, 'aliases':aliases, 'latitude':float(r[4]),'longitude':float(r[5]),'kind':'region' if r[7]=='ADM1' else 'district' if r[7].startswith('ADM') else 'city','region':regions.get(r[10],''),'district':districts.get((r[10],r[11]),''),'population':int(r[14] or 0)})
places.sort(key=lambda p:(-p['population'],p['id']))
directory=Path(__file__).resolve().parents[1]/'src'/'search'
directory.mkdir(exist_ok=True)
result={'source':url,'license':'CC BY 4.0','attribution':'GeoNames','retrievedAt':datetime.now(timezone.utc).isoformat(),'archiveSha256':hashlib.sha256(archive).hexdigest(),'places':places}
(directory/'places-kz.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(json.dumps({'places':len(places),'examples':places[:4]},ensure_ascii=True))
