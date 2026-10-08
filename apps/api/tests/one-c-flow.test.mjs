import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createApp} from '../src/server.mjs';
import {createOneCClient} from '../src/one-c-transport.mjs';

const endpoint = 'https://erp.example.com/base/odata/standard.odata/';
const password = 'fixture-secret-never-persist-in-plaintext';
const hash = value => createHash('sha256').update(value).digest('hex');
const metadata = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" Version="1.0">
  <edmx:DataServices><Schema Namespace="StandardODATA" xmlns="http://schemas.microsoft.com/ado/2009/11/edm">
    <EntityType Name="Catalog_Fields">
      <Key><PropertyRef Name="Ref_Key"/></Key>
      <Property Name="Ref_Key" Type="Edm.Guid" Nullable="false"/>
      <Property Name="Description" Type="Edm.String"/>
      <Property Name="Area" Type="Edm.Decimal"/>
      <Property Name="Lat" Type="Edm.Double"/>
      <Property Name="Lon" Type="Edm.Double"/>
    </EntityType>
    <EntityContainer Name="StandardODATA"><EntitySet Name="Catalog_Fields" EntityType="StandardODATA.Catalog_Fields"/></EntityContainer>
  </Schema></edmx:DataServices>
</edmx:Edmx>`;

test('1C HTTP OData publication imports paginated fields through real API, preserves local edits and owner boundaries', async t => {
  const rows = Array.from({length: 5}, (_, i) => ({
    Ref_Key: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    Description: `Участок ${i + 1}`, Area: String(20 + i / 2), Lat: 51 + i / 100, Lon: 71 + i / 100,
  }));
  const requests = [];
  let rejectedCredentials = 0;
  const fixture = createServer((req, res) => {
    const url = new URL(req.url, endpoint);
    assert.equal(req.method, 'GET', 'The integration must never write back to 1C');
    if (req.headers.authorization !== 'Basic ' + Buffer.from('readonly:' + password).toString('base64')) {
      rejectedCredentials++;
      res.writeHead(401).end('Provider diagnostic with password should not be exposed');
      return;
    }
    requests.push(url);
    if (url.pathname === '/base/odata/standard.odata/$metadata') {
      res.writeHead(200, {'Content-Type': 'application/xml'}).end(metadata);
      return;
    }
    if (url.pathname !== '/base/odata/standard.odata/Catalog_Fields') {
      res.writeHead(404).end();
      return;
    }
    assert.equal(url.searchParams.get('$format'), 'json');
    assert.equal(url.searchParams.get('$orderby'), 'Ref_Key');
    const skip = Number(url.searchParams.get('$skip') || 0);
    // The publication applies a two-record server page size, regardless of $top.
    const page = rows.slice(skip, skip + Math.min(2, Number(url.searchParams.get('$top'))));
    const result = {value: page};
    if (skip + page.length < rows.length) {
      const next = new URL(url);
      next.searchParams.set('$skip', String(skip + page.length));
      result['odata.nextLink'] = next.href;
    }
    res.writeHead(200, {'Content-Type': 'application/json'}).end(JSON.stringify(result));
  });
  fixture.listen(0, '127.0.0.1');
  await new Promise(resolve => fixture.once('listening', resolve));
  const dataDir = mkdtempSync(tmpdir() + '/egin-one-c-flow-');
  const runtime = createApp({
    dataDir, origins: ['http://localhost'], portalOrigin: 'http://portal.test',
    // This injection is test-only. Production keeps DNS pinning and public HTTPS checks.
    oneCClientFactory: credentials => createOneCClient(credentials, {read: async (url, {username, password, signal}) => {
      assert.equal(url.origin, 'https://erp.example.com');
      const response = await fetch(`http://127.0.0.1:${fixture.address().port}${url.pathname}${url.search}`, {
        signal, headers: {Authorization: 'Basic ' + Buffer.from(username + ':' + password).toString('base64')},
      });
      if (!response.ok) throw Object.assign(new Error('1С отклонила доступ'), {status: 422});
      return response.text();
    }}),
  });
  const {app, db} = runtime;
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    runtime.close();
    await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => fixture.close(resolve))]);
    db.close();
    rmSync(dataDir, {recursive: true, force: true});
  });
  for (const id of ['alice', 'bob']) {
    db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, id, null, Date.now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(id), id, Date.now() + 60000);
  }
  const call = async (method, path, body, user = 'alice', status = 200) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers: {'Content-Type': 'application/json', 'X-EGIN': '1', Origin: 'http://localhost', Cookie: 'egin_session=' + user},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
    const result = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(result)}`);
    assert.equal(JSON.stringify(result).includes(password), false, 'API responses cannot disclose provider secrets');
    return result;
  };
  await call('GET', '/one-c', undefined, 'guest', 401);
  const connected = await call('POST', '/one-c/connect', {version: 0, endpoint, username: 'readonly', password});
  assert.equal(connected.connection.status, 'connected');
  assert.deepEqual(connected.connection.collections.map(c => c.name), ['Catalog_Fields']);
  assert.equal((await call('GET', '/one-c', undefined, 'bob')).connection, null);
  await call('GET', '/one-c/schema?collection=Catalog_Fields', undefined, 'bob', 409);
  const schema = await call('GET', '/one-c/schema?collection=Catalog_Fields');
  assert.deepEqual(schema.properties.map(p => p.name), ['Ref_Key', 'Description', 'Area', 'Lat', 'Lon']);
  assert.equal(schema.sample.length, 5);
  const configured = await call('PUT', '/one-c/mapping', {
    version: connected.connection.version, scheduleMinutes: 0,
    mapping: {kind: 'field', collection: 'Catalog_Fields', id: 'Ref_Key',
      fields: {name: 'Description', area: 'Area', latitude: 'Lat', longitude: 'Lon'}, cropDefault: 'wheat', areaUnit: 'ha'},
  });
  const version = configured.connection.version;
  const preview = await call('POST', '/one-c/preview', {version});
  assert.deepEqual(preview.summary, {created: 5, updated: 0, unchanged: 0, skipped: 0});
  assert.equal(db.prepare('SELECT count(*) n FROM records').get().n, 0, 'Preview cannot create app records');
  assert.equal(db.prepare('SELECT n FROM sequence').get().n, 0);
  await call('POST', '/one-c/import', {previewId: preview.previewId}, 'bob', 409);
  const imported = await call('POST', '/one-c/import', {previewId: preview.previewId});
  assert.equal(imported.run.createdCount, 5);
  assert.equal(imported.run.status, 'success');
  const synced = await call('GET', '/sync');
  assert.equal(synced.records.length, 5);
  assert.equal(synced.cursor, 5);
  assert.ok(synced.records.every(r => r.kind === 'field' && r.version === 1 && r.data.crop === 'wheat'));
  assert.deepEqual((await call('GET', '/sync', undefined, 'bob')).records, []);
  assert.ok(requests.some(url => url.searchParams.get('$skip') === '2'));
  assert.ok(requests.some(url => url.searchParams.get('$skip') === '4'));

  const repeated = await call('POST', '/one-c/sync', {version});
  assert.equal(repeated.run.unchangedCount, 5);
  assert.equal(repeated.run.createdCount + repeated.run.updatedCount, 0);
  assert.equal(db.prepare('SELECT n FROM sequence').get().n, 5, 'Unchanged import does not generate sync events');
  rows[0].Area = '34.25';
  const changed = await call('POST', '/one-c/sync', {version});
  assert.equal(changed.run.updatedCount, 1);
  assert.equal(changed.run.unchangedCount, 4);
  const delta = await call('GET', '/sync?cursor=5');
  assert.equal(delta.records.length, 1);
  assert.equal(delta.records[0].data.area, 34.25);
  assert.equal(delta.records[0].version, 2);

  const field = delta.records[0];
  const edited = {...field, data: {...field.data, name: 'Название агронома'}};
  await call('POST', '/sync', {records: [edited]});
  rows[0].Description = 'Название из 1С';
  const conflict = await call('POST', '/one-c/sync', {version});
  assert.equal(conflict.run.skippedCount, 1);
  assert.equal(conflict.run.status, 'partial');
  const preserved = db.prepare('SELECT data,version FROM records WHERE user_id=? AND id=?').get('alice', field.id);
  assert.equal(JSON.parse(preserved.data).name, 'Название агронома');
  assert.equal(preserved.version, 3);

  const encryptedBefore = db.prepare('SELECT secret FROM one_c_connections WHERE user_id=?').get('alice').secret;
  await call('POST', '/one-c/connect', {version, endpoint, username: 'readonly', password: 'wrong-password'}, 'alice', 422);
  assert.equal(rejectedCredentials, 1);
  assert.equal(db.prepare('SELECT secret FROM one_c_connections WHERE user_id=?').get('alice').secret, encryptedBefore);
  assert.equal((await call('GET', '/one-c')).connection.version, version);
  const recovered = await call('POST', '/one-c/sync', {version});
  assert.equal(recovered.run.unchangedCount, 4, 'Failed credentials cannot replace the working saved password');
  assert.equal((await call('GET', '/one-c')).connection.status, 'connected');
  for (const file of readdirSync(dataDir).filter(name => name.startsWith('egin.sqlite'))) {
    assert.equal(readFileSync(`${dataDir}/${file}`).includes(Buffer.from(password)), false, `Plaintext secret in ${file}`);
    assert.equal(readFileSync(`${dataDir}/${file}`).includes(Buffer.from('wrong-password')), false);
  }
  const beforeDisconnect = db.prepare('SELECT * FROM records ORDER BY id').all();
  assert.equal((await call('DELETE', '/one-c', {version})).connection, null);
  assert.deepEqual(db.prepare('SELECT * FROM records ORDER BY id').all(), beforeDisconnect, 'Disconnect retains imported data');
  assert.equal(db.prepare('SELECT count(*) n FROM one_c_connections').get().n, 0);
  await call('POST', '/one-c/sync', {version}, 'alice', 409);
});
