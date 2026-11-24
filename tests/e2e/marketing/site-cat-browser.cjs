// Browser acceptance for the marketing "site cat".
// Usage: serve web-page/ (python3 -m http.server 8091 --bind 127.0.0.1 in web-page/), then
//   node tests/e2e/marketing/site-cat-browser.cjs [base] [screenshot-dir] [real-api-url]
// The chat API is faked with page.route unless a real API URL is given for one extra check.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const base = process.argv[2] || 'http://127.0.0.1:8091';
const shots = process.argv[3] || path.resolve(__dirname, '../../../artifacts/site-cat');
const realApi = process.argv[4] || '';
const FAKE_API = 'http://127.0.0.1:9/public/site-chat';

(async () => {
  const browser = await chromium.launch();
  try {
    // ---------- desktop ----------
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const calls = [];
    let reply = { status: 200, body: { answer: 'CaseBridge, hukuk büroları için bir yapay zekâ çalışma alanıdır.', kind: 'answer', lang: 'tr', knowledge_version: 'test' } };
    let gate = null;
    await page.route('**/public/site-chat', async route => {
      calls.push(JSON.parse(route.request().postData() || '{}'));
      if (gate) await gate;
      if (reply === 'abort') return route.abort();
      await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body), headers: { 'access-control-allow-origin': '*' } });
    });
    await page.goto(`${base}/?site-cat-api=${encodeURIComponent(FAKE_API)}`);
    const cat = page.locator('.sc-cat');
    await cat.waitFor({ timeout: 15000 });
    const root = page.locator('.sc-root');
    assert.equal(await root.getAttribute('data-pose'), 'idle');
    assert.equal(await root.getAttribute('data-side'), 'right');
    // Crossfade: two stacked pose images, one in front.
    assert.equal(await page.locator('.sc-cat .sc-pose').count(), 2);
    assert.equal(await page.locator('.sc-cat .sc-pose.sc-front').count(), 1);
    // The section in view drives the pose.
    for (const [id, pose] of [['gecmis', 'researching'], ['anonim', 'working'], ['team', 'dancing'], ['top', 'idle']]) {
      await page.evaluate(section => document.getElementById(section).scrollIntoView({ block: 'start' }), id);
      await page.waitForFunction(want => document.querySelector('.sc-root').dataset.pose === want, pose, { timeout: 5000 });
    }
    assert.match(await page.locator('.sc-cat .sc-front').getAttribute('src'), /cat-idle@128\.webp/);

    // Open with the keyboard, Esc closes and focus returns to the cat.
    await cat.focus();
    await page.keyboard.press('Enter');
    const panel = page.locator('#sc-panel');
    await panel.waitFor();
    assert.equal(await cat.getAttribute('aria-expanded'), 'true');
    assert.match(await panel.innerText(), /Lütfen kişisel veya dava bilgisi paylaşmayın\./);
    assert.equal(await panel.locator('.sc-demo').getAttribute('href'), 'https://calendar.app.google/RL4CxQFEZAuVF2xP9');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'sc-input');
    await page.keyboard.press('Escape');
    assert.equal(await panel.isHidden(), true);
    assert.equal(await page.evaluate(() => document.activeElement.className), 'sc-cat');

    // Chips answer from the static FAQ without any network call.
    await cat.click();
    for (const chip of ['Neler yapabiliyor?', 'Verilerim güvende mi?', 'Yapay zekâ nasıl çalışıyor?']) {
      await panel.getByRole('button', { name: chip }).click();
    }
    assert.equal(calls.length, 0);
    assert.match(await panel.locator('.sc-log').innerText(), /ayrı tutulur; anahtarlar şifreli saklanır/);
    await page.screenshot({ path: path.join(shots, 'desktop-chips.png') });

    // A typed question: thinking while waiting, then the answer and a short celebration.
    let release;
    gate = new Promise(resolve => (release = resolve));
    await panel.locator('#sc-input').fill('CaseBridge kimler için?');
    await panel.locator('#sc-input').press('Enter');
    await page.waitForFunction(() => document.querySelector('.sc-root').dataset.pose === 'thinking');
    assert.match(await panel.locator('.sc-log').innerText(), /Düşünüyor…/);
    release(); gate = null;
    await panel.getByText('CaseBridge, hukuk büroları için bir yapay zekâ çalışma alanıdır.').waitFor();
    await page.waitForFunction(() => document.querySelector('.sc-root').dataset.pose === 'idle'); // back to the section pose
    assert.deepEqual(calls[0], { messages: [{ role: 'user', content: 'CaseBridge kimler için?' }], lang: 'tr' });
    await page.screenshot({ path: path.join(shots, 'desktop-answer.png') });

    // The next question carries the conversation (but not the chip answers).
    await panel.locator('#sc-input').fill('Demo nasıl alırım?');
    await panel.getByRole('button', { name: 'Gönder' }).click();
    await page.waitForFunction(n => document.querySelectorAll('.sc-msg[data-kind="answer"]').length === n, 2);
    assert.equal(calls[1].messages.length, 3);
    await page.waitForFunction(() => document.querySelector('.sc-root').dataset.pose === 'idle'); // reveal finished

    // Capped, rate-limited and offline states.
    reply = { status: 503, body: { detail: 'Şu an yoğunuz, sorunuzu yanıtlayamıyorum.', code: 'busy' } };
    await panel.locator('#sc-input').fill('Bir soru');
    await panel.locator('#sc-input').press('Enter');
    await panel.locator('.sc-msg[data-kind="busy"]').waitFor();
    assert.match(await panel.locator('.sc-msg[data-kind="busy"]').innerText(), /Şu an yoğunuz/);
    await page.screenshot({ path: path.join(shots, 'desktop-busy.png') });
    reply = { status: 429, body: { detail: 'Çok sık mesaj gönderdiniz.', code: 'rate_limited' } };
    await panel.locator('#sc-input').fill('Bir soru daha');
    await panel.locator('#sc-input').press('Enter');
    await panel.locator('.sc-msg[data-kind="rate_limited"]').waitFor();
    reply = 'abort';
    await panel.locator('#sc-input').fill('Çevrimdışı');
    await panel.locator('#sc-input').press('Enter');
    await panel.locator('.sc-msg[data-kind="network"]').waitFor();
    // The chips still answer while the AI is down.
    const before = calls.length;
    await panel.getByRole('button', { name: 'Demo nasıl alırım?' }).click();
    assert.equal(calls.length, before);
    // Message length is capped in the field.
    assert.equal(await panel.locator('#sc-input').getAttribute('maxlength'), '500');

    // Drag to the left edge: snaps, and the position survives a reload.
    await page.keyboard.press('Escape');
    const box = await cat.boundingBox();
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(600, 420, { steps: 6 });
    await page.mouse.move(240, 400, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    assert.equal(await root.getAttribute('data-side'), 'left');
    assert.equal(await panel.isHidden(), true); // the drag did not open the panel
    const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('casebridge-site-cat-position')));
    assert.equal(saved.side, 'left');
    await page.reload();
    await cat.waitFor();
    assert.equal(await page.locator('.sc-root').getAttribute('data-side'), 'left');
    assert.equal(Math.round((await cat.boundingBox()).x), 16);

    // Clicking a page's own demo link: victory, once per visit.
    await page.locator('a.nav-cta').evaluate(link => link.addEventListener('click', event => event.preventDefault()));
    await page.locator('a.nav-cta').click();
    assert.equal(await page.locator('.sc-root').getAttribute('data-pose'), 'victory');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(shots, 'desktop-victory-left.png') });
    await page.waitForFunction(() => document.querySelector('.sc-root').dataset.pose !== 'victory', null, { timeout: 6000 });
    await page.locator('a.nav-cta').click();
    assert.notEqual(await page.locator('.sc-root').getAttribute('data-pose'), 'victory');

    // English page copy.
    await page.evaluate(() => localStorage.removeItem('casebridge-site-cat-position'));
    await page.goto(`${base}/?lang=en&site-cat-api=${encodeURIComponent(FAKE_API)}`);
    await page.locator('.sc-cat').click();
    await page.getByRole('button', { name: 'Is my data safe?' }).click();
    assert.match(await page.locator('.sc-log').innerText(), /keys are stored encrypted/);
    assert.match(await page.locator('#sc-panel').innerText(), /Please don’t share personal or case details\./);
    await page.screenshot({ path: path.join(shots, 'desktop-english.png') });
    assert.deepEqual(errors, []);
    await page.close();

    // ---------- mobile 390 px ----------
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await phone.route('**/public/site-chat', route => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ answer: 'Demo için “Demo planla” düğmesini kullanın: https://calendar.app.google/RL4CxQFEZAuVF2xP9', kind: 'answer', lang: 'tr', knowledge_version: 'test' }) }));
    await phone.goto(`${base}/?site-cat-api=${encodeURIComponent(FAKE_API)}`);
    await phone.locator('.sc-cat').waitFor({ timeout: 15000 });
    await phone.screenshot({ path: path.join(shots, 'mobile-closed.png') });
    await phone.locator('.sc-cat').tap();
    const sheet = await phone.locator('#sc-panel').boundingBox();
    assert.deepEqual([sheet.x, sheet.y, sheet.width, sheet.height], [0, 0, 390, 844]);
    await phone.locator('#sc-input').fill('Demo nasıl alırım?');
    await phone.locator('#sc-input').press('Enter');
    const link = phone.locator('.sc-msg[data-kind="answer"] a[data-booking]');
    await link.waitFor();
    assert.equal(await link.getAttribute('href'), 'https://calendar.app.google/RL4CxQFEZAuVF2xP9');
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await phone.screenshot({ path: path.join(shots, 'mobile-open.png') });
    await phone.getByRole('button', { name: 'Kapat' }).tap();
    assert.equal(await phone.locator('#sc-panel').isHidden(), true);
    await phone.close();

    // ---------- reduced motion ----------
    const calm = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    await calm.goto(`${base}/?site-cat-api=${encodeURIComponent(FAKE_API)}`);
    await calm.locator('.sc-cat').waitFor({ timeout: 15000 });
    assert.equal(await calm.locator('.sc-cat').evaluate(node => getComputedStyle(node).transitionDuration), '0s');
    assert.equal(await calm.locator('.sc-cat .sc-pose').first().evaluate(node => getComputedStyle(node).transitionDuration), '0s');
    await calm.evaluate(() => document.getElementById('olasilik').scrollIntoView({ block: 'start' }));
    await calm.waitForFunction(() => document.querySelector('.sc-root').dataset.pose === 'thinking', null, { timeout: 5000 });
    await calm.locator('a.nav-cta').evaluate(link => link.addEventListener('click', event => event.preventDefault()));
    await calm.locator('a.nav-cta').click();
    assert.equal(await calm.locator('.sc-root').getAttribute('data-pose'), 'thinking'); // only the section changes the pose
    await calm.close();

    // ---------- optional: a real backend (mock provider) ----------
    if (realApi) {
      const real = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await real.goto(`${base}/?site-cat-api=${encodeURIComponent(realApi)}`);
      await real.locator('.sc-cat').click();
      await real.locator('#sc-input').fill('Verilerim güvende mi?');
      await real.locator('#sc-input').press('Enter');
      await real.locator('.sc-msg[data-kind="answer"]').waitFor({ timeout: 15000 });
      await real.locator('#sc-input').fill('Ev sahibim kirayı artırdı, davamı kazanır mıyım?');
      await real.locator('#sc-input').press('Enter');
      await real.locator('.sc-msg[data-kind="refusal"]').waitFor({ timeout: 15000 });
      assert.match(await real.locator('.sc-msg[data-kind="refusal"]').innerText(), /CaseBridge hukuki danışmanlık vermez/);
      await real.screenshot({ path: path.join(shots, 'desktop-real-backend.png') });
      await real.close();
    }
    console.log('site cat browser checks passed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
