"use client";

import { useRef, useState } from "react";

import { userMessage } from "@/lib/userMessages";
import { ModalFrame } from "@/components/ModalFrame";

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  /** Shown when the failure carries no server message. */
  fallbackError: string;
  /** Resolve to finish (the caller closes the dialog); reject to keep it open with the error. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** Yes/no dialog for the reopen and archive actions. */
export function CaseConfirmModal({ title, message, confirmLabel, fallbackError, onConfirm, onClose }: Props) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(userMessage(err, fallbackError));
    } finally {
      inFlight.current = false;
      setRunning(false);
    }
  }

  return (
    <ModalFrame title={title} onClose={onClose} busy={running}>
      <p className="text-sm text-navy-600">{message}</p>
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          aria-disabled={running}
          onClick={() => {
            if (!running) onClose();
          }}
          className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted"
        >
          Vazgeç
        </button>
        <button
          type="button"
          aria-disabled={running}
          onClick={() => void confirm()}
          className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700"
        >
          {running ? "Lütfen bekleyin..." : confirmLabel}
        </button>
      </div>
    </ModalFrame>
  );
}
