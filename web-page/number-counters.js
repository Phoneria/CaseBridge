/* Count visible metrics from zero while retaining their exact translated final copy. */
(() => {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const selector = '.rationale-grid article>strong,.market-graphic>h3,.finance-glance-ask>strong,.finance-glance-legend strong,.sam-calculation-heading>strong,.sam-formula strong,.sizing-equation article>strong,#finance-summary strong,.annual-insight-metrics strong,.finance-year>strong,.category-value,.category-value>small,.category-detail-heading>strong,.home-metric>strong,.roadmap-grid h4,.donut-number,.ring-big';
  const records = new WeakMap(), running = new Set();
  const duration = 1800;
  function interpolate(text, progress) {
    return text.replace(/[−-]?\d+(?:[.,]\d+)*/g, token => {
      const groups = token.replace(/[−-]/g, '').split(/[.,]/);
      const decimal = groups.length > 1 && groups.at(-1).length !== 3;
      const digits = decimal ? groups.at(-1).length : 0;
      const last = Math.max(token.lastIndexOf('.'), token.lastIndexOf(','));
      const normalized = decimal ? token.slice(0, last).replace(/[.,]/g, '') + '.' + token.slice(last + 1) : token.replace(/[.,]/g, '');
      const value = Number(normalized.replace('−', '-'));
      if (!Number.isFinite(value)) return token;
      const locale = document.documentElement.lang === 'tr' ? 'tr-TR' : 'en-US';
      return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: Math.abs(value) >= 1000 }).format(value * progress);
    });
  }
  function finalText(record) { return record.svg ? record.final : record.source.textContent; }
  function display(record, progress) {
    const text = interpolate(finalText(record), progress);
    if (record.svg) record.element.textContent = text;
    else record.visual.setAttribute('data-number-display', text);
  }
  function finish(record) {
    if (record.frame) cancelAnimationFrame(record.frame);
    running.delete(record);
    if (record.svg) record.element.textContent = record.final;
    else { record.wrapper.classList.remove('is-counting'); record.visual.removeAttribute('data-number-display'); }
    record.element.dataset.numberState = 'complete';
  }
  function start(record) {
    if (motion.matches) { finish(record); return; }
    record.element.dataset.numberState = 'running';
    running.add(record);
    // Keep zero on screen briefly before easing toward the final amount.
    const start = performance.now() + 120;
    display(record, 0);
    function frame(now) {
      if (!record.element.isConnected) { finish(record); return; }
      const progress = Math.min(Math.max((now - start) / duration, 0), 1);
      display(record, 1 - (1 - progress) ** 3);
      if (progress < 1) record.frame = requestAnimationFrame(frame);
      else finish(record);
    }
    record.frame = requestAnimationFrame(frame);
  }
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const record = records.get(entry.target);
    if (record) start(record);
    observer.unobserve(entry.target);
  }), { threshold: .15 }) : null;
  function register(element) {
    if (records.has(element) || element.closest('.number-run') || element.querySelector('[data-pilot-count]')) return;
    // Only direct text is enhanced; labels and percentage subelements keep their own semantics.
    const texts = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE && /\d/.test(node.nodeValue));
    if (!texts.length) return;
    const svg = element.namespaceURI === 'http://www.w3.org/2000/svg';
    if (svg && !/^\s*[$€£−-]?[\d.,]+\s*[%kmbn]*\s*$/i.test(element.textContent)) return;
    const record = { element, svg, final: element.textContent };
    if (!svg) {
      const wrapper = document.createElement('span'); wrapper.className = 'number-run is-counting';
      const source = document.createElement('span'); source.className = 'number-final';
      const visual = document.createElement('span'); visual.className = 'number-visual'; visual.setAttribute('aria-hidden', 'true');
      texts[0].before(wrapper);
      texts.forEach(text => source.append(text)); // Preserve the language switcher's text-node state.
      wrapper.append(source, visual);
      Object.assign(record, { wrapper, source, visual });
    }
    records.set(element, record);
    element.dataset.numberState = 'waiting';
    if (motion.matches || !observer) finish(record);
    else { display(record, 0); observer.observe(element); }
  }
  function scan(root) {
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.matches?.(selector)) register(root);
    root.querySelectorAll(selector).forEach(register);
  }
  scan(document);
  new MutationObserver(changes => changes.forEach(change => change.addedNodes.forEach(scan))).observe(document.querySelector('main'), { childList: true, subtree: true });
  motion.addEventListener('change', () => {
    if (!motion.matches) return;
    document.querySelectorAll('[data-number-state]').forEach(element => {
      const record = records.get(element); if (record) { observer?.unobserve(element); finish(record); }
    });
  });
})();
