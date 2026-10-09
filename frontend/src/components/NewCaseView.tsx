"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { BasicInfoFields, type SetField } from "@/components/case-form/BasicInfoFields";
import { DisputeFields } from "@/components/case-form/DisputeFields";
import { FormSection } from "@/components/case-form/Field";
import { FollowUpFields } from "@/components/case-form/FollowUpFields";
import { IntakeFillBox, type IntakeSource } from "@/components/case-form/IntakeFillBox";
import { PartiesFields } from "@/components/case-form/PartiesFields";
import {
  applyDraft,
  buildCasePayload,
  clientRoleOf,
  emptyCaseForm,
  firstErrorSection,
  hasErrors,
  hasFillableContent,
  newPartyRow,
  validateCaseForm,
  type CaseFormState,
  type FormErrors,
  type PartyRow,
  type SectionId,
  type SuggestedEvent,
} from "@/lib/caseIntake";
import { addCaseEvent, createCase, getMe, listAdminLawyers, uploadDocument } from "@/lib/api";
import { ApiError } from "@/lib/apiError";
import type { AppUser, CaseIntakeResult } from "@/types";

const SECTIONS: { id: SectionId; title: string }[] = [
  { id: "temel", title: "Temel bilgiler ve mahkeme" },
  { id: "taraflar", title: "Taraflar" },
  { id: "uyusmazlik", title: "Uyuşmazlık" },
  { id: "belgeler", title: "Belgeler ve takip" },
];

const NO_ERRORS: FormErrors = { partyNames: {} };

function errorMessage(error: unknown): string {
  return error instanceof ApiError && error.message ? error.message : "Bilinmeyen hata.";
}

/** The "Yeni dava" page: a sectioned form that can be pre-filled from a document. */
export function NewCaseView() {
  const router = useRouter();
  const [form, setForm] = useState<CaseFormState>(emptyCaseForm);
  const [ai, setAi] = useState<ReadonlySet<string>>(new Set());
  const [events, setEvents] = useState<SuggestedEvent[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [source, setSource] = useState<IntakeSource | null>(null);
  const [includeSource, setIncludeSource] = useState(true);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "user-error" | "lawyers-error">("loading");
  const [lawyers, setLawyers] = useState<Pick<AppUser, "id" | "full_name" | "department">[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const allowLeave = useRef(false);
  const inFlight = useRef(false);
  // The draft may arrive after the user kept typing; apply it to the latest form.
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    let cancelled = false;
    getMe().then(
      async (me) => {
        if (cancelled) return;
        if (me.role !== "admin") {
          setLoadState("ready");
          return;
        }
        setIsAdmin(true);
        try {
          const all = await listAdminLawyers();
          if (cancelled) return;
          setLawyers(all.filter((lawyer) => lawyer.is_active));
          setLoadState("ready");
        } catch {
          if (!cancelled) setLoadState("lawyers-error");
        }
      },
      () => {
        if (!cancelled) setLoadState("user-error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty =
    hasFillableContent(form) ||
    form.case_number.trim() !== "" ||
    form.description.trim() !== "" ||
    files.length > 0 ||
    source !== null;

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      if (allowLeave.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

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
    const applied = applyDraft(formRef.current, result.draft);
    setForm(applied.form);
    const replacesParties = result.draft.parties.length > 0;
    setAi((previous) => {
      const kept = replacesParties ? [...previous].filter((key) => !key.startsWith("party:")) : [...previous];
      return new Set([...kept, ...applied.marks]);
    });
    setEvents(applied.events);
    setSource(from);
    setIncludeSource(true);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || loadState !== "ready") return;
    setSubmitError(null);
    const found = validateCaseForm(form, { requireLawyer: isAdmin });
    setErrors(found);
    if (hasErrors(found)) {
      const section = firstErrorSection(found);
      if (section) {
        document.getElementById(`bolum-${section}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        document.getElementById(`bolum-${section}-baslik`)?.focus();
      }
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    // Snapshot what to send now; the form stays editable while requests run.
    const payload = buildCasePayload(form);
    const chosenEvents = events.filter((item) => item.checked);
    const documents = [...(source && includeSource ? [source.file] : []), ...files];
    let created;
    try {
      created = await createCase(payload);
    } catch (error) {
      setSubmitError(
        error instanceof ApiError && error.status === 409
          ? "Bu dava numarası zaten kayıtlı."
          : `Dava oluşturulamadı: ${errorMessage(error)}`,
      );
      setSubmitting(false);
      inFlight.current = false;
      return;
    }

    let failed = 0;
    for (const suggestion of chosenEvents) {
      try {
        await addCaseEvent(created.id, {
          event_date: suggestion.event_date,
          title: suggestion.title,
          event_type: suggestion.event_type,
          ...(suggestion.description ? { description: suggestion.description } : {}),
        });
      } catch {
        failed += 1;
      }
    }
    for (const document_ of documents) {
      try {
        await uploadDocument(created.id, document_);
      } catch {
        failed += 1;
      }
    }

    allowLeave.current = true;
    router.push(failed ? `/davalar/${created.id}?eklenemeyen=${failed}` : `/davalar/${created.id}`);
  }

  const loadError =
    loadState === "user-error" ? "Kullanıcı bilgisi yüklenemedi." : loadState === "lawyers-error" ? "Avukat listesi yüklenemedi." : null;
  const submitBlocked = submitting || loadState !== "ready";

  const clientMarked = form.parties.some((party) => party.is_client);
  const showClientHint = !clientMarked && [...ai].some((key) => key.startsWith("party:"));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Yeni dava</h1>
        <p className="text-sm text-navy-500">Davayı bölümler halinde girin; bir belgeden de doldurabilirsiniz.</p>
      </div>

      <IntakeFillBox hasContent={hasFillableContent(form)} onDraft={handleDraft} />

      <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
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
              onRemove={(key) => {
                setForm((current) => ({ ...current, parties: current.parties.filter((party) => party.key !== key) }));
                unmark(`party:${key}`);
              }}
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
              lawyers={isAdmin ? lawyers : null}
              lawyerId={form.assigned_lawyer_id}
              lawyerError={errors.assigned_lawyer_id}
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

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              aria-disabled={submitBlocked}
              className="rounded-xl bg-accent-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-700 aria-disabled:opacity-50"
            >
              {submitting ? "Oluşturuluyor…" : "Davayı oluştur"}
            </button>
            {loadError && (
              <p role="alert" className="text-sm text-red-600">
                {loadError}
              </p>
            )}
            {submitError && (
              <p role="alert" className="text-sm text-red-600">
                {submitError}
              </p>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
