(() => {
  const grid = document.getElementById('home-chart-grid');
  if (!grid) return;
  const annualTable = document.getElementById('home-annual-risk');
  const crisisList = document.getElementById('home-crisis-list');
  const svgNS = 'http://www.w3.org/2000/svg';
  const usd = value => `${value < 0 ? '−' : ''}$${Math.round(Math.abs(value)).toLocaleString('en-US')}`;
  const compact = (value, money) => {
    const absolute = Math.abs(value);
    const number = absolute >= 1e6 ? `${(absolute / 1e6).toFixed(absolute >= 1e7 ? 0 : 1)}m` : absolute >= 1e3 ? `${(absolute / 1e3).toFixed(absolute >= 1e4 ? 0 : 1)}k` : String(Math.round(absolute));
    return `${value < 0 ? '−' : ''}${money ? '$' : ''}${number}`;
  };
  const node = (tag, className, content) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  };
  const svgNode = (tag, attributes = {}) => {
    const element = document.createElementNS(svgNS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
    return element;
  };
  const monthly = (base, risk) => base.map((row, i) => {
    const stress = risk[i];
    return {
      label: row.month, baseRevenue: row.revenue_usd, riskRevenue: stress.stress_revenue_usd,
      baseExpense: row.expense_usd, riskExpense: stress.stress_expense_usd,
      baseResult: row.operating_result_usd, riskResult: stress.stress_result_usd,
      team: row.headcount, capacity: row.headcount + stress.standby_fte,
      customers: row.paying_firms + row.paying_companies,
      riskCustomers: stress.stress_firms + stress.stress_companies,
      buffer: stress.cash_buffer_target_usd, starter: 150000
    };
  });
  const annual = (base, risk) => [...new Set(base.map(row => row.year))].map(year => {
    const b = base.filter(row => row.year === year), r = risk.filter(row => row.year === year);
    const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
    return {
      label: String(year), baseRevenue: sum(b, 'revenue_usd'), riskRevenue: sum(r, 'stress_revenue_usd'),
      baseExpense: sum(b, 'expense_usd'), riskExpense: sum(r, 'stress_expense_usd'),
      baseResult: sum(b, 'operating_result_usd'), riskResult: sum(r, 'stress_result_usd'),
      team: b.at(-1).headcount, capacity: b.at(-1).headcount + r.at(-1).standby_fte,
      customers: b.at(-1).paying_firms + b.at(-1).paying_companies,
      riskCustomers: r.at(-1).stress_firms + r.at(-1).stress_companies,
      buffer: Math.max(...r.map(row => row.cash_buffer_target_usd)), starter: 150000
    };
  });
  function chart(title, description, data, series, money) {
    const card = node('article', 'home-chart');
    const heading = node('div', 'home-chart-heading');
    heading.append(node('h4', '', title), node('p', '', description));
    card.append(heading);
    const values = series.flatMap(item => data.map(row => row[item.key]));
    let low = Math.min(0, ...values), high = Math.max(0, ...values);
    if (low === high) high = low + 1;
    const gap = (high - low) * .08;
    if (low < 0) low -= gap;
    if (high > 0) high += gap;
    const width = 640, height = 260, left = 68, right = 20, top = 18, bottom = 42;
    const x = i => left + (data.length === 1 ? 0 : i / (data.length - 1)) * (width - left - right);
    const y = value => top + (high - value) / (high - low) * (height - top - bottom);
    const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${title}. ${series.map(item => `${item.label} ends at ${money ? usd(data.at(-1)[item.key]) : Math.round(data.at(-1)[item.key])}`).join('; ')}.` });
    for (let i = 0; i <= 4; i++) {
      const value = low + (high - low) * i, yy = y(value);
      svg.append(svgNode('line', { x1: left, y1: yy, x2: width - right, y2: yy, class: 'home-grid-line' }));
      const label = svgNode('text', { x: left - 9, y: yy + 4, 'text-anchor': 'end', class: 'home-axis-label' });
      label.textContent = compact(value, money);
      svg.append(label);
    }
    if (low < 0 && high > 0) svg.append(svgNode('line', { x1: left, y1: y(0), x2: width - right, y2: y(0), class: 'home-zero-line' }));
    const step = data.length > 12 ? 12 : 1;
    for (let i = 0; i < data.length; i += step) {
      const label = svgNode('text', { x: x(i), y: height - 14, 'text-anchor': i ? 'middle' : 'start', class: 'home-axis-label' });
      label.textContent = data[i].label.slice(0, 7);
      svg.append(label);
    }
    if ((data.length - 1) % step) {
      const label = svgNode('text', { x: x(data.length - 1), y: height - 14, 'text-anchor': 'end', class: 'home-axis-label' });
      label.textContent = data.at(-1).label.slice(0, 7);
      svg.append(label);
    }
    for (const item of series) {
      svg.append(svgNode('path', { d: data.map((row, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(2)} ${y(row[item.key]).toFixed(2)}`).join(' '), fill: 'none', stroke: item.color, 'stroke-width': 3, 'stroke-dasharray': item.dashed ? '8 6' : '', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      data.forEach((row, i) => {
        const dot = svgNode('circle', { cx: x(i), cy: y(row[item.key]), r: data.length > 12 ? 2.4 : 4, fill: item.color });
        const tip = svgNode('title');
        tip.textContent = `${row.label} · ${item.label}: ${money ? usd(row[item.key]) : Math.round(row[item.key]).toLocaleString('en-US')}`;
        dot.append(tip);
        svg.append(dot);
      });
    }
    card.append(svg);
    const legend = node('div', 'home-chart-legend');
    series.forEach(item => {
      const entry = node('span', item.dashed ? 'dashed' : '', `${item.label} · ${money ? usd(data.at(-1)[item.key]) : Math.round(data.at(-1)[item.key]).toLocaleString('en-US')}`);
      entry.style.setProperty('--series-color', item.color);
      legend.append(entry);
    });
    card.append(legend);
    return card;
  }
  function draw(data, period) {
    const blue = '#007eac', red = '#c54b45', navy = '#142d4e', gold = '#a86d18';
    const plots = [
      ['Revenue', 'Receipts in the selected period', [{ key: 'baseRevenue', label: 'Base', color: blue }, { key: 'riskRevenue', label: 'Risk case', color: red, dashed: true }], true],
      ['Expenses', 'Includes modeled crisis response and standby retainers', [{ key: 'baseExpense', label: 'Base', color: navy }, { key: 'riskExpense', label: 'Risk case', color: red, dashed: true }], true],
      ['Operating result', 'Revenue less expenses; below zero is a loss', [{ key: 'baseResult', label: 'Base', color: blue }, { key: 'riskResult', label: 'Risk case', color: red, dashed: true }], true],
      ['Team and standby capacity', 'Active team plus reserved on-call capacity', [{ key: 'team', label: 'Active team', color: navy }, { key: 'capacity', label: 'With standby', color: gold, dashed: true }], false],
      ['Paying customers', 'Firms and companies combined at period end', [{ key: 'customers', label: 'Base', color: blue }, { key: 'riskCustomers', label: 'Risk case', color: red, dashed: true }], false],
      ['Cash buffer target', 'Three forward risk expense months; $150k floor', [{ key: 'buffer', label: 'Target', color: gold }, { key: 'starter', label: 'Starter reserve', color: navy, dashed: true }], true]
    ];
    grid.replaceChildren(...plots.map(([title, description, series, money]) => chart(title, description, data, series, money)));
    document.getElementById('home-period-note').textContent = period === 'annual'
      ? 'Flows are annual sums; team and customers are year-end counts; cash buffer is the year’s highest target.'
      : 'Flows are monthly totals; team and customers are month-end counts; cash buffer covers the current and next two risk months.';
  }
  function renderTable(rows) {
    const table = node('table', 'home-annual-table');
    table.append(node('caption', '', 'Annual base and risk-case totals · USD'));
    const head = node('thead'), headRow = node('tr');
    ['Year', 'Base revenue', 'Risk revenue', 'Base expenses', 'Risk expenses', 'Base result', 'Risk result', 'Peak cash buffer', 'Active + standby team', 'Base / risk customers'].forEach(label => {
      const th = node('th', '', label); th.scope = 'col'; headRow.append(th);
    });
    head.append(headRow); table.append(head);
    const body = node('tbody');
    rows.forEach(row => {
      const tr = node('tr');
      [row.label, usd(row.baseRevenue), usd(row.riskRevenue), usd(row.baseExpense), usd(row.riskExpense), usd(row.baseResult), usd(row.riskResult), usd(row.buffer), `${row.team} + ${row.capacity - row.team}`, `${row.customers} / ${row.riskCustomers}`].forEach(value => tr.append(node('td', '', value)));
      body.append(tr);
    });
    table.append(body); annualTable.replaceChildren(table);
  }
  Promise.all(['planning/monthly-roadmap.json', 'planning/risk-scenario.json'].map(path => fetch(path).then(response => {
    if (!response.ok) throw new Error(`Could not load ${path}`);
    return response.json();
  }))).then(([base, risk]) => {
    if (base.length !== risk.length || base.some((row, i) => row.month !== risk[i].month)) throw new Error('Planning data does not align');
    const monthlyRows = monthly(base, risk), annualRows = annual(base, risk);
    document.querySelectorAll('[data-home-period]').forEach(button => button.addEventListener('click', () => {
      document.querySelectorAll('[data-home-period]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
      draw(button.dataset.homePeriod === 'annual' ? annualRows : monthlyRows, button.dataset.homePeriod);
    }));
    draw(monthlyRows, 'monthly'); renderTable(annualRows);
    risk.filter(row => row.crisis_cost_usd).forEach(row => {
      const event = node('div', 'home-crisis-event');
      event.append(node('strong', '', row.month), node('span', '', row.crisis_event), node('b', '', usd(row.crisis_cost_usd)));
      crisisList.append(event);
    });
  }).catch(error => { grid.textContent = error.message; });
})();
