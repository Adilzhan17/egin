import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import pngjs from 'pngjs';
import { DatabaseSync } from 'node:sqlite';
import { cadastreTileParameters, createCadastreTileReader, createCadastreTileCache, installCadastreTiles } from '../src/cadastre-tiles.mjs';
const params = () => cadastreTileParameters('16', '45683', '21648', '1', '32642');
function png() {
  const image = new pngjs.PNG({ width: 256, height: 256 }); image.data.fill(255); return pngjs.PNG.sync.write(image);
}

test('fixed public WMS origin, layers and bounded Kazakhstan geometry only', () => {
  const p = params(), u = new URL(p.url);
  assert.equal(u.origin, 'https://map.gov4c.kz'); assert.equal(u.pathname, '/geoserver/egkn/wms');
  assert.equal(u.searchParams.get('VIEWPARAMS'), 'district_id:1');
  assert.equal(u.searchParams.get('LAYERS'), 'egkn:u_view');
  assert.equal(u.searchParams.get('SRS'), 'EPSG:32642');
  assert.equal(u.searchParams.get('projection'), 'EPSG:32642');
  assert.equal(u.searchParams.get('WIDTH'), '256');
  const [w,s,e,n] = u.searchParams.get('BBOX').split(',').map(Number);
  assert.ok(e > w && n > s && e - w < 612);
  assert.throws(() => cadastreTileParameters('16','45683','21648','1','4326'), {status:400});
  for (const args of [ ['13','4568','2164','1'], ['21','45683','21648','1'], ['16','65536','21648','1'], ['16','45683','-1','1'], ['16','45683','21648','1;other:1'], ['16','45683','21648',['1']], ['16','45683','21648','10001'], ['16','0','0','1'] ]) assert.throws(() => cadastreTileParameters(...args, '32642'), { status: 400 });
});

test('PNG transport retains TLS verification and rejects redirect, upstream errors, invalid dimensions and oversized payload', async () => {
  let status = 200, body = png(), type = 'image/png'; const calls = [];
  const request = (url, options, callback) => {
    calls.push({url,options}); const req = new EventEmitter(); req.setTimeout = () => {}; req.destroy = () => req.emit('error',new Error('upstream details secret'));
    req.end = () => queueMicrotask(() => {
      const res = new EventEmitter(); res.statusCode = status; res.headers = {'content-type':type}; res.resume = () => {};
      callback(res); res.emit('data',body); res.emit('end');
    }); return req;
  };
  const read = createCadastreTileReader({request});
  const rendered = await read(params()); assert.equal(pngjs.PNG.sync.read(rendered).width, 256);
  assert.equal(calls[0].options.rejectUnauthorized, true); assert.ok(calls[0].options.ca.length > 1);
  assert.equal(calls[0].options.headers.Cookie, undefined); assert.equal(calls[0].options.headers.Authorization, undefined);
  for (const badStatus of [302,401,500]) { status = badStatus; await assert.rejects(read(params()), {status:502}); }
  status = 200; type = 'text/xml'; await assert.rejects(read(params()), {status:502});
  type = 'image/png'; body = Buffer.from('<secret>not an image</secret>'); await assert.rejects(read(params()), {status:502});
  body = png(); body.writeUInt32BE(4096,16); await assert.rejects(read(params()), {status:502});
  body = Buffer.alloc(1024*1024+1); await assert.rejects(read(params()), error => error.status === 502 && !/secret/.test(error.message));
});

test('public raster cache deduplicates in-flight loads, expires and evicts beyond 128 tiles', async () => {
  let calls = 0, clock = 0;
  const read = createCadastreTileCache({read:async () => { calls++; await Promise.resolve(); return png(); },now:()=>clock});
  await Promise.all([read({key:'a'}),read({key:'a'})]); assert.equal(calls,1);
  await read({key:'a'}); assert.equal(calls,1);
  clock = 300001; await read({key:'a'}); assert.equal(calls,2);
  for (let i=0;i<128;i++) await read({key:String(i)});
  await read({key:'a'}); assert.equal(calls,131);
});

test('tile route requires main session and SQLite owner quota is shared across installs', async () => {
  const db = new DatabaseSync(':memory:'); db.exec("CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('alice'),('bob')");
  const routes=[]; let reads = 0;
  const required = Symbol('required');
  const install = () => installCadastreTiles({app:{get:(...args)=>routes.push(args)},db,required,wrap:fn=>fn,readTile:async()=>{ reads++; return png(); }});
  install(); install(); assert.equal(routes[0][1],required); assert.equal(routes[0][0],'/api/cadastre/tiles/:z/:x/:y.png');
  const headers={}; const res={setHeader:(k,v)=>headers[k]=v,type:()=>res,send:()=>{}};
  const req={params:{z:'16',x:'45683',y:'21648'},query:{district:'1',srid:'32642'},user:{id:'alice'}};
  for(let i=0;i<240;i++) await routes[i%2][2](req,res);
  await assert.rejects(routes[1][2](req,res),{status:429}); assert.equal(reads,240); assert.equal(headers['Retry-After'],'60');
  await routes[1][2]({...req,user:{id:'bob'}},res); assert.equal(reads,241); assert.equal(headers['Cache-Control'],'private, max-age=300');
  db.close();
});

test('failed tiles are retryable and pending upstream work stays bounded', async () => {
  let attempts = 0;
  const retry = createCadastreTileCache({read:async()=>{if (++attempts === 1) throw new Error('temporary'); return png();}});
  await assert.rejects(retry({key:'retry'})); await retry({key:'retry'}); assert.equal(attempts,2);
  let release; const gate = new Promise(resolve=>release=resolve);
  const bounded = createCadastreTileCache({read:async()=>{await gate;return png();}});
  const pending = Array.from({length:32},(_,i)=>bounded({key:String(i)}));
  await assert.rejects(bounded({key:'overflow'}),{status:503});
  release(); await Promise.all(pending);
});
