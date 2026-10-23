/** Form state and pure rules for the new-case page and the case detail editors. */
import type {
  Case,
  CaseIntakeDraft,
  CaseIntakeEvent,
  CaseParty,
  CasePartyPayload,
  CasePayload,
  CaseUpdatePayload,
  CaseStatus,
  CaseType,
  ClientRole,
  PartyRole,
} from "@/types";

export const PARTY_ROLES: PartyRole[] = ["plaintiff", "defendant", "intervener", "other"];
export const PARTY_ROLE_LABELS: Record<PartyRole, string> = {
  plaintiff: "Davacı",
  defendant: "Davalı",
  intervener: "Fer'i müdahil",
  other: "Diğer",
};
export const EVENT_TYPE_LABELS: Record<string, string> = {
  filing: "Dilekçe/Başvuru",
  hearing: "Duruşma",
  submission: "Sunum",
  expert_report: "Bilirkişi Raporu",
  legal_update: "Mevzuat Güncellemesi",
  note: "Not",
  other: "Diğer",
};

export const NO_CLIENT_MESSAGE = "En az bir taraf müvekkil olarak işaretlenmeli.";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".txt"];

export type SectionId = "temel" | "taraflar" | "uyusmazlik" | "belgeler";

export interface PartyRow {
  key: string;
  name: string;
  role: PartyRole;
  counsel_name: string;
  is_client: boolean;
}

export interface CaseFormState {
  case_number: string;
  case_name: string;
  case_type: CaseType;
  court: string;
  court_file_number: string;
  opening_date: string;
  case_value: string;
  status: CaseStatus;
  parties: PartyRow[];
  claim: string;
  facts_summary: string;
  plaintiff_position: string;
  defendant_position: string;
  description: string;
  next_hearing_date: string;
  assigned_lawyer_id: string;
}

/** Column limits of the backend; the same numbers cap the inputs and drive the validation messages. */
export const FIELD_LIMITS = {
  case_number: 50,
  case_name: 255,
  court: 255,
  court_file_number: 100,
  party_name: 255,
  counsel_name: 255,
} as const;

const tooLong = (value: string, limit: number): string | undefined =>
  value.trim().length > limit ? `En fazla ${limit} karakter olabilir.` : undefined;

export interface SuggestedEvent extends CaseIntakeEvent {
  key: string;
  checked: boolean;
}

let rowCounter = 0;
function nextKey(prefix: string): string {
  rowCounter += 1;
  return `${prefix}-${rowCounter}`;
}

/** Role of a row added with "Taraf ekle": the side opposite the client's (defendant without a client or on "other"). */
export function addedPartyRole(parties: PartyRow[]): PartyRole {
  return clientRoleOf(parties) === "defendant" ? "plaintiff" : "defendant";
}

export function newPartyRow(role: PartyRole = "other", init: Partial<Omit<PartyRow, "key" | "role">> = {}): PartyRow {
  return { key: nextKey("party"), name: "", role, counsel_name: "", is_client: false, ...init };
}

export function emptyCaseForm(): CaseFormState {
  return {
    case_number: "",
    case_name: "",
    case_type: "diger",
    court: "",
    court_file_number: "",
    opening_date: "",
    case_value: "",
    status: "devam_eden",
    parties: [newPartyRow("plaintiff"), newPartyRow("defendant")],
    claim: "",
    facts_summary: "",
    plaintiff_position: "",
    defendant_position: "",
    description: "",
    next_hearing_date: "",
    assigned_lawyer_id: "",
  };
}

/** The client's side: the first client row's role (an intervener counts as "other"). */
export function clientRoleOf(parties: PartyRow[]): ClientRole | null {
  const client = parties.find((party) => party.is_client);
  if (!client) return null;
  return client.role === "plaintiff" || client.role === "defendant" ? client.role : "other";
}

export function positionLabels(role: ClientRole | null): { plaintiff: string; defendant: string } {
  if (role === "plaintiff") return { plaintiff: "İddiamız (davacı)", defendant: "Karşı tarafın savunması (davalı)" };
  if (role === "defendant") return { plaintiff: "Davacının iddiası", defendant: "Savunmamız (davalı)" };
  return { plaintiff: "Davacının iddiası", defendant: "Davalının savunması" };
}

export interface FormErrors {
  case_number?: string;
  case_name?: string;
  case_value?: string;
  court?: string;
  court_file_number?: string;
  parties?: string;
  partyNames: Record<string, string>;
  partyCounsel: Record<string, string>;
  assigned_lawyer_id?: string;
}

/** Row errors by row key: a missing name (when only a counsel is given) and over-long name / counsel. */
export function validateParties(parties: PartyRow[]): { partyNames: Record<string, string>; partyCounsel: Record<string, string> } {
  const partyNames: Record<string, string> = {};
  const partyCounsel: Record<string, string> = {};
  for (const party of parties) {
    const nameError = !party.name.trim() && party.counsel_name.trim() ? "Taraf adı gerekli." : tooLong(party.name, FIELD_LIMITS.party_name);
    if (nameError) partyNames[party.key] = nameError;
    const counselError = tooLong(party.counsel_name, FIELD_LIMITS.counsel_name);
    if (counselError) partyCounsel[party.key] = counselError;
  }
  return { partyNames, partyCounsel };
}

export function validateCaseForm(form: CaseFormState, options: { requireLawyer: boolean }): FormErrors {
  const errors: FormErrors = { ...validateParties(form.parties) };
  if (!form.case_number.trim()) errors.case_number = "Dava no gerekli.";
  else errors.case_number = tooLong(form.case_number, FIELD_LIMITS.case_number);
  if (!form.case_name.trim()) errors.case_name = "Dava adı gerekli.";
  else errors.case_name = tooLong(form.case_name, FIELD_LIMITS.case_name);
  errors.court = tooLong(form.court, FIELD_LIMITS.court);
  errors.court_file_number = tooLong(form.court_file_number, FIELD_LIMITS.court_file_number);
  if (form.case_value.trim()) {
    const value = Number(form.case_value);
    if (!Number.isFinite(value) || value < 0) errors.case_value = "Dava değeri geçerli bir sayı olmalı.";
  }
  if (!form.parties.some((party) => party.is_client && party.name.trim())) errors.parties = NO_CLIENT_MESSAGE;
  if (options.requireLawyer && !form.assigned_lawyer_id) errors.assigned_lawyer_id = "Sorumlu avukat seçin.";
  return errors;
}

export function hasErrors(errors: FormErrors): boolean {
  return Boolean(
    errors.case_number ||
      errors.case_name ||
      errors.case_value ||
      errors.court ||
      errors.court_file_number ||
      errors.parties ||
      errors.assigned_lawyer_id ||
      Object.keys(errors.partyNames).length ||
      Object.keys(errors.partyCounsel).length,
  );
}

/** Sections in page order; the first one holding an error is scrolled to. */
export function firstErrorSection(errors: FormErrors): SectionId | null {
  if (errors.case_number || errors.case_name || errors.case_value || errors.court || errors.court_file_number) return "temel";
  if (errors.parties || Object.keys(errors.partyNames).length || Object.keys(errors.partyCounsel).length) return "taraflar";
  if (errors.assigned_lawyer_id) return "belgeler";
  return null;
}

const trimmed = (value: string) => value.trim();

export function buildPartiesPayload(parties: PartyRow[]): CasePartyPayload[] {
  return parties
    .filter((party) => party.name.trim())
    .map((party) => ({
      name: trimmed(party.name),
      role: party.role,
      is_client: party.is_client,
      counsel_name: trimmed(party.counsel_name) || null,
    }));
}

export function buildCasePayload(form: CaseFormState): CasePayload {
  const payload: CasePayload = {
    case_number: trimmed(form.case_number),
    case_name: trimmed(form.case_name),
    case_type: form.case_type,
    status: form.status,
    parties: buildPartiesPayload(form.parties),
  };
  const optionalText = [
    "court",
    "court_file_number",
    "opening_date",
    "next_hearing_date",
    "claim",
    "facts_summary",
    "plaintiff_position",
    "defendant_position",
    "description",
    "assigned_lawyer_id",
  ] as const;
  for (const field of optionalText) {
    if (trimmed(form[field])) payload[field] = trimmed(form[field]);
  }
  if (trimmed(form.case_value)) payload.case_value = Number(form.case_value);
  return payload;
}

/** True when the lawyer already typed something the AI would overwrite. */
export function hasFillableContent(form: CaseFormState): boolean {
  const texts = [
    form.case_name,
    form.court,
    form.court_file_number,
    form.opening_date,
    form.next_hearing_date,
    form.case_value,
    form.claim,
    form.facts_summary,
    form.plaintiff_position,
    form.defendant_position,
  ];
  return (
    texts.some((value) => value.trim()) ||
    form.case_type !== "diger" ||
    form.parties.some((party) => party.name.trim() || party.counsel_name.trim())
  );
}

const DRAFT_TEXT_FIELDS = [
  "case_name",
  "court",
  "court_file_number",
  "opening_date",
  "next_hearing_date",
  "claim",
  "facts_summary",
  "plaintiff_position",
  "defendant_position",
] as const;

export interface AppliedDraft {
  form: CaseFormState;
  /** "case_name" style field keys and "party:<row key>" for AI-filled party rows. */
  marks: Set<string>;
  events: SuggestedEvent[];
}

/** Draft values replace the form's; fields the draft left null keep their current value. */
export function applyDraft(form: CaseFormState, draft: CaseIntakeDraft): AppliedDraft {
  const next: CaseFormState = { ...form };
  const marks = new Set<string>();

  for (const field of DRAFT_TEXT_FIELDS) {
    const value = draft[field];
    if (value) {
      next[field] = value;
      marks.add(field);
    }
  }
  if (draft.case_type) {
    next.case_type = draft.case_type;
    marks.add("case_type");
  }
  if (draft.case_value !== null) {
    next.case_value = String(draft.case_value);
    marks.add("case_value");
  }
  if (draft.parties.length) {
    next.parties = draft.parties.map((party) =>
      newPartyRow(party.role, { name: party.name, counsel_name: party.counsel_name ?? "" }),
    );
    next.parties.forEach((row) => marks.add(`party:${row.key}`));
  }

  const events = draft.events.map((event) => ({ ...event, key: nextKey("event"), checked: true }));
  return { form: next, marks, events };
}

/** A user-facing message when the file cannot be attached, otherwise null. */
export function checkDocumentFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!DOCUMENT_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return `${file.name} desteklenmeyen bir dosya türü (pdf, docx, txt).`;
  }
  if (file.size > MAX_DOCUMENT_BYTES) return `${file.name} 10 MB sınırını aşıyor.`;
  return null;
}

export function pastedTextFile(text: string): File {
  return new File([text], "yapistirilan-metin.txt", { type: "text/plain" });
}

export function partyRowFromParty(party: CaseParty): PartyRow {
  return newPartyRow(party.role, {
    name: party.name,
    counsel_name: party.counsel_name ?? "",
    is_client: party.is_client,
  });
}

/** The case detail editors reuse the new-case form state; fields they do not edit keep their defaults. */
export function formFromCase(item: Case): CaseFormState {
  const parties = [...(item.parties ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return {
    ...emptyCaseForm(),
    court_file_number: item.court_file_number ?? "",
    claim: item.claim ?? "",
    facts_summary: item.facts_summary ?? "",
    plaintiff_position: item.plaintiff_position ?? "",
    defendant_position: item.defendant_position ?? "",
    description: item.description ?? "",
    parties: parties.map(partyRowFromParty),
  };
}

/** PATCH body of the "Uyuşmazlık" card: an emptied field becomes null, which clears it on the server. */
export function buildDisputePayload(form: CaseFormState): CaseUpdatePayload {
  const orNull = (value: string) => trimmed(value) || null;
  return {
    court_file_number: orNull(form.court_file_number),
    claim: orNull(form.claim),
    facts_summary: orNull(form.facts_summary),
    plaintiff_position: orNull(form.plaintiff_position),
    defendant_position: orNull(form.defendant_position),
    description: orNull(form.description),
  };
}
