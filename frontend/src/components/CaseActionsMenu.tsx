"use client";

import { useEffect, useRef, useState } from "react";

import { CASE_ACTION_LABELS, type CaseAction } from "@/lib/caseAccess";

/** The "İşlemler" menu of the case page; renders nothing when the user has no action. */
export function CaseActionsMenu({ actions, busy, onPick }: { actions: CaseAction[]; busy: boolean; onPick: (action: CaseAction) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg border border-surface-border bg-white px-3 py-1.5 text-sm font-medium text-navy-700 hover:bg-surface-muted"
      >
        İşlemler
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-surface-border bg-white py-1 shadow-card">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              role="menuitem"
              aria-disabled={busy}
              onClick={() => {
                if (busy) return;
                setOpen(false);
                triggerRef.current?.focus();
                onPick(action);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-navy-700 hover:bg-surface-muted aria-disabled:opacity-60"
            >
              {CASE_ACTION_LABELS[action]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
