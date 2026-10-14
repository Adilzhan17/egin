// Retained tab DOM and privacy lifetime only; server exchange is covered separately.
const {chromium,webkit,expect}=require('@playwright/test'),assert=require('node:assert/strict');
const origin=process.env.EGIN_URL||'http://localhost:4947';if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Local fixture only');
const msg=(id,file)=>({id,sequence:Number(id.slice(1)),sender:{id:'peer',name:'Азамат'},createdAt:'2026-10-14T10:00:00Z',kind:file.kind,text:'',attachments:[file]});
const photo={id:'p1',kind:'image',url:'/motion-image.svg',name:'Приватное фото.jpg',mimeType:'image/jpeg',size:20};
const doc={id:'d1',kind:'document',url:'/private-report',name:'Приватный отчёт.pdf',mimeType:'application/pdf',size:320};
(async()=>{for(const engine of[chromium,webkit])for(const reduced of[false,true]){const browser=await engine.launch(engine===chromium?{args:['--no-sandbox']}:{});try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:reduced?'reduce':'no-preference'});
 await context.routeWebSocket('**',socket=>{const server=socket.connectToServer();server.onMessage(message=>{try{if(['update','full-reload'].includes(JSON.parse(String(message)).type))return;}catch{}socket.send(message);});});
 await context.addInitScript(()=>{const streams=[];window.EventSource=class extends EventTarget{constructor(){super();streams.push(this);}close(){}};window.materialEvent=data=>streams.forEach(s=>s.dispatchEvent(new MessageEvent('change',{data:JSON.stringify(data)})));});
 let deletedPhoto=false,deletedDoc=false,docId='m9',denied=false,releaseDoc,releasePage,holdDoc=true;
 await context.route('**/motion-image.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#bed8be"/></svg>'}));
 await context.route('**/api/chat/**',async r=>{const u=new URL(r.request().url()),tab=u.searchParams.get('type'),before=u.searchParams.get('before');if(denied)return r.fulfill({status:403,json:{error:'Доступ закрыт'}});
  if(tab==='documents'&&before){await new Promise(resolve=>releasePage=resolve);return r.fulfill({json:{items:[msg('m9',doc),msg('m5',{...doc,id:'stale',name:'Устаревшая страница.pdf'})],hasMore:false}});}
  const items=tab==='media'&&!deletedPhoto?[msg('m10',photo)]:tab==='documents'&&!deletedDoc?[msg(docId,doc)]:[];
  if(tab==='documents'&&holdDoc){holdDoc=false;await new Promise(resolve=>releaseDoc=resolve);}
  return r.fulfill({json:{items,hasMore:tab==='documents'&&items.length>0,nextCursor:'9'}});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const emit=data=>page.evaluate(data=>window.materialEvent({...data,conversationId:'test-conversation'}),data);
 await page.goto(origin+'/tests/fixtures/chat-materials.html');await page.getByRole('button',{name:'Материалы',exact:true}).click();await expect(page.getByRole('tabpanel',{name:'Медиа'}).getByRole('button',{name:'Фото: Приватное фото.jpg'})).toBeVisible();await page.waitForTimeout(320);
 // A normal tab exit retains real DOM briefly, marked inert/hidden. Deletion overrides that lifetime.
 await page.getByRole('tab',{name:'Документы',exact:true}).click();await expect.poll(()=>!!releaseDoc).toBe(true);
 if(!reduced){await expect(page.locator('.chat-material-panel-motion[data-motion-phase=exit]')).toHaveCount(1);await expect(page.locator('.chat-material-panel-motion[data-motion-phase=exit]')).toHaveAttribute('inert','');}
 deletedPhoto=true;await emit({type:'message.deleted',messageId:'m10'});await expect(page.locator('img[alt="Приватное фото.jpg"]')).toHaveCount(0);releaseDoc();await expect(page.getByRole('tabpanel',{name:'Документы'}).getByText(doc.name)).toBeVisible();
 await page.getByRole('button',{name:'Загрузить ещё',exact:true}).click();await expect.poll(()=>!!releasePage).toBe(true);deletedDoc=true;await emit({type:'message.deleted',messageId:'m9'});await expect(page.getByText(doc.name,{exact:true})).toHaveCount(0);releasePage();await page.waitForTimeout(450);await expect(page.getByText('Устаревшая страница.pdf',{exact:true})).toHaveCount(0);await expect(page.getByText(doc.name,{exact:true})).toHaveCount(0);
 docId='m11';deletedDoc=false;await emit({type:'ready'});await expect(page.getByText(doc.name,{exact:true})).toBeVisible();await page.waitForTimeout(320);
 await page.getByRole('tab',{name:'Ссылки',exact:true}).click();denied=true;await emit({type:'revoked'});await expect(page.getByText(doc.name,{exact:true})).toHaveCount(0);await expect(page.getByText('Доступ к материалам беседы закрыт.',{exact:true})).toBeVisible();
 assert.equal(await page.locator('.chat-materials').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);assert.deepEqual(errors,[]);console.log(engine.name()+' '+(reduced?'reduced':'full')+': tab exit lifetime, immediate private DOM removal, stale pagination rejection, revoke and mobile layout PASS');
}finally{await browser.close();}}})().catch(e=>{console.error(e);process.exitCode=1;});
