// Local Vite fixture + browser-native File/canvas/XHR. Backend privacy/GC has a separate real PostgreSQL test.
const { chromium, webkit, expect } = require('@playwright/test');
const assert = require('node:assert/strict'), fs = require('node:fs'), { randomUUID } = require('node:crypto');
const origin = process.env.EGIN_URL || 'http://localhost:4947';
if (!['localhost','127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Local Vite only');
fs.mkdirSync('test-results/chat-wallpaper',{recursive:true});
(async()=>{
  for(const engine of [chromium,webkit]){
    const browser=await engine.launch(engine===chromium?{args:['--no-sandbox']}:{});
    try{
      const state=[{preset:'nature',intensity:.45},{preset:'nature',intensity:.45}], uploads=[];
      let failImage=false,holdUpload=false,releaseUpload;
      async function account(index){
        const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
        await context.route('**/api/chat/**',async route=>{
          const request=route.request(),url=new URL(request.url());
          if(url.pathname.endsWith('/preferences')){
            if(request.method()==='PATCH')state[index]=request.postDataJSON().theme;
            return route.fulfill({json:{preferences:{theme:state[index],draft:'',archived:false,version:1}}});
          }
          if(url.pathname.endsWith('/attachments')){
            assert.equal(url.searchParams.get('purpose'),'wallpaper');assert.equal(url.searchParams.get('kind'),'image');
            const id=randomUUID();uploads.push({owner:index,id});
            if(holdUpload)await new Promise(resolve=>{releaseUpload=resolve;});
            return route.fulfill({json:{attachment:{id,kind:'image',mimeType:'image/webp',name:'wallpaper.webp',size:256,url:`/api/chat/attachments/${id}/file`}}}).catch(()=>{});
          }
          if(url.pathname.endsWith('/file')){
            const id=url.pathname.split('/').at(-2);
            if(failImage||!uploads.some(file=>file.owner===index&&file.id===id))return route.fulfill({status:404});
            return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1400"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#b9dbdc"/><stop offset="1" stop-color="#567c4c"/></linearGradient></defs><rect width="800" height="1400" fill="url(#g)"/><circle cx="600" cy="300" r="120" fill="#faf2ce"/></svg>'});
          }
          return route.fulfill({json:{}});
        });
        const page=await context.newPage();await page.goto(`${origin}/tests/fixtures/chat-appearance.html`);return{page,context};
      }
      const a=await account(0),b=await account(1),errors=[];a.page.on('pageerror',error=>errors.push(error.message));
      const png=Buffer.from(await a.page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=30;canvas.height=40;const c=canvas.getContext('2d');c.fillStyle='#5f8657';c.fillRect(0,0,30,40);return canvas.toDataURL('image/png').split(',')[1];}),'base64');
      const choose=()=>a.page.getByLabel('Изображение фона чата',{exact:true}).setInputFiles({name:'Природа.png',mimeType:'image/png',buffer:png});
      await a.page.getByRole('button',{name:'Оформление',exact:true}).click();
      await choose();await expect(a.page.getByRole('button',{name:'Заменить изображение',exact:true})).toBeVisible();
      await expect(a.page.locator('.chat-sheet .chat-theme-preview')).toHaveCSS('background-image',new RegExp(uploads[0].id));
      await a.page.getByRole('button',{name:'Midnight',exact:true}).click();
      await expect(a.page.locator('.chat-sheet .chat-theme-preview')).toHaveAttribute('data-chat-theme','midnight');
      await a.page.screenshot({path:`test-results/chat-wallpaper/${engine.name()}-editor.png`,fullPage:true});
      await a.page.getByRole('button',{name:'Сохранить оформление',exact:true}).click();
      assert.equal(state[0].wallpaperAttachmentId,uploads[0].id);assert.equal(state[0].preset,'midnight');assert.equal(state[1].wallpaperAttachmentId,undefined);
      await a.page.reload();await expect(a.page.getByTestId('saved-surface')).toHaveCSS('background-image',new RegExp(uploads[0].id));
      await b.page.reload();await expect(b.page.getByTestId('saved-surface')).toHaveAttribute('data-chat-theme','nature');assert(!await b.page.getByTestId('saved-surface').evaluate(el=>getComputedStyle(el).backgroundImage.includes('/attachments/')));
      failImage=true;await a.page.reload();await a.page.getByRole('button',{name:'Оформление',exact:true}).click();await expect(a.page.getByText('Изображение сейчас недоступно.',{exact:false})).toBeVisible();
      assert(await a.page.locator('.chat-sheet .chat-theme-preview').evaluate(el=>getComputedStyle(el).backgroundImage.includes('radial-gradient')),'Unavailable private image leaves a real palette fallback');
      failImage=false;await a.page.getByRole('button',{name:'Стандартная тема',exact:true}).click();await a.page.getByRole('button',{name:'Сохранить оформление',exact:true}).click();
      await a.page.reload();await expect(a.page.getByTestId('saved-surface')).toHaveAttribute('data-chat-theme','nature');assert(!state[0].wallpaperAttachmentId);
      await a.page.getByRole('button',{name:'Оформление',exact:true}).click();holdUpload=true;await choose();await expect.poll(()=>Boolean(releaseUpload)).toBe(true);
      await expect(a.page.getByRole('button',{name:'Сохранить оформление',exact:true})).toBeDisabled();
      await a.page.getByRole('button',{name:'Отменить загрузку фона',exact:true}).click();releaseUpload();holdUpload=false;
      await expect(a.page.getByRole('button',{name:'Загрузить изображение',exact:true})).toBeVisible();
      for(const width of [360,390,430]){await a.page.setViewportSize({width,height:844});assert(await a.page.locator('.chat-sheet-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1));}
      assert.deepEqual(errors,[]);await a.context.close();await b.context.close();
      console.log(`${engine.name()}: private wallpaper upload, preset contrast, save/reload, personal isolation, reset, unavailable-image fallback and cancellation PASS`);
    }finally{await browser.close();}
  }
})().catch(error=>{console.error(error);process.exit(1);});
