"use client";

import { useRef, useState } from "react";

import { updateCase } from "@/lib/api";
import { buildBasicInfoPayload, formFromCase, hasBasicInfoErrors, validateBasicInfo, type CaseFormState } from "@/lib/caseIntake";
import { userMessage } from "@/lib/userMessages";
import type { Case } from "@/types";
import { BasicInfoFields } from "@/components/case-form/BasicInfoFields";
import { ModalFrame } from "@/components/ModalFrame";

interface Props {
  caseDetail: Case;
  onClose: () => void;
  onSaved: (updated: Case) => void;
}

/** "Bilgileri düzenle": the basic-info fields of the new-case form, saved with PATCH. A closed case has no status field. */
export function CaseEditModal({ caseDetail, onClose, onSaved }: Props) {
  const [form, setForm] = useState<CaseFormState>(() => formFromCase(caseDetail));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const errors = validateBasicInfo(form);
  const closed = caseDetail.status === "kapali";

  function setField<K extends keyof CaseFormState>(field: K, value: CaseFormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function save() {
    if (inFlight.current) return;
    if (hasBasicInfoErrors(errors)) {
      setShowErrors(true);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateCase(caseDetail.id, buildBasicInfoPayload(form, { includeStatus: !closed }));
      onSaved(updated);
    } catch (err) {
      setError(userMessage(err, "Dava bilgileri kaydedilemedi. Lütfen tekrar deneyin."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <ModalFrame title="Bilgileri düzenle" onClose={onClose} busy={saving} wide>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="space-y-4"
      >
        <BasicInfoFields
          form={form}
          ai={NO_AI}
          errors={showErrors ? errors : {}}
          setField={setField}
          caseNumberReadOnly
          statuses={closed ? null : undefined}
          focusName
        />
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
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

const NO_AI: ReadonlySet<string> = new Set();
