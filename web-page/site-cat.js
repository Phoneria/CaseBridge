// CaseBridge site cat: floating, draggable helper for the marketing pages.
// Loaded lazily by site-cat-loader.js. Talks only to POST /public/site-chat;
// the quick-question chips answer from the static FAQ with no network call.
// Nothing is stored except the cat's position (localStorage, try/catch).
import {
  BOOKING_URL, COPY, CROSSFADE_MS, CYCLE_MS, FAQ, MAX_USER_CHARS, MAX_USER_TURNS, POSES, POSITION_KEY, SLEEP_AFTER_MS,
  VICTORY_MS, clampPosition, defaultPosition, faqAnswer, failureMessage, initialPose, languageOf, leftOf, linkParts,
  parsePosition, poseOf, poseReducer, snapPosition, visibleSection,
} from './site-cat-model.mjs?v=0.70';

const SIZE = () => (window.innerWidth < 640 ? 64 : 76);
const config = window.__casebridgeSiteCat || {};
const base = config.base || '';
const image = (pose, size) => `${base}assets/site-cat/cat-${pose}@${size}.webp`;

function store(key, value) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage blocked */ }
}
function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

export function mountSiteCat(options = {}) {
  if (document.querySelector('.sc-root')) return null;
  const api = options.api ?? config.api;
  const fetchImpl = options.fetch ?? window.fetch.bind(window);
  let lang = languageOf(document.documentElement.lang, location.search);
  let copy = COPY[lang];
  let pose = initialPose;
  let history = []; // turns sent to the API (chip answers are not)
  let busy = false;
  let open = false;
  let position = clampPosition(parsePosition(read(POSITION_KEY)) || defaultPosition(viewport(), SIZE()), viewport(), SIZE());
  const timers = {};
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced = () => !!calm?.matches;

  function viewport() { return {width: window.innerWidth, height: window.innerHeight}; }

  // ---------- markup ----------
  // Two stacked images: the new pose fades in over the old one (CROSSFADE_MS).
  const imgs = [0, 1].map(() => el('img', {alt: '', width: 76, height: 76, draggable: 'false', decoding: 'async', class: 'sc-pose'}));
  let front = 0;
  const cat = el('button', {type: 'button', class: 'sc-cat', 'aria-expanded': 'false', 'aria-controls': 'sc-panel', 'aria-keyshortcuts': 'Escape'}, imgs);
  const title = el('h2', {id: 'sc-title', class: 'sc-title'});
  const resetButton = el('button', {type: 'button', class: 'sc-ghost', onclick: reset});
  const closeButton = el('button', {type: 'button', class: 'sc-close', onclick: () => setOpen(false)}, el('span', {'aria-hidden': 'true', text: '×'}));
  const notice = el('p', {class: 'sc-notice'});
  const log = el('ol', {class: 'sc-log', 'aria-live': 'polite'});
  const chips = el('div', {class: 'sc-chips', role: 'group'});
  const input = el('textarea', {id: 'sc-input', rows: '2', maxlength: String(MAX_USER_CHARS)});
  const label = el('label', {for: 'sc-input', class: 'sc-sr'});
  const counter = el('span', {class: 'sc-counter', 'aria-live': 'off'});
  const send = el('button', {type: 'submit', class: 'sc-send'});
  const form = el('form', {class: 'sc-form', onsubmit: event => { event.preventDefault(); ask(input.value); }}, [
    label, input, el('div', {class: 'sc-row'}, [counter, send]),
  ]);
  const demo = el('a', {class: 'sc-demo', href: BOOKING_URL, target: '_blank', rel: 'noopener noreferrer'});
  const panel = el('section', {id: 'sc-panel', class: 'sc-panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'sc-title', hidden: true}, [
    el('header', {class: 'sc-head'}, [el('img', {src: image('idle', 128), alt: '', width: 32, height: 32, class: 'sc-avatar'}), title, resetButton, closeButton]),
    notice, log, chips, form, demo,
  ]);
  const root = el('div', {class: 'sc-root', translate: 'no'}, [cat, panel]);
  document.body.append(root);

  // ---------- language ----------
  function renderCopy() {
    copy = COPY[lang];
    root.lang = lang;
    cat.setAttribute('aria-label', `${copy.open} (${copy.poses[poseOf(pose)]})`);
    title.textContent = copy.title;
    resetButton.textContent = copy.reset;
    closeButton.setAttribute('aria-label', copy.close);
    notice.textContent = copy.notice;
    chips.setAttribute('aria-label', copy.chips);
    chips.replaceChildren(...FAQ.map(item => el('button', {type: 'button', class: 'sc-chip', 'data-faq': item.id, onclick: () => answerChip(item)}, item.q[lang])));
    label.textContent = copy.label;
    input.placeholder = copy.placeholder;
    send.textContent = copy.send;
    demo.textContent = `${copy.demo} ↗`;
    updateCounter();
  }
  window.addEventListener('casebridge:languagechange', event => {
    lang = event.detail?.language === 'en' ? 'en' : 'tr';
    renderCopy();
  });

  // ---------- messages ----------
  function fill(bubble, text) {
    bubble.replaceChildren(...linkParts(text).map(part => (part.link
      ? el('a', {href: part.link, target: '_blank', rel: 'noopener noreferrer', 'data-booking': true, text: copy.demo})
      : document.createTextNode(part.text))));
  }
  function addMessage(role, text, extra = {}) {
    const bubble = el('p', {class: 'sc-bubble'});
    fill(bubble, text);
    const item = el('li', {class: `sc-msg sc-${role}${extra.kind ? ` sc-${extra.kind}` : ''}`, 'data-kind': extra.kind || role}, bubble);
    log.append(item);
    log.scrollTop = log.scrollHeight;
    return item;
  }
  function reset() {
    history = [];
    log.replaceChildren();
    addMessage('bot', copy.greeting, {kind: 'greeting'});
    input.disabled = false;
    send.disabled = false;
    input.focus();
  }
  function answerChip(item) {
    addMessage('user', item.q[lang]);
    addMessage('bot', faqAnswer(item.id, lang), {kind: 'faq'});
  }
  function updateCounter() { counter.textContent = copy.counter(input.value.length); }
  input.addEventListener('input', updateCounter);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); ask(input.value); }
  });

  async function ask(raw) {
    const text = raw.trim();
    if (!text || busy) return;
    if (text.length > MAX_USER_CHARS) { addMessage('bot', copy.tooLong, {kind: 'error'}); return; }
    if (history.filter(turn => turn.role === 'user').length >= MAX_USER_TURNS) {
      addMessage('bot', copy.turnLimit, {kind: 'error'});
      input.disabled = true; send.disabled = true;
      return;
    }
    busy = true;
    input.value = ''; updateCounter();
    addMessage('user', text);
    const pending = addMessage('bot', copy.thinking, {kind: 'pending'});
    setPose({type: 'send'});
    const turns = [...history, {role: 'user', content: text}];
    try {
      if (!api) throw new Error('no api');
      const response = await fetchImpl(api, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'omit',
        body: JSON.stringify({messages: turns, lang}),
      });
      setPose({type: 'received'});
      let body = null;
      try { body = await response.json(); } catch { /* not JSON */ }
      pending.remove();
      if (response.ok && body && typeof body.answer === 'string') {
        history = [...turns, {role: 'assistant', content: body.answer.slice(0, 1500)}];
        await reveal(addMessage('bot', '', {kind: body.kind === 'refusal' ? 'refusal' : 'answer'}), body.answer);
      } else {
        const failure = failureMessage(response.status, body, lang);
        addMessage('bot', failure.text, {kind: failure.kind});
        if (failure.kind === 'turn_limit') { input.disabled = true; send.disabled = true; }
      }
    } catch {
      pending.remove();
      addMessage('bot', failureMessage(0, null, lang).text, {kind: 'network'});
    } finally {
      busy = false;
      setPose({type: 'done'});
    }
  }

  // The answer is written out over at most ~0.9 s (the "working" pose); instantly with reduced motion.
  function reveal(item, text) {
    const bubble = item.firstChild;
    if (reduced()) { fill(bubble, text); return Promise.resolve(); }
    const step = Math.max(1, Math.ceil(text.length / 55));
    return new Promise(resolve => {
      let shown = 0;
      (function frame() {
        shown = Math.min(text.length, shown + step);
        bubble.textContent = text.slice(0, shown);
        log.scrollTop = log.scrollHeight;
        if (shown < text.length) requestAnimationFrame(frame);
        else { fill(bubble, text); resolve(); }
      })();
    });
  }

  // ---------- poses ----------
  function render() {
    const name = poseOf(pose, reduced());
    if (root.dataset.pose === name) return;
    root.dataset.pose = name;
    cat.setAttribute('aria-label', `${copy.open} (${copy.poses[name]})`);
    const next = imgs[1 - front];
    next.src = image(name, 128);
    next.srcset = `${image(name, 128)} 1x, ${image(name, 256)} 2x`;
    next.classList.add('sc-front');
    imgs[front].classList.remove('sc-front');
    front = 1 - front;
  }
  function setPose(event) {
    pose = poseReducer(pose, event);
    render();
  }
  function restartCycle() {
    clearInterval(timers.cycle);
    if (!reduced()) timers.cycle = setInterval(() => setPose({type: 'tick'}), CYCLE_MS);
  }
  // The section most in view picks the pose; alternation restarts on every section change.
  const ratios = {};
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) ratios[entry.target.id] = entry.intersectionRatio;
      const id = visibleSection(ratios);
      if (id && id !== pose.section) { setPose({type: 'section', id}); restartCycle(); }
    }, {threshold: [0, 0.2, 0.4, 0.6, 0.8, 1]});
    document.querySelectorAll('section[id], header[id]').forEach(section => observer.observe(section));
  }
  calm?.addEventListener?.('change', () => { restartCycle(); render(); });
  function wake() {
    setPose({type: 'activity'});
    clearTimeout(timers.sleep);
    timers.sleep = setTimeout(() => setPose({type: 'idle-timeout'}), SLEEP_AFTER_MS);
  }
  let lastActivity = 0;
  for (const name of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']) {
    window.addEventListener(name, () => { const now = Date.now(); if (now - lastActivity > 1000) { lastActivity = now; wake(); } }, {passive: true});
  }
  // A demo/booking link anywhere on the page: victory, once per visit.
  document.addEventListener('click', event => {
    if (!event.target.closest?.(`a[href^="${BOOKING_URL}"]`) || pose.victoryUsed) return;
    setPose({type: 'demo'});
    timers.victory = setTimeout(() => setPose({type: 'victory-end'}), VICTORY_MS);
  }, true);
  function preload() {
    const size = window.devicePixelRatio > 1.5 ? 256 : 128;
    for (const name of POSES) new Image().src = image(name, size);
  }

  // ---------- open / close ----------
  function setOpen(value) {
    open = value;
    panel.hidden = !value;
    root.classList.toggle('sc-open', value);
    cat.setAttribute('aria-expanded', String(value));
    if (value) {
      if (!log.children.length) reset();
      input.focus();
    } else {
      cat.focus();
    }
  }
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open && !root.contains(document.activeElement) && document.activeElement === document.body) setOpen(false);
  });

  // ---------- drag (mouse, pen, touch) ----------
  let drag = null;
  let suppressClick = false;
  cat.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const rect = cat.getBoundingClientRect();
    drag = {id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top, x: event.clientX, y: event.clientY, moved: false};
    cat.setPointerCapture?.(event.pointerId);
  });
  cat.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    drag.moved = true;
    root.classList.add('sc-dragging');
    place(event.clientX - drag.dx, event.clientY - drag.dy);
  });
  function endDrag(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const moved = drag.moved;
    const point = {x: event.clientX - drag.dx, y: event.clientY - drag.dy};
    drag = null;
    root.classList.remove('sc-dragging');
    if (!moved) return;
    suppressClick = true;
    position = snapPosition(point.x, point.y, viewport(), SIZE());
    store(POSITION_KEY, JSON.stringify(position));
    layout();
  }
  cat.addEventListener('pointerup', endDrag);
  cat.addEventListener('pointercancel', event => { drag = null; root.classList.remove('sc-dragging'); layout(); });
  cat.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    setOpen(!open);
  });

  function place(left, top) {
    cat.style.left = `${left}px`;
    cat.style.top = `${top}px`;
  }
  function layout() {
    position = clampPosition(position, viewport(), SIZE());
    root.dataset.side = position.side;
    place(leftOf(position, viewport(), SIZE()), position.top);
  }
  window.addEventListener('resize', layout);

  renderCopy();
  root.style.setProperty('--sc-fade', `${CROSSFADE_MS}ms`);
  render();
  layout();
  wake();
  restartCycle();
  (window.requestIdleCallback || (callback => setTimeout(callback, 500)))(preload);
  return {root, open: () => setOpen(true), close: () => setOpen(false), ask};
}

if (!window.__casebridgeSiteCatManual) mountSiteCat();
