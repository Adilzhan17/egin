import https from 'node:https';
import tls from 'node:tls';
import { readFileSync } from 'node:fs';
import proj4 from 'proj4';
import wellknown from 'wellknown';
import { validateLand } from './land.mjs';

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
  if (parsed?.type !== 'Polygon' || parsed.coordinates.length !== 1) throw fail(422, 'Участок содержит внутренние границы. Такой контур пока не поддерживается.');
  const ring = parsed.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 2000) throw fail(422, 'Контур должен содержать от 4 до 2000 точек.');
  if (ring.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))) throw fail(422, 'Кадастровая карта вернула некорректные координаты.');
  if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw fail(422, 'Контур участка не замкнут.');
  const projection = `+proj=utm +zone=${srid - 32600} +datum=WGS84 +units=m +no_defs`;
  let coordinates;
  try { coordinates = ring.map(p => proj4(projection, 'EPSG:4326', p)); }
  catch { throw fail(422, 'Не удалось преобразовать координаты участка.'); }
  if (coordinates.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat) || lng < 45 || lng > 88 || lat < 39 || lat > 57)) throw fail(422, 'Координаты участка не соответствуют территории Казахстана.');
  const boundary = { type: 'Polygon', coordinates: [coordinates] };
  try { validateLand({ boundary }); }
  catch (error) {
    if (error?.status === 400) throw fail(422, error.message);
    throw error;
  }
  return boundary;
}

export function boundaryAreaHa(boundary) {
  const ring = boundary.coordinates[0], rad = Math.PI / 180;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += (ring[i+1][0] - ring[i][0]) * rad * (2 + Math.sin(ring[i][1] * rad) + Math.sin(ring[i+1][1] * rad));
  const area = Math.abs(sum) * 6371008.8 ** 2 / 2 / 10000;
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

export function normalizeCadastreLabelView(input = {}) {
  const integer = value => typeof value === 'number' && Number.isSafeInteger(value) ? value : typeof value === 'string' && /^\d{1,5}$/.test(value) ? Number(value) : NaN;
  const district = integer(input.district), zoom = integer(input.zoom);
  if (district < 1 || district > 10000 || !Number.isFinite(district) || zoom < 17 || zoom > 19 || !Number.isFinite(zoom)) throw fail(400, 'Для кадастровых номеров выберите район и приблизьте карту.');
  const sw = normalizeCadastrePoint(input.south, input.west), ne = normalizeCadastrePoint(input.north, input.east);
  if (ne.longitude <= sw.longitude || ne.latitude <= sw.latitude || ne.longitude - sw.longitude > .02500000001 || ne.latitude - sw.latitude > .02500000001) throw fail(400, 'Приблизьте карту, чтобы увидеть кадастровые номера.');
  return { district, zoom, west: sw.longitude, south: sw.latitude, east: ne.longitude, north: ne.latitude };
}

function containsPoint(boundary, [x, y]) {
  const ring = boundary.coordinates[0]; let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    // Include a tap exactly on a parcel boundary; never select a nearby parcel.
    const length = Math.hypot(xj - xi, yj - yi);
    if (length && Math.abs((x - xi) * (yj - yi) - (y - yi) * (xj - xi)) / length < 1e-9 && x >= Math.min(xi, xj) - 1e-9 && x <= Math.max(xi, xj) + 1e-9 && y >= Math.min(yi, yj) - 1e-9 && y <= Math.max(yi, yj) + 1e-9) return true;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

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
  function resultEnvelope(candidates, fetchedAt, district) {
    return { candidates, source: 'public-map', sourceUrl: SOURCE, fetchedAt, ownershipVerified: false,
      ...(district && Number.isSafeInteger(district.id) && district.id > 0 ? { mapDistrict: { id: district.id, code: district.code, srid: district.srs } } : {}) };
  }
  function rowsFrom(result) {
    if (!result || typeof result !== 'object' || !Array.isArray(result.lands) || result.lands.length > 10) throw fail(502, 'Формат ответа кадастровой карты изменился.');
    return result.lands;
  }
  return {
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
      const matches = regions.flatMap(region => (Array.isArray(region?.districts) ? region.districts : []).filter(d => d?.id === view.district).map(district => ({region,district})));
      if (matches.length !== 1) throw fail(422, 'Район кадастровой карты не найден. Выберите участок ещё раз.');
      const {region,district} = findDistrict(regions, matches[0].region.code, matches[0].district.code);
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
    async identify(latitude, longitude) {
      const point = normalizeCadastrePoint(latitude, longitude), reader = readerFactory(), signal = AbortSignal.timeout(20_000);
      const regions = await getCatalog(reader, signal);
      const [x, y] = proj4('EPSG:4326', 'EPSG:3857', [point.longitude, point.latitude]);
      // Same public WFS layer as the official map, limited to a 10cm square.
      // Ask only for administrative codes, never owner or document attributes.
      const params = new URLSearchParams({ service: 'WFS', version: '1.1.0', request: 'GetFeature', typename: 'egkn:districts',
        outputFormat: 'application/json', srsname: 'EPSG:3857', bbox: [x - .05, y - .05, x + .05, y + .05, 'EPSG:3857'].join(','),
        maxFeatures: '10', propertyName: 'regionname,districtna,srs,date_end' });
      const result = await reader(`/geoserver/wfs?${params}`, { signal });
      if (!Array.isArray(result?.features) || result.features.length > 10 || Number(result.totalFeatures) > 10) throw fail(502, 'Не удалось определить район выбранной точки. Попробуйте поиск по номеру.');
      const codes = new Map();
      for (const feature of result.features) {
        const p = feature?.properties;
        if (!p || p.date_end || !/^\d{2}$/.test(p.regionname) || !/^\d{3}$/.test(p.districtna)) continue;
        codes.set(`${p.regionname}:${p.districtna}`, p);
      }
      const fetchedAt = new Date(now()).toISOString();
      if (!codes.size) return resultEnvelope([], fetchedAt);
      if (codes.size !== 1) throw fail(422, 'Точка на границе районов. Нажмите ближе к середине участка или найдите его по номеру.');
      const code = [...codes.values()][0];
      const { region, district } = findDistrict(regions, code.regionname, code.districtna);
      await reader(`/map/district?code=${district.code}`, { method: 'PUT', signal });
      const [east, north] = proj4('EPSG:4326', `+proj=utm +zone=${district.srs - 32600} +datum=WGS84 +units=m +no_defs`, [point.longitude, point.latitude]);
      const query = new URLSearchParams({ x: String(east), y: String(north), layers: 'lands', lang: 'ru' });
      const rows = rowsFrom(await reader(`/map/get?${query}`, { signal }));
      const candidates = [], seen = new Set();
      for (const row of rows) {
        // Unsupported cadastral identifiers are not selectable, even if another
        // map layer accidentally starts returning them.
        if (typeof row?.properties?.kad_nomer !== 'string' || !/^[\d\s:-]+$/.test(row.properties.kad_nomer)) continue;
        let number;
        try { number = normalizeCadastreNumber(row.properties.kad_nomer); } catch { continue; }
        if (!number.startsWith(`${region.code}${district.code}`)) continue;
        const parcel = candidate(row, region, district, fetchedAt);
        if (!containsPoint(parcel.boundary, [point.longitude, point.latitude])) continue;
        if (seen.has(number)) throw fail(422, 'Карта вернула несколько контуров с одним номером. Уточните сведения на официальной карте.');
        seen.add(number); candidates.push(parcel);
      }
      return resultEnvelope(candidates, fetchedAt, district);
    },
  };
}

export function installCadastre({ app, db, required, wrap, clientFactory = createCadastreClient }) {
  db.exec('CREATE TABLE IF NOT EXISTS cadastre_limits (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, until INTEGER NOT NULL, count INTEGER NOT NULL)');
  const client = clientFactory();
  const limitRequest = (req, res) => {
    const now = Date.now();
    const limit = db.prepare(`INSERT INTO cadastre_limits VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET count=CASE WHEN until<=? THEN 1 ELSE count+1 END, until=CASE WHEN until<=? THEN excluded.until ELSE until END RETURNING count, until`).get(req.user.id, now + 60_000, now, now);
    if (limit.count > 24) {
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
    res.json(await client.identify(point.latitude, point.longitude));
  }));
  app.get('/api/cadastre/labels', required, wrap(async (req, res) => {
    const view = normalizeCadastreLabelView(req.query);
    limitRequest(req, res);
    res.json(await client.labels(view));
  }));

}
