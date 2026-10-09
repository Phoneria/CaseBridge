"use client";

import { useState } from "react";

import { INPUT_CLASS } from "@/components/case-form/Field";
import { extractCaseIntake } from "@/lib/api";
import { DOCUMENT_EXTENSIONS, checkDocumentFile, pastedTextFile } from "@/lib/caseIntake";
import type { CaseIntakeResult } from "@/types";

/** The document a draft was read from; pasted text becomes a .txt file so it can be attached to the case. */
export interface IntakeSource {
  label: string;
  file: File;
}

interface Props {
  /** True when the form already holds typed values the draft would replace. */
  hasContent: boolean;
  onDraft: (result: CaseIntakeResult, source: IntakeSource) => void;
}

type Mode = "dosya" | "metin";

const PASTED_LABEL = "Yapıştırılan metin";
const FALLBACK_ERROR = "Belge okunamadı. Lütfen tekrar deneyin veya alanları elle doldurun.";

/** "Belgeden doldur": reads a document or pasted text and proposes the form values. Saves nothing. */
export function IntakeFillBox({ hasContent, onDraft }: Props) {
  const [mode, setMode] = useState<Mode>("dosya");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ truncated: boolean } | null>(null);
  const [pending, setPending] = useState<{ result: CaseIntakeResult; source: IntakeSource } | null>(null);

  const ready = mode === "dosya" ? file !== null : text.trim().length > 0;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  function accept(result: CaseIntakeResult, source: IntakeSource) {
    onDraft(result, source);
    setPending(null);
    setNotice({ truncated: result.truncated });
  }

  async function fill() {
    setError(null);
    setNotice(null);
    setPending(null);
    setBusy(true);
    try {
      const source: IntakeSource =
        mode === "dosya" && file ? { label: file.name, file } : { label: PASTED_LABEL, file: pastedTextFile(text) };
      const result = await extractCaseIntake(mode === "dosya" && file ? { file } : { text });
      if (hasContent) setPending({ result, source });
      else accept(result, source);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : FALLBACK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="belgeden-doldur-baslik" className="space-y-3 rounded-2xl border border-accent-200 bg-accent-50/40 p-5">
      <div>
        <h2 id="belgeden-doldur-baslik" className="text-base font-semibold text-navy-900">
          Belgeden doldur
        </h2>
        <p className="text-sm text-navy-500">Bir dilekçe veya karar yükleyin ya da metnini yapıştırın; alanlar taslak olarak doldurulur.</p>
      </div>

      <div role="tablist" aria-label="Belge girişi" className="flex gap-2">
        {(
          [
            ["dosya", "Dosya yükle"],
            ["metin", "Metni yapıştır"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => switchMode(id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${mode === id ? "bg-white text-accent-700 shadow-card" : "text-navy-600 hover:bg-white/60"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "dosya" ? (
        <div>
          <input
            type="file"
            accept={DOCUMENT_EXTENSIONS.join(",")}
            aria-label="Doldurulacak belge"
            className="text-sm"
            onChange={(e) => {
              const chosen = e.target.files?.[0] ?? null;
              const problem = chosen ? checkDocumentFile(chosen) : null;
              setError(problem);
              setFile(problem ? null : chosen);
            }}
          />
          <p className="mt-1 text-xs text-navy-500">pdf, docx veya txt · en fazla 10 MB</p>
        </div>
      ) : (
        <textarea
          aria-label="Belge metni"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={INPUT_CLASS}
        />
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!ready || busy}
          onClick={fill}
          className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
        >
          {busy ? "Belge okunuyor…" : "Doldur"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {pending && (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-navy-800">
          <p>Formdaki mevcut bilgiler AI taslağıyla değiştirilsin mi?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => accept(pending.result, pending.source)}
              className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700"
            >
              Değiştir
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-white"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className="space-y-1 text-sm text-navy-700">
          <p>AI taslağıdır; kaydetmeden önce kontrol edin.</p>
          {notice.truncated && <p>Belge uzun olduğu için yalnızca ilk kısmı okundu.</p>}
        </div>
      )}
    </section>
  );
}
