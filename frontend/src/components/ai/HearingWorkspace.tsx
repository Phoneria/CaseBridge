'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CounterAnalysisView } from '@/components/lab/CounterAnalysisView';
import { AiPairNav } from './AiPairNav';
import { CourtroomLobbyView } from './CourtroomLobbyView';

export function HearingWorkspace({ mode }: { mode: 'hearing' | 'counter' }) {
  const initialCaseId = useSearchParams().get('dava');
  const [caseId, setCaseId] = useState(initialCaseId);
  return <>
    <AiPairNav group="hearing" caseId={caseId} />
    {mode === 'hearing'
      ? <CourtroomLobbyView initialCaseId={initialCaseId} onCaseChange={setCaseId} />
      : <CounterAnalysisView initialCaseId={initialCaseId} onCaseChange={setCaseId} />}
  </>;
}
