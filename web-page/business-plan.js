// Offline planning model. All customer cohorts, unit values and volumes are assumptions.
const financialPlan = JSON.parse(document.getElementById('finance-data').textContent);
const usd = new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0});
const percent = new Intl.NumberFormat('en-US', {style:'percent',maximumFractionDigits:1});
const explorerState = {revenue:{year:1,category:null},cost:{year:null,category:null}};
let selectedAnnualYear = 1;
let activeScenario = 'base';
const compact = value => value >= 1e6 ? '$'+(value/1e6).toFixed(2).replace(/\.00$/,'')+'m' : '$'+(value/1e3).toFixed(1).replace(/\.0$/,'')+'k';
function valuesFor(year) {
  const licensing=activeScenario==='base'?year.licensing:0;
  const revenue=year.subscriptions+licensing+year.commissions;
  const costs=year.serviceCosts+licensing*.55+year.commissionOperations+year.fixedCosts;
  return {licensing,revenue,costs,result:revenue-costs};
}
function categoriesFor(kind,y) {
  const v=valuesFor(y);
  if(kind==='revenue') return [
    {key:'data',label:'Data licensing',value:v.licensing,color:'#007eac'},
    {key:'subscriptions',label:'Subscriptions',value:y.subscriptions,color:'#142d4e'},
    {key:'commissions',label:'Marketplace commissions',value:y.commissions,color:'#cf493e'}
  ];
  return [
    {key:'lab',label:'Lab partner royalties',value:v.licensing*.4,color:'#007eac'},
    {key:'quality',label:'Data production & review',value:v.licensing*.15,color:'#57b9d3'},
    {key:'delivery',label:'Subscription delivery',value:y.serviceCosts,color:'#142d4e'},
    {key:'marketplace',label:'Marketplace operations',value:y.commissionOperations,color:'#cf493e'},
    {key:'engineering',label:'Engineering & product',value:y.engineering,color:'#45678a'},
    {key:'sales',label:'Sales & US expansion',value:y.sales,color:'#9c5956'},
    {key:'legal',label:'Legal, security & administration',value:y.legalAdmin,color:'#889cae'}
  ];
}
function renderAnnualInsight() {
  const y=financialPlan.find(item=>item.year===selectedAnnualYear);
  const v=valuesFor(y);
  const licensingShare=v.revenue?v.licensing/v.revenue:0;
  document.getElementById('annual-insight').innerHTML=`<div><p class="section-label">SELECTED YEAR · ${y.calendar}</p><h4>Year ${y.year} at a glance</h4><p>Data licensing makes up ${percent.format(licensingShare)} of modeled revenue. All figures are planning targets.</p></div><div class="annual-insight-metrics"><div><span>Revenue</span><strong>${usd.format(v.revenue)}</strong></div><div><span>Operating costs</span><strong>${usd.format(v.costs)}</strong></div><div><span>Indicative result</span><strong>${usd.format(v.result)}</strong></div></div>`;
  document.querySelectorAll('#finance-rows tr').forEach(row=>{
    const active=Number(row.dataset.year)===selectedAnnualYear;
    row.classList.toggle('is-selected',active);
    row.querySelector('button')?.setAttribute('aria-pressed',String(active));
  });
}
function selectAnnualYear(year) {
  selectedAnnualYear=year;
  ['revenue','cost'].forEach(kind=>{explorerState[kind]={year,category:null};renderExplorer(kind);});
  renderAnnualInsight();
}
function showFinancialScenario(scenario) {
  activeScenario=scenario;
  let cumulative=0,peak=0,prior=0;
  document.getElementById('finance-rows').innerHTML=financialPlan.map(y=>{
    const v=valuesFor(y);cumulative+=v.result;peak=Math.max(peak,-cumulative);
    const growth=prior?percent.format(v.revenue/prior-1)+' YoY':'First modeled year';prior=v.revenue;
    return `<tr data-year="${y.year}"><th scope="row"><button type="button" class="annual-year-button" data-annual-year="${y.year}" aria-pressed="${selectedAnnualYear===y.year}">Y${y.year} / ${y.calendar} ↗</button></th><td>${y.firms.toLocaleString()} / ${y.companies.toLocaleString()}</td><td>${usd.format(y.subscriptions)}</td><td>${usd.format(v.licensing)}</td><td>${usd.format(y.commissions)}</td><td><strong>${usd.format(v.revenue)}</strong><small>${growth}</small></td><td>${usd.format(v.costs)}</td><td class="${v.result<0?'negative-result':'positive-result'}">${usd.format(v.result)}</td></tr>`;
  }).join('');
  const last=valuesFor(financialPlan[4]);
  const firstTwo=-financialPlan.slice(0,2).reduce((sum,y)=>sum+valuesFor(y).result,0);
  document.getElementById('finance-summary').innerHTML=`<div><span>Year-five annual revenue target</span><strong>${usd.format(last.revenue)}</strong></div><div><span>Year-five operating cost target</span><strong>${usd.format(last.costs)}</strong></div><div><span>Year-five indicative operating result</span><strong>${usd.format(last.result)}</strong></div>`;
  document.getElementById('scenario-description').textContent=scenario==='base'
    ? 'Aggressive target: $40m annual revenue in Year 5 — 75% data licensing, 12.5% subscriptions and 12.5% marketplace commissions (rounded). All buyer values and volumes are unvalidated assumptions.'
    : 'Stress case: zero data licensing and zero variable lab/data costs. Subscription and assumed marketplace activity remain. Year-5 revenue: '+usd.format(last.revenue)+'; operating result: '+usd.format(last.result)+'.';
  document.getElementById('funding-note').textContent=`Selected scenario: first 24 months modeled operating burn ${usd.format(firstTwo)}; peak cumulative operating funding need ${usd.format(peak)}; additional need beyond $1.5m seed ${usd.format(Math.max(0,peak-1500000))}. Timing, collection delays and contract delivery can require more cash. Seed is not deducted from operating expense.`;
  document.querySelectorAll('[data-scenario]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scenario===scenario)));
  ['revenue','cost'].forEach(renderExplorer);
  renderAnnualInsight();
}
function renderExplorer(kind) {
  const state=explorerState[kind];
  const maximum=Math.max(...financialPlan.map(y=>valuesFor(y)[kind==='revenue'?'revenue':'costs']));
  document.getElementById(kind+'-years').innerHTML=financialPlan.map(y=>{
    const total=valuesFor(y)[kind==='revenue'?'revenue':'costs'];
    return `<button class="finance-year" type="button" data-year="${y.year}" aria-expanded="${state.year===y.year}" aria-controls="${kind}-panel"><span>YEAR ${y.year} · ${y.calendar}</span><strong>${compact(total)}</strong><span class="year-spark" aria-hidden="true"><i style="width:${total/maximum*100}%"></i></span><small>${state.year===y.year?'Chart open ↓':'Explore breakdown ↓'}</small></button>`;
  }).join('');
  document.querySelectorAll(`#${kind}-years button`).forEach(b=>b.addEventListener('click',()=>{
    selectAnnualYear(Number(b.dataset.year));
  }));
  const panel=document.getElementById(kind+'-panel');panel.hidden=state.year===null;
  if(state.year===null)return;
  const y=financialPlan.find(y=>y.year===state.year);const cats=categoriesFor(kind,y);
  const max=Math.max(...cats.map(c=>c.value),1);const total=valuesFor(y)[kind==='revenue'?'revenue':'costs'];
  document.getElementById(kind+'-year-title').textContent=`Year ${y.year} · ${y.calendar} — ${usd.format(total)} ${kind==='revenue'?'revenue':'operating costs'}`;
  document.getElementById(kind+'-chart').innerHTML=cats.map(c=>`<button type="button" class="category-bar" data-category="${c.key}" aria-pressed="${state.category===c.key}" aria-controls="${kind}-detail"><span class="category-name">${c.label}</span><span class="category-track"><i style="--bar-size:${c.value/max*100}%;--bar-color:${c.color}"></i></span><span class="category-value">${usd.format(c.value)}<small>${percent.format(c.value/(total||1))} · Details ↗</small></span></button>`).join('');
  document.querySelectorAll(`#${kind}-chart button`).forEach(b=>b.addEventListener('click',()=>{
    state.category=b.dataset.category;
    document.querySelectorAll(`#${kind}-chart button`).forEach(item=>item.setAttribute('aria-pressed',String(item===b)));
    renderCategory(kind,y,state.category);
  }));
  if(state.category)renderCategory(kind,y,state.category);
  else document.getElementById(kind+'-detail').innerHTML='<p class="category-prompt">Select a chart bar to see '+(kind==='revenue'?'potential customer groups, annual revenue and unit assumptions.':'cost drivers, recipients and annual spending.')+'</p>';
}
function renderCategory(kind,y,key) {
  const cat=categoriesFor(kind,y).find(c=>c.key===key);let rows=[],note='',headers=[];
  if(kind==='revenue') {
    headers=['Potential customer group','Annual calculation / assumed value','Annual revenue'];
    if(key==='data'){
      const counts=[[1,0,0],[1,1,1],[3,4,3],[6,10,6],[10,20,10]][y.year-1];
      rows=['Foundation-model developers','Legal AI & legal-information platforms','Enterprise AI / specialist research teams'].map((name,i)=>[name,`${counts[i]} buyers × ${usd.format(y.licenseFee)} per year`,valuesFor(y).licensing?counts[i]*y.licenseFee:0]);
      note='Potential outreach examples: OpenAI and specialist legal-AI platforms such as Harvey or Legora. None is a confirmed customer or qualified prospect. Allocation across groups and all contract values are hypothetical. Annual licenses cover only eligible accumulated assets plus refreshes; no automatic sale of client files. '+(activeScenario==='no-data'?'This stress scenario assumes zero licensing receipts.':'');
    } else if(key==='subscriptions'){
      rows=[['Law firms',`${y.avgFirms.toLocaleString()} average paying firms × $1,200/year`,y.avgFirms*1200],['Cross-border company legal teams',`${y.avgCompanies.toLocaleString()} average companies × $6,000/year`,y.avgCompanies*6000]];
      note=`Target segments: Turkish law firms and international-trade company legal teams. Year-end target: ${y.firms.toLocaleString()} firms + ${y.companies.toLocaleString()} companies; annual revenue uses the average paying base, not the year-end count. Current traction remains the three-firm POC; future accounts are not contracted.`;
    }else{
      rows=[['Workflow software orders',`40% of ${y.transactions.toLocaleString()} orders × $5,000 × 10%`,y.commissions*.4],['Document / e-signature tooling',`35% of ${y.transactions.toLocaleString()} orders × $5,000 × 10%`,y.commissions*.35],['Business workflow service orders',`25% of ${y.transactions.toLocaleString()} orders × $5,000 × 10%`,y.commissions*.25]];
      note=`Potential purchasers: participating firms and cross-border companies buying optional third-party tools and operational services. ${y.transactions.toLocaleString()} orders × $5,000 = ${usd.format(y.transactions*5000)} gross marketplace volume; only the assumed 10% fee is revenue. Suppliers receive the remaining 90%, which is not counted as CaseBridge revenue or expense. This marketplace is planned; no supplier agreements, legal referrals or outcome fees are assumed.`;
    }
  }else{
    headers=['Spending / recipient group','Annual cost driver','Annual cost'];
    const specs={
      lab:[[['Partner research laboratories','40% of annual gross data licensing',cat.value]],'Proposed lab revenue share. No signed lab agreement or named supplier is claimed. Zero when data licensing is zero.'],
      quality:[[['Annotation & expert review pool','60% of the data-operations budget',cat.value*.6],['Data production, evaluation & delivery','40% of the data-operations budget',cat.value*.4]],'Combined budget equals 15% of data licensing. Restricted to production, external review and delivery; fixed legal and product salaries are budgeted separately.'],
      delivery:[[['Model inference, audio & compute','60% of delivery budget',cat.value*.6],['Storage, monitoring & support','40% of delivery budget',cat.value*.4]],'Total subscription delivery budget = 90% of subscription revenue. Provider selection and usage are unconfirmed; these are cost envelopes, not vendor quotes.'],
      marketplace:[[['Order handling & payment operations','60% of commission operations',cat.value*.6],['Supplier onboarding & service support','40% of commission operations',cat.value*.4]],'Operations cost = 20% of net commission revenue. Third-party supplier order proceeds are excluded; not double counted.'],
      engineering:[[['Product & AI engineering team','75% of fixed engineering budget',cat.value*.75],['Backend, UX & integrations','25% of fixed engineering budget',cat.value*.25]],'Annual salary, contractor and product-development planning envelope. Variable inference and data review are excluded to avoid duplication.'],
      sales:[[['Sales & customer acquisition','60% of commercial budget',cat.value*.6],['US entry, partnerships & customer success','40% of commercial budget',cat.value*.4]],'US expansion is conditional on funding and local validation. Acquisition, local presence and commercial personnel are budgeted here.'],
      legal:[[['Legal, data rights & security review','60% of this fixed budget',cat.value*.6],['Finance, insurance & administration','40% of this fixed budget',cat.value*.4]],'Fixed governance and administration budget. External data annotation and variable lab share appear in separate lines. No vendor prices or compliance certification are implied.']
    };[rows,note]=specs[key];
  }
  document.getElementById(kind+'-detail').innerHTML=`<div class="category-detail-heading"><div><p class="section-label">YEAR ${y.year} · ${y.calendar}</p><h6>${cat.label}</h6></div><strong>${usd.format(cat.value)}<small>annual ${kind==='revenue'?'revenue':'cost'}</small></strong></div><div class="table-scroll" tabindex="0" aria-label="${cat.label} annual detail"><table class="research-table detail-table"><thead><tr>${headers.map(h=>'<th>'+h+'</th>').join('')}</tr></thead><tbody>${rows.map(row=>'<tr><th scope="row">'+row[0]+'</th><td>'+row[1]+'</td><td>'+usd.format(row[2])+'</td></tr>').join('')}<tr class="detail-total"><th scope="row">Total</th><td>Year ${y.year} annual ${kind==='revenue'?'revenue':'cost'}</td><td>${usd.format(cat.value)}</td></tr></tbody></table></div><p class="source-note">${note}</p>`;
}
document.querySelectorAll('[data-scenario]').forEach(b=>b.addEventListener('click',()=>showFinancialScenario(b.dataset.scenario)));
document.getElementById('finance-rows').addEventListener('click',event=>{const button=event.target.closest('[data-annual-year]');if(button)selectAnnualYear(Number(button.dataset.annualYear));});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{const kind=b.dataset.close;explorerState[kind]={year:null,category:null};renderExplorer(kind);document.querySelector(`#${kind}-years button`).focus();}));
showFinancialScenario('base');
