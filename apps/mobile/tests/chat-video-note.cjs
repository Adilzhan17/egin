// Chromium records actual fake-device MediaStreams/MediaRecorder, not a mocked recorder.
// WebKit covers honest unsupported fallback + real MP4 playback; hardware is manual.
const {chromium,webkit,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs');
const origin=process.env.EGIN_URL||'http://localhost:4947';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Local fixture only');
fs.mkdirSync('test-results/chat-video-note',{recursive:true});
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:['camera','microphone'],hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  await context.routeWebSocket('**', socket => { const server=socket.connectToServer();server.onMessage(message=>{try{if(['update','full-reload'].includes(JSON.parse(String(message)).type))return;}catch{}socket.send(message);}); });
  await context.addInitScript(()=>{window.__cameraRequests=[];window.__captureTracks=[];const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async constraints=>{window.__cameraRequests.push(constraints);if(window.__denyCamera)throw new DOMException('Denied','NotAllowedError');if(window.__noMicrophone)throw new DOMException('Missing microphone','NotFoundError');const stream=await original(constraints);window.__captureTracks.push(...stream.getTracks());return stream;};});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/tests/fixtures/chat-video-note.html');
  await page.getByRole('button',{name:'Видеозаметка',exact:true}).click();assert.equal(await page.evaluate(()=>window.__cameraRequests.length),0);
  await page.getByRole('button',{name:'Включить камеру'}).click();await expect(page.locator('.chat-video-recorder')).toHaveAttribute('data-stage','preview');
  await page.getByRole('button',{name:'Переключить камеру'}).click();await expect(page.locator('.chat-video-recorder')).toHaveAttribute('data-stage','preview');
  assert.deepEqual(await page.evaluate(()=>window.__cameraRequests.map(r=>r.video.facingMode.ideal)),['user','environment']);
  await page.getByRole('button',{name:'Начать запись видеозаметки'}).click();await expect(page.locator('.chat-video-recorder')).toHaveAttribute('data-stage','recording');
  await page.waitForTimeout(1200);await page.getByRole('button',{name:'Завершить запись'}).click();await expect(page.locator('.chat-video-recorder')).toHaveAttribute('data-stage','review');
  assert.equal(await page.evaluate(()=>window.__captureTracks.every(t=>t.readyState==='ended')),true);
  await page.getByRole('button',{name:'Воспроизвести видеозаметку'}).click();await expect(page.getByRole('progressbar',{name:'Воспроизведение видеозаметки'})).not.toHaveAttribute('aria-valuenow','0');
  await page.getByRole('button',{name:'Перезаписать'}).click();await expect(page.locator('.chat-video-recorder')).toHaveAttribute('data-stage','preview');
  const button=page.getByRole('button',{name:'Начать запись видеозаметки'}),box=await button.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(400);await page.mouse.move(box.x+box.width/2,box.y-65);await page.mouse.up();
  await expect(page.locator('.chat-video-recorder')).toHaveAttribute('data-stage','recording');
  await page.waitForTimeout(800);await page.getByRole('button',{name:'Завершить запись'}).click();await expect(page.locator('.chat-video-recorder')).toHaveAttribute('data-stage','review');
  await page.screenshot({path:'test-results/chat-video-note/chromium-review.png'});
  await page.getByRole('button',{name:'Отправить видеозаметку'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);assert.ok(Number(await page.getByTestId('sent-size').textContent())>1000);
  await page.getByRole('button',{name:'Сменить тему'}).click();await page.screenshot({path:'test-results/chat-video-note/chromium-midnight.png'});
  for(const width of [360,390,430]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.getByRole('button',{name:'Видеозаметка',exact:true}).click();await page.getByRole('button',{name:'Включить камеру'}).click();await expect(page.locator('.chat-video-recorder')).toHaveAttribute('data-stage','preview');await page.getByRole('button',{name:'Начать запись видеозаметки'}).click();await expect(page.locator('.chat-video-recorder')).toHaveAttribute('data-stage','review',{timeout:13000});assert.equal(await page.evaluate(()=>window.__captureTracks.every(t=>t.readyState==='ended')),true);
  await page.getByRole('button',{name:'Удалить запись'}).click();await expect(page.locator('.chat-video-recorder')).toHaveAttribute('data-stage','idle');
  await page.evaluate(()=>window.__denyCamera=true);await page.getByRole('button',{name:'Включить камеру'}).click();await expect(page.getByRole('alert')).toContainText('запрещён');await page.evaluate(()=>{window.__denyCamera=false;window.__noMicrophone=true;});await page.getByRole('button',{name:'Включить камеру'}).click();await expect(page.getByRole('alert')).toContainText('не найдены');
  await page.evaluate(()=>window.__noMicrophone=false);await page.getByRole('button',{name:'Включить камеру'}).click();await expect(page.locator('.chat-video-recorder')).toHaveAttribute('data-stage','preview');await page.getByRole('button',{name:'Закрыть',exact:true}).click();assert.equal(await page.evaluate(()=>window.__captureTracks.every(t=>t.readyState==='ended')),true);
  assert.deepEqual(errors,[]);await context.close();
  const moving=await browser.newContext({viewport:{width:390,height:844},permissions:['camera','microphone'],reducedMotion:'no-preference'});
  await moving.addInitScript(()=>{window.__tracks=[];const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);window.__tracks.push(...stream.getTracks());return stream;};});
  const movingPage=await moving.newPage();await movingPage.goto(origin+'/tests/fixtures/chat-video-note.html');await movingPage.getByRole('button',{name:'Видеозаметка',exact:true}).click();await movingPage.getByRole('button',{name:'Включить камеру'}).click();await expect(movingPage.locator('.chat-video-recorder')).toHaveAttribute('data-stage','preview');
  const exit=await movingPage.evaluate(()=>{const dialog=document.querySelector('dialog');dialog.querySelector('header button').click();return new Promise(resolve=>requestAnimationFrame(()=>resolve({same:dialog===document.querySelector('dialog'),phase:dialog.dataset.motionPhase,stopped:window.__tracks.every(track=>track.readyState==='ended')})));});assert.deepEqual(exit,{same:true,phase:'exit',stopped:true},'Animated exit keeps dialog while camera stops immediately');await expect(movingPage.getByRole('dialog',{includeHidden:true})).toHaveCount(0);await moving.close();
  console.log('Chromium native MediaRecorder + front/rear requests + hold lock + limit + camera cleanup PASS');
 }finally{await browser.close();}
 for(const engine of [chromium,webkit]){
  const browser=await engine.launch(engine===chromium?{args:['--no-sandbox']}:{});try{
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await context.addInitScript(()=>{Object.defineProperty(window,'MediaRecorder',{value:undefined,configurable:true});});const page=await context.newPage();await page.goto(origin+'/tests/fixtures/chat-video-note.html?fail=1');await page.getByRole('button',{name:'Видеозаметка',exact:true}).click();await expect(page.getByRole('status')).toContainText('недоступна');await expect(page.getByRole('button',{name:'Загрузить видеофайл'})).toBeVisible();
   const bytes=fs.readFileSync('/tmp/egin-note-fixture.mp4');await page.locator('input[type=file]').setInputFiles({name:'field.mp4',mimeType:'video/mp4',buffer:bytes});await expect(page.locator('.chat-video-recorder')).toHaveAttribute('data-stage','review');await page.getByRole('button',{name:'Отправить видеозаметку'}).click();await expect(page.getByRole('alert')).toContainText('Очередь недоступна');await expect(page.locator('.chat-video-recorder')).toHaveAttribute('data-stage','review');await page.screenshot({path:`test-results/chat-video-note/${engine.name()}-fallback.png`});
   await page.getByRole('button',{name:'Воспроизвести видеозаметку'}).click();await expect(page.getByRole('progressbar',{name:'Воспроизведение видеозаметки'})).not.toHaveAttribute('aria-valuenow','0');await context.close();console.log(engine.name()+' MP4 fallback + enqueue failure retains review PASS');
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
