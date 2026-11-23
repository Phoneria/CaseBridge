const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.argv[2] || 'http://127.0.0.1:3198';
(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({viewport:{width,height:900}});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/#product');
      await page.locator('.lease-node').first().waitFor();
      assert.equal(await page.locator('[data-capability-explorer],a[href*="ornek-dava"]').count(),0);
      const node = title => page.locator('.lease-node').filter({has:page.getByText(title,{exact:true})});
      await node('Belgeler doğrulandığında talebin daha güçlü desteklenmesi').click();
      assert.equal(await page.locator('#lease-path').innerText(),'Başlangıçtan ulaşma %32,68');
      await page.locator('#lease-choice').selectOption('-1');
      assert.match(await page.locator('#lease-score').innerText(),/38\/100/);
      await page.locator('#lease-choice').selectOption('0');
      assert.match(await page.locator('#lease-score').innerText(),/50\/100/);
      await node('Koşullar doğrulanırsa').click();
      assert.match(await page.locator('#lease-path').innerText(),/%10,09/);
      const initialScale=await page.locator('#lease-scale').innerText();
      await page.locator('#lease-plus').click();
      assert.notEqual(await page.locator('#lease-scale').innerText(),initialScale);
      await page.locator('#lease-minus').click();
      assert.equal(await page.locator('#lease-scale').innerText(),initialScale);
      await page.locator('#lease-expand').click();
      assert.equal(await page.locator('.lease-node').count(),46);
      await node('Müvekkilin talebi reddedildi').focus();await page.keyboard.press('Enter');
      assert.equal(await page.locator('#lease-path').innerText(),'Dosyada kayıtlı');
      for(const label of ['Dosya kaydı · iç not','Delil ve evrak kontrol listesi']) {
        const doc=page.locator('.lease-panel details').filter({has:page.getByText(label,{exact:true})});
        await doc.locator('summary').click();assert.equal(await doc.getAttribute('open'),'');
      }
      await page.locator('#lease-expand').click();
      assert.equal(await page.locator('.lease-node').count(),6);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.deepEqual(errors,[]);
      await page.locator('#product').scrollIntoViewIfNeeded();
      await page.locator('#product').screenshot({path:'/tmp/kira-'+width+'.png'});
      await page.close();console.log(width,'passed');
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
