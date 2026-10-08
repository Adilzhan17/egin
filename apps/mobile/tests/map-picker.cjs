// Deterministic UI fixtures; live cadastral transport is verified separately.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=process.env.EGIN_URL||'http://localhost:4935';
if(!['localhost','127.0.0.1','dev-egin.perricheno.com'].includes(new URL(origin).hostname))throw Error('Use isolated preview or staging');
const out=process.env.EGIN_MAP_SCREENSHOTS||path.resolve(__dirname,'../../../test-results/map');
const number='05071008125';
const boundary={type:'Polygon',coordinates:[[[85.4252,49.1869],[85.4259,49.1869],[85.4259,49.1874],[85.4252,49.1874],[85.4252,49.1869]]]};
const candidate={cadastralNumber:number,region:'Восточно-Казахстанская область',district:'Катон-Карагайский район',boundary,areaHa:.25,source:'public-map',ownershipVerified:false};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJz4AAAAASUVORK5CYII=','base64');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',permissions:['geolocation'],geolocation:{latitude:49.18715,longitude:85.4254,accuracy:5}});
  const records=new Map();let identifyCalls=0,searchMode='ok',searchCalls=0;
  await context.route('https://api.open-meteo.com/**',r=>r.fulfill({json:require('./fixtures/open-meteo.json')}));
  await context.route('https://tile.openstreetmap.org/**',r=>r.fulfill({contentType:'image/png',body:png}));
  await context.route('**/api/**',async r=>{
   const u=new URL(r.request().url()),p=u.pathname;
   if(p==='/api/session')return r.fulfill({json:{user:{id:'map-ui-test',name:'Проверка карты'},rpID:'localhost',origin}});
   if(p==='/api/sync'){
    if(r.request().method()==='GET')return r.fulfill({json:{records:[...records.values()],cursor:records.size,more:false}});
    const results=r.request().postDataJSON().records.map(row=>{const version=(records.get(row.id)?.version||0)+1;records.set(row.id,{...row,version});return{id:row.id,version};});return r.fulfill({json:{results}});
   }
   if(p==='/api/cadastre/search'||p==='/api/cadastre/identify'){
    if(p.endsWith('search'))searchCalls++;else{identifyCalls++;assert.ok(Number.isFinite(Number(u.searchParams.get('latitude'))));assert.ok(Number.isFinite(Number(u.searchParams.get('longitude'))));for(const key of ['latitude','longitude'])assert.match(u.searchParams.get(key),/^-?\d+\.\d{8}$/);}
    if(searchMode==='error')return r.fulfill({status:502,json:{error:'Кадастр временно недоступен. Повторите поиск.'}});
    if(searchMode==='slow')await new Promise(resolve=>setTimeout(resolve,600));
    return r.fulfill({json:{candidates:searchMode==='empty'?[]:[candidate],mapDistrict:{id:83,code:'071',srid:32645},ownershipVerified:false}});
   }
   if(p==='/api/cadastre/labels')return r.fulfill({json:{labels:[{number,latitude:49.18715,longitude:85.4254}]}});
   if(p.startsWith('/api/cadastre/tiles/'))return r.fulfill({contentType:'image/png',body:png});
   return r.fulfill({json:{}});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/#/fields');await page.getByRole('heading',{name:'Участки',exact:true}).waitFor();
  await page.getByRole('button',{name:'Добавить участок',exact:true}).first().click();
  const dialog=page.getByRole('dialog',{name:'Добавить участок',exact:true});await dialog.waitFor();assert.equal(await page.locator('iframe').count(),0);
  async function layout(width,height,selected=false){
   await page.setViewportSize({width,height});await page.waitForTimeout(100);
   const bounds=await dialog.boundingBox(),input=await dialog.getByLabel('Кадастровый номер',{exact:true}).first().boundingBox(),map=await dialog.locator('.field-map').boundingBox();
   assert.ok(bounds.x>=-1&&bounds.y>=-1&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1,JSON.stringify({bounds,width,height}));
   assert.ok(input.y>=0&&input.y+input.height<Math.min(height,230),'search must remain visible');
   assert.ok(map.height>=80,'map retains usable height');
   assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'no horizontal overflow');
   if(selected){const button=await dialog.getByRole('button',{name:'Добавить этот участок',exact:true}).boundingBox();assert.ok(button.y>=0&&button.y+button.height<=height+1,'save must stay visible');}
  }
  for(const [w,h]of[[320,568],[360,740],[390,844],[430,932]])await layout(w,h);
  await page.setViewportSize({width:390,height:844});
  await dialog.getByLabel('Кадастровый номер',{exact:true}).fill(number);await dialog.getByRole('button',{name:'Найти границы',exact:true}).click();
  await dialog.getByRole('button',{name:'Добавить этот участок',exact:true}).waitFor();
  for(const [w,h]of[[320,568],[390,844],[430,932]])await layout(w,h,true);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'number-result.png')});
  // Number labels stay readable; selecting a neighbour also works from number search.
  await dialog.locator('.land-parcel-label span').filter({hasText:number}).first().waitFor();
  const hit=page.waitForResponse(r=>r.url().includes('/api/cadastre/identify?'));
  const canvas=dialog.locator('.field-map'),box=await canvas.boundingBox();
  await canvas.click({position:{x:box.width*.1,y:box.height*.85}});await hit;
  await dialog.getByRole('button',{name:'Добавить этот участок',exact:true}).waitFor();
  assert.equal(await dialog.getByRole('tab',{name:'На карте',exact:true}).getAttribute('aria-selected'),'true');
  // Failure cannot leave the previous result available to save.
  searchMode='error';await dialog.getByRole('button',{name:'Найти границы',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByRole('button',{name:'Добавить этот участок',exact:true}).count(),0);
  searchMode='empty';await dialog.getByRole('button',{name:'Найти границы',exact:true}).click();await dialog.getByText(/Участок.*не найден/).waitFor();
  searchMode='ok';await dialog.getByRole('tab',{name:'На карте',exact:true}).click();await dialog.getByRole('button',{name:'Моё местоположение',exact:true}).click();
  await page.waitForTimeout(250);const map=dialog.locator('.field-map');await map.click({position:{x:145,y:190}});
  await dialog.getByRole('button',{name:'Добавить этот участок',exact:true}).waitFor();assert.equal(identifyCalls,2);
  await dialog.getByRole('button',{name:'Изменить название и посмотреть данные',exact:true}).click();await dialog.getByLabel('Название',{exact:true}).fill('Участок на карте');await dialog.getByRole('button',{name:'Скрыть данные участка',exact:true}).click();
  await dialog.getByRole('button',{name:'Добавить этот участок',exact:true}).click();await dialog.waitFor({state:'detached'});await page.locator('.land-detail h2').filter({hasText:'Участок на карте'}).waitFor();
  await page.reload();await page.locator('.land-detail h2').filter({hasText:'Участок на карте'}).waitFor();
  await page.getByRole('button',{name:'Добавить участок',exact:true}).first().click();await dialog.getByLabel('Кадастровый номер',{exact:true}).fill(number);await dialog.getByRole('button',{name:'Найти границы',exact:true}).click();await dialog.getByRole('button',{name:'Уже добавлен · открыть участок',exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:'Добавить этот участок',exact:true}).count(),0);
  await dialog.getByRole('button',{name:'Другие способы добавления',exact:true}).click();await dialog.getByRole('button',{name:'Попробовать на демо-карте',exact:true}).click();await dialog.getByLabel('Выберите участок',{exact:true}).selectOption('1');await dialog.getByRole('button',{name:'Сохранить демо-участок',exact:true}).waitFor();await page.screenshot({path:path.join(out,'demo-selection.png')});
  // A late response after close must not save anything or reopen the dialog.
  searchMode='slow';await dialog.getByRole('button',{name:'Найти границы',exact:true}).click();await dialog.getByRole('button',{name:'Закрыть выбор участка',exact:true}).click();await page.waitForTimeout(750);assert.equal(await page.getByRole('dialog').count(),0);
  assert.ok(searchCalls>=5);assert.deepEqual(errors,[]);
  console.log('PASS map UI fixtures: 320–430px, visible search/save, number lookup, point selection from both tabs, labels, errors/empty, persistence, duplicates, demo, late-response close.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
