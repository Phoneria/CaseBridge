"use client";

import { useEffect, useRef, useState } from "react";

import { assignCaseLawyer, listAdminLawyers, updateCase } from "@/lib/api";
import { buildBasicInfoPayload, formFromCase, hasBasicInfoErrors, validateBasicInfo, type CaseFormState } from "@/lib/caseIntake";
import { userMessage } from "@/lib/userMessages";
import type { AppUser, Case } from "@/types";
import { BasicInfoFields } from "@/components/case-form/BasicInfoFields";
import { ModalFrame } from "@/components/ModalFrame";

interface Props {
  caseDetail: Case;
  /** Admins also choose the responsible lawyer here. */
  isAdmin: boolean;
  onClose: () => void;
  /** Everything saved: the parent closes the dialog. */
  onSaved: (updated: Case) => void;
  /** The details were saved but the dialog stays open (the lawyer could not be changed). */
  onUpdated: (updated: Case) => void;
}

/** "Bilgileri düzenle": the basic-info fields of the new-case form, saved with PATCH. A closed case has no status field. */
export function CaseEditModal({ caseDetail, isAdmin, onClose, onSaved, onUpdated }: Props) {
  const [form, setForm] = useState<CaseFormState>(() => formFromCase(caseDetail));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const errors = validateBasicInfo(form);
  const closed = caseDetail.status === "kapali";
  const currentLawyerId = caseDetail.assigned_lawyer_id ?? "";
  const [lawyerId, setLawyerId] = useState(currentLawyerId);
  const [lawyers, setLawyers] = useState<AppUser[] | null>(null);
  const [lawyersFailed, setLawyersFailed] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    listAdminLawyers()
      .then((rows) => active && setLawyers(rows))
      .catch(() => active && setLawyersFailed(true));
    return () => {
      active = false;
    };
  }, [isAdmin]);

  // Decided only once the list has settled, so "(pasif)" does not flash while loading.
  const listSettled = lawyers !== null || lawyersFailed;
  const currentMissing = currentLawyerId !== "" && listSettled && !(lawyers ?? []).some((lawyer) => lawyer.id === currentLawyerId);
  const currentLabel = `${caseDetail.assigned_lawyer_name ?? "Mevcut avukat"}${lawyers !== null ? " (pasif)" : ""}`;

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
      if (isAdmin && lawyerId !== "" && lawyerId !== currentLawyerId) {
        try {
          onSaved(await assignCaseLawyer(caseDetail.id, lawyerId));
        } catch {
          onUpdated(updated);
          setError("Bilgiler kaydedildi ancak sorumlu avukat değiştirilemedi.");
        }
        return;
      }
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
        {isAdmin && (
          <div>
            <label htmlFor="case_owner" className="mb-1 block text-xs font-medium text-navy-600">Sorumlu avukat</label>
            <select id="case_owner" value={lawyerId} onChange={(e) => setLawyerId(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm outline-none focus:border-accent-400">
              {currentLawyerId === "" && <option value="">Avukat seçin</option>}
              {currentMissing && <option value={currentLawyerId}>{currentLabel}</option>}
              {(lawyers ?? []).map((lawyer) => (
                <option key={lawyer.id} value={lawyer.id}>{lawyer.full_name}</option>
              ))}
            </select>
            {lawyersFailed && <p className="mt-1 text-xs text-red-700">Avukat listesi yüklenemedi.</p>}
          </div>
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
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

const NO_AI: ReadonlySet<string> = new Set();
