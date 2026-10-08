import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { installOneC } from '../src/one-c.mjs';
import { validateRecord } from '../src/server.mjs';

const endpoint = 'https://erp.example.com/farm/odata/standard.odata/';
const fieldProperties = ['Ref_Key', 'Description', 'Area', 'Latitude', 'Longitude', 'Crop'];
const entryProperties = ['Ref_Key', 'Title', 'Text', 'Date', 'Field'];
const schemas = [ { name: 'Catalog_Fields', properties: fieldProperties.map(name => ({ name, type: 'Edm.String' })) },
  { name: 'Document_Operations', properties: entryProperties.map(name => ({ name, type: 'Edm.String' })) } ];
const mapping = { kind: 'field', collection: 'Catalog_Fields', id: 'Ref_Key', fields: { name: 'Description', area: 'Area', latitude: 'Latitude', longitude: 'Longitude', crop: 'Crop' }, areaUnit: 'ha' };
const field = { Ref_Key: 'field-1', Description: 'Северное', Area: 20, Latitude: 51.2, Longitude: 71.4, Crop: 'пшеница' };
const error = (status, message) => Object.assign(new Error(message), { status });

async function harness(t) {
  const dir = mkdtempSync(tmpdir() + '/egin-one-c-'), db = new DatabaseSync(dir + '/test.sqlite');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('alice'),('bob');
    CREATE TABLE records(user_id TEXT,id TEXT,kind TEXT,data TEXT,deleted INTEGER,version INTEGER,seq INTEGER,PRIMARY KEY(user_id,id));
    CREATE TABLE sequence(n INTEGER); INSERT INTO sequence VALUES(0);`);
  const state = { data: [field], rowCalls: 0, credentials: [], deferred: null };
  const controls = [], servers = [];
  async function mount() {
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { if (req.headers['x-user']) req.user = { id: req.headers['x-user'] }; next(); });
    const control = installOneC({ app, db, dataDir: dir, validateRecord, startScheduler: false,
      required: (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Login' }),
      wrap: fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next),
      clientFactory: auth => {
        state.credentials.push(auth);
        return {
          async discover() { if (state.discoverDeferred) await state.discoverDeferred; if (auth.password !== 'real-secret') throw error(422, 'Доступ отклонён'); return schemas; },
          async sample() { return state.data.slice(0, 5); },
          async rows() { state.rowCalls++; if (state.deferred) await state.deferred; if (state.failure) throw state.failure; return state.data; },
        };
      },
    });
    app.use((e, _req, res, _next) => res.status(e.status || 500).json({ error: e.message }));
    const server = app.listen(0); await new Promise(resolve => server.once('listening', resolve));
    controls.push(control); servers.push(server);
    const call = async (method, path = '', body, user = 'alice') => {
      const result = await fetch(`http://127.0.0.1:${server.address().port}/api/one-c${path}`, { method,
        headers: { 'Content-Type': 'application/json', ...(user ? { 'X-User': user } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: result.status, body: await result.json() };
    };
    return { call, control };
  }
  const first = await mount();
  t.after(async () => { controls.forEach(c => c.close()); await Promise.all(servers.map(s => new Promise(resolve => s.close(resolve)))); db.close(); rmSync(dir, { recursive: true, force: true }); });
  const { call } = first;
  const connect = async () => {
    const response = await call('POST', '/connect', { endpoint, username: 'readonly', password: 'real-secret', version: 0 });
    assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body.connection.version;
  };
  const configure = async (version, scheduleMinutes = 0, selected = mapping) => {
    const response = await call('PUT', '/mapping', { version, mapping: selected, scheduleMinutes });
    assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body.connection.version;
  };
  const preview = async version => {
    const response = await call('POST', '/preview', { version });
    assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body;
  };
  const resetLimit = () => db.prepare('DELETE FROM one_c_limits').run();
  return { ...first, state, db, dir, mount, connect, configure, preview, resetLimit };
}

test('1C credentials encrypted at rest, persisted across instances, owner-bound and never returned', async t => {
  const h = await harness(t);
  assert.equal((await h.call('GET', '', undefined, '')).status, 401);
  let version = await h.connect();
  const secret = h.db.prepare('SELECT secret FROM one_c_connections').get().secret;
  assert.ok(!secret.includes('real-secret'));
  assert.equal(statSync(h.dir + '/one-c.key').mode & 0o777, 0o600);
  const originalKey = readFileSync(h.dir + '/one-c.key');
  assert.ok(!JSON.stringify((await h.call('GET')).body).includes('real-secret'));
  assert.equal((await h.call('GET', '', undefined, 'bob')).body.connection, null);
  assert.equal((await h.call('GET', '/schema?collection=Catalog_Fields', undefined, 'bob')).status, 409);
  const second = await h.mount();
  assert.deepEqual(readFileSync(h.dir + '/one-c.key'), originalKey);
  assert.equal((await second.call('GET', '/schema?collection=Catalog_Fields')).status, 200);
  assert.equal(h.state.credentials.at(-1).password, 'real-secret');
  const reconnect = await h.call('POST', '/connect', { endpoint: endpoint.slice(0, -1), username: 'readonly', version });
  assert.equal(reconnect.status, 200); version = reconnect.body.connection.version;
  assert.equal(reconnect.body.connection.endpoint, endpoint);
  assert.equal((await h.call('POST', '/connect', { endpoint, username: 'different', version })).status, 400);
  assert.equal((await h.call('POST', '/connect', { endpoint, username: 'readonly', password: 'wrong', version })).status, 422);
  assert.equal((await h.call('GET', '/schema?collection=Catalog_Fields')).status, 200);
  assert.equal(h.state.credentials.at(-1).password, 'real-secret');
});

test('preview is read-only, owner-bound, single-use, expires, and protects local edits', async t => {
  const h = await harness(t), version = await h.configure(await h.connect());
  const p = await h.preview(version);
  assert.deepEqual(p.summary, { created: 1, updated: 0, unchanged: 0, skipped: 0 });
  assert.equal(h.db.prepare('SELECT count(*) n FROM records').get().n, 0);
  assert.equal((await h.call('POST', '/import', { previewId: p.previewId }, 'bob')).status, 409);
  const imported = await h.call('POST', '/import', { previewId: p.previewId });
  assert.equal(imported.body.run.createdCount, 1);
  assert.equal((await h.call('POST', '/import', { previewId: p.previewId })).status, 409);
  const unchanged = await h.preview(version);
  assert.equal(unchanged.summary.unchanged, 1);
  h.db.prepare('UPDATE one_c_previews SET expires=0').run();
  assert.equal((await h.call('POST', '/import', { previewId: unchanged.previewId })).status, 409);
  h.state.data = [{ ...field, Area: 25 }];
  const updated = await h.preview(version);
  assert.equal(updated.summary.updated, 1);
  h.db.prepare('UPDATE records SET version=version+1').run();
  const skipped = await h.call('POST', '/import', { previewId: updated.previewId });
  assert.equal(skipped.body.run.skippedCount, 1);
  assert.equal(JSON.parse(h.db.prepare('SELECT data FROM records').get().data).area, 20);
  assert.equal((await h.preview(version)).summary.skipped, 1);
  assert.equal(h.db.prepare('SELECT n FROM sequence').get().n, 1);
});

test('mapping validates schema, rejects missing coordinates and crops, duplicate IDs and unsafe numeric conversion', async t => {
  const h = await harness(t), connectedVersion = await h.connect();
  assert.equal((await h.call('PUT', '/mapping', { version: connectedVersion, mapping: { ...mapping, fields: { ...mapping.fields, latitude: 'Unknown' } }, scheduleMinutes: 0 })).status, 400);
  const version = await h.configure(connectedVersion);
  h.state.data = [field, { ...field }, { ...field, Ref_Key: 'empty', Latitude: '' }, { ...field, Ref_Key: 'crop', Crop: 'unknown' }, { ...field, Ref_Key: 'area', Area: null }, { ...field, Ref_Key: 'zero', Latitude: 0, Longitude: 0 }, { ...field, Ref_Key: 'deleted', DeletionMark: true }];
  const p = await h.preview(version);
  assert.equal(p.summary.created, 1); assert.equal(p.summary.skipped, 6);
  assert.equal(p.rows.find(r => r.action === 'create').sourceId, 'zero');
  const nextVersion = await h.configure(version, 0, { ...mapping, fields: { name: 'Description', area: 'Area', latitude: 'Latitude', longitude: 'Longitude' }, cropDefault: 'wheat', areaUnit: 'm2' });
  h.state.data = [{ ...field, Area: '20 000' }, { ...field, Ref_Key: 'valid', Area: '20000,5' }];
  const converted = await h.preview(nextVersion);
  assert.equal(converted.summary.skipped, 1); assert.equal(converted.rows[1].data.area, 2.00005);
  assert.equal((await h.call('POST', '/import', { previewId: p.previewId })).status, 409);
});

test('journal resolves imported field references and accepts ISO and OData dates without inventing missing data', async t => {
  const h = await harness(t); let version = await h.configure(await h.connect());
  const p = await h.preview(version); await h.call('POST', '/import', { previewId: p.previewId });
  const fieldId = h.db.prepare('SELECT id FROM records').get().id;
  const entryMapping = { kind: 'entry', collection: 'Document_Operations', id: 'Ref_Key', fields: { title: 'Title', text: 'Text', date: 'Date', fieldId: 'Field' } };
  version = await h.configure(version, 0, entryMapping);
  h.state.data = [
    { Ref_Key: 'op-1', Title: 'Обработка', Text: 'Описание', Date: '/Date(1791417600000)/', Field: 'field-1' },
    { Ref_Key: 'op-2', Title: 'Осмотр', Text: '', Date: '2026-10-08T11:00:00', Field: '' },
    { Ref_Key: 'op-3', Title: 'Осмотр', Text: '', Date: '2026-02-31', Field: '' },
    { Ref_Key: 'op-4', Title: 'Осмотр', Text: '', Date: '2026-10-08', Field: 'missing-field' },
  ];
  const entries = await h.preview(version);
  assert.equal(entries.summary.created, 2); assert.equal(entries.summary.skipped, 2);
  assert.equal(entries.rows[0].data.fieldId, fieldId); assert.deepEqual(entries.rows[0].data.assets, []);
  assert.equal(entries.rows[1].data.fieldId, '');
  h.db.prepare('UPDATE records SET deleted=1,version=version+1 WHERE id=?').run(fieldId);
  const imported = await h.call('POST', '/import', { previewId: entries.previewId });
  assert.equal(imported.body.run.createdCount, 1); assert.equal(imported.body.run.skippedCount, 3);
});

test('scheduler defaults off, requires explicit interval, uses shared lease and records failures', async t => {
  const h = await harness(t); let version = await h.configure(await h.connect());
  await h.control.tick(); assert.equal(h.state.rowCalls, 0);
  const second = await h.mount();
  version = await h.configure(version, 60);
  h.db.prepare('UPDATE one_c_connections SET next_run_at=0').run();
  let release; h.state.deferred = new Promise(resolve => { release = resolve; });
  const pending = h.control.tick();
  await second.control.tick(); assert.equal(h.state.rowCalls, 1);
  release(); await pending; h.state.deferred = null;
  assert.equal(h.db.prepare('SELECT count(*) n FROM records').get().n, 1);
  assert.equal((await h.call('GET')).body.runs[0].createdCount, 1);
  assert.ok(h.db.prepare('SELECT next_run_at FROM one_c_connections').get().next_run_at > Date.now());
  h.state.failure = error(502, 'Сервис 1С недоступен');
  h.db.prepare('UPDATE one_c_connections SET next_run_at=0').run();
  await second.control.tick();
  const failed = (await h.call('GET')).body;
  assert.equal(failed.connection.status, 'error'); assert.equal(failed.runs[0].status, 'error');
  assert.equal(h.db.prepare('SELECT count(*) n FROM records').get().n, 1);
});

test('disconnect keeps records, deletes secrets, cancels previews and cannot be undone by stale sync', async t => {
  const h = await harness(t); let version = await h.configure(await h.connect());
  const p = await h.preview(version); await h.call('POST', '/import', { previewId: p.previewId });
  h.state.data = [{ ...field, Area: 80 }];
  let release; h.state.deferred = new Promise(resolve => { release = resolve; });
  const pending = h.call('POST', '/sync', { version });
  while (h.state.rowCalls < 2) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await h.call('DELETE', '', { version })).status, 200);
  assert.equal(h.db.prepare('SELECT count(*) n FROM one_c_connections').get().n, 0);
  version = await h.connect(); assert.ok(version > 2);
  release(); assert.equal((await pending).status, 409); h.state.deferred = null;
  assert.equal(JSON.parse(h.db.prepare('SELECT data FROM records').get().data).area, 20);
  version = await h.configure(version);
  const resync = await h.call('POST', '/sync', { version });
  assert.equal(resync.body.run.updatedCount, 1); assert.equal(resync.body.run.createdCount, 0);
});

test('pending initial connection cannot resurrect a subsequently disconnected configuration', async t => {
  const h = await harness(t);
  let release; h.state.discoverDeferred = new Promise(resolve => { release = resolve; });
  const pending = h.call('POST', '/connect', { endpoint, username: 'readonly', password: 'real-secret', version: 0 });
  while (!h.state.credentials.length) await new Promise(resolve => setTimeout(resolve, 5));
  h.state.discoverDeferred = null;
  const version = await h.connect();
  assert.equal((await h.call('DELETE', '', { version })).status, 200);
  release(); assert.equal((await pending).status, 409);
  assert.equal((await h.call('GET')).body.connection, null);
});

test('expired scheduler lease cannot apply data or overwrite the successor run status', async t => {
  const h = await harness(t); await h.configure(await h.connect(), 60);
  const second = await h.mount();
  h.db.prepare('UPDATE one_c_connections SET next_run_at=0').run();
  let release; h.state.deferred = new Promise(resolve => { release = resolve; });
  const pending = h.control.tick();
  assert.equal(h.state.rowCalls, 1);
  h.state.deferred = null;
  h.db.prepare('UPDATE one_c_connections SET lease_until=0').run();
  await second.control.tick();
  release(); await pending;
  const result = (await h.call('GET')).body;
  assert.equal(result.connection.status, 'connected');
  assert.equal(result.runs.length, 1); assert.equal(result.runs[0].createdCount, 1);
  assert.equal(h.db.prepare('SELECT n FROM sequence').get().n, 1);
});
