"use client";

import { AiBadge } from "@/components/ai/AiBadge";
import { INPUT_CLASS } from "@/components/case-form/Field";
import { PARTY_ROLES, PARTY_ROLE_LABELS, type PartyRow } from "@/lib/caseIntake";
import type { PartyRole } from "@/types";

interface Props {
  parties: PartyRow[];
  ai: ReadonlySet<string>;
  /** The list-level error (no client marked). */
  error?: string;
  /** Row errors by row key. */
  partyErrors: Record<string, string>;
  /** "Müvekkilinizi işaretleyin." after the AI brought parties but no client is marked. */
  showClientHint: boolean;
  onUpdate: (key: string, patch: Partial<Omit<PartyRow, "key">>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}

/** "Taraflar" fields: a row per party with name, role, counsel and the client checkbox. */
export function PartiesFields({ parties, ai, error, partyErrors, showClientHint, onUpdate, onAdd, onRemove }: Props) {
  return (
    <div className="space-y-3">
      {showClientHint && <p className="text-sm text-accent-700">Müvekkilinizi işaretleyin.</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {parties.map((party, index) => {
        const number = index + 1;
        const nameError = partyErrors[party.key];
        return (
          <div
            key={party.key}
            role="group"
            aria-label={`Taraf ${number}`}
            className="grid grid-cols-1 gap-3 rounded-xl border border-surface-border p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto]"
          >
            <div>
              <div className="mb-1 flex items-center gap-2">
                <label htmlFor={`party-name-${party.key}`} className="text-xs font-medium text-navy-600">
                  Ad
                  <span aria-hidden="true" className="text-red-500">
                    {" "}
                    *
                  </span>
                </label>
                {ai.has(`party:${party.key}`) && <AiBadge />}
              </div>
              <input
                id={`party-name-${party.key}`}
                className={INPUT_CLASS}
                value={party.name}
                aria-invalid={Boolean(nameError)}
                aria-required="true"
                aria-describedby={nameError ? `party-name-${party.key}-hata` : undefined}
                onChange={(e) => onUpdate(party.key, { name: e.target.value })}
              />
              {nameError && (
                <p id={`party-name-${party.key}-hata`} className="mt-1 text-xs text-red-600">
                  {nameError}
                </p>
              )}
            </div>
            <div>
              <label htmlFor={`party-role-${party.key}`} className="mb-1 block text-xs font-medium text-navy-600">
                Rol
              </label>
              <select
                id={`party-role-${party.key}`}
                className={INPUT_CLASS}
                value={party.role}
                onChange={(e) => onUpdate(party.key, { role: e.target.value as PartyRole })}
              >
                {PARTY_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {PARTY_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`party-counsel-${party.key}`} className="mb-1 block text-xs font-medium text-navy-600">
                Vekili
              </label>
              <input
                id={`party-counsel-${party.key}`}
                className={INPUT_CLASS}
                value={party.counsel_name}
                onChange={(e) => onUpdate(party.key, { counsel_name: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-3 pb-2">
              <label className="flex items-center gap-2 text-sm text-navy-700">
                <input
                  type="checkbox"
                  checked={party.is_client}
                  onChange={(e) => onUpdate(party.key, { is_client: e.target.checked })}
                  className="h-4 w-4 rounded border-surface-border text-accent-600"
                />
                Müvekkilimiz
              </label>
              <button
                type="button"
                aria-label={`Taraf ${number} satırını kaldır`}
                disabled={parties.length <= 1}
                onClick={() => onRemove(party.key)}
                className="rounded-lg border border-surface-border px-2 py-1 text-xs text-navy-600 hover:border-red-300 hover:text-red-600 disabled:opacity-40"
              >
                Kaldır
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        className="rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted"
      >
        Taraf ekle
      </button>
    </div>
  );
}
