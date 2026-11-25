const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const origin = process.env.GUIDE_ORIGIN || 'http://localhost:3015';
const out = process.env.GUIDE_OUTPUT || '/tmp/casebridge-guide-browser';
fs.mkdirSync(out, { recursive: true });

const admin = { id:'synthetic', email:'guide@example.test', full_name:'Örnek Yönetici', department:null, gender:null, role:'admin', law_firm_id:'synthetic', is_active:true };
const targets = {
  tasks: ['[data-guide="new-task"]', 'section[aria-label="İncelemede"] h2', 'section[aria-label="Tamamlandı"] h2'],
  cases: ['select[aria-label="Kategori filtresi"]', 'select[aria-label="Durum filtresi"]', 'select[aria-label="Sonuç filtresi"]'],
  account: ['#account-name', '#account-department', '#current-password'],
  reports: ['[data-guide="preview-cases"]', '[data-guide="download-cases"]'],
  admin: ['[aria-label="Yeni dava trend grafiği"]', '[aria-label="Avukat iş yükü bar grafiği"]', 'select[aria-label$="sorumlu avukatı"]'],
};
const roles = [
  ['admin', admin, '/gorevler', 'tasks'],
  ['lawyer', {...admin, role:'lawyer'}, '/davalar', 'cases'],
  ['client', {...admin, workspace_position:'client'}, '/hesabim', 'account'],
  ['accountant', {...admin, workspace_position:'accountant'}, '/hesabim', 'account'],
  ['platform', {...admin, is_platform_admin:true}, '/hesabim', 'account'],
];

async function check(browser, [role, me, path, topic], width, theme) {
  const context = await browser.newContext({ serviceWorkers:'block', viewport:{ width, height:width === 1440 ? 900 : 600 } });
  try {
    await context.addInitScript(theme => {
      localStorage.setItem('casebridge_token','synthetic-guide-session');
      localStorage.setItem('casebridge-theme',theme);
    }, theme);
    let writes = 0;
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      let pathname = url.pathname;
      if (url.origin === origin && pathname.startsWith('/api/')) {
        pathname = pathname.slice(4);
      } else if (!['http://localhost:8000', 'http://127.0.0.1:8000'].includes(url.origin)) {
        if (url.origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue();
        return route.abort();
      }
      if (request.method() !== 'GET') writes++;
      const responses = {
        '/users/me': me,
        '/ai/status': {configured:false},
        '/reports/summary': {total_cases:0, upcoming_hearings_30d:0, open_tasks:0, win_rate:0},
        '/analytics/overview': {total_cases:0, active_cases:0, by_status:[], by_category:[]},
        '/cases': topic === 'admin' ? [{id:'case-demo', case_name:'Kurgusal dosya', case_number:'Örnek 1', opening_date:'2026-11-01', status:'aktif', assigned_lawyer_id:null}] : [],
      };
      const data = responses[pathname] ?? [];
      await route.fulfill({ json:data, headers:{ 'access-control-allow-origin':'*' } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + path);
    await page.getByRole('link', { name:'Rehber', exact:true }).click();
    await expect(page).toHaveURL(origin + '/rehber?konu=' + topic);
    const article = page.getByRole('article');
    await expect(article.getByText('Nerede bulurum?')).toBeVisible();
    await expect(article.getByText('Nasıl kullanılır?')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const ids = await page.locator('#main-content option[value]').evaluateAll(options => options.map(o => o.value).filter(Boolean));
    if (['client','accountant','platform'].includes(role) && ids.some(id => id.startsWith('bureau-') || id.startsWith('ai-'))) throw Error('Unauthorized topic');
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.querySelector('main').scrollWidth > document.querySelector('main').clientWidth)) throw Error('Horizontal overflow');
    if (role === 'admin') await page.screenshot({path:out + '/handbook-' + topic + '-' + width + '-' + theme + '.png'});
    await article.getByRole('link', { name:'Ekranda adım adım göster' }).click();
    const tour = page.getByRole('region', { name:'Ekran turu' });
    const target = page.locator('[data-guide-current]');
    async function verifyStep(index) {
      await expect(target).toHaveCount(1);
      await expect(page.locator(targets[topic][index]).first()).toHaveAttribute('data-guide-current', '');
      await expect(target).toBeInViewport();
      await expect(tour).toContainText('Adım ' + (index + 1) + ' / ' + targets[topic].length);
      await expect(target).toHaveCSS('outline-style','solid');
    }
    await verifyStep(0);
    await tour.getByRole('button', { name:'Sonraki' }).click();
    await verifyStep(1);
    await tour.getByRole('button', { name:'Önceki' }).click();
    await verifyStep(0);
    for (let i = 1; i < targets[topic].length; i++) {
      await tour.getByRole('button', { name:'Sonraki' }).click();
      await verifyStep(i);
    }
    await tour.getByRole('link', { name:'Turu bitir' }).click();
    await expect(page).toHaveURL(origin + '/rehber?konu=' + topic);
    await expect(target).toHaveCount(0);
    if (writes || errors.length) throw Error(JSON.stringify({writes, errors}));
    return {role,width,theme,topic,writes};
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    const results = [];
    for (const role of roles) for (const width of [1440,390,320]) for (const theme of ['light','dark']) {
      results.push(await check(browser,role,width,theme));
    }
    for (const [path, topic] of [['/raporlar','reports'], ['/admin','admin']]) {
      for (const [width, theme] of [[1440,'light'], [390,'dark']]) {
        results.push(await check(browser, ['admin',admin,path,topic], width, theme));
      }
    }
    fs.writeFileSync(out + '/results.json', JSON.stringify(results,null,2));
    console.log(results.length + ' guide scenarios passed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode=1; });
