import json
from fastapi import HTTPException
from psycopg.errors import DataException
from . import db

FIELD_SELECT='''SELECT f.id,f.farm_id,f.name,f.crop_id,c.name_ru AS crop_name,f.area_ha,f.revision,f.created_at,f.updated_at,
 ST_AsGeoJSON(f.geometry)::json AS geometry,ST_Y(f.centroid) AS lat,ST_X(f.centroid) AS lon,
 r.name_ru AS region,d.name_ru AS district,r.source_version AS boundary_version,fa.name AS farm_name
 FROM fields f JOIN farms fa ON fa.id=f.farm_id LEFT JOIN crop_catalog c ON c.id=f.crop_id
 LEFT JOIN admin_boundaries r ON r.id=f.region_id LEFT JOIN admin_boundaries d ON d.id=f.district_id'''

def get_field(field_id):return db.one(FIELD_SELECT+' WHERE f.id=%s',(field_id,))
def get_fields(user_id):
    return db.rows(FIELD_SELECT+' WHERE EXISTS(SELECT 1 FROM organization_members om WHERE om.organization_id=fa.organization_id AND om.user_id=%s) ORDER BY f.created_at DESC',(user_id,))

def validate_geometry(geometry):
    raw=json.dumps(geometry.model_dump())
    try:
        check=db.one('''WITH g AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(%s),4326) AS geom)
        SELECT ST_IsValid(geom) AS valid,ST_IsValidReason(geom) AS reason,ST_IsEmpty(geom) AS empty,
        ST_Area(geom::geography)/10000 AS area,GeometryType(geom) AS kind,
        ST_CoveredBy(geom,ST_MakeEnvelope(45,40,88,56,4326)) AS bbox_ok,
        EXISTS(SELECT 1 FROM admin_boundaries a WHERE a.level=0 AND ST_CoveredBy(geom,ST_Buffer(a.geometry,.005))) AS in_kz FROM g''',(raw,))
    except DataException:raise HTTPException(422,'Некорректный GeoJSON')
    if not check['valid'] or check['empty']:raise HTTPException(422,'Некорректный полигон: '+check['reason'])
    if check['kind'] not in ('POLYGON','MULTIPOLYGON'):raise HTTPException(422,'Нужен полигон')
    if not check['bbox_ok'] or not check['in_kz']:raise HTTPException(422,'Нарисуйте поле в границах Казахстана')
    if not .01<=check['area']<=100000:raise HTTPException(422,'Площадь поля должна быть от 0,01 до 100 000 га')
    return raw

def location(lat,lon):
    parts=db.rows('''SELECT id,level,name_ru,name_kk,name_en,source,source_version FROM admin_boundaries WHERE ST_Contains(geometry,ST_SetSRID(ST_MakePoint(%s,%s),4326)) ORDER BY level''',(lon,lat))
    return {'lat':lat,'lon':lon,'boundaries':parts,'region':next((p['name_ru'] for p in parts if p['level']==1),None),'district':next((p['name_ru'] for p in parts if p['level']==2),None),'locality':next((p['name_ru'] for p in reversed(parts)),None)}
