"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ModalFrame } from '@/components/ModalFrame';
import { contextTopic, guideTopics, type GuideTopic } from '@/lib/workspaceGuide';
import type { AppUser } from '@/types';

const control = 'min-h-11 rounded-xl border border-surface-border bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-40';

function GuideReader({ topics, initial, onClose }: { topics: GuideTopic[]; initial: GuideTopic; onClose: () => void }) {
  const [topicId, setTopicId] = useState(initial.id);
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const selected = topics.find(t => t.id === topicId) ?? initial;
  const current = selected.steps[step];
  const selectId = useId();
  function move(next: number) { setStep(next); heading.current?.focus(); }
  return <ModalFrame title="CaseBridge Rehber" onClose={onClose} wide>
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-6 text-navy-600">Adım adım öğrenin. Bu rehber kayıt oluşturmaz, işlem başlatmaz veya sayfanızı değiştirmez.</p>
        <button type="button" onClick={onClose} className={control}>Çıkış</button>
      </div>
      <div><label htmlFor={selectId} className="text-sm font-medium text-navy-800">Konu seçin</label>
        <select id={selectId} value={selected.id} onChange={e => {setTopicId(e.target.value); setStep(0);}}
          className="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-surface-border bg-white p-3 text-sm text-navy-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
          {topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </div>
      <section aria-label="Rehber adımı" className="rounded-2xl border border-accent-200 bg-accent-50 p-4 sm:p-5">
        <p role="status" aria-live="polite" aria-atomic="true" className="text-xs font-semibold text-accent-800">{selected.title} · Adım {step + 1} / {selected.steps.length}</p>
        <progress aria-label="Konu ilerlemesi" value={step + 1} max={selected.steps.length} className="mt-3 h-1.5 w-full accent-accent-600" />
        <h3 ref={heading} tabIndex={-1} className="mt-4 text-xl font-semibold text-navy-900 outline-none">{current.title}</h3>
        <p className="mt-3 text-sm leading-7 text-navy-700">{current.body}</p>
        <div className="mt-4 rounded-xl border border-surface-border bg-white p-4 text-sm leading-6 text-navy-700"><span className="font-semibold">Kontrol noktası: </span>{current.check}</div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={control} disabled={step === 0} onClick={() => move(0)}>Baştan başla</button>
        <div className="flex gap-2">
          <button type="button" className={control} disabled={step === 0} onClick={() => move(step - 1)}>Önceki</button>
          {step < selected.steps.length - 1 ? <button type="button" className={control} onClick={() => move(step + 1)}>Sonraki</button> : <button type="button" className={control} onClick={onClose}>Rehberi bitir</button>}
        </div>
      </div>
      <p className="text-xs leading-5 text-navy-500">İstediğiniz zaman konu değiştirebilir veya Escape ile çıkabilirsiniz. Gerçek işlemleri rehberden çıktıktan sonra ilgili ekranda yapın.</p>
    </div>
  </ModalFrame>;
}

export function WorkspaceGuide({ user }: { user: AppUser | null }) {
  const pathname = usePathname() ?? '';
  const params = useSearchParams();
  const tab = params.get('tab');
  const [open, setOpen] = useState(false);
  const scope = `${user?.id}:${user?.role}:${user?.workspace_position}:${user?.is_platform_admin}`;
  useEffect(() => setOpen(false), [pathname, tab, scope]);
  if (!user) return null;
  const topics = guideTopics(user);
  return <>
    <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className={control}>Rehber</button>
    {open && <GuideReader topics={topics} initial={contextTopic(topics, pathname, tab)} onClose={() => setOpen(false)} />}
  </>;
}
