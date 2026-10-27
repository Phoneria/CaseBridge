import fs from 'node:fs/promises';
import path from 'node:path';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

const base = path.resolve('web-page');
const rows = JSON.parse(await fs.readFile(path.join(base, 'planning/monthly-roadmap.json'), 'utf8'));
const riskRows = JSON.parse(await fs.readFile(path.join(base, 'planning/risk-scenario.json'), 'utf8'));
const annual = JSON.parse(await fs.readFile(path.join(base, 'planning/business-plan.json'), 'utf8')).forecast;
const wb = Workbook.create();
const output = wb.worksheets.add('Monthly roadmap');
const model = wb.worksheets.add('Model');
const riskSheet = wb.worksheets.add('Risk case');
output.showGridLines = false;
model.showGridLines = false;
riskSheet.showGridLines = false;
output.tabColor = '#076e93';
model.tabColor = '#d29b45';
riskSheet.tabColor = '#c54b45';

riskSheet.getRange('A1:O1').values = [['Month','Risk firms','Risk companies','Delayed lab receipts','Risk revenue','Base expenses','Standby FTE','Standby retainer','Crisis response','Risk expenses','Risk result','Cash buffer target','Crisis event','Base revenue','Base result']];
riskSheet.getRange('A2:O61').values = riskRows.map((row,i)=>[
  row.month,row.stress_firms,row.stress_companies,row.stress_lab_sales_usd,row.stress_revenue_usd,
  rows[i].expense_usd,row.standby_fte,row.standby_retainer_usd,row.crisis_cost_usd,
  row.stress_expense_usd,row.stress_result_usd,row.cash_buffer_target_usd,row.crisis_event,
  rows[i].revenue_usd,rows[i].operating_result_usd
]);
riskSheet.getRange('A64:H64').values = [['Year','Base revenue','Risk revenue','Base expenses','Risk expenses','Base result','Risk result','Peak buffer']];
for(let i=0;i<5;i++) { const r=65+i,start=2+i*12,end=start+11;riskSheet.getRange(`A${r}`).values=[[annual[i].calendar]];riskSheet.getRange(`B${r}:H${r}`).formulas=[[
  `=SUM(N${start}:N${end})`,`=SUM(E${start}:E${end})`,`=SUM(F${start}:F${end})`,
  `=SUM(J${start}:J${end})`,`=SUM(O${start}:O${end})`,`=SUM(K${start}:K${end})`,`=MAX(L${start}:L${end})`
]];}
riskSheet.getRange('A71:B71').values = [['Assumption','Value']];
riskSheet.getRange('A72:B77').values = [
  ['Paying customer shortfall','20% per month'],['Marketplace commission shortfall','25% per month'],
  ['Lab receipt delay','3 months'],['On-call retainer','$1,500 / reserved FTE-month'],
  ['Cash reserve floor','$150,000'],['Buffer rule','Greater of floor or current plus next 2 risk expense months; last expense extrapolated past 2031']
];

output.getRange('A1').values = [['CaseBridge | 2027–2031 monthly roadmap']];
output.getRange('A2').values = [['Illustrative targets, not actual results or signed lab contracts. USD before tax and financing.']];
output.getRange('A4:E4').values = [['Year', 'Revenue', 'Expenses', 'Lab sales', 'Year-end team']];
for (let i=0;i<5;i++) {
  const r=5+i, start=11+i*12, end=start+11;
  output.getRange(`A${r}:E${r}`).values = [[annual[i].calendar,null,null,null,null]];
  output.getRange(`B${r}:E${r}`).formulas = [[
    `=SUM(K${start}:K${end})`, `=SUM(L${start}:L${end})`,
    `=SUM(J${start}:J${end})`, `=F${end}`
  ]];
}
output.getRange('A10:M10').values = [[
  'Month','Phase','Product & technology','Management & market','Labs & licensing',
  'Team','Firms','Companies','License contracts','Lab sales','Revenue','Expenses','Result'
]];
output.getRange('A11:M70').values = rows.map(row => [
  row.month,row.phase,row.technical,row.management,row.lab_work,
  row.headcount,row.paying_firms,row.paying_companies,row.lab_license_contracts,
  null,null,null,null
]);
for (let i=0;i<60;i++) {
  const r=i+11, m=i+2;
  output.getRange(`J${r}:M${r}`).formulas = [[`=Model!M${m}`,`=Model!O${m}`,`=Model!U${m}`,`=Model!V${m}`]];
}

model.getRange('A1:V1').values = [[
  'Month','Team','Firms','Companies','License contracts','License fee','Marketplace orders','Order value',
  'Engineering','Sales','Legal / admin','Subscriptions','Lab sales','Commissions','Revenue',
  'Service delivery','Lab share','Data review','Marketplace ops','Fixed costs','Expenses','Result'
]];
model.getRange('A2:K61').values = rows.map(row => [
  row.month,row.headcount,row.paying_firms,row.paying_companies,row.lab_license_contracts,
  row.license_fee_usd,row.marketplace_transactions,5000,
  row.engineering_usd,row.sales_usd,row.legal_admin_usd
]);
model.getRange('L2:V61').formulas = rows.map((_,i) => {
  const r=i+2;
  return [`=C${r}*100+D${r}*500`,`=E${r}*F${r}`,`=G${r}*H${r}*10%`,
    `=SUM(L${r}:N${r})`,`=L${r}*90%`,`=M${r}*40%`,`=M${r}*15%`,
    `=N${r}*20%`,`=SUM(I${r}:K${r})`,`=SUM(P${r}:T${r})`,`=O${r}-U${r}`];
});
model.getRange('A64:D64').values = [['Annual check','Revenue target','Expense target','Revenue difference']];
for (let i=0;i<5;i++) {
  const r=65+i, out=5+i;
  model.getRange(`A${r}:C${r}`).values = [[annual[i].calendar,annual[i].revenue,annual[i].costs]];
  model.getRange(`D${r}`).formulas = [[`='Monthly roadmap'!B${out}-B${r}`]];
}
model.getRange('F64:G64').values = [['Monthly assumptions','Source / meaning']];
model.getRange('F65:G70').values = [
  ['Firm price','$100 per active firm-month'],['Company price','$500 per active company-month'],
  ['Marketplace fee','10% of modeled $5,000 order'],['Service delivery','90% of subscriptions'],
  ['Lab share + data review','40% + 15% of license receipts'],['Marketplace operations','20% of commission revenue']
];

const navy='#122c4c', teal='#076e93';
output.getRange('A1:M70').format.font = {name:'Arial',size:11,color:navy};
model.getRange('A1:V70').format.font = {name:'Arial',size:11,color:navy};
output.getRange('A1:M1').format={fill:navy,font:{name:'Arial',size:18,bold:true,color:'#ffffff'}};
output.getRange('A2:M2').format={fill:'#fff4dc',font:{name:'Arial',size:11,color:navy}};
output.getRange('A4:E4').format={fill:teal,font:{name:'Arial',size:11,bold:true,color:'#ffffff'}};
output.getRange('A10:M10').format={fill:navy,font:{name:'Arial',size:11,bold:true,color:'#ffffff'},wrapText:true};
model.getRange('A1:V1').format={fill:navy,font:{name:'Arial',size:10,bold:true,color:'#ffffff'},wrapText:true};
model.getRange('A64:D64').format={fill:teal,font:{name:'Arial',size:11,bold:true,color:'#ffffff'}};
model.getRange('F64:G64').format={fill:teal,font:{name:'Arial',size:11,bold:true,color:'#ffffff'}};
output.getRange('A11:M70').format.rowHeight=63;
output.getRange('C11:E70').format.wrapText=true;
output.getRange('A10:M10').format.rowHeight=36;
output.getRange('A:A').format.columnWidth=13;
output.getRange('B:B').format.columnWidth=22;
output.getRange('C:E').format.columnWidth=43;
output.getRange('F:I').format.columnWidth=15;
output.getRange('J:M').format.columnWidth=18;
output.getRange('B5:D9').format.numberFormat='$#,##0;[Red]($#,##0)';
output.getRange('J11:M70').format.numberFormat='$#,##0;[Red]($#,##0)';
model.getRange('A:A').format.columnWidth=13;
model.getRange('B:E').format.columnWidth=15;
model.getRange('F:V').format.columnWidth=19;
model.getRange('I2:V69').format.numberFormat='$#,##0;[Red]($#,##0)';
model.getRange('F2:F61').format.numberFormat='$#,##0';
model.getRange('G2:G61').format.numberFormat='0';
riskSheet.getRange('A1:O77').format.font={name:'Arial',size:11,color:navy};
riskSheet.getRange('A1:O1').format={fill:navy,font:{name:'Arial',size:10,bold:true,color:'#ffffff'},wrapText:true};
riskSheet.getRange('A64:H64').format={fill:'#c54b45',font:{name:'Arial',size:10,bold:true,color:'#ffffff'}};
riskSheet.getRange('A71:B71').format={fill:teal,font:{name:'Arial',size:10,bold:true,color:'#ffffff'}};
riskSheet.getRange('A:A').format.columnWidth=15;
riskSheet.getRange('B:L').format.columnWidth=19;
riskSheet.getRange('M:M').format.columnWidth=36;
riskSheet.getRange('N:O').format.columnWidth=19;
riskSheet.getRange('D2:F69').format.numberFormat='$#,##0;[Red]($#,##0)';
riskSheet.getRange('H2:L69').format.numberFormat='$#,##0;[Red]($#,##0)';
riskSheet.getRange('N2:O61').format.numberFormat='$#,##0;[Red]($#,##0)';
riskSheet.freezePanes.freezeRows(1);
output.freezePanes.freezeRows(10);
model.freezePanes.freezeRows(1);
wb.recalculate();
const checked = await wb.inspect({kind:'table',range:'Monthly roadmap!A4:E9',include:'values,formulas',tableMaxRows:6,tableMaxCols:5,maxChars:2000});
console.log(checked.ndjson);
const preview = await wb.render({sheetName:'Monthly roadmap',range:'A1:M12',scale:1,format:'png'});
await fs.writeFile(path.join(base,'planning/.monthly-roadmap-preview.png'),new Uint8Array(await preview.arrayBuffer()));
const file = await SpreadsheetFile.exportXlsx(wb);
await file.save(path.join(base,'planning/monthly-roadmap.xlsx'));
console.log('wrote monthly-roadmap.xlsx');
