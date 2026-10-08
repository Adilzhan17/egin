import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, linkSync, unlinkSync } from 'node:fs';
import { normalizeOneCEndpoint } from './one-c-transport.mjs';

const fail = (status, message) => Object.assign(new Error(message), { status });
const hash = value => createHash('sha256').update(value).digest('hex');
const schedules = [0, 60, 360, 1440];
const crops = { wheat: 'wheat', 'пшеница': 'wheat', tomato: 'tomato', 'томат': 'tomato', 'томаты': 'tomato', apple: 'apple', 'яблоня': 'apple', 'яблоко': 'apple', sunflower: 'sunflower', 'подсолнечник': 'sunflower' };
const json = value => JSON.stringify(value);
const parse = value => value ? JSON.parse(value) : null;
const string = (value, limit) => typeof value === 'string' && value.length <= limit;
const safeError = error => error?.status && typeof error.message === 'string' ? error.message.slice(0, 300) : 'Не удалось получить данные 1С. Проверьте доступ и повторите.';

// The key lives in the private data volume, separately from the database and its backups.
// AES-GCM associated data prevents moving credentials between owners.
function credentialStore(dataDir) {
  const path = `${dataDir}/one-c.key`;
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, randomBytes(32), { flag: 'wx', mode: 0o600 });
  try { linkSync(temporary, path); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  finally { unlinkSync(temporary); }
  const key = readFileSync(path);
  if (key.length !== 32) throw new Error('Invalid 1C credential encryption key');
  return {
    encrypt(user, password) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(user));
      const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
      return json({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') });
    },
    decrypt(user, value) {
      const stored = parse(value), decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(stored.iv, 'base64'));
      decipher.setAAD(Buffer.from(user));
      decipher.setAuthTag(Buffer.from(stored.tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(stored.data, 'base64')), decipher.final()]).toString('utf8');
    },
  };
}

export function installOneC({ app, db, dataDir, required, wrap, validateRecord, clientFactory, scheduleIntervalMs = 60000, startScheduler = true }) {
  const secrets = credentialStore(dataDir);
  db.exec(`
    CREATE TABLE IF NOT EXISTS one_c_connections (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL, username TEXT NOT NULL, secret TEXT NOT NULL,
      version INTEGER NOT NULL, status TEXT NOT NULL, checked_at INTEGER,
      last_error TEXT, schema_json TEXT NOT NULL, mapping TEXT,
      schedule_minutes INTEGER NOT NULL DEFAULT 0, last_run_at INTEGER,
      next_run_at INTEGER, lease TEXT, lease_until INTEGER
    );
    CREATE TABLE IF NOT EXISTS one_c_sources (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_key TEXT NOT NULL, record_id TEXT NOT NULL, imported_version INTEGER NOT NULL,
      source_endpoint TEXT, source_id TEXT,
      PRIMARY KEY(user_id, source_key)
    );
    CREATE TABLE IF NOT EXISTS one_c_previews (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      connection_version INTEGER NOT NULL, expires INTEGER NOT NULL, rows_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS one_c_runs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created INTEGER NOT NULL, result TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS one_c_runs_owner ON one_c_runs(user_id, created);
    CREATE TABLE IF NOT EXISTS one_c_limits (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      until INTEGER NOT NULL, count INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS one_c_revisions (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, n INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO one_c_revisions SELECT user_id,version FROM one_c_connections;
  `);
  const get = user => db.prepare('SELECT * FROM one_c_connections WHERE user_id=?').get(user);
  const revision = user => db.prepare('SELECT n FROM one_c_revisions WHERE user_id=?').get(user)?.n || 0;
  const nextRevision = user => db.prepare('INSERT INTO one_c_revisions VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET n=n+1 RETURNING n').get(user).n;
  const record = (user, id) => db.prepare('SELECT * FROM records WHERE user_id=? AND id=?').get(user, id);
  function version(connection, expected) {
    if (!Number.isSafeInteger(expected) || expected < 0) throw fail(400, 'Передайте версию настроек');
    if ((connection?.version || 0) !== expected) throw fail(409, 'Настройки изменились. Обновите страницу.');
  }
  function connected(user, expected) {
    const connection = get(user);
    if (!connection) throw fail(409, 'Сначала подключите 1С');
    if (expected !== undefined) version(connection, expected);
    return connection;
  }
  function view(user) {
    const c = get(user);
    return {
      connection: c ? { endpoint: c.endpoint, username: c.username, version: c.version, status: c.status,
        checkedAt: c.checked_at, lastError: c.last_error, collections: parse(c.schema_json).map(({ name, title }) => ({ name, ...(title ? { title } : {}) })),
        mapping: parse(c.mapping), scheduleMinutes: c.schedule_minutes, lastRunAt: c.last_run_at } : null,
      runs: db.prepare('SELECT result FROM one_c_runs WHERE user_id=? ORDER BY created DESC LIMIT 20').all(user).map(r => parse(r.result)),
    };
  }
  function limit(user) {
    const now = Date.now();
    const item = db.prepare(`INSERT INTO one_c_limits VALUES(?,?,1) ON CONFLICT(user_id) DO UPDATE SET
      until=CASE WHEN until<? THEN excluded.until ELSE until END,
      count=CASE WHEN until<? THEN 1 ELSE count+1 END RETURNING count`).get(user, now + 60000, now, now);
    if (item.count > 12) throw fail(429, 'Слишком много обращений к 1С. Повторите через минуту.');
  }
  function client(c) { return clientFactory({ endpoint: c.endpoint, username: c.username, password: secrets.decrypt(c.user_id, c.secret) }); }
  function rememberError(c, error) {
    db.prepare("UPDATE one_c_connections SET status='error',last_error=? WHERE user_id=? AND version=?").run(safeError(error), c.user_id, c.version);
  }
  function clearError(c) {
    db.prepare("UPDATE one_c_connections SET status='connected',last_error=NULL,checked_at=? WHERE user_id=? AND version=?").run(Date.now(), c.user_id, c.version);
  }
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function saveRun(user, run) {
    db.prepare('INSERT INTO one_c_runs VALUES(?,?,?,?)').run(run.id, user, run.created, json(run));
    db.prepare('DELETE FROM one_c_runs WHERE user_id=? AND id NOT IN (SELECT id FROM one_c_runs WHERE user_id=? ORDER BY created DESC LIMIT 50)').run(user, user);
    return run;
  }
  const newRun = () => ({ id: randomUUID(), created: Date.now(), status: 'success', createdCount: 0, updatedCount: 0, unchangedCount: 0, skippedCount: 0, issues: [] });
  function collection(c, name) {
    const item = parse(c.schema_json).find(x => x.name === name);
    if (!item) throw fail(400, 'Выберите коллекцию из опубликованных в 1С');
    return item;
  }
  function validateMapping(c, mapping) {
    if (!mapping || !['field', 'entry'].includes(mapping.kind) || !mapping.fields || typeof mapping.fields !== 'object' || Array.isArray(mapping.fields)) throw fail(400, 'Настройте сопоставление данных');
    const schema = collection(c, mapping.collection), names = new Set(schema.properties.map(p => p.name));
    const allowed = mapping.kind === 'field' ? ['name', 'area', 'latitude', 'longitude', 'crop'] : ['title', 'text', 'date', 'fieldId'];
    if (!names.has(mapping.id)) throw fail(400, 'Выберите уникальный идентификатор записи 1С');
    const fields = {};
    for (const [key, value] of Object.entries(mapping.fields)) {
      if (!allowed.includes(key) || !names.has(value)) throw fail(400, 'Сопоставление содержит неизвестное свойство');
      fields[key] = value;
    }
    for (const key of mapping.kind === 'field' ? ['name', 'area', 'latitude', 'longitude'] : ['title', 'date']) if (!fields[key]) throw fail(400, `Не сопоставлено обязательное поле: ${key}`);
    if (mapping.cropDefault !== undefined && !['wheat', 'tomato', 'apple', 'sunflower'].includes(mapping.cropDefault)) throw fail(400, 'Выберите поддерживаемую культуру');
    if (mapping.kind === 'field' && !fields.crop && !mapping.cropDefault) throw fail(400, 'Сопоставьте культуру или явно выберите её для импорта');
    if (mapping.areaUnit !== undefined && !['ha', 'm2'].includes(mapping.areaUnit)) throw fail(400, 'Неизвестная единица площади');
    return { kind: mapping.kind, collection: schema.name, id: mapping.id, fields,
      ...(mapping.cropDefault ? { cropDefault: mapping.cropDefault } : {}), ...(mapping.kind === 'field' ? { areaUnit: mapping.areaUnit || 'ha' } : {}) };
  }
  function sourceKey(c, m, id) { return hash(json([c.endpoint, m.collection, m.kind, id])); }
  function convert(c, m, row, fieldReferences) {
    const value = name => row[m.fields[name]];
    const numeric = name => {
      const v = value(name);
      if (!(typeof v === 'number' || (typeof v === 'string' && /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(v.trim())))) throw fail(400, `Не заполнено число: ${name}`);
      const n = typeof v === 'number' ? v : Number(v.trim().replace(',', '.'));
      if (!Number.isFinite(n)) throw fail(400, `Некорректное число: ${name}`);
      return n;
    };
    const text = name => {
      const v = value(name);
      if (v === null || v === undefined) return '';
      if (typeof v !== 'string') throw fail(400, `Ожидается текст: ${name}`);
      return v.trim();
    };
    if (row.DeletionMark === true) throw fail(400, 'Запись помечена на удаление в 1С');
    if (m.kind === 'field') {
      const crop = m.fields.crop ? crops[text('crop').toLowerCase()] : m.cropDefault;
      if (!crop) throw fail(400, 'Культура не распознана. Исправьте сопоставление.');
      return { name: text('name'), area: numeric('area') / (m.areaUnit === 'm2' ? 10000 : 1), latitude: numeric('latitude'), longitude: numeric('longitude'), crop };
    }
    const rawDate = text('date'), odataDate = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(rawDate);
    const date = odataDate && Number.isFinite(new Date(Number(odataDate[1])).getTime()) ? new Date(Number(odataDate[1])).toISOString().slice(0, 10) : rawDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw fail(400, 'Некорректная дата операции');
    let fieldId = '';
    if (m.fields.fieldId && value('fieldId') != null && value('fieldId') !== '') {
      if (typeof value('fieldId') !== 'string' && !(typeof value('fieldId') === 'number' && Number.isSafeInteger(value('fieldId')))) throw fail(400, 'Некорректная ссылка на участок');
      const reference = String(value('fieldId'));
      const direct = record(c.user_id, reference);
      if (direct?.kind === 'field' && !direct.deleted) fieldId = direct.id;
      else {
        // Only IDs imported from this same 1C publication may resolve an external reference.
        const matches = fieldReferences.get(reference) || [];
        if (matches.length !== 1) throw fail(400, 'Участок операции ещё не импортирован или ссылка неоднозначна');
        fieldId = matches[0];
      }
    }
    return { title: text('title'), text: m.fields.text ? text('text') : '', date, fieldId, assets: [] };
  }
  async function prepare(c) {
    const savedMapping = parse(c.mapping);
    if (!savedMapping) throw fail(409, 'Сначала настройте сопоставление');
    const mapping = validateMapping(c, savedMapping);
    let data;
    try { data = await client(c).rows(mapping.collection); }
    catch (error) { if (!stopped) rememberError(c, error); throw error; }
    if (stopped) throw fail(503, 'Сервис останавливается');
    if (!Array.isArray(data) || data.length > 1000) throw fail(413, 'За один импорт поддерживается не более 1000 записей');
    version(get(c.user_id), c.version);
    const fieldReferences = new Map();
    if (mapping.kind === 'entry' && mapping.fields.fieldId) {
      const fields = db.prepare("SELECT s.source_id,r.id FROM one_c_sources s JOIN records r ON r.user_id=s.user_id AND r.id=s.record_id WHERE s.user_id=? AND s.source_endpoint=? AND r.kind='field' AND r.deleted=0").all(c.user_id, c.endpoint);
      for (const field of fields) {
        const ids = fieldReferences.get(field.source_id) || [];
        ids.push(field.id); fieldReferences.set(field.source_id, ids);
      }
    }
    const seen = new Map();
    for (const item of data) {
      const raw = item?.[mapping.id];
      if ((typeof raw === 'string' && raw.length > 0 && raw.length <= 256) || (typeof raw === 'number' && Number.isSafeInteger(raw))) {
        const id = String(raw); seen.set(id, (seen.get(id) || 0) + 1);
      }
    }
    const rows = data.map(item => {
      const raw = item?.[mapping.id], sourceId = typeof raw === 'string' || typeof raw === 'number' ? String(raw).slice(0, 256) : '';
      const base = { sourceId, action: 'skip' };
      try {
        const validId = (typeof raw === 'string' && raw.length > 0 && raw.length <= 256) || (typeof raw === 'number' && Number.isSafeInteger(raw));
        if (!item || typeof item !== 'object' || Array.isArray(item) || !validId || !sourceId || !seen.has(sourceId)) throw fail(400, 'Нет уникального идентификатора записи 1С');
        if (seen.get(sourceId) !== 1) throw fail(400, 'Идентификатор повторяется в коллекции 1С');
        const source = sourceKey(c, mapping, sourceId), id = `onec_${source.slice(0, 48)}`;
        const relation = db.prepare('SELECT * FROM one_c_sources WHERE user_id=? AND source_key=?').get(c.user_id, source);
        const old = record(c.user_id, id);
        if (old && (!relation || old.deleted || old.version !== relation.imported_version)) throw fail(409, 'Изменено или удалено в EGIN: сохранена локальная версия');
        const converted = convert(c, mapping, item, fieldReferences);
        validateRecord({ id, kind: mapping.kind, version: old?.version || 0, deleted: false, data: converted });
        return { sourceId, source, id, kind: mapping.kind, expectedVersion: old?.version || 0, data: converted,
          action: !old ? 'create' : old.data === json(converted) ? 'unchanged' : 'update' };
      } catch (error) { return { ...base, reason: safeError(error) }; }
    });
    clearError(c);
    return rows;
  }
  function summary(rows) {
    return { created: rows.filter(r => r.action === 'create').length, updated: rows.filter(r => r.action === 'update').length,
      unchanged: rows.filter(r => r.action === 'unchanged').length, skipped: rows.filter(r => r.action === 'skip').length };
  }
  function apply(c, rows, lease) {
    version(get(c.user_id), c.version);
    if (lease) {
      const current = get(c.user_id);
      if (current.lease !== lease || current.lease_until < Date.now()) throw fail(409, 'Срок фоновой синхронизации истёк');
    }
    const run = newRun();
    let count = db.prepare('SELECT count(*) n FROM records WHERE user_id=?').get(c.user_id).n;
    function skip(row, reason) { run.skippedCount++; if (run.issues.length < 100) run.issues.push({ sourceId: row.sourceId, message: reason }); }
    for (const row of rows) {
      if (row.action === 'skip') { skip(row, row.reason); continue; }
      const old = record(c.user_id, row.id);
      const relation = db.prepare('SELECT * FROM one_c_sources WHERE user_id=? AND source_key=?').get(c.user_id, row.source);
      if ((old?.version || 0) !== row.expectedVersion || (old && (!relation || old.deleted || old.kind !== row.kind || old.version !== relation.imported_version))) {
        skip(row, 'Запись изменена в EGIN после предпросмотра. Изменения сохранены.'); continue;
      }
      if (row.kind === 'entry' && row.data.fieldId) {
        const field = record(c.user_id, row.data.fieldId);
        if (!field || field.deleted || field.kind !== 'field') { skip(row, 'Связанный участок больше недоступен'); continue; }
      }
      if (row.action === 'unchanged') { run.unchangedCount++; continue; }
      if (!old && count >= 10000) { skip(row, 'Достигнут лимит 10 000 записей профиля'); continue; }
      validateRecord({ id: row.id, kind: row.kind, version: row.expectedVersion, deleted: false, data: row.data });
      const nextVersion = row.expectedVersion + 1, seq = db.prepare('UPDATE sequence SET n=n+1 RETURNING n').get().n;
      db.prepare(`INSERT INTO records VALUES(?,?,?,?,0,?,?) ON CONFLICT(user_id,id) DO UPDATE SET data=excluded.data,version=excluded.version,seq=excluded.seq`).run(c.user_id, row.id, row.kind, json(row.data), nextVersion, seq);
      db.prepare('INSERT INTO one_c_sources(user_id,source_key,record_id,imported_version,source_endpoint,source_id) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,source_key) DO UPDATE SET imported_version=excluded.imported_version,source_endpoint=excluded.source_endpoint,source_id=excluded.source_id').run(c.user_id, row.source, row.id, nextVersion, c.endpoint, row.sourceId);
      if (old) run.updatedCount++; else { run.createdCount++; count++; }
    }
    run.status = run.skippedCount ? 'partial' : 'success';
    db.prepare("UPDATE one_c_connections SET last_run_at=?,status='connected',last_error=NULL,next_run_at=? WHERE user_id=? AND version=?").run(run.created, c.schedule_minutes ? Date.now() + c.schedule_minutes * 60000 : null, c.user_id, c.version);
    return saveRun(c.user_id, run);
  }
  app.get('/api/one-c', required, (req, res) => res.json(view(req.user.id)));
  app.post('/api/one-c/connect', required, wrap(async (req, res) => {
    const user = req.user.id, before = get(user), body = req.body, initialRevision = revision(user);
    version(before, body.version); limit(user);
    const endpoint = normalizeOneCEndpoint(body.endpoint);
    if (!string(body.username, 200) || !body.username.trim() || /[\r\n:]/.test(body.username)) throw fail(400, 'Введите имя пользователя 1С');
    const username = body.username.trim();
    const password = body.password === undefined && before?.endpoint === endpoint && before.username === username ? secrets.decrypt(user, before.secret) : body.password;
    if (!string(password, 1000) || !password) throw fail(400, 'Введите пароль пользователя 1С');
    let schema;
    try { schema = await clientFactory({ endpoint, username, password }).discover(); }
    catch (error) { if (before) rememberError(before, error); throw error; }
    if (!Array.isArray(schema) || !schema.length || schema.length > 3000) throw fail(400, 'В 1С не опубликованы доступные коллекции');
    const sameEndpoint = before?.endpoint === endpoint;
    transaction(() => {
      version(get(user), body.version);
      if (revision(user) !== initialRevision) throw fail(409, 'Подключение изменилось. Повторите проверку.');
      db.prepare(`INSERT INTO one_c_connections(user_id,endpoint,username,secret,version,status,checked_at,schema_json,mapping,schedule_minutes)
        VALUES(?,?,?,?,?,'connected',?,?,?,0) ON CONFLICT(user_id) DO UPDATE SET endpoint=excluded.endpoint,username=excluded.username,secret=excluded.secret,
        version=excluded.version,status='connected',checked_at=excluded.checked_at,last_error=NULL,schema_json=excluded.schema_json,mapping=excluded.mapping,
        schedule_minutes=0,next_run_at=NULL,lease=NULL,lease_until=NULL`).run(user, endpoint, username, secrets.encrypt(user, password), nextRevision(user), Date.now(), json(schema), sameEndpoint ? before.mapping : null);
      db.prepare('DELETE FROM one_c_previews WHERE user_id=?').run(user);
    });
    res.json(view(user));
  }));
  app.get('/api/one-c/schema', required, wrap(async (req, res) => {
    const c = connected(req.user.id); limit(c.user_id);
    const selected = collection(c, req.query.collection);
    let sample;
    try { sample = await client(c).sample(selected.name); }
    catch (error) { rememberError(c, error); throw error; }
    version(get(c.user_id), c.version);
    res.json({ properties: selected.properties, sample: sample.slice(0, 5) });
  }));
  app.put('/api/one-c/mapping', required, (req, res) => {
    const c = connected(req.user.id, req.body.version), mapping = validateMapping(c, req.body.mapping), schedule = req.body.scheduleMinutes;
    if (!schedules.includes(schedule)) throw fail(400, 'Неизвестный интервал синхронизации');
    transaction(() => {
      version(get(c.user_id), req.body.version);
      db.prepare('UPDATE one_c_connections SET mapping=?,version=?,schedule_minutes=?,next_run_at=?,lease=NULL,lease_until=NULL WHERE user_id=?').run(json(mapping), nextRevision(c.user_id), schedule, schedule ? Date.now() + schedule * 60000 : null, c.user_id);
      db.prepare('DELETE FROM one_c_previews WHERE user_id=?').run(c.user_id);
    });
    res.json(view(c.user_id));
  });
  app.post('/api/one-c/preview', required, wrap(async (req, res) => {
    const c = connected(req.user.id, req.body.version); limit(c.user_id);
    const rows = await prepare(c), previewId = randomUUID(), expiresAt = Date.now() + 600000;
    db.prepare('DELETE FROM one_c_previews WHERE expires<? OR user_id=?').run(Date.now(), c.user_id);
    db.prepare('INSERT INTO one_c_previews VALUES(?,?,?,?,?)').run(previewId, c.user_id, c.version, expiresAt, json(rows));
    res.json({ previewId, expiresAt, summary: summary(rows), total: rows.length,
      rows: rows.slice(0, 50).map(({ sourceId, action, data, reason }) => ({ sourceId, action, ...(data ? { data } : {}), ...(reason ? { reason } : {}) })) });
  }));
  app.post('/api/one-c/import', required, (req, res) => {
    if (!string(req.body.previewId, 100)) throw fail(400, 'Нет предпросмотра');
    const run = transaction(() => {
      const p = db.prepare('SELECT * FROM one_c_previews WHERE id=? AND user_id=?').get(req.body.previewId, req.user.id);
      if (!p || p.expires < Date.now()) throw fail(409, 'Предпросмотр истёк или уже импортирован. Повторите его.');
      const c = connected(req.user.id, p.connection_version);
      db.prepare('DELETE FROM one_c_previews WHERE id=?').run(p.id);
      return apply(c, parse(p.rows_json));
    });
    res.json({ run });
  });
  async function sync(c, lease) {
    try {
      const rows = await prepare(c);
      return transaction(() => apply(c, rows, lease));
    } catch (error) {
      if (stopped) throw error;
      // A disconnected or reconfigured connection must not acquire stale state or a misleading run.
      const latest = get(c.user_id);
      if (latest?.version === c.version && (!lease || (latest.lease === lease && latest.lease_until >= Date.now()))) {
        rememberError(c, error);
        saveRun(c.user_id, { ...newRun(), status: 'error', error: safeError(error) });
        db.prepare('UPDATE one_c_connections SET last_run_at=?,next_run_at=? WHERE user_id=? AND version=?').run(Date.now(), c.schedule_minutes ? Date.now() + c.schedule_minutes * 60000 : null, c.user_id, c.version);
      }
      throw error;
    }
  }
  app.post('/api/one-c/sync', required, wrap(async (req, res) => {
    const c = connected(req.user.id, req.body.version); limit(c.user_id);
    res.json({ run: await sync(c) });
  }));
  app.delete('/api/one-c', required, (req, res) => {
    version(get(req.user.id), req.body.version);
    transaction(() => {
      version(get(req.user.id), req.body.version);
      db.prepare('DELETE FROM one_c_connections WHERE user_id=?').run(req.user.id);
      db.prepare('DELETE FROM one_c_previews WHERE user_id=?').run(req.user.id);
    });
    res.json(view(req.user.id));
  });
  let stopped = false, ticking = false;
  async function tick() {
    if (stopped || ticking) return;
    ticking = true;
    try {
      const due = db.prepare('SELECT user_id FROM one_c_connections WHERE schedule_minutes>0 AND next_run_at<=? AND (lease_until IS NULL OR lease_until<?) LIMIT 10').all(Date.now(), Date.now());
      for (const { user_id: user } of due) {
        if (stopped) break;
        const lease = randomUUID(), now = Date.now();
        const c = db.prepare('UPDATE one_c_connections SET lease=?,lease_until=? WHERE user_id=? AND schedule_minutes>0 AND next_run_at<=? AND (lease_until IS NULL OR lease_until<?) RETURNING *').get(lease, now + 300000, user, now, now);
        if (!c) continue;
        try { await sync(c, lease); } catch { /* Saved in owner-visible run history; never log provider credentials. */ }
        finally { if (!stopped) db.prepare('UPDATE one_c_connections SET lease=NULL,lease_until=NULL WHERE user_id=? AND lease=?').run(user, lease); }
      }
    } finally { ticking = false; }
  }
  const timer = startScheduler && scheduleIntervalMs > 0 ? setInterval(() => { tick().catch(() => {}); }, scheduleIntervalMs) : null;
  timer?.unref();
  return { close() { stopped = true; if (timer) clearInterval(timer); }, tick };
}
