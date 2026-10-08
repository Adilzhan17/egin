import {test,expect} from '@playwright/test';
test('selected field weather, tasks and notes persist; market categories open',async({page})=>{
 await page.request.post('/api/auth/login',{data:{email:'demo@egin.local',password:'EginDemo2026!'}});
 await page.goto('/');await expect(page.locator('#current-field')).toBeVisible();
 const fields=await (await page.request.get('/api/fields')).json();
 const selected=fields[1];await page.locator('#current-field').selectOption(selected.id);
 await expect(page.locator('.weather-home')).toContainText(selected.name,{timeout:90000});
 await page.reload();await expect(page.locator('#current-field')).toHaveValue(selected.id);
 await page.goto('/fields/'+selected.id);
 await page.getByRole('button',{name:'Добавить задачу',exact:true}).click();
 const title='E2E task '+Date.now();await page.getByLabel('Название задачи').fill(title);
 await page.getByLabel('Дата задачи').fill('2026-10-05');await page.locator('.task-form').getByRole('button',{name:'Добавить',exact:true}).click();
 await expect(page.locator('.task-row').filter({hasText:title})).toBeVisible();
 await page.getByLabel('Заметка поля').fill(title+' note');await page.getByRole('button',{name:'Добавить заметку',exact:true}).click();
 await expect(page.locator('.field-note').filter({hasText:title})).toBeVisible();
 await page.reload();await expect(page.locator('.task-row').filter({hasText:title})).toBeVisible();await expect(page.locator('.field-note').filter({hasText:title})).toBeVisible();
 await page.getByRole('button',{name:'Выполнить задачу: '+title,exact:true}).click();await expect(page.locator('.task-row.done').filter({hasText:title})).toBeVisible();
 for(const type of ['job','machinery_rental']){await page.goto('/market?type='+type);await expect(page.locator('.listing-card').first()).toBeVisible();}
});
test('live LLM streams real tokens through one shared SSE across navigation and executes weather tool',async({page})=>{
 test.setTimeout(300000);
 await page.request.post('/api/auth/login',{data:{email:'demo@egin.local',password:'EginDemo2026!'}});
 // Observe actual EventSource frames; no response or provider is mocked.
 await page.addInitScript(()=>{
  const original=window.EventSource;
  const observed={created:0,active:0,events:[] as {type:string;payload:Record<string,unknown>}[]};
  (window as typeof window & {assistantEvents:typeof observed}).assistantEvents=observed;
  window.EventSource=class extends original {
   private counted=true;
   constructor(url:string|URL,configuration?:EventSourceInit){
    super(url,configuration);observed.created++;observed.active++;
    this.addEventListener('message',event=>{try{observed.events.push(JSON.parse(event.data));}catch{/* Ignore heartbeat comments. */}});
   }
   close(){if(this.counted){observed.active--;this.counted=false;}super.close();}
  };
 });
 const fields=await (await page.request.get('/api/fields')).json();await page.goto('/assistant?field='+fields[0].id);
 await expect(page.getByLabel('Поле для помощника')).toHaveValue(fields[0].id);
 await expect(page.getByRole('button',{name:'Отправить вопрос',exact:true})).toBeVisible({timeout:90000});
 await page.getByLabel('Вопрос помощнику').fill('Какая погода сегодня на выбранном поле? Ответь по-русски кратко, укажи температуру, ветер и осадки.');
 const request=page.waitForResponse(r=>r.url().endsWith('/api/assistant/messages')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Отправить вопрос',exact:true}).click();const response=await request;
 expect(response.status()).toBe(202);const job=await response.json();
 await expect(page.getByRole('button',{name:'Остановить ответ',exact:true})).toBeVisible();
 await expect.poll(async()=>page.evaluate(id=>(window as typeof window & {assistantEvents:{events:{type:string;payload:Record<string,unknown>}[]}}).assistantEvents.events.some(e=>e.type==='assistant.started'&&e.payload.job_id===id&&e.payload.status==='running'),job.id),{timeout:60000}).toBeTruthy();
 const running=await (await page.request.get('/api/assistant/messages/'+job.id)).json();
 expect(running.status).toBe('running');
 // Client-side route changes must neither cancel the job nor create another SSE.
 await page.locator('.sidebar a[href="/market"]').click();await expect(page).toHaveURL(/\/market$/);
 await expect(page.locator('.listing-card').first()).toBeVisible();
 await page.locator('.sidebar a[href="/assistant"]').click();await expect(page).toHaveURL(/\/assistant$/);
 await expect(page.locator('.assistant-thread')).toContainText('Какая погода сегодня на выбранном поле?');
 await expect.poll(async()=>page.evaluate(id=>(window as typeof window & {assistantEvents:{events:{type:string;payload:Record<string,unknown>}[]}}).assistantEvents.events.some(e=>e.type==='assistant.completed'&&e.payload.job_id===id),job.id),{timeout:180000}).toBeTruthy();
 const observed=await page.evaluate(()=>(window as typeof window & {assistantEvents:{created:number;active:number;events:{type:string;payload:Record<string,unknown>}[]}}).assistantEvents);
 expect(observed.created).toBe(1);expect(observed.active).toBe(1);
 const events=observed.events.filter(e=>e.payload.job_id===job.id);
 expect(events.some(e=>e.type==='assistant.token'&&String(e.payload.text||'').length>0)).toBeTruthy();
 const tool=events.find(e=>e.type==='assistant.tool'&&e.payload.name==='get_field_weather'&&e.payload.status==='completed'&&['model','policy'].includes(String(e.payload.origin)));
 expect(tool).toBeTruthy();
 const weather=tool!.payload.result as {source:string;current:{temperature_2m:number}};
 expect(weather.source).toContain('Open-Meteo');expect(typeof weather.current.temperature_2m).toBe('number');
 const done=events.find(e=>e.type==='assistant.completed')!;
 expect(done.payload.status).toBe('completed');const answer=String(done.payload.text);expect(answer.length).toBeGreaterThan(15);
 await expect(page.locator('.assistant-thread')).toContainText(answer);
 await page.reload();await expect(page.locator('.assistant-thread')).toContainText(answer);
});
