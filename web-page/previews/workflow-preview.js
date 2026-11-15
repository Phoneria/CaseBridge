const card = (label, title, body, badge = '', accent = false) => `<section class="workflow-card${accent ? ' is-accent' : ''}"><div class="workflow-card-head"><div><span>${label}</span><h3>${title}</h3></div>${badge ? `<b class="workflow-pill">${badge}</b>` : ''}</div>${body}</section>`;
const row = (lead, title, detail, state = '', warning = false) => `<div class="workflow-row${warning ? ' is-warning' : ''}"><span>${lead}</span><div><strong>${title}</strong><small>${detail}</small></div><em>${state}</em></div>`;
const note = text => `<p class="workflow-note">${text}</p>`;
const field = (label, value) => `<div><small>${label}</small><strong>${value}</strong></div>`;

const views = {
  'case-map': {
    title: 'Case Map', subtitle: 'Follow each event back to a person, file and open question.', status: 'Timeline ready',
    stats: [['Case file','CB-2027-014'],['Events','5'],['Documents','14'],['Open questions','1']],
    content: card('CASE TIMELINE','Meridian / Atlas · Commercial debt',
      row('05 FEB','Agreement signed','contract.pdf · Meridian and Atlas','FILE')+
      row('18 MAR','Payment transferred','bank-record.pdf · claimant','FILE')+
      row('02 APR','Notice delivered?','Delivery date is disputed','CHECK',true))+
      card('SELECTED EVENT','Notice delivery needs verification',
        `<div class="workflow-metrics">${field('Related person','Atlas contact')}${field('Linked files','2 documents')}${field('Reported date','2 Apr 2027')}${field('Evidence status','Unconfirmed')}</div>`+
        note('Next step: compare the courier record with the date stated by the client.'),'Lawyer review',true)
  },
  'evidence-gap': {
    title: 'Evidence Gaps', subtitle: 'Turn missing support into precise client requests.', status: '2 gaps identified',
    stats: [['Case file','CB-2027-014'],['Files indexed','14'],['Evidence gaps','2'],['Client requests','2']],
    content: card('DOCUMENT REVIEW','Uploaded case bundle',
      `<div class="workflow-zip"><b>ZIP</b><div><strong>case_documents.zip</strong><small>14 files · 28.4 MB · Indexed</small></div><em>✓</em></div>`+
      row('FOUND','Payment record','bank-record.pdf · supports transfer','READY')+
      row('MISSING','Signed agreement','Not present in uploaded ZIP','REQUEST',true))+
      card('FOLLOW-UP','What to request next',
        row('01','Signed agreement','Ask the client for the executed copy','OPEN',true)+
        row('02','Delivery confirmation','Clarify when notice reached Atlas','OPEN',true)+
        note('Each request stays linked to the claim it is meant to support.'),'2 open',true)
  },
  'case-strength': {
    title: 'Case Strength', subtitle: 'Review the assessment and the steps that may strengthen the file.', status: 'Lawyer review',
    stats: [['Case file','CB-2027-014'],['Documents','14'],['Example estimate','62%'],['Open tasks','2']],
    content: card('ILLUSTRATIVE ASSESSMENT','Estimated chance of success',
      `<div class="workflow-score"><strong>62%</strong><span>Based on the uploaded case file<br>and selected case details</span></div><div class="workflow-bar"></div>`+
      note('This figure is fictional and is not a validated prediction or a guarantee.'))+
      card('SUGGESTED IMPROVEMENTS','Two next steps',
        row('01','Verify notice delivery date','Close the timeline evidence gap','OPEN')+
        row('02','Add the signed agreement','Support the central claim','OPEN')+
        note('Reassess only after a lawyer checks the new evidence.'),'2 open',true)
  },
  opposition: {
    title: 'Opposing View', subtitle: 'Put your argument and a possible rebuttal side by side.', status: 'Rehearsal ready',
    stats: [['Case file','CB-2027-014'],['Your position','Claimant'],['Possible rebuttal','1'],['Practice rounds','1']],
    content: card('TWO PERSPECTIVES','How each side could frame the payment',
      `<div class="workflow-duo"><div><span>YOUR ARGUMENT</span><strong>The transfer was a loan.</strong><small>Bank record and repayment message</small></div><div><span>POSSIBLE REBUTTAL</span><strong>It funded a joint venture.</strong><small>Draft business plan and prior discussion</small></div></div>`+
      note('A rehearsal perspective, not a prediction of the opposing party’s actual response.'))+
      card('PREPARATION','Questions for counsel',
        row('01','What was agreed in writing?','Check the signed terms, if available','REVIEW')+
        row('02','What did later messages say?','Compare wording with bank records','REVIEW')+
        note('Choose which counterarguments are worth testing in a hearing practice session.'),'Lawyer review',true)
  },
  deadlines: {
    title: 'Deadlines', subtitle: 'Keep proposed dates, owners and source checks together.', status: 'Date review needed',
    stats: [['Case file','CB-2027-014'],['Upcoming dates','2'],['Assigned tasks','3'],['Source checks','1']],
    content: card('CASE CALENDAR','Next proposed deadline',
      `<div class="workflow-large-date"><strong>14</strong><span><b>June 2027 · response filing</b><small>Assigned to A. Büyükdağ</small></span></div>`+
      row('11 JUN','Draft response','Owner: legal team','IN PROGRESS')+
      row('14 JUN','Response filing','Proposed date · lawyer must confirm','CHECK',true))+
      card('DEADLINE BASIS','Verify before relying on this date',
        `<div class="workflow-metrics">${field('Service date','Needs confirmation')}${field('Jurisdiction','Istanbul')}${field('Task owner','A. Büyükdağ')}${field('Calendar status','Proposed')}</div>`+
        note('The application should never treat an unverified deadline calculation as final.'),'Source check',true)
  },
  'legal-sources': {
    title: 'Legal Sources', subtitle: 'See the selected jurisdiction and the source that needs review.', status: 'Coverage review',
    stats: [['Country','Turkey'],['Jurisdiction','Istanbul'],['Case type','Commercial debt'],['Source checks','1']],
    content: card('CASE SETTINGS','Rules depend on context',
      `<div class="workflow-metrics">${field('Country','Turkey')}${field('Jurisdiction','Istanbul')}${field('Case type','Commercial debt')}${field('Our side','Claimant')}</div>`+
      note('A change of country, state or case type changes what must be checked.'))+
      card('SOURCE REVIEW','Confirm the current official rule',
        `<div class="workflow-source"><span>PRIMARY SOURCE · REVIEW REQUIRED</span><strong>Commercial procedure</strong><p>Open the official text, confirm the version and decide whether it applies to this case.</p><small>Source coverage and update timing must be validated.</small></div>`+
        note('Do not rely on a paraphrase without checking the linked primary source.'),'Lawyer review',true)
  },
  specialist: {
    title: 'Expert Handoff', subtitle: 'Prepare a focused case brief before involving specialist counsel.', status: 'Approval pending',
    stats: [['Case file','CB-2027-014'],['Specialist issues','1'],['Files selected','3'],['Files shared','0']],
    content: card('ISSUE IDENTIFIED','Cross-border payment terms',
      `<div class="workflow-source"><span>POTENTIAL SPECIALIST QUESTION</span><strong>Which law governs the payment terms?</strong><p>Transaction history and contract clauses may need advice from counsel with cross-border experience.</p><small>Specialist availability has not been confirmed.</small></div>`+
      note('No case file is shared automatically.'))+
      card('DRAFT BRIEF','Prepared for the lawyer',
        row('01','Matter summary','Claim, dispute and relevant jurisdictions','DRAFT')+
        row('02','Selected documents','3 proposed attachments','REVIEW')+
        row('03','Introduction','Awaiting lawyer and client permissions','PENDING',true),'Lawyer control',true)
  },
  'audit-trail': {
    title: 'Audit Trail', subtitle: 'Trace a suggestion from source file to lawyer decision.', status: 'Review recorded',
    stats: [['Case file','CB-2027-014'],['Sources','1'],['Suggestions','1'],['Review steps','3']],
    content: card('DECISION PATH','How this follow-up appeared',
      row('SOURCE','bank-record.pdf · p. 2','Uploaded in case bundle','FILE')+
      row('AI','Confirm payment purpose','Suggested from the source text','DRAFT')+
      row('LAWYER','Client follow-up approved','Reviewed before action','REVIEWED'))+
      card('VERSION HISTORY','A clear record of changes',
        `<div class="workflow-metrics">${field('Source version','Original upload')}${field('Suggestion status','Reviewed')}${field('Case owner','Legal team')}${field('Next check','Client response')}</div>`+
        note('The record should show both the evidence used and the human decision made.'),'Traceable',true)
  }
};

const requested = new URLSearchParams(location.search).get('view') || 'case-map';
const view = views[requested] || views['case-map'];
document.title = `CaseBridge ${view.title} preview`;
document.getElementById('workflow-top-title').textContent = view.title;
document.getElementById('workflow-title').textContent = view.title;
document.getElementById('workflow-subtitle').textContent = view.subtitle;
document.getElementById('workflow-status').textContent = view.status;
document.getElementById('workflow-stats').innerHTML = view.stats.map(([label,value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('');
document.getElementById('workflow-content').innerHTML = view.content;
