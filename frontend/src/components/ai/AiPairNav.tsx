'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { AI_PAIRS } from '@/lib/aiNavigation';
import { buildHref } from '@/lib/filters';

export function AiPairNav({ group, caseId }: { group: keyof typeof AI_PAIRS; caseId?: string | null }) {
  const pathname = usePathname();
  const params = useSearchParams();
  return <nav aria-label={group === 'hearing' ? 'Duruşma araçları' : 'Dava haritaları'} className="mb-4 flex flex-wrap gap-2">
    {AI_PAIRS[group].map(({ label, href }) => <Link key={href}
      href={buildHref(href, { dava: caseId === undefined ? params.get('dava') : caseId, ornek: group === 'maps' ? params.get('ornek') : null })}
      aria-current={pathname === href ? 'page' : undefined}
      className="rounded-xl border border-surface-border bg-white px-4 py-2 text-sm font-medium text-navy-700 aria-[current=page]:border-accent-600 aria-[current=page]:bg-accent-50">
      {label}
    </Link>)}
  </nav>;
}
