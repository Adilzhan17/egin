const {chromium,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const origin=process.env.EGIN_URL||'http://localhost:4935';

(async()=>{
  const browser=await chromium.launch({args:['--no-sandbox','--enable-unsafe-swiftshader']});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
    await context.route('https://api.open-meteo.com/**',r=>r.fulfill({json:require('./fixtures/open-meteo.json')}));
    await context.route('**/api/news',r=>r.fulfill({json:require('./fixtures/news.json')}));
    const page=await context.newPage();page.setDefaultTimeout(45000);
    const cdp=await context.newCDPSession(page);await cdp.send('WebAuthn.enable');
    const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true}});
    await page.goto(origin+'/#/auth');await page.getByRole('button',{name:'Войти с ключом доступа',exact:true}).click();
    await page.getByRole('button',{name:'Создать профиль',exact:true}).click();await page.getByLabel('Ваше имя').fill('Security verification');
    await page.getByRole('button',{name:'Создать passkey',exact:true}).click();await page.locator('.recovery-card code').waitFor();
    const recovery=await page.locator('.recovery-card code').innerText();await page.getByRole('button',{name:'Код сохранён',exact:true}).click();await page.getByRole('navigation').waitFor();
    const post=(path,data={})=>context.request.post(origin+'/api'+path,{headers:{'X-EGIN':'1'},data});
    const email=`security-${Date.now()}@example.com`,password='a long test password for security verification';
    assert.equal((await post('/auth/password/attach',{email,password,code:recovery})).status(),201);
    await post('/logout');assert.equal((await post('/auth/password/login',{email,password})).status(),200);
    await page.goto(origin+'/#/settings/security');await page.getByRole('heading',{name:'Подтвердить личность',exact:true}).waitFor();
    assert.equal((await post('/recovery')).status(),403,'password cannot replace recovery while a passkey exists');
    assert.equal((await post('/auth/register/options',{})).status(),403,'password cannot add an attacker passkey');
    const oldCookie=(await context.cookies()).find(c=>c.name==='egin_session');assert.ok(oldCookie.httpOnly);
    await cdp.send('WebAuthn.setResponseOverrideBits',{authenticatorId,isBadUV:true});
    let response=page.waitForResponse(r=>r.url().endsWith('/api/auth/reauth/verify'));
    await page.getByRole('button',{name:'Подтвердить с passkey',exact:true}).click();assert.ok((await response).status()>=400,'a signed assertion without user verification must fail');
    const denied=await context.request.get(origin+'/api/session');assert.equal((await denied.json()).security.assurance,'password');
    assert.equal((await context.cookies()).find(c=>c.name==='egin_session').value,oldCookie.value);
    await cdp.send('WebAuthn.setResponseOverrideBits',{authenticatorId,isBadUV:false});
    response=page.waitForResponse(r=>r.url().endsWith('/api/auth/reauth/verify'));
    await expect(page.getByRole('button',{name:'Подтвердить с passkey',exact:true})).toBeEnabled();
    await page.getByRole('button',{name:'Подтвердить с passkey',exact:true}).click();const accepted=await response;assert.equal(accepted.status(),200);
    await page.getByText('Личность подтверждена. Можно продолжить действие.',{exact:true}).waitFor();
    const newCookie=(await context.cookies()).find(c=>c.name==='egin_session');assert.notEqual(newCookie.value,oldCookie.value);
    assert.equal((await context.request.get(origin+'/api/passkeys',{headers:{Cookie:`egin_session=${oldCookie.value}`}})).status(),401);
    assert.equal((await post('/auth/reauth/verify',accepted.request().postDataJSON())).status(),400,'challenge is single-use');
    assert.equal((await post('/recovery')).status(),200);
    assert.equal((await(await context.request.get(origin+'/api/session')).json()).security.assurance,'passkey');
    await context.close();console.log('PASS: real WebAuthn UV enforcement, reauthentication UI, session rotation, recovery protection and replay rejection');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
