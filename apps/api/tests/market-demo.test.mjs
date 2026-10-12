import test from 'node:test';
import assert from 'node:assert/strict';
import {assertDemoTarget,loadDemoCatalog,demoId,seedDemo} from '../src/market/seed-demo.mjs';
import {uuid} from '../src/market/validation.mjs';

test('Demo import requires explicit production opt-in and a matching environment', async()=>{
  for(const [environment,rpID] of [['production','egin.perricheno.com'],['staging','egin.perricheno.com'],['local','dev-egin.perricheno.com'],[undefined,'localhost']]) {
    assert.throws(()=>assertDemoTarget(environment,rpID));
    await assert.rejects(()=>seedDemo({environment,rpID,dataDir:'/must-not-be-created',databaseUrl:'postgresql://unreachable'}));
  }
  assert.doesNotThrow(()=>assertDemoTarget('staging','dev-egin.perricheno.com'));
  assert.doesNotThrow(()=>assertDemoTarget('local','localhost'));
  assert.doesNotThrow(()=>assertDemoTarget('production','egin.perricheno.com',true));
  assert.throws(()=>assertDemoTarget('production','dev-egin.perricheno.com',true));
});

test('Demo catalog has valid publication data, credited decodable photos and collision-free repeatable IDs',async()=>{
  const {listings,photos}=await loadDemoCatalog();
  assert.ok(listings.length>=32);
  assert.ok(photos.size>=12);
  const ids=listings.map(item=>demoId(item.key));
  assert.equal(new Set(ids).size,ids.length);
  assert.ok(ids.every(uuid));
  for(const item of listings) {
    assert.equal(demoId(item.key),demoId(item.key));
    assert.match(item.description,/Демонстрационное объявление/);
    assert.equal(item.allowPhone,false);
    assert.equal(item.contactPhone,'');
    assert.ok(item.regionCode&&item.districtCode);
    for(const key of item.photos) {
      const photo=photos.get(key);
      assert.ok(photo.full.info.width>=300&&photo.full.info.width<=1000);
      assert.ok(photo.full.info.height>=200&&photo.full.info.height<=1000);
      assert.equal(photo.full.info.format,'webp');
      assert.ok(photo.thumb.length>1000);
      assert.ok(item.description.includes(photo.sourceUrl));
    }
  }
});
