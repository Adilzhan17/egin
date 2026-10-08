import { lookup } from 'node:dns/promises';
import { get } from 'node:https';
import { isIP } from 'node:net';

const fail = (status, message) => Object.assign(new Error(message), { status });
const providers = ['one-c', 'agrosignal', 'agrostream'];
const datasets = ['fields', 'operations', 'materials', 'harvest'];

// Outbound checks may only reach public IPv4 hosts over HTTPS. Resolve once,
// validate every answer and pin the connection to that address (no DNS rebinding).
export function publicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a,b,c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}
export function endpointURL(value) {
  if (typeof value !== 'string' || value.length > 1024) throw fail(400, 'Проверьте адрес сервиса');
  let u;
  try { u = new URL(value); } catch { throw fail(400, 'Укажите полный HTTPS-адрес сервиса'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.port ||
      !u.hostname.includes('.') || u.hostname.endsWith('.') ||
      /\.(localhost|local|internal|test|invalid)$/.test(u.hostname) ||
      (isIP(u.hostname.replace(/[\[\]]/g,'')) && !publicIPv4(u.hostname))) {
    throw fail(400, 'Нужен публичный HTTPS-адрес без паролей, параметров и нестандартного порта');
  }
  return u;
}
export function validateConfiguration(body) {
  if (!body || typeof body !== 'object' || Object.keys(body).some(k => !['account','endpoint','datasets','version'].includes(k)) ||
      typeof body.account !== 'string' || body.account.trim().length < 1 || body.account.length > 120 ||
      typeof body.endpoint !== 'string' || !Array.isArray(body.datasets) || !body.datasets.length ||
      body.datasets.length > datasets.length || !body.datasets.every(k => datasets.includes(k)) ||
      !Number.isSafeInteger(body.version) || body.version < 0) throw fail(400, 'Проверьте организацию и выбранные данные');
  return {account:body.account.trim(), endpoint:body.endpoint.trim() ? endpointURL(body.endpoint.trim()).href : '', datasets:[...new Set(body.datasets)]};
}
export function serviceCollections(body) {
  let data;
  try { data = JSON.parse(body); } catch { throw fail(422, 'Сервис вернул не JSON OData. Проверьте адрес публикации'); }
  const list = data?.value ?? data?.d?.EntitySets;
  if (!Array.isArray(list) || list.length > 5000 || !list.every(x => typeof x === 'string' || (x && typeof x.name === 'string' && typeof x.url === 'string'))) {
    throw fail(422, 'Ответ не похож на каталог OData. Проверьте адрес standard.odata');
  }
  return [...new Set(list.map(x => typeof x === 'string' ? x : x.name))].filter(x => x.length > 0 && x.length <= 200).slice(0,100);
}
export async function checkOData({ endpoint, username, password }, { resolve = lookup, request = get } = {}) {
  const u = endpointURL(endpoint);
  if (!/\/odata\/standard\.odata\/?$/i.test(u.pathname)) throw fail(400, 'Адрес должен заканчиваться на /odata/standard.odata/');
  u.pathname = u.pathname.replace(/\/?$/, '/');
  u.searchParams.set('$format','json');
  const signal = AbortSignal.timeout(12000);
  let timer;
  try {
    const answers = await Promise.race([
      resolve(u.hostname, {all:true, family:4}),
      new Promise((_, reject) => { timer = setTimeout(() => reject(fail(504,'Сервис не ответил вовремя')), 4000); }),
    ]);
    clearTimeout(timer);
    if (!answers.length || answers.some(a => !publicIPv4(a.address))) throw fail(400, 'Сервис должен быть доступен по публичному адресу. Локальные сети не поддерживаются');
    const address = answers[0].address;
    const body = await new Promise((resolve, reject) => {
      const outgoing = request(u, {
        agent:false, signal,
        lookup:(_host, options, cb) => options.all ? cb(null,[{address,family:4}]) : cb(null,address,4),
        headers:{Accept:'application/json', 'Accept-Encoding':'identity', Authorization:'Basic '+Buffer.from(username+':'+password).toString('base64')},
      }, response => {
        const status = response.statusCode;
        if (status !== 200) {
          response.destroy();
          return reject(fail(status === 401 || status === 403 ? 422 : 502,
            status === 401 || status === 403 ? '1С отклонила доступ. Проверьте пользователя, пароль и права OData' :
            status >= 300 && status < 400 ? 'Сервис перенаправляет запрос. Укажите конечный адрес публикации' : 'Публикация 1С недоступна. Проверьте адрес и настройки сервера'));
        }
        let size = 0;
        const chunks = [];
        response.on('data', chunk => {
          size += chunk.length;
          if (size > 1024*1024) { response.destroy(); reject(fail(422,'Каталог сервиса слишком большой')); }
          else chunks.push(chunk);
        });
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        response.on('error', reject);
      });
      outgoing.on('error', reject);
    });
    return serviceCollections(body);
  } catch (e) {
    if (e.status) throw e;
    throw fail(502,'Не удалось проверить 1С. Проверьте HTTPS-сертификат, адрес и доступность сервера');
  } finally { clearTimeout(timer); }
}

export function installIntegrations({ app, db, required, wrap, probe = checkOData }) {
  db.exec(`CREATE TABLE IF NOT EXISTS integrations(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL, config TEXT NOT NULL, version INTEGER NOT NULL, updated INTEGER NOT NULL, checked INTEGER, collections TEXT, PRIMARY KEY(user_id,provider));
    CREATE TABLE IF NOT EXISTS integration_limits(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, window INTEGER NOT NULL, count INTEGER NOT NULL);`);
  const record = (user, provider) => db.prepare('SELECT * FROM integrations WHERE user_id=? AND provider=?').get(user,provider);
  const expose = r => ({provider:r.provider,...JSON.parse(r.config),version:r.version,updated:r.updated,checkedAt:r.checked,collections:r.collections?JSON.parse(r.collections):[],status:r.checked?'access_checked':'draft',syncEnabled:false});
  function provider(req) { if (!providers.includes(req.params.provider)) throw fail(404,'Сервис не найден'); return req.params.provider; }
  app.get('/api/integrations',required,(req,res) => res.json({connections:db.prepare('SELECT * FROM integrations WHERE user_id=? ORDER BY provider').all(req.user.id).map(expose)}));
  app.put('/api/integrations/:provider',required,(req,res) => {
    const p = provider(req), config = validateConfiguration(req.body);
    // Blue/green slots share SQLite: keep the version check and write atomic.
    db.exec('BEGIN IMMEDIATE');
    let saved;
    try {
      const old = record(req.user.id,p);
      if ((old?.version || 0) !== req.body.version) throw fail(409,'Настройки изменены на другом устройстве. Обновите страницу');
      saved = db.prepare('INSERT INTO integrations VALUES(?,?,?,?,?,NULL,NULL) ON CONFLICT(user_id,provider) DO UPDATE SET config=excluded.config,version=excluded.version,updated=excluded.updated,checked=NULL,collections=NULL RETURNING *')
        .get(req.user.id,p,JSON.stringify(config),req.body.version+1,Date.now());
      db.exec('COMMIT');
    } catch(e) { db.exec('ROLLBACK'); throw e; }
    res.json(expose(saved));
  });
  app.delete('/api/integrations/:provider',required,(req,res) => {
    const p = provider(req), old = record(req.user.id,p);
    if (old && old.version !== req.body?.version) throw fail(409,'Настройки изменены. Обновите страницу');
    if (old && !db.prepare('DELETE FROM integrations WHERE user_id=? AND provider=? AND version=?').run(req.user.id,p,req.body.version).changes) throw fail(409,'Настройки изменены. Обновите страницу');
    res.json({ok:true});
  });
  app.post('/api/integrations/:provider/check',required,wrap(async(req,res) => {
    const p = provider(req);
    if (p !== 'one-c') throw fail(409,'Проверка станет доступна после согласования API с поставщиком');
    const old = record(req.user.id,p);
    if (!old) throw fail(400,'Сначала сохраните параметры подключения');
    if (old.version !== req.body?.version) throw fail(409,'Настройки изменены. Обновите страницу');
    const {username,password} = req.body;
    if (typeof username !== 'string' || !username.trim() || username.length>200 || /[:\r\n]/.test(username) || typeof password !== 'string' || !password || password.length>1024) throw fail(400,'Введите пользователя и пароль 1С');
    const now = Date.now();
    const limit = db.prepare('INSERT INTO integration_limits VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET window=CASE WHEN window<? THEN excluded.window ELSE window END,count=CASE WHEN window<? THEN 1 ELSE count+1 END RETURNING count').get(req.user.id,now,now-600000,now-600000);
    if (limit.count>10) throw fail(429,'Не более 10 проверок за 10 минут. Повторите позже');
    // A failed recheck must not leave a previous successful status behind.
    db.prepare('UPDATE integrations SET checked=NULL,collections=NULL WHERE user_id=? AND provider=? AND version=?').run(req.user.id,p,old.version);
    const collections = await probe({endpoint:JSON.parse(old.config).endpoint, username, password});
    const result = db.prepare('UPDATE integrations SET checked=?,collections=?,version=version+1 WHERE user_id=? AND provider=? AND version=? AND config=? AND updated=? RETURNING *').get(Date.now(),JSON.stringify(collections),req.user.id,p,old.version,old.config,old.updated);
    if (!result) throw fail(409,'Настройки изменились во время проверки. Повторите её');
    res.json(expose(result));
  }));
}
