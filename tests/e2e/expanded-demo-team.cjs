// Start the disposable backend per setup/quickstart and the production frontend on :3016.
const {chromium,expect}=require('@playwright/test');
const fs=require('fs');
const root='/tmp/casebridge-expanded-team-browser';
const session=JSON.parse(fs.readFileSync(`${root}/session.json`));
(async()=>{
 const healthy=await fetch('http://127.0.0.1:8025/health').then(r=>r.ok).catch(()=>false);
 if(!healthy)throw Error('Start the disposable backend and wait for its health check before browser validation');
 const browser=await chromium.launch({headless:true});const results=[];
 for(const width of [1440,390,320])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addInitScript(({token,theme})=>{localStorage.setItem('casebridge_token',token);localStorage.setItem('casebridge-theme',theme);},{token:session.token,theme});
  let requests=0, removals=0;const errors=[];
  await context.route(/http:\/\/localhost:8000\//,async route=>{
   const url=new URL(route.request().url());requests++;if(url.pathname==='/admin/demo-template/remove')removals++;
   try {
    const response=await route.fetch({url:`http://127.0.0.1:8025${url.pathname}${url.search}`});
    await route.fulfill({response});
   } catch {errors.push('Disposable backend unavailable');await route.abort();}
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://localhost:3016/ayarlar');
  await expect(page.getByText(/dört avukat, aktif işler/)).toBeVisible();
  await page.getByRole('button',{name:'Gösterim verilerini yükle'}).click();
  await expect(page.getByRole('heading',{name:'Büroda gösterime hazır veriler'})).toBeVisible({timeout:30000});
  await page.goto('http://localhost:3016/admin');
  await expect(page.getByRole('heading',{name:'Dava Sorumluları'})).toBeVisible();
  const plot=page.getByLabel('Avukat iş yükü bar grafiği');
  const ticks=plot.locator('.recharts-yAxis .recharts-cartesian-axis-tick');
  await expect(ticks).toHaveCount(5);
  const names=await ticks.allTextContents();
  if(names.some(n=>n.startsWith('ÖRNEK · ')))throw Error('Legacy roster label');
  const real=page.getByRole('combobox',{name:'Şablon dışı sentetik dosya sorumlu avukatı'});
  await expect(real.locator('option')).toHaveCount(1);
  const sample=page.getByRole('combobox',{name:'Depozito İadesi Davası sorumlu avukatı',exact:true});
  await expect(sample.locator('option')).toHaveCount(5);
  const before=await sample.inputValue();const choices=await sample.locator('option').evaluateAll(x=>x.map(o=>o.value));
  const target=choices.find(id=>id!==before);await sample.selectOption(target);await expect(sample).toHaveValue(target);
  await page.waitForTimeout(200);
  const alerts=(await page.locator('[role="alert"]').allTextContents()).filter(t=>t.trim());if(alerts.length)throw Error('Assignment alert: '+alerts.join(' '));
  await plot.scrollIntoViewIfNeeded();
  await page.screenshot({path:`${root}/admin-${width}-${theme}.png`});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow||errors.length)throw Error(JSON.stringify({overflow,errors}));
  const board=page.getByRole('heading',{name:'Atama Panosu'}).locator('..').locator('..').locator('..');
  const scroller=board.locator('.overflow-x-auto');
  await scroller.evaluate(e=>e.scrollLeft=e.scrollWidth);
  if(await scroller.evaluate(e=>e.scrollLeft)<=0)throw Error('Assignment board not scrollable');
  await page.goto('http://localhost:3016/ayarlar');await page.getByRole('button',{name:'Gösterim verilerini yükle'}).click();
  await expect(page.getByRole('heading',{name:'Büroda gösterime hazır veriler'})).toBeVisible();
  await page.goto('http://localhost:3016/admin');await expect(page.getByLabel('Avukat iş yükü bar grafiği').locator('.recharts-yAxis .recharts-cartesian-axis-tick')).toHaveCount(5);

  await page.goto('http://localhost:3016/ayarlar');
  const removeTrigger=page.getByRole('button',{name:'Gösterim verilerini kaldır',exact:true});await removeTrigger.click();
  const modal=page.getByRole('dialog',{name:'Gösterim verilerini kaldır'});await expect(modal).toContainText('sonradan eklediğiniz');
  await expect(modal.getByRole('button',{name:'Vazgeç'})).toBeFocused();
  await page.keyboard.press('Escape');await expect(removeTrigger).toBeFocused();
  if(removals!==0)throw Error('Cancellation removed data');
  await removeTrigger.click();await expect(modal).toBeVisible();
  await modal.evaluate(e=>e.scrollTop=0);await page.screenshot({path:`${root}/removal-${width}-${theme}.png`});
  await modal.getByRole('button',{name:'Onayla ve verileri kaldır'}).click();
  await expect(page.getByText(/gösterim kaydı kaldırıldı/)).toBeVisible();
  if(removals!==1)throw Error('Removal request count');
  await page.goto('http://localhost:3016/admin');
  await expect(page.getByLabel('Avukat iş yükü bar grafiği').locator('.recharts-yAxis .recharts-cartesian-axis-tick')).toHaveCount(1);
  await expect(page.getByRole('combobox',{name:'Şablon dışı sentetik dosya sorumlu avukatı'})).toBeVisible();
  await page.goto('http://localhost:3016/ayarlar');await page.getByRole('button',{name:'Gösterim verilerini kaldır',exact:true}).click();
  await expect(page.getByRole('button',{name:'Onayla ve verileri kaldır'})).toBeDisabled();await page.getByRole('button',{name:'Vazgeç'}).click();
  await page.getByRole('button',{name:'Gösterim verilerini yükle'}).click();await expect(page.getByRole('heading',{name:'Büroda gösterime hazır veriler'})).toBeVisible();
  await page.goto('http://localhost:3016/admin');await expect(page.getByLabel('Avukat iş yükü bar grafiği').locator('.recharts-yAxis .recharts-cartesian-axis-tick')).toHaveCount(5);
  if(errors.length)throw Error(errors.join(' '));
  results.push({width,theme,sampleLawyers:4,chartNames:names,realOptions:1,sampleOptions:5,removalRequests:removals,removedAndReloaded:true,requests,pageErrors:errors,overflow});await context.close();
 }
 await browser.close();fs.writeFileSync(`${root}/removal-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length,output:root}));
})().catch(e=>{console.error(e);process.exit(1)});
