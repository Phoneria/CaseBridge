const usd = value => (value < 0 ? '−' : '') + '$' + Math.round(Math.abs(value)).toLocaleString('en-US');
const tabs = document.getElementById('year-tabs');
const summary = document.getElementById('year-summary');
const body = document.getElementById('month-rows');
const chartGrid = document.getElementById('chart-grid');
const crisisList = document.getElementById('crisis-list');
const svgNS = 'http://www.w3.org/2000/svg';

function cell(row, value) { const td=document.createElement('td'); td.textContent=value; row.append(td); }
function metric(label, value) { const box=document.createElement('div'); box.className='metric'; const a=document.createElement('span'); a.textContent=label; const b=document.createElement('strong'); b.textContent=value; box.append(a,b); return box; }

function svgElement(name, attrs={}) { const element=document.createElementNS(svgNS,name); for(const [key,value] of Object.entries(attrs)) element.setAttribute(key,String(value)); return element; }
function shortNumber(value, money=false) { const absolute=Math.abs(value), sign=value<0?'−':''; const scaled=absolute>=1000000?`${(absolute/1000000).toFixed(absolute>=10000000?0:1)}m`:absolute>=1000?`${(absolute/1000).toFixed(absolute>=10000?0:1)}k`:String(Math.round(absolute)); return `${sign}${money?'$':''}${scaled}`; }
function annualize(base, risk) {
  const years=[...new Set(base.map(row=>row.year))];
  return years.map(year=>{
    const group=base.filter(row=>row.year===year), stress=risk.filter(row=>row.year===year), last=group.at(-1), lastRisk=stress.at(-1);
    const sum=(items,key)=>items.reduce((total,row)=>total+row[key],0);
    return {label:String(year),baseRevenue:sum(group,'revenue_usd'),riskRevenue:sum(stress,'stress_revenue_usd'),baseExpense:sum(group,'expense_usd'),riskExpense:sum(stress,'stress_expense_usd'),baseResult:sum(group,'operating_result_usd'),riskResult:sum(stress,'stress_result_usd'),team:last.headcount,capacity:last.headcount+lastRisk.standby_fte,customers:last.paying_firms+last.paying_companies,riskCustomers:lastRisk.stress_firms+lastRisk.stress_companies,buffer:Math.max(...stress.map(row=>row.cash_buffer_target_usd)),starter:150000};
  });
}
function monthlyize(base,risk) { return base.map((row,i)=>{const stress=risk[i];return {label:row.month,baseRevenue:row.revenue_usd,riskRevenue:stress.stress_revenue_usd,baseExpense:row.expense_usd,riskExpense:stress.stress_expense_usd,baseResult:row.operating_result_usd,riskResult:stress.stress_result_usd,team:row.headcount,capacity:row.headcount+stress.standby_fte,customers:row.paying_firms+row.paying_companies,riskCustomers:stress.stress_firms+stress.stress_companies,buffer:stress.cash_buffer_target_usd,starter:150000};}); }
function lineChart(title,description,data,series,money=false) {
  const card=document.createElement('article');card.className='chart-card';
  const heading=document.createElement('div');heading.className='chart-heading';const h=document.createElement('h3');h.textContent=title;const p=document.createElement('p');p.textContent=description;heading.append(h,p);card.append(heading);
  const values=series.flatMap(item=>data.map(row=>row[item.key]));let low=Math.min(...values,0),high=Math.max(...values,0);if(low===high)high=low+1;const gap=(high-low)*.08;if(low<0)low-=gap;if(high>0)high+=gap;
  const width=640,height=260,left=68,right=20,top=18,bottom=42,plotW=width-left-right,plotH=height-top-bottom;
  const x=index=>left+(data.length===1?0:index/(data.length-1))*plotW;const y=value=>top+(high-value)/(high-low)*plotH;
  const svg=svgElement('svg',{width,height,viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':`${title}. ${series.map(item=>`${item.label} ends at ${money?usd(data.at(-1)[item.key]):Math.round(data.at(-1)[item.key])}`).join('; ')}.`});
  for(let i=0;i<=4;i++){const value=low+(high-low)*i,yy=y(value);svg.append(svgElement('line',{x1:left,y1:yy,x2:width-right,y2:yy,class:'grid-line'}));const label=svgElement('text',{x:left-9,y:yy+4,'text-anchor':'end',class:'axis-label'});label.textContent=shortNumber(value,money);svg.append(label);}
  if(low<0&&high>0)svg.append(svgElement('line',{x1:left,y1:y(0),x2:width-right,y2:y(0),class:'zero-line'}));
  const step=data.length>12?12:1;for(let i=0;i<data.length;i+=step){const label=svgElement('text',{x:x(i),y:height-14,'text-anchor':i?'middle':'start',class:'axis-label'});label.textContent=data[i].label.slice(0,7);svg.append(label);}if((data.length-1)%step!==0){const label=svgElement('text',{x:x(data.length-1),y:height-14,'text-anchor':'end',class:'axis-label'});label.textContent=data.at(-1).label.slice(0,7);svg.append(label);}
  for(const item of series){const path=svgElement('path',{d:data.map((row,i)=>`${i?'L':'M'} ${x(i).toFixed(2)} ${y(row[item.key]).toFixed(2)}`).join(' '),fill:'none',stroke:item.color,'stroke-width':3,'stroke-dasharray':item.dashed?'8 6':'','stroke-linejoin':'round','stroke-linecap':'round'});svg.append(path);for(let i=0;i<data.length;i++){const dot=svgElement('circle',{cx:x(i),cy:y(data[i][item.key]),r:data.length>12?2.4:4,fill:item.color});const tooltip=svgElement('title');tooltip.textContent=`${data[i].label} · ${item.label}: ${money?usd(data[i][item.key]):Math.round(data[i][item.key]).toLocaleString('en-US')}`;dot.append(tooltip);svg.append(dot);}}
  card.append(svg);const legend=document.createElement('div');legend.className='chart-legend';for(const item of series){const span=document.createElement('span');span.style.setProperty('--series-color',item.color);span.className=item.dashed?'dashed':'';span.textContent=`${item.label} · ${money?usd(data.at(-1)[item.key]):Math.round(data.at(-1)[item.key]).toLocaleString('en-US')}`;legend.append(span);}card.append(legend);return card;
}
function drawCharts(base,risk,period){const data=period==='annual'?annualize(base,risk):monthlyize(base,risk);const blue='#076e93',red='#c54b45',navy='#122c4c',gold='#a86d18';const plots=[
  ['Revenue','Receipts in the selected period',[{key:'baseRevenue',label:'Base',color:blue},{key:'riskRevenue',label:'Risk case',color:red,dashed:true}],true],
  ['Expenses','Includes modeled crisis response and standby retainers in the risk case',[{key:'baseExpense',label:'Base',color:navy},{key:'riskExpense',label:'Risk case',color:red,dashed:true}],true],
  ['Operating result','Revenue less expenses; below zero is a loss',[{key:'baseResult',label:'Base',color:blue},{key:'riskResult',label:'Risk case',color:red,dashed:true}],true],
  ['Team and standby capacity','Active team vs active team plus reserved on-call capacity',[{key:'team',label:'Active team',color:navy},{key:'capacity',label:'With standby',color:gold,dashed:true}],false],
  ['Paying customers','Firms and companies combined, at period end',[{key:'customers',label:'Base',color:blue},{key:'riskCustomers',label:'Risk case',color:red,dashed:true}],false],
  ['Cash buffer target','Three forward risk-case expense months, with a $150k floor',[{key:'buffer',label:'Target',color:gold},{key:'starter',label:'Starter reserve',color:navy,dashed:true}],true]
];chartGrid.replaceChildren(...plots.map(([title,description,series,money])=>lineChart(title,description,data,series,money)));document.getElementById('chart-period-note').textContent=period==='annual'?'Flows are annual sums; people and customers are year-end counts; cash buffer is each year’s peak target.':'Flows are monthly totals; people and customers are month-end counts; cash buffer covers the current and next two risk-case months.';}

Promise.all(['planning/monthly-roadmap.json','planning/risk-scenario.json'].map(url=>fetch(url).then(response=>{if(!response.ok)throw new Error(`Could not load ${url}`);return response.json();}))).then(([rows,risk]) => {
  if(rows.length!==risk.length||rows.some((row,i)=>row.month!==risk[i].month))throw new Error('Planning data does not align');
  document.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-period]').forEach(option=>option.setAttribute('aria-pressed',String(option===button)));drawCharts(rows,risk,button.dataset.period);}));drawCharts(rows,risk,'monthly');
  const annualTable=document.createElement('table');annualTable.className='annual-risk-table';
  const caption=document.createElement('caption');caption.textContent='Annual base and risk-case totals · USD';annualTable.append(caption);
  const annualHead=document.createElement('thead'),headRow=document.createElement('tr');for(const label of ['Year','Base revenue','Risk revenue','Base expenses','Risk expenses','Base result','Risk result','Peak cash buffer','Active + standby team','Base / risk customers']){const th=document.createElement('th');th.scope='col';th.textContent=label;headRow.append(th);}annualHead.append(headRow);annualTable.append(annualHead);
  const annualBody=document.createElement('tbody');for(const item of annualize(rows,risk)){const tr=document.createElement('tr');for(const value of [item.label,usd(item.baseRevenue),usd(item.riskRevenue),usd(item.baseExpense),usd(item.riskExpense),usd(item.baseResult),usd(item.riskResult),usd(item.buffer),`${item.team} + ${item.capacity-item.team}`,`${item.customers} / ${item.riskCustomers}`])cell(tr,value);annualBody.append(tr);}annualTable.append(annualBody);
  const annualWrap=document.createElement('div');annualWrap.className='annual-risk-wrap';annualWrap.append(annualTable);chartGrid.after(annualWrap);
  const expenseNote=document.createElement('p');expenseNote.className='risk-explainer';expenseNote.textContent='Risk-case expenses can be below the base plan when delayed lab sales also defer royalties and data-review costs. Crisis response and standby retainers are added on top of those adjusted costs.';annualWrap.after(expenseNote);
  const monthHead=document.querySelector('#monthly-table thead tr');for(const label of ['Risk revenue','Risk expenses','Risk result','Standby FTE','Cash buffer target']){const th=document.createElement('th');th.scope='col';th.textContent=label;monthHead.append(th);}
  const events=risk.filter(row=>row.crisis_cost_usd);for(const item of events){const p=document.createElement('p');const strong=document.createElement('strong');strong.textContent=item.month;const name=document.createElement('span');name.textContent=item.crisis_event;const cost=document.createElement('b');cost.textContent=usd(item.crisis_cost_usd);p.append(strong,name,cost);crisisList.append(p);}
  const years=[...new Set(rows.map(row=>row.year))];
  function show(year) {
    const selection=rows.filter(row=>row.year===year), last=selection.at(-1);
    tabs.querySelectorAll('button').forEach(button=>{ const active=Number(button.dataset.year)===year; button.setAttribute('aria-selected',String(active)); button.tabIndex=active?0:-1; });
    summary.replaceChildren(
      metric('Year-end team',String(last.headcount)),
      metric('Year-end customers',`${last.paying_firms} firms · ${last.paying_companies} companies`),
      metric('Lab license contracts',String(selection.reduce((n,row)=>n+row.lab_license_contracts,0))),
      metric('Revenue target',usd(selection.reduce((n,row)=>n+row.revenue_usd,0))),
      metric('Expense target',usd(selection.reduce((n,row)=>n+row.expense_usd,0)))
    );
    const fragment=document.createDocumentFragment();
    selection.forEach(item=>{const tr=document.createElement('tr'),stress=risk.find(row=>row.month===item.month);
      cell(tr,item.month);cell(tr,item.technical);cell(tr,item.management);cell(tr,item.lab_work);
      cell(tr,String(item.headcount));cell(tr,`${item.paying_firms} / ${item.paying_companies}`);
      cell(tr,`${item.lab_license_contracts} · ${usd(item.lab_sales_usd)}`);
      cell(tr,usd(item.revenue_usd));cell(tr,usd(item.expense_usd));
      cell(tr,usd(stress.stress_revenue_usd));cell(tr,usd(stress.stress_expense_usd));cell(tr,usd(stress.stress_result_usd));cell(tr,String(stress.standby_fte));cell(tr,usd(stress.cash_buffer_target_usd));fragment.append(tr);
    });
    body.replaceChildren(fragment);
  }
  years.forEach(year=>{const button=document.createElement('button');button.type='button';button.role='tab';button.dataset.year=year;button.textContent=`Year ${year-2026} · ${year}`;button.addEventListener('click',()=>show(year));tabs.append(button);});
  show(2027);
}).catch(error=>{summary.textContent=error.message;chartGrid.textContent=error.message;});
