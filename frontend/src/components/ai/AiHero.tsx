import type { ReactNode } from "react";

import { AiMark } from "@/components/ai/AiMark";
import { AiBrand } from "@/components/ai/AiBrand";

export interface AiHeroStat {
  label: string;
  value: string | number;
}

export function AiHero({
  eyebrow,
  title,
  description,
  actions,
  stats,
  compact = false,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  stats?: AiHeroStat[];
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className={`relative overflow-hidden rounded-3xl bg-navy-950 text-white ${compact ? "px-6 py-6" : "px-6 py-8 sm:px-8 sm:py-10"}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 animate-ai-glow bg-ai-glow motion-reduce:animate-none" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-200">
            <AiMark className="h-3.5 w-3.5 text-accent-300" />
            {eyebrow ?? <AiBrand />}
          </p>
          <h1 className={`mt-2 font-semibold tracking-tight ${compact ? "text-2xl" : "text-3xl sm:text-4xl"}`}>{title}</h1>
          {description && <p className="mt-2 text-sm leading-6 text-accent-100">{description}</p>}
          {children}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {stats && stats.length > 0 && (
        <dl className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
              <dt className="text-[11px] uppercase tracking-wide text-accent-200">{stat.label}</dt>
              <dd className="mt-1 text-xl font-semibold">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
