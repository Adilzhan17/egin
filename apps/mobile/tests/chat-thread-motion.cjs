// Isolated DOM/motion fixture, no synthetic behavior is shipped to users.
const {chromium,webkit,expect}=require('@playwright/test');
const assert=require('node:assert/strict');
const origin=process.env.EGIN_URL||'http://localhost:4947';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Local fixture only');
const id='10000000-0000-4000-8000-000000000001';
const make=(n,text='Сообщение '+n,sender='bob')=>({id:`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`,clientId:`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`,conversationId:id,sender:{id:sender,name:sender==='alice'?'Алия':'Данияр'},sequence:n,kind:'text',text,attachments:[],replyTo:null,listing:null,location:null,createdAt:'2026-10-14T10:00:00Z',editedAt:null,deletedAt:null,readByCount:0,receipt:{recipientCount:1,deliveredCount:0,readCount:0,version:1}});
(async()=>{for(const engine of(process.env.WEBKIT_ONLY?[webkit]:[chromium,webkit]))for(const reduce of(process.env.WEBKIT_ONLY?[false]:[false,true])){
 const browser=await engine.launch(engine===chromium?{args:['--no-sandbox']}:{});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:reduce?'reduce':'no-preference'});
  await context.routeWebSocket('**',socket=>{const server=socket.connectToServer();server.onMessage(message=>{try{if(['update','full-reload'].includes(JSON.parse(String(message)).type))return;}catch{}socket.send(message);});});
  await context.addInitScript(()=>{
   const viewport=new EventTarget();Object.assign(viewport,{height:844,width:390,offsetTop:0,offsetLeft:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
   window.fixtureViewport=(height,offsetTop=0,scale=1)=>{Object.assign(viewport,{height,offsetTop,scale});viewport.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('scroll'));};
   class Source extends EventTarget{constructor(){super();window.chatEvent=data=>this.dispatchEvent(new MessageEvent('change',{data:JSON.stringify(data)}));setTimeout(()=>this.dispatchEvent(new Event('ready')),50);}close(){}}
   window.EventSource=Source;
   window.rowAnimations=[];const original=Element.prototype.animate;
   Element.prototype.animate=function(frames,options){if(this.dataset.motionKey)window.rowAnimations.push({key:this.dataset.motionKey,frames});return original.call(this,frames,options);};
  });
  let rows=Array.from({length:35},(_,i)=>make(i+1));let revoked=false;const reads=[];
  const conversation={id,kind:'direct',title:'Данияр',peer:{id:'bob',name:'Данияр'},canWrite:true,role:'member',lastReadSequence:35,group:null,listing:null,theme:{preset:'nature'},lastMessage:null};
  await context.route('**/api/chat/**',async route=>{
   const url=new URL(route.request().url()),pathname=url.pathname;
   if(pathname.endsWith('/presence'))return route.fulfill({json:{items:[{user:conversation.peer,visible:true,online:true,lastSeen:null,onlineUntil:new Date(Date.now()+40000).toISOString()}]}});
   if(pathname.endsWith('/preferences'))return route.fulfill({json:{preferences:{draft:'',version:0}}});
   if(pathname.endsWith('/read')){reads.push(route.request().postDataJSON().sequence);return route.fulfill({json:{}});}
   if(pathname.endsWith('/receipts'))return route.fulfill({json:{items:[]}});
   if(pathname.endsWith('/blocks'))return route.fulfill({json:{items:[]}});
   if(revoked)return route.fulfill({status:403,json:{error:'Нет доступа'}});
   if(pathname.endsWith('/messages')){
    const after=Number(url.searchParams.get('after')||0),check=url.searchParams.get('reconcile')?.split(',')||[];
    return route.fulfill({json:{items:rows.filter(m=>m.sequence>after),hasMore:false,deletedIds:check.filter(key=>rows.find(m=>m.id===key)?.deletedAt)}});
   }
   return route.fulfill({json:{conversation}});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const emit=data=>page.evaluate(data=>window.chatEvent(data),data);
  await page.goto(origin+'/tests/fixtures/chat-thread-motion.html');await expect(page.locator('[data-message-id]')).toHaveCount(35);await page.waitForTimeout(400);
  assert.equal((await page.evaluate(()=>window.rowAnimations)).length,0,'Initial history does not animate');
  for(const width of[360,390,430]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await page.setViewportSize({width:390,height:844});
  const draft=make(36,'Оптимистическое сообщение','alice');draft.id='local-'+draft.clientId;draft.sequence=0;
  await page.evaluate(message=>window.threadFixture.queue(message),draft);const pending=page.locator('[data-outbox-state="sending"]');await expect(pending).toBeVisible();
  await pending.evaluate(node=>{window.pendingRow=node;window.pendingBubble=node.querySelector('.chat-message-bubble');});
  const acknowledged={...draft,id:make(36).id,sequence:36};rows.push(acknowledged);
  await page.evaluate(message=>window.threadFixture.ack(message),acknowledged);await expect(page.locator(`[data-message-id="${acknowledged.id}"]`)).toBeVisible();
  assert.equal(await page.evaluate(()=>document.querySelector('[data-message-id="20000000-0000-4000-8000-000000000036"]')===window.pendingRow),true,'ACK preserves row node');
  assert.equal(await page.evaluate(()=>window.pendingRow.querySelector('.chat-message-bubble')===window.pendingBubble),true,'ACK preserves media/bubble subtree');
  const entries=await page.evaluate(()=>window.rowAnimations.filter(a=>a.key.includes('000000000036')));assert.equal(entries.length,reduce?0:1,'ACK never repeats entry');
  await page.waitForTimeout(350);
  // A reader midway through history retains the same visual anchor on receive/edit/delete.
  await page.locator('.chat-history').evaluate(node=>{node.scrollTop=560;node.dispatchEvent(new Event('scroll',{bubbles:true}));});
  const anchor=await page.locator('.chat-history').evaluate(node=>{const top=node.getBoundingClientRect().top;const row=[...node.querySelectorAll('[data-message-id]')].find(row=>row.getBoundingClientRect().bottom>top+1);return{id:row.dataset.messageId,offset:row.getBoundingClientRect().top-top};});
  const offset=()=>page.locator(`[data-message-id="${anchor.id}"]`).evaluate(node=>node.getBoundingClientRect().top-document.querySelector('.chat-history').getBoundingClientRect().top);
  rows.push(make(37,'Новое входящее'));await emit({type:'messages',conversationId:id});await expect(page.locator('[data-message-id]')).toHaveCount(37);await page.waitForTimeout(350);assert.ok(Math.abs(await offset()-anchor.offset)<3,'New message preserves reader anchor');await expect(page.getByRole('button',{name:'К новым сообщениям ↓'})).toBeVisible();
  rows[2]={...rows[2],text:'Редактирование с увеличением высоты. '.repeat(15),editedAt:new Date().toISOString()};await emit({type:'edited',conversationId:id,messageId:rows[2].id});await expect(page.locator(`[data-message-id="${rows[2].id}"]`)).toContainText('Редактирование');await page.waitForTimeout(400);assert.ok(Math.abs(await offset()-anchor.offset)<3,'Edit height preserves reader anchor');
  const removed=rows[2];rows[2]={...removed,text:'',deletedAt:new Date().toISOString(),attachments:[]};await emit({type:'message.deleted',conversationId:id,messageId:removed.id,deletedAt:rows[2].deletedAt});await expect(page.getByText(/Редактирование с увеличением высоты/)).toHaveCount(0);
  if(!reduce)await expect(page.locator('.chat-message-collapse')).toHaveCount(1);await page.waitForTimeout(350);assert.ok(Math.abs(await offset()-anchor.offset)<3,'Gap collapse preserves reader anchor: '+JSON.stringify({anchor,actual:await offset(),scroll:await page.locator('.chat-history').evaluate(n=>n.scrollTop)}));await expect(page.locator('.chat-message-collapse')).toHaveCount(0);
  // Simulate the OS keyboard's intermediate frames: layout follows each viewport
  // update directly, without a second CSS ease and without moving an old reader.
  const composerBefore=await page.locator('.chat-composer').boundingBox();
  for(const height of[680,590,500,470]){
   await page.evaluate(height=>window.fixtureViewport(height),height);
   await page.waitForFunction(expected=>document.querySelector('.chat-thread').style.getPropertyValue('--chat-keyboard-inset')===expected+'px',844-height);
   await expect.poll(async()=>{const box=await page.locator('.chat-composer').boundingBox();return Math.abs(box.y+box.height-height);}).toBeLessThan(2);
   assert.ok(Math.abs((await page.locator('.chat-composer').boundingBox()).height-composerBefore.height)<2,'Keyboard does not resize composer content');
   assert.ok(Math.abs(await offset()-anchor.offset)<3,'Keyboard keeps reader anchored');
  }
  assert.equal(await page.locator('.chat-thread').evaluate(node=>getComputedStyle(node).transitionDuration),'0s','No lagging second keyboard easing');
  assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--chat-keyboard-inset')),'','Viewport metrics are scoped to Chat');
  await page.evaluate(()=>window.fixtureViewport(420,0,1.5));await page.waitForFunction(()=>document.querySelector('.chat-thread').style.getPropertyValue('--chat-keyboard-inset')==='0px');
  await page.evaluate(()=>window.fixtureViewport(844));
  // Reconcile replaces statuses, not bubbles; typing does not resize the header.
  const header=await page.locator('.chat-thread-header').boundingBox();await emit({type:'activity',conversationId:id,user:{id:'bob',name:'Данияр'},state:'typing',expiresAt:Date.now()+5000});await expect(page.locator('.chat-thread-subtitle')).toContainText('Печатает');assert.equal((await page.locator('.chat-thread-header').boundingBox()).height,header.height);await emit({type:'disconnected'});await expect(page.locator('.chat-thread-subtitle')).not.toContainText('Печатает');
  // Deleted content must vanish even when a retained context menu is closing.
  await page.getByRole('button',{name:'К новым сообщениям ↓'}).click();await page.waitForTimeout(450);
  const secret=make(38,'Приватный текст для удаления','alice');rows.push(secret);await emit({type:'messages',conversationId:id});const secretRow=page.locator(`[data-message-id="${secret.id}"]`);await expect(secretRow).toBeVisible();await secretRow.locator('.chat-message-actions').click();await expect(page.getByRole('dialog')).toBeVisible();
  rows[rows.length-1]={...secret,text:'',deletedAt:new Date().toISOString()};await emit({type:'message.deleted',conversationId:id,messageId:secret.id,deletedAt:rows.at(-1).deletedAt});await expect(page.getByText(secret.text,{exact:true})).toHaveCount(0);await expect(page.locator('.chat-sheet')).toHaveCount(0);
  await page.waitForTimeout(400);const beforeReads=reads.length;await page.evaluate(()=>window.threadFixture.close());await page.waitForTimeout(50);revoked=true;await emit({type:'revoked',conversationId:id});await expect(page.locator('[data-message-id]')).toHaveCount(0);await page.waitForTimeout(450);assert.equal(reads.length,beforeReads,'Exiting thread sends no reads');
  assert.deepEqual(errors,[]);console.log(engine.name()+' '+(reduce?'reduced':'full')+': ACK identity, one-time entry, scroll anchoring, delete privacy, typing, keyboard frames/anchor/composer, exit receipts, 3 mobile widths PASS');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
