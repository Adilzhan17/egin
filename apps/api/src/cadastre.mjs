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
    if (!path.startsWith('/map/') || /[\r\n]/.test(path)) return reject(fail(400, 'Некорректный запрос карты.'));
    const req = request(`${BASE}${path}`, {
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

export function createCadastreClient({ readerFactory = createCadastreReader, now = Date.now } = {}) {
  let catalog, catalogAt = 0;
  return {
    async search(input) {
      const number = normalizeCadastreNumber(input), reader = readerFactory();
      const signal = AbortSignal.timeout(20_000);
      if (!catalog || now() - catalogAt > 86_400_000) {
        const fetched = await reader('/map/districts?lang=ru', { signal });
        if (!Array.isArray(fetched) || fetched.length > 100) throw fail(502, 'Не удалось получить список регионов кадастровой карты.');
        catalog = fetched; catalogAt = now();
      }
      const region = catalog.find(r => r?.code === number.slice(0, 2));
      const districts = (Array.isArray(region?.districts) ? region.districts : []).filter(d => d?.code === number.slice(2, 5));
      if (districts.length !== 1) throw fail(422, 'Регион или район из кадастрового номера не найден. Проверьте номер на официальной карте.');
      const district = districts[0];
      if (!/^\d{3}$/.test(district.code)) throw fail(502, 'Карта вернула неподдерживаемый код района.');
      await reader(`/map/district?code=${district.code}`, { method: 'PUT', signal });
      const params = new URLSearchParams({ searchText: number, offset: '0', limit: '10', lang: 'ru', layers: '' });
      const result = await reader(`/map/search?${params}`, { signal });
      if (!result || typeof result !== 'object' || !Array.isArray(result.lands) || result.lands.length > 10) throw fail(502, 'Формат ответа кадастровой карты изменился.');
      const fetchedAt = new Date(now()).toISOString();
      const rows = result.lands.filter(row => typeof row?.properties?.kad_nomer === 'string' && row.properties.kad_nomer.replace(/[\s:-]/g, '') === number);
      if (rows.length > 1) throw fail(422, 'Карта вернула несколько участков с этим номером. Уточните сведения на официальной карте.');
      const candidates = rows.map(row => {
        const boundary = parcelBoundary(row.geometry, district.srs);
        const p = row.properties;
        const registeredAreaHa = typeof p.squ === 'number' && Number.isFinite(p.squ) && p.squ > 0 ? p.squ / 10000 : undefined;
        return { cadastralNumber: number, region: String(region.nameRu || region.name || '').slice(0, 150), district: String(district.nameRu || '').slice(0, 150),
          boundary, areaHa: boundaryAreaHa(boundary), ...(registeredAreaHa ? { registeredAreaHa } : {}), sourceSrid: district.srs,
          source: 'public-map', sourceUrl: SOURCE, fetchedAt, ownershipVerified: false };
      });
      return { candidates, source: 'public-map', sourceUrl: SOURCE, fetchedAt, ownershipVerified: false };
    },
  };
}

export function installCadastre({ app, db, required, wrap, clientFactory = createCadastreClient }) {
  db.exec('CREATE TABLE IF NOT EXISTS cadastre_limits (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, until INTEGER NOT NULL, count INTEGER NOT NULL)');
  const client = clientFactory();
  app.get('/api/cadastre/search', required, wrap(async (req, res) => {
    const number = normalizeCadastreNumber(req.query.number);
    const now = Date.now();
    const limit = db.prepare(`INSERT INTO cadastre_limits VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET count=CASE WHEN until<=? THEN 1 ELSE count+1 END, until=CASE WHEN until<=? THEN excluded.until ELSE until END RETURNING count`).get(req.user.id, now + 60_000, now, now);
    if (limit.count > 6) throw fail(429, 'Слишком много запросов к кадастру. Повторите через минуту.');
    res.setHeader('Cache-Control', 'no-store');
    res.json(await client.search(number));
  }));
}
