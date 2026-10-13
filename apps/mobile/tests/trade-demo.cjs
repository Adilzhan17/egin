// Explicit API fixtures: component behavior only. Real server coverage lives in trade-demo-real.cjs.
const {chromium,webkit,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const origin=process.env.EGIN_URL||'http://localhost:4947';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Local fixture only');
const out=path.resolve(__dirname,'../../../test-results/trade-demo');fs.mkdirSync(out,{recursive:true});
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{for(const engine of[chromium,webkit]){
 const browser=await engine.launch(engine===chromium?{args:['--no-sandbox']}:{});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const scenario={sellerOrganizationId:uuid(1),buyerOrganizationId:uuid(2),partnerOrganizationId:uuid(3),lotIds:[uuid(4)],listingIds:[uuid(5)],offerIds:[uuid(6),uuid(7)],dealIds:[uuid(8),uuid(9)],conversationIds:[]};
  const manifest={isDemo:true,organizations:[],scenario};let saved=false,failCreate=true,unauthorized=false,postCount=0;
  await context.route('**/api/platform/demo',async route=>{
   if(unauthorized)return route.fulfill({status:401,json:{error:'Войдите в EGIN'}});
   if(route.request().method()==='POST'){
    assert.deepEqual(route.request().postDataJSON(),{});postCount++;
    if(failCreate)return route.fulfill({status:503,json:{error:'Пример пока не создан'}});
    await new Promise(resolve=>setTimeout(resolve,150));saved=true;
   }
   return route.fulfill({json:saved?manifest:{isDemo:false}});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/tests/fixtures/trade-demo.html');
  const create=page.getByRole('button',{name:'Попробовать на демо-примере',exact:true});
  await create.click();await expect(page.getByRole('alert')).toContainText('Пример пока не создан');await expect(page.getByRole('navigation',{name:'Сторона демо-сделки'})).toHaveCount(0);
  failCreate=false;await create.evaluate(element=>{element.click();element.click();});
  await expect(page.getByRole('navigation',{name:'Сторона демо-сделки'})).toBeVisible();assert.equal(postCount,2,'Failed + successful POST; duplicate click ignored');
  await expect(page.getByLabel('Created callback')).toHaveText('1');await expect(page.locator('.trade-demo-steps li')).toHaveCount(6);await expect(page.locator('.trade-demo-steps')).toBeVisible();
  await expect(page.locator('.trade-demo-tip')).toContainText('не отвечают автоматически');await expect(page.locator('.trade-demo-disclaimer')).toContainText('не означают реальную отгрузку или перевод денег');
  const roles=page.getByRole('navigation',{name:'Сторона демо-сделки'});
  await roles.getByRole('link',{name:'Покупатель',exact:true}).click();await expect(roles.getByRole('link',{name:'Покупатель',exact:true})).toHaveAttribute('aria-current','true');assert.match(new URL(page.url()).hash,new RegExp('organizationId='+uuid(2)));
  await roles.getByRole('link',{name:'Партнёр',exact:true}).click();assert.match(new URL(page.url()).hash,/view=business/);assert.match(new URL(page.url()).hash,/tab=services/);
  const steps=page.locator('.trade-demo-steps a');await expect(steps.nth(0)).toHaveAttribute('href',new RegExp('id='+uuid(4)));await expect(steps.nth(1)).toHaveAttribute('href',new RegExp('id='+uuid(6)));await expect(steps.nth(2)).toHaveAttribute('href',/screen=offers/);await expect(steps.nth(3)).toHaveAttribute('href',new RegExp('id='+uuid(9)));await expect(steps.nth(4)).toHaveAttribute('href',/screen=finance/);
  await page.evaluate(({org,id})=>{location.hash='#/market?view=trade&organizationId='+org+'&screen=deal&id='+id;},{org:uuid(1),id:uuid(30)});
  await expect(roles.getByRole('link',{name:'Покупатель',exact:true})).toHaveAttribute('href',new RegExp('id='+uuid(30)));await roles.getByRole('link',{name:'Покупатель',exact:true}).click();assert.match(new URL(page.url()).hash,new RegExp('organizationId='+uuid(2)));assert.match(new URL(page.url()).hash,new RegExp('id='+uuid(30)));
  await page.evaluate(({org,id})=>{location.hash='#/market?view=trade&organizationId='+org+'&screen=deal&id='+id;},{org:uuid(99),id:uuid(30)});
  await expect(roles.getByRole('link',{name:'Покупатель',exact:true})).toHaveAttribute('href',/screen=overview/);
  for(const width of[360,390,430,1024]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No overflow '+width);}
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,engine.name()+'-390.png'),fullPage:true,animations:'disabled'});
  await page.reload();await expect(page.getByRole('button',{name:'Как пройти сценарий',exact:true})).toBeVisible();await expect(page.locator('.trade-demo-steps')).not.toBeVisible();await page.getByRole('button',{name:'Как пройти сценарий',exact:true}).click();await expect(page.locator('.trade-demo-steps')).toBeVisible();assert.equal(postCount,2,'Reload reads manifest without POST');
  manifest.scenario.steps=[{id:'api-step',title:'Шаг с сервера',description:'Маршрут из сохранённого сценария',organizationId:uuid(2),view:'trade',screen:'deal',entityId:uuid(8)}];
  await page.reload();await page.getByRole('button',{name:'Как пройти сценарий',exact:true}).click();await expect(page.locator('.trade-demo-steps li')).toHaveCount(1);await expect(page.getByRole('link',{name:/Шаг с сервера/})).toHaveAttribute('href',new RegExp('id='+uuid(8)));
  unauthorized=true;await page.reload();await expect(page.getByRole('link',{name:'Войти в EGIN',exact:true})).toBeVisible();await expect(create).toHaveCount(0);assert.deepEqual(errors,[]);
  console.log(engine.name()+': demo create/retry/duplicate guard, reload, new deal role switch, real organization isolation, server steps, login and 4 widths PASS');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
