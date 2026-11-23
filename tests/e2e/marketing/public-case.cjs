const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const base=process.argv[2]||'http://127.0.0.1:3197';
 const browser=await chromium.launch();
 for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:900}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('.hero-actions [href="ornek-dava.html"]').click();
  await page.locator("#totals b").first().waitFor();
  const totals=()=>page.locator('#totals b').allTextContents();
  assert.deepEqual(await totals(),['%46','%28','%26']);
  const nodes=page.locator('#tree [role=button]');
  const old=await nodes.nth(1).getAttribute('transform');await page.locator('#rotate').click();assert.notEqual(await nodes.nth(1).getAttribute('transform'),old);
  await nodes.nth(2).focus();await page.keyboard.press('Enter');assert.match(await page.locator('#detail-title').innerText(),/doğrulanamazsa/);
  await page.locator('#doc-link').click();assert.equal(await page.locator('#itiraz').getAttribute('open'),'');
  await page.locator('#chance').focus();await page.keyboard.press('Home');assert.deepEqual(await totals(),['%10','%40','%50']);
  await page.locator('#full').focus();await page.keyboard.press('End');assert.deepEqual(await totals(),['%100','%0','%0']);
  await page.locator('#reset').click();assert.deepEqual(await totals(),['%46','%28','%26']);
  for(const i of [0,1,2,3,4,5]){await nodes.nth(i).click();await page.locator('#doc-link').click();assert.equal(await page.locator(await page.locator('#doc-link').getAttribute('href')).getAttribute('open'),'');}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  await page.locator('#reset').click();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/tmp/cb-reader-'+width+'.png'});
  console.log(width,'passed');await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
