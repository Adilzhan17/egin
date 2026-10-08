// Deterministic interaction tests. Geometries are synthetic; upstream transport/overlaps have separate tests.
const { chromium, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const origin = process.env.EGIN_URL || 'http://localhost:4935';
if (!['localhost', '127.0.0.1', 'dev-egin.perricheno.com'].includes(new URL(origin).hostname)) throw Error('Use isolated preview or staging');
const out = process.env.EGIN_MAP_SCREENSHOTS || path.resolve(__dirname, '../../../test-results/map');
const number = '020420021555', neighbourNumber = '020420021537';
const latitude = 48.83228811, longitude = 58.15064396;
function parcel(cadastralNumber, lon) {
  return { cadastralNumber, region: 'Актюбинская область', district: 'г. Эмба', boundary: { type: 'Polygon', coordinates: [[[lon-.0003,latitude-.0002],[lon+.0003,latitude-.0002],[lon+.0003,latitude+.0002],[lon-.0003,latitude+.0002],[lon-.0003,latitude-.0002]]] }, areaHa: .25, source: 'public-map', ownershipVerified: false };
}
const candidate = parcel(number, longitude), neighbour = parcel(neighbourNumber, longitude + .0009);
const regions = [
  { code:'02', name:'Актюбинская область', districts:[{id:48,code:'042',name:'г. Эмба',srid:32640}] },
  { code:'05', name:'Восточно-Казахстанская область', districts:[{id:83,code:'071',name:'Катон-Карагайский район',srid:32645}] },
];
const districtData = {
  48:{mapDistrict:regions[0].districts[0],name:'г. Эмба',region:regions[0].name,regionCode:'02',bounds:{west:longitude-.002,south:latitude-.002,east:longitude+.002,north:latitude+.002}},
  83:{mapDistrict:regions[1].districts[0],name:'Катон-Карагайский район',region:regions[1].name,regionCode:'05',bounds:{west:85.423,south:49.185,east:85.428,north:49.190}},
};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJz4AAAAASUVORK5CYII=', 'base64');
(async () => {
  fs.mkdirSync(out, {recursive:true});
  const browser = await chromium.launch({args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',permissions:['geolocation'],geolocation:{latitude,longitude,accuracy:5}});
    const records = new Map(), identifyRequests = [], tileRequests = [], baseRequests = [];
    let searchMode = 'ok', searchCalls = 0, releaseIdentify, delayedIdentify = false;
    await context.route('https://api.open-meteo.com/**', r => r.fulfill({json:require('./fixtures/open-meteo.json')}));
    await context.route('https://tile.openstreetmap.org/**', r => {baseRequests.push(r.request().url());return r.fulfill({contentType:'image/png',body:png});});
    await context.route('**/api/**', async r => {
      const u = new URL(r.request().url()), p = u.pathname;
      if (p === '/api/session') return r.fulfill({json:{user:{id:'map-ui-test',name:'Проверка карты'},rpID:'localhost',origin}});
      if (p === '/api/sync') {
        if (r.request().method() === 'GET') return r.fulfill({json:{records:[...records.values()],cursor:records.size,more:false}});
        const results = r.request().postDataJSON().records.map(row => {const version=(records.get(row.id)?.version||0)+1;records.set(row.id,{...row,version});return{id:row.id,version};});
        return r.fulfill({json:{results}});
      }
      if (p === '/api/cadastre/regions') return r.fulfill({json:{regions}});
      if (p === '/api/cadastre/district') return r.fulfill({json:districtData[u.searchParams.get('district')]});
      if (p === '/api/cadastre/search' || p === '/api/cadastre/identify') {
        const mode = searchMode;
        let chosen = candidate;
        if (p.endsWith('search')) searchCalls++;
        else {
          identifyRequests.push(u);
          for (const key of ['latitude','longitude']) assert.match(u.searchParams.get(key), /^-?\d+\.\d{8}$/);
          const lon = Number(u.searchParams.get('longitude'));
          chosen = Math.abs(lon-longitude-.0009) < Math.abs(lon-longitude) ? neighbour : candidate;
          if (delayedIdentify) {delayedIdentify=false;await new Promise(resolve=>{releaseIdentify=resolve;});}
        }
        if (mode === 'error') return r.fulfill({status:502,json:{error:'Кадастр временно недоступен. Повторите поиск.'}});
        if (mode === 'slow') await new Promise(resolve=>setTimeout(resolve,600));
        return r.fulfill({json:{candidates:mode==='empty'?[]:[chosen],mapDistrict:{id:48,code:'042',srid:32640},ownershipVerified:false}});
      }
      if (p === '/api/cadastre/labels') return r.fulfill({json:{labels:[{number,latitude,longitude},{number:neighbourNumber,latitude,longitude:longitude+.0009}]}});
      if (p.startsWith('/api/cadastre/basemap/')) {baseRequests.push(u.href);return r.fulfill({contentType:'image/png',body:png});}
      if (p.startsWith('/api/cadastre/tiles/')) {tileRequests.push(u);return r.fulfill({contentType:'image/png',body:png});}
      return r.fulfill({json:{}});
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/#/fields');
    await page.getByRole('heading',{name:'Участки',exact:true}).waitFor();
    await page.getByRole('button',{name:'Добавить участок',exact:true}).first().click();
    const dialog=page.getByRole('dialog',{name:'Добавить участок',exact:true});await dialog.waitFor();
    assert.equal(await page.locator('iframe').count(),0);
    const map = dialog.locator('.field-map');
    await expect.poll(()=>map.locator('img[src*="/api/cadastre/basemap/"]').count()).toBeGreaterThan(0);
    await expect(map.locator('img[src*="tile.openstreetmap.org"]')).toHaveCount(0);
    const save = dialog.getByRole('button',{name:'Добавить этот участок',exact:true});
    const summary = dialog.locator('.land-selection-summary strong');
    const searchInput=()=>dialog.getByLabel('Кадастровый номер',{exact:true}).first();
    async function search(value=number) {await searchInput().fill(value);await dialog.getByRole('button',{name:'Найти границы',exact:true}).click();}
    async function layout(width,height,selected=false) {
      await page.setViewportSize({width,height});await page.waitForTimeout(100);
      const bounds=await dialog.boundingBox(), input=await searchInput().boundingBox(), mapBounds=await map.boundingBox();
      assert.ok(bounds.x>=-1&&bounds.y>=-1&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1,JSON.stringify({bounds,width,height}));
      assert.ok(input.y>=0&&input.y+input.height<Math.min(height,280),'search must remain visible');
      assert.ok(mapBounds.height>=80,'map retains usable height');
      assert.equal(await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1),false,'no horizontal overflow');
      if(selected){const button=await save.boundingBox();assert.ok(button.y>=0&&button.y+button.height<=height+1,'save must stay visible');}
    }
    async function chooseDistrict(region,id) {
      await dialog.getByRole('button',{name:'Выбрать регион и район',exact:true}).click();
      await dialog.getByRole('combobox',{name:/^Область или город/}).selectOption(region);
      await dialog.getByRole('combobox',{name:/^Район/}).selectOption(String(id));
      await dialog.getByRole('button',{name:'Показать район на карте',exact:true}).click();
      await expect(dialog.getByRole('combobox',{name:/^Район/})).toHaveCount(0);
    }
    async function tapLabel(text) {
      const label=dialog.locator('.land-parcel-label span').filter({hasText:text}).first();
      await label.waitFor();
      const b=await label.boundingBox();assert.ok(b&&b.width>0);
      const response=page.waitForResponse(r=>r.url().includes('/api/cadastre/identify?'));
      // Real hit testing matters: transparent number overlays must let this touch reach the map.
      await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);
      return response;
    }
    for(const [w,h]of[[320,568],[360,740],[390,844],[430,932]])await layout(w,h);
    await page.setViewportSize({width:390,height:844});
    await chooseDistrict('02',48);
    await expect.poll(()=>tileRequests.some(u=>u.searchParams.get('district')==='48')).toBe(true);
    await search();await save.waitFor();await expect(summary).toHaveText(number);
    for(const [w,h]of[[320,568],[390,844],[430,932]])await layout(w,h,true);
    await page.setViewportSize({width:390,height:844});
    await tapLabel(neighbourNumber);await expect(summary).toHaveText(neighbourNumber);
    assert.equal(identifyRequests.length,1);
    assert.equal(identifyRequests[0].searchParams.get('district'),'48','map taps must send the currently selected district context');
    assert.ok(Math.abs(Number(identifyRequests[0].searchParams.get('longitude'))-(longitude+.0009))<.00006,'tap must target the neighbouring parcel, not the old selected polygon');
    assert.equal(await dialog.getByRole('tab',{name:'На карте',exact:true}).getAttribute('aria-selected'),'true');
    await page.screenshot({path:path.join(out,'number-result.png')});
    // A failed or empty lookup cannot retain a previous parcel's save action.
    searchMode='error';await search();await dialog.getByRole('alert').waitFor();await expect(save).toHaveCount(0);
    searchMode='empty';await search();await dialog.getByText(/Участок.*не найден/).waitFor();await expect(save).toHaveCount(0);
    searchMode='ok';await search();await save.waitFor();
    // Switching context while identify is pending must discard that response and old district.
    delayedIdentify=true;
    const pending= tapLabel(neighbourNumber);
    await expect.poll(()=>typeof releaseIdentify).toBe('function');
    await chooseDistrict('05',83);
    await expect(save).toHaveCount(0);
    releaseIdentify();await pending;await page.waitForTimeout(150);
    await expect(save).toHaveCount(0);
    await expect(summary).toHaveCount(0);
    await expect.poll(()=>tileRequests.some(u=>u.searchParams.get('district')==='83')).toBe(true);
    // The last requested base tiles are in the new district's longitude band, proving map movement.
    assert.ok(baseRequests.slice(-30).some(url=>{const m=url.match(/\/(\d+)\/(\d+)\/(\d+)\.png/);if(!m)return false;const lon=Number(m[2])/2**Number(m[1])*360-180;return lon>85&&lon<86;}),'district selection must move the viewport');
    await chooseDistrict('02',48);
    await search();await save.waitFor();
    // Layer switches remove their visible layers and restore them without losing the selection.
    await dialog.getByRole('button',{name:'Настройки карты',exact:true}).click();
    const outlines=dialog.getByRole('switch',{name:/Кадастровые границы/});
    const labels=dialog.getByRole('switch',{name:/Кадастровые номера/});
    await expect(dialog.getByRole('button',{name:'Спутник ЕГКН',exact:true})).toHaveAttribute('aria-pressed','true');
    await dialog.getByRole('button',{name:'Схема',exact:true}).click();
    await expect(dialog.getByRole('button',{name:'Схема',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(map.locator('img[src*="/api/cadastre/basemap/"]')).toHaveCount(0);
    await expect.poll(()=>map.locator('img[src*="tile.openstreetmap.org"]').count()).toBeGreaterThan(0);
    await dialog.getByRole('button',{name:'Спутник ЕГКН',exact:true}).click();
    await expect(dialog.getByRole('button',{name:'Спутник ЕГКН',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect.poll(()=>map.locator('img[src*="/api/cadastre/basemap/"]').count()).toBeGreaterThan(0);
    await expect(map.locator('img[src*="tile.openstreetmap.org"]')).toHaveCount(0);
    await outlines.uncheck();await labels.uncheck();
    await expect(map.locator('img[src*="/api/cadastre/tiles/"]')).toHaveCount(0);
    await expect(dialog.locator('.land-parcel-label')).toHaveCount(0);
    await expect(map.locator('.leaflet-overlay-pane path')).toHaveCount(1); // Selected boundary stays visible.
    await outlines.check();await labels.check();
    await expect.poll(()=>map.locator('img[src*="/api/cadastre/tiles/"]').count()).toBeGreaterThan(0);
    await dialog.getByRole('button',{name:'Настройки карты',exact:true}).click();
    await expect(summary).toHaveText(number);
    await tapLabel(neighbourNumber);await expect(summary).toHaveText(neighbourNumber);
    // Persist precisely the selected neighbour, not the initially searched cadastral number.
    await dialog.getByRole('button',{name:'Изменить название и посмотреть данные',exact:true}).click();
    await dialog.getByLabel('Название',{exact:true}).fill('Участок на карте');
    await expect(dialog.getByLabel('Кадастровый номер',{exact:true}).last()).toHaveValue(neighbourNumber);
    await dialog.getByRole('button',{name:'Скрыть данные участка',exact:true}).click();
    await save.click();await dialog.waitFor({state:'detached'});
    await page.locator('.land-detail h2').filter({hasText:'Участок на карте'}).waitFor();
    await expect(page.locator('.land-meta')).toContainText(neighbourNumber);
    await page.reload();await page.locator('.land-detail h2').filter({hasText:'Участок на карте'}).waitFor();
    await expect(page.locator('.land-meta')).toContainText(neighbourNumber);
    await expect.poll(()=>page.locator('.land-field-preview image[href*="/api/cadastre/basemap/"]').count()).toBeGreaterThan(0);
    await expect(page.locator('.land-preview-boundary')).toHaveAttribute('fill-rule','evenodd');
    // Match the fixture number lookup to that saved neighbour for the duplicate guard.
    await page.getByRole('button',{name:'Добавить участок',exact:true}).first().click();
    await search();await save.waitFor();await tapLabel(neighbourNumber);
    await dialog.getByRole('button',{name:'Уже добавлен · открыть участок',exact:true}).waitFor();await expect(save).toHaveCount(0);
    await dialog.getByRole('button',{name:'Закрыть выбор участка',exact:true}).click();
    // Inner rings must survive import, rendering, save/reload, previews and export.
    const cutout=[[longitude-.0001,latitude-.00008],[longitude+.0001,latitude-.00008],[longitude+.0001,latitude+.00008],[longitude-.0001,latitude+.00008],[longitude-.0001,latitude-.00008]];
    const geometry={type:'Polygon',coordinates:[candidate.boundary.coordinates[0],cutout]};
    await page.getByRole('button',{name:'Добавить участок',exact:true}).first().click();
    await dialog.getByRole('button',{name:'Файл границ, демо и помощь',exact:true}).click();
    await dialog.locator('input[type=file]').setInputFiles({name:'field-with-hole.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify({type:'Feature',properties:{name:'Участок с вырезом'},geometry}))});
    await save.waitFor();
    const landPath=map.locator('.leaflet-overlay-pane path');
    await expect(landPath).toHaveAttribute('fill-rule','evenodd');
    assert.equal(((await landPath.getAttribute('d')).match(/M/g)||[]).length,2,'map must draw the inner boundary');
    await save.click();await dialog.waitFor({state:'detached'});await page.reload();
    await page.locator('.land-detail h2').filter({hasText:'Участок с вырезом'}).waitFor();
    const card=page.locator('.land-field-cards button').filter({hasText:'Участок с вырезом'});
    await card.scrollIntoViewIfNeeded();const preview=card.locator('.land-preview-boundary');
    await expect(preview).toHaveAttribute('fill-rule','evenodd');
    assert.equal(((await preview.getAttribute('d')).match(/M/g)||[]).length,2,'preview must preserve the hole');
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Скачать контур GeoJSON',exact:true}).click();
    const downloaded=await download;const exported=JSON.parse(fs.readFileSync(await downloaded.path(),'utf8'));assert.deepEqual(exported.geometry,geometry);
    await expect.poll(()=>[...records.values()].some(row=>row.data?.name==='Участок с вырезом'&&row.data.boundary.coordinates.length===2)).toBe(true);
    await page.getByRole('button',{name:'Добавить участок',exact:true}).first().click();
    await dialog.getByRole('button',{name:'Файл границ, демо и помощь',exact:true}).click();
    await dialog.getByRole('button',{name:'Попробовать на демо-карте',exact:true}).click();
    await dialog.getByLabel('Выберите участок',{exact:true}).selectOption('1');
    await dialog.getByRole('button',{name:'Сохранить демо-участок',exact:true}).waitFor();
    await page.screenshot({path:path.join(out,'demo-selection.png')});
    searchMode='slow';await search();await dialog.getByRole('button',{name:'Закрыть выбор участка',exact:true}).click();
    await page.waitForTimeout(750);assert.equal(await page.getByRole('dialog').count(),0);
    assert.ok(searchCalls>=7);assert.deepEqual(errors,[]);
    console.log('PASS map interactions: 320–430px, district focus/context, neighbour label touch, distinct selection/persistence, errors/empty, stale identify after region switch, satellite/scheme switching, layer controls, satellite previews, holes import/render/save/export, duplicates, demo, late-response close.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
