import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fieldScene} from '../src/entities/workspace/cultivation.ts';
import type {Field} from '../src/entities/workspace/types.ts';
const field:Field={name:'Поле',latitude:51,longitude:71,area:1,crop:'wheat'};
test('each field defines its own crop and explicit growth stage',()=>{
  for(const crop of ['wheat','tomato','apple','sunflower'] as const)for(const [stage,index] of [['seedling',0],['vegetative',1],['mature',3]] as const){
    const result=fieldScene({...field,crop,cultivation:{seasonId:'2026',stage}});
    assert.equal(result.crop,crop);assert.equal(result.stage,index);assert.equal(result.illustrative,false);
  }
});
test('unknown growth stays unknown even when planting date exists; example is explicitly marked',()=>{
  const result=fieldScene({...field,crop:'apple',cultivation:{seasonId:'2026',plantedOn:'2020-03-01'}});
  assert.equal(result.crop,'apple');assert.equal(result.illustrative,true);assert.match(result.stageLabel,/неизвестна/);
  assert.equal(fieldScene().illustrative,true);assert.equal(fieldScene({...field,crop:'unknown'}).crop,'wheat');
});
