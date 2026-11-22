'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AiMark } from '@/components/ai/AiMark';
import { AiStatusIndicator } from '@/components/AiStatusIndicator';
import { AI_NAVIGATION, aiLinkActive } from '@/lib/aiNavigation';
import type { AppUser } from '@/types';

/** AI entry points stay in the header at every width; session guards are unchanged. */
export function AiNavigation({ user }: { user: AppUser | null }) {
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); trigger.current?.focus(); };
  }, [open]);
  if (!user || user.is_platform_admin || user.workspace_position) return null;
  return <>
    <button ref={trigger} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-controls="header-ai-dialog"
      className="inline-flex items-center gap-2 rounded-xl border border-accent-200 bg-accent-50 px-3 py-2 text-sm font-semibold text-accent-800">
      <AiMark className="h-4 w-4" />CaseBridge AI<span aria-hidden="true">⌄</span>
    </button>
    <dialog ref={dialog} id="header-ai-dialog" aria-labelledby="header-ai-title"
      onCancel={() => setOpen(false)} onClose={() => setOpen(false)}
      onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}
      className="fixed inset-x-auto bottom-auto right-4 top-20 m-0 max-h-[calc(100dvh-6rem)] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-surface-border bg-white p-5 text-navy-900 shadow-xl backdrop:bg-navy-950/40">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id="header-ai-title" className="flex items-center gap-2 font-semibold"><AiMark className="h-5 w-5 text-accent-600" />Yapay zekâ araçları</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label="Yapay zekâ menüsünü kapat" className="rounded-lg border border-surface-border px-3 py-1.5 text-sm">Kapat</button>
      </div>
      <nav aria-label="Yapay zekâ araçları" className="grid gap-2 sm:grid-cols-2">
        {AI_NAVIGATION.map(item => <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
          aria-current={aiLinkActive(pathname, item.href) ? 'page' : undefined}
          className={'rounded-xl border px-3 py-3 text-sm focus-visible:ring-2 focus-visible:ring-accent-400 ' + (aiLinkActive(pathname, item.href) ? 'border-accent-300 bg-accent-50 font-semibold text-accent-800' : 'border-surface-border text-navy-700 hover:bg-surface-muted')}>
          {item.label}<span aria-hidden="true" className="float-right">↗</span>
        </Link>)}
      </nav>
      <div className="mt-4 border-t border-surface-border pt-3"><AiStatusIndicator /></div>
    </dialog>
  </>;
}
