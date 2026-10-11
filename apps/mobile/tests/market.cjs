// Real API + PostgreSQL acceptance. Run only against an isolated preview database.
const {chromium,webkit}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const weather=require('./fixtures/open-meteo.json');
const origin=process.env.EGIN_URL||'http://localhost:4935';
if(!/^http:\/\/(localhost|127\.0\.0\.1):/.test(origin))throw Error('Market acceptance creates fixtures: localhost preview required');
const out=path.resolve(__dirname,'../../../test-results/market');
let lastPage;
async function api(page,route,body,method){return page.evaluate(async({route,body,method})=>{const r=await fetch('/api/market'+route,{method:method||(body===undefined?'GET':'POST'),headers:{'X-EGIN':'1','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();if(!r.ok)throw Error(r.status+': '+JSON.stringify(data));return data;},{route,body,method});}
async function noOverflow(page,width){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}`);assert.equal(await page.locator('.mobile-nav').count(),1,'exactly one global navbar');}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await context.route('https://api.open-meteo.com/**',r=>r.fulfill({json:weather}));
 const page=await context.newPage();lastPage=page;page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 await page.goto(origin+'/#/market');await page.getByRole('heading',{name:'Рынок',exact:true}).waitFor();
 await page.goto(origin+'/#/settings/profile');await page.getByLabel('Имя',{exact:true}).fill('Market QA');await page.getByRole('button',{name:'Создать профиль с passkey',exact:true}).click();await page.getByRole('heading',{name:'Сохраните код восстановления',exact:true}).waitFor();await page.getByRole('button',{name:'Код сохранён',exact:true}).click();
 await page.goto(origin+'/#/market?view=new');await page.getByRole('heading',{name:'Создать объявление',exact:true}).waitFor();
 await page.getByLabel('Категория',{exact:true}).selectOption('harvest');await page.getByLabel('Подкатегория',{exact:true}).selectOption('harvest-wheat');await page.getByRole('button',{name:'Продажа',exact:true}).click();await page.getByRole('button',{name:'Продолжить',exact:true}).click();
 const title='Пшеница 3 класса QA '+Date.now();
 await page.getByLabel('Название',{exact:true}).fill(title);await page.getByLabel('Описание',{exact:true}).fill('Проверка реальной публикации через PostgreSQL. Пшеница урожая 2026 года.');
 await page.getByLabel('Культура *',{exact:true}).selectOption('Пшеница');await page.getByLabel('Класс',{exact:true}).selectOption('3');await page.getByLabel('Год урожая *',{exact:true}).fill('2026');await page.getByLabel('Объём, т *',{exact:true}).fill('100');
 await page.getByText('Сохранено ✓',{exact:true}).waitFor();
 const draftId=new URL(page.url()).hash.match(/id=([^&]+)/)[1];
 await page.reload();await page.getByLabel('Название',{exact:true}).waitFor();assert.equal(await page.getByLabel('Название',{exact:true}).inputValue(),title);assert.equal(await page.getByLabel('Год урожая *',{exact:true}).inputValue(),'2026');
 await page.screenshot({path:path.join(out,'wizard-restored.png'),fullPage:true});
 await page.getByRole('button',{name:'Продолжить',exact:true}).click();await page.getByRole('button',{name:'Фиксированная',exact:true}).click();await page.getByLabel('Сумма, ₸',{exact:true}).fill('95000');await page.getByLabel('За единицу',{exact:true}).selectOption('ton');await page.getByRole('button',{name:'Продолжить',exact:true}).click();
 const image=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=800;c.height=640;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,800,640);g.addColorStop(0,'#f1d19a');g.addColorStop(1,'#5d7543');x.fillStyle=g;x.fillRect(0,0,800,640);x.strokeStyle='#c7a052';x.lineWidth=6;for(let i=0;i<25;i++){x.beginPath();x.moveTo(i*34,640);x.lineTo(i*34+80,100+(i%4)*40);x.stroke();}return c.toDataURL('image/png').split(',')[1];});
 await page.getByLabel('Добавить фотографии',{exact:true}).setInputFiles({name:'test-grain.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
 await page.locator('.market-wizard-photos img, .market-upload-photos img, .market-photo-item img, .market-wizard-body img').first().waitFor();
 await page.getByLabel('Область или город',{exact:true}).selectOption('01');
 const district=page.getByLabel('Район',{exact:true});await district.locator('option[value="01-017"]').waitFor({state:'attached'});const districtCode='01-017';await district.selectOption(districtCode);
 await page.getByLabel('Населённый пункт',{exact:true}).fill('Макинск');await page.getByRole('button',{name:'Продолжить',exact:true}).click();
 await page.getByRole('button',{name:'Опубликовать',exact:true}).waitFor();await page.screenshot({path:path.join(out,'wizard-preview.png'),fullPage:true});await page.getByRole('button',{name:'Опубликовать',exact:true}).click();
 await page.waitForURL(/view=listing/);await page.getByRole('heading',{name:title,exact:true}).waitFor();assert.equal((await api(page,'/listings/'+draftId)).listing.status,'published');
 await page.screenshot({path:path.join(out,'listing-390.png'),fullPage:true});
 // Additional real record in isolated DB, for grid + price comparison tests.
 let other=(await api(page,'/listings',{clientId:crypto.randomUUID()})).listing;
 other=(await api(page,'/listings/'+other.id,{version:other.version,categoryId:'harvest-wheat',dealType:'buy',title:'Куплю пшеницу 100 тонн QA',description:'Тестовый запрос на покупку зерна для проверки каталога и фильтров.',attributes:{crop:'Пшеница',harvestYear:2026,volume:100},priceMode:'fixed',priceAmount:85000,priceUnit:'ton',regionCode:'01',districtCode,localityName:'Макинск'},'PATCH')).listing;
 await api(page,'/listings/'+other.id+'/publish',{version:other.version});
 await page.goto(origin+'/#/market');await page.locator('.market-card').first().waitFor();
 for(const width of [360,375,390,430,768,1280]){await page.setViewportSize({width,height:844});await noOverflow(page,width);assert.equal(await page.locator('.market-grid').first().evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),2);await page.screenshot({path:path.join(out,`catalog-${width}.png`),fullPage:true});}
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Фильтры',exact:true}).click();
 const filters=page.getByRole('dialog',{name:'Фильтры',exact:true});await filters.getByLabel('Категория',{exact:true}).selectOption('harvest');await filters.getByLabel('Подкатегория',{exact:true}).selectOption('harvest-wheat');await filters.getByLabel('Единица расчёта',{exact:true}).selectOption('ton');await filters.getByLabel('Цена от, ₸',{exact:true}).fill('80000');await filters.getByLabel('Цена до, ₸',{exact:true}).fill('100000');await filters.getByLabel('Область или город',{exact:true}).selectOption('01');await filters.getByLabel('Район',{exact:true}).selectOption(districtCode);await filters.getByRole('button',{name:/^Показать \d/}).waitFor();await page.screenshot({path:path.join(out,'filters-390.png')});await filters.getByRole('button',{name:/^Показать \d/}).click();await page.waitForURL(/priceUnit=ton/);await page.locator('.market-card').first().waitFor();assert.ok(page.url().includes('districtCode=01-017'));
 await page.goto(origin+'/#/market?view=categories');await page.locator('.market-category-group').first().waitFor();assert.equal(await page.locator('.market-category-group').count(),8);await page.screenshot({path:path.join(out,'categories-390.png'),fullPage:true});
 await page.goto(origin+'/#/market?q='+encodeURIComponent(title));await page.locator('.market-card').first().waitFor();
 const card=page.locator('.market-card').filter({has:page.getByRole('heading',{name:title,exact:true})});await card.getByRole('button',{name:'В избранное',exact:true}).click();await card.getByRole('button',{name:'Удалить из избранного',exact:true}).waitFor();
 await page.goto(origin+'/#/market?view=favorites');await page.getByRole('heading',{name:title,exact:true}).waitFor();await noOverflow(page,390);
 await page.goto(origin+'/#/market?view=edit&id='+draftId);await page.getByRole('button',{name:'Назад',exact:true}).click();await page.getByRole('button',{name:'Назад',exact:true}).click();await page.getByRole('button',{name:'Назад',exact:true}).click();await page.getByLabel('Название',{exact:true}).fill(title+' обновлено');await page.getByText('Сохранено ✓',{exact:true}).waitFor();assert.equal((await api(page,'/listings/'+draftId)).listing.title,title+' обновлено');
 await page.goto(origin+'/#/market?view=my');const own=page.locator('.market-my-card').filter({hasText:title+' обновлено'});await own.getByRole('button',{name:'В архив',exact:true}).click();const confirm=page.getByRole('dialog',{name:'Переместить в архив?',exact:true});const archived=page.waitForResponse(r=>r.url().includes('/'+draftId+'/archive')&&r.request().method()==='POST');await confirm.getByRole('button',{name:'В архив',exact:true}).click();assert.equal((await archived).status(),200);
 const publicRows=await api(page,'/listings?q='+encodeURIComponent(title));assert.ok(!publicRows.items.some(r=>r.id===draftId));
 assert.deepEqual(errors,[]);await browser.close();
 const safari=await webkit.launch();const sc=await safari.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await sc.route('https://api.open-meteo.com/**',r=>r.fulfill({json:weather}));const sp=await sc.newPage();await sp.goto(origin+'/#/market');await sp.locator('.market-card').first().waitFor();await noOverflow(sp,390);await sp.screenshot({path:path.join(out,'catalog-safari.png'),fullPage:true});await safari.close();
 console.log('PASS Market real PostgreSQL publication, restored draft, image, search, favorites, edit/archive, 6 widths, WebKit');
})().catch(async error=>{console.error(error);if(lastPage){await lastPage.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});console.error((await lastPage.locator('body').innerText().catch(()=>'' )).slice(-3000));}process.exit(1);});
