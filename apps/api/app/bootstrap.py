"""Idempotent migrations, boundary import and labelled demonstration records."""
import sys,json,os,hashlib,zipfile,subprocess
from pathlib import Path
from uuid import uuid5,NAMESPACE_DNS
import psycopg
from psycopg.types.json import Jsonb
from argon2 import PasswordHasher

ROOT=Path('/workspace')
if not ROOT.exists():ROOT=Path(__file__).resolve().parents[3]

def uid(key):return str(uuid5(NAMESPACE_DNS,'egin-demo:'+key))

def migrate():
    with psycopg.connect(os.environ['DATABASE_URL']) as c:
        c.execute('SELECT pg_advisory_xact_lock(672345)')
        c.execute('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())')
        for p in sorted((ROOT/'packages/db/migrations').glob('*.sql')):
            if not c.execute('SELECT 1 FROM schema_migrations WHERE version=%s',(p.name,)).fetchone():
                c.execute(p.read_text());c.execute('INSERT INTO schema_migrations(version) VALUES(%s)',(p.name,));print('Migration:',p.name)

def import_boundaries():
    import shapefile,httpx
    with psycopg.connect(os.environ['DATABASE_URL']) as c:
        if c.execute('SELECT count(*) FROM admin_boundaries WHERE level=2').fetchone()[0]>100:return
        target=ROOT/'data/downloads/kaz-boundaries.zip';target.parent.mkdir(parents=True,exist_ok=True)
        url='https://data.humdata.org/dataset/afb05759-c3da-44f4-93a1-6bd2d8bcd431/resource/86cce6ba-4b79-4b4e-8961-3e6e04308395/download/kaz_adm_unhcr_2023_shp.zip'
        if not target.exists() or not zipfile.is_zipfile(target):
            with httpx.stream('GET',url,timeout=60,follow_redirects=True) as r:
                r.raise_for_status()
                temp=target.with_suffix('.tmp')
                with temp.open('wb') as f:
                    for chunk in r.iter_bytes():f.write(chunk)
                temp.replace(target)
        with zipfile.ZipFile(target) as z:
            shps=sorted([n for n in z.namelist() if n.lower().endswith('.shp')])
            total=0
            for level in (0,1,2):
                matches=[s for s in shps if f'adm{level}' in s.lower()]
                if not matches:raise RuntimeError(f'ADM{level} absent: {shps}')
                s=matches[0];stem=s[:-4]
                prj=z.read(stem+'.prj').decode()
                if 'Web_Mercator' in prj or 'Mercator_Auxiliary_Sphere' in prj:source_srid=3857
                elif prj.startswith('GEOGCS') and ('WGS_1984' in prj or 'WGS 84' in prj):source_srid=4326
                else:raise RuntimeError('Unsupported boundary coordinate system')
                import io
                reader=shapefile.Reader(shp=io.BytesIO(z.read(s)),shx=io.BytesIO(z.read(stem+'.shx')),dbf=io.BytesIO(z.read(stem+'.dbf')),encoding='utf-8')
                for item in reader.iterShapeRecords():
                    p={k.upper():v for k,v in item.record.as_dict().items()}
                    ident=str(p.get(f'ADM{level}_PCODE') or p.get(f'ADM{level}_PC') or p.get('KATO') or f'{level}-{total}')
                    parent=p.get(f'ADM{level-1}_PCODE') if level else None
                    if parent and not c.execute('SELECT 1 FROM admin_boundaries WHERE id=%s',(str(parent),)).fetchone():parent=None
                    c.execute('''INSERT INTO admin_boundaries(id,level,name_ru,name_kk,name_en,parent_id,source,source_version,geometry)
                    VALUES(%s,%s,%s,%s,%s,%s,'HDX / UNHCR','2023',ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Transform(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(%s),%s)),4326)),3))) ON CONFLICT(id) DO NOTHING''',
                    (ident,level,p.get(f'ADM{level}_RU') or p.get(f'ADM{level}_EN'),p.get(f'ADM{level}_KK') or p.get(f'ADM{level}_KZ'),p.get(f'ADM{level}_EN'),parent,json.dumps(item.shape.__geo_interface__),source_srid))
                    total+=1
            c.execute('''UPDATE admin_boundaries b SET parent_id=(SELECT a.id FROM admin_boundaries a WHERE a.level=b.level-1 AND ST_Contains(a.geometry,ST_PointOnSurface(b.geometry)) LIMIT 1) WHERE b.level>0 AND b.parent_id IS NULL''')
            print('Imported HDX boundaries:',total)
        meta={'dataset_url':'https://data.humdata.org/dataset/cod-ab-kaz','url':url,'license':'CC BY-IGO','source':'UNHCR','version':'2023','sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
        (ROOT/'data/boundaries-source.json').write_text(json.dumps(meta,indent=2))

def localize_boundaries():
    pairs=[('Abay Region','Область Абай','Абай облысы'),('Akmola Region','Акмолинская область','Ақмола облысы'),('Aktobe Region','Актюбинская область','Ақтөбе облысы'),('Almaty','Алматы','Алматы'),('Almaty Region','Алматинская область','Алматы облысы'),('Astana','Астана','Астана'),('Atyrau Region','Атырауская область','Атырау облысы'),('East Kazakhstan Region','Восточно-Казахстанская область','Шығыс Қазақстан облысы'),('Jambyl Region','Жамбылская область','Жамбыл облысы'),('Jetisu Region','Область Жетісу','Жетісу облысы'),('Karaganda Region','Карагандинская область','Қарағанды облысы'),('Kostanay Region','Костанайская область','Қостанай облысы'),('Kyzylorda Region','Кызылординская область','Қызылорда облысы'),('Mangystau Region','Мангистауская область','Маңғыстау облысы'),('North Kazakhstan Region','Северо-Казахстанская область','Солтүстік Қазақстан облысы'),('Pavlodar Region','Павлодарская область','Павлодар облысы'),('Shymkent','Шымкент','Шымкент'),('Turkistan Region','Туркестанская область','Түркістан облысы'),('Ulytau Region','Область Ұлытау','Ұлытау облысы'),('West Kazakhstan Region','Западно-Казахстанская область','Батыс Қазақстан облысы')]
    with psycopg.connect(os.environ['DATABASE_URL']) as c:
        for en,ru,kk in pairs:c.execute('UPDATE admin_boundaries SET name_ru=%s,name_kk=%s WHERE name_en=%s AND level=1',(ru,kk,en))
        c.execute("UPDATE admin_boundaries SET name_ru='Казахстан',name_kk='Қазақстан',name_en='Kazakhstan' WHERE level=0")


def seed():
    h=PasswordHasher(time_cost=2,memory_cost=19456,parallelism=1)
    with psycopg.connect(os.environ['DATABASE_URL']) as c:
        for key,name,kk in [('wheat','Пшеница','Бидай'),('barley','Ячмень','Арпа'),('sunflower','Подсолнечник','Күнбағыс'),('maize','Кукуруза','Жүгері'),('lentil','Чечевица','Жасымық'),('flax','Лён','Зығыр')]:
            c.execute('INSERT INTO crop_catalog VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',(key,name,kk))
        people=[('demo','demo@egin.local','Айдар Сейсенов'),('aliya','aliya@egin.local','Алия Омарова'),('serik','serik@egin.local','Серик Ахметов')]
        for key,email,name in people:
            c.execute('INSERT INTO users(id,email,password_hash) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',(uid(key),email,h.hash('EginDemo2026!')))
            c.execute("INSERT INTO profiles(user_id,name,region,onboarded) VALUES(%s,%s,'Акмолинская область',true) ON CONFLICT DO NOTHING",(uid(key),name))
        locations=[('steppe','Степное',69.4,52.4,'Акмолинская область','demo'),('kostanay','Тобол',63.7,53.0,'Костанайская область','demo'),('zhetysu','Жетісу',78.4,44.1,'Жетісу','aliya')]
        for key,name,lon,lat,region,owner in locations:
            c.execute('INSERT INTO organizations(id,name) VALUES(%s,%s) ON CONFLICT DO NOTHING',(uid('org'+key),'КХ «'+name+'»'))
            c.execute("INSERT INTO organization_members VALUES(%s,%s,'owner') ON CONFLICT DO NOTHING",(uid('org'+key),uid(owner)))
            c.execute('INSERT INTO farms(id,organization_id,name,region) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING',(uid('farm'+key),uid('org'+key),name,region))
            for i in range(3):
                x=lon+i*0.018;y=lat+i*0.007
                geom={'type':'Polygon','coordinates':[[[x,y],[x+.012,y+.001],[x+.011,y+.008],[x-.001,y+.006],[x,y]]]}
                c.execute('''INSERT INTO fields(id,farm_id,name,crop_id,geometry,created_by) VALUES(%s,%s,%s,%s,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326)),%s) ON CONFLICT DO NOTHING''',(uid('field'+key+str(i)),uid('farm'+key),['Северное','У реки','Дальнее'][i],['wheat','barley','flax'][i],json.dumps(geom),uid(owner)))
        c.execute("INSERT INTO conversations(id,title,kind,created_by) VALUES(%s,'Агрономы Казахстана · демо','group',%s) ON CONFLICT DO NOTHING",(uid('community'),uid('demo')))
        for key,_,_ in people:c.execute('INSERT INTO conversation_members(conversation_id,user_id) VALUES(%s,%s) ON CONFLICT DO NOTHING',(uid('community'),uid(key)))
        for i,(key,body) in enumerate([('aliya','Добро пожаловать в демо-сообщество EGIN. Здесь можно обсуждать поля, технику и сезон.'),('serik','Перед осенними работами проверьте прогноз для конкретного поля. В карточке есть ветер и осадки.'),('demo','Сообщения сохраняются в локальной базе. Можно пригласить коллегу, зарегистрировав второй аккаунт.')]):
            c.execute('INSERT INTO messages(conversation_id,user_id,body,client_id) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING',(uid('community'),uid(key),body,uid('message'+str(i))))
        for i,(kind,title,price,unit,owner) in enumerate([('product','Семенная пшеница · демо',125000,'₸ / т','demo'),('machinery_rental','Трактор с оператором · демо',18000,'₸ / час','serik'),('service','Отбор почвенных проб · демо',6500,'₸ / проба','aliya'),('job','Механизатор на сезон · демо',350000,'₸ / месяц','serik'),('product','Ячмень фуражный · демо',85000,'₸ / т','aliya'),('service','Агрономическое сопровождение · демо',45000,'₸ / выезд','demo')]):
            c.execute('''INSERT INTO listings(id,user_id,type,title,description,price,unit,region,location,is_demo) VALUES(%s,%s,%s,%s,%s,%s,%s,'Акмолинская область',ST_SetSRID(ST_MakePoint(%s,%s),4326),true) ON CONFLICT DO NOTHING''',(uid('listing'+str(i)),uid(owner),kind,title,'Демонстрационное объявление для проверки площадки. Это не реальное предложение. Напишите продавцу, чтобы проверить чат.',price,unit,69.4+i*.015,52.4))
        offers=[
          ('product','Семена льна масличного',280000,'₸ / т','aliya'),
          ('product','Семена подсолнечника',92000,'₸ / мешок','demo'),
          ('product','Сено в рулонах',17000,'₸ / рулон','serik'),
          ('product','Запчасти для сеялки СЗ',24000,'₸ / комплект','serik'),
          ('machinery_rental','John Deere 6155M с оператором',22000,'₸ / час','serik'),
          ('machinery_rental','Комбайн CLAAS на уборку',16000,'₸ / га','aliya'),
          ('machinery_rental','Посевной комплекс Horsch',9500,'₸ / га','demo'),
          ('machinery_rental','Самосвал для перевозки зерна',140000,'₸ / день','serik'),
          ('service','Лабораторный анализ почвы',18000,'₸ / проба','aliya'),
          ('service','Ремонт гидравлики сельхозтехники',25000,'₸ / выезд','serik'),
          ('service','Агродрон: обследование посевов',1800,'₸ / га','demo'),
          ('job','Агроном хозяйства',450000,'₸ / месяц','demo'),
          ('job','Водитель зерновоза',380000,'₸ / месяц','serik'),
          ('job','Оператор элеватора',300000,'₸ / месяц','aliya'),
        ]
        for i,(kind,title,price,unit,owner) in enumerate(offers,6):
            region=['Акмолинская область','Костанайская область','Павлодарская область'][i%3]
            c.execute("INSERT INTO listings(id,user_id,type,title,description,price,unit,region,is_demo,details) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,true,%s) ON CONFLICT DO NOTHING",(uid('listing'+str(i)),uid(owner),kind,title+' · демо','Демонстрационное предложение для знакомства с EGIN. Не является реальной вакансией или продажей. Уточните условия в чате продавца.',price,unit,region,Jsonb({'availability':'По согласованию','demo':True})))
        for i,title in enumerate(['Общий','Моя область','Растениеводство','Техника','Куплю/продам']):
            room=uid('channel'+str(i))
            c.execute("INSERT INTO conversations(id,title,kind,created_by) VALUES(%s,%s,'group',%s) ON CONFLICT DO NOTHING",(room,title+' · демо',uid('demo')))
            for key,_,_ in people:c.execute('INSERT INTO conversation_members(conversation_id,user_id) VALUES(%s,%s) ON CONFLICT DO NOTHING',(room,uid(key)))
            c.execute('INSERT INTO messages(conversation_id,user_id,body,client_id) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING',(room,uid('aliya'),'Демо-канал «'+title+'». Делитесь опытом, задавайте вопросы и обсуждайте работы в хозяйстве.',uid('channel-welcome'+str(i))))
        for i,title in enumerate(['Осмотреть всходы на Северном','Проверить технику перед выездом','Запланировать отбор почвенных проб']):
            c.execute('INSERT INTO field_tasks(id,user_id,field_id,title,due_date) VALUES(%s,%s,%s,%s,CURRENT_DATE+%s) ON CONFLICT DO NOTHING',(uid('task'+str(i)),uid('demo'),uid('fieldsteppe0'),title,i))
        c.execute('INSERT INTO notifications(id,user_id,title) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',(uid('welcome-notification'),uid('demo'),'Демо-хозяйство готово: выберите поле и запустите анализ.'))
        for i,(title,summary,tags,crops) in enumerate([('Как читать прогноз для полевых работ','Демо-материал: сопоставляйте прогноз осадков, ветер и состояние почвы. Прогноз модели не заменяет наблюдения на поле.',['weather','agronomy'],['wheat','barley']),('Анализ почвы: карта и лаборатория','Демо-материал: глобальные почвенные карты полезны для первичной оценки, но для доз удобрений нужны лабораторные пробы.',['soil','agronomy'],['wheat']),('Подготовка техники к сезону','Демо-материал: ведите журнал обслуживания и заранее проверяйте доступность запчастей и сервисов.',['market','machinery'],[])]):
            c.execute("INSERT INTO news_items(id,title,summary,source,tags,regions,crop_tags,is_demo) VALUES(%s,%s,%s,'EGIN · демонстрационные материалы',%s,%s,%s,true) ON CONFLICT DO NOTHING",(uid('news'+str(i)),title,summary,tags,['Акмолинская область'],crops))
        for kind,value in [('region','Акмолинская область'),('crop','wheat'),('topic','weather')]:c.execute('INSERT INTO user_interests VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',(uid('demo'),kind,value))
    print('Seed complete (idempotent; no fabricated weather/soil).')

if __name__=='__main__':
    mode=sys.argv[1] if len(sys.argv)>1 else 'init'
    if mode in ('init','migrate'):migrate()
    if mode in ('init','boundaries'):
        import_boundaries();localize_boundaries()
    if mode in ('init','seed'):seed()
    if mode=='init' and not (ROOT/'artifacts/crop-suitability.joblib').exists():subprocess.run([sys.executable,str(ROOT/'scripts/train_models.py')],check=True)
