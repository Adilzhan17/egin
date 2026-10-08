import test from 'node:test';
import assert from 'node:assert/strict';
import { measureBoundary,parseLandGeoJSON,DEMO_PARCELS,boundaryContainsPoint } from '../src/entities/workspace/land.ts';
const ring=[[71,51],[71.01,51],[71.01,51.01],[71,51.01],[71,51]];
const geometry={type:'Polygon',coordinates:[ring]};
test('GeoJSON preserves boundaries and computes hectare area and center regardless of winding',()=>{
 const a=measureBoundary(geometry),b=measureBoundary({type:'Polygon',coordinates:[[...ring].reverse()]});
 assert.ok(a.area>77&&a.area<79);assert.equal(a.area,b.area);assert.ok(Math.abs(a.latitude-51.005)<1e-8);assert.ok(Math.abs(a.longitude-71.005)<1e-8);
 const parsed=parseLandGeoJSON(JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{name:'Поле А',cadastral_number:'01:002:003'},geometry},{type:'Feature',properties:{source:'demo'},geometry}]}));assert.equal(parsed.length,2);assert.equal(parsed[0].name,'Поле А');assert.equal(parsed[0].number,'01:002:003');assert.equal(parsed[1].demo,true);assert.deepEqual(parsed[0].boundary,geometry);
});
test('rejects invalid WGS84, open, self-crossing, duplicate, invalid holes and degenerate polygons',()=>{
 for(const coords of [ring.slice(0,-1),[[0,0],[1,1],[1,0],[0,1],[0,0]],[[0,0],[1,0],[0,0],[0,1],[0,0]],[[0,0],[1,0],[2,0],[0,0]],[[0,0],[181,0],[0,1],[0,0]],[[0,0],[1,NaN],[0,1],[0,0]],[[0,0],[1,0],[0.5,0],[0,1],[0,0]]])assert.throws(()=>measureBoundary({type:'Polygon',coordinates:[coords]}));
 assert.throws(()=>measureBoundary({type:'Polygon',coordinates:[ring,ring]}),/вырезы/);assert.throws(()=>measureBoundary({type:'Point',coordinates:[71,51]}));
 assert.throws(()=>parseLandGeoJSON(JSON.stringify({type:'Feature',crs:{type:'name'},geometry})),/crs/);
});
test('bounded imports reject oversized, empty, excessive files and preserve synthetic demo identity',()=>{
 assert.throws(()=>parseLandGeoJSON('x'.repeat(2*1024*1024+1)),/2 МБ/);assert.throws(()=>parseLandGeoJSON('{'),/прочитать/);assert.throws(()=>parseLandGeoJSON('{"type":"FeatureCollection","features":[]}'));
 assert.throws(()=>parseLandGeoJSON(JSON.stringify({type:'FeatureCollection',features:Array(201).fill(geometry)})),/200/);
 assert.equal(DEMO_PARCELS.length,2);assert.ok(DEMO_PARCELS.every(p=>p.area>0&&!p.number));
});

test('holes survive imports, subtract hectares and keep the representative point on land',()=>{
 const hole=[[71.002,51.002],[71.008,51.002],[71.008,51.008],[71.002,51.008],[71.002,51.002]];
 const shape={type:'Polygon',coordinates:[ring,hole]};
 const measured=measureBoundary(shape),outer=measureBoundary(geometry),cutout=measureBoundary({type:'Polygon',coordinates:[hole]});
 assert.ok(Math.abs(measured.area-(outer.area-cutout.area))<.00011);
 assert.deepEqual(measured.boundary,shape);
 assert.equal(boundaryContainsPoint(measured.boundary,[71.005,51.005]),false);
 assert.equal(boundaryContainsPoint(measured.boundary,[measured.longitude,measured.latitude]),true);
 const reverse=measureBoundary({type:'Polygon',coordinates:[ring.slice().reverse(),hole.slice().reverse()]});assert.equal(reverse.area,measured.area);
 const multi=measureBoundary({type:'MultiPolygon',coordinates:[[ring,hole]]});assert.deepEqual(multi.boundary,shape);
 assert.deepEqual(parseLandGeoJSON(JSON.stringify({type:'Feature',geometry:shape}))[0].boundary,shape);
 for(const rings of [[ring,hole.map(([x,y])=>[x+.02,y])],[ring,hole.map(([x,y])=>[x-.002,y])],[ring,hole,hole],[ring,hole,[[71.003,51.003],[71.004,51.003],[71.004,51.004],[71.003,51.004],[71.003,51.003]]],[ring,...Array(400).fill(hole)]])assert.throws(()=>measureBoundary({type:'Polygon',coordinates:rings}));
 assert.throws(()=>measureBoundary({type:'MultiPolygon',coordinates:[[ring],[ring]]}),/нескольких/);
});
