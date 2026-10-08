import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import proj4 from 'proj4';
import { projectedTileBbox, warpCadastreTile } from '../src/cadastre-raster.mjs';

const SIZE = 256, srid = 32645;
const point = [85.4254, 49.18715];
const center = proj4('EPSG:4326', 'EPSG:3857', point);
const bbox = [center[0]-150,center[1]-150,center[0]+150,center[1]+150];
const sourceBbox = projectedTileBbox(bbox,srid);
const parameters = {bbox,sourceBbox,srid};
const encode = (data=Buffer.alloc(SIZE*SIZE*4)) => PNG.sync.write({width:SIZE,height:SIZE,data});

test('UTM raster reprojection places a known parcel point at its Web Mercator location', () => {
  const data = Buffer.alloc(SIZE*SIZE*4);
  // Independently measured coordinates from the public-map point lookup.
  const utm = [385263.9925619437,5449454.07336924];
  const u = (utm[0]-sourceBbox[0])/(sourceBbox[2]-sourceBbox[0])*SIZE;
  const v = (sourceBbox[3]-utm[1])/(sourceBbox[3]-sourceBbox[1])*SIZE;
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(Math.hypot(x+.5-u,y+.5-v)<4){
    const at=(y*SIZE+x)*4;data[at+1]=180;data[at+3]=255;
  }
  const out=PNG.sync.read(warpCadastreTile(encode(data),parameters));
  assert.equal(out.width,SIZE);assert.equal(out.height,SIZE);
  let weightedX=0,weightedY=0,weight=0;
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const alpha=out.data[(y*SIZE+x)*4+3];weightedX+=(x+.5)*alpha;weightedY+=(y+.5)*alpha;weight+=alpha;
  }
  assert.ok(weight>1000);assert.ok(Math.abs(weightedX/weight-128)<.6);assert.ok(Math.abs(weightedY/weight-128)<.6);
  assert.equal(out.data[(127*SIZE+127)*4+1],180);
});

test('reprojection preserves transparent tiles and opaque edges with padded source bounds',()=>{
  assert.ok(PNG.sync.read(warpCadastreTile(encode(),parameters)).data.every(v=>v===0));
  const solid=Buffer.alloc(SIZE*SIZE*4);for(let i=0;i<solid.length;i+=4){solid[i]=20;solid[i+1]=80;solid[i+2]=40;solid[i+3]=255;}
  const out=PNG.sync.read(warpCadastreTile(encode(solid),parameters)).data;
  for(let i=0;i<out.length;i+=4){assert.equal(out[i],20);assert.equal(out[i+1],80);assert.equal(out[i+2],40);assert.equal(out[i+3],255);}
});

test('PNG dimensions, compression format, integrity, size and coordinate systems are bounded',()=>{
  const valid=encode();
  for(const input of [Buffer.from('not PNG'),Buffer.alloc(1024*1024+1),valid.subarray(0,valid.length-4)])assert.throws(()=>warpCadastreTile(input,parameters),{status:502});
  for(const [offset,value] of [[16,1],[24,16],[25,2],[28,1]]){
    const altered=Buffer.from(valid);altered[offset]=value;
    assert.throws(()=>warpCadastreTile(altered,parameters),{status:502});
  }
  // Validly compressed extra scanline with a claimed 256px height must fail
  // the bounded native inflate before PNG decoding can allocate extra pixels.
  const overflow=PNG.sync.write({width:SIZE,height:SIZE+1,data:Buffer.alloc(SIZE*(SIZE+1)*4)});
  overflow.writeUInt32BE(SIZE,20);
  assert.throws(()=>warpCadastreTile(overflow,parameters),error=>error.status===502 && /прочитать/.test(error.message));
  const corrupted=Buffer.from(valid);corrupted[29]^=1;
  assert.throws(()=>warpCadastreTile(corrupted,parameters),{status:502});
  assert.throws(()=>projectedTileBbox(bbox,4326),{status:502});
  assert.throws(()=>projectedTileBbox([NaN,1,2,3],srid),{status:502});
  assert.throws(()=>warpCadastreTile(valid,{...parameters,sourceBbox:[1,1,0,0]}),{status:502});
});
