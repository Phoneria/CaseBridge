/* TR/EN language switch. Turkish is the default; English stays available.
   Copy lives in i18n-tr.js (window.casebridgeTR, keyed by the English text with the
   site's sentence-final dots removed) plus a few whole-element overrides
   (window.casebridgeTRHtml) where Turkish word order spans inline markup.
   Numbers and other generated copy go through the patterns below. */
(() => {
  const dictionary = window.casebridgeTR || {};
  const htmlOverrides = window.casebridgeTRHtml || {};
  const legacy = window.casebridgeTranslations || {};
  const languageButtons = [...document.querySelectorAll('[data-language]')];

  // Same rule as sentence-style.js, so both scripts agree on what a string is.
  const clean = text => text.replace(/\.(?=\s|$|[”’"')\]])/g, '');
  const squash = text => clean(text.replace(/\s+/g, ' ').trim());
  // Other scripts sometimes copy already-translated text into new nodes; map it back.
  const reverse = new Map();
  for (const [english, turkish] of Object.entries(dictionary)) if (turkish) { reverse.set(squash(turkish), english); reverse.set(turkish.replace(/\s+/g, ' ').trim(), english); }
  const legacyClean = new Map();
  for (const [english, turkish] of Object.entries(legacy)) legacyClean.set(squash(english), turkish);

  // "1,234.5" -> "1.234,5"
  const trNumber = value => value.replace(/,/g, '\u0000').replace(/\./g, ',').replace(/\u0000/g, '.');
  const units = { k: 'bin', m: 'mn', bn: 'mr', tn: 'tn' };
  function money(token) {
    const match = /^([−-]?)\$([\d.,]+)(k|m|bn|tn)?(\+?)$/.exec(token);
    if (!match) {
      const percent = /^([−-]?)([\d.,]+)%$/.exec(token);
      return percent ? `${percent[1]}%${trNumber(percent[2])}` : token;
    }
    const [, sign, amount, unit, plus] = match;
    return `${sign}${trNumber(amount)}${unit ? ' ' + units[unit] : ''} $${plus}`;
  }
  const numbers = text => text.replace(/[−-]?\$[\d.,]*\d(?:k|m|bn|tn)?\+?|[−-]?\d[\d.,]*%/g, money);

  const months = { Jan: 'Oca', Feb: 'Şub', Mar: 'Mar', Apr: 'Nis', May: 'May', Jun: 'Haz', Jul: 'Tem', Aug: 'Ağu', Sep: 'Eyl', Oct: 'Eki', Nov: 'Kas', Dec: 'Ara' };
  const series = { 'Base': 'Temel', 'Risk case': 'Risk senaryosu', 'Active team': 'Aktif ekip', 'With standby': 'Yedeklerle', 'Starter reserve': 'Başlangıç rezervi', 'Target': 'Hedef', 'Base plan': 'Temel plan' };
  const S = '(Base plan|Base|Risk case|Active team|With standby|Starter reserve|Target)';
  const patterns = [
    [new RegExp(`^(\\d{4}(?:-\\d{2})?) · ${S}: (.+)$`), (_, date, label, value) => `${date} · ${series[label]}: ${numbers(value)}`],
    [new RegExp(`^${S} · (.+)$`), (_, label, value) => `${series[label]} · ${numbers(value)}`],
    [new RegExp(`^(.+?) ${S} ends at ([^;]+); ${S} ends at (.+)$`), (_, heading, a, av, b, bv) => `${translate(heading)}. ${series[a]} ${numbers(av)}, ${series[b].toLowerCase()} ${numbers(bv)} düzeyinde bitiyor`],
    [/^(.+?) · Details ↗$/, (_, value) => `${numbers(value)} · Ayrıntılar ↗`],
    [/^Risk planning: (\d+) on-call FTE; cash buffer target (\S+)(?: Crisis: (.+) \((.+)\))?$/, (_, people, amount, crisis, cost) => `Risk planı: ${people} hazır bekleyen tam zamanlı eşdeğer kişi; nakit tamponu hedefi ${numbers(amount)}${crisis ? `. Kriz: ${translate(crisis)} (${numbers(cost)})` : ''}`],
    [/^([\d,]+) firms · ([\d,]+) companies$/, (_, f, c) => `${trNumber(f)} büro · ${trNumber(c)} şirket`],
    [/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) · revenue (.+)$/, (_, m, y, v) => `${months[m]} ${y} · gelir ${numbers(v)}`],
    [/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)( \d{4})?$/, (_, m, y = '') => months[m] + y],
    [/^([\d.,]+)% YoY$/, (_, v) => `yıllık %${trNumber(v)} büyüme`],
    [/^Year (\d+) · (\d{4}) — (.+) (revenue|operating costs)$/, (_, n, y, v, kind) => `Yıl ${n} · ${y} — ${numbers(v)} ${kind === 'revenue' ? 'gelir' : 'faaliyet gideri'}`],
    [/^(\d+)% of ([\d,]+) orders × (\$[\d,]+) × (\d+)%$/, (_, share, count, value, fee) => `${trNumber(count)} siparişin %${share}’i × ${numbers(value)} × %${fee}`],
    [/^SELECTED YEAR · (\d{4})$/, (_, y) => `SEÇİLEN YIL · ${y}`],
    [/^YEAR (\d+) · (\d{4})$/, (_, n, y) => `YIL ${n} · ${y}`],
    [/^Year (\d+) · (\d{4})$/, (_, n, y) => `Yıl ${n} · ${y}`],
    [/^Year (\d+) at a glance$/, (_, n) => `Yıl ${n}${{1:'’e',2:'’ye',3:'’e',4:'’e',5:'’e'}[n] || '’e'} genel bakış`],
    [/^Year (\d+) annual (revenue|cost)$/, (_, n, kind) => `Yıl ${n} yıllık ${kind === 'revenue' ? 'gelir' : 'gider'}`],
    [/^Y(\d+) \/ (\d{4}) ↗$/, (_, n, y) => `Yıl ${n} / ${y} ↗`],
    [/^(\d+) buyers × (\S+) per year$/, (_, n, v) => `${n} alıcı × yıllık ${numbers(v)}`],
    [/^(\d+) modeled lab license contract\(s\) Team and customers are month-end targets$/, (_, n) => `${n} modellenen laboratuvar lisans sözleşmesi. Ekip ve müşteri sayıları ay sonu hedefleridir.`],
    [/^(\S+) \/ year$/, (_, v) => `yıllık ${numbers(v)}`],
    [/^Data licensing makes up (\S+) of modeled revenue All figures are planning targets$/, (_, v) => `Modellenen gelirin ${numbers(v)} kadarı veri lisanslamadan gelir. Tüm rakamlar planlama hedefidir.`],
    [/^Explore (\d{4}) month by month ↘$/, (_, y) => `${y} yılını ay ay inceleyin ↘`],
    [/^Target ([\d,]+) firms, ([\d,]+) companies and (\d+) buyer contracts$/, (_, f, c, b) => `${trNumber(f)} büro, ${trNumber(c)} şirket ve ${b} alıcı sözleşmesi hedefle`],
    [/^([\d,]+) average paying firms × \$1,200\/year$/, (_, n) => `${trNumber(n)} ortalama ücretli hukuk bürosu × yıllık 1.200 $`],
    [/^([\d,]+) average companies × \$6,000\/year$/, (_, n) => `${trNumber(n)} ortalama şirket × yıllık 6.000 $`],
    [/^Selected scenario: first 24 months modeled operating burn (\S+); peak cumulative operating funding need (\S+); additional need beyond \$1\.5m seed (\S+) Timing, collection delays and contract delivery can require more cash Seed is not deducted from operating expense$/,
      (_, burn, peak, extra) => `Seçilen senaryo: ilk 24 ayda modellenen faaliyet açığı ${numbers(burn)}; en yüksek kümülatif faaliyet finansmanı ihtiyacı ${numbers(peak)}; 1,5 milyon $’lık tohum yatırımın üzerindeki ek ihtiyaç ${numbers(extra)}. Zamanlama, tahsilat gecikmeleri ve sözleşme teslimatı daha fazla nakit gerektirebilir. Tohum yatırım faaliyet giderlerinden düşülmez.`],
    [/^Stress case: zero data licensing and zero variable lab\/data costs Subscription and assumed marketplace activity remain Year-5 revenue: (\S+); operating result: (\S+)$/,
      (_, revenue, result) => `Stres senaryosu: veri lisanslama geliri ile değişken laboratuvar/veri giderleri sıfır. Abonelikler ve varsayılan pazar yeri faaliyeti sürer. Yıl 5 geliri: ${numbers(revenue)}; faaliyet sonucu: ${numbers(result)}`],
    [/^Potential purchasers: participating firms and cross-border companies buying optional third-party tools and operational services ([\d,]+) orders × \$5,000 = (\S+) gross marketplace volume; only the assumed 10% fee is revenue Suppliers receive the remaining 90%, which is not counted as CaseBridge revenue or expense This marketplace is planned; no supplier agreements, legal referrals or outcome fees are assumed$/,
      (_, count, volume) => `Olası alıcılar: isteğe bağlı üçüncü taraf araçları ve operasyonel hizmetler satın alan katılımcı bürolar ve sınır ötesi şirketler. ${trNumber(count)} sipariş × 5.000 $ = ${numbers(volume)} brüt pazar yeri hacmi; yalnızca varsayılan %10 komisyon gelirdir. Kalan %90 tedarikçilere gider ve CaseBridge geliri ya da gideri sayılmaz. Pazar yeri planlama aşamasındadır; tedarikçi anlaşması, hukuki yönlendirme ya da sonuca bağlı ücret varsayılmaz.`],
    [/^Target segments: Turkish law firms and international-trade company legal teams Year-end target: ([\d,]+) firms \+ ([\d,]+) companies; annual revenue uses the average paying base, not the year-end count Current traction remains the three-firm POC; future accounts are not contracted$/,
      (_, f, c) => `Hedef segmentler: Türk hukuk büroları ve uluslararası ticaret yapan şirketlerin hukuk ekipleri. Yıl sonu hedefi: ${trNumber(f)} büro + ${trNumber(c)} şirket; yıllık gelir yıl sonu sayısını değil, ortalama ücretli müşteri tabanını kullanır. Mevcut ilerleme üç bürolu kavram kanıtıdır; gelecekteki hesaplar sözleşmeye bağlanmamıştır.`],
    [/^Potential outreach examples: (.+?)(?: This stress scenario assumes zero licensing receipts)?$/, (whole, main) => {
      const suffix = / This stress scenario assumes zero licensing receipts$/.test(whole) ? ' Bu stres senaryosu lisans tahsilatının sıfır olduğunu varsayar.' : '';
      const body = lookup(`Potential outreach examples: ${main}`);
      return body ? body + suffix : null;
    }],
  ];

  function lookup(key) {
    if (Object.prototype.hasOwnProperty.call(dictionary, key)) return dictionary[key];
    if (legacyClean.has(key)) return legacyClean.get(key);
    return undefined;
  }

  function translate(value) {
    const key = squash(value);
    if (!key || !/[A-Za-z]/.test(key)) return numbers(key);
    if (Object.prototype.hasOwnProperty.call(dictionary, key)) return dictionary[key] === null ? key : dictionary[key];
    if (/^[−-]?\$[\d.,]+(?:k|m|bn|tn)?\+?$/.test(key)) return numbers(key);
    for (const [pattern, format] of patterns) {
      const match = key.match(pattern);
      if (!match) continue;
      const result = format(...match);
      if (result) return result;
    }
    // Older dictionaries (i18n-data.js, i18n-details.js) only as a last resort.
    return legacyClean.has(key) ? legacyClean.get(key) : key;
  }

  const textState = new WeakMap();
  const attributeState = new WeakMap();
  const attributes = ['aria-label', 'alt', 'title', 'placeholder'];
  const skip = 'script,style,.language-switch,.brand,.brand-lockup,[data-i18n-html]';
  let language = 'tr';

  const ws = text => text.replace(/\s+/g, ' ').trim();
  function sameCopy(a, b) { return a === b || ws(a) === ws(b) || squash(a) === squash(b); }

  function translateText(node) {
    if (!node.nodeValue || !node.nodeValue.trim()) return;
    if (node.parentElement?.closest(skip)) return;
    const current = node.nodeValue;
    let state = textState.get(node);
    if (!state || (!sameCopy(current, state.en) && !sameCopy(current, state.tr))) {
      const [, lead, body, tail] = current.match(/^(\s*)([\s\S]*?)(\s*)$/);
      const english = reverse.get(body.replace(/\s+/g, ' ').trim()) || reverse.get(squash(body));
      state = english ? { en: lead + english + tail, tr: current } : { en: current, tr: lead + translate(body) + tail };
      textState.set(node, state);
    }
    const next = language === 'tr' ? state.tr : state.en;
    if (!sameCopy(current, next)) node.nodeValue = next;
  }

  function translateAttributes(element) {
    if (!element.getAttribute || element.closest('.language-switch')) return;
    let states = attributeState.get(element);
    if (!states) { states = new Map(); attributeState.set(element, states); }
    const names = element.matches?.('meta[name="description"]') ? ['content'] : attributes;
    for (const name of names) {
      if (!element.hasAttribute(name)) continue;
      const current = element.getAttribute(name);
      let state = states.get(name);
      if (!state || (!sameCopy(current, state.en) && !sameCopy(current, state.tr))) {
        const english = reverse.get(current.replace(/\s+/g, ' ').trim()) || reverse.get(squash(current));
        state = english ? { en: english, tr: current } : { en: current, tr: translate(current) };
        states.set(name, state);
      }
      const next = language === 'tr' ? state.tr : state.en;
      if (!sameCopy(current, next)) element.setAttribute(name, next);
    }
  }

  // Whole-element overrides for headings and sentences whose Turkish word order
  // spans inline markup. The English markup is restored on switching back.
  const htmlState = new WeakMap();
  const htmlSelector = 'h1,h2,h3,h4,p,figcaption';
  function translateHtml(element) {
    let state = htmlState.get(element);
    if (!state) {
      const copy = element.cloneNode(true);
      copy.querySelectorAll('br').forEach(br => br.replaceWith(' '));
      const turkish = htmlOverrides[squash(copy.textContent)];
      if (!turkish) return;
      state = { en: element.innerHTML, tr: turkish };
      htmlState.set(element, state);
    }
    const next = language === 'tr' ? state.tr : state.en;
    if (language === 'tr') element.setAttribute('data-i18n-html', ''); else element.removeAttribute('data-i18n-html');
    if (element.innerHTML !== next) element.innerHTML = next;
  }

  function apply(root) {
    if (root.nodeType === Node.TEXT_NODE) { translateText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (root.matches(htmlSelector)) translateHtml(root);
      translateAttributes(root);
    }
    root.querySelectorAll?.(htmlSelector).forEach(translateHtml);
    root.querySelectorAll?.('[aria-label],[alt],[title],[placeholder]').forEach(translateAttributes);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) translateText(walker.currentNode);
  }

  const englishTitle = document.title;
  function setLanguage(next, persist = true) {
    language = next === 'en' ? 'en' : 'tr';
    document.documentElement.lang = language;
    for (const button of languageButtons) button.setAttribute('aria-pressed', String(button.dataset.language === language));
    document.title = language === 'tr' ? translate(englishTitle) : englishTitle;
    apply(document.body);
    const description = document.querySelector('meta[name="description"]');
    if (description) translateAttributes(description);
    if (persist) {
      try { localStorage.setItem('casebridge-language', language); } catch {}
      const url = new URL(location.href);
      if (url.searchParams.has('lang')) { url.searchParams.set('lang', language); history.replaceState(history.state, '', url); }
    }
    window.dispatchEvent(new CustomEvent('casebridge:languagechange', { detail: { language } }));
  }

  for (const button of languageButtons) button.addEventListener('click', () => setLanguage(button.dataset.language));
  const pending = new Set();
  let scheduled = false;
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData' || record.type === 'attributes') pending.add(record.target);
      else for (const node of record.addedNodes) pending.add(node);
    }
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      for (const node of pending) if (node.isConnected) apply(node);
      pending.clear();
    });
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });

  let initial = 'tr';
  try { initial = new URLSearchParams(location.search).get('lang') || localStorage.getItem('casebridge-language') || 'tr'; } catch {}
  setLanguage(initial, false);
  window.casebridgeSetLanguage = setLanguage;
  window.casebridgeTranslate = translate;
})();
