const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const ts=require('typescript'),fs=require('node:fs'),path=require('node:path');
const origin=process.env.EGIN_URL||'http://localhost:4935';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Isolated preview required');
(async()=>{const browser=await chromium.launch({args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',bypassCSP:true});
 await context.route('https://api.open-meteo.com/**',r=>r.fulfill({json:require('./fixtures/open-meteo.json')}));
 await context.route('**/api/**',r=>r.fulfill({json:new URL(r.request().url()).pathname==='/api/session'?{user:{id:'sync-test',name:'Тест'},rpID:'localhost',origin}:{records:[],cursor:0,more:false,results:[]}}));
 const page=await context.newPage();page.setDefaultTimeout(15000);
 await page.goto(origin+'/#/settings/sync');await page.getByRole('heading',{name:'Синхронизация',exact:true}).waitFor();
 await page.waitForFunction(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('egin-workspace-v1',1);r.onsuccess=()=>resolve(r.result);});return new Promise(resolve=>{const q=db.transaction('meta').objectStore('meta').get('owner');q.onsuccess=()=>{db.close();resolve(q.result?.value==='sync-test');};});});
 // Exercise the actual DB module against Chromium IndexedDB, including transactional stale guards.
 const module=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/entities/workspace/db.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 const outcome=await page.evaluate(async source=>{
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'})),db=await import(url);URL.revokeObjectURL(url);
  await db.setMeta('autoSync',false);
  const entry={title:'Версии участка',text:'Телефон',date:'2026-10-09',fieldId:'',assets:[]};
  const row={id:'conflict-test',key:'sync-test:conflict-test',owner:'sync-test',kind:'entry',data:entry,version:1,deleted:false,dirty:true,localRevision:1,updated:new Date().toISOString(),conflict:{id:'conflict-test',kind:'entry',data:{...entry,text:'Сервер'},version:2,deleted:false}};
  await db.put('records',row);
  await db.setMeta('owner','other-test');let ownerRejected=false;
  try{await db.resolveConflict(row,'remote');}catch{ownerRejected=true;}
  const ownerUntouched=(await db.get('records',row.key)).data.text==='Телефон';
  await db.setMeta('owner','sync-test');await db.put('records',{...row,localRevision:2,data:{...entry,text:'Новое локальное изменение'}});let staleRejected=false;
  try{await db.resolveConflict(row,'remote');}catch{staleRejected=true;}
  const staleUntouched=(await db.get('records',row.key)).data.text==='Новое локальное изменение';
  await db.put('records',row);await db.resolveConflict(row,'local');const local=await db.get('records',row.key);
  await db.put('records',row);await db.resolveConflict(row,'remote');const remote=await db.get('records',row.key);
  await db.put('records',row);
  await db.put('records',{...row,id:'pending-delete',key:'sync-test:pending-delete',conflict:undefined,deleted:true});
  await db.setMeta('syncStatus',{state:'conflict',message:'Нужно сравнить версии'});db.notify();
  return{ownerRejected,ownerUntouched,staleRejected,staleUntouched,local:{text:local.data.text,dirty:local.dirty,version:local.version,conflict:!!local.conflict},remote:{text:remote.data.text,dirty:remote.dirty,version:remote.version,conflict:!!remote.conflict}};
 },module);
 assert.deepEqual(outcome,{ownerRejected:true,ownerUntouched:true,staleRejected:true,staleUntouched:true,local:{text:'Телефон',dirty:true,version:2,conflict:false},remote:{text:'Сервер',dirty:false,version:2,conflict:false}});
 const card=page.locator('.conflict-card');await expect(card).toContainText('Телефон');await expect(card).toContainText('Сервер');await expect(card).toContainText('Отличаются: текст');await expect(page.locator('.sync-queue')).toContainText('В том числе удалений: 1');
 for(const width of [320,360,390,430]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
 const out=path.resolve(__dirname,'../../../test-results/polish');fs.mkdirSync(out,{recursive:true});await page.setViewportSize({width:390,height:844});await card.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'sync-conflict.png')});
 const download=page.waitForEvent('download');await card.getByRole('button',{name:'Скачать обе версии'}).click();const file=await download;const payload=JSON.parse(fs.readFileSync(await file.path(),'utf8'));assert.equal(payload.local.data.text,'Телефон');assert.equal(payload.server.data.text,'Сервер');assert.equal(payload.owner,undefined);
 await context.setOffline(true);await expect(page.getByRole('button',{name:'Синхронизировать сейчас',exact:true})).toBeDisabled();await card.getByRole('button',{name:'Принять версию сервера',exact:true}).click();await expect(card).toHaveCount(0);
 console.log('PASS sync: real IndexedDB owner/stale transaction guards, local/remote choice, readable diff, download both versions, pending deletions, offline controls, 320–430px');
 await context.close();
 // A failed lazy screen has a recoverable state while navigation stays available.
 const broken=await browser.newContext({serviceWorkers:'block'});await broken.route('https://api.open-meteo.com/**',r=>r.fulfill({json:require('./fixtures/open-meteo.json')}));await broken.route('**/api/**',r=>r.fulfill({json:{user:null}}));await broken.route('**/assets/FieldsPage-*.js',r=>r.abort());
 const recovery=await broken.newPage();await recovery.goto(origin+'/#/fields');await expect(recovery.getByRole('heading',{name:'Не удалось открыть экран',exact:true})).toBeVisible();await expect(recovery.getByRole('navigation',{name:'Основная навигация'})).toBeVisible();await recovery.getByRole('link',{name:'Настройки',exact:true}).click();await expect(recovery.getByRole('heading',{name:'Настройки',exact:true})).toBeVisible();
 console.log('PASS failed screen recovery and continued navigation');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
