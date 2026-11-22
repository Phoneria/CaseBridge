const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const origin = process.env.GUIDE_ORIGIN || 'http://localhost:3015';
const out = process.env.GUIDE_OUTPUT || '/tmp/casebridge-guide-browser';
fs.mkdirSync(out, { recursive: true });

const admin = { id:'synthetic', email:'guide@example.test', full_name:'Örnek Yönetici', department:null, gender:null, role:'admin', law_firm_id:'synthetic', is_active:true };
const roles = [
  ['admin', admin, '/gorevler', 'tasks'],
  ['lawyer', {...admin, role:'lawyer'}, '/davalar', 'cases'],
  ['client', {...admin, workspace_position:'client'}, '/hesabim', 'account'],
  ['accountant', {...admin, workspace_position:'accountant'}, '/hesabim', 'account'],
  ['platform', {...admin, is_platform_admin:true}, '/hesabim', 'account'],
];

async function check(browser, [role, me, path, topic], width, theme) {
  const context = await browser.newContext({ viewport:{ width, height:width === 1440 ? 900 : 600 } });
  try {
    await context.addInitScript(theme => {
      localStorage.setItem('casebridge_token','synthetic-guide-session');
      localStorage.setItem('casebridge-theme',theme);
    }, theme);
    let writes = 0;
    await context.route(/^https?:\/\/(localhost|127\.0\.0\.1):8000\//, async route => {
      if (route.request().method() !== 'GET') writes++;
      const pathname = new URL(route.request().url()).pathname;
      const responses = {
        '/users/me': me,
        '/ai/status': {configured:false},
        '/reports/summary': {total_cases:0, upcoming_hearings_30d:0, open_tasks:0, closed_cases:0},
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
    await expect(target).toBeInViewport();
    const first = await target.evaluate(el => el.outerHTML);
    await tour.getByRole('button', { name:'Sonraki' }).click();
    await expect(target).toBeInViewport();
    if (await target.evaluate(el => el.outerHTML) === first) throw Error('Highlight did not move');
    await tour.getByRole('button', { name:'Önceki' }).click();
    await expect(target).toBeInViewport();
    await tour.getByRole('button', { name:'Sonraki' }).click();
    if (topic !== 'reports') await tour.getByRole('button', { name:'Sonraki' }).click();
    await expect(target).toBeInViewport();
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
