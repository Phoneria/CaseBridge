"use client";

import { Field, INPUT_CLASS } from "@/components/case-form/Field";
import type { SetField } from "@/components/case-form/BasicInfoFields";
import { FIELD_LIMITS, positionLabels, type CaseFormState } from "@/lib/caseIntake";
import type { ClientRole } from "@/types";

interface Props {
  form: CaseFormState;
  /** Decides how the two positions are labelled ("İddiamız (davacı)" ...). */
  clientRole: ClientRole | null;
  ai: ReadonlySet<string>;
  setField: SetField;
}

/** The Esas no field, shared by the basic-info section and the dispute card editor. */
export function CourtFileNumberField({ value, ai, onChange }: { value: string; ai: boolean; onChange: (value: string) => void }) {
  return (
    <Field id="court_file_number" label="Esas no" ai={ai}>
      {(a11y) => <input {...a11y} maxLength={FIELD_LIMITS.court_file_number} className={INPUT_CLASS} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

function TextArea({
  id,
  label,
  value,
  ai,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  ai: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field id={id} label={label} ai={ai}>
      {(a11y) => <textarea {...a11y} rows={4} className={INPUT_CLASS} value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

/** "Uyuşmazlık" fields: claim, facts, both sides' positions and the general notes. */
export function DisputeFields({ form, clientRole, ai, setField }: Props) {
  const labels = positionLabels(clientRole);
  return (
    <div className="grid grid-cols-1 gap-4">
      <TextArea id="claim" label="Talep / dava konusu" value={form.claim} ai={ai.has("claim")} onChange={(v) => setField("claim", v)} />
      <TextArea id="facts_summary" label="Olay özeti" value={form.facts_summary} ai={ai.has("facts_summary")} onChange={(v) => setField("facts_summary", v)} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TextArea
          id="plaintiff_position"
          label={labels.plaintiff}
          value={form.plaintiff_position}
          ai={ai.has("plaintiff_position")}
          onChange={(v) => setField("plaintiff_position", v)}
        />
        <TextArea
          id="defendant_position"
          label={labels.defendant}
          value={form.defendant_position}
          ai={ai.has("defendant_position")}
          onChange={(v) => setField("defendant_position", v)}
        />
      </div>
      <TextArea id="description" label="Genel notlar" value={form.description} ai={false} onChange={(v) => setField("description", v)} />
    </div>
  );
}
