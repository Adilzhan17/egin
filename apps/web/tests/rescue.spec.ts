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
test('live LLM streams real tokens and executes weather tool',async({page})=>{
 test.setTimeout(180000);
 await page.request.post('/api/auth/login',{data:{email:'demo@egin.local',password:'EginDemo2026!'}});
 const fields=await (await page.request.get('/api/fields')).json();await page.goto('/assistant?field='+fields[0].id);
 // Observe the real browser stream: Chromium does not retain SSE bodies for response.text().
 await page.evaluate(()=>{
  const original=window.fetch.bind(window);
  const observed=window as typeof window & {assistantStream?:Promise<string>};
  window.fetch=async(...args)=>{
   const response=await original(...args);
   if(String(args[0]).endsWith('/api/assistant/stream'))observed.assistantStream=response.clone().text();
   return response;
  };
 });
 await page.getByLabel('Вопрос помощнику').fill('Вызови get_field_weather для выбранного поля. Какая погода сегодня? Ответь по-русски кратко.');
 const request=page.waitForResponse(r=>r.url().endsWith('/api/assistant/stream'));
 await page.getByRole('button',{name:'Отправить вопрос',exact:true}).click();const response=await request;
 await expect(page.getByRole('button',{name:'Остановить ответ',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Остановить ответ',exact:true})).toHaveCount(0,{timeout:150000});
 expect(response.ok()).toBeTruthy();const text=await page.evaluate(async()=>await (window as typeof window & {assistantStream:Promise<string>}).assistantStream);
 expect(text).toContain('"type": "token"');expect(text).toContain('"type": "done"');
 const events=text.split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));
 expect(events.some(e=>e.type==='tool'&&e.origin==='model'&&e.name==='get_field_weather')).toBeTruthy();
 const done=events.find(e=>e.type==='done');expect(done.text.length).toBeGreaterThan(15);
 await page.reload();await expect(page.locator('.assistant-thread')).toContainText(done.text);
});
