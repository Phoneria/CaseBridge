'use client';

export function PresentationEye({ active, onClick }: {active: boolean; onClick: () => void}) {
  const label = active ? 'Özgün görünüme dön' : 'Sunumda kimlikleri gizle';
  return <button type="button" onClick={onClick} aria-label={label} title={label} aria-pressed={active}
    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-surface-border bg-white p-2 text-navy-800 hover:border-accent-400 aria-pressed:bg-accent-50">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>
      {active && <path d="M3 3l18 18" strokeLinecap="round"/>}
    </svg>
  </button>;
}
