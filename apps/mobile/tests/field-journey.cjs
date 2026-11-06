// Real authenticated API, temporary SQLite and built app. Only map imagery is a fixture.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {mkdtempSync,rmSync,mkdirSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const express=require('../../api/node_modules/express');
const {once}=require('node:events');
(async()=>{
 const root=path.resolve(__dirname,'../../..'),dir=mkdtempSync(path.join(tmpdir(),'egin-field-journey-'));
 const {createApp}=await import('../../api/src/server.mjs'),service=createApp({dataDir:dir,origins:['http://localhost:4949'],rpID:'localhost'});
 const token='field-journey-session',user='field-journey-user';
 service.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(user,'Field journey',null,Date.now());
 service.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),user,Date.now()+3600000);
 const app=express();app.use((req,res,next)=>req.path.startsWith('/api/')?service.app(req,res,next):next());app.use(express.static(path.join(root,'apps/mobile/dist')));
 const server=app.listen(4949,'127.0.0.1');service.attachUpgrade(server);await once(server,'listening');let browser,activePage;
 const artifacts=path.join(root,'docs/crops');mkdirSync(artifacts,{recursive:true});
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1280,height:960},reducedMotion:'reduce'});await context.addCookies([{name:'egin_session',value:token,url:'http://localhost:4949'}]);
  // No cadastral service or weather availability is required for the field-save contract.
  await context.route(/(?:tile\.openstreetmap\.org|\/api\/cadastre\/basemap\/)/,r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#c9d2bd"/><path d="M0 128H256M128 0V256" stroke="#b5c3a5"/><text x="12" y="20" font-size="11" fill="#6d7d60">TEST MAP FIXTURE</text></svg>' }));
  const page=await context.newPage(),errors=[];activePage=page;page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:4949/#/fields');await page.getByRole('button',{name:'Добавить участок',exact:true}).first().waitFor();
  await page.waitForFunction(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('egin-workspace-v1');q.onsuccess=()=>r(q.result);});const result=await new Promise(r=>{const q=db.transaction('meta').objectStore('meta').get('owner');q.onsuccess=()=>r(q.result?.value);});db.close();return result==='field-journey-user';});
  // Make explicit saves deterministic: the wizard still calls the real synchronizer.
  await page.evaluate(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('egin-workspace-v1');q.onsuccess=()=>r(q.result);});await new Promise(r=>{const t=db.transaction('meta','readwrite');t.objectStore('meta').put({key:'autoSync',value:false});t.oncomplete=r;});db.close();});
  const wizard=page.locator('.field-wizard'),next=()=>wizard.getByRole('button',{name:'Продолжить',exact:true}).click();
  const geo=(offset=0)=>({type:'Polygon',coordinates:[[[71.45+offset,51.17],[71.453+offset,51.17],[71.453+offset,51.172],[71.45+offset,51.172],[71.45+offset,51.17]]]});
  async function open(){await page.evaluate(()=>location.hash='/fields');await page.getByRole('button',{name:'Добавить участок',exact:true}).first().click();await wizard.waitFor();}
  async function upload(shape){await wizard.locator('input[type=file]').setInputFiles({name:'test-field.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(shape))});await page.waitForFunction(()=>document.querySelector('.boundary-area')||document.querySelector('.field-wizard [role=alert]'));assert.equal(await wizard.locator('[role=alert]').count(),0,await wizard.innerText());await wizard.locator('.boundary-area').waitFor();}
  async function crop(name){await wizard.locator('.crop-choice').filter({has:page.locator('strong',{hasText:name})}).click();}
  async function params(name,stage){await wizard.getByLabel('Название участка').fill(name);if(stage)await wizard.getByLabel('Стадия роста',{exact:true}).selectOption(stage);}
  async function save(){await wizard.getByRole('button',{name:'Сохранить участок',exact:true}).click();await wizard.waitFor({state:'hidden'});await page.waitForURL(/#\/fields\/[A-Za-z0-9_-]+$/);return page.url().split('/').at(-1);}
  async function home(cropId){await page.evaluate(()=>location.hash='/');await page.locator(`.crop-canvas[data-crop=${cropId}][data-ready=true] canvas`).waitFor();}
  async function records(){return(await(await context.request.get('http://localhost:4949/api/sync')).json()).records.filter(r=>r.kind==='field'&&!r.deleted);}

  if(process.env.FIELD_EDGE_ONLY==='1'){
   // Delay the actual server POST and verify the review cannot change underneath it.
   await open();await upload(geo());await next();await crop('Подсолнечник');await next();await params('Проверка подтверждения');await next();await page.setViewportSize({width:390,height:844});await wizard.locator('.crop-canvas[data-ready=true]').waitFor();await page.setViewportSize({width:390,height:Math.min(2000,Math.ceil(await page.locator('.sheet').evaluate(el=>el.scrollHeight))+24)});await page.screenshot({path:path.join(artifacts,'wizard-review-mobile.png')});await page.setViewportSize({width:1280,height:960});
   let release,started;const began=new Promise(r=>started=r),hold=new Promise(r=>release=r);
   await page.route('**/api/sync',async r=>{if(r.request().method()==='POST'){started();await hold;}await r.continue();});
   await wizard.getByRole('button',{name:'Сохранить участок',exact:true}).click();await began;
   await wizard.getByRole('button',{name:'Изменить',exact:true}).click();assert.equal(await wizard.locator('.wizard-progress button').nth(3).getAttribute('aria-current'),'step');assert.equal(await wizard.getAttribute('aria-busy'),'true');
   release();await wizard.waitFor({state:'hidden'});await page.unroute('**/api/sync');
   // A guest draft cannot report server success; it can be explicitly restored after login.
   await context.clearCookies();await page.evaluate(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('egin-workspace-v1');q.onsuccess=()=>r(q.result);});await new Promise(r=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put({key:'owner',value:'guest'});tx.objectStore('meta').put({key:'user',value:null});tx.oncomplete=r;});db.close();});await page.reload();await page.waitForFunction(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('egin-workspace-v1');q.onsuccess=()=>r(q.result);});const value=await new Promise(r=>{const q=db.transaction('meta').objectStore('meta').get('owner');q.onsuccess=()=>r(q.result?.value);});db.close();return value==='guest';});
   await open();await upload(geo(.04));await next();await crop('Подсолнечник');await next();await params('Гостевой черновик');await next();await wizard.getByRole('button',{name:'Сохранить участок',exact:true}).click();await wizard.locator('[role=alert]').waitFor();assert.match(await wizard.locator('[role=alert]').innerText(),/Войдите/);
   await context.addCookies([{name:'egin_session',value:token,url:'http://localhost:4949'}]);await page.reload();await page.waitForFunction(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('egin-workspace-v1');q.onsuccess=()=>r(q.result);});const value=await new Promise(r=>{const q=db.transaction('meta').objectStore('meta').get('owner');q.onsuccess=()=>r(q.result?.value);});db.close();return value==='field-journey-user';});
   await open();await wizard.getByRole('button',{name:'Восстановить черновик',exact:true}).click();await wizard.getByRole('heading',{name:'Гостевой черновик',exact:true}).waitFor();await save();assert.equal((await records()).length,2);
   await home('sunflower');await page.locator('.crop-canvas canvas').evaluate(c=>c.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());await page.getByRole('button',{name:'Повторить загрузку 3D',exact:true}).click();await page.locator('.crop-canvas[data-ready=true] canvas').waitFor();
   assert.deepEqual(errors,[]);console.log('PASS delayed server ACK locks review; guest rejection and explicit draft restoration; lost WebGL context retry');await context.close();return;
  }

  await open();await next();assert.match(await wizard.innerText(),/Нарисуйте границу/);
  await wizard.getByLabel('Найти по координатам').fill('51.17 71.45');await wizard.getByRole('button',{name:'Найти',exact:true}).click();
  const map=wizard.locator('.boundary-map');await map.scrollIntoViewIfNeeded();await page.waitForTimeout(400);
  const box=await map.boundingBox();for(const [x,y] of [[.35,.3],[.65,.3],[.65,.7],[.35,.7]])await map.click({position:{x:box.width*x,y:box.height*y}});
  await wizard.locator('.boundary-area').waitFor();await wizard.getByRole('button',{name:'Завершить рисование',exact:true}).click();
  // Actual geometry editing: insert a point and drag an existing vertex.
  await wizard.locator('.boundary-midpoint').first().click();assert.equal(await wizard.locator('.boundary-vertex').count(),5);
  const vertex=await wizard.locator('.boundary-vertex').first().boundingBox();await page.mouse.move(vertex.x+13,vertex.y+13);await page.mouse.down();await page.mouse.move(vertex.x+21,vertex.y+20,{steps:5});await page.mouse.up();
  await next();await next();assert.match(await wizard.innerText(),/Выберите культуру/);await crop('Пшеница');
  const loaded=await wizard.locator('.crop-choice img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>100));assert.ok(loaded,'The four cards use rendered crop previews');
  await page.screenshot({path:path.join(artifacts,'wizard-crops-desktop.png')});await next();await params('Пшеница — северное поле');await next();
  assert.match(await wizard.innerText(),/Стадия неизвестна/);await wizard.getByRole('button',{name:'Назад',exact:true}).click();assert.equal(await wizard.getByLabel('Название участка').inputValue(),'Пшеница — северное поле');await next();
  await wizard.locator('.crop-canvas[data-crop=wheat][data-ready=true]').waitFor();await page.screenshot({path:path.join(artifacts,'wizard-review-desktop.png')});const wheat=await save();console.log('Saved wheat',wheat);
  assert.equal((await records()).find(r=>r.id===wheat).data.crop,'wheat');await home('wheat');assert.match(await page.locator('.plant-heading').innerText(),/неизвестна/);
  await page.setViewportSize({width:480,height:900});await page.screenshot({path:path.join(artifacts,'home-after-wheat.png')});

  await open();await upload(geo(.01));await next();await crop('Яблоня');await next();await params('Яблоневый сад','mature');await wizard.getByLabel('Дата посадки').fill('2026-03-20');await next();const apple=await save();console.log('Saved apple',apple);await home('apple');
  await page.evaluate(()=>window.testCanvas=document.querySelector('.crop-canvas canvas'));
  await page.getByLabel('Участок для цифрового двойника').selectOption(wheat);await page.locator('.crop-canvas[data-crop=wheat]').waitFor();
  assert.ok(await page.evaluate(()=>window.testCanvas===document.querySelector('.crop-canvas canvas')),'Switches must preserve the WebGL canvas');
  await page.getByLabel('Участок для цифрового двойника').selectOption(apple);await page.reload();await page.locator('.crop-canvas[data-crop=apple][data-ready=true]').waitFor();await page.screenshot({path:path.join(artifacts,'home-after-apple.png')});
  console.log('PASS drawing, editing, required crop, draft back, server save, wheat/apple selection and reload');

  await page.evaluate(id=>location.hash='/fields/'+id,wheat);await page.getByRole('button',{name:'Настройки участка',exact:true}).click();await wizard.waitFor();
  await wizard.locator('.wizard-progress button').nth(1).click();await crop('Подсолнечник');await next();await params('Подсолнечник — северное поле','vegetative');await next();assert.equal(await save(),wheat);await home('sunflower');
  await page.reload();await page.locator('.crop-canvas[data-crop=sunflower][data-stage="1"][data-ready=true]').waitFor();await page.screenshot({path:path.join(artifacts,'home-after-sunflower.png')});
  await open();await upload(geo(.02));await next();await crop('Помидор');await page.screenshot({path:path.join(artifacts,'wizard-crops-mobile.png')});await next();await params('Томатное поле','seedling');await next();
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await wizard.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:path.join(artifacts,'wizard-review-mobile.png')});
  // Both attempts by saveFieldConfirmed fail. No route change or fake confirmation.
  let rejectSaves=true;await page.route('**/api/sync',r=>rejectSaves&&r.request().method()==='POST'?r.abort('failed'):r.continue());
  await wizard.getByRole('button',{name:'Сохранить участок',exact:true}).click();await wizard.locator('[role=alert]').waitFor();assert.equal((await records()).length,2);assert.ok(await wizard.isVisible());
  await page.reload();await page.getByRole('button',{name:'Добавить участок',exact:true}).first().click();await wizard.getByRole('heading',{name:'Томатное поле',exact:true}).waitFor();
  rejectSaves=false;const tomato=await save();console.log('Saved tomato after network retry',tomato);assert.equal((await records()).length,3);await home('tomato');await page.screenshot({path:path.join(artifacts,'home-after-tomato.png')});
  const saved=await records();assert.equal(saved.find(r=>r.id===wheat).data.crop,'sunflower');assert.equal(saved.find(r=>r.id===apple).data.cultivation.plantedOn,'2026-03-20');assert.equal(saved.find(r=>r.id===tomato).data.cultivation.stage,'seedling');
  // A clean browser receives the same field data from SQLite, without local drafts/cache.
  const fresh=await browser.newContext({viewport:{width:1280,height:960},reducedMotion:'reduce'});await fresh.addCookies([{name:'egin_session',value:token,url:'http://localhost:4949'}]);const freshPage=await fresh.newPage();await freshPage.goto('http://localhost:4949/#/fields');await freshPage.getByText('Томатное поле',{exact:true}).first().waitFor({timeout:45000});await fresh.close();
  assert.deepEqual(errors,[]);console.log('PASS field edit, all four crops, stage persistence, mobile width, network failure, restored draft, retry without duplicates, fresh-browser server pull');
  await context.close();
 }catch(e){console.error('Journey failed:',e);if(activePage)console.error('Draft keys',await activePage.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('egin.field-draft'))).catch(()=>[]));if(activePage)await activePage.screenshot({path:path.join(artifacts,'journey-failure.png')}).catch(()=>{});throw e;}finally{await browser?.close();service.close();await new Promise(r=>server.close(r));service.db.close();rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
