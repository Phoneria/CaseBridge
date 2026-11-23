// CaseBridge marketing — 3D story (v.0.54). Bundled with esbuild into web-page/story3d.js.
import * as THREE from 'three';

const C = {
  bg: 0x08131f, paper: 0xeee8d9, teal: 0x68dfcf, amber: 0xedb45d, red: 0xe36b5f,
  navy: 0x16304d, steel: 0x8fa3b8, blue: 0x5b8def, rose: 0xd98aa8,
};
const FONT = 'Manrope, "Segoe UI", system-ui, sans-serif';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const seg = (p, a, b) => ease(clamp((p - a) / (b - a)));
const pct = (v) => '%' + Math.round(v * 100);
const LS = innerWidth < 600 ? 1.45 : 1.15;

/* ---------- helpers ---------- */
function labelSprite(text, { color = '#eee8d9', size = 30, weight = 600, bg = null, pad = 14, height = 0.32 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const scale = 2;
  ctx.font = `${weight} ${size * scale}px ${FONT}`;
  const lines = String(text).split('\n');
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2 * scale);
  const lh = size * 1.3 * scale;
  const h = Math.ceil(lh * lines.length + pad * 1.4 * scale);
  canvas.width = w; canvas.height = h;
  ctx.font = `${weight} ${size * scale}px ${FONT}`;
  if (bg) {
    ctx.fillStyle = bg;
    const r = 12 * scale;
    ctx.beginPath(); ctx.roundRect(0, 0, w, h, r); ctx.fill();
  }
  ctx.fillStyle = color; ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, pad * scale, pad * 0.7 * scale + lh * (i + 0.5)));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  const hh = height * LS * lines.length;
  sprite.scale.set(hh * (w / h), hh, 1);
  sprite.userData.base = 1;
  return sprite;
}
function setText(sprite, text, opts) {
  const fresh = labelSprite(text, opts);
  sprite.material.map.dispose();
  sprite.material.map = fresh.material.map;
  sprite.scale.copy(fresh.scale);
}
function glowSphere(r, color, emissive = 0.6) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: 0.35, metalness: 0.1 }));
}
function cylinderBetween(a, b, radius, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16, 1), mat);
  m.userData = { a: a.clone(), b: b.clone(), r: radius, grow: 1 };
  placeCylinder(m);
  return m;
}
function placeCylinder(m) {
  const { a, b, r, grow } = m.userData;
  const end = a.clone().lerp(b, Math.max(grow, 0.0001));
  const dir = end.clone().sub(a);
  const len = dir.length();
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.scale.set(r, Math.max(len, 0.0001), r);
}
function fadeGroup(group, f) {
  group.traverse((o) => {
    if (!o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (m.userData.baseOpacity === undefined) { m.userData.baseOpacity = m.opacity; m.transparent = true; }
      m.opacity = m.userData.baseOpacity * (o.userData.alpha ?? 1) * f;
      if (m.uniforms?.opacity) m.uniforms.opacity.value = m.opacity;
    });
  });
}
const PAGE_BODY = {
  'DAVA DOSYASI': 'Dosya: 2025/142 Esas. Konu: kira bedelinin tespiti. Taraflar, vekiller, süreler ve deliller bu dosyada toplanır.',
  'DİLEKÇE': 'Davacı vekili olarak, müvekkil ile davalı arasındaki kira ilişkisine dair beyanlarımızı sunarız. Kira bedeli emsallerin altında kalmış olup tespiti talep olunur.',
  'CEVAP': 'Davalı vekili, kira bedelinin taraflarca serbestçe belirlendiğini, emsal kira iddialarının somut delile dayanmadığını beyan etmiştir.',
  'BİLİRKİŞİ RAPORU': 'İnceleme konusu taşınmazın konumu, yaşı ve emsal kiralar dikkate alınarak aylık kira bedeli değerlendirilmiştir.',
  'TUTANAK': 'Taraf vekilleri hazır. Bilirkişi raporu okundu. Davacı vekili rapora itiraz için süre talep etti. Duruşma ertelendi.',
  'DELİL LİSTESİ': '1. Kira sözleşmesi 2. İhtarname 3. Banka dekontları 4. Emsal kira ilanları 5. Bilirkişi incelemesi 6. Tanık beyanları',
  'ARA KARAR': 'Dosyanın bilirkişiye tevdiine, taraflara rapora itiraz için iki haftalık kesin süre verilmesine karar verildi.',
  'GEREKÇELİ KARAR': 'Toplanan deliller ve bilirkişi raporu birlikte değerlendirildiğinde davacının talebinin yerinde olmadığı anlaşılmıştır.',
  'İSTİNAF': 'İlk derece mahkemesi kararına karşı süresinde istinaf yoluna başvurulmuş olup kararın kaldırılması talep edilmektedir.',
  'NOTLAR': 'Müvekkil görüşmesi: sözleşme aslı istenecek. Emsal kira için üç ilan daha bulunmalı. Süreleri takvime işle.',
  'TEBLİGAT': 'Dava dilekçesi ve duruşma günü davalı tarafa usulüne uygun olarak tebliğ edilmiştir.',
  'EMSAL': 'Benzer nitelikteki kira tespit dosyalarında emsal kira bedelleri ve endeks oranları birlikte dikkate alınmıştır.',
  'MÜVEKKİL NOTU': 'Ev sahibi kirayı birden çok artırmak istiyor. Geçen yıl da artış yapılmıştı. Sözleşme evde olabilir.',
  'SÜRE TAKVİMİ': 'Rapora itiraz: 2 hafta. Duruşma: 14.03. İstinaf süresi: tebliğden itibaren 2 hafta. Hatırlatmalar açık.',
};
function pageTexture(title, { seed = 1 } = {}) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 704;
  const x = c.getContext('2d');
  x.fillStyle = '#eee8d9'; x.fillRect(0, 0, 512, 704);
  x.fillStyle = 'rgba(22,48,77,.55)'; x.font = `600 15px ${FONT}`;
  x.fillText('T.C. ANKARA 9. SULH HUKUK MAHKEMESİ', 46, 52);
  x.fillText(`Esas No: 2025/${100 + seed * 7}   ·   Kurgusal örnek`, 46, 74);
  x.fillStyle = '#16304d'; x.font = `800 30px ${FONT}`; x.fillText(title, 46, 124);
  x.fillStyle = '#7a8a9a'; x.fillRect(46, 140, 420, 2);
  x.fillStyle = '#26384c'; x.font = `500 19px ${FONT}`;
  const words = (PAGE_BODY[title] || '').split(' ');
  let line = ''; let y = 182;
  const flush = () => { x.fillText(line.trim(), 46, y); y += 30; line = ''; };
  for (const w of words) { if (x.measureText(line + w).width > 420) flush(); line += w + ' '; }
  if (line) flush();
  let s = seed; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  x.fillStyle = 'rgba(22,48,77,.22)';
  for (y += 14; y < 620; y += 28) x.fillRect(46, y - 8, 300 + rnd() * 120, 8);
  x.fillStyle = 'rgba(22,48,77,.55)'; x.font = `italic 500 16px ${FONT}`; x.fillText('Av. — imza', 340, 668);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

await Promise.race([
  Promise.all(['500', '600', '700', '800'].map((w) => document.fonts?.load(`${w} 24px Manrope`))),
  new Promise((r) => setTimeout(r, 1500)),
]).catch(() => {});

/* ---------- renderer ---------- */
const canvas = document.getElementById('stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  document.documentElement.classList.add('no-webgl');
  if (!reduceMotion) document.querySelector('.hero-fallback')?.play?.().catch(() => {});
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0, 0.6, 9);
scene.add(new THREE.AmbientLight(0xbfd4ff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(4, 6, 5); scene.add(key);
const rim = new THREE.PointLight(C.teal, 18, 20); rim.position.set(-4, 2, -3); scene.add(rim);

// subtle starfield of legal "particles"
{
  const g = new THREE.BufferGeometry(); const n = 420; const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 30; pos[i * 3 + 1] = (Math.random() - 0.5) * 18; pos[i * 3 + 2] = -6 - Math.random() * 14; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: C.steel, size: 0.035, transparent: true, opacity: 0.55 })));
}

const scenes = [];

/* ---------- 0 · hero: case file opens into a network ---------- */
scenes[0] = (() => {
  const g = new THREE.Group();
  const outer = new THREE.Group(); outer.add(g); g.rotation.x = 0;
  const folder = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 3.2), new THREE.MeshStandardMaterial({ color: C.navy, roughness: 0.6 }));
  folder.position.y = -0.2; g.add(folder);
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.3), folder.material); tab.position.set(-0.6, -0.2, -1.72); g.add(tab);
  const titles = ['DAVA DOSYASI', 'DİLEKÇE', 'CEVAP', 'BİLİRKİŞİ RAPORU', 'TUTANAK', 'DELİL LİSTESİ', 'ARA KARAR', 'GEREKÇELİ KARAR', 'İSTİNAF', 'NOTLAR', 'TEBLİGAT', 'EMSAL', 'MÜVEKKİL NOTU', 'SÜRE TAKVİMİ'];
  const pages = []; const nodes = []; const n = titles.length;
  const net = [];
  titles.forEach((t, i) => {
    const mat = new THREE.MeshStandardMaterial({ map: pageTexture(t, { seed: i + 3 }), roughness: 0.9 });
    const p = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.012, 2.9), [mat.clone(), mat.clone(), mat, mat.clone(), mat.clone(), mat.clone()]);
    p.material.forEach((m, k) => { if (k !== 2) { m.map = null; m.color.set(C.paper); } });
    const ang = (i / n) * Math.PI * 2;
    const r = 2.3 + (i % 3) * 0.55;
    p.userData = { start: new THREE.Vector3(0, -0.15 + i * 0.022, 0), end: new THREE.Vector3(Math.cos(ang) * r, Math.sin(ang * 2) * 0.6 + (i % 2 ? 0.5 : -0.5), Math.sin(ang) * r * 0.7), rot: (Math.random() - 0.5) * 1.6 };
    g.add(p); pages.push(p);
    const node = glowSphere(0.09 + (i % 3) * 0.03, i % 4 === 0 ? C.amber : C.teal, 1.1);
    node.position.copy(p.userData.end); node.userData.alpha = 1; g.add(node); nodes.push(node);
    const tag = labelSprite(t, { size: 20, weight: 700, color: i % 4 === 0 ? '#edb45d' : '#bfeee7', height: 0.17 });
    tag.position.copy(p.userData.end).add(new THREE.Vector3(0, 0.3, 0)); g.add(tag); node.userData.tag = tag;
    net.push(p.userData.end);
  });
  const lp = [];
  for (let i = 0; i < n; i++) for (const j of [i + 1, i + 3]) { const k = j % n; lp.push(...net[i].toArray(), ...net[k].toArray()); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: C.teal, transparent: true, opacity: 0.35 }));
  g.add(lines);
  return {
    group: outer, fit: [3.3, 2.6],
    camera: { pos: [0, 1.2, 8.4], look: [0, 0, 0] },
    update(p, t, pointer) {
      const open = seg(p, 0.03, 0.42); const morph = seg(p, 0.45, 0.92);
      g.rotation.y = (reduceMotion ? -0.35 : Math.sin(t * 0.25) * 0.25 - 0.35) + pointer.x * 0.25 + open * 0.6;
      g.rotation.x = lerp(0.95, 0.25, open) + pointer.y * 0.12;
      g.rotation.z = lerp(-0.12, 0, open);
      outer.position.x = innerWidth > 900 ? open * 1.4 : 0;
      folder.userData.alpha = 1 - seg(morph, 0, 0.4); tab.userData.alpha = folder.userData.alpha;
      pages.forEach((pg, i) => {
        const d = pg.userData; const k = seg(open, i / n * 0.4, 0.6 + i / n * 0.4);
        // each page turns into its node one after another
        const m = seg(morph, (i / n) * 0.55, (i / n) * 0.55 + 0.45);
        pg.position.lerpVectors(d.start, d.end, k);
        pg.rotation.set(d.rot * k * (1 - m), (d.rot * 0.6 * k + (reduceMotion ? 0 : Math.sin(t + i) * 0.04 * k)) * (1 - m), d.rot * 0.4 * k * (1 - m));
        const sc = lerp(1, 0.5, k) * lerp(1, 0.08, ease(m)); pg.scale.set(sc, 1, sc);
        pg.userData.alpha = 1 - seg(m, 0.55, 1);
        const nd = nodes[i]; const pop = seg(m, 0.35, 0.85);
        nd.userData.alpha = pop;
        const flash = Math.sin(Math.PI * seg(m, 0.35, 0.75)) * 0.9;
        nd.scale.setScalar(0.25 + pop * (0.85 + (reduceMotion ? 0 : Math.sin(t * 2 + i) * 0.12)) + flash);
        nd.userData.tag.userData.alpha = seg(m, 0.7, 1);
      });
      lines.userData.alpha = seg(morph, 0.55, 1) * 0.9;
    },
  };
})();

/* ---------- 1 · rewind a closed case ---------- */
scenes[1] = (() => {
  const g = new THREE.Group();
  const evts = [['Dava açıldı', -4], ['Cevap dilekçesi', -2.2], ['Bilirkişi raporu', -0.4], ['Duruşma', 1.4], ['Karar: Ret', 3.3]];
  const pts = evts.map(([, x], i) => new THREE.Vector3(x, Math.sin(i * 1.3) * 0.15, Math.cos(i) * 0.3));
  const curve = new THREE.CatmullRomCurve3(pts);
  const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.035, 10), new THREE.MeshStandardMaterial({ color: C.steel, roughness: 0.5, transparent: true, opacity: 0.75 }));
  g.add(rail);
  const labels = [];
  pts.forEach((p, i) => {
    const s = glowSphere(i === 4 ? 0.17 : 0.12, i === 4 ? C.red : C.paper, i === 4 ? 0.9 : 0.3); s.position.copy(p); g.add(s);
    const l = labelSprite(evts[i][0], { size: 26, color: i === 4 ? '#f1a49b' : '#eee8d9', height: 0.26 });
    l.position.copy(p).add(new THREE.Vector3(0, i % 2 ? -0.45 : 0.45, 0)); g.add(l); labels.push(l);
  });
  // rewind head
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 12, 48), new THREE.MeshBasicMaterial({ color: C.teal, transparent: true }));
  g.add(head);
  // alternative branch from "Bilirkişi raporu"
  const a0 = pts[2].clone();
  const altCurve = new THREE.CatmullRomCurve3([a0, a0.clone().add(new THREE.Vector3(1.2, 1.1, 0.6)), new THREE.Vector3(2.0, 1.9, 0.9), new THREE.Vector3(3.6, 2.1, 0.6)]);
  const altGeo = new THREE.TubeGeometry(altCurve, 160, 0.05, 12);
  const alt = new THREE.Mesh(altGeo, new THREE.MeshStandardMaterial({ color: C.amber, emissive: C.amber, emissiveIntensity: 0.8, roughness: 0.3 }));
  g.add(alt);
  const altEnd = glowSphere(0.2, C.amber, 1.2); altEnd.position.copy(altCurve.getPoint(1)); g.add(altEnd);
  const altMid = labelSprite('Rapora süresinde itiraz\n+ emsal kira delili', { size: 24, color: '#1b1409', bg: 'rgba(237,180,93,.95)', height: 0.24 });
  altMid.position.copy(altCurve.getPoint(0.42)).add(new THREE.Vector3(-0.95, 0.35, 0)); g.add(altMid);
  const altLbl = labelSprite('Daha güçlü yol: kısmi kabul', { size: 26, color: '#edb45d', height: 0.27 });
  altLbl.position.copy(altCurve.getPoint(1)).add(new THREE.Vector3(-1.1, 0.5, 0)); g.add(altLbl);
  const total = altGeo.index.count;
  return {
    group: g,
    fit: [4.5, 1.9], camera: { pos: [0.2, 1.6, 8.6], look: [-0.2, 0.6, 0] },
    update(p, t, pointer) {
      g.rotation.y = -0.18 + pointer.x * 0.15 + (reduceMotion ? 0 : Math.sin(t * 0.3) * 0.05);
      g.rotation.x = 0.08 + pointer.y * 0.06;
      const rew = seg(p, 0.08, 0.42);
      const u = lerp(1, 0.5, rew);
      head.position.copy(curve.getPoint(u)); head.lookAt(camera.position);
      head.scale.setScalar(1 + (reduceMotion ? 0 : Math.sin(t * 4) * 0.08));
      rail.userData.alpha = lerp(1, 0.5, seg(p, 0.4, 0.6));
      const grow = seg(p, 0.42, 0.82);
      altGeo.setDrawRange(0, Math.floor(total * grow / 3) * 3);
      alt.visible = grow > 0.001;
      altEnd.userData.alpha = seg(p, 0.78, 0.86); altEnd.scale.setScalar(0.5 + altEnd.userData.alpha * 0.6);
      altMid.userData.alpha = seg(p, 0.55, 0.65);
      altLbl.userData.alpha = seg(p, 0.82, 0.92);
      labels[4].userData.alpha = lerp(1, 0.55, grow);
    },
  };
})();

/* ---------- 2 · probability tree ---------- */
const treeState = { chips: { expert: false, precedent: false, settle: false } };
function treeModel(chips) {
  let root = { a: 0.40, b: 0.45, c: 0.15 };
  let A = { kabul: 0.65, kismi: 0.35 }; let B = { kismi: 0.40, ret: 0.60 };
  if (chips.expert) { root.a += 0.12; root.b -= 0.12; }
  if (chips.precedent) { A.kabul += 0.12; A.kismi -= 0.12; B.kismi += 0.15; B.ret -= 0.15; }
  if (chips.settle) { root.c += 0.20; }
  const sum = root.a + root.b + root.c; root = { a: root.a / sum, b: root.b / sum, c: root.c / sum };
  const out = {
    kabul: root.a * A.kabul,
    kismi: root.a * A.kismi + root.b * B.kismi,
    ret: root.b * B.ret,
    sulh: root.c,
  };
  return { root, A, B, out };
}
scenes[2] = (() => {
  const g = new THREE.Group();
  const P = {
    root: new THREE.Vector3(-3.6, 0, 0),
    a: new THREE.Vector3(-1.2, 1.5, 0.4), b: new THREE.Vector3(-1.2, -0.3, -0.5), c: new THREE.Vector3(-1.2, -1.9, 0.5),
    aK: new THREE.Vector3(1.6, 2.3, 0.2), aQ: new THREE.Vector3(1.6, 1.0, 0.9),
    bQ: new THREE.Vector3(1.6, 0.1, -1.0), bR: new THREE.Vector3(1.6, -1.1, -0.2),
    cS: new THREE.Vector3(1.6, -2.2, 0.9),
  };
  const names = { root: 'Kira tespit davası', a: 'Bilirkişi lehe', b: 'Bilirkişi aleyhe', c: 'Sulh görüşmesi', aK: 'Kabul', aQ: 'Kısmi kabul', bQ: 'Kısmi kabul', bR: 'Ret', cS: 'Sulh' };
  const colors = { aK: C.teal, aQ: C.amber, bQ: C.amber, bR: C.red, cS: C.blue };
  const edges = [['root', 'a', 1], ['root', 'b', 1], ['root', 'c', 1], ['a', 'aK', 2], ['a', 'aQ', 2], ['b', 'bQ', 2], ['b', 'bR', 2], ['c', 'cS', 2]];
  const edgeMeshes = {}; const nodeMeshes = {}; const nodeLabels = {};
  edges.forEach(([f, to, lvl]) => {
    const mat = new THREE.MeshStandardMaterial({ color: colors[to] ?? C.teal, emissive: colors[to] ?? C.teal, emissiveIntensity: 0.5, roughness: 0.4 });
    const m = cylinderBetween(P[f], P[to], 0.05, mat); m.userData.lvl = lvl; m.userData.target = 0.05; g.add(m); edgeMeshes[to] = m;
  });
  Object.keys(P).forEach((k) => {
    const s = glowSphere(1, colors[k] ?? (k === 'root' ? C.paper : C.teal), 0.7);
    s.userData.target = 0.16; s.scale.setScalar(0.16); s.position.copy(P[k]); g.add(s); nodeMeshes[k] = s;
    const l = labelSprite(names[k], { size: 24, height: 0.25 });
    l.position.copy(P[k]).add(new THREE.Vector3(k === 'root' ? 0 : 0.15, 0.36, 0)); if (k.length === 2) l.position.x += 0.75, l.position.y -= 0.36;
    g.add(l); nodeLabels[k] = l;
  });
  function apply(model, instant = false) {
    const { root, A, B } = model;
    const pathP = { root: 1, a: root.a, b: root.b, c: root.c, aK: root.a * A.kabul, aQ: root.a * A.kismi, bQ: root.b * B.kismi, bR: root.b * B.ret, cS: root.c };
    Object.entries(pathP).forEach(([k, v]) => {
      if (k !== 'root') { edgeMeshes[k].userData.target = 0.018 + v * 0.16; }
      nodeMeshes[k].userData.target = k === 'root' ? 0.2 : 0.07 + Math.sqrt(v) * 0.22;
      if (k !== 'root') setText(nodeLabels[k], `${names[k]}  ${pct(v)}`, { size: 24, height: 0.25, color: k.length === 2 ? '#eee8d9' : '#b9c9d8' });
      if (instant) { if (edgeMeshes[k]) edgeMeshes[k].userData.r = edgeMeshes[k].userData.target; nodeMeshes[k].scale.setScalar(nodeMeshes[k].userData.target); }
    });
  }
  apply(treeModel(treeState.chips), true);
  treeState.apply = apply;
  return {
    group: g,
    fit: [3.9, 2.8], camera: { pos: [0, 0.3, 8.8], look: [-0.4, 0.1, 0] },
    update(p, t, pointer) {
      g.rotation.y = -0.22 + pointer.x * 0.25 + (reduceMotion ? 0 : Math.sin(t * 0.25) * 0.06);
      g.rotation.x = pointer.y * 0.1;
      const g1 = seg(p, 0.02, 0.22), g2 = seg(p, 0.18, 0.4);
      Object.values(edgeMeshes).forEach((m) => {
        m.userData.grow = m.userData.lvl === 1 ? g1 : g2;
        m.userData.r = lerp(m.userData.r, m.userData.target, reduceMotion ? 1 : 0.08);
        placeCylinder(m);
      });
      Object.entries(nodeMeshes).forEach(([k, s]) => {
        const vis = k === 'root' ? 1 : k.length === 1 ? g1 : g2;
        const cur = s.scale.x; s.scale.setScalar(lerp(cur, s.userData.target * Math.max(vis, 0.001), reduceMotion ? 1 : 0.1));
        nodeLabels[k].userData.alpha = k === 'root' ? 1 : seg(vis, 0.7, 1);
      });
    },
  };
})();

/* ---------- 3 · anonymisation scanner ---------- */
scenes[3] = (() => {
  const g = new THREE.Group();
  const W = 720, H = 980;
  const doc = [
    [['T.C.', 0]], [['ANKARA ( ) SULH HUKUK MAHKEMESİ', 0]], [],
    [['DAVACI : ', 0], ['Selin Erdem', 'AD SOYAD']],
    [['T.C. Kimlik No : ', 0], ['31846720594', 'TC KİMLİK']],
    [['Adres : ', 0], ['Gazi Mah. 47. Sk. No:12', 'ADRES']],
    [['Telefon : ', 0], ['0538 412 77 19', 'TELEFON']], [],
    [['DAVALI : ', 0], ['Umut Uçar', 'AD SOYAD']],
    [['IBAN : ', 0], ['TR33 0006 1005 1978 6457 8413 26', 'IBAN']], [],
    [['KONU : Kira bedelinin tespiti istemidir.', 0]], [],
    [['AÇIKLAMALAR : Müvekkil ', 0], ['Selin Erdem', 'AD SOYAD'], [' ile', 0]],
    [['davalı arasında 2021 tarihli kira sözleşmesi', 0]],
    [['bulunmaktadır. Kira bedeli emsallerin altında', 0]],
    [['kalmış olup TBK m.344 uyarınca tespiti talep', 0]],
    [['olunur. İletişim: ', 0], ['selin.erdem@ornek.com', 'E-POSTA']],
  ];
  function draw(masked) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = '#eee8d9'; x.fillRect(0, 0, W, H);
    x.font = `500 25px ${FONT}`; x.textBaseline = 'middle';
    doc.forEach((line, i) => {
      let cx = 56; const cy = 80 + i * 47;
      line.forEach(([text, tag]) => {
        x.font = `${i < 2 ? 700 : 500} 25px ${FONT}`;
        const w = x.measureText(text).width;
        if (tag && masked) {
          x.fillStyle = '#16304d'; x.beginPath(); x.roundRect(cx - 4, cy - 18, w + 8, 36, 8); x.fill();
          x.fillStyle = '#68dfcf'; x.font = `700 17px ${FONT}`;
          const tw = x.measureText(`[${tag}]`).width; x.fillText(`[${tag}]`, cx + (w - tw) / 2, cy + 1);
        } else {
          x.fillStyle = tag ? '#7a2a22' : '#16304d'; x.fillText(text, cx, cy);
        }
        cx += w;
      });
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { a: { value: draw(false) }, b: { value: draw(true) }, beam: { value: 0 }, opacity: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D a; uniform sampler2D b; uniform float beam; uniform float opacity; varying vec2 vUv;
      void main(){ float y=1.0-vUv.y; vec4 ca=texture2D(a,vUv); vec4 cb=texture2D(b,vUv);
        vec4 col = y<beam ? cb : ca; float glow = smoothstep(0.03,0.0,abs(y-beam))*step(0.001,beam)*step(beam,0.999);
        col.rgb = mix(col.rgb, vec3(0.41,0.87,0.81), glow*0.85); gl_FragColor=vec4(col.rgb, opacity); }`,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 2.55 * H / W), mat);
  g.add(plane);
  const beamBar = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.025, 0.025), new THREE.MeshBasicMaterial({ color: C.teal }));
  g.add(beamBar);
  // particles shed by the beam
  const pn = 260; const pg = new THREE.BufferGeometry(); const pp = new Float32Array(pn * 3); const seeds = new Float32Array(pn);
  for (let i = 0; i < pn; i++) { seeds[i] = Math.random(); }
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const parts = new THREE.Points(pg, new THREE.PointsMaterial({ color: C.teal, size: 0.04, transparent: true, opacity: 0.9 }));
  g.add(parts);
  // vault
  const vault = new THREE.Group();
  const box = new THREE.BoxGeometry(3.3, 4.3, 0.9);
  vault.add(new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: C.teal, transparent: true, opacity: 0.08, roughness: 0.1, depthWrite: false })));
  vault.add(new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: C.teal, transparent: true, opacity: 0.9 })));
  const lock = new THREE.Group();
  const lockMat = new THREE.MeshStandardMaterial({ color: C.amber, emissive: C.amber, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 });
  lock.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.48, 0.18), lockMat));
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 12, 32, Math.PI), lockMat); shackle.position.y = 0.24; lock.add(shackle);
  lock.position.set(1.65, -2.15, 0.5); vault.add(lock);
  const vLabel = labelSprite('Büroya özel · şifreli', { size: 24, color: '#68dfcf', height: 0.25 });
  vLabel.position.set(0, 2.45, 0); vault.add(vLabel);
  g.add(vault);
  const halfH = 2.55 * H / W / 2;
  return {
    group: g,
    fit: [2.0, 2.75], camera: { pos: [0, 0.2, 8.2], look: [0, 0.1, 0] },
    update(p, t, pointer) {
      g.rotation.y = -0.28 + pointer.x * 0.2 + (reduceMotion ? 0 : Math.sin(t * 0.3) * 0.05);
      g.rotation.x = -0.05 + pointer.y * 0.08;
      const beam = seg(p, 0.08, 0.62);
      mat.uniforms.beam.value = beam;
      beamBar.position.set(0, halfH - beam * halfH * 2, 0.03);
      beamBar.userData.alpha = beam > 0.001 && beam < 0.999 ? 1 : 0;
      const by = beamBar.position.y; const arr = pg.attributes.position.array;
      for (let i = 0; i < pn; i++) {
        const s = seeds[i]; const life = (t * 0.6 + s) % 1;
        arr[i * 3] = (s - 0.5) * 2.5 + Math.sin(s * 40 + t) * 0.05;
        arr[i * 3 + 1] = by + life * 0.7 * (s > 0.5 ? 1 : -0.4);
        arr[i * 3 + 2] = 0.05 + life * 0.9;
      }
      pg.attributes.position.needsUpdate = true;
      parts.userData.alpha = beamBar.userData.alpha * 0.9;
      const v = seg(p, 0.66, 0.86);
      vault.scale.setScalar(lerp(1.25, 1, v)); vault.userData.alpha = v;
      vault.children.forEach((c) => { c.userData.alpha = v; });
      lock.children.forEach((c) => { c.userData.alpha = seg(p, 0.8, 0.9); });
      vLabel.userData.alpha = seg(p, 0.84, 0.94);
      shackle.position.y = lerp(0.42, 0.24, seg(p, 0.86, 0.95));
      plane.scale.setScalar(lerp(1, 0.92, v));
    },
  };
})();

/* ---------- 4 · bureau overview ---------- */
const bureau = [
  { name: 'Av. Deniz Kaya', won: [6, 4, 2, 1], lost: 3, due: 0 },
  { name: 'Av. Elif Sarı', won: [3, 7, 1, 0], lost: 2, due: 0 },
  { name: 'Av. Mert Aksoy', won: [2, 2, 5, 3], lost: 6, due: 2 },
  { name: 'Av. Zeynep Tan', won: [5, 1, 3, 2], lost: 2, due: 0 },
  { name: 'Av. Kerem Yıldız', won: [1, 3, 2, 4], lost: 4, due: 1 },
];
const types = [['İş', C.teal], ['Kira', C.amber], ['Ticaret', C.blue], ['Ceza', C.rose]];
scenes[4] = (() => {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.06, 64), new THREE.MeshStandardMaterial({ color: C.navy, roughness: 0.8, transparent: true, opacity: 0.85 }));
  floor.position.y = -1.6; g.add(floor);
  const grid = new THREE.PolarGridHelper(4.3, 10, 6, 64, 0x2c4b6c, 0x2c4b6c); grid.position.y = -1.56; g.add(grid);
  const unit = 0.17; const bars = []; const tops = []; const rings = []; const hit = [];
  bureau.forEach((L, i) => {
    const ang = -1.2 + i * 0.6; const R = 3.1;
    const x = Math.sin(ang) * R; const z = Math.cos(ang) * R - 1.1;
    let y = -1.56;
    const col = new THREE.Group(); col.position.set(x, 0, z); g.add(col);
    L.won.forEach((h, k) => {
      if (!h) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), new THREE.MeshStandardMaterial({ color: types[k][1], emissive: types[k][1], emissiveIntensity: 0.25, roughness: 0.4 }));
      m.userData = { y0: y, h: h * unit, lawyer: i }; y += h * unit; col.add(m); bars.push(m); hit.push(m);
    });
    const lost = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), new THREE.MeshStandardMaterial({ color: C.steel, transparent: true, opacity: 0.25, roughness: 0.6 }));
    lost.userData = { y0: y, h: L.lost * unit, lawyer: i, lost: true }; col.add(lost); bars.push(lost); hit.push(lost);
    const total = L.won.reduce((a, b) => a + b, 0);
    const rate = total / (total + L.lost);
    const top = labelSprite(`${L.name.replace(/(\S+)$/, (m) => m[0] + '.')}\n${pct(rate)} kazanım`, { size: 22, height: 0.2 });
    top.userData.y = y + L.lost * unit + (i % 2 ? 0.28 : 0.85); top.position.set(0, top.userData.y, 0); col.add(top); tops.push(top);
    if (L.due) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 48), new THREE.MeshBasicMaterial({ color: C.red, transparent: true, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = -1.5; col.add(ring); rings.push(ring);
      const warn = labelSprite(`${L.due} süre yaklaşıyor`, { size: 20, color: '#fff', bg: 'rgba(227,107,95,.92)', height: 0.2 });
      warn.position.set(0.05, -1.15, 0.55); col.add(warn); rings.push(warn);
    }
  });
  return {
    group: g, hit,
    fit: [4.4, 2.5], camera: { pos: [0, 2.4, 8.4], look: [0, -0.3, 0] },
    update(p, t, pointer) {
      g.rotation.y = pointer.x * 0.3 + (reduceMotion ? 0 : Math.sin(t * 0.2) * 0.12);
      const grow = seg(p, 0.05, 0.5);
      bars.forEach((b, i) => {
        const k = seg(grow, (i % 6) * 0.06, 0.6 + (i % 6) * 0.06);
        const h = Math.max(b.userData.h * k, 0.001); b.scale.y = h; b.position.y = b.userData.y0 * 1 + h / 2 + (b.userData.y0 + 1.56) * (k - 1);
      });
      tops.forEach((s) => { s.userData.alpha = seg(p, 0.42, 0.58); });
      rings.forEach((r) => {
        const a = seg(p, 0.6, 0.72);
        if (r.geometry && r.geometry.type === 'RingGeometry') { const pulse = reduceMotion ? 1 : 1 + ((t * 0.8) % 1) * 0.9; r.scale.setScalar(pulse); r.userData.alpha = a * (reduceMotion ? 1 : 1 - ((t * 0.8) % 1)); } else r.userData.alpha = a;
      });
    },
  };
})();

/* ---------- 5 · Sufle: live conversation cards ---------- */
scenes[5] = (() => {
  const g = new THREE.Group();
  const N = 220; const wg = new THREE.BufferGeometry(); const wp = new Float32Array(N * 3);
  wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
  const wave = new THREE.Line(wg, new THREE.LineBasicMaterial({ color: C.paper, transparent: true, opacity: 0.85 }));
  wave.position.set(-1.1, -0.2, 0); g.add(wave);
  const wave2 = new THREE.Line(wg, new THREE.LineBasicMaterial({ color: C.teal, transparent: true, opacity: 0.45 }));
  wave2.position.set(-1.1, -0.2, -0.3); g.add(wave2);
  const mic = glowSphere(0.16, C.teal, 1); mic.position.set(-4.0, -0.2, 0); g.add(mic);
  const cardsSpec = [
    ['KAYNAK · TBK m.344', 'Kira bedelinin belirlenmesi', '“…önceki kira yılında tüketici fiyat', 'endeksindeki on iki aylık ortalamalara…”', C.teal],
    ['EKSİK DELİL', 'İmzalı kira sözleşmesi', 'Müvekkilden aslı istenmeli;', 'yenileme geçmişi doğrulanmalı.', C.amber],
    ['SORULACAK SORU', 'Son artış ne zaman yapıldı?', 'Konuşmada geçen “geçen yıl” ifadesi', 'tarihle netleştirilmeli.', C.blue],
  ];
  const cards = cardsSpec.map(([kicker, title, l1, l2, col], i) => {
    const c = document.createElement('canvas'); c.width = 760; c.height = 300; const x = c.getContext('2d');
    x.fillStyle = 'rgba(14,30,48,.96)'; x.beginPath(); x.roundRect(0, 0, 760, 300, 26); x.fill();
    x.fillStyle = '#' + new THREE.Color(col).getHexString(); x.fillRect(0, 0, 10, 300);
    x.font = `800 26px ${FONT}`; x.fillText(kicker, 44, 62);
    x.fillStyle = '#eee8d9'; x.font = `700 38px ${FONT}`; x.fillText(title, 44, 126);
    x.fillStyle = '#b9c9d8'; x.font = `500 27px ${FONT}`; x.fillText(l1, 44, 196); x.fillText(l2, 44, 238);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6 * 300 / 760), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.userData = { end: new THREE.Vector3(2.3, 1.45 - i * 1.15, 0.2 - i * 0.1), start: new THREE.Vector3(6, 1.45 - i * 1.15, -1.5) };
    g.add(m); return m;
  });
  return {
    group: g,
    fit: [4.3, 2.0], camera: { pos: [0, 0.3, 8.6], look: [-0.1, 0.1, 0] },
    update(p, t, pointer) {
      g.rotation.y = -0.15 + pointer.x * 0.2; g.rotation.x = pointer.y * 0.08;
      const speak = reduceMotion ? 0.35 : 0.25 + 0.75 * Math.abs(Math.sin(t * 1.7));
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1); const x = -2.6 + u * 3.4;
        const env = Math.sin(Math.PI * u);
        const y = env * speak * 0.55 * (Math.sin(u * 38 + t * 6) * 0.6 + Math.sin(u * 91 - t * 9) * 0.4);
        wp[i * 3] = x; wp[i * 3 + 1] = y; wp[i * 3 + 2] = 0;
      }
      wg.attributes.position.needsUpdate = true;
      mic.scale.setScalar(1 + speak * 0.35);
      cards.forEach((c, i) => {
        const k = seg(p, 0.15 + i * 0.22, 0.3 + i * 0.22);
        c.position.lerpVectors(c.userData.start, c.userData.end, k);
        c.rotation.y = lerp(-0.9, -0.22, k);
        c.userData.alpha = k;
        if (!reduceMotion) c.position.y += Math.sin(t * 1.2 + i) * 0.03 * k;
      });
    },
  };
})();

scenes.forEach((s) => { s.group.visible = false; scene.add(s.group); });

/* ---------- scroll + DOM wiring ---------- */
const chapters = [...document.querySelectorAll('[data-scene]')];
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', (e) => { pointer.tx = (e.clientX / innerWidth - 0.5) * 2; pointer.ty = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });

function progressOf(el) {
  const r = el.getBoundingClientRect();
  const span = Math.max(r.height - innerHeight, 1);
  return { p: clamp(-r.top / span), visible: r.top < innerHeight * 0.5 && r.bottom > innerHeight * 0.5 };
}

// step lists highlight in sync with progress
function syncSteps(chapter, p) {
  const steps = chapter.querySelectorAll('[data-at]');
  steps.forEach((s) => s.classList.toggle('is-on', p >= parseFloat(s.dataset.at)));
  chapter.style.setProperty('--p', p.toFixed(3));
}

// Probability tree chips + outcome bars (works without WebGL too)
const chipEls = document.querySelectorAll('[data-chip]');
const outEls = { kabul: document.querySelector('[data-out="kabul"]'), kismi: document.querySelector('[data-out="kismi"]'), ret: document.querySelector('[data-out="ret"]'), sulh: document.querySelector('[data-out="sulh"]') };
function renderOutcomes() {
  const model = treeModel(treeState.chips);
  Object.entries(model.out).forEach(([k, v]) => {
    const el = outEls[k]; if (!el) return;
    el.style.setProperty('--w', (v * 100).toFixed(1) + '%');
    el.querySelector('output').textContent = pct(v);
  });
  if (treeState.apply) treeState.apply(model);
}
chipEls.forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.chip; treeState.chips[k] = !treeState.chips[k];
  b.setAttribute('aria-pressed', String(treeState.chips[k]));
  renderOutcomes();
}));
renderOutcomes();

// hover tooltip for bureau bars
const tip = document.getElementById('bureau-tip');
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
canvas.addEventListener('pointermove', (e) => {
  if (active !== 4 || !tip) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hitObj = ray.intersectObjects(scenes[4].hit, false)[0];
  if (!hitObj) { tip.hidden = true; return; }
  const L = bureau[hitObj.object.userData.lawyer];
  const won = L.won.reduce((a, b) => a + b, 0);
  tip.innerHTML = `<strong>${L.name}</strong><span>${types.map(([n], k) => `${n}: ${L.won[k]}`).join(' · ')}</span><span>Kazanılan ${won} · Kaybedilen ${L.lost}${L.due ? ` · <em>${L.due} yaklaşan süre</em>` : ''}</span>`;
  tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px'; tip.hidden = false;
});
canvas.addEventListener('pointerleave', () => { if (tip) tip.hidden = true; });

let active = -1; let prevActive = -1; let fade = 1; let switchAt = 0;
const camPos = new THREE.Vector3(0, 2, 9); const camLook = new THREE.Vector3();
const tmpV = new THREE.Vector3(); const tmpL = new THREE.Vector3(); const tmpD = new THREE.Vector3();

function resize() {
  if (!renderer) return;
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const wide = w > 900;
  // keep the scene to the right of the copy on desktop, above it on mobile
  if (wide) camera.setViewOffset(w, h, -w * 0.2, 0, w, h);
  else camera.setViewOffset(w, h, 0, h * 0.24, w, h);
  camera.fov = wide ? 38 : 54;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let last = performance.now();
let elapsed = 0;
function frame() {
  requestAnimationFrame(frame);
  if (document.hidden || !renderer) return;
  const now = performance.now(); const dt = Math.min((now - last) / 1000, 0.05); last = now;
  elapsed += reduceMotion ? 0 : dt;
  pointer.x = lerp(pointer.x, reduceMotion ? 0 : pointer.tx, 0.05); pointer.y = lerp(pointer.y, reduceMotion ? 0 : pointer.ty, 0.05);

  let current = -1; let cp = 0;
  chapters.forEach((ch) => {
    const { p, visible } = progressOf(ch);
    syncSteps(ch, p);
    if (visible) { current = +ch.dataset.scene; cp = p; }
  });
  document.documentElement.classList.toggle('stage-off', current < 0);
  if (current < 0) { renderer.clear(); return; }
  if (current !== active) { prevActive = active; active = current; switchAt = elapsed; fade = 0; }
  fade = reduceMotion ? 1 : clamp(fade + dt * 1.3);
  scenes.forEach((s, i) => { s.group.visible = i === active; });
  const s = scenes[active];
  s.update(cp, elapsed, pointer);
  fadeGroup(s.group, ease(fade));
  s.group.scale.setScalar(lerp(0.9, 1, ease(fade)));

  // fit the scene into the visible part of the viewport (right side on desktop, top on mobile)
  const look = tmpL.fromArray(s.camera.look);
  const dir = tmpD.fromArray(s.camera.pos).sub(look); const base = dir.length(); dir.normalize();
  const vh = THREE.MathUtils.degToRad(camera.fov) / 2; const hh = Math.atan(Math.tan(vh) * camera.aspect);
  const wide = innerWidth > 900;
  const dist = Math.max(base * 0.8, s.fit[0] / Math.tan(hh * (wide ? 0.63 : 0.98)), s.fit[1] / Math.tan(vh * (wide ? 0.92 : 0.5)));
  tmpV.copy(look).addScaledVector(dir, dist);
  camPos.lerp(tmpV, reduceMotion ? 1 : 0.06);
  camLook.lerp(look, reduceMotion ? 1 : 0.06);
  camera.position.copy(camPos); camera.lookAt(camLook);
  renderer.render(scene, camera);
}
if (renderer) {
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const start = () => { document.documentElement.classList.add('stage-ready'); frame(); };
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(start, start);
} else {
  chapters.forEach((ch) => { const run = () => syncSteps(ch, progressOf(ch).p); addEventListener('scroll', run, { passive: true }); run(); });
}
