import type { ReactNode } from "react";

/** White card with a violet→navy gradient frame; used for AI-produced or AI-starting content only. */
export function AiCard({
  children,
  disclaimer,
  className = "",
  id,
}: {
  children: ReactNode;
  disclaimer?: string;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={`rounded-2xl bg-ai-border p-px shadow-card ${className}`}>
      <div className="flex h-full flex-col rounded-[calc(1.25rem-1px)] bg-white p-5">
        {children}
        {disclaimer && <p className="mt-4 border-t border-surface-border pt-3 text-[11px] text-navy-500">{disclaimer}</p>}
      </div>
    </div>
  );
}
