import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {once} from 'node:events';
import {suggestLocal,correctedTerm,createPlaceSearch,addressContext,installSearch} from '../src/search/index.mjs';
import {normalizeMarketQuery} from '../src/market/search.mjs';

test('Prefixes, genuine typos, wrong keyboard and unknown words',()=>{
 const prefix=suggestLocal('тр','terms');assert.equal(prefix[0].name,'Трактор');assert.ok(prefix.some(p=>p.name==='Триммер'));assert.ok(prefix.slice(0,4).every(p=>p.name.toLowerCase().startsWith('тр')));
 assert.equal(suggestLocal('тррарктр','terms')[0].name,'Трактор');assert.equal(correctedTerm('тррарктр'),'трактор');assert.ok(normalizeMarketQuery('тррарктр').includes('трактор'));assert.equal(correctedTerm('Трактор'),undefined);assert.equal(correctedTerm('алм'),undefined);
 assert.equal(suggestLocal('nhfrnjh','terms')[0].name,'Трактор');assert.deepEqual(suggestLocal('zzxxqqzzxxqq','terms'),[]);assert.deepEqual(suggestLocal('т','terms'),[]);
});
test('Local gazetteer returns actual cities and districts, with RU/KK names and typos',()=>{
 for(const q of ['Кызылорда','Кызлорда','Қызылорда']){const city=suggestLocal(q,'places')[0];assert.equal(city.id,'geonames:1519922');assert.ok(Math.abs(city.latitude-44.85)<.02);}
 assert.equal(suggestLocal('Астна','places')[0].name,'Астана');assert.equal(suggestLocal('Алм','places')[0].name,'Алматы');assert.ok(suggestLocal('Сарыагашский район','places').some(p=>p.kind==='district'));
 assert.equal(addressContext('Астана, проспект Абая 10').city.name,'Астана');assert.equal(addressContext('Астана, проспект Абая 10').remainder,'проспект абая 10');
});
test('Address lookup is explicit, city-bounded, cached and never invents coordinates',async()=>{
 let calls=0;
 const search=createPlaceSearch({fetcher:async url=>{calls++;assert.equal(url.searchParams.get('countrycode'),'KZ');assert.equal(url.searchParams.get('q'),'Алматы абая 10');assert.ok(Number(url.searchParams.get('bbox').split(',')[0])>76);return {ok:true,json:async()=>({features:[{properties:{osm_id:1,osm_type:'W',countrycode:'KZ',street:'улица Абая',housenumber:'10',city:'Алматы'},geometry:{coordinates:[76.78,43.21]}},{properties:{name:'Invalid'},geometry:{coordinates:[900,500]}}]})};}});
 await search('Алматы');await search('Алматы',{online:true});assert.equal(calls,0);
 const result=await search('Алматы Абая 10',{online:true});assert.equal(calls,1);assert.equal(result.items[0].name,'улица Абая, 10');assert.equal(result.items[0].latitude,43.21);assert.equal(result.items[0].longitude,76.78);assert.equal(result.items[0].kind,'address');assert.ok(!result.items.some(p=>p.name==='Invalid'));
 await search('Алматы Абая 10',{online:true});assert.equal(calls,1);
});
test('Geocoder failure keeps the matching city, not fabricated street data',async()=>{
 const search=createPlaceSearch({fetcher:async()=>{throw Error('Network unavailable');}}),result=await search('Алматы Абая 10',{online:true});assert.equal(result.online,false);assert.ok(result.warning);assert.equal(result.items[0].name,'Алматы');assert.ok(result.items.every(p=>p.source==='GeoNames'));
});
test('Suggestion endpoint is usable without marketplace database and validates input',async()=>{
 const app=express();installSearch({app,wrap:fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next)});const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
 try{const result=await(await fetch(origin+'/api/search/suggest?scope=terms&q='+encodeURIComponent('тррарктр'))).json();assert.equal(result.items[0].name,'Трактор');assert.match(result.mode,/local-(hybrid|fuzzy)/);assert.equal((await fetch(origin+'/api/search/suggest?q='+('a'.repeat(161)))).status,400);assert.equal((await fetch(origin+'/api/search/suggest?scope=bad&q=test')).status,400);}finally{server.close();await once(server,'close');}
});
