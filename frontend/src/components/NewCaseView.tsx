"use client";

import { useState } from "react";

import { BasicInfoFields, type SetField } from "@/components/case-form/BasicInfoFields";
import { DisputeFields } from "@/components/case-form/DisputeFields";
import { FormSection } from "@/components/case-form/Field";
import { FollowUpFields } from "@/components/case-form/FollowUpFields";
import { IntakeFillBox, type IntakeSource } from "@/components/case-form/IntakeFillBox";
import { PartiesFields } from "@/components/case-form/PartiesFields";
import {
  applyDraft,
  clientRoleOf,
  emptyCaseForm,
  hasFillableContent,
  newPartyRow,
  type CaseFormState,
  type FormErrors,
  type PartyRow,
  type SectionId,
  type SuggestedEvent,
} from "@/lib/caseIntake";
import type { CaseIntakeResult } from "@/types";

const SECTIONS: { id: SectionId; title: string }[] = [
  { id: "temel", title: "Temel bilgiler ve mahkeme" },
  { id: "taraflar", title: "Taraflar" },
  { id: "uyusmazlik", title: "Uyuşmazlık" },
  { id: "belgeler", title: "Belgeler ve takip" },
];

const NO_ERRORS: FormErrors = { partyNames: {} };

/** The "Yeni dava" page: a sectioned form that can be pre-filled from a document. */
export function NewCaseView() {
  const [form, setForm] = useState<CaseFormState>(emptyCaseForm);
  const [ai, setAi] = useState<ReadonlySet<string>>(new Set());
  const [events, setEvents] = useState<SuggestedEvent[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [source, setSource] = useState<IntakeSource | null>(null);
  const [includeSource, setIncludeSource] = useState(true);
  const errors = NO_ERRORS;

  function unmark(key: string) {
    setAi((previous) => {
      if (!previous.has(key)) return previous;
      const next = new Set(previous);
      next.delete(key);
      return next;
    });
  }

  const setField: SetField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    unmark(field);
  };

  function updateParty(key: string, patch: Partial<Omit<PartyRow, "key">>) {
    setForm((current) => ({
      ...current,
      parties: current.parties.map((party) => (party.key === key ? { ...party, ...patch } : party)),
    }));
    // Ticking "Müvekkilimiz" is the lawyer's decision, not an edit of what the AI read.
    if (Object.keys(patch).some((field) => field !== "is_client")) unmark(`party:${key}`);
  }

  function handleDraft(result: CaseIntakeResult, from: IntakeSource) {
    const applied = applyDraft(form, result.draft);
    setForm(applied.form);
    setAi((previous) => new Set([...previous, ...applied.marks]));
    setEvents(applied.events);
    setSource(from);
    setIncludeSource(true);
  }

  const clientMarked = form.parties.some((party) => party.is_client);
  const showClientHint = !clientMarked && [...ai].some((key) => key.startsWith("party:"));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Yeni dava</h1>
        <p className="text-sm text-navy-500">Davayı bölümler halinde girin; bir belgeden de doldurabilirsiniz.</p>
      </div>

      <IntakeFillBox hasContent={hasFillableContent(form)} onDraft={handleDraft} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Bölümler" className="flex flex-wrap gap-2 lg:sticky lg:top-4 lg:flex-col lg:self-start">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#bolum-${section.id}`}
              className="rounded-lg px-3 py-1.5 text-sm text-navy-700 hover:bg-surface-muted"
            >
              {section.title}
            </a>
          ))}
        </nav>

        <div className="space-y-5">
          <FormSection id="temel" title="Temel bilgiler ve mahkeme">
            <BasicInfoFields form={form} ai={ai} errors={errors} setField={setField} />
          </FormSection>

          <FormSection id="taraflar" title="Taraflar">
            <PartiesFields
              parties={form.parties}
              ai={ai}
              error={errors.parties}
              partyErrors={errors.partyNames}
              showClientHint={showClientHint}
              onUpdate={updateParty}
              onAdd={() => setForm((current) => ({ ...current, parties: [...current.parties, newPartyRow("other")] }))}
              onRemove={(key) =>
                setForm((current) => ({ ...current, parties: current.parties.filter((party) => party.key !== key) }))
              }
            />
          </FormSection>

          <FormSection id="uyusmazlik" title="Uyuşmazlık">
            <DisputeFields form={form} clientRole={clientRoleOf(form.parties)} ai={ai} setField={setField} />
          </FormSection>

          <FormSection id="belgeler" title="Belgeler ve takip">
            <FollowUpFields
              nextHearingDate={form.next_hearing_date}
              ai={ai}
              onNextHearingDate={(value) => setField("next_hearing_date", value)}
              lawyers={null}
              lawyerId={form.assigned_lawyer_id}
              onLawyer={(id) => setField("assigned_lawyer_id", id)}
              files={files}
              onAddFiles={(added) => setFiles((current) => [...current, ...added])}
              onRemoveFile={(index) => setFiles((current) => current.filter((_, position) => position !== index))}
              source={source ? { label: source.label } : null}
              includeSource={includeSource}
              onIncludeSource={setIncludeSource}
              events={events}
              onToggleEvent={(key, checked) =>
                setEvents((current) => current.map((event) => (event.key === key ? { ...event, checked } : event)))
              }
            />
          </FormSection>
        </div>
      </div>
    </div>
  );
}
