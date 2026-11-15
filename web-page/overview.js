// Visible narrative first. Only supporting detail panels collapse on scroll.
const supportingDetails = [...document.querySelectorAll('details')];
const detailGrace = new WeakMap();
let detailScrollFrame;
supportingDetails.forEach(detail => detail.addEventListener('toggle', () => {
  if (detail.open) detailGrace.set(detail, performance.now() + 900);
}));
function openDeepLink() {
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  const target = id && document.getElementById(id);
  if (!target) return;
  let hasHiddenParent = false;
  for (let node = target; node; node = node.parentElement) {
    if (node.tagName === 'DETAILS') { node.open = true; detailGrace.set(node, performance.now() + 1100); hasHiddenParent = true; }
  }
  if (hasHiddenParent) requestAnimationFrame(() => requestAnimationFrame(() => target.scrollIntoView({block:'start',behavior:'instant'})));
}
window.addEventListener('hashchange', openDeepLink);
window.addEventListener('scroll', () => {
  if (detailScrollFrame) return;
  detailScrollFrame = requestAnimationFrame(() => {
    detailScrollFrame = null;
    const headerBottom = document.querySelector('.header').getBoundingClientRect().bottom;
    // Close innermost panels first, retaining the reading position.
    [...supportingDetails].reverse().forEach(detail => {
      if (!detail.open || performance.now() < (detailGrace.get(detail) || 0)) return;
      const rect = detail.getBoundingClientRect();
      if (rect.bottom < headerBottom - 16 || rect.top > innerHeight + 24) {
        const wasAbove = rect.bottom < headerBottom;
        const oldHeight = rect.height;
        detail.open = false;
        if (wasAbove) window.scrollBy({top:-(oldHeight-detail.getBoundingClientRect().height),behavior:'instant'});
      }
    });
  });
}, {passive:true});
openDeepLink();

// Animate charts and milestone counts as they enter the viewport.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!reducedMotion && 'IntersectionObserver' in window) {
  document.querySelectorAll('.offering-grid>article, .member-details, .roadmap-grid>article, .expansion-gate, .allocation-list>div').forEach(element=>{ element.dataset.animate=''; });
  document.documentElement.classList.add('motion-ready');
  const animationObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('is-visible');
    entry.target.querySelectorAll('[data-count]').forEach(counter => {
      const target = Number(counter.dataset.count);
      const start = performance.now();
      function frame(now) {
        const progress = Math.min((now-start)/1100,1);
        counter.textContent = Math.round(target*(1-Math.pow(1-progress,3))).toLocaleString('en-US');
        if (progress<1) requestAnimationFrame(frame);
      }
      counter.textContent = '0'; requestAnimationFrame(frame);
    });
    animationObserver.unobserve(entry.target);
  }),{threshold:0.08});
  document.querySelectorAll('[data-animate]').forEach(element=>animationObserver.observe(element));
}
