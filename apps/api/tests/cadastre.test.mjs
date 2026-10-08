import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { createCadastreClient, createCadastreReader, normalizeCadastreNumber, parcelBoundary, boundaryAreaHa, cadastreTlsOptions, installCadastre, normalizeCadastrePoint, normalizeCadastreLabelView } from '../src/cadastre.mjs';

// A single public-map polygon, stripped of owner and internal service attributes.
const NUMBER = '05071008125';
const WKT = 'MULTIPOLYGON(((385277.5698564127 5449430.937779015,385227.4587859055 5449431.26302216,385227.2246301528 5449480.615843389,385277.61707751174 5449480.805583127,385277.5698564127 5449430.937779015)))';
const CATALOG = [{ code: '05', nameRu: 'Восточно-Казахстанская область', districts: [{ id: 70, code: '071', nameRu: 'Катон-Карагайский', srs: 32645 }] }];
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
  const response = {setHeader(name,value){if(name==='Retry-After') assert.ok(Number(value)>0 && Number(value)<=60);else {assert.equal(name,'Cache-Control');assert.equal(value,'no-store');}},json:()=>{}};
  const req = user => ({user:{id:user},query:{number:NUMBER}});
  const searches = routes.filter(r => r[0] === '/api/cadastre/search');
  for(let i=0;i<24;i++) await searches[i%2][2](req('owner-a'),response);
  await assert.rejects(searches[1][2](req('owner-a'),response),{status:429});
  const identify = routes.find(r => r[0] === '/api/cadastre/identify');
  assert.equal(identify[1], required);
  const labels = routes.find(r => r[0] === '/api/cadastre/labels');
  assert.equal(labels[1], required);
  await assert.rejects(labels[2]({user:{id:'owner-a'},query:{district:'70',zoom:'18',west:'85.424',east:'85.427',south:'49.186',north:'49.189'}},response),{status:429});
  await assert.rejects(identify[2]({user:{id:'owner-a'},query:{latitude:'49.18715',longitude:'85.4254'}}, response),{status:429});
  await routes[0][2](req('owner-b'),response);
  assert.equal(upstream,25);
  assert.deepEqual(Object.keys(db.prepare('SELECT * FROM cadastre_limits').get()),['user_id','until','count']);
  db.close();
});

const POINT = { latitude: 49.18715, longitude: 85.4254 };
const DISTRICTS = { features: [{ properties: { regionname: '05', districtna: '071', srs: 32645, date_end: null } }], totalFeatures: 1 };

test('map tap identifies one real parcel via bounded district query and private UTM context', async () => {
  const calls = []; let jars = 0;
  const client = createCadastreClient({ readerFactory: () => { const jar = ++jars; return async (path, options) => {
    calls.push({ path, options, jar });
    if (path.startsWith('/map/districts?')) return CATALOG;
    if (path.startsWith('/geoserver/wfs?')) return DISTRICTS;
    if (path.startsWith('/map/district?')) return {};
    return RESULT;
  }; } });
  const result = await client.identify(POINT.latitude, POINT.longitude);
  assert.equal(result.candidates[0].cadastralNumber, NUMBER);
  assert.deepEqual(result.mapDistrict, {id:70,code:'071',srid:32645});
  const wfs = new URL(calls.find(c => c.path.startsWith('/geoserver/')).path, 'https://map.gov4c.kz');
  assert.equal(wfs.searchParams.get('typename'), 'egkn:districts');
  assert.equal(wfs.searchParams.get('propertyName'), 'regionname,districtna,srs,date_end');
  assert.equal(wfs.searchParams.get('maxFeatures'), '10');
  const box = wfs.searchParams.get('bbox').split(',').slice(0,4).map(Number);
  assert.ok(box[2]-box[0] < .101); assert.ok(box[3]-box[1] < .101);
  const get = new URL(calls.at(-1).path, 'https://map.gov4c.kz');
  assert.equal(get.searchParams.get('layers'), 'lands');
  assert.ok(Math.abs(Number(get.searchParams.get('x')) - 385263.99256) < .001);
  assert.ok(Math.abs(Number(get.searchParams.get('y')) - 5449454.07337) < .001);
  assert.equal(calls.at(-2).options.method, 'PUT');
  assert.doesNotMatch(JSON.stringify(result), /NEVER RETURN|INTERNAL|"owners"|"cuser"/);
  const outside = await client.identify(49.1871,85.4258);
  assert.deepEqual(outside.candidates, []); assert.equal(outside.mapDistrict.id,70);
  assert.equal(jars, 2); assert.equal(calls.filter(c=>c.path.startsWith('/map/districts?')).length,1);
});

test('map tap validates coordinates, ignores old boundaries and refuses ambiguous regions or excessive results', async () => {
  for (const bad of ['',null,[],{},'49&limit=100',Infinity,'NaN','49e0']) assert.throws(()=>normalizeCadastrePoint(bad,85), {status:400});
  assert.throws(()=>normalizeCadastrePoint(0,85),{status:400});
  assert.throws(()=>normalizeCadastrePoint(49,0),{status:400});
  assert.deepEqual(normalizeCadastrePoint('49.18715','85.4254'),POINT);
  const run = (districts, lands=RESULT) => createCadastreClient({readerFactory:()=>async path=>
    path.startsWith('/map/districts?') ? CATALOG : path.startsWith('/geoserver/wfs?') ? districts : path.startsWith('/map/district?') ? {} : lands
  }).identify(POINT.latitude,POINT.longitude);
  assert.deepEqual((await run({features:[]})).candidates,[]);
  assert.deepEqual((await run({features:[{properties:{...DISTRICTS.features[0].properties,date_end:'2024-05-31'}}]})).candidates,[]);
  const duplicate = {features:[...DISTRICTS.features,...DISTRICTS.features]};
  assert.equal((await run(duplicate)).candidates.length,1);
  await assert.rejects(run({features:[...DISTRICTS.features,{properties:{regionname:'05',districtna:'072'}}]}),{status:422});
  await assert.rejects(run({features:DISTRICTS.features,totalFeatures:11}),{status:502});
  await assert.rejects(run(DISTRICTS,{lands:[...RESULT.lands,...RESULT.lands]}),{status:422});
  assert.deepEqual((await run(DISTRICTS,{lands:[{...RESULT.lands[0],properties:{kad_nomer:'06071008125'}}]})).candidates,[]);
});

const VIEW = {district:70,zoom:18,west:85.424,east:85.427,south:49.186,north:49.189};
const LABEL = {id:'lands05071.private-id',label:NUMBER,geometry:'POINT(385252.51104598655 5449455.928726916)',owners:['NEVER RETURN']};

test('public number labels use bounded UTM extent, private district context and whitelist',async()=>{
  const calls=[];
  const client=createCadastreClient({readerFactory:()=>async(path,options)=>{
    calls.push({path,options});
    if(path.startsWith('/map/districts?'))return CATALOG;
    if(path.startsWith('/map/district?'))return {};
    return {lands:[LABEL,LABEL,{...LABEL,label:'not a cadastral number'},{...LABEL,label:'06071008125'}, {...LABEL,label:'05071008126',geometry:'POINT(800000 5000000)'}]};
  }});
  const result=await client.labels(VIEW);
  assert.equal(result.labels.length,1);
  const label=result.labels[0];assert.equal(label.number,NUMBER);
  assert.ok(Math.abs(label.longitude-85.42524)<.0001);assert.ok(Math.abs(label.latitude-49.18716)<.0001);
  assert.deepEqual(Object.keys(label).sort(),['latitude','longitude','number']);
  assert.doesNotMatch(JSON.stringify(result),/NEVER RETURN|private-id|"owners"/);
  assert.equal(calls[1].options.method,'PUT');assert.equal(calls[1].path,'/map/district?code=071');
  const q=new URL(calls[2].path,'https://map.gov4c.kz').searchParams;
  assert.equal(q.get('name'),'lands');assert.equal(q.get('srs'),'1');
  const extent=q.get('extent').split(',').map(Number);
  assert.equal(extent.length,4);assert.ok(extent[0]>385000 && extent[2]<386000);
  assert.ok(Number(q.get('res'))>.3 && Number(q.get('res'))<.5);
});

test('public labels reject broad or malformed viewports before upstream and cap visible numbers',async()=>{
  for(const change of [{zoom:16},{zoom:20},{district:0},{district:'83&limit=9999'},{west:[]},{north:NaN},{east:VIEW.west},{east:86},{north:50}])assert.throws(()=>normalizeCadastreLabelView({...VIEW,...change}),{status:400});
  let rows=Array.from({length:151},(_,i)=>({...LABEL,label:'05071008'+String(100+i)}));
  const client=createCadastreClient({readerFactory:()=>async path=>path.startsWith('/map/districts?')?CATALOG:path.startsWith('/map/district?')?{}:{lands:rows}});
  assert.equal((await client.labels(VIEW)).labels.length,150);
  await assert.rejects(client.labels({...VIEW,district:999}),{status:422});
  rows=Array(5001).fill(LABEL);await assert.rejects(client.labels(VIEW),{status:502});
});
