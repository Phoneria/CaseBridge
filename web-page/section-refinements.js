/* Directional expansion routes and photo entrances, respecting reduced motion. */
(() => {
  Object.assign(window.casebridgeTranslations, {
    'Replay routes': 'Rotaları yeniden oynat',
    'First-meeting prompts': 'İlk görüşmede sufle',
    'Ask the next useful question.': 'Sıradaki doğru soruyu sorun.',
    'An assistant beside the conversation.': 'Görüşmenin yanında bir yardımcı.',
    'Explore the first-meeting concept: suggested questions, facts to clarify and documents to request, with the lawyer guiding the conversation.': 'İlk görüşme için tasarlanan sufle yaklaşımını keşfedin: avukat görüşmeyi yönlendirirken sorulabilecek sorular, netleştirilecek bilgiler ve istenecek belgeler.',
    'Suggested question': 'Soru önerisi',
    'After the first notice, what happened next?': 'İlk ihtardan sonra ne oldu?',
    'Clarify a missing fact': 'Eksik bilgiyi netleştirin',
    'Which date can you confirm from a document?': 'Hangi tarihi bir belgeyle doğrulayabilirsiniz?',
    'Request supporting material': 'Destekleyici belge isteyin',
    'Do you have the signed agreement and correspondence?': 'İmzalı sözleşme ve yazışmalar elinizde mi?',
    'Select a prompt': 'Bir sufle seçin',
    'Illustration of a lawyer and client meeting with CaseBridge question prompts on a laptop': 'Avukat ve müvekkil görüşmesinde dizüstü bilgisayarda CaseBridge soru önerilerini gösteren temsili görsel'
  });
  // This file runs after i18n; reapply once for the newly registered labels.
  window.casebridgeSetLanguage?.(document.documentElement.lang, false);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const map = document.querySelector('.atlas-globe');
  const routes = [...document.querySelectorAll('.expansion-route')];
  let frame = 0, started = false;
  function paint(route, progress) {
    const line = route.querySelector('.route-line');
    const head = route.querySelector('.route-head');
    const mask = document.getElementById(`route-mask-${route.dataset.route}`).querySelector('path');
    mask.style.strokeDasharray = '1'; mask.style.strokeDashoffset = 1 - progress;
    const length = line.getTotalLength();
    const point = line.getPointAtLength(length * progress);
    const previous = line.getPointAtLength(Math.max(0, length * progress - 1));
    const following = line.getPointAtLength(Math.min(length, length * progress + 1));
    const angle = Math.atan2(following.y - previous.y, following.x - previous.x) * 180 / Math.PI;
    head.setAttribute('transform', `translate(${point.x} ${point.y}) rotate(${angle})`);
    head.style.opacity = progress > 0 ? '1' : '0';
    route.dataset.routeProgress = progress.toFixed(3);
  }
  function finish() {
    cancelAnimationFrame(frame); frame = 0;
    routes.forEach(route => paint(route, 1));
    if (map) map.dataset.routesState = 'complete';
  }
  function play() {
    cancelAnimationFrame(frame);
    if (motion.matches) return finish();
    started = true; map.dataset.routesState = 'running';
    routes.forEach(route => paint(route, 0));
    const start = performance.now();
    function tick(now) {
      let complete = true;
      routes.forEach((route, index) => {
        const delay = index === 0 ? 0 : 2300 + (index - 1) * 300;
        const duration = index === 0 ? 2200 : 1900;
        const progress = Math.min(1, Math.max(0, (now - start - delay) / duration));
        paint(route, progress);
        if (progress < 1) complete = false;
      });
      if (complete) finish();
      else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }
  if (routes.length) {
    // Static/no-JS rendering also shows the complete paths and endpoint arrows.
    routes.forEach(route => paint(route, motion.matches ? 1 : 0));
    document.querySelector('.replay-routes').hidden = false;
    document.querySelector('.replay-routes').addEventListener('click', play);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting) && !started) { play(); observer.disconnect(); }
      }, { threshold: .15 }); observer.observe(map);
    } else finish();
  }
  const photos = [...document.querySelectorAll('.team-surface .member-photo')];
  function revealPhoto(photo) {
    const reveal = () => {
      photo.classList.add('photo-entered'); photo.dataset.photoState = 'complete';
    };
    if (photo.complete) requestAnimationFrame(reveal);
    else { photo.addEventListener('load', reveal, { once: true }); photo.addEventListener('error', reveal, { once: true }); }
  }
  if (!motion.matches && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      revealPhoto(entry.target); observer.unobserve(entry.target);
    }), { threshold: .15 });
    photos.forEach((photo, index) => {
      photo.classList.add('photo-entrance'); photo.style.setProperty('--photo-delay', `${index % 4 * 100}ms`);
      photo.dataset.photoState = 'waiting'; observer.observe(photo);
    });
  }
  motion.addEventListener('change', () => {
    if (motion.matches) { finish(); photos.forEach(photo => { photo.classList.add('photo-entered'); photo.dataset.photoState = 'complete'; }); }
  });
  const choices = [...document.querySelectorAll('[data-sufle-prompt]')];
  const prompt = document.getElementById('sufle-question');
  const prompts = [
    'After the first notice, what happened next?',
    'Which date can you confirm from a document?',
    'Do you have the signed agreement and correspondence?'
  ];
  function selectPrompt(index) {
    if (!prompt) return;
    choices.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    prompt.textContent = prompts[index];
  }
  choices.forEach((button, index) => button.addEventListener('click', () => selectPrompt(index)));
})();
