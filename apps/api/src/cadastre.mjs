import https from 'node:https';
import tls from 'node:tls';
import { readFileSync } from 'node:fs';
import proj4 from 'proj4';
import wellknown from 'wellknown';
import { validateLand, landAreaHa, landContainsPoint } from './land.mjs';

const SOURCE = 'https://map.gov4c.kz/egkn/';
const BASE = `${SOURCE}rest`;
const MAX_BYTES = 5 * 1024 * 1024;
const fail = (status, message) => Object.assign(new Error(message), { status });
// The public server omits its intermediate. This certificate chains to system roots
// (openssl verify), and supplements rather than replaces normal TLS validation.
// Public AIA source: http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt
const intermediate = readFileSync(new URL('./certs/sectigo-public-server-authentication-dv-r36.pem', import.meta.url), 'utf8');
export const cadastreTlsOptions = { ca: [...tls.rootCertificates, intermediate], rejectUnauthorized: true };

export function normalizeCadastreNumber(input) {
  if (typeof input !== 'string' || input.length > 40 || !/^[\d\s:-]+$/.test(input)) throw fail(400, 'Введите кадастровый номер участка, например 05-071-008-125.');
  const number = input.replace(/[\s:-]/g, '');
  if (!/^\d{11,12}$/.test(number)) throw fail(400, 'Кадастровый номер участка должен содержать 11 или 12 цифр.');
  return number;
}

// A fresh cookie jar is created for every search, never shared between owners.
export function createCadastreReader({ request = https.request } = {}) {
  const cookies = new Map();
  return (path, { method = 'GET', signal } = {}) => new Promise((resolve, reject) => {
    const geoserver = path.startsWith('/geoserver/wfs?');
    if ((!path.startsWith('/map/') && !geoserver) || /[\r\n]/.test(path)) return reject(fail(400, 'Некорректный запрос карты.'));
    const req = request(`${geoserver ? new URL(SOURCE).origin : BASE}${path}`, {
      ...cadastreTlsOptions, agent: false, method, signal,
      headers: { Accept: 'application/json', 'Accept-Encoding': 'identity', 'User-Agent': 'EGIN cadastral parcel lookup',
        Origin: new URL(SOURCE).origin, Referer: SOURCE, ...(cookies.size ? { Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; ') } : {}) },
    }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(fail(502, 'Кадастровая карта временно не отвечает. Повторите позже.')); return; }
      for (const raw of response.headers['set-cookie'] || []) {
        const match = /^(JSESSIONID|MAP_SESSION_ID)=([A-Za-z0-9._-]{1,256})(?:;|$)/.exec(raw);
        if (match) cookies.set(match[1], match[2]);
      }
      let size = 0; const chunks = [];
      response.on('data', chunk => { size += chunk.length; if (size > MAX_BYTES) req.destroy(fail(502, 'Ответ кадастровой карты слишком большой.')); else chunks.push(chunk); });
      response.on('error', () => reject(fail(502, 'Соединение с кадастровой картой прервано.')));
      response.on('end', () => {
        if (size > MAX_BYTES) return;
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(fail(502, 'Кадастровая карта вернула неподдерживаемый ответ.')); }
      });
    });
    req.on('error', () => reject(fail(502, 'Не удалось безопасно подключиться к кадастровой карте. Повторите позже.')));
    req.setTimeout(12_000, () => req.destroy());
    req.end();
  });
}

export function parcelBoundary(wkt, srid) {
  if (typeof wkt !== 'string' || wkt.length > 500_000 || !/^\s*(MULTIPOLYGON|POLYGON)\s*\(/i.test(wkt)) throw fail(422, 'У участка нет поддерживаемого контура.');
  if (!Number.isInteger(srid) || srid < 32639 || srid > 32645) throw fail(422, 'Система координат участка пока не поддерживается.');
  let parsed;
  try { parsed = wellknown.parse(wkt); } catch { /* fail below */ }
  if (parsed?.type === 'MultiPolygon') {
    if (parsed.coordinates.length !== 1) throw fail(422, 'Участок состоит из нескольких контуров. Пока поддерживается один непрерывный контур.');
    parsed = { type: 'Polygon', coordinates: parsed.coordinates[0] };
  }
  if(parsed?.type!=='Polygon'||!Array.isArray(parsed.coordinates)||!parsed.coordinates.length)throw fail(422,'У участка нет поддерживаемого контура.');
  const rings=parsed.coordinates;
  if(rings.some(ring=>!Array.isArray(ring)||ring.length<4)||rings.reduce((count,ring)=>count+ring.length,0)>2000)throw fail(422,'Каждый контур должен содержать от 4 точек, всего не более 2000 точек.');
  if(rings.some(ring=>ring.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))))throw fail(422,'Кадастровая карта вернула некорректные координаты.');
  if(rings.some(ring=>ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1]))throw fail(422,'Контур участка не замкнут.');
  const projection=`+proj=utm +zone=${srid-32600} +datum=WGS84 +units=m +no_defs`;
  let coordinates;
  try{coordinates=rings.map(ring=>ring.map(p=>proj4(projection,'EPSG:4326',p)));}catch{throw fail(422,'Не удалось преобразовать координаты участка.');}
  if(coordinates.some(ring=>ring.some(([lng,lat])=>!Number.isFinite(lng)||!Number.isFinite(lat)||lng<45||lng>88||lat<39||lat>57)))throw fail(422,'Координаты участка не соответствуют территории Казахстана.');
  const boundary={type:'Polygon',coordinates};
  try { validateLand({ boundary }); }
  catch (error) {
    if (error?.status === 400) throw fail(422, error.message);
    throw error;
  }
  return boundary;
}

export function boundaryAreaHa(boundary) {
  const area = landAreaHa(boundary);
  if (!Number.isFinite(area) || area <= 0 || area > 1_000_000) throw fail(422, 'Площадь контура некорректна.');
  return area;
}

export function normalizeCadastrePoint(latitude, longitude) {
  const parse = value => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^-?\d{1,3}(?:\.\d{1,12})?$/.test(value))) return NaN;
    return Number(value);
  };
  const lat = parse(latitude), lng = parse(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 39 || lat > 57 || lng < 45 || lng > 88) throw fail(400, 'Выберите точку на территории Казахстана.');
  return { latitude: lat, longitude: lng };
}

export function normalizeCadastreDistrict(input) {
  const id = typeof input === 'number' && Number.isSafeInteger(input) ? input : typeof input === 'string' && /^\d{1,5}$/.test(input) ? Number(input) : NaN;
  if (!Number.isFinite(id) || id < 1 || id > 10000) throw fail(400, 'Выберите район кадастровой карты.');
  return id;
}

export function normalizeCadastreLabelView(input = {}) {
  const integer = value => typeof value === 'number' && Number.isSafeInteger(value) ? value : typeof value === 'string' && /^\d{1,5}$/.test(value) ? Number(value) : NaN;
  const district = integer(input.district), zoom = integer(input.zoom);
  if (district < 1 || district > 10000 || !Number.isFinite(district) || zoom < 17 || zoom > 19 || !Number.isFinite(zoom)) throw fail(400, 'Для кадастровых номеров выберите район и приблизьте карту.');
  const sw = normalizeCadastrePoint(input.south, input.west), ne = normalizeCadastrePoint(input.north, input.east);
  if (ne.longitude <= sw.longitude || ne.latitude <= sw.latitude || ne.longitude - sw.longitude > .02500000001 || ne.latitude - sw.latitude > .02500000001) throw fail(400, 'Приблизьте карту, чтобы увидеть кадастровые номера.');
  return { district, zoom, west: sw.longitude, south: sw.latitude, east: ne.longitude, north: ne.latitude };
}

const containsPoint = landContainsPoint;

function candidate(row, region, district, fetchedAt) {
  const number = normalizeCadastreNumber(row?.properties?.kad_nomer);
  const boundary = parcelBoundary(row.geometry, district.srs), p = row.properties;
  const registeredAreaHa = typeof p.squ === 'number' && Number.isFinite(p.squ) && p.squ > 0 ? p.squ / 10000 : undefined;
  return { cadastralNumber: number, region: String(region.nameRu || region.name || '').slice(0, 150), district: String(district.nameRu || '').slice(0, 150),
    boundary, areaHa: boundaryAreaHa(boundary), ...(registeredAreaHa ? { registeredAreaHa } : {}), sourceSrid: district.srs,
    source: 'public-map', sourceUrl: SOURCE, fetchedAt, ownershipVerified: false };
}

export function createCadastreClient({ readerFactory = createCadastreReader, now = Date.now } = {}) {
  let catalog, catalogAt = 0;
  const districtViews = new Map();
  async function getCatalog(reader, signal) {
    if (!catalog || now() - catalogAt > 86_400_000) {
      const fetched = await reader('/map/districts?lang=ru', { signal });
      if (!Array.isArray(fetched) || fetched.length > 100) throw fail(502, 'Не удалось получить список регионов кадастровой карты.');
      catalog = fetched; catalogAt = now();
    }
    return catalog;
  }
  function findDistrict(regions, regionCode, districtCode) {
    const region = regions.find(r => r?.code === regionCode);
    const districts = (Array.isArray(region?.districts) ? region.districts : []).filter(d => d?.code === districtCode);
    if (districts.length !== 1) throw fail(422, 'Регион или район из кадастрового номера не найден. Проверьте номер на официальной карте.');
    const district = districts[0];
    if (!/^\d{3}$/.test(district.code) || !Number.isInteger(district.srs) || district.srs < 32639 || district.srs > 32645) throw fail(422, 'Система координат района пока не поддерживается.');
    return { region, district };
  }
  function findDistrictId(regions, id) {
    const matches = regions.flatMap(region => (Array.isArray(region?.districts) ? region.districts : []).filter(d => d?.id === id).map(district => ({region,district})));
    if (matches.length !== 1) throw fail(422, 'Район кадастровой карты не найден. Выберите участок ещё раз.');
    return findDistrict(regions, matches[0].region.code, matches[0].district.code);
  }
  function resultEnvelope(candidates, fetchedAt, district) {
    return { candidates, source: 'public-map', sourceUrl: SOURCE, fetchedAt, ownershipVerified: false,
      ...(district && Number.isSafeInteger(district.id) && district.id > 0 ? { mapDistrict: { id: district.id, code: district.code, srid: district.srs } } : {}) };
  }
  function rowsFrom(result) {
    if (!result || typeof result !== 'object' || !Array.isArray(result.lands) || result.lands.length > 10) throw fail(502, 'Формат ответа кадастровой карты изменился.');
    return result.lands;
  }
  return {
    async regions() {
      const reader = readerFactory(), signal = AbortSignal.timeout(20_000);
      const regions = (await getCatalog(reader,signal)).filter(r=>/^\d{2}$/.test(r?.code)).map(region=>({
        code:region.code,name:String(region.name || region.nameRu || '').slice(0,150),
        districts:(Array.isArray(region.districts)?region.districts:[]).filter(d=>Number.isSafeInteger(d?.id) && d.id>0 && d.id<=10000 && /^\d{3}$/.test(d.code) && Number.isInteger(d.srs) && d.srs>=32639 && d.srs<=32645).slice(0,1000).map(d=>({id:d.id,code:d.code,name:String(d.nameRu || d.name || '').slice(0,150),srid:d.srs})),
      }));
      return {regions};
    },
    async district(input) {
      const id=normalizeCadastreDistrict(input), reader=readerFactory(), signal=AbortSignal.timeout(20_000);
      const {region,district}=findDistrictId(await getCatalog(reader,signal),id);
      const cached=districtViews.get(id);
      if(cached && now()-cached.at<86_400_000)return cached.value;
      const result=await reader(`/map/district?code=${district.code}`,{method:'PUT',signal});
      if(typeof result?.geom!=='string' || result.geom.length>4_000_000)throw fail(502,'Не удалось получить границы района.');
      let geometry;
      try{geometry=wellknown.parse(result.geom);}catch{ /* validated below */ }
      if(!geometry || !['Polygon','MultiPolygon'].includes(geometry.type))throw fail(502,'Карта вернула неподдерживаемые границы района.');
      const points=geometry.type==='Polygon'?geometry.coordinates.flat():geometry.coordinates.flat(2);
      if(!points.length || points.length>100000 || points.some(p=>!Array.isArray(p) || p.length!==2 || !p.every(Number.isFinite)))throw fail(502,'Карта вернула некорректные границы района.');
      // Official /map/district geom is always EPSG:3857, unlike parcel UTM.
      let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
      for(const point of points){
        const [lng,lat]=proj4('EPSG:3857','EPSG:4326',point);
        if(!Number.isFinite(lng)||!Number.isFinite(lat)||lng<45||lng>88||lat<39||lat>57)throw fail(502,'Границы района не соответствуют территории Казахстана.');
        west=Math.min(west,lng);east=Math.max(east,lng);south=Math.min(south,lat);north=Math.max(north,lat);
      }
      if(west>=east||south>=north)throw fail(502,'Не удалось определить область района.');
      const value={mapDistrict:{id:district.id,code:district.code,srid:district.srs},name:String(district.nameRu||district.name||'').slice(0,150),region:String(region.name||region.nameRu||'').slice(0,150),regionCode:region.code,bounds:{west,south,east,north}};
      if(districtViews.size>=500)districtViews.delete(districtViews.keys().next().value);
      districtViews.set(id,{at:now(),value});return value;
    },
    async search(input) {
      const number = normalizeCadastreNumber(input), reader = readerFactory(), signal = AbortSignal.timeout(20_000);
      const { region, district } = findDistrict(await getCatalog(reader, signal), number.slice(0, 2), number.slice(2, 5));
      await reader(`/map/district?code=${district.code}`, { method: 'PUT', signal });
      const params = new URLSearchParams({ searchText: number, offset: '0', limit: '10', lang: 'ru', layers: '' });
      const rows = rowsFrom(await reader(`/map/search?${params}`, { signal })).filter(row => typeof row?.properties?.kad_nomer === 'string' && row.properties.kad_nomer.replace(/[\s:-]/g, '') === number);
      if (rows.length > 1) throw fail(422, 'Карта вернула несколько участков с этим номером. Уточните сведения на официальной карте.');
      const fetchedAt = new Date(now()).toISOString();
      return resultEnvelope(rows.map(row => candidate(row, region, district, fetchedAt)), fetchedAt, district);
    },
    async labels(input) {
      const view = normalizeCadastreLabelView(input), reader = readerFactory(), signal = AbortSignal.timeout(20_000);
      const regions = await getCatalog(reader, signal);
      const {region,district} = findDistrictId(regions,view.district);
      const projection = `+proj=utm +zone=${district.srs - 32600} +datum=WGS84 +units=m +no_defs`;
      const corners = [[view.west,view.south],[view.west,view.north],[view.east,view.south],[view.east,view.north]].map(p => proj4('EPSG:4326',projection,p));
      const extent = [Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[1])),Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[1]))];
      if (!extent.every(Number.isFinite) || extent[2] - extent[0] > 4000 || extent[3] - extent[1] > 4000) throw fail(400, 'Выбранная область слишком велика для кадастровых номеров.');
      await reader(`/map/district?code=${district.code}`, {method:'PUT',signal});
      const resolution = 156543.03392804097 * Math.cos((view.south + view.north) / 2 * Math.PI / 180) / 2 ** view.zoom;
      const query = new URLSearchParams({name:'lands',extent:extent.join(','),res:String(resolution),srs:'1'});
      const result = await reader(`/map/labels?${query}`, {signal});
      if (!Array.isArray(result?.lands) || result.lands.length > 5000) throw fail(502, 'Карта вернула слишком много подписей. Приблизьте выбранную область.');
      const labels = [], seen = new Set();
      for (const row of result.lands) {
        if (typeof row?.geometry !== 'string' || row.geometry.length > 160 || !/^POINT\s*\(/i.test(row.geometry)) continue;
        let number, geometry;
        try { number = normalizeCadastreNumber(row.label); geometry = wellknown.parse(row.geometry); } catch { continue; }
        if (!number.startsWith(`${region.code}${district.code}`) || seen.has(number) || geometry?.type !== 'Point' || geometry.coordinates.length !== 2 || !geometry.coordinates.every(Number.isFinite)) continue;
        let longitude, latitude;
        try { [longitude,latitude] = proj4(projection,'EPSG:4326',geometry.coordinates); } catch { continue; }
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || longitude < view.west || longitude > view.east || latitude < view.south || latitude > view.north) continue;
        seen.add(number); labels.push({number,latitude,longitude});
      }
      const centerLatitude = (view.north + view.south) / 2, centerLongitude = (view.west + view.east) / 2;
      const distance = p => (p.latitude-centerLatitude)**2 + ((p.longitude-centerLongitude)*Math.cos(centerLatitude*Math.PI/180))**2;
      labels.sort((a,b)=>distance(a)-distance(b));
      return {labels:labels.slice(0,150)};
    },
    async identify(latitude, longitude, preferredDistrict) {
      const point=normalizeCadastrePoint(latitude,longitude);
      const preferredId=preferredDistrict===undefined ? undefined : normalizeCadastreDistrict(preferredDistrict);
      const reader=readerFactory(),signal=AbortSignal.timeout(20_000),regions=await getCatalog(reader,signal);
      const fetchedAt=new Date(now()).toISOString();
      async function readParcels(context) {
        const {region,district}=context, districtReader=readerFactory();
        await districtReader(`/map/district?code=${district.code}`,{method:'PUT',signal});
        const [east,north]=proj4('EPSG:4326',`+proj=utm +zone=${district.srs-32600} +datum=WGS84 +units=m +no_defs`,[point.longitude,point.latitude]);
        const query=new URLSearchParams({x:String(east),y:String(north),layers:'lands',lang:'ru'});
        const rows=rowsFrom(await districtReader(`/map/get?${query}`,{signal}));
        const candidates=[],seen=new Set();
        for(const row of rows){
          let number;try{number=normalizeCadastreNumber(row?.properties?.kad_nomer);}catch{continue;}
          if(!number.startsWith(`${region.code}${district.code}`))continue;
          const parcel=candidate(row,region,district,fetchedAt);
          if(!containsPoint(parcel.boundary,[point.longitude,point.latitude]))continue;
          if(seen.has(number))throw fail(422,'Карта вернула несколько контуров с одним номером. Уточните сведения на официальной карте.');
          seen.add(number);candidates.push(parcel);
        }
        return {...context,candidates};
      }
      // An explicit selected district is a preference, never proof of location.
      // Only an actual parcel containing the tapped point permits this fast path.
      let preferred,preferredError;
      if(preferredId!==undefined){
        try {
          const context=findDistrictId(regions,preferredId);
          preferred=await readParcels(context);
          if(preferred.candidates.length)return resultEnvelope(preferred.candidates,fetchedAt,preferred.district);
        } catch(error) { preferredError=error; }
      }
      const [x,y]=proj4('EPSG:4326','EPSG:3857',[point.longitude,point.latitude]);
      const params=new URLSearchParams({service:'WFS',version:'1.1.0',request:'GetFeature',typename:'egkn:districts',outputFormat:'application/json',srsname:'EPSG:3857',bbox:[x-.05,y-.05,x+.05,y+.05,'EPSG:3857'].join(','),maxFeatures:'10',propertyName:'regionname,districtna,srs,date_end'});
      const result=await reader(`/geoserver/wfs?${params}`,{signal});
      if(!Array.isArray(result?.features)||result.features.length>10||Number(result.totalFeatures)>10)throw fail(502,'Не удалось определить район выбранной точки. Выберите район или найдите участок по номеру.');
      const contexts=new Map(),lookupErrors=[],codes=new Set();
      for(const feature of result.features){
        const p=feature?.properties;
        if(!p||p.date_end||!/^\d{2}$/.test(p.regionname)||!/^\d{3}$/.test(p.districtna))continue;
        const code=`${p.regionname}:${p.districtna}`;
        if(codes.has(code))continue;
        codes.add(code);
        try {
          const context=findDistrict(regions,p.regionname,p.districtna);
          contexts.set(context.district.id,context);
        } catch(error) { lookupErrors.push(error); }
      }
      if(!codes.size){if(preferredError?.status===502)throw preferredError;return resultEnvelope([],fetchedAt);}
      // The official administrative layer may overlap: test each bounded public
      // parcel context instead of treating administrative overlap as a boundary.
      if(codes.size>4)throw fail(422,'В этой области пересекаются несколько районов. Выберите нужный район или найдите участок по номеру.');
      const settled=await Promise.allSettled([...contexts.values()].map(context=>preferred?.district.id===context.district.id ? preferred : readParcels(context)));
      const results=settled.filter(result=>result.status==='fulfilled').map(result=>result.value);
      const errors=[...lookupErrors,...settled.filter(result=>result.status==='rejected').map(result=>result.reason)];
      const matches=results.filter(result=>result.candidates.length);
      if(!matches.length && errors.length)throw errors.find(error=>error?.status===502) || errors[0];
      const candidates=matches.flatMap(result=>result.candidates);
      if(candidates.length>10)throw fail(422,'Найдено несколько пересекающихся участков. Выберите район или найдите участок по номеру.');
      const district=matches[0]?.district || (contexts.size===1?results[0]?.district:contexts.get(preferredId)?.district);
      return resultEnvelope(candidates,fetchedAt,district);
    },
  };
}

export function installCadastre({ app, db, required, wrap, clientFactory = createCadastreClient }) {
  db.exec('CREATE TABLE IF NOT EXISTS cadastre_limits (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, until INTEGER NOT NULL, count INTEGER NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS cadastre_view_limits (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, until INTEGER NOT NULL, count INTEGER NOT NULL)');
  const client = clientFactory();
  const limitRequest = (req, res, view = false) => {
    const now = Date.now();
    const table = view ? 'cadastre_view_limits' : 'cadastre_limits';
    const limit = db.prepare(`INSERT INTO ${table} VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET count=CASE WHEN until<=? THEN 1 ELSE count+1 END, until=CASE WHEN until<=? THEN excluded.until ELSE until END RETURNING count, until`).get(req.user.id, now + 60_000, now, now);
    if (limit.count > (view ? 60 : 24)) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((limit.until - now) / 1000))));
      throw fail(429, 'Слишком много запросов к кадастру. Повторите через минуту.');
    }
    res.setHeader('Cache-Control', 'no-store');
  };
  app.get('/api/cadastre/search', required, wrap(async (req, res) => {
    const number = normalizeCadastreNumber(req.query.number);
    limitRequest(req, res);
    res.json(await client.search(number));
  }));
  app.get('/api/cadastre/identify', required, wrap(async (req, res) => {
    const point = normalizeCadastrePoint(req.query.latitude, req.query.longitude);
    limitRequest(req, res);
    const district = req.query.district === undefined ? undefined : normalizeCadastreDistrict(req.query.district);
    res.json(await client.identify(point.latitude, point.longitude, district));
  }));
  app.get('/api/cadastre/labels', required, wrap(async (req, res) => {
    const view = normalizeCadastreLabelView(req.query);
    limitRequest(req, res, true);
    res.json(await client.labels(view));
  }));

  app.get('/api/cadastre/regions', required, wrap(async (req, res) => {
    limitRequest(req,res,true);
    res.json(await client.regions());
  }));
  app.get('/api/cadastre/district', required, wrap(async (req, res) => {
    const district=normalizeCadastreDistrict(req.query.district);
    limitRequest(req,res,true);
    res.json(await client.district(district));
  }));

}
