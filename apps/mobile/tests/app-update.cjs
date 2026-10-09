const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../dist');let revision=1;
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),relative=decodeURIComponent(url.pathname);
 res.setHeader('Cache-Control','no-store');
 if(relative==='/sw.js'){res.setHeader('Content-Type','application/javascript');return res.end(revision===1?sw:sw.replace(/const CACHE = '([^']+)'/,"const CACHE = '$1-browser-test-v2'"));}
 if(relative.startsWith('/api/')){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(relative==='/api/session'?{user:null}:relative==='/api/news'?require('./fixtures/news.json'):{records:[],cursor:0,more:false}));}
 const file=path.resolve(root,'.'+(relative==='/'?'/index.html':relative));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox']});try{
 const origin='http://127.0.0.1:'+server.address().port;
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await context.route('https://api.open-meteo.com/**',r=>r.fulfill({json:require('./fixtures/open-meteo.json')}));
 const page=await context.newPage();page.setDefaultTimeout(25000);
 await page.goto(origin+'/#/settings/profile');await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.evaluate(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('egin-workspace-v1',1);q.onsuccess=()=>r(q.result);});const tx=db.transaction('records','readwrite');tx.objectStore('records').put({key:'guest:offline-parcel',id:'offline-parcel',owner:'guest',kind:'field',data:{name:'Сохранённый участок',crop:'unknown',latitude:51,longitude:71,area:3.25},version:0,localRevision:1,updated:new Date().toISOString(),deleted:false,dirty:true});await new Promise(r=>tx.oncomplete=r);db.close();window.dispatchEvent(new Event('egin-data'));});
 const name=page.getByLabel('Имя',{exact:true});await name.fill('Несохранённый ввод');
 revision=2;await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
 await expect(page.locator('.app-update')).toBeVisible();await expect(name).toHaveValue('Несохранённый ввод');
 await page.locator('.app-update button').click();await page.getByRole('button',{name:'Позже',exact:true}).click();await expect(name).toHaveValue('Несохранённый ввод');
 await page.locator('.app-update button').click();await page.getByRole('button',{name:'Обновить сейчас',exact:true}).click();
 await page.waitForFunction(async()=>!(await navigator.serviceWorker.getRegistration())?.waiting&&!document.querySelector('.app-update'));
 const saved=await page.evaluate(async()=>{const db=await new Promise(r=>{const q=indexedDB.open('egin-workspace-v1',1);q.onsuccess=()=>r(q.result);});return new Promise(r=>{const q=db.transaction('records').objectStore('records').get('guest:offline-parcel');q.onsuccess=()=>{db.close();r(q.result);};});});
 assert.equal(saved.data.name,'Сохранённый участок');assert.equal(saved.dirty,true);
 const cachesAfter=await page.evaluate(()=>caches.keys());assert.ok(cachesAfter.some(key=>key.endsWith('browser-test-v2')));
 await context.setOffline(true);await page.goto(origin+'/#/settings/sync');await expect(page.getByRole('heading',{name:'Синхронизация',exact:true})).toBeVisible();await expect(page.locator('.sync-queue')).toContainText('Участки');
 console.log('PASS PWA update: real installing/waiting/activation, no forced reload, defer preserves draft, accepted reload preserves unsynced records, new offline shell works');
 }finally{await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);server.close();process.exit(1)});
