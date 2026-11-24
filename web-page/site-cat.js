// CaseBridge site cat: floating, draggable helper for the marketing pages.
// Loaded lazily by site-cat-loader.js. Talks only to POST /public/site-chat;
// the quick-question chips answer from the static FAQ with no network call.
// Nothing is stored except the cat's position (localStorage, try/catch).
import {
  BOOKING_URL, COPY, DANCE_MS, FAQ, MAX_USER_CHARS, MAX_USER_TURNS, POSITION_KEY, SLEEP_AFTER_MS, VICTORY_MS,
  clampPosition, defaultPosition, faqAnswer, failureMessage, initialPose, languageOf, leftOf, linkParts,
  parsePosition, poseOf, poseReducer, snapPosition,
} from './site-cat-model.mjs?v=0.67';

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

  function viewport() { return {width: window.innerWidth, height: window.innerHeight}; }

  // ---------- markup ----------
  const catImg = el('img', {alt: '', width: 76, height: 76, draggable: 'false', decoding: 'async'});
  const cat = el('button', {type: 'button', class: 'sc-cat', 'aria-expanded': 'false', 'aria-controls': 'sc-panel', 'aria-keyshortcuts': 'Escape'}, catImg);
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
  const root = el('div', {class: 'sc-root', 'data-pose': 'idle', translate: 'no'}, [cat, panel]);
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
  function addMessage(role, text, extra = {}) {
    const bubble = el('p', {class: 'sc-bubble'});
    for (const part of linkParts(text)) {
      bubble.append(part.link
        ? el('a', {href: part.link, target: '_blank', rel: 'noopener noreferrer', 'data-booking': true, text: copy.demo})
        : document.createTextNode(part.text));
    }
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
    if (item.id === 'demo') dance();
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
    setPose('send');
    const turns = [...history, {role: 'user', content: text}];
    try {
      if (!api) throw new Error('no api');
      const response = await fetchImpl(api, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'omit',
        body: JSON.stringify({messages: turns, lang}),
      });
      let body = null;
      try { body = await response.json(); } catch { /* not JSON */ }
      pending.remove();
      if (response.ok && body && typeof body.answer === 'string') {
        history = [...turns, {role: 'assistant', content: body.answer.slice(0, 1500)}];
        addMessage('bot', body.answer, {kind: body.kind === 'refusal' ? 'refusal' : 'answer'});
        setPose('answer');
        clearTimeout(timers.victory);
        timers.victory = setTimeout(() => setPose('victory-end'), VICTORY_MS);
      } else {
        const failure = failureMessage(response.status, body, lang);
        addMessage('bot', failure.text, {kind: failure.kind});
        if (failure.kind === 'turn_limit') { input.disabled = true; send.disabled = true; }
        setPose('fail');
      }
    } catch {
      pending.remove();
      addMessage('bot', failureMessage(0, null, lang).text, {kind: 'network'});
      setPose('fail');
    } finally {
      busy = false;
    }
  }

  // ---------- poses ----------
  function setPose(event) {
    pose = poseReducer(pose, event);
    const name = poseOf(pose);
    if (root.dataset.pose === name) return;
    root.dataset.pose = name;
    catImg.src = image(name, 128);
    catImg.srcset = `${image(name, 128)} 1x, ${image(name, 256)} 2x`;
    cat.setAttribute('aria-label', `${copy.open} (${copy.poses[name]})`);
  }
  function dance() {
    setPose('dance');
    clearTimeout(timers.dance);
    timers.dance = setTimeout(() => setPose('dance-end'), DANCE_MS);
  }
  function wake() {
    setPose('activity');
    clearTimeout(timers.sleep);
    timers.sleep = setTimeout(() => setPose('idle-timeout'), SLEEP_AFTER_MS);
  }
  let lastActivity = 0;
  for (const name of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']) {
    window.addEventListener(name, () => { const now = Date.now(); if (now - lastActivity > 1000) { lastActivity = now; wake(); } }, {passive: true});
  }
  document.addEventListener('click', event => {
    if (event.target.closest?.(`a[href^="${BOOKING_URL}"]`)) dance();
  }, true);

  // ---------- open / close ----------
  function setOpen(value) {
    open = value;
    panel.hidden = !value;
    root.classList.toggle('sc-open', value);
    cat.setAttribute('aria-expanded', String(value));
    if (value) {
      if (!log.children.length) reset();
      for (const name of ['thinking', 'victory', 'dancing']) new Image().src = image(name, 128); // warm the next poses
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
  catImg.src = image('idle', 128);
  catImg.srcset = `${image('idle', 128)} 1x, ${image('idle', 256)} 2x`;
  root.dataset.pose = 'idle';
  layout();
  wake();
  return {root, open: () => setOpen(true), close: () => setOpen(false), ask};
}

if (!window.__casebridgeSiteCatManual) mountSiteCat();
