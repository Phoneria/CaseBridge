import { describe, expect, it } from "vitest";

import {
  MAX_DOCUMENT_BYTES,
  NO_CLIENT_MESSAGE,
  applyDraft,
  buildCasePayload,
  checkDocumentFile,
  clientRoleOf,
  emptyCaseForm,
  firstErrorSection,
  hasErrors,
  hasFillableContent,
  newPartyRow,
  pastedTextFile,
  positionLabels,
  validateCaseForm,
  type CaseFormState,
} from "@/lib/caseIntake";
import type { CaseIntakeDraft } from "@/types";

const EMPTY_DRAFT: CaseIntakeDraft = {
  case_name: null,
  case_type: null,
  court: null,
  court_file_number: null,
  case_value: null,
  opening_date: null,
  next_hearing_date: null,
  claim: null,
  facts_summary: null,
  plaintiff_position: null,
  defendant_position: null,
  parties: [],
  events: [],
};

function validForm(): CaseFormState {
  const form = emptyCaseForm();
  form.case_number = "2026/1";
  form.case_name = "Alacak Davası";
  form.parties = [newPartyRow("plaintiff", { name: "A Ltd.", is_client: true }), newPartyRow("defendant", { name: "B A.Ş." })];
  return form;
}

describe("emptyCaseForm", () => {
  it("starts with a plaintiff row and a defendant row and sensible defaults", () => {
    const form = emptyCaseForm();
    expect(form.parties.map((p) => p.role)).toEqual(["plaintiff", "defendant"]);
    expect(new Set(form.parties.map((p) => p.key)).size).toBe(2);
    expect(form.case_type).toBe("diger");
    expect(form.status).toBe("devam_eden");
  });
});

describe("clientRoleOf and positionLabels", () => {
  it("takes the role of the first client row, intervener counting as other", () => {
    const parties = [newPartyRow("defendant"), newPartyRow("plaintiff", { is_client: true }), newPartyRow("defendant", { is_client: true })];
    expect(clientRoleOf(parties)).toBe("plaintiff");
    expect(clientRoleOf([newPartyRow("intervener", { is_client: true })])).toBe("other");
    expect(clientRoleOf([newPartyRow("plaintiff")])).toBeNull();
  });

  it("labels the two positions from the client's side", () => {
    expect(positionLabels("plaintiff")).toEqual({ plaintiff: "İddiamız (davacı)", defendant: "Karşı tarafın savunması (davalı)" });
    expect(positionLabels("defendant")).toEqual({ plaintiff: "Davacının iddiası", defendant: "Savunmamız (davalı)" });
    const neutral = { plaintiff: "Davacının iddiası", defendant: "Davalının savunması" };
    expect(positionLabels("other")).toEqual(neutral);
    expect(positionLabels(null)).toEqual(neutral);
  });
});

describe("validateCaseForm", () => {
  it("accepts a complete form", () => {
    expect(hasErrors(validateCaseForm(validForm(), { requireLawyer: false }))).toBe(false);
  });

  it("requires case number, name and a named client party", () => {
    const errors = validateCaseForm(emptyCaseForm(), { requireLawyer: false });
    expect(errors.case_number).toBe("Dava no gerekli.");
    expect(errors.case_name).toBe("Dava adı gerekli.");
    expect(errors.parties).toBe(NO_CLIENT_MESSAGE);
    expect(NO_CLIENT_MESSAGE).toBe("En az bir taraf müvekkil olarak işaretlenmeli.");
  });

  it("does not count a client row without a name", () => {
    const form = validForm();
    form.parties = [newPartyRow("plaintiff", { is_client: true }), newPartyRow("defendant", { name: "B A.Ş." })];
    expect(validateCaseForm(form, { requireLawyer: false }).parties).toBe(NO_CLIENT_MESSAGE);
  });

  it("asks for a name on a row that has a counsel but no name", () => {
    const form = validForm();
    const orphan = newPartyRow("other", { counsel_name: "Av. Ece" });
    form.parties.push(orphan);
    const errors = validateCaseForm(form, { requireLawyer: false });
    expect(errors.partyNames[orphan.key]).toBe("Taraf adı gerekli.");
    expect(errors.parties).toBeUndefined();
  });

  it("ignores completely blank rows", () => {
    const form = validForm();
    form.parties.push(newPartyRow("other"));
    expect(hasErrors(validateCaseForm(form, { requireLawyer: false }))).toBe(false);
  });

  it("checks the case value and the admin's lawyer choice", () => {
    const form = validForm();
    form.case_value = "abc";
    expect(validateCaseForm(form, { requireLawyer: false }).case_value).toBe("Dava değeri geçerli bir sayı olmalı.");
    form.case_value = "-5";
    expect(validateCaseForm(form, { requireLawyer: false }).case_value).toBe("Dava değeri geçerli bir sayı olmalı.");
    form.case_value = "150000.5";
    expect(validateCaseForm(form, { requireLawyer: true }).assigned_lawyer_id).toBe("Sorumlu avukat seçin.");
    form.assigned_lawyer_id = "u1";
    expect(hasErrors(validateCaseForm(form, { requireLawyer: true }))).toBe(false);
  });

  it("reports the first section with an error in page order", () => {
    const errors = validateCaseForm(emptyCaseForm(), { requireLawyer: true });
    expect(firstErrorSection(errors)).toBe("temel");
    const form = validForm();
    form.parties[0].is_client = false;
    expect(firstErrorSection(validateCaseForm(form, { requireLawyer: false }))).toBe("taraflar");
    form.parties[0].is_client = true;
    expect(firstErrorSection(validateCaseForm(form, { requireLawyer: true }))).toBe("belgeler");
    expect(firstErrorSection(validateCaseForm(form, { requireLawyer: false }))).toBeNull();
  });
});

describe("buildCasePayload", () => {
  it("sends parties but never client_name or opposing_party", () => {
    const form = validForm();
    form.parties[0].counsel_name = "  Av. Ece  ";
    form.parties.push(newPartyRow("other"));

    const payload = buildCasePayload(form);

    expect(payload).toEqual({
      case_number: "2026/1",
      case_name: "Alacak Davası",
      case_type: "diger",
      status: "devam_eden",
      parties: [
        { name: "A Ltd.", role: "plaintiff", is_client: true, counsel_name: "Av. Ece" },
        { name: "B A.Ş.", role: "defendant", is_client: false, counsel_name: null },
      ],
    });
    expect(payload).not.toHaveProperty("client_name");
    expect(payload).not.toHaveProperty("opposing_party");
  });

  it("includes the optional fields that were filled in, converted", () => {
    const form = validForm();
    Object.assign(form, {
      court: "İstanbul 3. Asliye Ticaret",
      court_file_number: "2026/45 Esas",
      opening_date: "2026-03-02",
      next_hearing_date: "2026-05-12",
      case_value: "150000",
      claim: "Talep",
      facts_summary: "Olaylar",
      plaintiff_position: "İddia",
      defendant_position: "Savunma",
      description: "Not",
      assigned_lawyer_id: "u1",
    });

    expect(buildCasePayload(form)).toMatchObject({
      court: "İstanbul 3. Asliye Ticaret",
      court_file_number: "2026/45 Esas",
      opening_date: "2026-03-02",
      next_hearing_date: "2026-05-12",
      case_value: 150000,
      claim: "Talep",
      facts_summary: "Olaylar",
      plaintiff_position: "İddia",
      defendant_position: "Savunma",
      description: "Not",
      assigned_lawyer_id: "u1",
    });
  });
});

describe("hasFillableContent", () => {
  it("is false for a fresh form and for fields the AI never fills", () => {
    const form = emptyCaseForm();
    form.case_number = "2026/1";
    form.description = "Not";
    form.assigned_lawyer_id = "u1";
    expect(hasFillableContent(form)).toBe(false);
  });

  it("is true once any fillable field or party has content", () => {
    expect(hasFillableContent({ ...emptyCaseForm(), claim: "x" })).toBe(true);
    expect(hasFillableContent({ ...emptyCaseForm(), case_type: "kira" })).toBe(true);
    const withParty = emptyCaseForm();
    withParty.parties[0].name = "A";
    expect(hasFillableContent(withParty)).toBe(true);
  });
});

describe("applyDraft", () => {
  it("fills what the draft knows, marks it as AI and leaves the rest alone", () => {
    const form = emptyCaseForm();
    form.case_number = "2026/1";
    const draft: CaseIntakeDraft = {
      ...EMPTY_DRAFT,
      case_name: "Taslak Dava",
      case_type: "kira",
      case_value: 2500.5,
      opening_date: "2026-03-02",
      claim: "Tahliye",
      parties: [
        { name: "A Ltd.", role: "plaintiff", counsel_name: "Av. Ece" },
        { name: "B Bey", role: "defendant", counsel_name: null },
      ],
      events: [{ event_date: "2026-03-02", title: "Dava açıldı", description: null, event_type: "filing" }],
    };

    const result = applyDraft(form, draft);

    expect(result.form).toMatchObject({
      case_number: "2026/1",
      case_name: "Taslak Dava",
      case_type: "kira",
      case_value: "2500.5",
      opening_date: "2026-03-02",
      claim: "Tahliye",
      court: "",
      status: "devam_eden",
    });
    expect(result.form.parties.map((p) => [p.name, p.role, p.counsel_name, p.is_client])).toEqual([
      ["A Ltd.", "plaintiff", "Av. Ece", false],
      ["B Bey", "defendant", "", false],
    ]);
    const partyMarks = result.form.parties.map((p) => `party:${p.key}`);
    expect([...result.marks].sort()).toEqual(["case_name", "case_type", "case_value", "claim", "opening_date", ...partyMarks].sort());
    expect(result.events).toEqual([
      expect.objectContaining({ event_date: "2026-03-02", title: "Dava açıldı", description: null, event_type: "filing", checked: true }),
    ]);
    expect(new Set(result.events.map((e) => e.key)).size).toBe(1);
  });

  it("keeps existing values where the draft is null and the current parties when it has none", () => {
    const form = validForm();
    form.court = "Mevcut Mahkeme";

    const result = applyDraft(form, { ...EMPTY_DRAFT, case_name: "Yeni Ad" });

    expect(result.form.court).toBe("Mevcut Mahkeme");
    expect(result.form.case_name).toBe("Yeni Ad");
    expect(result.form.parties).toEqual(form.parties);
    expect([...result.marks]).toEqual(["case_name"]);
  });
});

describe("document files", () => {
  it("accepts pdf, docx and txt up to 10 MB", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(10 * 1024 * 1024);
    expect(checkDocumentFile(new File(["x"], "a.PDF"))).toBeNull();
    expect(checkDocumentFile(new File(["x"], "a.docx"))).toBeNull();
    expect(checkDocumentFile(new File(["x"], "a.txt"))).toBeNull();
  });

  it("rejects other types and big files with a message naming the file", () => {
    expect(checkDocumentFile(new File(["x"], "resim.png"))).toBe("resim.png desteklenmeyen bir dosya türü (pdf, docx, txt).");
    const big = new File(["x"], "buyuk.pdf");
    Object.defineProperty(big, "size", { value: MAX_DOCUMENT_BYTES + 1 });
    expect(checkDocumentFile(big)).toBe("buyuk.pdf 10 MB sınırını aşıyor.");
  });

  it("wraps pasted text in a .txt file", async () => {
    const file = pastedTextFile("Dilekçe metni");
    expect(file.name).toBe("yapistirilan-metin.txt");
    expect(file.type).toBe("text/plain");
    const content = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(file);
    });
    expect(content).toBe("Dilekçe metni");
  });
});
