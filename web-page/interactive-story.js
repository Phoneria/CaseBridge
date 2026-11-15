/* Small, dependency-free enhancements for the existing static marketing site. */
(() => {
  const translations = {
    'MAKE TIME FOR HIGHER-VALUE WORK': 'DAHA FAZLA DEĞER ÜRETEN İŞLERE ZAMAN AYIRIN',
    'What could your team': 'Ekibiniz daha fazla zamanla', 'do with more time?': 'neler yapabilir?',
    'Explore an example using your own workload and time-saving assumption.': 'Kendi iş yükünüz ve zaman tasarrufu varsayımınızla bir örnek hesaplayın.',
    'Cases prepared per month': 'Ayda hazırlanan dosya sayısı',
    'Preparation hours per case': 'Dosya başına hazırlık süresi',
    'cases / month': 'dosya / ay', 'hours / case': 'saat / dosya',
    'Assumed time saving': 'Varsayılan zaman tasarrufu',
    'Reset example': 'Örneği sıfırla', 'ILLUSTRATIVE MONTHLY CAPACITY': 'ÖRNEK AYLIK KAPASİTE',
    'hours freed per month': 'saat / ay kazanılabilecek zaman',
    'Example calculation: cases × hours per case × assumed saving. The percentage is your assumption, not measured CaseBridge performance. Time saved is not guaranteed profit; no subscription or operating costs are included.': 'Örnek hesap: dosya sayısı × dosya başına süre × varsayılan tasarruf. Yüzde, sizin varsayımınızdır; ölçülmüş CaseBridge performansı değildir. Kazanılan zaman kâr garantisi vermez; abonelik ve işletme maliyetleri hesaba dahil değildir.',
    'Enter values within the displayed limits.': 'Belirtilen sınırlar içinde değerler girin.',
    'Planned milestones': 'Planlanan kilometre taşları',
    'Select a point to inspect its value.': 'Değerini incelemek için bir noktayı seçin.',
    'Details on the product screen': 'Ürün ekranındaki ayrıntılar',
    'Schedule a Call': 'Görüşme Planla'
  };
  Object.assign(window.casebridgeTranslations, translations);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const language = () => document.documentElement.lang === 'tr' ? 'tr' : 'en';
  const number = (value, digits = 0) => new Intl.NumberFormat(language() === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: digits }).format(value);
  const animations = new Set();
  function animate(element, frames, options) {
    if (motion.matches || !element.animate) return;
    const animation = element.animate(frames, options);
    animations.add(animation);
    animation.finished.catch(() => {}).finally(() => animations.delete(animation));
  }

  // Content is hidden only after observers exist; keyboard focus reveals it immediately.
  if ('IntersectionObserver' in window) {
    const reveal = new IntersectionObserver(entries => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        target.classList.add('has-entered'); reveal.unobserve(target);
      });
    }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });
    document.querySelectorAll('.pilot-result-card,.interactive-heading,.offering-surface>.business-heading,.actual-ai-gallery,.sufle-feature,.feature-explorer,.story-detail,.roadmap-surface>.business-title,.roadmap-surface>.business-intro,.roadmap-grid>article,.team-heading,.member-details,.expansion-atlas,.market-sizing-grid>article,.finance-glance-heading,.finance-glance,.finance-growth-glance,.finance-optional,.faq-section').forEach((node, index) => {
      node.dataset.reveal = ''; node.style.setProperty('--reveal-delay', `${index % 3 * 70}ms`); reveal.observe(node);
    });
    document.documentElement.classList.add('story-enhanced');
  }

  // Pilot values animate once. Accessible names always retain the final values.
  const counters = [...document.querySelectorAll('[data-pilot-count]')];
  const runningCounters = new Map();
  function finishCounter(node) {
    const frame = runningCounters.get(node);
    if (frame) cancelAnimationFrame(frame);
    runningCounters.delete(node);
    node.textContent = number(Number(node.dataset.pilotCount)) + node.dataset.countSuffix;
    node.dataset.counterComplete = 'true';
  }
  function count(node) {
    if (motion.matches) return finishCounter(node);
    const start = performance.now(), end = Number(node.dataset.pilotCount);
    function frame(now) {
      const progress = Math.min(Math.max(now - start - 120, 0) / 1800, 1);
      node.textContent = number(Math.round(end * (1 - (1 - progress) ** 3))) + node.dataset.countSuffix;
      if (progress < 1) runningCounters.set(node, requestAnimationFrame(frame));
      else finishCounter(node);
    }
    runningCounters.set(node, requestAnimationFrame(frame));
  }
  if ('IntersectionObserver' in window) {
    const counterObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { count(entry.target); counterObserver.unobserve(entry.target); }
    }), { threshold: .3 });
    counters.forEach(node => {
      if (!motion.matches) node.textContent = '0' + node.dataset.countSuffix;
      counterObserver.observe(node);
    });
  } else counters.forEach(finishCounter);

  // The SVG exists before this deferred script runs.
  const map = document.querySelector('[data-case-map]');
  if (map) {
    map.querySelectorAll('.mm-trunk,.mm-twig').forEach(path => path.setAttribute('pathLength', '1'));
    map.querySelectorAll('.mm-branch,.mm-labels').forEach((group, index) => group.style.setProperty('--draw-delay', `${index % 6 * 100}ms`));
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { map.classList.add('map-drawn'); observer.disconnect(); }
      }); observer.observe(map);
    }
  }

  // One passive listener tracks roadmap progress and the floating booking action.
  const roadmapCards = [...document.querySelectorAll('.roadmap-grid>article')];
  const roadmap = document.querySelector('#roadmap .roadmap-grid');
  let roadmapButtons = [];
  if (roadmap) {
    const nav = document.createElement('nav'); nav.className = 'roadmap-progress';
    nav.setAttribute('aria-label', 'Planned milestones');
    [2027, 2028, 2031].forEach((year, i) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = year;
      button.setAttribute('aria-pressed', String(i === 0));
      button.addEventListener('click', () => {
        setRoadmap(i);
        roadmapCards[i].scrollIntoView({ block: 'center', behavior: motion.matches ? 'instant' : 'smooth' });
        // Existing monthly explorer opens the matching year and its details.
        roadmapCards[i].querySelector('.roadmap-explore')?.click();
      });
      nav.append(button);
    });
    roadmap.before(nav); roadmapButtons = [...nav.children];
  }
  function setRoadmap(index) {
    roadmapCards.forEach((card, i) => card.classList.toggle('is-current', i === index));
    roadmapButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  }
  const floating = document.querySelector('.floating-call');
  const hero = document.querySelector('.story-hero');
  const footer = document.querySelector('.footer');
  let scrollFrame = 0;
  function syncScroll() {
    scrollFrame = 0;
    if (roadmapCards.length) {
      const sameRow = Math.abs(roadmapCards[0].offsetTop - roadmapCards[1].offsetTop) < 20;
      if (sameRow) {
        const rect = roadmap.getBoundingClientRect();
        if (rect.top < innerHeight && rect.bottom > 0) setRoadmap(Math.max(0, Math.min(2, Math.floor((innerHeight - rect.top) / (innerHeight + rect.height) * 3))));
      } else {
        let active = 0;
        roadmapCards.forEach((card, i) => { if (card.getBoundingClientRect().top < innerHeight * .65) active = i; });
        setRoadmap(active);
      }
    }
    const show = hero.getBoundingClientRect().bottom < 90 && footer.getBoundingClientRect().top > innerHeight;
    // Avoid leaving keyboard focus on a link as it becomes hidden.
    if (document.activeElement !== floating) floating.hidden = !show;
  }
  function scheduleScroll() { if (!scrollFrame) scrollFrame = requestAnimationFrame(syncScroll); }
  addEventListener('scroll', scheduleScroll, { passive: true });
  addEventListener('resize', scheduleScroll, { passive: true });
  syncScroll();

  // Numbered controls explain the corresponding areas of each real screenshot.
  const screenTours = [];
  const markerPositions = {
    en: [[[32,12],[52,29],[39,19]],[[38,29],[37,37],[90,37]],[[37,41],[82,33],[25,41]],[[65,19],[52,40],[75,68]],[[52,30],[80,63],[48,63]],[[33,22],[58,22],[65,52]],[[87,29],[42,41],[62,29]],[[34,31],[55,31],[91,31]]],
    tr: [[[35,29],[51,53],[41,41]],[[35,53],[35,68],[61,53]],[[40,65],[82,57],[25,65]],[[58,27],[58,62],[70,72]],[[47,41],[77,30],[37,30]],[[33,55],[58,55],[65,75]],[[86,51],[42,62],[62,51]],[[34,54],[60,54],[92,77]]]
  };
  document.querySelectorAll('.feature-panel').forEach((panel, panelIndex) => {
    const figure = panel.querySelector('.feature-screen');
    const items = [...panel.querySelectorAll('.feature-panel-copy li')];
    const controls = document.createElement('div'); controls.className = 'screen-markers';
    controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Details on the product screen');
    const overlay = document.createElement('div'); overlay.className = 'screen-overlay';
    const note = document.createElement('p'); note.className = 'screen-marker-note';
    note.id = `screen-note-${panelIndex}`; note.hidden = true;
    const explanation = panel.querySelector('.feature-panel-copy p').textContent;
    let selected = -1;
    const pins = [];
    const labels = items.map(item => item.textContent);
    function select(index) {
      selected = selected === index ? -1 : index;
      [...controls.children].forEach((control, i) => control.setAttribute('aria-pressed', String(i === selected)));
      pins.forEach((pin, i) => pin.setAttribute('aria-pressed', String(i === selected)));
      note.hidden = selected < 0;
      if (selected >= 0) {
        const strong = document.createElement('strong'), span = document.createElement('span');
        strong.textContent = labels[selected]; span.textContent = explanation;
        note.replaceChildren(strong, span);
      }
    }
    items.forEach((item, index) => {
      const label = labels[index];
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = `${index + 1}. ${label}`;
      const translated = window.casebridgeTranslations[label];
      if (translated) window.casebridgeTranslations[button.textContent] = `${index + 1}. ${translated}`;
      const pin = document.createElement('button'); pin.type = 'button'; pin.className = 'screen-marker-pin';
      pin.textContent = index + 1; pin.setAttribute('aria-label', label);
      [button, pin].forEach(control => {
        control.setAttribute('aria-pressed', 'false'); control.setAttribute('aria-controls', note.id);
        control.addEventListener('click', () => select(index));
      });
      controls.append(button); overlay.append(pin); pins.push(pin);
    });
    function syncTour() {
      pins.forEach((pin, index) => {
        const [x, y] = markerPositions[language()][panelIndex][index];
        pin.style.left = `${x}%`; pin.style.top = `${y}%`;
      });
      if (selected >= 0) { const index = selected; selected = -1; select(index); }
    }
    screenTours.push(syncTour); syncTour();
    figure.append(overlay, controls, note);
  });

  // Animate newly rendered charts and give every point touch/keyboard inspection.
  const processedCharts = new WeakSet();
  const chartObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const chart = entry.target; chartObserver.unobserve(chart);
      chart.dataset.chartAnimated = 'true';
      chart.querySelectorAll('svg path[stroke]').forEach(path => {
        if (path.getAttribute('stroke-dasharray')) {
          animate(path, [{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0)' }], { duration: 1000 });
        } else {
          const length = path.getTotalLength();
          animate(path, [{ strokeDasharray: `${length} ${length}`, strokeDashoffset: length }, { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 }], { duration: 1100 });
        }
      });
      chart.querySelectorAll('.donut-slice,.market-ring').forEach(slice => {
        animate(slice, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0)' }], { duration: 1000 });
      });
      chart.querySelectorAll('.bar-total,.market-column,.category-fill').forEach(bar => {
        animate(bar, [{ transform: 'scaleY(0)', transformOrigin: 'bottom' }, { transform: 'scaleY(1)', transformOrigin: 'bottom' }], { duration: 800 });
      });
    });
  }, { threshold: .1 }) : null;
  function enhanceCharts(root) {
    const charts = [];
    if (root.matches?.('.home-chart,.finance-glance-donut,.market-graphic,.capital-visual,.revenue-visual,.finance-drilldown')) charts.push(root);
    if (root.querySelectorAll) charts.push(...root.querySelectorAll('.home-chart,.finance-glance-donut,.market-graphic,.capital-visual,.revenue-visual,.finance-drilldown'));
    charts.forEach(chart => {
      if (processedCharts.has(chart)) return;
      processedCharts.add(chart); chartObserver?.observe(chart);
      if (!chart.matches('.home-chart')) return;
      const tip = document.createElement('p'); tip.className = 'home-chart-tip';
      tip.textContent = 'Select a point to inspect its value.';
      chart.append(tip);
      const points = [...chart.querySelectorAll('svg circle')];
      points.forEach((point, index) => {
        const title = point.querySelector('title'); if (!title) return;
        const originalLabel = title.textContent;
        point.setAttribute('tabindex', index === 0 ? '0' : '-1');
        point.setAttribute('role', 'button'); point.setAttribute('aria-label', title.textContent);
        const inspect = () => {
          tip.textContent = originalLabel;
          points.forEach(other => { other.setAttribute('tabindex', other === point ? '0' : '-1'); other.setAttribute('r', other === point ? '6' : (points.length > 24 ? '2.4' : '4')); });
        };
        point.addEventListener('pointerenter', inspect);
        point.addEventListener('click', inspect); point.addEventListener('focus', inspect);
        point.addEventListener('keydown', event => {
          if (['Enter', ' '].includes(event.key)) { event.preventDefault(); inspect(); }
          const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
          if (delta) { event.preventDefault(); points[(index + delta + points.length) % points.length].focus(); }
        });
      });
    });
  }
  enhanceCharts(document);
  const chartGrid = document.getElementById('home-chart-grid');
  if (chartGrid) new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node.nodeType === 1) enhanceCharts(node); }))).observe(chartGrid, { childList: true });

  const allocation = document.querySelector('.finance-glance-allocation');
  if (allocation) {
    const slices = [...allocation.querySelectorAll('.donut-slice')];
    const rows = [...allocation.querySelectorAll('.finance-glance-legend>div')];
    const svg = allocation.querySelector('svg');
    svg?.setAttribute('role', 'group');
    const note = document.createElement('p'); note.className = 'allocation-selection'; note.hidden = true;
    allocation.after(note);
    // Name and share with a separator (the row's raw text runs them together).
    const label = row => [row.querySelector('span'), row.querySelector('strong')].filter(Boolean).map(node => node.textContent.trim()).join(' · ');
    function selectAllocation(index) {
      slices.forEach((slice, i) => { slice.style.opacity = i === index ? '1' : '.25'; slice.setAttribute('aria-pressed', String(i === index)); });
      rows.forEach((row, i) => row.setAttribute('aria-pressed', String(i === index)));
      // The legend is translated in place; use its current rendered label.
      note.textContent = label(rows[index]);
      note.hidden = false;
      note.dataset.selected = index;
    }
    rows.forEach((row, index) => {
      row.id = `allocation-legend-${index}`;
      row.setAttribute('role', 'button'); row.tabIndex = 0; row.setAttribute('aria-pressed', 'false');
      const slice = slices[index]; if (!slice) return;
      slice.setAttribute('role', 'button'); slice.setAttribute('tabindex', '0'); slice.setAttribute('aria-pressed', 'false');
      slice.setAttribute('aria-labelledby', row.id);
      [row, slice].forEach(control => {
        control.addEventListener('click', () => selectAllocation(index));
        control.addEventListener('pointerenter', () => selectAllocation(index));
        control.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); selectAllocation(index); } });
      });
    });
    window.addEventListener('casebridge:languagechange', () => {
      if (!note.hidden) note.textContent = label(rows[Number(note.dataset.selected)]);
    });
  }

  window.addEventListener('casebridge:languagechange', () => {
    counters.forEach(node => { if (node.dataset.counterComplete === 'true') finishCounter(node); });
    screenTours.forEach(sync => sync());
  });
  motion.addEventListener('change', () => {
    if (motion.matches) {
      counters.forEach(finishCounter);
      animations.forEach(animation => animation.cancel());
      document.querySelectorAll('[data-reveal]').forEach(node => node.classList.add('has-entered'));
    }
  });
})();
