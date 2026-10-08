const {chromium,webkit}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const QRCode=require('qrcode');
const fixture=require('./fixtures/open-meteo.json');
const origin=process.env.EGIN_URL||'http://localhost:4935';
const path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const out=path.join(root,'test-results/workspace');
// Seed preserved records directly: Event Center intentionally has no manual composer.
async function seedRecord(page,{kind='entry',title='Осмотр после дождя',text='Листья чистые. Проверить через два дня.',media=false,edit=false}={}){
 return page.evaluate(async({kind,title,text,media,edit})=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('egin-workspace-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const read=(store,key)=>new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const who=(await read('meta','owner'))?.value||'guest';
  const rows=await new Promise((resolve,reject)=>{const r=db.transaction('records').objectStore('records').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const previous=edit?rows.find(r=>r.owner===who&&r.kind===kind&&r.data.title===title):undefined;
  if(edit&&!previous)throw Error('Fixture record missing');
  const assets=[];
  if(media){
   const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;canvas.getContext('2d').fillRect(0,0,16,16);
   const image=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
   const wav=new Uint8Array(1644),view=new DataView(wav.buffer);const chars=(at,text)=>[...text].forEach((c,i)=>wav[at+i]=c.charCodeAt(0));chars(0,'RIFF');view.setUint32(4,1636,true);chars(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);chars(36,'data');view.setUint32(40,1600,true);
   for(const blob of [image,new Blob([wav],{type:'audio/wav'})]){const id=crypto.randomUUID();assets.push({id,key:who+':'+id,owner:who,blob,name:'Preserved media fixture',uploaded:false});}
  }
  const id=previous?.id||crypto.randomUUID();
  const data=kind==='field'?{name:'Тестовое поле',latitude:51.17,longitude:71.44,area:12.5,crop:'wheat'}:{...(previous?.data||{}),title,text,date:previous?.data.date||new Date().toISOString().slice(0,10),fieldId:previous?.data.fieldId||rows.find(r=>r.owner===who&&r.kind==='field')?.id||'',assets:previous?.data.assets||assets.map(a=>a.id)};
  await new Promise((resolve,reject)=>{const tx=db.transaction(['records','assets'],'readwrite');tx.objectStore('records').put({...previous,key:who+':'+id,owner:who,id,kind,data,version:previous?.version||0,deleted:false,dirty:true,localRevision:(previous?.localRevision||0)+1,updated:new Date().toISOString()});for(const asset of assets)tx.objectStore('assets').put(asset);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  db.close();window.dispatchEvent(new Event('egin-data'));window.dispatchEvent(new Event('egin-write'));return id;
 },{kind,title,text,media,edit});
}
(async()=>{
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox','--enable-unsafe-swiftshader','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',acceptDownloads:true,permissions:['geolocation','microphone','camera'],geolocation:{latitude:51.17,longitude:71.44,accuracy:10}});
await context.route('https://api.open-meteo.com/**',r=>r.fulfill({json:fixture}));
await context.route('https://tile.openstreetmap.org/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJz4AAAAASUVORK5CYII=','base64')}));
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.setDefaultTimeout(20000);
const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
await page.goto(origin+'/#/settings');
await page.getByRole('heading',{name:'Настройки',exact:true}).waitFor();

for(const width of [320,360,390,430]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
await page.setViewportSize({width:390,height:844});
await seedRecord(page,{kind:'field'});
await seedRecord(page,{media:true});
await page.goto(origin+'/#/journal');
await page.getByRole('heading',{name:'Центр событий',exact:true}).waitFor();
assert.equal(await page.getByRole('button',{name:'Новая запись',exact:true}).count(),0);
await page.getByRole('heading',{name:'Осмотр после дождя',exact:true}).waitFor();
await page.getByRole('button',{name:'Материалы · 2',exact:true}).click();
await page.locator('.entry-photo').waitFor();assert.equal(await page.locator('audio').count(),1);
await page.keyboard.press('Escape');
await page.reload();await page.getByRole('heading',{name:'Осмотр после дождя',exact:true}).waitFor();
await page.goto(origin+'/#/settings/profile');
await page.getByLabel('Имя',{exact:true}).fill('Проверка EGIN');
await page.getByRole('button',{name:'Создать профиль с passkey',exact:true}).click();
await page.getByRole('heading',{name:'Сохраните код восстановления',exact:true}).waitFor();
const recovery=await page.locator('.recovery-card code').textContent();assert.ok(recovery.length>20);
await page.getByRole('button',{name:'Код сохранён',exact:true}).click();
await page.goto(origin+'/#/settings/sync');
await page.getByRole('button',{name:'Синхронизировать сейчас',exact:true}).click();
await page.getByText('Все записи синхронизированы',{exact:true}).waitFor();
const apiRecords=await page.evaluate(()=>fetch('/api/sync').then(r=>r.json()));
assert.equal(apiRecords.records.filter(r=>r.kind==='entry').length,1);
assert.equal(apiRecords.records.find(r=>r.kind==='entry').data.assets.length,2);
await page.goto(origin+'/#/settings/sensors');
await page.getByRole('button',{name:'Добавить датчик',exact:true}).click();
await page.getByText('Вставить содержимое QR',{exact:true}).click();
await page.getByLabel('Код',{exact:true}).fill('https://evil.example/');
await page.getByRole('button',{name:'Прочитать код',exact:true}).click();

await page.getByText('Это не QR датчика EGIN. Используйте ручной ввод.',{exact:true}).waitFor();
await page.getByLabel('Изображение QR-кода',{exact:true}).setInputFiles({name:'sensor.png',mimeType:'image/png',buffer:await QRCode.toBuffer('egin://sensor?id=SOIL-001&type=moisture&name=Soil')});
await page.waitForFunction(()=>document.querySelector('input[pattern]')?.value==='SOIL-001');
assert.equal(await page.getByLabel('Серийный номер',{exact:true}).inputValue(),'SOIL-001');
await page.getByRole('button',{name:'Сохранить датчик',exact:true}).click();
await page.getByText('Ожидает подключения API',{exact:true}).waitFor();
await page.goto(origin+'/#/settings/reports');
await page.getByRole('button',{name:'Сформировать отчёт',exact:true}).click();
await page.getByRole('button',{name:'Скачать файл',exact:true}).waitFor();
const reportPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать файл',exact:true}).click();const report=await reportPromise;await report.saveAs(out+'/report.html');const html=fs.readFileSync(out+'/report.html','utf8');assert.ok(html.includes('Осмотр после дождя')&&html.includes('data:image/jpeg')&&html.includes('data:audio/'));
await page.getByLabel('Формат',{exact:true}).selectOption('csv');await page.getByRole('button',{name:'Сформировать отчёт',exact:true}).click();assert.ok(await page.getByRole('button',{name:'Поделиться',exact:true}).isVisible());
await page.goto(origin+'/#/journal');
await page.evaluate(()=>Promise.race([navigator.serviceWorker.ready.then(()=>true),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Service worker activation timed out')),20000))]));await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
await context.setOffline(true);await page.reload();
await seedRecord(page,{title:'Запись без сети'});await page.reload();await page.getByRole('heading',{name:'Запись без сети',exact:true}).waitFor();
await context.setOffline(false);await page.goto(origin+'/#/settings/sync');await page.getByRole('button',{name:'Синхронизировать сейчас',exact:true}).click();await page.getByText('Все записи синхронизированы',{exact:true}).waitFor();
assert.equal((await page.evaluate(()=>fetch('/api/sync').then(r=>r.json()))).records.filter(r=>r.kind==='entry').length,2);
// A separate browser context is a separate device; authenticate with the resident credential.
const credentials=(await cdp.send('WebAuthn.getCredentials',{authenticatorId})).credentials;
const second=await browser.newContext({viewport:{width:320,height:740},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await second.route('https://api.open-meteo.com/**',r=>r.fulfill({json:fixture}));const p2=await second.newPage();p2.setDefaultTimeout(20000);const dev2=await second.newCDPSession(p2);await dev2.send('WebAuthn.enable');const a2=await dev2.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});for(const credential of credentials)await dev2.send('WebAuthn.addCredential',{authenticatorId:a2.authenticatorId,credential});
await p2.goto(origin+'/#/settings/profile');await p2.getByRole('button',{name:'Войти с passkey',exact:true}).click();await p2.getByRole('link',{name:/Безопасность и вход/}).waitFor();await p2.goto(origin+'/#/journal');await p2.getByRole('heading',{name:'Осмотр после дождя',exact:true}).waitFor();await p2.getByRole('button',{name:'Материалы · 2',exact:true}).click();await p2.locator('.entry-photo').waitFor();assert.equal(await p2.locator('audio').count(),1);await p2.keyboard.press('Escape');
// Create divergent offline edits on two devices, then expose both versions.
await page.goto(origin+'/#/events');await context.setOffline(true);await seedRecord(page,{edit:true,text:'Изменено на первом телефоне'});
await seedRecord(p2,{edit:true,text:'Изменено на втором телефоне'});await p2.goto(origin+'/#/settings/sync');await p2.getByRole('button',{name:'Синхронизировать сейчас',exact:true}).click();await p2.getByText('Все записи синхронизированы',{exact:true}).waitFor();
await context.setOffline(false);await page.goto(origin+'/#/settings/sync');await page.getByRole('button',{name:'Синхронизировать сейчас',exact:true}).click();await page.getByRole('heading',{name:'Разные версии записи',exact:true}).waitFor();await page.goto(origin+'/#/events');await page.getByRole('heading',{name:'Нужно сверить изменения',exact:true}).waitFor();await page.getByRole('link',{name:'Сравнить версии',exact:true}).click();await page.getByRole('button',{name:'Принять версию сервера',exact:true}).click();await page.locator('.conflict-card').waitFor({state:'detached'});
await page.goto(origin+'/#/settings/security');await page.getByRole('button',{name:'Добавить passkey',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Удалить ключ',exact:true}).isDisabled(),true);
assert.deepEqual(errors,[]);
await page.goto(origin+'/#/journal');
await context.close();await second.close();await browser.close();
const safari=await webkit.launch();const ios=await safari.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await ios.route('https://api.open-meteo.com/**',r=>r.fulfill({json:fixture}));const tab=await ios.newPage();await tab.goto(origin+'/#/journal');await tab.getByRole('heading',{name:'Центр событий',exact:true}).waitFor();await seedRecord(tab,{title:'Safari offline'});await tab.reload();await tab.getByRole('heading',{name:'Safari offline',exact:true}).waitFor();assert.equal(await tab.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await safari.close();
console.log('PASS: settings, read-only events/history/photo/audio, offline preservation, real passkey registration/login, account sync and isolation, second-device media, conflict resolution, sensors/QR validation, HTML/CSV export, Safari persistence.');
})().catch(e=>{console.error(e);process.exit(1)});
