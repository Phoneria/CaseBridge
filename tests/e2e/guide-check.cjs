const {chromium,expect}=require('@playwright/test');
const fs=require('fs');
const out=process.env.GUIDE_OUTPUT||'/tmp/casebridge-guide-browser';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true});const results=[];
 const base={id:'synthetic',email:'guide@example.test',full_name:'Örnek Yönetici',department:null,gender:null,role:'admin',law_firm_id:'synthetic',is_active:true};
 const variants=[['admin',base,'/buro?tab=deadline','bureau-deadline'],['lawyer',{...base,role:'lawyer'},'/ai/olasilik','ai-scenarios'],['client',{...base,workspace_position:'client'},'/calisma-alanim','workspace'],['accountant',{...base,workspace_position:'accountant'},'/calisma-alanim','workspace'],['platform',{...base,is_platform_admin:true},'/platform','platform']];
 for(const [role,me,path,selected] of variants) for(const width of [1440,390,320]) for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:width===1440?900:568}});
  await context.addInitScript(({theme})=>{localStorage.setItem('casebridge_token','synthetic-guide-session');localStorage.setItem('casebridge-theme',theme);},{theme});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));let calls=0,writes=0;
  await context.route(/https?:\/\/(localhost|127\.0\.0\.1):8000\//,async route=>{
   calls++;if(route.request().method()!=='GET')writes++;
   const p=new URL(route.request().url()).pathname;
   const data=p==='/users/me'?me:p==='/bureau/overview'?{today:'2026-11-22',active_cases:0,pending_tasks:0,overdue_tasks:0,unassigned_cases:0,pending_approvals:0,upcoming_hearings:0,alerts:[],capacity:[],finance:[]}:p==='/bureau/workspace'?{position:me.workspace_position||'lawyer',cases:[],documents:[],publications:[],records:[],tasks:[],finance:[]}:p==='/ai/status'?{configured:false}:[];
   await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(data)});
  });
  await page.goto('http://localhost:3015'+path);const trigger=page.getByRole('button',{name:'Rehber',exact:true});await expect(trigger).toBeVisible();await expect(page.locator('header').getByRole('button',{name:/CaseBridge AI/})).toHaveCount(0);
  await page.waitForTimeout(300);
  const rect=await trigger.boundingBox();if(!rect||rect.x+rect.width>width||rect.y+rect.height>250)throw Error('Header guide geometry');
  if(role==='admin')await page.screenshot({path:`${out}/header-${width}-${theme}.png`});
  const before=calls, url=page.url(); const storage=await page.evaluate(()=>JSON.stringify({...localStorage}));
  await trigger.click();const dialog=page.getByRole('dialog',{name:'CaseBridge Rehber'});await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox')).toHaveValue(selected);
  const options=await dialog.locator('option').evaluateAll(o=>o.map(x=>({value:x.value,text:x.textContent})));
  if(['client','accountant','platform'].includes(role)&&options.some(o=>o.value.startsWith('bureau-')||o.value.startsWith('ai-')))throw Error('Role leak');
  if(role==='lawyer'&&options.some(o=>o.value.startsWith('bureau-')||o.value==='admin'))throw Error('Lawyer leak');
  await expect(dialog.getByRole('button',{name:'Çıkış'})).toBeFocused();
  await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'Sonraki'})).toBeFocused();
  await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Çıkış'})).toBeFocused();
  await dialog.getByRole('button',{name:'Sonraki'}).click();
  await expect(dialog.getByRole('status')).toContainText('Adım 2');
  await dialog.getByRole('button',{name:'Önceki'}).click();
  await expect(dialog.getByRole('status')).toContainText('Adım 1');
  if(role==='admin'){
   for(const value of ['bureau-team','bureau-approval','bureau-publication']){
    await dialog.getByRole('combobox').selectOption(value);
    for(let i=0;i<3;i++)await dialog.getByRole('button',{name:'Sonraki'}).click();
    await expect(dialog.getByRole('button',{name:'Rehberi bitir'})).toBeVisible();
    await dialog.getByRole('button',{name:'Baştan başla'}).click();
   }
  }
  const overflow=await dialog.evaluate(e=>({inner:e.scrollWidth>e.clientWidth+1,document:document.documentElement.scrollWidth>innerWidth}));
  if(overflow.inner||overflow.document)throw Error('Overflow '+JSON.stringify(overflow));
  if(role==='admin'){await dialog.evaluate(e=>e.scrollTop=0);await page.screenshot({path:`${out}/guide-${width}-${theme}.png`});}
  await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
  if(page.url()!==url||calls!==before||writes!==0)throw Error(`Guide side effects ${calls-before}/${writes}`);
  if(await page.evaluate(()=>JSON.stringify({...localStorage}))!==storage)throw Error('Storage changed');
  if(errors.length)throw Error(errors.join('\n'));
  results.push({role,width,theme,selected,topics:options.length,guideRequests:calls-before,writes,errors,overflow});
  await context.close();
 }
 await browser.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length,output:out}));
})().catch(e=>{console.error(e);process.exit(1)});
