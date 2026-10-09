import type { ReactNode } from "react";

import { AiBadge } from "@/components/ai/AiBadge";

export const INPUT_CLASS =
  "w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400";

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  /** Show the "AI" badge: the value was proposed from a document and not edited since. */
  ai?: boolean;
  error?: string;
  className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-required"?: true; "aria-describedby"?: string }) => ReactNode;
}

/** Label (+ required marker + AI badge), the control and its error message. */
export function Field({ id, label, required, ai, error, className, children }: FieldProps) {
  const errorId = `${id}-hata`;
  return (
    <div className={className}>
      <div className="mb-1 flex items-center gap-2">
        <label htmlFor={id} className="text-xs font-medium text-navy-600">
          {label}
          {required && (
            <span aria-hidden="true" className="text-red-500">
              {" "}
              *
            </span>
          )}
        </label>
        {ai && <AiBadge />}
      </div>
      {children({ id, "aria-invalid": Boolean(error), "aria-required": required || undefined, "aria-describedby": error ? errorId : undefined })}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** A titled block of the new-case page; `id` is the anchor used by the section menu. */
export function FormSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={`bolum-${id}`}
      aria-labelledby={`bolum-${id}-baslik`}
      className="scroll-mt-24 space-y-4 rounded-2xl border border-surface-border bg-white p-5 shadow-card"
    >
      <h2 id={`bolum-${id}-baslik`} className="text-base font-semibold text-navy-900">
        {title}
      </h2>
      {children}
    </section>
  );
}
