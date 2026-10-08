const {chromium,webkit}=require('@playwright/test');
const assert=require('node:assert/strict');
const origin=process.env.EGIN_URL||'http://localhost:4935';
const fixture=require('./fixtures/open-meteo.json');
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox','--enable-unsafe-swiftshader']});
 const make=async()=>{const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});await context.route('https://api.open-meteo.com/**',r=>r.fulfill({json:fixture}));await context.route('**/api/news',r=>r.fulfill({json:require('./fixtures/news.json')}));await context.route('https://eldala.kz/**',r=>r.abort());return context;};
 const phone=await make(), target=await make();const p=await phone.newPage(),t=await target.newPage();const errors=[];for(const page of [p,t])page.on('pageerror',e=>errors.push(e.message));
 const cdp=await phone.newCDPSession(p);await cdp.send('WebAuthn.enable');await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
 await p.goto(origin+'/#/auth');assert.equal(await p.locator('.mobile-nav').count(),0);
 for(const width of [320,360,390,430]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await p.getByRole('button',{name:'Создать профиль',exact:true}).click();await p.getByLabel('Ваше имя').fill('QR Test');await p.getByRole('button',{name:'Создать passkey',exact:true}).click();await p.getByRole('button',{name:'Код сохранён',exact:true}).click();await p.getByRole('navigation').waitFor();
 await t.goto(origin+'/#/auth');const created=t.waitForResponse(r=>r.url().endsWith('/api/auth/qr/start'));await t.getByRole('button',{name:'Войти по QR с телефона'}).click();const qr=await(await created).json();await t.getByAltText('QR для входа в EGIN').waitFor();assert.equal(await t.locator('.auth-code').textContent(),qr.code);
 const noCookie=await target.request.post(origin+'/api/auth/qr/'+qr.id+'/options',{headers:{'X-EGIN':'1'},data:{}});assert.equal(noCookie.status(),401);
 await p.goto(qr.url);await p.getByText('Я начал этот вход, коды совпадают').waitFor();assert.equal(await p.locator('.auth-code').textContent(),qr.code);assert.equal(await p.getByRole('button',{name:'Подтвердить с passkey'}).isDisabled(),true);
 await p.getByRole('checkbox').check();await p.getByRole('button',{name:'Подтвердить с passkey'}).click();await p.getByText('Вход подтверждён. Вернитесь на устройство, где показан QR.').waitFor();await t.getByRole('navigation').waitFor({timeout:15000});
 const account=await t.evaluate(()=>fetch('/api/session').then(r=>r.json()));assert.equal(account.user.name,'QR Test');
 const replay=await target.request.post(origin+'/api/auth/qr/poll',{headers:{'X-EGIN':'1'},data:{id:qr.id}});assert.equal(replay.status(),410);
 await t.evaluate(()=>fetch('/api/logout',{method:'POST',headers:{'X-EGIN':'1'}}));await t.goto(origin+'/#/auth');const next=t.waitForResponse(r=>r.url().endsWith('/api/auth/qr/start'));await t.getByRole('button',{name:'Войти по QR с телефона'}).click();const denied=await(await next).json();await p.goto(denied.url);await p.getByRole('button',{name:'Отклонить вход'}).click();await p.getByText('Вход отклонён.',{exact:true}).waitFor();await t.getByRole('button',{name:'Создать новый QR'}).waitFor({timeout:15000});
 assert.deepEqual(errors,[]);await browser.close();
 const safari=await webkit.launch();const page=await safari.newPage({viewport:{width:320,height:700},isMobile:true});await page.route('https://api.open-meteo.com/**',r=>r.fulfill({json:fixture}));await page.goto(origin+'/#/auth');await page.getByText('Вход через eGov',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await safari.close();console.log('PASS: real passkey signup, phone QR approval with passkey, browser binding, replay rejection, denial, mobile layouts and Safari auth.');
})().catch(e=>{console.error(e);process.exit(1)});
