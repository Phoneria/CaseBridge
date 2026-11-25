'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { getPresentationCatalogue, getPresentationFile, downloadPresentationPdf } from '@/lib/api';
import type { PresentationFile } from '@/lib/api';
import { caseDetailHref } from '@/lib/filters';
import { saveBlob } from '@/lib/download';
import { TreeDiagram } from '@/components/lab/ScenarioTreeView';
import { readingMarkdown } from '@/lib/readingMarkdown';

import { PresentationEye } from '@/components/PresentationEye';

const control = 'rounded-xl border border-surface-border bg-white px-3 py-2 text-sm text-navy-800 hover:border-accent-400 aria-pressed:border-accent-600 aria-pressed:bg-accent-50';
const panel = 'rounded-2xl border border-surface-border bg-white p-5 text-navy-900';
type Section = 'Genel Bakış' | 'Belgeler' | 'Olasılık Ağacı';
type Catalogue = Awaited<ReturnType<typeof getPresentationCatalogue>>;

export function PresentationView({onClose}: {onClose: (path?: string) => void}) {
  const entry = useMemo(() => new URL(window.location.href), []);
  const [catalogue, setCatalogue] = useState<Catalogue>();
  const [id, setId] = useState(entry.pathname.match(/^\/davalar\/([^/]+)$/)?.[1] ?? entry.searchParams.get('dava') ?? '');
  const initialTab = entry.searchParams.get('sekme');
  const [section, setSection] = useState<Section>(initialTab === 'belgeler' ? 'Belgeler' : initialTab === 'olasilik' || entry.pathname === '/ai/olasilik' ? 'Olasılık Ağacı' : 'Genel Bakış');
  const [file, setFile] = useState<PresentationFile>();
  const [docId, setDocId] = useState(entry.searchParams.get('belge') ?? '');
  const [nodeId, setNodeId] = useState('root');
  const [error, setError] = useState('');
  const [attempt,setAttempt] = useState(0);
  const [moved,setMoved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    getPresentationCatalogue().then(data => {
      if (current) {setCatalogue(data); setId(old => data.cases.some(c => c.id === old) ? old : '');}
    }).catch(() => {if (current) setError('Sunum dosyaları yüklenemedi.');});
    return () => {current = false;};
  }, [attempt]);
  useEffect(() => {
    if (!id || !catalogue?.cases.some(c => c.id === id)) return;
    let current = true;
    getPresentationFile(id).then(data => {if (current) setFile(data);})
      .catch(() => {if (current) setError('Sunum dosyası açılamadı.');});
    return () => {current = false;};
  }, [id, catalogue]);
  function selectCase(next: string) {
    setMoved(true); setId(next); setFile(undefined); setDocId(''); setNodeId('root'); setError(''); setSection('Genel Bakış');
  }
  const current = file?.id === id ? file : undefined;
  const doc = current?.documents.find(d => d.id === docId);
  const node = current?.nodes.find(n => n.id === nodeId);
  const graph = useMemo(() => ({nodes:current?.nodes ?? [],case_closed:true,source_mode:"dossier_history" as const}), [current]);
  function close() {
    if (!moved) return onClose();
    if (!current) return onClose('/davalar');
    const tab = section === 'Belgeler' ? 'belgeler' : section === 'Olasılık Ağacı' ? 'olasilik' : undefined;
    const path = caseDetailHref(current.id, tab);
    onClose(doc && tab === 'belgeler' ? path + '&belge=' + encodeURIComponent(doc.id) : path);
  }
  async function download() {
    if (!doc || !current || busy) return;
    setBusy(true);
    try {saveBlob(await downloadPresentationPdf(current.id,doc.id), doc.title + ' (maskeli).pdf');}
    catch {setError('Maskeli PDF indirilemedi.');}
    finally {setBusy(false);}
  }
  return <div className="h-dvh overflow-y-auto bg-surface-muted text-navy-900">
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-surface-border bg-white px-5 py-3">
      <div><span className="text-sm text-navy-500">CaseBridge</span><h1 className="font-semibold">Maskeli sunum</h1></div>
      <PresentationEye active onClick={close}/>
    </header>
    <main className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      {error && <div role="alert">{error} <button className={control} onClick={() => {setError('');setAttempt(i=>i+1);}}>Tekrar dene</button></div>}
      {!catalogue && !error && <p role="status">Sunum dosyaları yükleniyor…</p>}
      {catalogue && !id && <>
        <h2 className="text-xl font-semibold">Davalar</h2>
        {!catalogue.cases.length && <p>Bu büroda yüklü sunum dosyası bulunmuyor.</p>}
        <div className="grid gap-3 md:grid-cols-2">{catalogue.cases.map(c=><button className={panel+' text-left hover:border-accent-400'} key={c.id} onClick={()=>selectCase(c.id)}>
          <strong>{c.title}</strong><p className="mt-2 text-sm">{c.client} · {c.opponent}</p>
        </button>)}</div>
        {catalogue.contacts.length>0 && <section className={panel}><h2 className="font-semibold">Müvekkil iletişim bilgileri</h2>
          {catalogue.contacts.map((c,i)=><p className="mt-2 text-sm" key={i}>{[c.name,c.email,c.phone].filter(Boolean).join(' · ')}</p>)}</section>}
      </>}
      {id && <button className={control} onClick={()=>selectCase('')}>← Davalar</button>}
      {id && !current && !error && <p role="status">Dosya açılıyor…</p>}
      {current && <>
        <h2 className="text-2xl font-semibold">{current.title}</h2>
        <p>{current.client} · {current.opponent}</p>
        <nav aria-label="Sunum dosyası" className="flex flex-wrap gap-2">{(['Genel Bakış','Belgeler','Olasılık Ağacı'] as const).map(s=><button className={control} aria-pressed={section===s} key={s} onClick={()=>{setMoved(true);setSection(s);}}>{s}</button>)}</nav>
        {section==='Genel Bakış' && <section className={panel}><h3 className="font-semibold">Olay</h3><p className="mt-2">{current.facts}</p><h3 className="mt-5 font-semibold">Dosyanın sonucu</h3><p className="mt-2">{current.closing}</p></section>}
        {section==='Belgeler' && <section className={panel}>
          <label className="block font-medium">Belge seç<select className={control+' mt-2 block max-w-full'} value={doc?.id ?? ''} onChange={e=>{setMoved(true);setDocId(e.target.value);}}>
            <option value="">Belge seçin</option>{current.documents.map(d=><option key={d.id} value={d.id}>{d.day} · {d.title}</option>)}
          </select></label>
          {doc && <><button onClick={download} disabled={busy} className={control+' my-4'}>Maskeli PDF indir</button><article className="prose max-w-none whitespace-pre-line"><ReactMarkdown skipHtml>{readingMarkdown(doc.text)}</ReactMarkdown></article></>}
        </section>}
        {section==='Olasılık Ağacı' && <><TreeDiagram tree={graph} selected={nodeId} onSelect={setNodeId}/>
          {node && <section className={panel}><h3 className="font-semibold">{node.label}</h3><p className="mt-2">{node.description}</p><p className="my-2">{node.reasoning}</p>
            <div className="flex flex-wrap gap-2">{current.documents.filter(d=>node.source_ids.includes('document:'+d.id)).map(d=><button className={control} key={d.id} onClick={()=>{setMoved(true);setDocId(d.id);setSection('Belgeler');}}>{d.title}</button>)}</div>
          </section>}</>}
      </>}
    </main>
  </div>;
}
