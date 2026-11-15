// Supporting detail panels stay as the reader left them: they open and close
// only on click. (Auto-closing them on scroll moved the page twice, once by the
// browser's scroll anchoring and once by the manual correction.)
function openDeepLink() {
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  const target = id && document.getElementById(id);
  if (!target) return;
  let hasHiddenParent = false;
  for (let node = target; node; node = node.parentElement) {
    if (node.tagName === 'DETAILS') { node.open = true; hasHiddenParent = true; }
  }
  if (hasHiddenParent) requestAnimationFrame(() => requestAnimationFrame(() => target.scrollIntoView({block:'start',behavior:'instant'})));
}
window.addEventListener('hashchange', openDeepLink);
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
