import https from 'node:https';
import { cadastreTlsOptions } from './cadastre.mjs';
import { projectedTileBbox, warpCadastreTile, rasterNeedsBackground, compositeBasemap } from './cadastre-raster.mjs';

const HALF_WORLD = 20037508.342789244;
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const MAX_BYTES = 1024 * 1024;
const fail = (status, message) => Object.assign(new Error(message), { status });

export function cadastreTileParameters(z, x, y, district, sourceSrid) {
  const integer = (v, min, max) => {
    if (typeof v !== 'string' || !/^\d{1,7}$/.test(v)) throw fail(400, 'Некорректный фрагмент кадастровой карты.');
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw fail(400, 'Некорректный фрагмент кадастровой карты.');
    return n;
  };
  z = integer(z, 14, 20); x = integer(x, 0, 2 ** z - 1); y = integer(y, 0, 2 ** z - 1);
  district = integer(district, 1, 10000);
  const srid = integer(sourceSrid, 32639, 32645);
  const size = 2 * HALF_WORLD / 2 ** z;
  const bbox = [x * size - HALF_WORLD, HALF_WORLD - (y + 1) * size, (x + 1) * size - HALF_WORLD, HALF_WORLD - y * size];
  const west = bbox[0] / HALF_WORLD * 180, east = bbox[2] / HALF_WORLD * 180;
  const latitude = value => Math.atan(Math.sinh(value / HALF_WORLD * Math.PI)) * 180 / Math.PI;
  if (east < 45 || west > 88 || latitude(bbox[3]) < 39 || latitude(bbox[1]) > 57) throw fail(400, 'Этот фрагмент находится вне территории Казахстана.');
  const sourceBbox = projectedTileBbox(bbox, srid);
  const params = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: 'egkn:u_view', STYLES: '', SRS: `EPSG:${srid}`, projection: `EPSG:${srid}`, BBOX: sourceBbox.join(','), WIDTH: '256', HEIGHT: '256', FORMAT: 'image/png', TRANSPARENT: 'true', VIEWPARAMS: `district_id:${district}` });
  return { bbox, sourceBbox, srid, key: `${district}/${srid}/${z}/${x}/${y}`, url: `https://map.gov4c.kz/geoserver/egkn/wms?${params}` };
}

// Public overview imagery used by the EGKN map. No third-party API keys.
export function cadastreBasemapParameters(z, x, y, layer) {
  const integer = (value, min, max) => {
    if (typeof value !== 'string' || !/^\d{1,7}$/.test(value)) throw fail(400, 'Некорректный фрагмент спутниковой карты.');
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw fail(400, 'Некорректный фрагмент спутниковой карты.');
    return n;
  };
  if (layer !== 'satellite') throw fail(400, 'Неизвестная подложка карты.');
  z = integer(z, 4, 19); x = integer(x, 0, 2 ** z - 1); y = integer(y, 0, 2 ** z - 1);
  const size = 2 * HALF_WORLD / 2 ** z;
  const bbox = [x * size - HALF_WORLD, HALF_WORLD - (y + 1) * size, (x + 1) * size - HALF_WORLD, HALF_WORLD - y * size];
  const latitude = value => Math.atan(Math.sinh(value / HALF_WORLD * Math.PI)) * 180 / Math.PI;
  if (bbox[2] / HALF_WORLD * 180 < 45 || bbox[0] / HALF_WORLD * 180 > 88 || latitude(bbox[3]) < 39 || latitude(bbox[1]) > 57) throw fail(400, 'Этот фрагмент находится вне территории Казахстана.');
  const params = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: 'egkn:basemap.For_all_Mosaic_KZ', STYLES: '', SRS: 'EPSG:3857', BBOX: bbox.join(','), WIDTH: '256', HEIGHT: '256', FORMAT: 'image/png' });
  const fallbackUrl = `https://map.gov4c.kz/geoserver/egkn/wms?${params}`;
  params.set('LAYERS', 'kz-aero'); params.set('TRANSPARENT', 'true');
  return { bbox, basemap: true, key: `satellite-v2/${z}/${x}/${y}`, url: z >= 13 ? `https://map.gov.kz/geoserver/wms?${params}` : fallbackUrl, ...(z >= 13 ? { fallbackUrl } : {}) };
}

export function createCadastreTileReader({ request = https.request } = {}) {
  const readPng = url => new Promise((resolve, reject) => {
    const req = request(url, {
      ...cadastreTlsOptions, agent: false, method: 'GET', signal: AbortSignal.timeout(8000),
      headers: { Accept: 'image/png', 'Accept-Encoding': 'identity', 'User-Agent': 'EGIN public cadastral outlines', Referer: 'https://map.gov4c.kz/egkn/' },
    }, response => {
      if (response.statusCode !== 200 || !/^image\/png(?:;|$)/i.test(response.headers['content-type'] || '')) {
        response.resume(); reject(fail(502, 'Не удалось загрузить границы участков.')); return;
      }
      let bytes = 0; const chunks = [];
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) req.destroy();
        else chunks.push(chunk);
      });
      response.on('error', () => reject(fail(502, 'Загрузка границ участков прервана.')));
      response.on('end', () => {
        if (bytes > MAX_BYTES) return;
        const image = Buffer.concat(chunks);
        if (image.length < 33 || !image.subarray(0, 8).equals(PNG) || image.toString('ascii', 12, 16) !== 'IHDR' || image.readUInt32BE(16) !== 256 || image.readUInt32BE(20) !== 256) {
          reject(fail(502, 'Кадастровая карта вернула неподдерживаемый ответ.')); return;
        }
        resolve(image);
      });
    });
    req.on('error', () => reject(fail(502, 'Кадастровая карта временно недоступна.')));
    req.setTimeout(8000, () => req.destroy());
    req.end();
  });
  return async parameters => {
    if (parameters.basemap) {
      let foreground;
      try { foreground = await readPng(parameters.url); }
      catch (error) { if (!parameters.fallbackUrl) throw error; return readPng(parameters.fallbackUrl); }
      if (!parameters.fallbackUrl) return foreground;
      try {
        if (!rasterNeedsBackground(foreground)) return foreground;
        return compositeBasemap(foreground, await readPng(parameters.fallbackUrl));
      } catch { return readPng(parameters.fallbackUrl); }
    }
    const image = await readPng(parameters.url);
    try { return warpCadastreTile(image, parameters); }
    catch { throw fail(502, 'Не удалось преобразовать границы участков.'); }
  };

}

export function createCadastreTileCache({ read = createCadastreTileReader(), now = Date.now } = {}) {
  const cache = new Map(), pending = new Map();
  return async parameters => {
    const previous = cache.get(parameters.key);
    if (previous && previous.expires > now()) {
      cache.delete(parameters.key); cache.set(parameters.key, previous);
      return previous.image;
    }
    cache.delete(parameters.key);
    if (pending.has(parameters.key)) return pending.get(parameters.key);
    if (pending.size >= 32) throw fail(503, 'Карта загружена запросами. Повторите через несколько секунд.');
    const load = (async () => {
      const image = await read(parameters);
      cache.set(parameters.key, { image, expires: now() + 300000 });
      while (cache.size > 128) cache.delete(cache.keys().next().value);
      return image;
    })();
    pending.set(parameters.key, load);
    try { return await load; } finally { pending.delete(parameters.key); }
  };
}

export function installCadastreTiles({ app, db, required, wrap, readTile = createCadastreTileCache() }) {
  db.exec('CREATE TABLE IF NOT EXISTS cadastre_tile_limits (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, until INTEGER NOT NULL, count INTEGER NOT NULL)');
  const serve = async (req, res, parameters) => {
    const now = Date.now();
    const limit = db.prepare(`INSERT INTO cadastre_tile_limits VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET count=CASE WHEN until<=? THEN 1 ELSE count+1 END, until=CASE WHEN until<=? THEN excluded.until ELSE until END RETURNING count`).get(req.user.id, now + 60000, now, now);
    if (limit.count > 240) { res.setHeader('Retry-After', '60'); throw fail(429, 'Слишком много запросов к карте. Повторите через минуту.'); }
    const image = await readTile(parameters);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type('png').send(image);
  };
  app.get('/api/cadastre/tiles/:z/:x/:y.png', required, wrap((req, res) => serve(req, res, cadastreTileParameters(req.params.z, req.params.x, req.params.y, req.query.district, req.query.srid))));
  app.get('/api/cadastre/basemap/:z/:x/:y.png', required, wrap((req, res) => serve(req, res, cadastreBasemapParameters(req.params.z, req.params.x, req.params.y, req.query.layer))));
}
