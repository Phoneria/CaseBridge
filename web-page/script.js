const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#navigation');
function closeMenu() {
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Open menu');
  nav.classList.remove('is-open');
}
toggle.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  nav.classList.toggle('is-open', open);
});
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
    closeMenu(); toggle.focus();
  }
});
const tabs = [...document.querySelectorAll('[role="tab"]')];
function activateTab(tab) {
  tabs.forEach(item => {
    const active = item === tab;
    item.setAttribute('aria-selected', String(active));
    item.tabIndex = active ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
  });
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateTab(tab));
  tab.addEventListener('keydown', event => {
    let target;
    if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
    if (event.key === 'ArrowLeft') target = tabs[(index - 1 + tabs.length) % tabs.length];
    if (event.key === 'Home') target = tabs[0];
    if (event.key === 'End') target = tabs[tabs.length - 1];
    if (target) { event.preventDefault(); activateTab(target); target.focus(); }
  });
});
document.getElementById('year').textContent = new Date().getFullYear();

// Visual market-sizing segment explorer; figures remain illustrative planning inputs.
const samSegments = {
  turkey: {name:'Turkish law firms',amount:'$16.53m / year',steps:[['206,678','lawyers · TBB 2025'],['÷ 3','assumed lawyers / firm'],['× 20%','assumed target fit'],['× $1,200','annual firm subscription']],note:'Lawyer count is sourced. Firm size, target-fit share and pricing are assumptions; this is not a measured number of eligible firms.'},
  us: {name:'US law firms',amount:'$32.88m / year',steps:[['1.37m','lawyers · ABA 2025'],['÷ 5','assumed lawyers / firm'],['× 10%','assumed target fit'],['× $1,200','annual firm subscription']],note:'Rounded lawyer base. US product scope and market entry require local validation; customer-fit and firm-size assumptions are unverified.'},
  companies: {name:'Cross-border companies',amount:'$60m / year',steps:[['10,000','assumed company pool'],['× $6,000','annual company subscription']],note:'The 10,000-company pool is a management assumption, not a sourced prospect count. Law firms are excluded from this segment to avoid double counting.'}
};
function selectSamSegment(key) {
  const segment=samSegments[key];
  document.querySelectorAll('[data-sam]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.sam===key)));
  document.getElementById('sam-calculation').innerHTML=`<div class="sam-calculation-heading"><span>${segment.name}</span><strong>${segment.amount}</strong></div><div class="sam-formula">${segment.steps.map(step=>`<div><strong>${step[0]}</strong><span>${step[1]}</span></div>`).join('')}<span class="formula-equals">=</span><div class="formula-result"><strong>${segment.amount.split(' /')[0]}</strong><span>annual subscription opportunity</span></div></div><p>${segment.note}</p>`;
}
document.querySelectorAll('[data-sam]').forEach(button=>button.addEventListener('click',()=>selectSamSegment(button.dataset.sam)));
if(document.getElementById('sam-calculation'))selectSamSegment('turkey');
