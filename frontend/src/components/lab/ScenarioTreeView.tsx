'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { scenarioMap } from './scenarioMap';
import { getCase, getCases, getScenarioTree, getScenarioDemo } from '@/lib/api';
import { analysisStartHref } from '@/lib/ai';
import { ApiError } from '@/lib/apiError';
import { AiHero } from '@/components/ai/AiHero';
import { AiCard } from '@/components/ai/AiCard';
import { CaseSearchSelect } from '@/components/ai/CaseSearchSelect';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import type { Case } from '@/types';
import type { ScenarioNode, ScenarioTree, SupportAssumption, DocumentAssumption, PaymentAssumption } from '@/types/scenarioTree';

export function assessment(node: ScenarioNode): string {
  if (node.support_weight != null) return `Demo tahmini: ${node.support_weight}/100`;
  if (node.probability != null) return `Demo tahmini: %${(node.probability * 100).toLocaleString('tr-TR', {minimumFractionDigits: 1, maximumFractionDigits: 1})}`;
  if (node.path_percent != null) return 'Başlangıçtan ulaşma ' + percent(node.path_percent);
  if (node.recorded_step) return 'Dosyada kayıtlı';
  return node.kind === 'context' ? 'Dosya bağlamı' : 'İzleme adımı';
}

function percent(value: number) {
  return (value / 100).toLocaleString('tr-TR', { style: 'percent', maximumFractionDigits: 2 });
}

const recordedColor = '#1e40af';
const edgeColors = ['#007eac', '#804ca3', '#aa5710'];

function TreeDiagram({ tree, selected, onSelect }: { tree: ScenarioTree; selected: string; onSelect: (id: string) => void }) {
  const marker = useId().replace(/:/g, '');
  const [hovered, setHovered] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const viewport = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const changeZoom = useCallback((requested: number, offsetX?: number, offsetY?: number) => {
    const element = viewport.current;
    const next = Math.min(200, Math.max(25, Math.round(requested)));
    if (!element || next === zoom) return;
    const x = offsetX ?? element.clientWidth / 2;
    const y = offsetY ?? element.clientHeight / 2;
    anchor.current = {x: (element.scrollLeft + x) * 100 / zoom, y: (element.scrollTop + y) * 100 / zoom, offsetX: x, offsetY: y};
    setZoom(next);
  }, [zoom]);

  useLayoutEffect(() => {
    const element = viewport.current;
    const point = anchor.current;
    if (!element || !point) return;
    element.scrollLeft = point.x * zoom / 100 - point.offsetX;
    element.scrollTop = point.y * zoom / 100 - point.offsetY;
    anchor.current = null;
  }, [zoom]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let frame = 0, delta = 0, x = 0, y = 0;
    function wheel(event: WheelEvent) {
      if (event.shiftKey || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      const bounds = element!.getBoundingClientRect();
      x = event.clientX - bounds.left;
      y = event.clientY - bounds.top;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element!.clientHeight : 1;
      delta += event.deltaY * unit * (event.ctrlKey ? 3 : 1);
      if (!frame) frame = requestAnimationFrame(() => {
        changeZoom(zoom * Math.exp(-delta / 450), x, y);
        frame = 0;
        delta = 0;
      });
    }
    element.addEventListener('wheel', wheel, {passive: false});
    return () => { element.removeEventListener('wheel', wheel); cancelAnimationFrame(frame); };
  }, [changeZoom, zoom]);

  const layout = useMemo(() => {
    const positions = new Map<string, {x: number; y: number; color: number}>();
    const children = new Map<string, ScenarioNode[]>();
    for (const n of tree.nodes) {
      if (n.parent_id) children.set(n.parent_id, [...(children.get(n.parent_id) ?? []), n]);
    }
    let row = 0, width = 0;
    function place(node: ScenarioNode, depth: number, color: number) {
      const x = depth * 360 + 16;
      const firstRow = row;
      width = Math.max(width, x + 272);
      const branches = children.get(node.id) ?? [];
      if (!branches.length) row++;
      branches.forEach((branch, i) => place(branch, depth + 1, i === 0 ? color : i % edgeColors.length));
      const y = (firstRow + row) * 116 / 2 - 46;
      positions.set(node.id, {x, y, color});
    }
    const root = tree.nodes.find(n => !n.parent_id);
    if (root) place(root, 0, 0);
    const height = Math.max(230, row * 116);
    const padding = (height - row * 116) / 2;
    for (const position of positions.values()) position.y += padding;
    return { positions, width, height };
  }, [tree]);
  const centered = useRef(false);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || centered.current) return;
    element.scrollTop = (layout.height - element.clientHeight) / 2;
    centered.current = true;
  }, [layout.height]);

  const trail = new Set<string>();
  let cursor = tree.nodes.find(n => n.id === (hovered ?? selected));
  while (cursor) {
    trail.add(cursor.id);
    const parent = cursor.parent_id;
    cursor = tree.nodes.find(n => n.id === parent);
  }
  const controlClass = "min-h-10 min-w-10 rounded-lg border border-surface-border px-3 text-sm font-semibold text-navy-800 hover:bg-accent-50 focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-40";
  return <div className="min-w-0 rounded-2xl border border-surface-border bg-surface-muted" role="group" aria-label="Dosya senaryo ağacı">
    <div role="group" aria-label="Grafik ölçeği" className="flex items-center justify-end gap-1 rounded-t-2xl border-b border-surface-border bg-white p-2">
      <button type="button" className={controlClass} aria-label="Uzaklaştır" title="Uzaklaştır" disabled={zoom <= 25} onClick={() => changeZoom(zoom - 25)}>−</button>
      <button type="button" className={controlClass + " tabular-nums"} aria-label={`Ölçek %${zoom}, normal boyuta dön`} title="Normal boyuta dön" onClick={() => changeZoom(100)}>%{zoom}</button>
      <button type="button" className={controlClass} aria-label="Yakınlaştır" title="Yakınlaştır" disabled={zoom >= 200} onClick={() => changeZoom(zoom + 25)}>+</button>
    </div>
    <div ref={viewport} className="max-h-[38rem] overflow-auto">
      <div className="relative overflow-hidden" style={{ width: layout.width * zoom / 100, height: layout.height * zoom / 100 }}>
        <div className="relative origin-top-left" style={{ width: layout.width, height: layout.height, transform: `scale(${zoom / 100})` }}>
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>{[...edgeColors, recordedColor].map((color, i) => <marker key={color} id={marker+i} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 10 5 0 10z" fill={color}/></marker>)}</defs>
        {tree.nodes.map(node => {
          if (!node.parent_id) return null;
          const from = layout.positions.get(node.parent_id)!, to = layout.positions.get(node.id)!;
          const start = from.x + 250, end = to.x - 4, cy = to.y + 46;
          const recorded = tree.case_closed && node.recorded_step;
          const color = recorded ? recordedColor : edgeColors[to.color];
          return <g key={node.id}>
            <path d={`M${start} ${from.y+46} C${start+45} ${from.y+46},${end-60} ${cy},${end} ${cy}`} fill="none" stroke={color} strokeWidth={recorded ? 5 : trail.has(node.id) ? 3.5 : 1.8} markerEnd={`url(#${marker}${recorded ? edgeColors.length : to.color})`}/>
            {node.transition_percent != null && <text x={end-4} y={cy-10} textAnchor="end" fill={color} fontSize="12" paintOrder="stroke" stroke="white" strokeWidth="3">{percent(node.transition_percent)}</text>}
          </g>;
        })}
      </svg>
      {tree.nodes.map(node => { const pos = layout.positions.get(node.id)!; const recorded = tree.case_closed && (!node.parent_id || node.recorded_step); return <button key={node.id} type="button" aria-pressed={selected === node.id}
        onMouseEnter={() => setHovered(node.id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(node.id)} onBlur={() => setHovered(null)}
        onClick={() => onSelect(node.id)} title={node.label}
        className={'absolute flex h-[92px] w-[250px] flex-col justify-center rounded-xl border px-3 py-2 text-left shadow-sm motion-safe:transition motion-safe:hover:-translate-y-1 hover:shadow-lg hover:ring-2 hover:ring-accent-400 focus-visible:ring-2 focus-visible:ring-accent-400 ' + (recorded ? 'border-2 border-blue-800 bg-blue-100 text-blue-950' : trail.has(node.id) ? 'border-accent-500 bg-accent-50 text-accent-900' : 'border-surface-border bg-white text-navy-800')}
        style={{ left: pos.x, top: pos.y }}>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-accent-700">{recorded ? '✓ Gerçekleşen yol' : tree.source_mode === 'dossier_history' ? (!node.parent_id || node.recorded_step ? 'Dosya geçmişi' : 'Alternatif yol') : node.kind === 'context' ? 'Kayıtlı dosya' : node.kind === 'scenario' ? 'Analiz senaryosu' : node.kind === 'development' ? 'Koşullu gelişme' : 'Olası izleme yolu'}</span>
        <span className="line-clamp-2 text-sm font-medium leading-5">{node.label}</span>
        <span className="text-[11px] text-navy-700">{node.path_percent == null ? assessment(node) : (node.parent_id ? `${node.illustrative ? 'Temsili geçiş' : 'Geçiş'} ${percent(node.transition_percent!)} · ` : '') + `Başlangıçtan ${percent(node.path_percent)}`}</span>
      </button>; })}
        </div>
      </div>
    </div>
  </div>;
}

export function ScenarioTreeView({ fixedCaseId, caseFile }: { fixedCaseId?: string; caseFile?: Case }) {
  const params = useSearchParams();
  const router = useRouter();
  const [demoMode, setDemoMode] = useState(!fixedCaseId && params.get('ornek') === 'belge-dogrulama');
  const [document, setDocument] = useState<DocumentAssumption>('unreviewed');
  const [payment, setPayment] = useState<PaymentAssumption>('unknown');
  const [assumptions, setAssumptions] = useState<Record<string, SupportAssumption>>({});
  const [cases, setCases] = useState<Case[]>([]);
  const [caseId, setCaseId] = useState<string | null>(fixedCaseId ?? params.get('dava'));
  const [tree, setTree] = useState<ScenarioTree | null>(null);
  const [selected, setSelected] = useState('root');
  const [view, setView] = useState<'graph' | 'text'>('graph');
  const [loading, setLoading] = useState(false);
  const [casesLoading, setCasesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [comparison, setComparison] = useState<{before: ScenarioTree; branches: string[]; facts: boolean} | null>(null);
  const request = useRef(0);
  const previous = useRef<ScenarioTree | null>(null);
  useEffect(() => {
    let active = true;
    if (fixedCaseId) return () => { request.current += 1; };
    getCases().then(rows => { if (active) setCases(rows); }).catch(() => { if (active) setCases([]); }).finally(() => { if (active) setCasesLoading(false); });
    return () => { active = false; request.current += 1; };
  }, []);
  async function load(id: string, refresh = false, values = assumptions, doc = document, pay = payment, demo = demoMode) {
    const seq = ++request.current;
    setLoading(true); setError(null);
    if (!refresh) { setTree(null); previous.current = null; setChanged(false); setComparison(null); }
    try {
      const snapshot = demo ? await getScenarioDemo(doc, pay) : await getScenarioTree(id, values);
      if (seq !== request.current) return;
      let file = caseFile ?? cases.find(item => item.id === id);
      if (snapshot.case_closed && !file)
        file = await getCase(id);
      if (seq !== request.current) return;
      const next = scenarioMap(snapshot, file);
      setChanged(!!previous.current && previous.current.case_id === next.case_id && previous.current.context_version !== next.context_version);
      const before = previous.current;
      if (before && before.case_id === next.case_id && before.context_version !== next.context_version) {
        const old = new Map(before.nodes.map(n => [n.id, n]));
        const branches = next.nodes.filter(n => JSON.stringify(n) !== JSON.stringify(old.get(n.id))).map(n => n.label);
        for (const n of before.nodes) if (!next.nodes.some(after => after.id === n.id)) branches.push('Kaldırılan dal: ' + n.label);
        setComparison({before, branches, facts: JSON.stringify(before.current_facts) !== JSON.stringify(next.current_facts) || JSON.stringify(before.sources) !== JSON.stringify(next.sources)});
      } else setComparison(null);
      previous.current = next; setTree(next); setSelected('root');
    } catch (e) {
      if (seq !== request.current) return;
      setTree(null);
      setError(e instanceof ApiError && e.status === 404 ? 'Dosya bulunamadı veya bu dosyaya erişiminiz yok.' : 'Ağaç yüklenemedi. Bağlantınızı ve dosya erişiminizi kontrol edin.');
    } finally { if (seq === request.current) setLoading(false); }
  }
  useEffect(() => { if (demoMode || caseId) void load(demoMode ? 'demo:invoice-evidence-v1' : caseId!); }, [caseId, demoMode]); // Snapshot is read only; no model call or storage write.
  function switchMode(demo: boolean, id: string | null = caseId) {
    if (demo === demoMode && (demo || id === caseId)) return;
    request.current += 1; previous.current = null; setTree(null); setComparison(null); setChanged(false); setAssumptions({}); setError(null); setLoading(false);
    setDemoMode(demo); setCaseId(id);
    router.replace(demo ? '/ai/olasilik?ornek=belge-dogrulama' : id ? `/ai/olasilik?dava=${encodeURIComponent(id)}` : '/ai/olasilik');
  }
  const urlKey = params.toString();
  const lastUrl = useRef(urlKey);
  useEffect(() => {
    if (fixedCaseId || lastUrl.current === urlKey) return;
    lastUrl.current = urlKey;
    const demo = params.get('ornek') === 'belge-dogrulama', id = params.get('dava');
    if (demo !== demoMode || (!demo && id !== caseId)) switchMode(demo, id);
  }, [urlKey]);
  const node = useMemo(() => tree?.nodes.find(n => n.id === selected) ?? tree?.nodes[0], [tree, selected]);
  function exhibitLink(id: string, label: string) {
    if (!tree || !id.startsWith('document:')) return label;
    return <Link className="text-accent-700 underline" href={`/davalar/${tree.case_id}?sekme=belgeler&belge=${encodeURIComponent(id.slice(9))}`}>{label}</Link>;
  }
  const sourceById = useMemo(() => new Map(tree?.sources.map(s => [s.id, s]) ?? []), [tree]);
  return <div className="space-y-5">
    {!fixedCaseId && <><AiHero compact title="Olasılık Ağacı" description="Dosyanızdaki kayıtları, alternatif senaryoları ve koşullu gelişmeleri dayanaklarıyla birlikte inceleyin. Demo tahminlerini, kullanılan varsayımları ve hesaplama yöntemini birlikte inceleyin." />
    <div className="flex flex-wrap gap-3"><button type="button" onClick={() => switchMode(true)} className="rounded-xl bg-accent-700 px-4 py-2 text-sm font-semibold text-white">Kurgusal davayı aç — Demo tahmini</button>{demoMode && <button type="button" onClick={() => switchMode(false)} className="rounded-xl border border-surface-border px-4 py-2 text-sm">Büro dosyalarına dön</button>}</div>
    {!demoMode && <AiCard><details open={!tree}><summary className="cursor-pointer text-sm font-semibold text-navy-900">{tree ? `Seçili dosya: ${tree.title} · Dosyayı değiştir` : 'Bir dava seçin'}</summary>
      <div className="mt-3">{casesLoading ? <LoadingState label="Dava listesi yükleniyor…" /> : <CaseSearchSelect cases={cases} value={caseId} onChange={id => switchMode(false, id)} />}</div>
    </details></AiCard>}
    </>}
    {error && <div role="alert"><ErrorState message={error} /></div>}
    {loading && <LoadingState label="Dosya kayıtlarından ağaç hazırlanıyor…" />}
    {!demoMode && !caseId && !casesLoading && <p className="rounded-xl border border-surface-border bg-white p-5 text-sm text-navy-600">Ağaç oluşturmak için erişiminiz olan bir dosya seçin. Bu görünüm yeni bir yapay zekâ analizi başlatmaz.</p>}
    {tree && node && <>
      <div className="rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-900">
        <strong>{tree.source_mode === 'dossier_history' ? 'Kurgusal dosyanın karar ağacı' : tree.source_mode === 'synthetic_demo' ? 'Kurgusal dosya — Demo tahmini' : tree.source_mode === 'stored_analysis' ? (tree.is_example ? 'Gösterim analiz kaydındaki senaryolar' : 'Kayıtlı analizdeki senaryolar') : 'Koşullu hazırlık yolları'}</strong>
        <p className="mt-1">{tree.source_mode === 'dossier_history' ? 'Bir aşama seçerek dayanak evrakı, önceki adımdan geçişi ve başlangıçtan ulaşma yüzdesini inceleyin. Yüzdeler bu kurgusal senaryonun varsayımlarıdır.' : tree.source_mode === 'synthetic_demo' ? 'Tek bir kurgusal inceleme sorusunun birbirini dışlayan ve tüm seçenekleri kapsayan üç alternatifidir.' : tree.source_mode === 'stored_analysis' ? 'Dallar son tamamlanmış analiz kaydından alınmıştır; sıraları olasılık derecesi değildir.' : 'Kayıtlı, kullanılabilir analiz senaryosu bulunamadı. Genel hazırlık dalları dosyaya özgü bir tahmin değildir.'}</p>
        {tree.source_mode !== "dossier_history" && <p className="mt-1 font-medium">{tree.demo ? 'Demo tahmini yüzdeleri yalnız bu aynı sorunun alternatifleri arasında toplam %100’dür.' : 'Demo tahmini destek ağırlığı: her dal bağımsız 0–100 ölçeğindedir; örtüşebilen dallar toplamlanmaz. Başlangıç 50/100 nötr varsayımdır.'}</p>}
      </div>
      {tree.source_mode !== "dossier_history" && <section aria-label="Demo hesaplama yöntemi" className="space-y-3 rounded-xl border border-surface-border bg-white p-4 text-sm text-navy-700">
        <h2 className="font-semibold text-navy-900">Demo tahmini — varsayımlar ve yöntem</h2>
        <p>{tree.demo?.method ?? tree.support_model?.method}</p>
        {tree.demo ? <>
          <p>{tree.demo.groups[0].question}</p><p>{tree.demo.groups[0].definition}</p>
          <div className="flex flex-wrap gap-4">{(['document', 'payment'] as const).map(key => <label key={key} className="flex min-w-0 flex-col gap-1">{key === 'document' ? 'Belge varsayımı' : 'Ödeme varsayımı'}<select className="max-w-full rounded-lg border border-surface-border bg-white p-2" value={key === 'document' ? document : payment} onChange={e => {const doc = key === 'document' ? e.target.value as DocumentAssumption : document; const pay = key === 'payment' ? e.target.value as PaymentAssumption : payment; setDocument(doc); setPayment(pay); void load(tree.case_id, true, {}, doc, pay);}}>
            <option value={key === 'document' ? 'unreviewed' : 'unknown'}>Kayıt var, inceleme / eşleşme belirsiz</option><option value="supports">Destekleyici olduğu varsayılıyor</option><option value="contradicts">Çelişkili olduğu varsayılıyor</option><option value="missing">Gerekli kayıt yok — eşit başlangıç</option>
          </select></label>)}</div>
          {tree.demo.missing_reason && <p className="font-medium">{tree.demo.missing_reason}</p>}
          {tree.demo.assumptions.map(a => <p key={a.id}>{a.label}: {a.explanation}</p>)}
          <ul>{tree.demo.groups[0].weights.map(w => <li key={w.node_id}>{tree.nodes.find(n => n.id === w.node_id)?.label}: {w.score} / {tree.demo!.groups[0].total_points} puan → {assessment(tree.nodes.find(n => n.id === w.node_id)!)}</li>)}</ul>
        </> : <div className="space-y-3">{tree.support_model?.assumptions.map(a => <label key={a.node_id} className="block rounded-lg border border-surface-border p-3"><span className="block font-medium">{tree.nodes.find(n => n.id === a.node_id)?.label}</span><select aria-label={`Varsayım: ${tree.nodes.find(n => n.id === a.node_id)?.label}`} className="my-2 max-w-full rounded-lg border border-surface-border bg-white p-2" value={assumptions[a.node_id] ?? 'neutral'} onChange={e => {const values = {...assumptions, [a.node_id]: e.target.value as SupportAssumption}; setAssumptions(values); void load(tree.case_id, true, values);}}><option value="neutral">Nötr başlangıç</option><option value="supports">Dayanaklar bu dalı destekliyor varsay</option><option value="contradicts">Dayanaklar bu dalla çelişiyor varsay</option></select><span className="block text-xs leading-5">{a.explanation}</span></label>)}</div>}
      </section>}
      {changed && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Kaynaklar veya varsayımlar önceki görüntülemeye göre değişti. Ağaç yenilendi; dayanakları ve belirsizlikleri yeniden inceleyin.</p>}
      {comparison && <details className="rounded-xl border border-surface-border bg-white p-4 text-sm text-navy-700"><summary className="cursor-pointer font-semibold">Değişen dayanaklar ve önceki görüntü</summary>
        <p className="mt-2">{comparison.facts ? 'Dosya olayları, belge kayıtları veya analiz dayanakları değişti.' : 'Kaynak içeriğinin sürümü değişti; dal metinleri aynı kalmış olabilir.'}</p>
        {comparison.branches.length > 0 && <ul className="mt-2 list-disc pl-4">{comparison.branches.map((label,i) => <li key={i}>{label}</li>)}</ul>}
        <p className="mt-3 font-semibold">Önceki görüntü — bu oturumda korunur</p><ul className="mt-2 list-disc pl-4">{comparison.before.current_facts.map((fact,i) => <li key={i}>{fact}</li>)}</ul>
        {comparison.before.nodes.filter(n => n.parent_id === 'root').map(n => <p className="mt-2" key={n.id}>{n.label}: {assessment(n)} · {n.description}</p>)}
      </details>}
      {tree.source_mode !== 'dossier_history' && <p className="text-sm text-navy-700">Senaryo yüzdeleri tek bir izleme yolunu canlandırır. Kayıtlı oranı olmayan dallara sunum için dosyaya özgü, rastgele temsili yüzdeler atanır. Aynı dosya açıldığında bu değerler korunur. Başlangıçtan ulaşma yüzdesi, yol üzerindeki geçişlerin çarpımıdır. Destek puanı ayrıca gösterilir.</p>}
      {tree.case_closed && <p className="rounded-xl border-l-4 border-blue-800 bg-blue-50 p-3 text-sm font-semibold text-blue-900">✓ Gerçekleşen yol · Kalın mavi çizgi dosyada kayıtlı adımları kapanışa kadar izler.</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Ağaç görünümü" className="inline-flex rounded-xl border border-surface-border bg-white p-1">
          <button type="button" aria-pressed={view === 'graph'} onClick={() => setView('graph')} className={'rounded-lg px-3 py-2 text-sm '+(view === 'graph' ? 'bg-accent-50 font-semibold text-accent-800' : 'text-navy-600')}>Ağaç</button>
          <button type="button" aria-pressed={view === 'text'} onClick={() => setView('text')} className={'rounded-lg px-3 py-2 text-sm '+(view === 'text' ? 'bg-accent-50 font-semibold text-accent-800' : 'text-navy-600')}>Metin alternatifi</button>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {!tree.demo && <Link href={analysisStartHref(tree.case_id)} className="self-center text-accent-700 underline">Dosya analizini aç</Link>}
          <button type="button" disabled={loading} onClick={() => void load(tree.case_id, true)} className="rounded-xl border border-accent-200 bg-white px-3 py-2 text-accent-800 disabled:opacity-50">Kaynakları yenile</button>
        </div>
      </div>
      <p className="text-xs text-navy-500">Fare tekerleği veya izleme dörtgeninde kıstırma hareketiyle işaretçinin bulunduğu noktayı yakınlaştırıp uzaklaştırabilirsiniz.</p>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {view === 'graph' ? <TreeDiagram key={tree.case_id} tree={tree} selected={selected} onSelect={setSelected} /> : <section aria-label="Ağacın metin alternatifi" className="space-y-3 rounded-2xl border border-surface-border bg-white p-4">
          {tree.nodes.map(n => <article key={n.id} className={'rounded-xl border border-surface-border p-3 '+(n.parent_id ? 'ml-3' : '')}>
            <button type="button" onClick={() => setSelected(n.id)} aria-pressed={selected === n.id} className="text-left text-sm font-semibold text-accent-800">{n.label}</button>
            <p className="mt-1 text-sm text-navy-700">{n.description}</p>{tree.case_closed && (!n.parent_id || n.recorded_step) && <p>✓ Gerçekleşen yol</p>}<p className="mt-1 text-xs text-navy-500">{assessment(n)}</p>{n.transition_percent != null && <p className="text-xs">Geçiş {percent(n.transition_percent)} · Başlangıçtan {percent(n.path_percent!)}</p>}
            <p className="mt-2 text-sm text-navy-600">{n.reasoning}</p>
            <p className="mt-2 text-xs font-semibold text-navy-700">Dayanaklar</p><ul className="mt-1 space-y-1 text-xs text-navy-600">{n.source_ids.map(id => <li key={id}>{exhibitLink(id, sourceById.get(id)?.label ?? id)}: {sourceById.get(id)?.detail}</li>)}</ul>
            <p className="mt-2 text-xs font-semibold text-navy-700">Belirsizlikler</p><ul className="mt-1 list-disc pl-4 text-xs text-navy-600">{n.uncertainties.map((u,i) => <li key={i}>{u}</li>)}</ul>
          </article>)}
        </section>}
        <section aria-label="Seçili dalın dayanakları" className="space-y-4 rounded-2xl border border-surface-border bg-white p-5">
          <div><h2 className="text-base font-semibold text-navy-900">{node.label}</h2><p className="mt-2 text-sm leading-6 text-navy-700">{node.description}</p></div>
          <div className="rounded-xl bg-accent-50 p-3 text-sm text-accent-800"><strong>{assessment(node)}</strong>{node.transition_percent != null && <p>Önceki adımdan geçiş {percent(node.transition_percent)}</p>}{node.path_percent != null && <p className="mt-1 text-xs">Senaryo varsayımı · <span>Başlangıçtan ulaşma {percent(node.path_percent)}</span></p>}<p className="mt-1 leading-6">{node.reasoning}</p></div>
          {node.kind === 'context' && <details><summary className="cursor-pointer text-sm font-semibold text-navy-800">Kayıtlı olaylar ve iddialar</summary><ul className="mt-2 list-disc space-y-2 pl-4 text-sm text-navy-600">{tree.current_facts.map((f,i) => <li key={i}>{f}</li>)}</ul></details>}
          <div><h3 className="text-sm font-semibold text-navy-800">Dayanaklar</h3><ul className="mt-2 space-y-2">{node.source_ids.map(id => { const source = sourceById.get(id)!; return <li key={id} className="rounded-lg border border-surface-border p-2 text-xs leading-5 text-navy-600"><strong className="block text-navy-800">{exhibitLink(id, source.label)}</strong>{source.detail}{source.recorded_at && <span className="mt-1 block text-navy-500">Kayıt: {source.recorded_at.slice(0,10)}</span>}</li>; })}</ul></div>
          {tree.source_mode === "dossier_history" && tree.nodes.some(n => n.parent_id === node.id) && <div><h3 className="text-sm font-semibold text-navy-800">Sonraki adımlar</h3><ul className="mt-2 space-y-2">{tree.nodes.filter(n => n.parent_id === node.id).map(n => <li key={n.id}><button type="button" className="text-left text-sm text-accent-700 underline" onClick={() => setSelected(n.id)}>{n.label} · {percent(n.transition_percent ?? 0)}</button></li>)}</ul></div>}
          {node.uncertainties.length > 0 && <div><h3 className="text-sm font-semibold text-navy-800">Belirsizlikler ve açık sorular</h3><ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-5 text-navy-600">{node.uncertainties.map((u,i) => <li key={i}>{u}</li>)}</ul></div>}
        </section>
      </div>
      <p className="text-xs leading-6 text-navy-500">{tree.disclaimer}</p>
      <p className="text-xs leading-5 text-navy-500">{tree.limits_note}{tree.truncated ? ' Bazı kayıtlar gösterim sınırı nedeniyle bu görüntüye dahil edilmedi.' : ''}</p>
    </>}
  </div>;
}
