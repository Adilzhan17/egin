const { chromium, webkit } = require('@playwright/test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/news.json');
const weather = require('./fixtures/open-meteo.json');
const origin = process.env.EGIN_URL || 'http://localhost:4935';
(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ args: engine === chromium ? ['--no-sandbox', '--enable-unsafe-swiftshader'] : [] });
    const context = await browser.newContext({ viewport: {width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block' });
    const errors=[];
    let available=true;
    const news={...fixture,items:[...fixture.items,...fixture.items.map(item=>({...item,id:item.id+'0',url:item.url.replace('-test','0-test')}))]};
    await context.route('https://api.open-meteo.com/**',route=>route.fulfill({json:weather}));
    await context.route('**/api/news',route=>route.fulfill(available?{json:news}:{status:503,json:{error:'Unavailable'}}));
    await context.route('https://eldala.kz/uploads/**',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNn8AAAAASUVORK5CYII=','base64')}));
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);await page.locator('.news-item').first().waitFor();
    assert.equal(await page.locator('.news-item').count(),4);
    await page.getByRole('button',{name:'Ещё новости · 2'}).click();assert.equal(await page.locator('.news-item').count(),6);
    await page.locator('.news-photo').first().scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('.news-photo').naturalWidth>0);
    for(const width of [320,360,390,430]){
      await page.setViewportSize({width,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    for(const label of ['Погода','Настройки','Главная']){
      await page.getByRole('navigation').getByRole('link',{name:label,exact:true}).click();
      await page.getByRole('navigation').locator('a[aria-current="page"]').filter({hasText:label}).waitFor();
      assert.deepEqual(await page.locator('.nav-item.active').evaluate(el=>[getComputedStyle(el).backgroundColor,getComputedStyle(el.querySelector('.nav-icon')).backgroundColor]),['rgba(0, 0, 0, 0)','rgba(0, 0, 0, 0)']);
    }
    available=false;await page.reload();await page.getByText(/Сохранённая лента/).waitFor();
    assert.ok(await page.locator('.news-item').count()>0);
    await page.evaluate(()=>localStorage.removeItem('egin.news.eldala.v1'));await page.reload();
    await page.getByRole('button',{name:'Повторить',exact:true}).waitFor();assert.equal(await page.locator('.news-item').count(),0);
    available=true;await page.getByRole('button',{name:'Повторить',exact:true}).click();await page.locator('.news-item').first().waitFor();
    assert.deepEqual(errors,[]);await browser.close();console.log(`${engine.name()}: news photos, expansion, phone widths, navigation, cache, failure and retry passed`);
  }
})().catch(error=>{console.error(error);process.exit(1)});
