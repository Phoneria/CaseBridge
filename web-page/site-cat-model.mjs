// CaseBridge site cat: pure logic (no DOM), shared by site-cat.js and its tests.

export const BOOKING_URL = 'https://calendar.app.google/RL4CxQFEZAuVF2xP9';
export const MAX_USER_CHARS = 500;
export const MAX_USER_TURNS = 12;
export const SLEEP_AFTER_MS = 2 * 60 * 1000;
export const DANCE_MS = 4000;
export const VICTORY_MS = 2500;
export const MARGIN = 16;
export const POSITION_KEY = 'casebridge-site-cat-position';
export const POSES = ['idle', 'thinking', 'sleeping', 'dancing', 'victory'];

export const COPY = {
  tr: {
    open: 'CaseBridge kedisine sorun', title: 'CaseBridge kedisi', close: 'Kapat', reset: 'Yeni sohbet',
    notice: 'Lütfen kişisel veya dava bilgisi paylaşmayın.',
    greeting: 'Merhaba! CaseBridge hakkındaki sorularınızı yanıtlarım. Hukuki danışmanlık vermem.',
    chips: 'Hazır sorular', label: 'Sorunuz', placeholder: 'CaseBridge hakkında bir soru yazın…', send: 'Gönder',
    demo: 'Demo planla', thinking: 'Düşünüyor…', counter: n => `${n}/${MAX_USER_CHARS}`,
    network: 'Bağlantı kurulamadı. Hazır sorular çalışmaya devam ediyor; isterseniz demo planlayabilirsiniz.',
    busy: 'Şu an yoğunuz. Hazır sorulara göz atabilir ya da demo planlayabilirsiniz.',
    rateLimited: 'Çok sık mesaj gönderdiniz. Lütfen biraz sonra tekrar deneyin.',
    turnLimit: 'Bu sohbet çok uzadı. Yeni bir sohbet başlatın.',
    tooLong: `Mesaj en fazla ${MAX_USER_CHARS} karakter olabilir.`,
    verification: 'Doğrulama başarısız oldu. Sayfayı yenileyip tekrar deneyin.',
    poses: {idle: 'bekliyor', thinking: 'düşünüyor', sleeping: 'uyuyor', dancing: 'dans ediyor', victory: 'seviniyor'},
  },
  en: {
    open: 'Ask the CaseBridge cat', title: 'CaseBridge cat', close: 'Close', reset: 'New chat',
    notice: 'Please don’t share personal or case details.',
    greeting: 'Hi! I answer questions about CaseBridge. I don’t give legal advice.',
    chips: 'Quick questions', label: 'Your question', placeholder: 'Ask something about CaseBridge…', send: 'Send',
    demo: 'Book a demo', thinking: 'Thinking…', counter: n => `${n}/${MAX_USER_CHARS}`,
    network: 'Couldn’t connect. The quick questions still work, or you can book a demo.',
    busy: 'We’re busy right now. Try the quick questions or book a demo.',
    rateLimited: 'You’ve sent messages too quickly. Please try again a little later.',
    turnLimit: 'This conversation is getting long. Please start a new chat.',
    tooLong: `Messages can be at most ${MAX_USER_CHARS} characters.`,
    verification: 'Verification failed. Please reload the page and try again.',
    poses: {idle: 'waiting', thinking: 'thinking', sleeping: 'sleeping', dancing: 'dancing', victory: 'celebrating'},
  },
};

// Static answers for the quick-question chips: no API call, so they work when
// the AI is down or over its daily cap. Wording follows the marketing site.
export const FAQ = [
  {
    id: 'features',
    q: {tr: 'Neler yapabiliyor?', en: 'What can it do?'},
    a: {
      tr: 'CaseBridge hukuk büroları için bir yapay zekâ çalışma alanıdır. Biten davalardan ders çıkarır, süren davanın olası yollarını Olasılık Ağacı ile gösterir, kişisel veriyi modele gitmeden maskeler, büroyu tek bakışta toplar, müvekkil görüşmesinde sufle verir ve duruşma provası yaptırır. Davalar, duruşmalar, takvim, görevler ve emsal kararlar da aynı yerdedir.',
      en: 'CaseBridge is an AI workspace for law firms. It learns from closed cases, shows the possible paths of an ongoing case with the Probability Tree, masks personal data before it reaches the model, brings the whole firm into one view, prompts you during client meetings and lets you rehearse hearings. Cases, hearings, the calendar, tasks and precedents live in the same place.',
    },
  },
  {
    id: 'security',
    q: {tr: 'Verilerim güvende mi?', en: 'Is my data safe?'},
    a: {
      tr: 'Her büronun dosyaları, kullanıcıları ve yapay zekâ anahtarı ayrı tutulur; anahtarlar şifreli saklanır. Anonimleştirme aracı kişisel verileri modele gitmeden etiketleyerek gizler ve sonucu gözden geçirmenizi ister. KVKK ile ilgili ayrıntılı sorularınızı demo görüşmesinde ekibe sorabilirsiniz.',
      en: 'Each firm’s files, users and AI key are kept separate, and keys are stored encrypted. The anonymisation tool masks personal data before it reaches the model and asks you to review the result. You can ask the team detailed data-protection (KVKK) questions in a demo call.',
    },
  },
  {
    id: 'ai',
    q: {tr: 'Yapay zekâ nasıl çalışıyor?', en: 'How does the AI work?'},
    a: {
      tr: 'Yapay zekâ karar desteği sunar: analizler dosyadaki kayıtlara dayanır ve istekler büronuzun kendi yapay zekâ anahtarıyla yapılır. Gösterilen yüzdeler senaryo varsayımıdır, kesin sonuç tahmini değildir. Çıktıyı kullanmadan önce belge asıllarını, tarihleri ve atıfları doğrulayın; nihai değerlendirme her zaman avukatındır.',
      en: 'The AI offers decision support: analyses are based on the records in the case file, and requests use your firm’s own AI key. The percentages shown are scenario assumptions, not a guaranteed outcome. Check original documents, dates and citations before using any output; the final judgement is always the lawyer’s.',
    },
  },
  {
    id: 'demo',
    q: {tr: 'Demo nasıl alırım?', en: 'How do I get a demo?'},
    a: {
      tr: '“Demo planla” düğmesinden size uygun bir zaman seçmeniz yeterli. Büro hesabını CaseBridge ekibi açar ve büronuzun ilk yöneticisini davet eder.',
      en: 'Pick a time with the “Book a demo” button. The CaseBridge team opens your firm’s account and invites its first administrator.',
    },
  },
];

export function languageOf(htmlLang, search = '') {
  let param = null;
  try { param = new URLSearchParams(search).get('lang'); } catch { /* ignore */ }
  const lang = (param || htmlLang || 'tr').toLowerCase();
  return lang.startsWith('en') ? 'en' : 'tr';
}

export function faqAnswer(id, lang) {
  const item = FAQ.find(entry => entry.id === id);
  return item ? item.a[lang === 'en' ? 'en' : 'tr'] : null;
}

// ---------- poses ----------

export const initialPose = {waiting: false, asleep: false, dancing: false, victory: false};

export function poseReducer(state, event) {
  switch (event) {
    case 'send': return {...state, waiting: true, asleep: false};
    case 'answer': return {...state, waiting: false, victory: true};
    case 'fail': return {...state, waiting: false};
    case 'victory-end': return {...state, victory: false};
    case 'dance': return {...state, dancing: true, asleep: false};
    case 'dance-end': return {...state, dancing: false};
    case 'idle-timeout': return state.waiting ? state : {...state, asleep: true};
    case 'activity': return state.asleep ? {...state, asleep: false} : state;
    default: return state;
  }
}

/** thinking > dancing > victory > sleeping > idle */
export function poseOf(state) {
  if (state.waiting) return 'thinking';
  if (state.dancing) return 'dancing';
  if (state.victory) return 'victory';
  if (state.asleep) return 'sleeping';
  return 'idle';
}

// ---------- position ----------

export function clampPosition(position, viewport, size) {
  const max = Math.max(MARGIN, viewport.height - size - MARGIN);
  return {side: position.side === 'left' ? 'left' : 'right', top: Math.min(Math.max(position.top, MARGIN), max)};
}

export function defaultPosition(viewport, size) {
  return clampPosition({side: 'right', top: viewport.height - size - MARGIN * 2}, viewport, size);
}

export function snapPosition(x, y, viewport, size) {
  return clampPosition({side: x + size / 2 < viewport.width / 2 ? 'left' : 'right', top: y}, viewport, size);
}

export function leftOf(position, viewport, size) {
  return position.side === 'left' ? MARGIN : viewport.width - size - MARGIN;
}

export function parsePosition(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if ((value.side === 'left' || value.side === 'right') && Number.isFinite(value.top)) return {side: value.side, top: value.top};
  } catch { /* damaged value */ }
  return null;
}

// ---------- API responses ----------

/** Maps an API failure to {kind, text}; the server's own friendly text wins when present. */
export function failureMessage(status, body, lang) {
  const copy = COPY[lang === 'en' ? 'en' : 'tr'];
  const detail = body && typeof body.detail === 'string' ? body.detail : null;
  if (status === 429) return {kind: 'rate_limited', text: detail || copy.rateLimited};
  if (status === 503) return {kind: body?.code === 'busy' ? 'busy' : 'unavailable', text: detail || copy.busy};
  if (status === 422 && body?.code === 'turn_limit') return {kind: 'turn_limit', text: detail || copy.turnLimit};
  if (status === 422) return {kind: 'invalid', text: copy.tooLong};
  if (status === 403) return {kind: 'verification', text: detail || copy.verification};
  return {kind: 'network', text: copy.network};
}

/** Splits text so the booking link can be rendered as a real link (never as HTML). */
export function linkParts(text) {
  const parts = [];
  let rest = String(text);
  for (;;) {
    const index = rest.indexOf(BOOKING_URL);
    if (index === -1) break;
    if (index > 0) parts.push({text: rest.slice(0, index)});
    parts.push({link: BOOKING_URL});
    rest = rest.slice(index + BOOKING_URL.length);
  }
  if (rest) parts.push({text: rest});
  return parts;
}
