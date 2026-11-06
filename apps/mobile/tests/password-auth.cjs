const { chromium, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({timeout: 60000});
const assert = require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const express=require('../../api/node_modules/express');

(async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'egin-auth-ui-')),{createApp}=await import('../../api/src/server.mjs');
  const service=createApp({dataDir:dir,origins:['http://localhost:4950'],rpID:'localhost'}),web=express();
  web.use((req,res,next)=>req.path.startsWith('/api/')?service.app(req,res,next):next());web.use(express.static(path.resolve(__dirname,'../dist')));
  const server=web.listen(4950,'127.0.0.1');service.attachUpgrade(server);let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(30000);
    await page.goto('http://localhost:4950/#/auth');await page.getByRole('button',{name:'Создать профиль',exact:true}).click();
    await page.getByLabel('Ваше имя').fill('Фермер');await page.getByLabel('Email').fill('farmer@example.com');await page.getByLabel('Пароль',{exact:true}).fill('Длинная надёжная фраза 123');await page.getByLabel('Повторите пароль').fill('Длинная надёжная фраза 123');
    await page.getByRole('button',{name:'Создать профиль',exact:true}).last().click();await expect(page.getByRole('heading',{name:'Сохраните код восстановления'})).toBeVisible();
    const code=await page.locator('.recovery-card code').innerText();assert.ok(code.length>20);await page.getByRole('button',{name:'Код сохранён'}).click();await expect(page.locator('.mobile-nav')).toBeVisible({timeout:30000});await context.close();
    const second=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),p2=await second.newPage();p2.setDefaultTimeout(30000);await p2.goto('http://localhost:4950/#/auth');
    await p2.getByLabel('Email').fill('farmer@example.com');await p2.getByLabel('Пароль',{exact:true}).fill('Длинная надёжная фраза 123');await p2.getByRole('button',{name:'Войти',exact:true}).last().click();await expect(p2.locator('.mobile-nav')).toBeVisible({timeout:30000});await second.close();
    const third=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),p3=await third.newPage();p3.setDefaultTimeout(30000);await p3.goto('http://localhost:4950/#/auth');
    await p3.getByRole('button',{name:'Забыли пароль? Использовать код восстановления'}).click().catch(async e=>{console.error('Recovery screen:',await p3.locator('body').innerText());throw e;});await p3.getByLabel('Email').fill('farmer@example.com');await p3.getByLabel('Код восстановления').fill(code);await p3.getByLabel('Новый пароль').fill('Совершенно новая фраза 456');await p3.getByLabel('Повторите пароль').fill('Совершенно новая фраза 456');await p3.getByRole('button',{name:'Сменить пароль'}).click();await expect(p3.getByRole('heading',{name:'Сохраните код восстановления'})).toBeVisible({timeout:30000});
    assert.notEqual(await p3.locator('.recovery-card code').innerText(),code);
    await third.close();console.log('PASS: email registration, password login and recovery in real browser');
  }finally{await browser?.close();service.close();await new Promise(resolve=>server.close(resolve));service.db.close();rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
