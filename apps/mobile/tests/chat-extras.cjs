const {chromium,webkit,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const origin=process.env.EGIN_URL||'http://localhost:4947';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Local fixture required');
const id='10000000-0000-4000-8000-000000000001';
function message(n,text){return{id:`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`,conversationId:id,kind:'text',text,sequence:n,sender:{id:'alice',name:'Алия'},attachments:[],createdAt:'2026-10-13T10:00:00Z',hidden:false,deletedAt:null};}
(async()=>{for(const engine of[chromium,webkit]){const browser=await engine.launch({args:engine===chromium?['--no-sandbox']:[]});try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await context.addInitScript(()=>{const streams=[];window.EventSource=class extends EventTarget{constructor(){super();streams.push(this);}close(){const i=streams.indexOf(this);if(i>=0)streams.splice(i,1);}};window.extrasEmit=data=>streams.forEach(stream=>stream.dispatchEvent(new MessageEvent('change',{data:JSON.stringify(data)})));});
 let items=[message(10,'Сохранённое секретное'),message(9,'Остаётся')],next='8',releaseCollection,releaseSearch,releasePrivacy,releaseForward,readPrivate=false,delayPrivacy=false;
 const errors=[],calls=[];
 await context.route('**/api/chat/**',async route=>{const req=route.request(),url=new URL(req.url()),p=url.pathname;calls.push(p+url.search);
  if(/\/(saved|pins)$/.test(p)){if(url.searchParams.has('before')){const snapshot=[message(8,'Старая страница'),message(10,'Сохранённое секретное')];await new Promise(r=>releaseCollection=r);return route.fulfill({json:{items:snapshot,nextCursor:null}});}return route.fulfill({json:{items,nextCursor:next}});}
  if(p.endsWith('/members'))return route.fulfill({json:{items:[]}});
  if(p.endsWith('/search')){const q=url.searchParams.get('q')||'';if(url.searchParams.has('before')){await new Promise(r=>releaseSearch=r);return route.fulfill({json:{items:[message(50,'УСТАРЕВШИЙ РЕЗУЛЬТАТ')],nextCursor:null}});}return route.fulfill({json:{items:q==='новый'?[message(90,'новый результат')]:[message(60,'первый результат')],nextCursor:q==='новый'?null:'59'}});}
  if(p.endsWith('/receipts')){const snapshot={items:[{user:{id:'bob',name:'Бек'},delivered:true,read:!readPrivate,readPrivate}]};if(delayPrivacy)await new Promise(r=>releasePrivacy=r);return route.fulfill({json:snapshot});}
  if(p.endsWith('/conversations'))return route.fulfill({json:{items:[{id:'target',title:'Получатель',kind:'direct',canWrite:true}],nextCursor:null}});
  if(p.endsWith('/forward')){await new Promise(r=>releaseForward=r);return route.fulfill({json:{items:[]}});}
  return route.fulfill({json:{items:[],ok:true}});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/tests/fixtures/chat-extras.html');
 await expect(page.locator('.chat-history-results')).toContainText('Сохранённое секретное');
 await page.getByRole('button',{name:'Показать ещё',exact:true}).click();await expect.poll(()=>!!releaseCollection).toBe(true);
 items=[message(9,'Остаётся')];next=null;await page.evaluate(({id,messageId})=>window.extrasEmit({conversationId:id,type:'message.deleted',messageId}),{id,messageId:message(10,'').id});
 await expect(page.getByText('Сохранённое секретное',{exact:true})).toHaveCount(0);await expect(page.locator('.chat-history-results')).toContainText('Остаётся');releaseCollection();await page.waitForTimeout(120);await expect(page.getByText('Старая страница',{exact:true})).toHaveCount(0);await expect(page.getByText('Сохранённое секретное',{exact:true})).toHaveCount(0);
 // Personal hiding from another device scrubs the open collection immediately.
 items=[];await page.evaluate(({id,messageId})=>window.extrasEmit({conversationId:id,type:'personal',messageId}),{id,messageId:message(9,'').id});await expect(page.getByText('Остаётся',{exact:true})).toHaveCount(0);await expect(page.getByText('Здесь пока нет сообщений.',{exact:true})).toBeVisible();
 items=[message(7,'Сохранено после переподключения')];await page.evaluate(()=>window.extrasEmit({type:'ready'}));await expect(page.getByText('Сохранено после переподключения',{exact:true})).toBeVisible();
 await page.evaluate(()=>window.extrasView('search'));await expect(page.getByText('первый результат',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Показать ещё',exact:true}).click();await expect.poll(()=>!!releaseSearch).toBe(true);await page.getByRole('textbox',{name:'Поиск в переписке',exact:true}).fill('новый');await expect(page.locator('.chat-history-results')).toContainText('новый результат');releaseSearch();await page.waitForTimeout(120);await expect(page.getByText('УСТАРЕВШИЙ РЕЗУЛЬТАТ',{exact:true})).toHaveCount(0);await expect(page.getByText('первый результат',{exact:true})).toHaveCount(0);
 await page.evaluate(()=>window.extrasView('receipts'));await expect(page.getByText('Прочитано',{exact:true})).toBeVisible();readPrivate=true;delayPrivacy=true;await page.evaluate(id=>window.extrasEmit({conversationId:id,type:'privacy'}),id);await expect(page.getByText('Прочитано',{exact:true})).toHaveCount(0);await expect.poll(()=>!!releasePrivacy).toBe(true);releasePrivacy();await expect(page.getByText('Доставлено · прочтение скрыто',{exact:true})).toBeVisible();
 await page.evaluate(()=>window.extrasView('forward'));await page.getByRole('button',{name:'Получатель',exact:true}).click();await expect.poll(()=>!!releaseForward).toBe(true);await expect(page.getByRole('button',{name:'Закрыть',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeVisible();releaseForward();await expect(page.getByRole('dialog')).toHaveCount(0);assert.equal(calls.filter(p=>p.endsWith('/forward')).length,1);assert.deepEqual(errors,[]);console.log('PASS',engine.name(),'collections deletion/personal/reconnect + stale pagination, filter-race search, receipt privacy refresh, nondismissible in-flight forward');await context.close();
 }finally{await browser.close();}}})().catch(e=>{console.error(e);process.exit(1)});
