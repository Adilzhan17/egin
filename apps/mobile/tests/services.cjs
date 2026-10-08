const {chromium,webkit}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin=process.env.EGIN_URL||'http://localhost:4935';
if(!['localhost','127.0.0.1','dev-egin.perricheno.com'].includes(new URL(origin).hostname))throw new Error('Use local preview or staging for service write tests');
const output=path.resolve(__dirname,'../../../test-results/services');
const ids=['one-c','agrosignal','agrostream'];
const noOverflow=async p=>assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile content must fit');
async function fixtures(c){await c.route('https://api.open-meteo.com/**',r=>r.fulfill({json:require('./fixtures/open-meteo.json')}));await c.route('**/api/news',r=>r.fulfill({json:require('./fixtures/news.json')}));await c.route('https://eldala.kz/**',r=>r.abort());}
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await fixtures(context);
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  // Guest can inspect all providers without leaking someone else's saved settings.
  await p.goto(origin+'/#/settings');await p.getByRole('link',{name:/Подключённые сервисы/}).click();
  await p.getByRole('heading',{name:'Подключённые сервисы',exact:true}).waitFor();assert.equal(await p.locator('.service-card').count(),3);
  await noOverflow(p);
  await p.getByRole('link',{name:/1С:ERP АПК/}).click();await p.getByRole('link',{name:/Войти для настройки/}).waitFor();assert.equal(await p.getByLabel('Пароль 1С').count(),0);
  const cdp=await context.newCDPSession(p);await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  await p.goto(origin+'/#/auth');await p.getByRole('button',{name:'Создать профиль',exact:true}).click();await p.getByLabel('Ваше имя').fill('Service connection test');await p.getByRole('button',{name:'Создать passkey',exact:true}).click();await p.getByRole('button',{name:'Код сохранён',exact:true}).click();await p.getByRole('navigation').waitFor();
  for(const id of ids){
   await p.goto(origin+'/#/settings/services/'+id);await p.getByLabel('Организация в сервисе').fill('Хозяйство для проверки '+id);
   if(id==='one-c')await p.getByLabel('Адрес публикации OData').fill('https://erp.example.com/base/odata/standard.odata/');
   await p.getByRole('checkbox',{name:/Урожай/}).check();
   await p.getByRole('button',{name:'Сохранить настройки',exact:true}).click();await p.getByText('Настройки сохранены. Обмен данными ещё не настроен.',{exact:true}).waitFor();
   await p.reload();await p.getByLabel('Организация в сервисе').waitFor();assert.equal(await p.getByLabel('Организация в сервисе').inputValue(),'Хозяйство для проверки '+id);
   assert.equal(await p.getByRole('checkbox',{name:/Урожай/}).isChecked(),true);await p.getByText('Не настроен',{exact:true}).waitFor();await noOverflow(p);
   await p.getByRole('button',{name:'Скопировать запрос на подключение'}).click();assert.ok((await p.getByLabel('Запрос на подключение').inputValue()).includes('Урожай'));
   if(id!=='one-c')assert.equal(await p.locator('input[type=password]').count(),0);
  }
  await p.goto(origin+'/#/settings/services');await p.getByText('Настройки сохранены',{exact:true}).first().waitFor();await p.screenshot({path:path.join(output,'services-390.png'),fullPage:true});
  await p.goto(origin+'/#/settings/services/one-c');await p.getByLabel('Пользователь 1С').fill('readonly');await p.getByLabel('Пароль 1С').fill('transient-password');
  // Browser success/error UX uses an explicit fixture; API tests exercise the real adapter separately.
  const saved=(await(await context.request.get(origin+'/api/integrations')).json()).connections.find(x=>x.provider==='one-c');
  await p.route('**/api/integrations/one-c/check',r=>r.fulfill({json:{...saved,checkedAt:Date.now(),status:'access_checked',collections:['Catalog_Fields'],version:saved.version}}));
  await p.getByRole('button',{name:'Проверить доступ к 1С'}).click();await p.getByText('Каталог OData доступен. Обмен данными ещё не настроен.',{exact:true}).waitFor();assert.equal(await p.getByLabel('Пароль 1С').inputValue(),'');
  await p.getByText('Доступные объекты · 1',{exact:true}).click();await p.getByText('Catalog_Fields',{exact:true}).waitFor();await p.screenshot({path:path.join(output,'one-c-390.png'),fullPage:true});
  await p.unroute('**/api/integrations/one-c/check');await p.route('**/api/integrations/one-c/check',r=>r.fulfill({status:422,json:{error:'1С отклонила доступ. Проверьте пользователя, пароль и права OData'}}));
  await p.getByLabel('Пароль 1С').fill('bad-password');await p.getByRole('button',{name:'Проверить доступ к 1С'}).click();await p.getByRole('alert').waitFor();assert.equal(await p.getByLabel('Пароль 1С').inputValue(),'');assert.equal(await p.getByText('Доступ проверен',{exact:true}).count(),0);
  await p.getByLabel('Организация в сервисе').fill('Изменено');assert.equal(await p.getByLabel('Пользователь 1С').isDisabled(),true);
  // Stale saves surface a version conflict instead of overwriting another device.
  await context.request.put(origin+'/api/integrations/one-c',{headers:{'X-EGIN':'1'},data:{account:'Другой телефон',endpoint:saved.endpoint,datasets:saved.datasets,version:saved.version}});
  await p.getByRole('button',{name:'Сохранить настройки',exact:true}).click();await p.getByText('Настройки изменены на другом устройстве. Обновите страницу',{exact:true}).waitFor();
  await p.reload();await p.getByLabel('Организация в сервисе').waitFor();assert.equal(await p.getByLabel('Организация в сервисе').inputValue(),'Другой телефон');
  for(const id of ids){
   await p.goto(origin+'/#/settings/services/'+id);await p.getByRole('button',{name:'Удалить настройки подключения',exact:true}).click();await p.getByRole('button',{name:'Удалить параметры',exact:true}).click();await p.getByText('Параметры подключения удалены.',{exact:true}).waitFor();
  }
  assert.equal((await(await context.request.get(origin+'/api/integrations')).json()).connections.length,0);
  assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}
 const safari=await webkit.launch();
 try{
  const c=await safari.newContext({viewport:{width:320,height:740},isMobile:true,hasTouch:true,serviceWorkers:'block'});await fixtures(c);const p=await c.newPage();
  for(const id of ['',...ids]){await p.goto(origin+'/#/settings/services'+(id?'/'+id:''));await p.getByRole('heading').first().waitFor();await noOverflow(p);}
  await p.goto(origin+'/#/settings/services');await p.getByRole('heading',{name:'Подключённые сервисы',exact:true}).waitFor();await p.screenshot({path:path.join(output,'services-webkit-320.png'),fullPage:true});await c.close();
 }finally{await safari.close();}
 console.log('Services: guest browsing, saved setup, reload, check UX, conflicts, removal, Chromium/WebKit phone layouts passed');
})().catch(e=>{console.error(e);process.exit(1);});
