'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { getCases, getScenarioTree, getScenarioDemo } from '@/lib/api';
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
  return node.kind === 'context' ? 'Dosya bağlamı' : 'İzleme adımı';
}

function TreeDiagram({ tree, selected, onSelect }: { tree: ScenarioTree; selected: string; onSelect: (id: string) => void }) {
  const marker = useId().replace(/:/g, '');
  const branches = tree.nodes.filter(n => n.parent_id === 'root');
  const height = Math.max(520, branches.length * 200 + 40);
  const positions = new Map<string, { x: number; y: number }>([['root', { x: 20, y: Math.min(240, height / 2 - 48) }]]);
  branches.forEach((branch, i) => {
    const children = tree.nodes.filter(n => n.parent_id === branch.id);
    positions.set(branch.id, { x: 330, y: i * 200 + 42 });
    children.forEach((child, j) => positions.set(child.id, { x: 640, y: i * 200 + (children.length > 1 ? j * 100 + 4 : 42) }));
  });
  return <div className="max-h-[38rem] overflow-auto rounded-2xl border border-surface-border bg-surface-muted p-2" role="group" aria-label="Dosya senaryo ağacı">
    <div className="relative" style={{ width: 920, height }}>
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 920 ${height}`}>
        <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 10 5 0 10" fill="#007eac" /></marker></defs>
        {tree.nodes.filter(n => n.parent_id).map(node => {
          const from = positions.get(node.parent_id!)!, to = positions.get(node.id)!;
          return <path key={node.id} d={`M${from.x + 250} ${from.y + 43} C${from.x + 285} ${from.y + 43},${to.x - 35} ${to.y + 43},${to.x} ${to.y + 43}`} fill="none" stroke="#007eac" strokeWidth="1.6" markerEnd={`url(#${marker})`} />;
        })}
      </svg>
      {tree.nodes.map(node => { const pos = positions.get(node.id)!; return <button key={node.id} type="button" aria-pressed={selected === node.id}
        onClick={() => onSelect(node.id)} title={node.label}
        className={'absolute flex min-h-[86px] w-[250px] flex-col justify-center rounded-xl border px-3 py-2 text-left shadow-sm focus-visible:ring-2 focus-visible:ring-accent-400 ' + (selected === node.id ? 'border-accent-500 bg-accent-50 text-accent-900' : 'border-surface-border bg-white text-navy-800')}
        style={{ left: pos.x, top: pos.y }}>
        <span className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-accent-700">{node.kind === 'context' ? 'Kayıtlı dosya' : node.kind === 'scenario' ? 'Analiz senaryosu' : node.kind === 'development' ? 'Koşullu gelişme' : 'Olası izleme yolu'}</span>
        <span className="line-clamp-2 text-sm font-medium leading-5">{node.label}</span>
        <span className="mt-1 text-[10px] text-navy-500">{assessment(node)}</span>
      </button>; })}
    </div>
  </div>;
}

export function ScenarioTreeView({ fixedCaseId }: { fixedCaseId?: string }) {
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
      const next = demo ? await getScenarioDemo(doc, pay) : await getScenarioTree(id, values);
      if (seq !== request.current) return;
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
  const sourceById = useMemo(() => new Map(tree?.sources.map(s => [s.id, s]) ?? []), [tree]);
  return <div className="space-y-5">
    {!fixedCaseId && <><AiHero compact title="Olasılık Ağacı" description="Dosyanızdaki kayıtları, alternatif senaryoları ve koşullu gelişmeleri dayanaklarıyla birlikte inceleyin. Demo tahminlerini, kullanılan varsayımları ve hesaplama yöntemini birlikte inceleyin." />
    <div className="flex flex-wrap gap-3"><button type="button" onClick={() => switchMode(true)} className="rounded-xl bg-accent-700 px-4 py-2 text-sm font-semibold text-white">Örnek davayı aç — Demo tahmini</button>{demoMode && <button type="button" onClick={() => switchMode(false)} className="rounded-xl border border-surface-border px-4 py-2 text-sm">Büro dosyalarına dön</button>}</div>
    {!demoMode && <AiCard><details open={!tree}><summary className="cursor-pointer text-sm font-semibold text-navy-900">{tree ? `Seçili dosya: ${tree.title} · Dosyayı değiştir` : 'Bir dava seçin'}</summary>
      <div className="mt-3">{casesLoading ? <LoadingState label="Dava listesi yükleniyor…" /> : <CaseSearchSelect cases={cases} value={caseId} onChange={id => switchMode(false, id)} />}</div>
    </details></AiCard>}
    </>}
    {error && <div role="alert"><ErrorState message={error} /></div>}
    {loading && <LoadingState label="Dosya kayıtlarından ağaç hazırlanıyor…" />}
    {!demoMode && !caseId && !casesLoading && <p className="rounded-xl border border-surface-border bg-white p-5 text-sm text-navy-600">Ağaç oluşturmak için erişiminiz olan bir dosya seçin. Bu görünüm yeni bir yapay zekâ analizi başlatmaz.</p>}
    {tree && node && <>
      <div className="rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-900">
        <strong>{tree.source_mode === 'synthetic_demo' ? 'Sentetik örnek — Demo tahmini' : tree.source_mode === 'stored_analysis' ? (tree.is_example ? 'Örnek analiz kaydındaki senaryolar' : 'Kayıtlı analizdeki senaryolar') : 'Koşullu hazırlık yolları'}</strong>
        <p className="mt-1">{tree.source_mode === 'synthetic_demo' ? 'Tek bir kurgusal inceleme sorusunun birbirini dışlayan ve tüm seçenekleri kapsayan üç alternatifidir.' : tree.source_mode === 'stored_analysis' ? 'Dallar son tamamlanmış analiz kaydından alınmıştır; sıraları olasılık derecesi değildir.' : 'Kayıtlı, kullanılabilir analiz senaryosu bulunamadı. Genel hazırlık dalları dosyaya özgü bir tahmin değildir.'}</p>
        <p className="mt-1 font-medium">{tree.demo ? 'Demo tahmini yüzdeleri yalnız bu aynı sorunun alternatifleri arasında toplam %100’dür.' : 'Demo tahmini destek ağırlığı: her dal bağımsız 0–100 ölçeğindedir; örtüşebilen dallar toplamlanmaz. Başlangıç 50/100 nötr varsayımdır.'}</p>
      </div>
      <section aria-label="Demo hesaplama yöntemi" className="space-y-3 rounded-xl border border-surface-border bg-white p-4 text-sm text-navy-700">
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
      </section>
      {changed && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Kaynaklar veya varsayımlar önceki görüntülemeye göre değişti. Ağaç yenilendi; dayanakları ve belirsizlikleri yeniden inceleyin.</p>}
      {comparison && <details className="rounded-xl border border-surface-border bg-white p-4 text-sm text-navy-700"><summary className="cursor-pointer font-semibold">Değişen dayanaklar ve önceki görüntü</summary>
        <p className="mt-2">{comparison.facts ? 'Dosya olayları, belge kayıtları veya analiz dayanakları değişti.' : 'Kaynak içeriğinin sürümü değişti; dal metinleri aynı kalmış olabilir.'}</p>
        {comparison.branches.length > 0 && <ul className="mt-2 list-disc pl-4">{comparison.branches.map((label,i) => <li key={i}>{label}</li>)}</ul>}
        <p className="mt-3 font-semibold">Önceki görüntü — bu oturumda korunur</p><ul className="mt-2 list-disc pl-4">{comparison.before.current_facts.map((fact,i) => <li key={i}>{fact}</li>)}</ul>
        {comparison.before.nodes.filter(n => n.parent_id === 'root').map(n => <p className="mt-2" key={n.id}>{n.label}: {assessment(n)} · {n.description}</p>)}
      </details>}
      {tree.case_closed && <p className="text-sm text-navy-600">Dosya kapalı olarak kayıtlıdır. Bu görünüm kayıttaki senaryoların incelenmesi içindir; yeni bir yargılama sonucu öngörmez.</p>}
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
      <p className="text-xs text-navy-500">Grafiği yatay veya dikey kaydırabilirsiniz. Tüm dalları ve dayanakları okumak için metin alternatifini de kullanabilirsiniz.</p>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {view === 'graph' ? <TreeDiagram tree={tree} selected={selected} onSelect={setSelected} /> : <section aria-label="Ağacın metin alternatifi" className="space-y-3 rounded-2xl border border-surface-border bg-white p-4">
          {tree.nodes.map(n => <article key={n.id} className={'rounded-xl border border-surface-border p-3 '+(n.parent_id ? 'ml-3' : '')}>
            <button type="button" onClick={() => setSelected(n.id)} aria-pressed={selected === n.id} className="text-left text-sm font-semibold text-accent-800">{n.label}</button>
            <p className="mt-1 text-sm text-navy-700">{n.description}</p><p className="mt-1 text-xs text-navy-500">{assessment(n)}</p>
            <p className="mt-2 text-sm text-navy-600">{n.reasoning}</p>
            <p className="mt-2 text-xs font-semibold text-navy-700">Dayanaklar</p><ul className="mt-1 space-y-1 text-xs text-navy-600">{n.source_ids.map(id => <li key={id}>{sourceById.get(id)?.label}: {sourceById.get(id)?.detail}</li>)}</ul>
            <p className="mt-2 text-xs font-semibold text-navy-700">Belirsizlikler</p><ul className="mt-1 list-disc pl-4 text-xs text-navy-600">{n.uncertainties.map((u,i) => <li key={i}>{u}</li>)}</ul>
          </article>)}
        </section>}
        <section aria-label="Seçili dalın dayanakları" className="space-y-4 rounded-2xl border border-surface-border bg-white p-5">
          <div><h2 className="text-base font-semibold text-navy-900">{node.label}</h2><p className="mt-2 text-sm leading-6 text-navy-700">{node.description}</p></div>
          <div className="rounded-xl bg-accent-50 p-3 text-sm text-accent-800"><strong>{assessment(node)}</strong><p className="mt-1 leading-6">{node.reasoning}</p></div>
          {node.kind === 'context' && <details><summary className="cursor-pointer text-sm font-semibold text-navy-800">Kayıtlı olaylar ve iddialar</summary><ul className="mt-2 list-disc space-y-2 pl-4 text-sm text-navy-600">{tree.current_facts.map((f,i) => <li key={i}>{f}</li>)}</ul></details>}
          <div><h3 className="text-sm font-semibold text-navy-800">Dayanaklar</h3><ul className="mt-2 space-y-2">{node.source_ids.map(id => { const source = sourceById.get(id)!; return <li key={id} className="rounded-lg border border-surface-border p-2 text-xs leading-5 text-navy-600"><strong className="block text-navy-800">{source.label}</strong>{source.detail}{source.recorded_at && <span className="mt-1 block text-navy-500">Kayıt: {source.recorded_at.slice(0,10)}</span>}</li>; })}</ul></div>
          <div><h3 className="text-sm font-semibold text-navy-800">Belirsizlikler ve açık sorular</h3><ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-5 text-navy-600">{node.uncertainties.map((u,i) => <li key={i}>{u}</li>)}</ul></div>
        </section>
      </div>
      <p className="text-xs leading-6 text-navy-500">{tree.disclaimer}</p>
      <p className="text-xs leading-5 text-navy-500">{tree.limits_note}{tree.truncated ? ' Bazı kayıtlar gösterim sınırı nedeniyle bu görüntüye dahil edilmedi.' : ''}</p>
    </>}
  </div>;
}
