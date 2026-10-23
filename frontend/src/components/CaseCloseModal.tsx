"use client";

import { useRef, useState } from "react";

import { closeCase, uploadDocument } from "@/lib/api";
import { checkDocumentFile } from "@/lib/caseIntake";
import {
  CLOSING_OUTCOME_OPTIONS,
  buildClosePayload,
  hasCloseErrors,
  todayLocalISO,
  validateClose,
  type CloseFormState,
} from "@/lib/closing";
import { userMessage } from "@/lib/userMessages";
import type { Case } from "@/types";
import { Field, INPUT_CLASS } from "@/components/case-form/Field";
import { ModalFrame } from "@/components/ModalFrame";

export interface CloseResult {
  updated: Case;
  /** The case is closed, but the decision document could not be added. */
  documentFailed: boolean;
}

interface Props {
  caseId: string;
  /** The case's opening date: the earliest decision date accepted (the server checks it too). */
  openingDate: string | null;
  pendingTaskCount: number;
  onClose: () => void;
  onClosed: (result: CloseResult) => void;
}

/** "Davayı kapat": outcome, decision date, note and an optional decision document. */
export function CaseCloseModal({ caseId, openingDate, pendingTaskCount, onClose, onClosed }: Props) {
  const today = todayLocalISO();
  const [form, setForm] = useState<CloseFormState>({ outcome: "", decision_date: today, note: "" });
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const errors = validateClose(form, today, openingDate);

  function pickFile(picked: File | undefined) {
    if (!picked) {
      setFile(null);
      setFileError(null);
      return;
    }
    const problem = checkDocumentFile(picked);
    setFile(problem ? null : picked);
    setFileError(problem);
  }

  async function submit() {
    if (inFlight.current) return;
    if (hasCloseErrors(errors)) {
      setShowErrors(true);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    let updated: Case;
    try {
      updated = await closeCase(caseId, buildClosePayload(form));
    } catch (err) {
      setError(userMessage(err, "Dava kapatılamadı. Lütfen tekrar deneyin."));
      inFlight.current = false;
      setSaving(false);
      return;
    }
    let documentFailed = false;
    if (file) {
      try {
        await uploadDocument(caseId, file);
      } catch {
        documentFailed = true;
      }
    }
    inFlight.current = false;
    setSaving(false);
    onClosed({ updated, documentFailed });
  }

  return (
    <ModalFrame title="Davayı kapat" onClose={onClose} busy={saving}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        <fieldset aria-describedby={showErrors && errors.outcome ? "kapanis-sonuc-hata" : undefined}>
          <legend className="mb-1 text-xs font-medium text-navy-600">Sonuç</legend>
          <div className="flex flex-wrap gap-4">
            {CLOSING_OUTCOME_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2 text-sm text-navy-700">
                <input
                  type="radio"
                  name="kapanis-sonuc"
                  value={option.value}
                  checked={form.outcome === option.value}
                  onChange={() => setForm((prev) => ({ ...prev, outcome: option.value }))}
                />
                {option.label}
              </label>
            ))}
          </div>
          {showErrors && errors.outcome && (
            <p id="kapanis-sonuc-hata" className="mt-1 text-xs text-red-600">
              {errors.outcome}
            </p>
          )}
        </fieldset>

        <Field id="decision_date" label="Karar tarihi" error={showErrors ? errors.decision_date : undefined}>
          {(a11y) => (
            <input
              {...a11y}
              type="date"
              min={openingDate ?? undefined}
              max={today}
              className={INPUT_CLASS}
              value={form.decision_date}
              onChange={(e) => setForm((prev) => ({ ...prev, decision_date: e.target.value }))}
            />
          )}
        </Field>

        <Field id="closing_note" label="Karar notu" error={showErrors ? errors.note : undefined}>
          {(a11y) => (
            <textarea
              {...a11y}
              rows={3}
              className={INPUT_CLASS}
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
            />
          )}
        </Field>

        <div>
          <label htmlFor="closing_document" className="mb-1 block text-xs font-medium text-navy-600">
            Karar belgesi ekle
          </label>
          <input
            id="closing_document"
            type="file"
            accept=".pdf,.docx,.txt"
            onChange={(e) => pickFile(e.target.files?.[0])}
            className="block w-full text-sm text-navy-700"
          />
          {fileError && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {fileError}
            </p>
          )}
        </div>

        {pendingTaskCount > 0 && (
          <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {`Bu davada ${pendingTaskCount} bekleyen görev var.`}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            aria-disabled={saving}
            onClick={() => {
              if (!saving) onClose();
            }}
            className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted"
          >
            Vazgeç
          </button>
          <button type="submit" aria-disabled={saving} className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700">
            {saving ? "Kapatılıyor..." : "Davayı kapat"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
