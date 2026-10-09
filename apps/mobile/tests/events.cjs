// Isolated, deterministic UI regression coverage; never writes to production.
const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const origin=process.env.EGIN_URL||'http://localhost:4935';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Use an isolated local preview');
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});
 try {
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  let exchangeFails=false;
  await context.route('https://api.open-meteo.com/**',route=>route.fulfill({json:require('./fixtures/open-meteo.json')}));
  await context.route('**/api/**',route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(pathname==='/api/session')return route.fulfill({json:{user:{id:'events-test',name:'Проверка событий'}}});
   if(pathname==='/api/sync')return route.fulfill({json:{records:[],cursor:0,more:false,results:[]}});
   if(pathname==='/api/one-c')return exchangeFails?route.fulfill({status:503,json:{error:'Тест: временно нет связи'}}):route.fulfill({json:{connection:{status:'connected',checkedAt:Date.now()},runs:[{id:'failed',created:Date.now(),status:'error',createdCount:0,updatedCount:0,unchangedCount:0,skippedCount:0,error:'Отказ тестового обмена',issues:[]}]}});
   return route.fulfill({json:{items:[]}});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/#/events');
  await expect(page.getByRole('heading',{name:'Центр событий',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Ошибка обмена с 1С',exact:true})).toBeVisible();
  await page.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('egin-workspace-v1',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   const tx=db.transaction(['meta','records'],'readwrite');
   tx.objectStore('meta').put({key:'autoSync',value:false});
   const base={owner:'events-test',version:1,deleted:false,dirty:false,localRevision:1,updated:new Date().toISOString()};
   const field={...base,id:'field1',key:'events-test:field1',kind:'field',data:{name:'Северное поле',latitude:51,longitude:71,area:5,crop:'wheat'}};
   tx.objectStore('records').put(field);
   for(let i=0;i<35;i++)tx.objectStore('records').put({...base,id:'entry'+i,key:'events-test:entry'+i,kind:'entry',data:{title:'Архивная запись '+i,text:'Проверка истории',date:'2026-10-08',fieldId:'field1',assets:[]}});
   tx.objectStore('records').put({...field,id:'removed',key:'events-test:removed',deleted:true,dirty:true,conflict:{id:'removed',kind:'field',version:2,deleted:false,data:field.data}});
   tx.objectStore('records').put({...base,id:'queued',key:'events-test:queued',kind:'entry',deleted:true,dirty:true,data:{title:'Удалённая запись',text:'',date:'2026-10-08',fieldId:'field1',assets:[]}});
   tx.objectStore('records').put({...base,owner:'other-account',id:'private',key:'other-account:private',kind:'entry',data:{title:'Чужая секретная запись',text:'',date:'2026-10-09',fieldId:'',assets:[]}});
   await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();window.dispatchEvent(new Event('egin-data'));
  });
  await expect(page.getByRole('heading',{name:'Нужно сверить изменения',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Изменения ожидают отправки',exact:true})).toBeVisible();
  await expect(page.locator('.event-card')).toHaveCount(30);
  await page.getByRole('button',{name:/Показать ещё/}).click();
  await expect(page.locator('.event-card').filter({hasText:'Open-Meteo'})).toHaveCount(1);
  await expect(page.locator('.event-card')).toHaveCount(39);
  await expect(page.getByText('Чужая секретная запись',{exact:true})).toHaveCount(0);
  await page.getByRole('searchbox',{name:'Поиск по событиям'}).fill('  АРХИВНАЯ  запись 34');
  await expect(page.locator('.event-card')).toHaveCount(1);
  await page.getByRole('combobox',{name:/^Источник/}).selectOption('weather');
  await expect(page.getByRole('heading',{name:'Нет событий с такими фильтрами'})).toBeVisible();
  await page.getByRole('button',{name:'Сбросить фильтры'}).click();
  await page.getByRole('combobox',{name:/^Участок/}).selectOption('field1');
  await expect(page.getByRole('button',{name:'Внимание 0',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Сбросить фильтры'}).click();
  exchangeFails=true;
  await page.getByRole('button',{name:'Обновить события',exact:true}).click();
  await expect(page.getByText('Тест: временно нет связи',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Ошибка обмена с 1С',exact:true})).toBeVisible();
  await expect(page.locator('.event-card').filter({hasText:'Ошибка обмена с 1С'})).toContainText('Показан предыдущий ответ');
  await expect(page.getByRole('button',{name:'Внимание 1',exact:true})).toBeVisible();
  for(const width of [320,360,390,430]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  assert.deepEqual(errors,[]);
  console.log('PASS events: retained stale 1C history, deleted sync conflicts, queue, owner isolation, search/filter reset, contextual counts, pagination and 320–430px layout');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
