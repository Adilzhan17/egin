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
  assert.doesNotMatch(JSON.stringify(first), /NEVER RETURN|INTERNAL|"cuser"/);
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
  assert.equal(routes[0][0],'/api/cadastre/search');
  assert.ok(routes.every(route=>route[1]===required),'all cadastral routes require the app session');
  const response = {setHeader(name,value){if(name==='Retry-After') assert.ok(Number(value)>0 && Number(value)<=60);else {assert.equal(name,'Cache-Control');assert.equal(value,'no-store');}},json:()=>{}};
  const req = user => ({user:{id:user},query:{number:NUMBER}});
  const searches = routes.filter(r => r[0] === '/api/cadastre/search');
  for(let i=0;i<24;i++) await searches[i%2][2](req('owner-a'),response);
  await assert.rejects(searches[1][2](req('owner-a'),response),{status:429});
  const identify = routes.find(r => r[0] === '/api/cadastre/identify');
  assert.equal(identify[1], required);
  const labels = routes.find(r => r[0] === '/api/cadastre/labels');
  assert.equal(labels[1], required);

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
  assert.doesNotMatch(JSON.stringify(result), /NEVER RETURN|INTERNAL|"cuser"/);
  const outside = await client.identify(49.1871,85.4258);
  assert.deepEqual(outside.candidates, []); assert.equal(outside.mapDistrict.id,70);
  assert.equal(jars, 4); assert.equal(calls.filter(c=>c.path.startsWith('/map/districts?')).length,1);
});

test('map tap validates coordinates, ignores old or unavailable boundaries and refuses excessive results', async () => {
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
  assert.equal((await run({features:[...DISTRICTS.features,{properties:{regionname:'05',districtna:'072'}}]})).candidates.length,1);
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

// Public parcel from the reported failure. The administrative WFS layer reports
// four overlapping districts here, while only district 042 contains this parcel.
const OVERLAP_POINT={latitude:48.832288112832,longitude:58.150643964031};
const OVERLAP_CODES=[['023',31],['027',34],['042',48],['035',41]];
const OVERLAP_CATALOG=[{code:'02',nameRu:'Актюбинская область',districts:OVERLAP_CODES.map(([code,id])=>({code,id,srs:32640,nameRu:'Район '+code}))}];
const OVERLAP_WFS={features:OVERLAP_CODES.map(([districtna])=>({properties:{regionname:'02',districtna,srs:32640,date_end:null}})),totalFeatures:4};
const OVERLAP_PARCEL={geometry:'MULTIPOLYGON(((584457.9128999999 5409472.809900001,584468.3021 5409444.499,584426.4028000003 5409429.623199999,584417.2362000002 5409455.681299999,584457.9128999999 5409472.809900001)))',properties:{kad_nomer:'020420021555',squ:1280}};

test('real overlapping administrative districts resolve through isolated exact parcel contexts',async()=>{
  const calls=[];let sequence=0;
  const factory=()=>{let code;const jar=++sequence;return async(path)=>{
    calls.push({jar,path});
    if(path.startsWith('/map/districts?'))return OVERLAP_CATALOG;
    if(path.startsWith('/geoserver/wfs?'))return OVERLAP_WFS;
    if(path.startsWith('/map/district?')){code=new URL(path,'https://map.gov4c.kz').searchParams.get('code');return {};}
    assert.ok(code,'parcel reader has its own district context');
    return {lands:code==='042'?[OVERLAP_PARCEL]:[]};
  };};
  const client=createCadastreClient({readerFactory:factory});
  const result=await client.identify(OVERLAP_POINT.latitude,OVERLAP_POINT.longitude);
  assert.deepEqual(result.candidates.map(p=>p.cadastralNumber),['020420021555']);
  assert.deepEqual(result.mapDistrict,{id:48,code:'042',srid:32640});
  const gets=calls.filter(c=>c.path.startsWith('/map/get?'));
  assert.equal(gets.length,4);assert.equal(new Set(gets.map(c=>c.jar)).size,4);
  calls.length=0;
  const hinted=await client.identify(OVERLAP_POINT.latitude,OVERLAP_POINT.longitude,48);
  assert.equal(hinted.candidates[0].cadastralNumber,'020420021555');
  assert.equal(calls.filter(c=>c.path.startsWith('/map/get?')).length,1);
  assert.equal(calls.filter(c=>c.path.startsWith('/geoserver/')).length,0);
  calls.length=0;
  const stale=await client.identify(OVERLAP_POINT.latitude,OVERLAP_POINT.longitude,31);
  assert.equal(stale.candidates[0].cadastralNumber,'020420021555');
  assert.equal(stale.mapDistrict.id,48);
  assert.equal(calls.filter(c=>c.path.startsWith('/map/get?')).length,4);
});

test('district hint does not accept non-containing parcels, true overlap yields choices, excessive contexts stay bounded',async()=>{
  let wfs=OVERLAP_WFS, hintOffPoint=true;
  const client=createCadastreClient({readerFactory:()=>{let code;return async(path)=>{
    if(path.startsWith('/map/districts?'))return [...OVERLAP_CATALOG,{code:'05',districts:[{code:'071',id:70,srs:32645}]}];
    if(path.startsWith('/geoserver/'))return wfs;
    if(path.startsWith('/map/district?')){code=new URL(path,'https://map.gov4c.kz').searchParams.get('code');return {};}
    if(code==='071')return RESULT;
    return {lands:code==='042'?[OVERLAP_PARCEL]:code==='023'&&!hintOffPoint?[{...OVERLAP_PARCEL,properties:{kad_nomer:'020230021555'}}]:[]};
  };}});
  const r=await client.identify(OVERLAP_POINT.latitude,OVERLAP_POINT.longitude,70);
  assert.equal(r.mapDistrict.id,48);assert.equal(r.candidates[0].cadastralNumber,'020420021555');
  hintOffPoint=false;
  const overlap=await client.identify(OVERLAP_POINT.latitude,OVERLAP_POINT.longitude);
  assert.deepEqual(new Set(overlap.candidates.map(p=>p.cadastralNumber)),new Set(['020230021555','020420021555']));
  wfs={features:[...OVERLAP_WFS.features,{properties:{regionname:'05',districtna:'071'}}]};
  await assert.rejects(client.identify(OVERLAP_POINT.latitude,OVERLAP_POINT.longitude),{status:422});
  await assert.rejects(client.identify(OVERLAP_POINT.latitude,OVERLAP_POINT.longitude,'48&x=3'),{status:400});
});

test('region picker lists whitelisted catalog fields and converts official Mercator district bounds',async()=>{
  let requests=0;
  const client=createCadastreClient({readerFactory:()=>async(path)=>{
    requests++;
    if(path.startsWith('/map/districts?'))return OVERLAP_CATALOG;
    return {geom:'MULTIPOLYGON(((6494458.773299484 6212813.116069387,6491510.2073112745 6214643.096532602,6484737.621052637 6218827.523403397,6494458.773299484 6212813.116069387)))',private:'NEVER RETURN'};
  }});
  const regions=await client.regions();assert.equal(regions.regions[0].code,'02');
  assert.deepEqual(regions.regions[0].districts[2],{id:48,code:'042',name:'Район 042',srid:32640});
  const view=await client.district('48');
  assert.deepEqual(view.mapDistrict,{id:48,code:'042',srid:32640});assert.equal(view.regionCode,'02');
  assert.ok(view.bounds.west>58 && view.bounds.east<59);assert.ok(view.bounds.south>48 && view.bounds.north<50);
  assert.doesNotMatch(JSON.stringify(view),/NEVER RETURN|geom|private/);
  assert.deepEqual(await client.district(48),view);assert.equal(requests,2);
  await assert.rejects(client.district(0),{status:400});
});

test('obsolete district metadata and failed neighboring contexts never hide an exact parcel match',async()=>{
  let mode='neighbor-failure';
  const client=createCadastreClient({readerFactory:()=>{let code;return async(path)=>{
    if(path.startsWith('/map/districts?'))return OVERLAP_CATALOG;
    if(path.startsWith('/geoserver/'))return {features:[...OVERLAP_WFS.features.slice(0,3),{properties:{regionname:'02',districtna:'999'}}]};
    if(path.startsWith('/map/district?')){
      code=new URL(path,'https://map.gov4c.kz').searchParams.get('code');
      if(code==='023'||mode==='all-fail')throw Object.assign(new Error('Upstream unavailable'),{status:502});
      return {};
    }
    return {lands:code==='042' && mode!=='empty'?[OVERLAP_PARCEL]:[]};
  };}});
  for(const hint of [undefined,31,999]){
    const result=await client.identify(OVERLAP_POINT.latitude,OVERLAP_POINT.longitude,hint);
    assert.deepEqual(result.candidates.map(p=>p.cadastralNumber),['020420021555']);assert.equal(result.mapDistrict.id,48);
  }
  mode='empty';await assert.rejects(client.identify(OVERLAP_POINT.latitude,OVERLAP_POINT.longitude),{status:502});
  mode='all-fail';await assert.rejects(client.identify(OVERLAP_POINT.latitude,OVERLAP_POINT.longitude),{status:502});
});

test('viewport quota is shared across slots but cannot exhaust parcel selection quota',async()=>{
  const db=new DatabaseSync(':memory:');db.exec("CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('owner');");
  const routes=[];const app={get:(...args)=>routes.push(args)};let selections=0,views=0;
  const clientFactory=()=>({regions:async()=>{views++;return {regions:[]};},labels:async()=>{views++;return {labels:[]};},search:async()=>{selections++;return {candidates:[]};}});
  installCadastre({app,db,required:()=>{},wrap:f=>f,clientFactory});installCadastre({app,db,required:()=>{},wrap:f=>f,clientFactory});
  const regionRoutes=routes.filter(r=>r[0]==='/api/cadastre/regions'),searchRoutes=routes.filter(r=>r[0]==='/api/cadastre/search');
  const response={setHeader(){},json(){}};const req={user:{id:'owner'},query:{number:NUMBER}};
  for(let i=0;i<60;i++)await regionRoutes[i%2][2](req,response);
  await assert.rejects(regionRoutes[0][2](req,response),{status:429});
  for(let i=0;i<24;i++)await searchRoutes[i%2][2](req,response);
  await assert.rejects(searchRoutes[0][2](req,response),{status:429});
  assert.equal(views,60);assert.equal(selections,24);db.close();
});

test('public Polygon and single MultiPolygon preserve cutouts, subtract their area and exclude hole taps',async()=>{
  const hole='(385240 5449440,385270 5449440,385270 5449470,385240 5449470,385240 5449440)';
  const outer=WKT.slice('MULTIPOLYGON('.length,-1);
  const polygon='POLYGON'+outer.slice(0,-1)+','+hole+')';
  const multi='MULTIPOLYGON('+outer.slice(0,-1)+','+hole+'))';
  const boundary=parcelBoundary(polygon,32645);
  assert.equal(boundary.coordinates.length,2);assert.deepEqual(parcelBoundary(multi,32645),boundary);
  const outerArea=boundaryAreaHa(parcelBoundary(WKT,32645)),cutoutArea=boundaryAreaHa({coordinates:[boundary.coordinates[1]]});
  assert.ok(Math.abs(boundaryAreaHa(boundary)-(outerArea-cutoutArea))<1e-10);assert.ok(boundaryAreaHa(boundary)<outerArea*.7);
  const client=createCadastreClient({readerFactory:()=>async path=>path.startsWith('/map/districts?')?CATALOG:path.startsWith('/geoserver/')?DISTRICTS:path.startsWith('/map/district?')?{}:{lands:[{...RESULT.lands[0],geometry:multi}]}});
  assert.equal((await client.search(NUMBER)).candidates[0].boundary.coordinates.length,2);
  assert.deepEqual((await client.identify(POINT.latitude,POINT.longitude)).candidates,[]);
  assert.equal((await client.identify(49.18715,85.4250)).candidates.length,1);
});
