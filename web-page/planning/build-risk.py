"""Build an illustrative downside case from the monthly base forecast."""
import csv
import json
from pathlib import Path

base = Path(__file__).resolve().parent
rows = json.loads((base / 'monthly-roadmap.json').read_text(encoding='utf-8'))
standby = {2027: 1, 2028: 2, 2029: 3, 2030: 4, 2031: 6}
events = {
    '2027-07': ('Service outage and recovery', 20000),
    '2028-05': ('US legal launch delay', 50000),
    '2029-06': ('Data remediation', 100000),
    '2030-07': ('Infrastructure incident', 250000),
    '2031-09': ('Multimarket compliance response', 500000),
}
result = []
for i, row in enumerate(rows):
    firms = round(row['paying_firms'] * .8)
    companies = round(row['paying_companies'] * .8)
    subscriptions = firms * 100 + companies * 500
    commissions = row['commission_usd'] * .75
    delayed_labs = rows[i-3]['lab_sales_usd'] if i >= 3 else 0
    revenue = subscriptions + commissions + delayed_labs
    fixed = row['engineering_usd'] + row['sales_usd'] + row['legal_admin_usd']
    variable = subscriptions * .9 + delayed_labs * .55 + commissions * .2
    event, crisis = events.get(row['month'], ('', 0))
    reserve_staff = standby[row['year']]
    retainer = reserve_staff * 1500
    expenses = round(fixed + variable + retainer + crisis, 2)
    result.append({
        'month': row['month'], 'year': row['year'],
        'stress_firms': firms, 'stress_companies': companies,
        'stress_lab_sales_usd': delayed_labs,
        'stress_revenue_usd': round(revenue, 2),
        'stress_expense_usd': expenses,
        'stress_result_usd': round(revenue - expenses, 2),
        'standby_fte': reserve_staff,
        'standby_retainer_usd': retainer,
        'crisis_event': event, 'crisis_cost_usd': crisis,
    })

# Three forward months of downside expenses, including the current month.
for i, row in enumerate(result):
    forward = [item['stress_expense_usd'] for item in result[i:i+3]]
    forward.extend([result[-1]['stress_expense_usd']] * (3 - len(forward)))
    row['cash_buffer_target_usd'] = max(150000, round(sum(forward), 2))

(base / 'risk-scenario.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
with (base / 'risk-scenario.csv').open('w', newline='', encoding='utf-8-sig') as handle:
    writer = csv.DictWriter(handle, result[0].keys())
    writer.writeheader()
    writer.writerows(result)
print('Wrote 60-month illustrative downside case')
