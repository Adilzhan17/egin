import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEvents, filterEvents } from '../src/features/events/events.ts';
import type { LiveWeatherReport } from '../src/entities/weather/live-types.ts';
import type { Row, Field, Data } from '../src/entities/workspace/types.ts';
const now=Date.parse('2026-10-09T09:00:00Z');
const field:Row<Field>={id:'field1',key:'user:field1',owner:'user',kind:'field',version:1,deleted:false,dirty:false,localRevision:1,updated:'2026-10-08T09:00:00Z',data:{name:'Поле',latitude:51,longitude:71,area:1,crop:'wheat'}};
const report={source:'open-meteo',fetchedAt:now,location:{name:'Поле',latitude:51,longitude:71,timezone:'Asia/Almaty'},current:{time:new Date(now).toISOString(),condition:'snow',description:'Снег',temperature:-2,wind:8,gust:10,rain:0}} as LiveWeatherReport;
test('weather is bound to matching field coordinates and stale warnings become saved information',()=>{
  assert.equal(buildEvents({rows:[],report,now}).length,0);
  assert.equal(buildEvents({rows:[],report:{...report,location:{...report.location,latitude:52}},activeField:field,now}).length,0);
  const [event]=buildEvents({rows:[],report,activeField:field,now});
  assert.equal(event.severity,'attention');assert.equal(event.fieldId,'field1');assert.equal(event.at,report.current.time);
  assert.match(event.description,/расчёт модели/);
  assert.equal(buildEvents({rows:[],report,activeField:field,now:now+4*3600000})[0].severity,'info');
  assert.match(buildEvents({rows:[],report,activeField:field,now,cached:true})[0].title,/Сохранённые/);
});
test('unknown sensor telemetry is not reported as offline and record history remains accessible',()=>{
  const sensor:Row<Data>={...field,id:'sensor1',key:'sensor1',kind:'sensor',data:{name:'Датчик',serial:'123',type:'moisture',fieldId:field.id}};
  const entry:Row<Data>={...field,id:'entry1',key:'entry1',kind:'entry',data:{title:'Обработка',text:'Описание',date:'2026-10-07',fieldId:field.id,assets:['photo1']}};
  const events=buildEvents({rows:[sensor,entry,{...entry,id:'deleted',deleted:true}],report:null,now});
  assert.equal(events.length,2);assert.equal(events.find(e=>e.source==='sensor')?.severity,'info');
  assert.match(events.find(e=>e.source==='sensor')!.description,/неизвестны/);
  assert.deepEqual(events.find(e=>e.source==='history')?.assets,['photo1']);
  assert.equal(filterEvents(events,{source:'history',fieldId:'field1'}).length,1);
  assert.equal(filterEvents(events,{severity:'attention'}).length,0);
  assert.equal(filterEvents(events,{fieldId:'another'}).length,0);
});
test('real sync conflicts and 1C run history retain timestamps and errors',()=>{
  const conflict={...field,conflict:{id:field.id,kind:'field' as const,version:2,data:field.data,deleted:false}};
  const events=buildEvents({rows:[conflict],report:null,now,exchange:{connection:{status:'connected',checkedAt:now},runs:[{id:'run1',created:now-1000,status:'error',createdCount:0,updatedCount:0,unchangedCount:0,skippedCount:0,error:'Недостаточно прав',issues:[]}]}});
  assert.equal(events.length,2);assert.equal(events[0].id,'one-c:run1');assert.equal(events[0].description,'Недостаточно прав');
  assert.equal(filterEvents(events,{severity:'attention'}).length,2);
  assert.equal(filterEvents(events,{fieldId:field.id}).length,1);
  assert.equal(events.find(e=>e.source==='sync')?.at,new Date(field.updated).toISOString());
});

test('old failed runs are history after a successful run or disconnect',()=>{
  const failed={id:'failed',created:now-1000,status:'error',createdCount:0,updatedCount:0,unchangedCount:0,skippedCount:0,error:'Ошибка',issues:[]};
  const succeeded={...failed,id:'success',created:now,status:'success',error:undefined};
  const events=buildEvents({rows:[],report:null,exchange:{connection:{status:'connected',checkedAt:now},runs:[failed,succeeded]}});
  assert.equal(events.length,2);assert.equal(filterEvents(events,{severity:'attention'}).length,0);
  assert.equal(buildEvents({rows:[],report:null,exchange:{connection:null,runs:[failed]}})[0].severity,'info');
});

test('demonstration parcels never turn modeled weather into live warnings on owned land',()=>{
  const demo={...field,data:{...field.data,cadastre:{source:'demo' as const,importedAt:new Date(now).toISOString()}}};
  const events=buildEvents({rows:[demo],report,activeField:demo,now});
  assert.equal(filterEvents(events,{severity:'attention'}).length,0);
  assert.match(events.find(e=>e.source==='weather')!.description,/не ваши земли/);
  assert.match(events.find(e=>e.source==='land')!.description,/не сведения государственного кадастра/);
});
