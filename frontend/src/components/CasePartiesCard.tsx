"use client";

import { useState } from "react";

import { PartiesFields } from "@/components/case-form/PartiesFields";
import { updateCase } from "@/lib/api";
import { ApiError } from "@/lib/apiError";
import {
  NO_CLIENT_MESSAGE,
  addedPartyRole,
  PARTY_ROLE_LABELS,
  buildPartiesPayload,
  formFromCase,
  newPartyRow,
  validateParties,
  type PartyRow,
} from "@/lib/caseIntake";
import type { Case } from "@/types";

interface Props {
  caseDetail: Case;
  onSaved: (updated: Case) => void;
}

const NO_AI: ReadonlySet<string> = new Set();

/** "Taraflar" card of the case detail: read-only list with an inline editor. */
export function CasePartiesCard({ caseDetail, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<PartyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [counselErrors, setCounselErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const parties = [...(caseDetail.parties ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  function startEditing() {
    setRows(formFromCase(caseDetail).parties);
    setError(null);
    setRowErrors({});
    setCounselErrors({});
    setEditing(true);
  }

  async function save() {
    if (saving) return;
    const { partyNames: nameErrors, partyCounsel } = validateParties(rows);
    const hasClient = rows.some((row) => row.is_client && row.name.trim());
    setRowErrors(nameErrors);
    setCounselErrors(partyCounsel);
    setError(hasClient ? null : NO_CLIENT_MESSAGE);
    if (!hasClient || Object.keys(nameErrors).length || Object.keys(partyCounsel).length) return;

    setSaving(true);
    try {
      const updated = await updateCase(caseDetail.id, { parties: buildPartiesPayload(rows) });
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : "Taraflar kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-navy-800">Taraflar</h2>
        {!editing && (
          <button
            type="button"
            aria-label="Tarafları düzenle"
            onClick={startEditing}
            className="text-xs font-semibold text-accent-700 hover:underline"
          >
            Düzenle
          </button>
        )}
      </header>

      {editing ? (
        <div className="space-y-4">
          <PartiesFields
            parties={rows}
            ai={NO_AI}
            error={undefined}
            partyErrors={rowErrors}
            counselErrors={counselErrors}
            showClientHint={false}
            onUpdate={(key, patch) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))}
            onAdd={() => setRows((current) => [...current, newPartyRow(addedPartyRole(current))])}
            onRemove={(key) => setRows((current) => current.filter((row) => row.key !== key))}
          />
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
      ) : parties.length === 0 ? (
        <p className="text-sm text-navy-500">Kayıtlı taraf yok.</p>
      ) : (
        <ul className="divide-y divide-surface-border">
          {parties.map((party) => (
            <li key={party.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="text-sm font-medium text-navy-800">{party.name}</span>
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-navy-600">
                {PARTY_ROLE_LABELS[party.role]}
              </span>
              {party.counsel_name && <span className="text-xs text-navy-500">Vekili: {party.counsel_name}</span>}
              {party.is_client && (
                <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700 ring-1 ring-accent-200">
                  Müvekkilimiz
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
