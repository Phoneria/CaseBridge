"use client";

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { guideTours } from '@/lib/guideTours';
import { guideTopics, type GuideTopic } from '@/lib/workspaceGuide';
import type { AppUser } from '@/types';

function TourSteps({ topic }: { topic: GuideTopic }) {
  const steps = guideTours[topic.id]!;
  const [index, setIndex] = useState(0);
  const [found, setFound] = useState(false);
  const step = steps[index];
  useEffect(() => {
    const main = document.getElementById('main-content');
    if (!main) return;
    const content = main;
    let target: HTMLElement | null = null;
    let frame = 0;
    function reveal() {
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const viewport = content.getBoundingClientRect();
      if (rect.top < viewport.top || rect.bottom > viewport.bottom ||
          rect.left < viewport.left || rect.right > viewport.right) {
        target.scrollIntoView?.({ block: 'center', inline: 'center' });
      }
    }
    function highlight() {
      const next = content.querySelector<HTMLElement>(step.selector);
      setFound(!!next);
      if (target !== next) {
        target?.removeAttribute('data-guide-current');
        target = next;
        target?.setAttribute('data-guide-current', '');
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(reveal);
    }
    highlight();
    const observer = new MutationObserver(highlight);
    observer.observe(content, { childList: true, subtree: true });
    // Charts and asynchronously loaded sections can move an existing control.
    const resize = new ResizeObserver(highlight);
    resize.observe(content);
    if (content.firstElementChild) resize.observe(content.firstElementChild);
    return () => {
      observer.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
      target?.removeAttribute('data-guide-current');
    };
  }, [step]);
  const back = '/rehber?konu=' + topic.id;
  const button = 'min-h-10 rounded-lg border border-accent-300 bg-white px-3 py-1.5 text-sm font-semibold text-accent-800 disabled:opacity-50';
  return <section aria-label="Ekran turu" className="max-h-[40dvh] shrink-0 overflow-y-auto border-b border-accent-200 bg-accent-50 px-4 py-3 sm:px-6">
    <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
      <div aria-live="polite" aria-atomic="true" className="max-w-3xl">
        <p className="text-sm font-bold text-accent-800">Adım {index + 1} / {steps.length} · {step.title}</p>
        <p className="mt-1 text-sm text-navy-700">{step.instruction}</p>
        {!found && <p className="text-xs text-navy-600">Bu kontrol şu anda görünmüyor. Diğer adıma geçebilirsiniz.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={button} disabled={index === 0} onClick={() => setIndex(index - 1)}>Önceki</button>
        {index < steps.length - 1 && <button className={button} onClick={() => setIndex(index + 1)}>Sonraki</button>}
        <Link href={back} className={button}>{index === steps.length - 1 ? 'Turu bitir' : 'Rehbere dön'}</Link>
      </div>
    </div>
  </section>;
}

export function GuideTour({ user }: { user: AppUser | null }) {
  const id = useSearchParams().get('tur');
  const path = usePathname();
  if (!id || !user) return null;
  const topic = guideTopics(user).find(item => item.id === id && item.route === path);
  return topic && guideTours[topic.id] ? <TourSteps key={topic.id} topic={topic} /> : null;
}
