"use client";

import { useState } from "react";

import { deleteCalendarEvent } from "@/lib/api";
import { hearingWhen, splitHearings } from "@/lib/hearings";
import type { Case, CaseHearing } from "@/types";
import { CaseConfirmModal } from "@/components/CaseConfirmModal";
import { CaseHearingFormModal } from "@/components/CaseHearingFormModal";
import { CaseHearingResultModal } from "@/components/CaseHearingResultModal";

type Dialog = { kind: "add" } | { kind: "edit" | "result" | "delete"; hearing: CaseHearing } | null;

interface Props {
  caseDetail: Pick<Case, "id" | "assigned_lawyer_id" | "status">;
  hearings: CaseHearing[];
  /** An archived case is read-only. */
  readOnly: boolean;
  /** Reload the hearings and the case after any change. */
  onChanged: () => void;
}

const SMALL_BUTTON = "text-xs font-semibold text-accent-700 hover:underline";

/** "Duruşmalar": upcoming and past hearings of the case with add / edit / delete / result actions. */
export function CaseHearingsCard({ caseDetail, hearings, readOnly, onChanged }: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const closed = caseDetail.status === "kapali";
  const { upcoming, past } = splitHearings(hearings);

  function saved() {
    setDialog(null);
    onChanged();
  }

  function row(hearing: CaseHearing) {
    return (
      <li key={hearing.id} className="space-y-1 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-navy-800">{hearingWhen(hearing)}</p>
          {!readOnly && (
            <div className="flex gap-3">
              {hearing.result_open && (
                <button type="button" onClick={() => setDialog({ kind: "result", hearing })} className={SMALL_BUTTON}>
                  {hearing.result_note ? "Sonucu düzenle" : "Sonuç gir"}
                </button>
              )}
              <button type="button" onClick={() => setDialog({ kind: "edit", hearing })} className={SMALL_BUTTON}>Düzenle</button>
              <button type="button" onClick={() => setDialog({ kind: "delete", hearing })} className={SMALL_BUTTON}>Sil</button>
            </div>
          )}
        </div>
        {hearing.location && <p className="text-xs text-navy-600">{hearing.location}</p>}
        {hearing.notes && <p className="whitespace-pre-wrap text-xs text-navy-500">{hearing.notes}</p>}
        {hearing.is_past && (
          <p className="whitespace-pre-wrap text-xs text-navy-700">
            {hearing.result_note ? `Sonuç: ${hearing.result_note}` : "Sonuç girilmedi"}
          </p>
        )}
      </li>
    );
  }

  return (
    <section id="durusmalar" aria-labelledby="durusmalar-baslik" className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
      <header className="flex items-center justify-between border-b border-surface-border bg-gradient-to-r from-white to-accent-50/60 px-4 py-3">
        <h2 id="durusmalar-baslik" className="text-sm font-semibold text-navy-800">Duruşmalar</h2>
        {!readOnly && !closed && (
          <button type="button" onClick={() => setDialog({ kind: "add" })} className="text-xs font-semibold text-accent-700 hover:underline">
            Duruşma ekle
          </button>
        )}
      </header>
      {hearings.length === 0 ? (
        <p className="p-4 text-sm text-navy-500">Henüz duruşma yok.</p>
      ) : (
        <div className="divide-y divide-surface-border">
          {upcoming.length > 0 && (
            <div>
              <h3 className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-wide text-navy-400">Yaklaşan</h3>
              <ul className="divide-y divide-surface-border">{upcoming.map(row)}</ul>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h3 className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-wide text-navy-400">Geçmiş</h3>
              <ul className="divide-y divide-surface-border">{past.map(row)}</ul>
            </div>
          )}
        </div>
      )}

      {dialog?.kind === "add" && <CaseHearingFormModal caseDetail={caseDetail} onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.kind === "edit" && (
        <CaseHearingFormModal caseDetail={caseDetail} hearing={dialog.hearing} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.kind === "result" && (
        <CaseHearingResultModal hearing={dialog.hearing} canAddNext={!closed} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.kind === "delete" && (
        <CaseConfirmModal
          title="Duruşma silinsin mi?"
          message={`${hearingWhen(dialog.hearing)} tarihli duruşma silinecek.`}
          confirmLabel="Sil"
          fallbackError="Duruşma silinemedi. Lütfen tekrar deneyin."
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await deleteCalendarEvent(dialog.hearing.id);
            saved();
          }}
        />
      )}
    </section>
  );
}
