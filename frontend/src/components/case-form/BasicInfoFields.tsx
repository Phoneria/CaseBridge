"use client";

import { CASE_TYPES, OPEN_CASE_STATUSES } from "@/lib/filters";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS } from "@/lib/labels";
import { FIELD_LIMITS, type CaseFormState } from "@/lib/caseIntake";
import type { CaseType, OpenCaseStatus } from "@/types";
import { Field, INPUT_CLASS } from "@/components/case-form/Field";

export interface SetField {
  <K extends keyof CaseFormState>(field: K, value: CaseFormState[K]): void;
}

interface Props {
  form: CaseFormState;
  ai: ReadonlySet<string>;
  errors: { case_number?: string; case_name?: string; case_value?: string; court?: string; court_file_number?: string; opening_date?: string };
  setField: SetField;
  /** The case number is fixed once the case exists: shown, not editable and not marked required. */
  caseNumberReadOnly?: boolean;
  /** Statuses offered by "Durum" (the open ones by default); null hides the field, as for a closed case. */
  statuses?: readonly OpenCaseStatus[] | null;
  /** Focus "Dava adı" when the dialog opens (the case number comes first but is read-only). */
  focusName?: boolean;
}

/** "Temel bilgiler ve mahkeme" fields. */
export function BasicInfoFields({ form, ai, errors, setField, caseNumberReadOnly = false, statuses = OPEN_CASE_STATUSES, focusName = false }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field id="case_number" label="Dava no" required={!caseNumberReadOnly} error={errors.case_number}>
        {(a11y) => (
          <input
            {...a11y}
            maxLength={FIELD_LIMITS.case_number}
            readOnly={caseNumberReadOnly}
            aria-readonly={caseNumberReadOnly || undefined}
            className={INPUT_CLASS}
            value={form.case_number}
            onChange={(e) => setField("case_number", e.target.value)}
          />
        )}
      </Field>
      <Field id="case_name" label="Dava adı" required ai={ai.has("case_name")} error={errors.case_name}>
        {(a11y) => <input {...a11y} data-autofocus={focusName || undefined} maxLength={FIELD_LIMITS.case_name} className={INPUT_CLASS} value={form.case_name} onChange={(e) => setField("case_name", e.target.value)} />}
      </Field>
      <Field id="case_type" label="Dava türü" required ai={ai.has("case_type")}>
        {(a11y) => (
          <select {...a11y} className={INPUT_CLASS} value={form.case_type} onChange={(e) => setField("case_type", e.target.value as CaseType)}>
            {CASE_TYPES.map((type) => (
              <option key={type} value={type}>
                {CASE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field id="court" label="Mahkeme" ai={ai.has("court")} error={errors.court}>
        {(a11y) => <input {...a11y} maxLength={FIELD_LIMITS.court} className={INPUT_CLASS} value={form.court} onChange={(e) => setField("court", e.target.value)} />}
      </Field>
      <Field id="court_file_number" label="Esas no" ai={ai.has("court_file_number")} error={errors.court_file_number}>
        {(a11y) => (
          <input {...a11y} maxLength={FIELD_LIMITS.court_file_number} className={INPUT_CLASS} value={form.court_file_number} onChange={(e) => setField("court_file_number", e.target.value)} />
        )}
      </Field>
      <Field id="opening_date" label="Dava tarihi" ai={ai.has("opening_date")} error={errors.opening_date}>
        {(a11y) => <input {...a11y} type="date" className={INPUT_CLASS} value={form.opening_date} onChange={(e) => setField("opening_date", e.target.value)} />}
      </Field>
      <Field id="case_value" label="Dava değeri" ai={ai.has("case_value")} error={errors.case_value}>
        {(a11y) => (
          <input
            {...a11y}
            type="number"
            min="0"
            step="any"
            className={INPUT_CLASS}
            value={form.case_value}
            onChange={(e) => setField("case_value", e.target.value)}
            // onInput also fires when unparseable text keeps the value at "" (no onChange then).
            onInput={(e) => setField("case_value_bad_input", e.currentTarget.validity.badInput)}
          />
        )}
      </Field>
      {statuses && (
        <Field id="status" label="Durum">
          {(a11y) => (
            <select {...a11y} className={INPUT_CLASS} value={form.status} onChange={(e) => setField("status", e.target.value as OpenCaseStatus)}>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {CASE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
    </div>
  );
}
