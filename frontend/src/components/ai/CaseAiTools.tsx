'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Case } from '@/types';
import { caseDetailHref } from '@/lib/filters';
import { AI_ROUTES } from '@/lib/ai';
import { DirectedTrialView } from '@/components/lab/DirectedTrialView';
import { CounterAnalysisView } from '@/components/lab/CounterAnalysisView';
import { CourtroomLobbyView } from './CourtroomLobbyView';

const tools = [
  ['analiz', 'Dosya Analizi'],
  ['durusma', 'Canlı Duruşma'],
  ['karsi-taraf', 'Karşı Taraf Analizi'],
  ['yonetmen', 'Yönetilen Duruşma'],
] as const;

export function CaseAiTools({ file, tool, children }: { file: Case; tool: string | null; children: ReactNode }) {
  const base = caseDetailHref(file.id, 'ai');
  const selected = tools.find(([key]) => key === tool)?.[0] ?? 'analiz';
  const linkStyle = 'rounded-xl border border-surface-border bg-white px-3 py-2 text-sm font-medium text-navy-700 hover:border-accent-300 aria-[current=page]:border-accent-600 aria-[current=page]:bg-accent-50';
  return <div className="space-y-4">
    <nav aria-label="Dava için AI araçları" className="flex flex-wrap gap-2">
      {tools.map(([key,label]) => <Link key={key} href={key === 'analiz' ? base : base + '&arac=' + key}
        scroll={false} aria-current={selected === key ? 'page' : undefined} className={linkStyle}>{label}</Link>)}
      <Link className={linkStyle} href={caseDetailHref(file.id,'olasilik')}>Olasılık Ağacı</Link>
      <Link className={linkStyle} href={AI_ROUTES.map + '?dava=' + encodeURIComponent(file.id)}>Bilgi Haritası</Link>
      <Link className={linkStyle} href={AI_ROUTES.sufle}>Sufle</Link>
      <Link className={linkStyle} href={AI_ROUTES.chat}>Hukuk Asistanı</Link>
    </nav>
    {selected === 'yonetmen' ? <DirectedTrialView fixedCaseId={file.id} /> :
      selected === 'karsi-taraf' ? <CounterAnalysisView fixedCaseId={file.id} /> :
      selected === 'durusma' ? <CourtroomLobbyView fixedCase={file} /> : children}
  </div>;
}
