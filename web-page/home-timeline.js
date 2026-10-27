(() => {
  const root = document.getElementById('timeline');
  if (!root) return;
  const tabs = document.getElementById('home-year-tabs');
  const summary = document.getElementById('home-timeline-summary');
  const months = document.getElementById('home-month-list');
  const detail = document.getElementById('home-month-detail');
  const money = value => `${value < 0 ? '−' : ''}$${Math.round(Math.abs(value)).toLocaleString('en-US')}`;
  const monthName = value => new Intl.DateTimeFormat('en-US', {month: 'short', year: 'numeric', timeZone: 'UTC'}).format(new Date(`${value}-01T00:00:00Z`));
  const el = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  let baseRows = [], riskRows = [], year = 2027, index = 0, scenario = 'base';

  function currentRows() { return baseRows.filter(row => row.year === year); }
  function addMetric(parent, label, value) {
    const box = el('div', 'home-metric');
    box.append(el('span', '', label), el('strong', '', value));
    parent.append(box);
  }
  function renderSummary() {
    const rows = currentRows(), last = rows.at(-1);
    const total = key => rows.reduce((sum, row) => sum + row[key], 0);
    const risk = riskRows.find(row => row.month === last.month);
    summary.replaceChildren();
    addMetric(summary, 'Year-end active team', String(last.headcount));
    addMetric(summary, 'Year-end customers', scenario === 'risk' ? `${risk.stress_firms} firms · ${risk.stress_companies} companies` : `${last.paying_firms} firms · ${last.paying_companies} companies`);
    addMetric(summary, scenario === 'risk' ? 'Base-plan lab contracts' : 'Modeled lab contracts', String(total('lab_license_contracts')));
    addMetric(summary, 'Annual revenue', money(scenario === 'risk' ? riskRows.filter(row => row.year === year).reduce((sum, row) => sum + row.stress_revenue_usd, 0) : total('revenue_usd')));
    addMetric(summary, 'Annual expenses', money(scenario === 'risk' ? riskRows.filter(row => row.year === year).reduce((sum, row) => sum + row.stress_expense_usd, 0) : total('expense_usd')));
  }
  function infoBlock(label, value) {
    const box = el('div', 'home-detail-block');
    box.append(el('span', '', label), el('p', '', value));
    return box;
  }
  function renderMonth() {
    const row = currentRows()[index];
    const risk = riskRows.find(item => item.month === row.month);
    months.querySelectorAll('button').forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    detail.replaceChildren();
    const top = el('div', 'home-detail-top');
    const title = el('div');
    title.append(el('span', 'home-detail-kicker', `${row.phase} · ${scenario === 'risk' ? 'Risk case' : 'Base plan'}`), el('h3', '', monthName(row.month)));
    top.append(title, el('span', 'home-detail-month', `${String(index + 1).padStart(2, '0')} / 12`));
    detail.append(top);
    const work = el('div', 'home-detail-work');
    work.append(infoBlock('PRODUCT & TECHNOLOGY', row.technical), infoBlock('MANAGEMENT & MARKET', row.management), infoBlock('LABS & LICENSING', row.lab_work));
    detail.append(work);
    const metrics = el('div', 'home-detail-metrics');
    addMetric(metrics, 'Active team', String(row.headcount));
    addMetric(metrics, 'Customers · firms / companies', scenario === 'risk' ? `${risk.stress_firms} / ${risk.stress_companies}` : `${row.paying_firms} / ${row.paying_companies}`);
    addMetric(metrics, 'Revenue', money(scenario === 'risk' ? risk.stress_revenue_usd : row.revenue_usd));
    addMetric(metrics, 'Expenses', money(scenario === 'risk' ? risk.stress_expense_usd : row.expense_usd));
    addMetric(metrics, 'Operating result', money(scenario === 'risk' ? risk.stress_result_usd : row.operating_result_usd));
    addMetric(metrics, 'Lab sales', money(scenario === 'risk' ? risk.stress_lab_sales_usd : row.lab_sales_usd));
    detail.append(metrics);
    const footer = el('p', 'home-detail-note', scenario === 'risk' ? `Risk planning: ${risk.standby_fte} on-call FTE; cash buffer target ${money(risk.cash_buffer_target_usd)}.${risk.crisis_event ? ` Crisis: ${risk.crisis_event} (${money(risk.crisis_cost_usd)}).` : ''}` : `${row.lab_license_contracts} modeled lab license contract(s). Team and customers are month-end targets.`);
    detail.append(footer);
  }
  function renderMonths() {
    months.replaceChildren();
    currentRows().forEach((row, i) => {
      const button = el('button', 'home-month-button');
      button.type = 'button';
      const revenue = money(scenario === 'risk' ? riskRows.find(item => item.month === row.month).stress_revenue_usd : row.revenue_usd);
      button.setAttribute('aria-label', `${monthName(row.month)} · revenue ${revenue}`);
      button.append(el('span', '', monthName(row.month).split(' ')[0]), el('strong', '', revenue));
      button.addEventListener('click', () => { index = i; renderMonth(); });
      months.append(button);
    });
    months.scrollLeft = months.children[index].offsetLeft - months.children[0].offsetLeft;
    renderMonth();
  }
  function showYear(selected) {
    year = selected;
    index = 0;
    tabs.querySelectorAll('button').forEach(button => {
      const active = Number(button.dataset.year) === year;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    renderSummary();
    renderMonths();
  }
  Promise.all(['planning/monthly-roadmap.json', 'planning/risk-scenario.json'].map(path => fetch(path).then(response => {
    if (!response.ok) throw new Error('Planning data could not be loaded');
    return response.json();
  }))).then(([base, risk]) => {
    if (base.length !== risk.length || base.some((row, i) => row.month !== risk[i].month)) throw new Error('Planning data does not align');
    baseRows = base; riskRows = risk;
    tabs.replaceChildren();
    [...new Set(base.map(row => row.year))].forEach(item => {
      const button = el('button', '', `Year ${item - 2026} · ${item}`);
      button.type = 'button'; button.role = 'tab'; button.dataset.year = item;
      button.addEventListener('click', () => showYear(item));
      tabs.append(button);
    });
    tabs.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const options = [...tabs.querySelectorAll('button')];
      const current = options.findIndex(button => Number(button.dataset.year) === year);
      const next = options[(current + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
      showYear(Number(next.dataset.year)); next.focus();
    });
    months.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...months.querySelectorAll('button')];
      index = (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      renderMonth();
      buttons[index].focus();
      buttons[index].scrollIntoView({block: 'nearest', inline: 'nearest'});
    });
    document.querySelectorAll('[data-home-scenario]').forEach(button => button.addEventListener('click', () => {
      scenario = button.dataset.homeScenario;
      document.querySelectorAll('[data-home-scenario]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
      renderSummary(); renderMonths();
    }));
    document.querySelectorAll('.roadmap-grid article').forEach((card, i) => {
      const target = [2027, 2028, 2031][i];
      const button = el('button', 'roadmap-explore', `Explore ${target} month by month ↘`);
      button.type = 'button';
      button.addEventListener('click', () => { showYear(target); root.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'}); });
      card.append(button);
    });
    showYear(2027);
  }).catch(error => { summary.textContent = error.message; detail.textContent = 'The full planning sheet is available from the link above.'; });
})();
