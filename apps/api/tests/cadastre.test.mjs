import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createCadastreClient, createCadastreReader, normalizeCadastreNumber, parcelBoundary, boundaryAreaHa, cadastreTlsOptions, installCadastre } from '../src/cadastre.mjs';

// A single public-map polygon, stripped of owner and internal service attributes.
const NUMBER = '05071008125';
const WKT = 'MULTIPOLYGON(((385277.5698564127 5449430.937779015,385227.4587859055 5449431.26302216,385227.2246301528 5449480.615843389,385277.61707751174 5449480.805583127,385277.5698564127 5449430.937779015)))';
const CATALOG = [{ code: '05', nameRu: 'Восточно-Казахстанская область', districts: [{ code: '071', nameRu: 'Катон-Карагайский', srs: 32645 }] }];
const RESULT = { lands: [{ id: 1, geometry: WKT, properties: { kad_nomer: NUMBER, squ: 2495, owners: ['NEVER RETURN'], cuser: 'INTERNAL' } }], count: 1 };

test('public parcel: fresh session district context, exact match, UTM conversion and strict output whitelist', async () => {
  let jars = 0; const calls = [];
  const client = createCadastreClient({ readerFactory: () => { const jar = ++jars; return async (path, options) => {
    calls.push({jar,path,options});
    if (path.startsWith('/map/districts?')) return CATALOG;
    if (path.startsWith('/map/district?')) { assert.equal(options.method, 'PUT'); return { geom: 'not returned' }; }
    return RESULT;
  }; } });
  const first = await client.search('05-071-008-125');
  const second = await client.search(NUMBER);
  assert.equal(jars, 2);
  assert.equal(calls.filter(x => x.path.startsWith('/map/districts?')).length, 1);
  assert.equal(calls.filter(x => x.path === '/map/district?code=071').length, 2);
  assert.match(calls.at(-1).path, /searchText=05071008125/);
  assert.equal(first.candidates.length, 1);
  const p = first.candidates[0];
  assert.equal(p.boundary.type, 'Polygon'); assert.equal(p.cadastralNumber, NUMBER);
  const [lng, lat] = p.boundary.coordinates[0][0];
  assert.ok(Math.abs(lng - 85.42559285883605) < 1e-8); assert.ok(Math.abs(lat - 49.186944506382765) < 1e-8);
  assert.ok(p.areaHa > .24 && p.areaHa < .26); assert.equal(p.registeredAreaHa, .2495);
  assert.equal(second.ownershipVerified, false);
  assert.doesNotMatch(JSON.stringify(first), /NEVER RETURN|INTERNAL|"owners"|"cuser"/);
});

test('input never permits broad searches or endpoint injection; ambiguous/missing districts fail', async () => {
  for (const value of ['', '05071', 'https://localhost', '05071008125&limit=1000', ['05071008125'], '05071008125%']) assert.throws(() => normalizeCadastreNumber(value), { status: 400 });
  assert.equal(normalizeCadastreNumber('05:071:008:125'), NUMBER);
  const client = createCadastreClient({ readerFactory: () => async () => CATALOG });
  await assert.rejects(client.search('01001000123'), { status: 422 });
});

test('only exact candidates survive; duplicates and unsupported geometries are explicit failures', async () => {
  const run = lands => createCadastreClient({ readerFactory: () => async path => path.startsWith('/map/districts?') ? CATALOG : path.startsWith('/map/district?') ? {} : { lands } }).search(NUMBER);
  const p = RESULT.lands[0];
  assert.deepEqual((await run([])).candidates, []);
  assert.equal((await run([{...p, properties: {kad_nomer: '050710081250'}}])).candidates.length, 0);
  await assert.rejects(run([p,p]), {status:422});
  const polygon = WKT.slice('MULTIPOLYGON('.length,-1);
  assert.throws(() => parcelBoundary(`MULTIPOLYGON(${polygon},${polygon})`,32645), /нескольких контуров/);
  assert.throws(() => parcelBoundary('POLYGON((1 2,3 4,5 6,1 2),(2 3,3 4,4 5,2 3))',32645), /внутренние границы/);
  assert.throws(() => parcelBoundary(WKT,4326), /Система координат/);
  assert.throws(() => parcelBoundary('POLYGON((1 2,3 4,5 6,7 8))',32645), /не замкнут/);
  assert.throws(() => parcelBoundary('POLYGON((385200 5449400,385250 5449450,385200 5449450,385250 5449400,385200 5449400))',32645), error => error.status === 422 && /пересекает/.test(error.message));
  assert.throws(() => parcelBoundary('POLYGON((385200 5449400,385200.1 5449400,385200.1 5449400.1,385200 5449400.1,385200 5449400))',32645), error => error.status === 422 && /Площадь/.test(error.message));
  assert.throws(() => boundaryAreaHa({coordinates:[[[1,2],[1,2],[1,2],[1,2]]]}), /Площадь/);
});

test('transport pins the HTTPS origin, validates TLS, keeps anonymous cookies local and rejects redirects', async () => {
  const calls = []; let status = 200;
  function request(url, options, callback) {
    calls.push({url,options}); const req = new EventEmitter();
    req.setTimeout = () => {}; req.destroy = e => req.emit('error', e || new Error('closed'));
    req.end = () => queueMicrotask(() => {
      const res = new EventEmitter(); res.statusCode = status; res.headers = {'set-cookie':['JSESSIONID=abc123; path=/','OTHER=secret; path=/']}; res.resume = () => {};
      callback(res); res.emit('data',Buffer.from('{}'));res.emit('end');
    }); return req;
  }
  const reader = createCadastreReader({request});
  await reader('/map/districts?lang=ru'); await reader('/map/district?code=071',{method:'PUT'});
  const fresh = createCadastreReader({request}); await fresh('/map/districts?lang=ru');
  assert.equal(calls[0].url,'https://map.gov4c.kz/egkn/rest/map/districts?lang=ru');
  assert.equal(calls[1].options.headers.Cookie,'JSESSIONID=abc123');
  assert.equal(calls[2].options.headers.Cookie,undefined);
  assert.equal(calls[0].options.rejectUnauthorized,true); assert.ok(cadastreTlsOptions.ca.length > 20);
  status = 302; await assert.rejects(reader('/map/districts?lang=ru'), {status:502});
  await assert.rejects(reader('https://localhost/'), {status:400});
});

test('search route requires the app session, shares limits across server slots and never persists parcel data', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('owner-a'),('owner-b');");
  let upstream = 0; const routes = [];
  const required = () => {};
  const install = () => installCadastre({db,required,wrap: fn => fn,app:{get:(...args) => routes.push(args)},clientFactory:() => ({search:async () => {upstream++;return {candidates:[]};}})});
  install(); install();
  assert.equal(routes[0][0],'/api/cadastre/search'); assert.equal(routes[0][1],required);
  const response = {setHeader(name,value){assert.equal(name,'Cache-Control');assert.equal(value,'no-store');},json:()=>{}};
  const req = user => ({user:{id:user},query:{number:NUMBER}});
  for(let i=0;i<6;i++) await routes[i%2][2](req('owner-a'),response);
  await assert.rejects(routes[1][2](req('owner-a'),response),{status:429});
  await routes[0][2](req('owner-b'),response);
  assert.equal(upstream,7);
  assert.deepEqual(Object.keys(db.prepare('SELECT * FROM cadastre_limits').get()),['user_id','until','count']);
  db.close();
});
