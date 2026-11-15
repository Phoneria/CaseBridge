/* Interactive SVG mind map, integrated with the existing TR/EN translator. */
(() => {
  const root=document.querySelector('[data-case-map]');
  if(!root)return;
  const branches=[
    {id:'evidence',title:'Evidence & facts',tr:'Deliller ve olgular',color:'#007f82',x:230,y:200,leaves:[['Payment records','Ödeme kayıtları',75,82],['Correspondence','Yazışmalar',76,144],['Notice & delivery','İhtar ve tebliğ',72,245]],action:'Connect each claim to its evidence.',actionTr:'Her iddiayı dayandığı delille ilişkilendir.',note:'Bring documents, events and disputed facts into the same picture.',noteTr:'Belgeleri, olayları ve tartışmalı olguları aynı çerçevede birleştir.'},
    {id:'perspectives',title:'Four perspectives',tr:'Dört bakış açısı',color:'#007f82',x:455,y:130,leaves:[['Researcher','Araştırmacı',280,25],['Plaintiff counsel','Davacı vekili',450,15],['Defendant counsel','Davalı vekili',620,25],['Judge’s perspective','Hâkim bakışı',650,92]],action:'Examine the same case from four sides.',actionTr:'Aynı dosyayı dört farklı açıdan incele.',note:'Keep supporting arguments, objections and uncertainty visible together.',noteTr:'Destekleyici argümanları, itirazları ve belirsizliği birlikte görünür tut.'},
    {id:'opposition',title:'Opposing arguments',tr:'Karşı argümanlar',color:'#007f82',x:690,y:230,leaves:[['Alternative explanation','Alternatif açıklama',809,145],['Evidence challenged','Delile itiraz',813,280],['Prepare a rebuttal','Yanıt hazırlığı',807,345]],action:'Prepare for the argument you may face.',actionTr:'Karşılaşabileceğin argümana hazırlan.',note:'Test another explanation and identify what would support a response.',noteTr:'Alternatif açıklamayı sına ve yanıtını destekleyecek dayanakları belirle.'},
    {id:'preparation',title:'Hearing preparation',tr:'Duruşma hazırlığı',color:'#007f82',x:676,y:438,leaves:[['Present evidence','Delil sunumu',810,398],['Rehearse objections','İtiraz provası',809,487],['Review feedback','Geri bildirim',771,548]],action:'Rehearse before the hearing.',actionTr:'Duruşmadan önce prova yap.',note:'Practice a fictional hearing and review evidence use and responses.',noteTr:'Kurgusal duruşmada çalış; delil kullanımını ve cevaplarını değerlendir.'},
    {id:'actions',title:'Your next move',tr:'Sonraki adımın',color:'#007f82',x:445,y:515,leaves:[['Request a document','Belge talebi',311,596],['Verify a fact','Olgu doğrulama',462,619],['Update the strategy','Strateji güncelleme',614,588]],action:'Turn the analysis into a concrete next step.',actionTr:'Analizi somut bir sonraki adıma dönüştür.',note:'Link open questions to document requests, verification and preparation.',noteTr:'Açık soruları belge taleplerine, doğrulamaya ve hazırlığa bağla.'},
    {id:'gaps',title:'Missing information',tr:'Eksik bilgiler',color:'#007f82',x:218,y:420,leaves:[['Signed agreement','İmzalı sözleşme',79,365],['Delivery date','Tebliğ tarihi',74,470],['Unanswered questions','Cevapsız sorular',109,527]],action:'See what the file still needs.',actionTr:'Dosyada hâlâ neyin eksik olduğunu gör.',note:'Surface missing documents and unresolved dates before relying on them.',noteTr:'Eksik belgeleri ve doğrulanmamış tarihleri, onlara dayanmadan önce belirle.'}
  ];
  Object.assign(window.casebridgeTranslations,{
    'Interactive CaseBridge case map':'Etkileşimli CaseBridge dava haritası',
    'CONNECTED CASE INTELLIGENCE':'BAĞLANTILI DAVA ANALİZİ',
    'Your case, connected.':'Dosyanız, tüm bağlantılarıyla.',
    'YOUR CASE FILE':'DAVA DOSYANIZ',
    'Facts → perspectives → preparation':'Olgular → bakış açıları → hazırlık',
    'Select a branch to explore':'Keşfetmek için bir dal seç',
    'Illustrative case map · Lawyer review required':'Örnek dava haritası · Avukat incelemesi gerekir',
    ...Object.fromEntries(branches.flatMap(b=>[[b.title,b.tr],[b.action,b.actionTr],[b.note,b.noteTr],...b.leaves.map(l=>[l[0],l[1]])]))
  });
  const center={x:450,y:325};
  const curve=(a,b)=>{const mid=(a.x+b.x)/2;return `M${a.x},${a.y} C${mid},${a.y} ${mid},${b.y} ${b.x},${b.y}`;};
  root.innerHTML=`<svg class="mm-map" viewBox="0 0 900 660" role="group" aria-label="Interactive CaseBridge case map"><defs><filter id="mm-shadow" x="-30%" y="-40%" width="160%" height="190%"><feDropShadow dx="0" dy="4" stdDeviation="7" flood-color="#142d4e" flood-opacity=".07"/></filter><radialGradient id="mm-glow"><stop offset="0" stop-color="#e8f4f8" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><ellipse cx="450" cy="325" rx="350" ry="280" fill="url(#mm-glow)"/><g class="mm-crosslinks" aria-hidden="true"><path d="M76 144 C55 300 160 310 79 365"/><path d="M72 245 C230 265 230 530 311 596"/><path d="M620 25 C760 5 885 44 809 145"/><path d="M807 345 C870 350 875 370 810 398"/><path d="M109 527 C150 620 200 650 311 596"/><path d="M650 92 C750 330 510 370 614 588"/></g>${branches.map(b=>`<g class="mm-branch" data-mm-branch="${b.id}" style="--branch:${b.color}"><path class="mm-trunk" d="${curve(center,b)}"/>${b.leaves.map(l=>`<path class="mm-twig" d="${curve(b,{x:l[2],y:l[3]})}"/>`).join('')}</g>`).join('')}<g class="mm-orbit" aria-hidden="true"><circle cx="450" cy="325" r="110"/><circle cx="450" cy="325" r="129"/></g>${branches.map(b=>`<g class="mm-labels" data-mm-branch="${b.id}" style="--branch:${b.color}">${b.leaves.map(l=>`<g class="mm-leaf" role="button" tabindex="0" aria-label="${l[0]}" data-mm-select="${b.id}" transform="translate(${l[2]},${l[3]})"><rect x="-76" y="-17" width="152" height="34" rx="17"/><circle cx="-61" cy="0" r="2.5"/><text x="-51" y="4">${l[0]}</text></g>`).join('')}<g class="mm-topic" role="button" tabindex="0" aria-label="${b.title}" aria-pressed="false" data-mm-select="${b.id}" transform="translate(${b.x},${b.y})"><rect x="-85" y="-22" width="170" height="44" rx="8"/><circle cx="-69" cy="0" r="3"/><text x="-57" y="4">${b.title}</text><circle class="mm-junction" cx="${b.x>450?-85:85}" cy="0" r="3"/></g></g>`).join('')}<g class="mm-center" transform="translate(450,325)"><rect x="-92" y="-43" width="184" height="86" rx="13" filter="url(#mm-shadow)"/><text class="mm-center-kicker" x="0" y="-17" text-anchor="middle">YOUR CASE FILE</text><image href="assets/casebridge-e2e.svg?v=2" x="-80" y="-13" width="160" height="46" preserveAspectRatio="xMidYMid meet" role="img" aria-label="CaseBridge"/></g><g class="mm-float-points" aria-hidden="true"><circle cx="354" cy="228" r="3"/><circle cx="552" cy="401" r="2.5"/><circle cx="311" cy="359" r="2"/><circle cx="548" cy="212" r="2"/></g></svg>`;
  const caption=document.createElement('figcaption');
  caption.className='map-explanation';
  caption.id='map-explanation';
  root.append(caption);
  root.querySelectorAll('[data-mm-select]').forEach(node=>node.setAttribute('aria-describedby',caption.id));
  function select(id, pinned=false){
    if(pinned) root.dataset.pinnedBranch=id;
    const branch=branches.find(item=>item.id===id);
    const heading=document.createElement('strong'), note=document.createElement('span');
    heading.textContent=branch.action; note.textContent=branch.note;
    caption.replaceChildren(heading,note);
    root.querySelectorAll('[data-mm-branch]').forEach(g=>g.classList.toggle('is-selected',g.dataset.mmBranch===id));
    root.querySelectorAll('.mm-topic').forEach(g=>g.setAttribute('aria-pressed',String(g.dataset.mmSelect===id)));
  }
  root.addEventListener('click',e=>{const node=e.target.closest('[data-mm-select]');if(node)select(node.dataset.mmSelect,true);});
  root.addEventListener('keydown',e=>{const node=e.target.closest('[data-mm-select]');if(node&&(e.key==='Enter'||e.key===' ')){e.preventDefault();select(node.dataset.mmSelect,true);}});
  select('gaps');
  startLivingMap();

  function startLivingMap() {
    const svg = root.querySelector('.mm-map');
    const ns = 'http://www.w3.org/2000/svg';
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const narrow = matchMedia('(max-width: 600px)');
    const make = (tag, attributes) => {
      const element = document.createElementNS(ns, tag);
      Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
      return element;
    };
    const geometry = branches.map((branch, index) => ({
      branch, index,
      labels: svg.querySelector(`.mm-labels[data-mm-branch="${branch.id}"]`),
      lines: svg.querySelector(`.mm-branch[data-mm-branch="${branch.id}"]`),
      dx: 0, dy: 0
    }));
    geometry.forEach(item => {
      item.trunk = item.lines.querySelector('.mm-trunk');
      item.twigs = [...item.lines.querySelectorAll('.mm-twig')];
    });
    const byId = Object.fromEntries(geometry.map(item => [item.branch.id, item]));
    const centerNode = svg.querySelector('.mm-center');
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    let pointer = null;
    const raisedNodes = [];
    geometry.forEach(item => {
      const nodes = [...item.labels.querySelectorAll('.mm-leaf,.mm-topic')];
      nodes.forEach(node => {
        const isTopic = node.classList.contains('mm-topic');
        const leafIndex = isTopic ? -1 : [...item.labels.querySelectorAll('.mm-leaf')].indexOf(node);
        raisedNodes.push({ node, item, leafIndex, isTopic, amount: 0 });
      });
    });
    raisedNodes.push({ node: centerNode, isCenter: true, amount: 0 });
    raisedNodes.forEach(record => {
      const surface = make('g', { class: 'mm-node-surface' });
      while (record.node.firstChild) surface.append(record.node.firstChild);
      record.node.append(surface);
      record.surface = surface;
    });
    function resetProximity() {
      pointer = null;
      raisedNodes.forEach(record => {
        record.amount = 0;
        record.surface.removeAttribute('transform');
        record.surface.style.removeProperty('filter');
        record.surface.classList.remove('has-proximity');
        record.node.dataset.proximity = '0';
      });
    }
    function renderProximity() {
      raisedNodes.forEach(record => {
        let x = center.x, y = center.y;
        if (!record.isCenter) {
          const anchor = record.leafIndex < 0 ? record.item.branch : {
            x: record.item.branch.leaves[record.leafIndex][2], y: record.item.branch.leaves[record.leafIndex][3]
          };
          x = anchor.x + record.item.dx; y = anchor.y + record.item.dy;
        }
        const distance = pointer ? Math.hypot(pointer.x - x, pointer.y - y) : Infinity;
        const near = Math.max(0, 1 - distance / 160);
        const directlyOver = pointer?.target === record.node;
        const keyboardFocus = document.activeElement === record.node;
        const target = Math.max(near * near, directlyOver ? .8 : 0, keyboardFocus ? .8 : 0);
        if (target === 0 && record.amount === 0) return;
        record.amount += (target - record.amount) * .22;
        if (record.amount < .002) record.amount = 0;
        const amount = record.amount;
        const scale = 1 + amount * (record.isCenter ? .065 : record.isTopic ? .12 : .15);
        record.surface.setAttribute('transform', `translate(0 ${(-amount * 4).toFixed(3)}) scale(${scale.toFixed(4)})`);
        record.surface.classList.toggle('has-proximity', amount > .08);
        if (amount > .01) record.surface.style.filter = `drop-shadow(0 ${(amount * 5).toFixed(2)}px ${(amount * 7).toFixed(2)}px rgba(20,45,78,${(amount * .24).toFixed(3)}))`;
        else record.surface.style.removeProperty('filter');
        record.node.dataset.proximity = amount.toFixed(3);
      });
    }
    svg.addEventListener('pointermove', event => {
      if (!finePointer.matches || event.pointerType === 'touch' || motion.matches) return;
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
      const local = point.matrixTransform(matrix.inverse());
      pointer = { x: local.x, y: local.y, target: event.target.closest('.mm-topic,.mm-leaf,.mm-center') };
    });
    svg.addEventListener('pointerleave', () => { pointer = null; });
    finePointer.addEventListener('change', resetProximity);

    const layer = make('g', { class: 'mm-flow-layer', 'aria-hidden': 'true' });
    const wave = make('circle', { class: 'mm-center-wave', cx: center.x, cy: center.y, r: 60, opacity: 0 });
    layer.append(wave);
    // A few overlapping signals tell the same 14-second story without a visual reset.
    const schedule = [
      { branch: 'evidence', leaf: 0, start: 0, duration: 3.4, inbound: true },
      { branch: 'evidence', leaf: 1, start: .9, duration: 3.4, inbound: true },
      { branch: 'gaps', leaf: 0, start: 1.7, duration: 3.4, inbound: true },
      { branch: 'perspectives', leaf: 2, start: 5.0, duration: 3.2 },
      { branch: 'opposition', leaf: 1, start: 6.3, duration: 3.2 },
      { branch: 'preparation', leaf: 1, start: 9.0, duration: 3.8 },
      { branch: 'actions', leaf: 2, start: 10.7, duration: 3.8 }
    ];
    const signals = [...schedule, { focused: true }].map((timing, index) => {
      const node = make('g', { class: 'mm-flow-particle', opacity: 0, 'data-flow-signal': index });
      node.append(make('circle', { class: 'mm-signal-halo', r: 12 }), make('circle', { class: 'mm-signal-core', r: 3.5 }));
      if (index % 2 === 0 || timing.focused) node.append(make('path', { class: 'mm-signal-arrow', d: 'M10 0 L-5 -7 L-5 7 Z' }));
      layer.append(node);
      return { ...timing, node };
    });
    svg.insertBefore(layer, svg.querySelector('.mm-labels'));
    const crosslinks = [...svg.querySelectorAll('.mm-crosslinks path')];
    const links = [
      ['evidence', 1, 'gaps', 0, 55, 300, 160, 310],
      ['evidence', 2, 'actions', 0, 230, 265, 230, 530],
      ['perspectives', 2, 'opposition', 0, 760, 5, 885, 44],
      ['opposition', 2, 'preparation', 0, 870, 350, 875, 370],
      ['gaps', 2, 'actions', 0, 150, 620, 200, 650],
      ['perspectives', 3, 'actions', 2, 750, 330, 510, 370]
    ];
    // Evaluate the same cubic curves used by the SVG, avoiding per-frame layout reads.
    function point(a, b, t) {
      const mid = (a.x + b.x) / 2, u = 1 - t;
      return {
        x: u*u*u*a.x + 3*u*u*t*mid + 3*u*t*t*mid + t*t*t*b.x,
        y: u*u*u*a.y + 3*u*u*t*a.y + 3*u*t*t*b.y + t*t*t*b.y
      };
    }
    function position(item, leafIndex, progress, inbound) {
      const branch = { x: item.branch.x + item.dx, y: item.branch.y + item.dy };
      const leaf = item.branch.leaves[leafIndex];
      const end = { x: leaf[2] + item.dx, y: leaf[3] + item.dy };
      const t = inbound ? 1 - progress : progress;
      return t < .55 ? point(center, branch, t / .55) : point(branch, end, (t - .55) / .45);
    }
    let visible = false, frame = 0, last = 0, elapsed = 0, lastPaint = -1;
    let hovered = null, focused = null;
    const engaged = () => hovered || focused || root.dataset.pinnedBranch || null;
    function drift(time, enabled = true) {
      geometry.forEach(item => {
        const phase = item.index * 1.3;
        item.dx = enabled ? Math.sin(time * .55 + phase) * 2.8 : 0;
        item.dy = enabled ? Math.sin(time * .43 + phase + .8) * 3.5 : 0;
        const anchor = { x: item.branch.x + item.dx, y: item.branch.y + item.dy };
        item.labels.setAttribute('transform', `translate(${item.dx.toFixed(3)} ${item.dy.toFixed(3)})`);
        item.trunk.setAttribute('d', curve(center, anchor));
        item.twigs.forEach((twig, i) => {
          const leaf = item.branch.leaves[i];
          twig.setAttribute('d', curve(anchor, { x: leaf[2] + item.dx, y: leaf[3] + item.dy }));
        });
      });
      links.forEach(([from, fromLeaf, to, toLeaf, c1x, c1y, c2x, c2y], index) => {
        const a = byId[from], b = byId[to], start = a.branch.leaves[fromLeaf], end = b.branch.leaves[toLeaf];
        crosslinks[index].setAttribute('d', `M${start[2]+a.dx} ${start[3]+a.dy} C${c1x+a.dx} ${c1y+a.dy} ${c2x+b.dx} ${c2y+b.dy} ${end[2]+b.dx} ${end[3]+b.dy}`);
      });
    }
    function render(time) {
      drift(time);
      renderProximity();
      const selected = engaged();
      const active = new Set();
      let shown = 0, pulse = 0, waveProgress = 0;
      const cap = narrow.matches ? 2 : 4;
      signals.forEach((signal, index) => {
        let branchId = signal.branch, leaf = signal.leaf, inbound = signal.inbound;
        let progress;
        if (signal.focused) {
          if (!selected) { signal.node.setAttribute('opacity', '0'); return; }
          branchId = selected; leaf = Math.floor(time / 3.2) % byId[selected].branch.leaves.length;
          inbound = ['evidence', 'gaps'].includes(selected);
          progress = (time % 3.2) / 3.2;
        } else {
          if (narrow.matches && ![0, 3, 6].includes(index)) { signal.node.setAttribute('opacity', '0'); return; }
          const mobileTiming = { 0: [0, 5], 3: [4.4, 5.3], 6: [9, 5.6] };
          const [start, duration] = narrow.matches ? mobileTiming[index] : [signal.start, signal.duration];
          const offset = (time - start + 14) % 14;
          progress = offset / duration;
          if (progress > 1 || (selected && branchId !== selected && shown >= cap - 1)) { signal.node.setAttribute('opacity', '0'); return; }
        }
        if (shown >= cap) { signal.node.setAttribute('opacity', '0'); return; }
        shown++;
        const item = byId[branchId];
        const current = position(item, leaf, progress, inbound);
        const previous = position(item, leaf, Math.max(0, progress - .003), inbound);
        const next = position(item, leaf, Math.min(1, progress + .003), inbound);
        const angle = Math.atan2(next.y - previous.y, next.x - previous.x) * 180 / Math.PI;
        const fade = Math.min(1, progress * 12, (1 - progress) * 12);
        signal.node.setAttribute('transform', `translate(${current.x.toFixed(2)} ${current.y.toFixed(2)}) rotate(${angle.toFixed(2)})`);
        signal.node.setAttribute('opacity', (fade * (selected && branchId !== selected ? .25 : 1)).toFixed(3));
        signal.node.dataset.flowBranch = branchId;
        signal.node.dataset.flowDirection = inbound ? 'inbound' : 'outbound';
        if (progress > .05 && progress < .95) active.add(branchId);
        if (inbound && progress > .7) {
          const phase = (progress - .7) / .3;
          pulse = Math.max(pulse, Math.sin(phase * Math.PI));
          waveProgress = Math.max(waveProgress, phase);
        }
      });
      // At most two automatic highlights; user focus always takes priority.
      const highlighted = [...active].filter(id => id !== selected).slice(0, selected ? 1 : 2);
      geometry.forEach(item => {
        [item.lines, item.labels].forEach(node => {
          node.classList.toggle('is-flowing', highlighted.includes(item.branch.id));
          node.classList.toggle('is-engaged', item.branch.id === selected);
        });
      });
      centerNode.setAttribute('transform', `translate(${center.x} ${center.y}) scale(${(1 + pulse * .018).toFixed(4)})`);
      wave.setAttribute('r', (62 + waveProgress * 40).toFixed(2));
      wave.setAttribute('opacity', (pulse * .28).toFixed(3));
      root.dataset.mapCycle = String(Math.floor(time / 14));
    }
    function tick(now) {
      if (!last) last = now;
      elapsed += Math.min(now - last, 100);
      last = now;
      if (now - lastPaint >= 32) { render(elapsed / 1000); lastPaint = now; }
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      cancelAnimationFrame(frame); frame = 0; last = 0;
      if (motion.matches) {
        root.dataset.mapMotion = 'reduced';
        resetProximity();
        drift(0, false);
        signals.forEach(signal => signal.node.setAttribute('opacity', '0'));
        wave.setAttribute('opacity', '0');
        centerNode.setAttribute('transform', `translate(${center.x} ${center.y})`);
        geometry.forEach(item => [item.lines, item.labels].forEach(node => node.classList.remove('is-flowing', 'is-engaged')));
      } else if (visible && !document.hidden) {
        root.dataset.mapMotion = 'running';
        frame = requestAnimationFrame(tick);
      } else { root.dataset.mapMotion = 'paused'; resetProximity(); }
    }
    function engage(id) {
      if (!id || root.dataset.currentMapBranch === id) return;
      root.dataset.currentMapBranch = id;
      select(id);
    }
    root.addEventListener('pointerover', event => {
      const node = event.target.closest('[data-mm-select]');
      if (node) { hovered = node.dataset.mmSelect; engage(hovered); }
    });
    root.addEventListener('pointerleave', () => { hovered = null; });
    root.addEventListener('focusin', event => {
      const node = event.target.closest('[data-mm-select]');
      if (node) { focused = node.dataset.mmSelect; engage(focused); }
    });
    root.addEventListener('focusout', event => {
      if (!event.relatedTarget || !root.contains(event.relatedTarget)) focused = null;
    });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        visible = entries.some(entry => entry.isIntersecting); sync();
      }, { threshold: .02 });
      observer.observe(svg);
    } else {
      const check = () => { const rect = svg.getBoundingClientRect(); visible = rect.bottom > 0 && rect.top < innerHeight; sync(); };
      addEventListener('scroll', check, { passive: true }); check();
    }
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);
    narrow.addEventListener('change', sync);
    sync();

  }
})();
