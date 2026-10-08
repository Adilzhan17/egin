"""RSS ingestion is optional. Demo records remain clearly labelled when feeds fail."""
import re,html,logging
from datetime import timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse
from typing import Protocol
import xml.etree.ElementTree as ET
import httpx
from . import db

class NewsProvider(Protocol):
    async def fetch(self)->list[dict]: ...

class RSSProvider:
    def __init__(self,url,source):self.url=url;self.source=source
    async def fetch(self):
        async with httpx.AsyncClient(timeout=12,follow_redirects=True) as client:
            r=await client.get(self.url,headers={'User-Agent':'EGIN-local-news/0.1'});r.raise_for_status()
            if len(r.content)>2*1024*1024:raise ValueError('Feed too large')
            root=ET.fromstring(r.content)
        entries=[]
        for item in root.findall('.//item')[:20]:
            title=(item.findtext('title') or '').strip();url=(item.findtext('link') or '').strip()
            if not title or urlparse(url).scheme not in ('http','https'):continue
            desc=html.unescape(re.sub('<[^>]+>','',item.findtext('description') or ''))[:350]
            try:published=parsedate_to_datetime(item.findtext('pubDate')).astimezone(timezone.utc)
            except (TypeError,ValueError,AttributeError):published=None
            text=(title+' '+desc).lower();tags=[];crops=[]
            for key,tag in [('погод','weather'),('осадк','weather'),('почв','soil'),('цен','market'),('техник','machinery')]:
                if key in text:tags.append(tag)
            for key,crop in [('пшениц','wheat'),('ячмен','barley'),('подсолнеч','sunflower')]:
                if key in text:crops.append(crop)
            entries.append({'title':title[:200],'summary':desc,'external_url':url,'source':self.source,'published_at':published,'tags':list(set(tags)),'crops':crops})
        return entries

async def sync():
    reports=[]
    for provider in [RSSProvider('https://eldala.kz/rss','ElDala.kz'),RSSProvider('https://agroinfo.kz/feed/','АгроИнфо')]:
        try:
            entries=await provider.fetch()
            for n in entries:
                db.execute('''INSERT INTO news_items(title,summary,source,external_url,published_at,tags,crop_tags,is_demo) VALUES(%s,%s,%s,%s,%s,%s,%s,false) ON CONFLICT(external_url) DO UPDATE SET title=EXCLUDED.title,summary=EXCLUDED.summary''',(n['title'],n['summary'],n['source'],n['external_url'],n['published_at'],n['tags'],n['crops']))
            reports.append({'source':provider.source,'status':'ok','items':len(entries)})
        except Exception as e:reports.append({'source':provider.source,'status':'unavailable','reason':type(e).__name__})
    return reports

if __name__=='__main__':
    import asyncio,json
    db.pool.open();db.pool.wait()
    try:print(json.dumps(asyncio.run(sync()),ensure_ascii=False))
    finally:db.pool.close()
