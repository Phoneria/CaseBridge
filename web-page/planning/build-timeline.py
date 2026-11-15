"""Expand the published annual planning scenario into an illustrative monthly roadmap."""
from __future__ import annotations

import csv
import json
from pathlib import Path

root = Path(__file__).resolve().parent
annual_data = json.loads((root / 'business-plan.json').read_text(encoding='utf-8'))
annual = annual_data['forecast']

year_one = [
    ('Interview the three POC firms; map their intake flow.', 'Set a weekly founder and legal review cadence.', 'Define consent and data ownership checklist.'),
    ('Prototype first-meeting prompts and missing-fact review.', 'Agree pilot success measures with each firm.', 'Approach Turkish legal NLP research groups.'),
    ('Add case timeline and document intake.', 'Start paid conversion conversations; track activation.', 'Design synthetic scenario and annotation specification.'),
    ('Test evidence extraction and source references.', 'Publish a pilot feedback and issue log.', 'Recruit an independent legal evaluation partner.'),
    ('Improve lawyer approval steps and audit trail.', 'Train first customer-support owner.', 'Build rights-cleared synthetic sample set.'),
    ('Launch controlled hearing rehearsal beta.', 'Review retention, support burden and pricing.', 'Pilot annotation quality checks with a Turkish lab.'),
    ('Add permissions, deletion controls and model evaluation.', 'Document security procurement requirements.', 'Prepare anonymization and privilege review process.'),
    ('Measure answer quality and false-confidence cases.', 'Start repeatable firm onboarding playbook.', 'Run blinded legal review of evaluation examples.'),
    ('Harden hosting, backups and incident workflow.', 'Build channel and bar-association outreach.', 'Package first eligible evaluation catalogue.'),
    ('Test limited licensing delivery and buyer reporting.', 'Seek one conditional paid lab-data license.', 'Target first $25k research/evaluation license.'),
    ('Reduce onboarding time; refine usage limits.', 'Review unit economics and seed materials.', 'Audit lab royalty, contract scope and usage rights.'),
    ('Close product and compliance gaps from pilots.', 'Target 100 paying firms; decide 2028 US entry gate.', 'Renew only assets with documented transfer rights.'),
]

year_two = [
    ('Localize intake and document workflows for US pilots.', 'Retain Turkish accounts; shortlist US counsel.', 'Scope US legal AI evaluation buyer needs.'),
    ('Add jurisdiction labels and source provenance.', 'Start US customer discovery with firms and trade teams.', 'Draft US data-use and cross-border transfer templates.'),
    ('Run independent security and privacy gap review.', 'Define US pilot cohort and company pricing tests.', 'Qualify multilingual legal NLP partners.'),
    ('Ship gated US pilot with lawyer review.', 'Target first US company pilot and local advisor.', 'Model first $100k lab license, conditional on rights.'),
    ('Measure pilot accuracy, latency and review time.', 'Decide whether to establish a US office.', 'Build benchmark refresh and buyer acceptance criteria.'),
    ('Integrate company trade-dispute workflows.', 'Create US support and sales handoff playbook.', 'Evaluate US academic law-and-AI collaboration.'),
    ('Strengthen enterprise access controls and logs.', 'Run procurement and security reviews with pilots.', 'Expand multilingual evaluation coverage.'),
    ('Release US-ready reporting and evidence export.', 'Target second US lab-data license.', 'Model second $100k license after legal approval.'),
    ('Test partner API and dataset provenance records.', 'Track company retention and conversion.', 'Review international rights and deletion commitments.'),
    ('Improve model monitoring across jurisdictions.', 'Hire local commercial support only after pilot gate.', 'Prepare third evaluation catalogue release.'),
    ('Validate support cost at 200-firm scale.', 'Confirm US entity/office decision and 2029 budget.', 'Negotiate renewal and independent quality review.'),
    ('Complete readiness review for wider rollout.', 'Target 200 firms and 10 companies at year-end.', 'Model third $100k license; audit all buyer terms.'),
]

global_quarters = {
    2029: [
        ('Add multilingual retrieval and jurisdiction gating.', 'Select two cross-border partner markets.', 'Compare legal NLP and evaluation labs by language.'),
        ('Build enterprise identity and regional hosting options.', 'Pilot cross-border trade-dispute teams.', 'License only reviewed jurisdiction-specific datasets.'),
        ('Measure repeat use and source quality by market.', 'Set partner onboarding and localized support.', 'Expand academic law-and-AI evaluation partnerships.'),
        ('Publish per-market quality scorecards.', 'Target 350 firms, 100 companies and 10 buyer contracts.', 'Reassess license renewals, royalties and rights.'),
    ],
    2030: [
        ('Extend language coverage through tested modules.', 'Open new markets only after local legal review.', 'Add multilingual annotation and benchmark partners.'),
        ('Improve regional deployment and observability.', 'Scale enterprise procurement and customer success.', 'License refreshed, rights-cleared evaluation sets.'),
        ('Automate provenance and quality reporting.', 'Measure retention and margin by geography.', 'Diversify approved lab buyers and research use cases.'),
        ('Audit model drift and cross-border controls.', 'Target 600 firms, 350 companies and 22 buyer contracts.', 'Review royalty commitments and data catalog quality.'),
    ],
    2031: [
        ('Standardize product localization and regional controls.', 'Prioritize proven regional channels.', 'Expand independent legal evaluation network.'),
        ('Scale enterprise integrations and reliability.', 'Operate localized support with accountable owners.', 'Refresh benchmark and synthetic data catalogues.'),
        ('Compare quality and usage across jurisdictions.', 'Invest in retention before new market launches.', 'Diversify buyers; verify recurring license demand.'),
        ('Run global security, privacy and quality reviews.', 'Target 1,000 firms, 1,000 companies and 40 buyer contracts.', 'Revalidate data rights before every renewal.'),
    ],
}

firm_counts = {2027: [5,12,20,28,36,44,52,60,68,80,95,100],
               2028: [100,109,118,127,136,145,155,164,173,182,191,200]}
company_counts = {2027: [0]*12,
                  2028: [0,1,2,3,4,4,5,6,7,8,10,10]}
headcounts = {2027: [4,4,5,5,6,6,7,7,8,8,9,10],
              2028: [10,11,11,12,12,13,13,14,14,15,16,17]}

def ramp(start: int, end: int, annual_average: float) -> list[int]:
    values = [round(start + (end-start)*i/11) for i in range(12)]
    values[0], values[-1] = start, end
    delta = round(annual_average*12) - sum(values)
    while delta:
        for i in range(1, 11):
            step = 1 if delta > 0 else -1
            candidate = values[i] + step
            if values[i-1] <= candidate <= values[i+1]:
                values[i] = candidate
                delta -= step
                if delta == 0:
                    break
    return values

prev_firms, prev_companies, prev_staff = 200, 10, 17
for item, staff_end in zip(annual[2:], [30,48,75]):
    year = item['calendar']
    firm_counts[year] = ramp(prev_firms, item['firms'], item['avgFirms'])
    company_counts[year] = ramp(prev_companies, item['companies'], item['avgCompanies'])
    headcounts[year] = ramp(prev_staff, staff_end, (prev_staff+staff_end)/2)
    prev_firms, prev_companies, prev_staff = item['firms'], item['companies'], staff_end

def allocate(total: int, weights: list[int]) -> list[int]:
    base = [total*w//sum(weights) for w in weights]
    for i in sorted(range(12), key=lambda i: (total*weights[i])%sum(weights), reverse=True)[:total-sum(base)]:
        base[i] += 1
    return base

rows = []
for item in annual:
    year = item['calendar']
    firms, companies, staff = firm_counts[year], company_counts[year], headcounts[year]
    assert sum(firms) == item['avgFirms']*12
    assert sum(companies) == item['avgCompanies']*12
    licenses = [0]*12
    if year == 2027:
        licenses[9] = 1
    elif year == 2028:
        for i in [3,7,11]: licenses[i] = 1
    else:
        licenses = allocate(item['buyers'], [1]*12)
    transactions = allocate(item['transactions'], [max(1, f+c*3) for f,c in zip(firms,companies)])
    eng = allocate(item['engineering'], staff)
    sales = allocate(item['sales'], staff)
    admin = allocate(item['legalAdmin'], [1]*12)
    for i in range(12):
        subs = firms[i]*annual_data['firmMonthly'] + companies[i]*annual_data['companyMonthly']
        lab_sales = licenses[i]*item['licenseFee']
        commission = transactions[i]*item['transactionValue']*item['commissionRate']
        revenue = subs+lab_sales+commission
        expense = eng[i]+sales[i]+admin[i]+subs*.9+lab_sales*.55+commission*.2
        if year == 2027:
            technical, management, lab_work = year_one[i]
        elif year == 2028:
            technical, management, lab_work = year_two[i]
        else:
            technical, management, lab_work = global_quarters[year][i//3]
        rows.append({
            'month': f'{year}-{i+1:02d}', 'year': year, 'phase': 'Turkey validation' if year == 2027 else 'US entry' if year == 2028 else 'Selective global scale',
            'technical': technical, 'management': management, 'lab_work': lab_work,
            'headcount': staff[i], 'paying_firms': firms[i], 'paying_companies': companies[i],
            'lab_license_contracts': licenses[i], 'license_fee_usd': item['licenseFee'], 'lab_sales_usd': lab_sales,
            'marketplace_transactions': transactions[i], 'engineering_usd': eng[i], 'sales_usd': sales[i], 'legal_admin_usd': admin[i],
            'subscription_usd': subs, 'commission_usd': commission,
            'revenue_usd': revenue, 'expense_usd': expense, 'operating_result_usd': revenue-expense,
        })
    year_rows = [r for r in rows if r['year'] == year]
    assert round(sum(r['revenue_usd'] for r in year_rows)) == item['revenue']
    assert round(sum(r['expense_usd'] for r in year_rows)) == item['costs']
    assert sum(r['lab_license_contracts'] for r in year_rows) == item['buyers']

keys = list(rows[0])
with (root/'monthly-roadmap.csv').open('w', encoding='utf-8-sig', newline='') as file:
    writer = csv.DictWriter(file, fieldnames=keys)
    writer.writeheader(); writer.writerows(rows)
(root/'monthly-roadmap.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
print('months', len(rows), 'annual totals reconciled')
