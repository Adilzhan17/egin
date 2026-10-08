// Descriptive EGKN snapshot: preview, persistence, refresh and unavailable fields.
const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const origin=process.env.EGIN_URL||'http://localhost:4935';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Use an isolated preview');
const number='010170041505';
const boundary={type:'Polygon',coordinates:[[[70.429,52.614],[70.431,52.614],[70.431,52.616],[70.429,52.616],[70.429,52.614]]]};
const details={sourceUrl:'https://map.gov4c.kz/egkn/',fetchedAt:'2026-10-09T00:00:00.000Z',cadastralNumber:number,region:'Акмолинская область',district:'Макинск',address:'Тестовый адрес участка',addressKz:'Сынақ мекенжайы',addressCode:'TEST-ADDRESS',category:'Земли промышленности, транспорта, связи, для нужд космической деятельности, обороны, национальной безопасности и иного несельскохозяйственного назначения',purpose:'для размещения, обслуживания зданий, сооружений и железнодорожного пути',purposeKz:'Сынақ нысаналы мақсаты',rightType:'частная собственность',registeredAreaHa:6.721811046963875,perimeterM:1779.7425992590129,costKzt:2459064,status:'unknown',owners:{availability:'not_provided',items:[]},encumbrances:{availability:'not_provided',items:[]}};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJz4AAAAASUVORK5CYII=','base64');
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});
 try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',permissions:['clipboard-read','clipboard-write']});
 const records=new Map();let mode='ok',lookupCount=0;
 await context.route('https://api.open-meteo.com/**',r=>r.fulfill({json:require('./fixtures/open-meteo.json')}));
 await context.route('**/api/**',r=>{
  const p=new URL(r.request().url()).pathname;
  if(p==='/api/session')return r.fulfill({json:{user:{id:'passport-test',name:'Проверка'},rpID:'localhost',origin}});
  if(p==='/api/sync'){
   if(r.request().method()==='GET')return r.fulfill({json:{records:[...records.values()],cursor:records.size,more:false}});
   return r.fulfill({json:{results:r.request().postDataJSON().records.map(row=>{const version=(records.get(row.id)?.version||0)+1;records.set(row.id,{...row,version});return{id:row.id,version};})}});
  }
  if(p==='/api/cadastre/search'){
   lookupCount++;
   if(mode==='error')return r.fulfill({status:502,json:{error:'Источник временно недоступен'}});
   const updated=mode==='updated';
   return r.fulfill({json:{candidates:[{cadastralNumber:number,boundary,region:details.region,district:details.district,details:updated?{...details,costKzt:0,owners:{availability:'available',items:[{type:'organization',name:'ТОО «Тестовое хозяйство»'}]},encumbrances:{availability:'available',items:[{kind:'encumbrance',type:'Тестовая аренда',registeredAt:'2026-01-01T00:00:00.000Z'}]}}:details}]}});
  }
  if(p.includes('/basemap/')||p.includes('/tiles/'))return r.fulfill({contentType:'image/png',body:png});
  return r.fulfill({json:{}});
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/#/fields');await page.getByRole('button',{name:'Добавить участок',exact:true}).first().click();
 const dialog=page.getByRole('dialog',{name:'Добавить участок',exact:true});
 await dialog.getByLabel('Кадастровый номер',{exact:true}).fill(number);await dialog.getByRole('button',{name:'Найти границы',exact:true}).click();
 await expect(dialog.locator('.land-purpose-preview')).toHaveText(details.purpose);
 await dialog.getByRole('button',{name:'Изменить название и посмотреть данные',exact:true}).click();
 const preview=dialog.locator('.parcel-passport');await expect(preview).toContainText('6,7218');await expect(preview).toContainText('Не указан в публичном ответе');
 for(const [width,height] of [[320,568],[360,740],[390,844],[430,932]]){
  await page.setViewportSize({width,height});assert.equal(await preview.evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'passport must fit mobile width');assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false);const button=await dialog.getByRole('button',{name:'Добавить этот участок',exact:true}).boundingBox();assert.ok(button.y+button.height<=height,'confirmation remains visible while reading metadata');
 }
 await dialog.getByLabel('Название',{exact:true}).fill('Мой производственный участок');
 await dialog.getByRole('button',{name:'Добавить этот участок',exact:true}).click();await dialog.waitFor({state:'detached'});
 const passport=page.locator('.land-detail .parcel-passport');await expect(passport).toContainText(details.purpose);await expect(passport).toContainText('Кадастровая оценка');await expect(passport).toContainText('Сведения не переданы');
 await expect.poll(()=>records.size).toBe(1);const before=structuredClone([...records.values()][0]);assert.equal(before.data.cadastre.details.costKzt,2459064);
 await page.reload();await expect(passport).toContainText('6,7218');await expect(page.locator('.land-detail h2')).toHaveText('Мой производственный участок');
 assert.equal(lookupCount,1,'reloading uses persisted metadata without an upstream call');
 await passport.getByRole('button',{name:'Скопировать кадастровый номер'}).click();await expect(passport.getByRole('status')).toHaveText('Номер скопирован');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),number);
 await passport.locator('summary').click();await expect(passport).toContainText('TEST-ADDRESS');await expect(passport).toContainText('1 779,74 м');
 mode='error';await page.getByRole('button',{name:'Обновить сведения ЕГКН',exact:true}).click();await expect(page.locator('.saved-cadastre [role=alert]')).toHaveText('Источник временно недоступен');await expect(passport).toContainText('6,7218');
 mode='updated';await page.getByRole('button',{name:'Обновить сведения ЕГКН',exact:true}).click();await expect(passport).toContainText('ТОО «Тестовое хозяйство»');await expect(passport).toContainText('Тестовая аренда');await expect(passport.locator('.parcel-value')).toHaveText('0 ₸');
 await expect.poll(()=>[...records.values()][0]?.data.cadastre.details.costKzt).toBe(0);const after=[...records.values()][0];assert.deepEqual(after.data.boundary,before.data.boundary);assert.equal(after.data.area,before.data.area);assert.equal(after.data.name,before.data.name);assert.equal(after.data.cadastre.importedAt,before.data.cadastre.importedAt);
 await context.route('**/api/cadastre/**',r=>r.abort('internetdisconnected'));await page.reload();await expect(passport).toContainText('ТОО «Тестовое хозяйство»');
 assert.deepEqual(errors,[]);console.log('PASS parcel passport: 4 mobile widths, preview, save/reload without lookup, copy, details, upstream failure, refresh preserves edits/geometry, zero cost, rights/charges and offline snapshot');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
