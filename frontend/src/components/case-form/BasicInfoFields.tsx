"use client";

import { CASE_STATUSES, CASE_TYPES } from "@/lib/filters";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS } from "@/lib/labels";
import type { CaseFormState } from "@/lib/caseIntake";
import type { CaseStatus, CaseType } from "@/types";
import { Field, INPUT_CLASS } from "@/components/case-form/Field";

export interface SetField {
  <K extends keyof CaseFormState>(field: K, value: CaseFormState[K]): void;
}

interface Props {
  form: CaseFormState;
  ai: ReadonlySet<string>;
  errors: { case_number?: string; case_name?: string; case_value?: string };
  setField: SetField;
}

/** "Temel bilgiler ve mahkeme" fields. */
export function BasicInfoFields({ form, ai, errors, setField }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field id="case_number" label="Dava no" required error={errors.case_number}>
        {(a11y) => <input {...a11y} className={INPUT_CLASS} value={form.case_number} onChange={(e) => setField("case_number", e.target.value)} />}
      </Field>
      <Field id="case_name" label="Dava adı" required ai={ai.has("case_name")} error={errors.case_name}>
        {(a11y) => <input {...a11y} className={INPUT_CLASS} value={form.case_name} onChange={(e) => setField("case_name", e.target.value)} />}
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
      <Field id="court" label="Mahkeme" ai={ai.has("court")}>
        {(a11y) => <input {...a11y} className={INPUT_CLASS} value={form.court} onChange={(e) => setField("court", e.target.value)} />}
      </Field>
      <Field id="court_file_number" label="Esas no" ai={ai.has("court_file_number")}>
        {(a11y) => (
          <input {...a11y} className={INPUT_CLASS} value={form.court_file_number} onChange={(e) => setField("court_file_number", e.target.value)} />
        )}
      </Field>
      <Field id="opening_date" label="Dava tarihi" ai={ai.has("opening_date")}>
        {(a11y) => <input {...a11y} type="date" className={INPUT_CLASS} value={form.opening_date} onChange={(e) => setField("opening_date", e.target.value)} />}
      </Field>
      <Field id="case_value" label="Dava değeri" ai={ai.has("case_value")} error={errors.case_value}>
        {(a11y) => (
          <input {...a11y} type="number" min="0" step="any" className={INPUT_CLASS} value={form.case_value} onChange={(e) => setField("case_value", e.target.value)} />
        )}
      </Field>
      <Field id="status" label="Durum">
        {(a11y) => (
          <select {...a11y} className={INPUT_CLASS} value={form.status} onChange={(e) => setField("status", e.target.value as CaseStatus)}>
            {CASE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CASE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        )}
      </Field>
    </div>
  );
}
