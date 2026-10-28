(() => {
  const dictionary = window.casebridgeTranslations || {};
  const languageButtons = [...document.querySelectorAll('[data-language]')];
  if (!languageButtons.length) return;

  const monthNames = {Jan:'Oca',Feb:'Şub',Mar:'Mar',Apr:'Nis',May:'May',Jun:'Haz',Jul:'Tem',Aug:'Ağu',Sep:'Eyl',Oct:'Eki',Nov:'Kas',Dec:'Ara'};
  const patterns = [
    [/^SELECTED YEAR · (\d{4})$/, (_, year) => `SEÇİLEN YIL · ${year}`],
    [/^Data licensing makes up ([\d.]+)% of modeled revenue\. All figures are planning targets\.$/, (_, share) => `Modellenen gelirin veri lisanslama payı %${share}. Tüm rakamlar planlama hedefidir.`],
    [/^Stress case: zero data licensing and zero variable lab\/data costs\. Subscription and assumed marketplace activity remain\. Year-5 revenue: (\$[\d,]+); operating result: ([-−]?\$[\d,]+)\.$/, (_, revenue, result) => `Olumsuz senaryo: veri lisanslama geliri ile değişken laboratuvar ve veri giderleri sıfır. Abonelikler ve varsayılan pazar yeri faaliyetleri sürer. Beşinci yıl geliri: ${revenue}; faaliyet sonucu: ${result}.`],
    [/^Selected scenario: first 24 months modeled operating burn ([-−]?\$[\d,]+); peak cumulative operating funding need (\$[\d,]+); additional need beyond \$1\.5m seed (\$[\d,]+)\. Timing, collection delays and contract delivery can require more cash\. Seed is not deducted from operating expense\.$/, (_, burn, peak, extra) => `Seçilen senaryoda ilk 24 ayın modellenen faaliyet açığı ${burn}; en yüksek kümülatif finansman ihtiyacı ${peak}; 1,5 milyon dolarlık tohum yatırımının üzerindeki ek ihtiyaç ${extra}. Tahsilat gecikmeleri ve sözleşme teslimatı daha fazla nakit gerektirebilir. Tohum yatırımı faaliyet giderinden düşülmez.`],
    [/^Potential outreach examples: (.+) This stress scenario assumes zero licensing receipts\.$/, (_, main) => `${translate(main)} Bu olumsuz senaryo, lisanslama gelirinin sıfır olduğunu varsayar.`],
    [/^Year (\d+) annual (revenue|cost)$/, (_, year, kind) => `${year}. yıl yıllık ${kind === 'revenue' ? 'gelir' : 'gider'}`],
    [/^(\d+) buyers × (\$[\d,]+) per year$/, (_, count, amount) => `${count} alıcı × yıllık ${amount}`],
    [/^([\d,]+) average paying firms × \$1,200\/year$/, (_, count) => `${count} ortalama ücretli hukuk bürosu × yıllık $1,200`],
    [/^([\d,]+) average companies × \$6,000\/year$/, (_, count) => `${count} ortalama şirket × yıllık $6,000`],
    [/^(\d+)% of ([\d,]+) orders × \$5,000 × 10%$/, (_, share, count) => `${count} siparişin %${share}’i × $5,000 × %10`],
    [/^(.+) annual detail$/, (_, label) => `${translate(label)} yıllık ayrıntıları`],
    [/^Target segments: Turkish law firms and international-trade company legal teams\. Year-end target: ([\d,]+) firms \+ ([\d,]+) companies; annual revenue uses the average paying base, not the year-end count\. Current traction remains the three-firm POC; future accounts are not contracted\.$/, (_, firms, companies) => `Hedef gruplar Türk hukuk büroları ve uluslararası ticaret şirketlerinin hukuk ekipleridir. Yıl sonu hedefi: ${firms} hukuk bürosu ve ${companies} şirket. Yıllık gelir, yıl sonu sayısını değil ortalama ücretli müşteri tabanını kullanır. Mevcut ilerleme üç bürolu kavram kanıtıdır; gelecek hesaplar için sözleşme imzalanmamıştır.`],
    [/^Potential purchasers: participating firms and cross-border companies buying optional third-party tools and operational services\. ([\d,]+) orders × \$5,000 = (\$[\d,]+) gross marketplace volume; only the assumed 10% fee is revenue\. Suppliers receive the remaining 90%, which is not counted as CaseBridge revenue or expense\. This marketplace is planned; no supplier agreements, legal referrals or outcome fees are assumed\.$/, (_, count, amount) => `Olası alıcılar, isteğe bağlı üçüncü taraf araçları ve hizmetleri satın alan hukuk büroları ile sınır ötesi şirketlerdir. ${count} sipariş × $5,000 = ${amount} brüt pazar yeri hacmi; yalnızca varsayılan %10 komisyon gelirdir. Kalan %90 tedarikçilere aittir ve CaseBridge geliri veya gideri sayılmaz. Pazar yeri plan aşamasındadır; tedarikçi anlaşmaları, hukuki yönlendirmeler veya sonuca bağlı ücretler varsayılmaz.`],
    [/^(.*?)\. (.*?) ends at ([^;]+); (.*?) ends at ([^.]+)\.$/, (_, heading, first, firstValue, second, secondValue) => `${translate(heading)}. ${translate(first)} ${firstValue} düzeyinde; ${translate(second)} ${secondValue} düzeyinde bitiyor.`],
    [/^(\d+) modeled lab license contract\(s\)\. Team and customers are month-end targets\.$/, (_, count) => `${count} planlanan laboratuvar lisans sözleşmesi. Ekip ve müşteri sayıları ay sonu hedefleridir.`],
    [/^([\d.]+)% YoY$/, (_, value) => `%${value} yıllık büyüme`],
    [/^Year (\d+) · (\d{4})$/, (_, n, year) => `${n}. Yıl · ${year}`],
    [/^YEAR (\d+) · (\d{4})$/, (_, n, year) => `${n}. YIL · ${year}`],
    [/^(.*?) · (\$?[\d,]+)$/, (_, label, amount) => `${translate(label)} · ${amount}`],
    [/^Year (\d+) at a glance$/, (_, n) => `${n}. yıla genel bakış`],
    [/^Year (\d+) · (\d{4}) — (.+) (revenue|operating costs)$/, (_, n, year, amount, kind) => `${n}. Yıl · ${year} — ${amount} ${kind === 'revenue' ? 'gelir' : 'faaliyet gideri'}`],
    [/^Explore (\d{4}) month by month ↘$/, (_, year) => `${year} yılını ay ay inceleyin ↘`],
    [/^(\d+) firms · (\d+) companies$/, (_, firms, companies) => `${firms} hukuk bürosu · ${companies} şirket`],
    [/^(\d+) modeled lab license contract\(s\)\. Team and customers are month-end targets\.$/, (_, count) => `${count} modellenmiş laboratuvar lisans sözleşmesi. Ekip ve müşteri sayıları ay sonu hedefleridir.`],
    [/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)( \d{4})?$/, (_, month, year = '') => monthNames[month] + year],
    [/^(\d{4}-\d{2}) · (.+): (.+)$/, (_, date, label, value) => `${date} · ${dictionary[label] || label}: ${value}`],
    [/^(\d{4}-\d{2}) · revenue (.+)$/, (_, date, amount) => `${date} · gelir ${amount}`],
    [/^([\d.,]+)% · Details ↗$/, (_, value) => `${value}% · Ayrıntılar ↗`],
    [/^Risk planning: (\d+) on-call FTE; cash buffer target (.+)\.$/, (_, people, amount) => `Risk planı: ${people} hazır bekleyen tam zaman eşdeğer çalışan; nakit tamponu hedefi ${amount}.`]
  ];
  const fragments = [
    ['Risk case','Risk senaryosu'],['Starter reserve','Başlangıç rezervi'],['With standby','Yedek kapasiteyle'],
    ['Active team','Aktif ekip'],['Base plan','Temel plan'],['Base','Temel'],['Target','Hedef'],
    ['annual revenue','yıllık gelir'],['annual cost','yıllık gider'],['operating costs','faaliyet giderleri'],
    ['revenue','gelir'],['cost','gider'],['firms','hukuk bürosu'],['companies','şirket']
  ];

  function translate(value) {
    if (!value || !/[A-Za-z]/.test(value)) return value;
    for (const [pattern, format] of patterns) {
      if (pattern.test(value)) return value.replace(pattern, format);
    }
    if (dictionary[value]) return dictionary[value];
    let result = value;
    for (const [english, turkish] of fragments) {
      const escaped = english.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`\\b${escaped}\\b`, 'g'), turkish);
    }
    return result;
  }

  const textState = new WeakMap();
  const attributeState = new WeakMap();
  const attributes = ['aria-label', 'alt', 'title', 'placeholder'];
  let language = 'en';

  function translateText(node) {
    if (!node.nodeValue || !node.nodeValue.trim()) return;
    if (node.parentElement?.closest('script,style,.language-switch,.brand,.brand-lockup')) return;
    const current = node.nodeValue;
    let state = textState.get(node);
    if (!state || (current !== state.en && current !== state.tr)) {
      const match = current.match(/^(\s*)([\s\S]*?)(\s*)$/);
      const english = match[2];
      state = { en: current, tr: match[1] + translate(english) + match[3] };
      textState.set(node, state);
    }
    const next = language === 'tr' ? state.tr : state.en;
    if (current !== next) node.nodeValue = next;
  }

  function translateAttributes(element) {
    if (!element.getAttribute || element.closest('.language-switch')) return;
    let states = attributeState.get(element);
    if (!states) { states = new Map(); attributeState.set(element, states); }
    for (const name of element.matches?.('meta[name="description"]') ? [...attributes, 'content'] : attributes) {
      if (!element.hasAttribute(name)) continue;
      const current = element.getAttribute(name);
      let state = states.get(name);
      if (!state || (current !== state.en && current !== state.tr)) {
        state = { en: current, tr: translate(current) };
        states.set(name, state);
      }
      const next = language === 'tr' ? state.tr : state.en;
      if (current !== next) element.setAttribute(name, next);
    }
  }

  function apply(root) {
    if (root.nodeType === Node.TEXT_NODE) { translateText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root);
    const elements = root.querySelectorAll?.('[aria-label],[alt],[title],[placeholder],meta[name="description"]') || [];
    for (const element of elements) translateAttributes(element);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) translateText(walker.currentNode);
  }

  const englishTitle = document.title;
  function setLanguage(next, persist = true) {
    language = next === 'tr' ? 'tr' : 'en';
    document.documentElement.lang = language;
    for (const button of languageButtons) button.setAttribute('aria-pressed', String(button.dataset.language === language));
    document.title = language === 'tr' ? translate(englishTitle) : englishTitle;
    apply(document.body);
    const description = document.querySelector('meta[name="description"]');
    if (description) translateAttributes(description);
    if (persist) {
      try { localStorage.setItem('casebridge-language', language); } catch {}
      const url = new URL(location.href);
      if (url.searchParams.has('lang')) {
        url.searchParams.set('lang', language);
        history.replaceState(history.state, '', url);
      }
    }
    window.dispatchEvent(new CustomEvent('casebridge:languagechange', { detail: { language } }));
  }

  for (const button of languageButtons) button.addEventListener('click', () => setLanguage(button.dataset.language));
  const pending = new Set();
  let scheduled = false;
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData' || record.type === 'attributes') pending.add(record.target);
      else for (const node of record.addedNodes) pending.add(node);
    }
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      for (const node of pending) apply(node);
      pending.clear();
    });
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
  try { language = new URLSearchParams(location.search).get('lang') || localStorage.getItem('casebridge-language') || 'en'; } catch { language = 'en'; }
  setLanguage(language, false);
  window.casebridgeSetLanguage = setLanguage;
})();
