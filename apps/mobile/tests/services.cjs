const {chromium,webkit}=require('@playwright/test');
const assert=require('node:assert/strict');
const origin=process.env.EGIN_URL||'http://localhost:4935';
if(!['localhost','127.0.0.1','dev-egin.perricheno.com'].includes(new URL(origin).hostname))throw new Error('Use local preview or staging for service write tests');
const ids=['one-c','agrosignal','agrostream'];
const draftIds=['agrosignal','agrostream'];
const noOverflow=async p=>assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile content must fit');
async function fixtures(c){await c.route('https://api.open-meteo.com/**',r=>r.fulfill({json:require('./fixtures/open-meteo.json')}));await c.route('**/api/news',r=>r.fulfill({json:require('./fixtures/news.json')}));await c.route('https://eldala.kz/**',r=>r.abort());}
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await fixtures(context);
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  // Guest can inspect providers without leaking another profile's saved settings.
  await p.goto(origin+'/#/settings');await p.getByRole('link',{name:/Подключённые сервисы/}).click();
  await p.getByRole('heading',{name:'Подключённые сервисы',exact:true}).waitFor();assert.equal(await p.locator('.service-card').count(),3);
  await noOverflow(p);
  await p.getByRole('link',{name:/1С:ERP АПК/}).click();await p.getByRole('link',{name:/Войти для подключения/}).waitFor();assert.equal(await p.locator('input[type=password]').count(),0);
  const cdp=await context.newCDPSession(p);await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
  await p.goto(origin+'/#/auth');await p.getByRole('button',{name:'Создать профиль',exact:true}).click();await p.getByLabel('Ваше имя').fill('Service connection test');await p.getByRole('button',{name:'Создать passkey',exact:true}).click();await p.getByRole('button',{name:'Код сохранён',exact:true}).click();await p.getByRole('navigation').waitFor();
  // These providers still use their real, preparation-only CRUD endpoints.
  for(const id of draftIds){
   await p.goto(origin+'/#/settings/services/'+id);await p.getByLabel('Организация в сервисе').fill('Хозяйство для проверки '+id);
   await p.getByRole('checkbox',{name:/Урожай/}).check();
   await p.getByRole('button',{name:'Сохранить настройки',exact:true}).click();await p.getByText('Настройки сохранены. Обмен данными ещё не настроен.',{exact:true}).waitFor();
   await p.reload();await p.getByLabel('Организация в сервисе').waitFor();assert.equal(await p.getByLabel('Организация в сервисе').inputValue(),'Хозяйство для проверки '+id);
   assert.equal(await p.getByRole('checkbox',{name:/Урожай/}).isChecked(),true);await p.getByText('Не настроен',{exact:true}).waitFor();await noOverflow(p);
   await p.getByRole('button',{name:'Скопировать запрос на подключение'}).click();assert.ok((await p.getByLabel('Запрос на подключение').inputValue()).includes('Урожай'));
   assert.equal(await p.locator('input[type=password]').count(),0);
  }
  // Stale drafts cannot overwrite settings saved from another device.
  await p.goto(origin+'/#/settings/services/agrosignal');await p.getByLabel('Организация в сервисе').fill('Изменено');
  const saved=(await(await context.request.get(origin+'/api/integrations')).json()).connections.find(x=>x.provider==='agrosignal');
  const otherSave=await context.request.put(origin+'/api/integrations/agrosignal',{headers:{'X-EGIN':'1'},data:{account:'Другой телефон',endpoint:saved.endpoint,datasets:saved.datasets,version:saved.version}});assert.equal(otherSave.status(),200);
  await p.getByRole('button',{name:'Сохранить настройки',exact:true}).click();await p.getByText('Настройки изменены на другом устройстве. Обновите страницу',{exact:true}).waitFor();
  await p.reload();await p.getByLabel('Организация в сервисе').waitFor();assert.equal(await p.getByLabel('Организация в сервисе').inputValue(),'Другой телефон');
  await p.goto(origin+'/#/settings/services');await p.getByText('Настройки сохранены',{exact:true}).first().waitFor();

  // Explicit UI fixture only: real OData transport/import correctness is covered by API tests.
  let connection=null,runs=[],previewCalls=0,importCalls=0,connectCalls=0,mappingCalls=0;
  const now=Date.now(),row={Ref_Key:'field-fixture-1',Description:'Северный участок',Area:42,Latitude:51.1,Longitude:71.2};
  await p.route(/\/api\/one-c(?:\/[^?]*)?(?:\?.*)?$/,async route=>{
   const request=route.request(),url=new URL(request.url()),method=request.method(),body=method==='GET'?{}:request.postDataJSON();
   if(url.pathname==='/api/one-c'&&method==='GET')return route.fulfill({json:{connection,runs}});
   if(url.pathname==='/api/one-c/connect'&&method==='POST'){
    connectCalls++;assert.equal(body.endpoint,'https://fixture.example/base/odata/standard.odata/');assert.equal(body.username,'reader');
    if(body.password==='bad-fixture')return route.fulfill({status:422,json:{error:'Тест: 1С отклонила доступ'}});
    assert.equal(body.password,'good-fixture');connection={endpoint:body.endpoint,username:body.username,version:1,status:'connected',checkedAt:now,lastError:null,collections:[{name:'Catalog_Fields'}],mapping:null,scheduleMinutes:0};
    return route.fulfill({json:{connection,runs}});
   }
   if(url.pathname==='/api/one-c/schema'&&method==='GET'){
    assert.equal(url.searchParams.get('collection'),'Catalog_Fields');return route.fulfill({json:{properties:Object.keys(row).map(name=>({name,type:typeof row[name]==='number'?'Edm.Double':'Edm.String'})),sample:[row]}});
   }
   if(url.pathname==='/api/one-c/mapping'&&method==='PUT'){
    mappingCalls++;assert.equal(body.version,1);assert.equal(body.scheduleMinutes,0);assert.equal(body.mapping.cropDefault,'wheat');assert.equal(body.mapping.id,'Ref_Key');assert.equal(body.mapping.fields.name,'Description');
    connection={...connection,version:2,mapping:body.mapping,scheduleMinutes:body.scheduleMinutes};return route.fulfill({json:{connection,runs}});
   }
   if(url.pathname==='/api/one-c/preview'&&method==='POST'){
    previewCalls++;assert.equal(body.version,2);return route.fulfill({json:{previewId:'fixture-preview',expiresAt:now+600000,summary:{created:1,updated:0,unchanged:0,skipped:0},rows:[{sourceId:row.Ref_Key,action:'create',data:{name:row.Description,area:42,latitude:51.1,longitude:71.2,crop:'wheat'}}],total:1}});
   }
   if(url.pathname==='/api/one-c/import'&&method==='POST'){
    importCalls++;assert.equal(body.previewId,'fixture-preview');const run={id:'fixture-run',created:now,status:'success',createdCount:1,updatedCount:0,unchangedCount:0,skippedCount:0,issues:[]};runs=[run];connection={...connection,lastRunAt:now};return route.fulfill({json:{run}});
   }
   if(url.pathname==='/api/one-c'&&method==='DELETE'){
    assert.equal(body.version,2);connection=null;runs=[];return route.fulfill({json:{ok:true}});
   }
   throw new Error('Unexpected fixture request: '+method+' '+url.pathname);
  });
  await p.goto(origin+'/#/settings/services/one-c');await p.getByLabel('Адрес OData').fill('https://fixture.example/base/odata/standard.odata/');await p.getByLabel('Пользователь 1С').fill('reader');await p.getByLabel('Пароль',{exact:true}).fill('bad-fixture');
  await p.getByRole('button',{name:'Подключить 1С',exact:true}).click();await p.getByText('Тест: 1С отклонила доступ',{exact:true}).waitFor();assert.equal(await p.getByLabel('Пароль',{exact:true}).inputValue(),'');assert.equal(await p.getByRole('heading',{name:'Доступ к базе настроен',exact:true}).count(),0);
  await p.getByLabel('Пароль',{exact:true}).fill('good-fixture');await p.getByRole('button',{name:'Подключить 1С',exact:true}).click();await p.getByRole('heading',{name:'Доступ к базе настроен',exact:true}).waitFor();assert.equal(await p.getByLabel('Пароль',{exact:true}).inputValue(),'');
  await p.getByLabel('Справочник или документ',{exact:true}).selectOption('Catalog_Fields');await p.getByLabel('Постоянный ID записи · обязательно').waitFor();
  await p.getByLabel('Название участка · обязательно').selectOption('Description');await p.getByLabel('Площадь · обязательно').selectOption('Area');await p.getByLabel('Широта · обязательно').selectOption('Latitude');await p.getByLabel('Долгота · обязательно').selectOption('Longitude');await p.getByLabel('Культура для всех импортируемых участков').selectOption('wheat');
  assert.equal(await p.getByLabel('Повторный обмен',{exact:true}).inputValue(),'0');await p.getByRole('button',{name:'Сохранить соответствия',exact:true}).click();await p.getByText('Соответствия сохранены. Проверьте данные перед первым импортом.',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Проверить данные',exact:true}).click();await p.getByRole('heading',{name:'Результат проверки · 1 записей'}).waitFor();assert.equal(importCalls,0,'preview must never silently import');await p.getByText('Северный участок',{exact:true}).waitFor();await noOverflow(p);
  await p.getByRole('button',{name:'Импортировать 1 записей',exact:true}).click();await p.getByText('Обмен завершён: добавлено 1, обновлено 0, без изменений 0, пропущено 0.',{exact:true}).waitFor();await p.getByRole('button',{name:'Повторить обмен сейчас',exact:true}).waitFor();
  assert.equal(connectCalls,2);assert.equal(mappingCalls,1);assert.equal(previewCalls,1);assert.equal(importCalls,1);
  await p.getByRole('button',{name:'Отключить 1С',exact:true}).click();await p.getByRole('button',{name:'Отключить и удалить доступ',exact:true}).click();await p.getByText('1С отключена. Импортированные данные сохранены.',{exact:true}).waitFor();assert.equal(connection,null);
  for(const id of draftIds){
   await p.goto(origin+'/#/settings/services/'+id);await p.getByRole('button',{name:'Удалить настройки подключения',exact:true}).click();await p.getByRole('button',{name:'Удалить параметры',exact:true}).click();await p.getByText('Параметры подключения удалены.',{exact:true}).waitFor();
  }
  assert.equal((await(await context.request.get(origin+'/api/integrations')).json()).connections.length,0);
  assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}
 const safari=await webkit.launch();
 try{
  const c=await safari.newContext({viewport:{width:320,height:740},isMobile:true,hasTouch:true,serviceWorkers:'block'});await fixtures(c);const p=await c.newPage();
  for(const id of ['',...ids]){await p.goto(origin+'/#/settings/services'+(id?'/'+id:''));await p.getByRole('heading').first().waitFor();await noOverflow(p);}
  await c.close();
 }finally{await safari.close();}
 console.log('Services: guest cards, real partner drafts/conflicts/removal, mocked 1C connect/schema/preview/confirmed import/disconnect, phone layouts passed');
})().catch(e=>{console.error(e);process.exit(1);});
