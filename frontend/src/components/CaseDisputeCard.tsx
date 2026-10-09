"use client";

import { useState } from "react";

import { CourtFileNumberField, DisputeFields } from "@/components/case-form/DisputeFields";
import type { SetField } from "@/components/case-form/BasicInfoFields";
import { updateCase } from "@/lib/api";
import { ApiError } from "@/lib/apiError";
import { buildDisputePayload, formFromCase, positionLabels, type CaseFormState } from "@/lib/caseIntake";
import type { Case } from "@/types";

interface Props {
  caseDetail: Case;
  onSaved: (updated: Case) => void;
}

const NO_AI: ReadonlySet<string> = new Set();

function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">{label}</p>
      <p className="mt-1 whitespace-pre-line text-sm leading-6 text-navy-800">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

/** "Uyuşmazlık" card of the case detail: file number, claim, facts, both sides' positions and general notes. */
export function CaseDisputeCard({ caseDetail, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CaseFormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const labels = positionLabels(caseDetail.client_role);

  const setField: SetField = (field, value) => setForm((current) => (current ? { ...current, [field]: value } : current));

  function startEditing() {
    setForm(formFromCase(caseDetail));
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (!form || saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateCase(caseDetail.id, buildDisputePayload(form));
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : "Uyuşmazlık bilgileri kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-navy-800">Uyuşmazlık</h2>
        {!editing && (
          <button
            type="button"
            aria-label="Uyuşmazlığı düzenle"
            onClick={startEditing}
            className="text-xs font-semibold text-accent-700 hover:underline"
          >
            Düzenle
          </button>
        )}
      </header>

      {editing && form ? (
        <div className="space-y-4">
          <CourtFileNumberField value={form.court_file_number} ai={false} onChange={(value) => setField("court_file_number", value)} />
          <DisputeFields form={form} clientRole={caseDetail.client_role} ai={NO_AI} setField={setField} />
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              aria-disabled={saving}
              onClick={save}
              className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 aria-disabled:opacity-50"
            >
              Kaydet
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted"
            >
              Vazgeç
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <ReadOnlyField label="Esas no" value={caseDetail.court_file_number} />
          <ReadOnlyField label="Talep / dava konusu" value={caseDetail.claim} />
          <ReadOnlyField label="Olay özeti" value={caseDetail.facts_summary} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ReadOnlyField label={labels.plaintiff} value={caseDetail.plaintiff_position} />
            <ReadOnlyField label={labels.defendant} value={caseDetail.defendant_position} />
          </div>
          <ReadOnlyField label="Genel notlar" value={caseDetail.description} />
        </div>
      )}
    </section>
  );
}
