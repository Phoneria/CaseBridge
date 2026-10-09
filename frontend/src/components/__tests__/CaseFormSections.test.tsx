import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { BasicInfoFields } from "@/components/case-form/BasicInfoFields";
import { DisputeFields } from "@/components/case-form/DisputeFields";
import { FollowUpFields } from "@/components/case-form/FollowUpFields";
import { PartiesFields } from "@/components/case-form/PartiesFields";
import {
  emptyCaseForm,
  newPartyRow,
  type CaseFormState,
  type PartyRow,
  type SuggestedEvent,
} from "@/lib/caseIntake";

function BasicHarness({ ai = new Set<string>(), errors = {} }: { ai?: Set<string>; errors?: Record<string, string> }) {
  const [form, setForm] = useState<CaseFormState>(emptyCaseForm());
  return (
    <BasicInfoFields
      form={form}
      ai={ai}
      errors={errors}
      setField={(field, value) => setForm((prev) => ({ ...prev, [field]: value }))}
    />
  );
}

describe("BasicInfoFields", () => {
  it("shows the spec's labels with required markers on case number, name and type", () => {
    render(<BasicHarness />);
    for (const label of [/^Dava no/, /^Dava adı/, /^Dava türü/, "Mahkeme", "Esas no", "Dava tarihi", "Dava değeri", "Durum"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByLabelText(/^Dava no/)).toHaveAttribute("id", "case_number");
    expect(screen.getByLabelText(/^Dava adı/)).toHaveAttribute("id", "case_name");
  });

  it("offers the case types and statuses", () => {
    render(<BasicHarness />);
    const type = screen.getByLabelText(/^Dava türü/) as HTMLSelectElement;
    expect([...type.options].map((option) => option.text)).toEqual(["İş Hukuku", "Ticaret Hukuku", "Sözleşme", "Kira", "İcra", "Diğer"]);
    const status = screen.getByLabelText("Durum") as HTMLSelectElement;
    expect([...status.options].map((option) => option.text)).toEqual(["Devam Eden", "Duruşma Bekleyen", "Karar Bekleyen", "Kapalı"]);
  });

  it("edits values and shows errors next to the field", async () => {
    render(<BasicHarness errors={{ case_number: "Dava no gerekli.", case_value: "Dava değeri geçerli bir sayı olmalı." }} />);
    await userEvent.type(screen.getByLabelText(/^Dava adı/), "Alacak");
    expect(screen.getByLabelText(/^Dava adı/)).toHaveValue("Alacak");
    expect(screen.getByText("Dava no gerekli.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Dava no/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Dava değeri geçerli bir sayı olmalı.")).toBeInTheDocument();
  });

  it("badges only the fields the AI filled", () => {
    render(<BasicHarness ai={new Set(["case_name", "court"])} />);
    expect(screen.getAllByText("AI")).toHaveLength(2);
    expect(within(screen.getByLabelText(/^Dava adı/).parentElement!).getByText("AI")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Dava tarihi").parentElement!).queryByText("AI")).toBeNull();
  });
});

function PartiesHarness({
  initial = emptyCaseForm().parties,
  ai = new Set<string>(),
  error,
  partyErrors = {},
  hint = false,
  onChange,
}: {
  initial?: PartyRow[];
  ai?: Set<string>;
  error?: string;
  partyErrors?: Record<string, string>;
  hint?: boolean;
  onChange?: (parties: PartyRow[]) => void;
}) {
  const [parties, setParties] = useState<PartyRow[]>(initial);
  const update = (next: PartyRow[]) => {
    setParties(next);
    onChange?.(next);
  };
  return (
    <PartiesFields
      parties={parties}
      ai={ai}
      error={error}
      partyErrors={partyErrors}
      showClientHint={hint}
      onUpdate={(key, patch) => update(parties.map((row) => (row.key === key ? { ...row, ...patch } : row)))}
      onAdd={() => update([...parties, newPartyRow("other")])}
      onRemove={(key) => update(parties.filter((row) => row.key !== key))}
    />
  );
}

describe("PartiesFields", () => {
  it("renders a labelled group per party with the four roles", () => {
    render(<PartiesHarness />);
    const first = screen.getByRole("group", { name: "Taraf 1" });
    expect(within(first).getByLabelText(/^Ad/)).toBeInTheDocument();
    expect(within(first).getByLabelText("Vekili")).toBeInTheDocument();
    expect(within(first).getByLabelText("Müvekkilimiz")).not.toBeChecked();
    const role = within(first).getByLabelText("Rol") as HTMLSelectElement;
    expect([...role.options].map((option) => option.text)).toEqual(["Davacı", "Davalı", "Fer'i müdahil", "Diğer"]);
    expect(role).toHaveValue("plaintiff");
    expect(within(screen.getByRole("group", { name: "Taraf 2" })).getByLabelText("Rol")).toHaveValue("defendant");
  });

  it("edits a row, marks the client and adds and removes rows", async () => {
    const onChange = vi.fn();
    render(<PartiesHarness onChange={onChange} />);
    const first = screen.getByRole("group", { name: "Taraf 1" });

    await userEvent.type(within(first).getByLabelText(/^Ad/), "A Ltd.");
    await userEvent.click(within(first).getByLabelText("Müvekkilimiz"));
    await userEvent.selectOptions(within(first).getByLabelText("Rol"), "intervener");
    await userEvent.type(within(first).getByLabelText("Vekili"), "Av. Ece");
    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({ name: "A Ltd.", is_client: true, role: "intervener", counsel_name: "Av. Ece" }),
      expect.objectContaining({ role: "defendant" }),
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Taraf ekle" }));
    expect(screen.getAllByRole("group", { name: /^Taraf \d/ })).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "Taraf 3 satırını kaldır" }));
    expect(screen.getAllByRole("group", { name: /^Taraf \d/ })).toHaveLength(2);
  });

  it("never removes the last remaining row", () => {
    render(<PartiesHarness initial={[newPartyRow("plaintiff")]} />);
    expect(screen.getByRole("button", { name: "Taraf 1 satırını kaldır" })).toBeDisabled();
  });

  it("shows the list error, row errors, the client hint and AI badges", () => {
    const rows = [newPartyRow("plaintiff", { name: "A" }), newPartyRow("defendant", { counsel_name: "Av. X" })];
    render(
      <PartiesHarness
        initial={rows}
        error="En az bir taraf müvekkil olarak işaretlenmeli."
        partyErrors={{ [rows[1].key]: "Taraf adı gerekli." }}
        hint
        ai={new Set([`party:${rows[0].key}`])}
      />,
    );
    expect(screen.getByText("En az bir taraf müvekkil olarak işaretlenmeli.")).toBeInTheDocument();
    expect(screen.getByText("Taraf adı gerekli.")).toBeInTheDocument();
    expect(screen.getByText("Müvekkilinizi işaretleyin.")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Taraf 1" })).getByText("AI")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Taraf 2" })).queryByText("AI")).toBeNull();
  });

  it("hides the client hint when asked not to show it", () => {
    render(<PartiesHarness />);
    expect(screen.queryByText("Müvekkilinizi işaretleyin.")).toBeNull();
  });
});

function DisputeHarness({ clientRole, ai = new Set<string>() }: { clientRole: "plaintiff" | "defendant" | "other" | null; ai?: Set<string> }) {
  const [form, setForm] = useState<CaseFormState>(emptyCaseForm());
  return (
    <DisputeFields
      form={form}
      clientRole={clientRole}
      ai={ai}
      setField={(field, value) => setForm((prev) => ({ ...prev, [field]: value }))}
    />
  );
}

describe("DisputeFields", () => {
  it.each([
    ["plaintiff", "İddiamız (davacı)", "Karşı tarafın savunması (davalı)"],
    ["defendant", "Davacının iddiası", "Savunmamız (davalı)"],
    ["other", "Davacının iddiası", "Davalının savunması"],
    [null, "Davacının iddiası", "Davalının savunması"],
  ] as const)("labels the two positions for client role %s", (role, plaintiffLabel, defendantLabel) => {
    render(<DisputeHarness clientRole={role} />);
    expect(screen.getByLabelText(plaintiffLabel)).toHaveAttribute("id", "plaintiff_position");
    expect(screen.getByLabelText(defendantLabel)).toHaveAttribute("id", "defendant_position");
  });

  it("has claim, facts and general notes and edits them", async () => {
    render(<DisputeHarness clientRole={null} ai={new Set(["claim"])} />);
    await userEvent.type(screen.getByLabelText("Talep / dava konusu"), "150.000 TL");
    await userEvent.type(screen.getByLabelText("Olay özeti"), "Fatura ödenmedi");
    await userEvent.type(screen.getByLabelText("Genel notlar"), "Not");
    expect(screen.getByLabelText("Talep / dava konusu")).toHaveValue("150.000 TL");
    expect(screen.getByLabelText("Olay özeti")).toHaveValue("Fatura ödenmedi");
    expect(screen.getByLabelText("Genel notlar")).toHaveValue("Not");
    expect(screen.getAllByText("AI")).toHaveLength(1);
  });
});

const lawyers = [
  { id: "u1", full_name: "Emre Yılmaz", department: "Ticaret Hukuku" },
  { id: "u2", full_name: "Kerem Demir", department: "İş Hukuku" },
];

function FollowUpHarness(props: Partial<React.ComponentProps<typeof FollowUpFields>> = {}) {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <FollowUpFields
      nextHearingDate=""
      ai={new Set()}
      onNextHearingDate={() => {}}
      lawyers={null}
      lawyerId=""
      lawyerError={undefined}
      onLawyer={() => {}}
      files={files}
      onAddFiles={(added) => setFiles((prev) => [...prev, ...added])}
      onRemoveFile={(index) => setFiles((prev) => prev.filter((_, i) => i !== index))}
      source={null}
      includeSource
      onIncludeSource={() => {}}
      events={[]}
      onToggleEvent={() => {}}
      {...props}
    />
  );
}

describe("FollowUpFields", () => {
  it("adds valid files, rejects the others with a message and removes files from the list", async () => {
    render(<FollowUpHarness />);
    const input = screen.getByLabelText("Belge ekle");
    expect(input).toHaveAttribute("accept", ".pdf,.docx,.txt");
    expect(input).toHaveAttribute("multiple");

    await userEvent.setup({ applyAccept: false }).upload(input, [new File(["a"], "beyan.txt", { type: "text/plain" }), new File(["b"], "gorsel.png", { type: "image/png" })]);

    const list = screen.getByRole("list", { name: "Eklenecek belgeler" });
    expect(within(list).getByText("beyan.txt")).toBeInTheDocument();
    expect(within(list).queryByText("gorsel.png")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("gorsel.png desteklenmeyen bir dosya türü (pdf, docx, txt).");

    await userEvent.click(screen.getByRole("button", { name: "beyan.txt dosyasını çıkar" }));
    expect(screen.queryByRole("list", { name: "Eklenecek belgeler" })).toBeNull();
  });

  it("accepts files dropped on the drop zone", () => {
    render(<FollowUpHarness />);
    const zone = screen.getByTestId("belge-birakma-alani");
    fireEvent.drop(zone, { dataTransfer: { files: [new File(["x"], "dilekce.docx")] } });
    expect(screen.getByText("dilekce.docx")).toBeInTheDocument();
  });

  it("shows the source document option only when there is a source", async () => {
    const onIncludeSource = vi.fn();
    const { rerender } = render(<FollowUpHarness onIncludeSource={onIncludeSource} />);
    expect(screen.queryByLabelText("Kaynak belgeyi davaya ekle")).toBeNull();

    rerender(<FollowUpHarness source={{ label: "dilekce.pdf" }} includeSource onIncludeSource={onIncludeSource} />);
    const checkbox = screen.getByLabelText("Kaynak belgeyi davaya ekle");
    expect(checkbox).toBeChecked();
    expect(screen.getByText(/dilekce\.pdf/)).toBeInTheDocument();
    await userEvent.click(checkbox);
    expect(onIncludeSource).toHaveBeenCalledWith(false);
  });

  it("lists the AI event suggestions with checkboxes", async () => {
    const onToggleEvent = vi.fn();
    const events: SuggestedEvent[] = [
      { key: "e1", event_date: "2026-03-02", title: "Dava açıldı", description: null, event_type: "filing", checked: true },
      { key: "e2", event_date: "2026-05-12", title: "İlk duruşma", description: null, event_type: "hearing", checked: false },
    ];
    render(<FollowUpHarness events={events} onToggleEvent={onToggleEvent} />);

    expect(screen.getByRole("heading", { name: /AI olay önerileri/ })).toBeInTheDocument();
    expect(screen.getByLabelText("02.03.2026 · Dilekçe/Başvuru · Dava açıldı")).toBeChecked();
    expect(screen.getByLabelText("12.05.2026 · Duruşma · İlk duruşma")).not.toBeChecked();
    await userEvent.click(screen.getByLabelText("12.05.2026 · Duruşma · İlk duruşma"));
    expect(onToggleEvent).toHaveBeenCalledWith("e2", true);
  });

  it("has the next hearing date and, for admins only, the responsible lawyer", async () => {
    const onLawyer = vi.fn();
    const { rerender } = render(<FollowUpHarness ai={new Set(["next_hearing_date"])} />);
    expect(screen.getByLabelText("Sonraki duruşma tarihi")).toBeInTheDocument();
    expect(screen.getAllByText("AI")).toHaveLength(1);
    expect(screen.queryByLabelText(/^Sorumlu avukat/)).toBeNull();

    rerender(<FollowUpHarness lawyers={lawyers as never} lawyerError="Sorumlu avukat seçin." onLawyer={onLawyer} />);
    const select = screen.getByLabelText(/^Sorumlu avukat/) as HTMLSelectElement;
    expect([...select.options].map((option) => option.text)).toEqual(["Avukat seçin", "Emre Yılmaz · Ticaret Hukuku", "Kerem Demir · İş Hukuku"]);
    expect(screen.getByText("Sorumlu avukat seçin.")).toBeInTheDocument();
    await userEvent.selectOptions(select, "u2");
    expect(onLawyer).toHaveBeenCalledWith("u2");
  });
});

describe("accessibility details", () => {
  it("exposes required state on required fields and the party name", () => {
    render(<BasicHarness />);
    for (const label of [/^Dava no/, /^Dava adı/, /^Dava türü/]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("aria-required", "true");
    }
    expect(screen.getByLabelText("Mahkeme")).not.toHaveAttribute("aria-required");
    render(<PartiesHarness />);
    expect(within(screen.getByRole("group", { name: "Taraf 1" })).getByLabelText(/^Ad/)).toHaveAttribute("aria-required", "true");
  });

  it("associates the party name error and announces the list error", () => {
    const rows = [newPartyRow("plaintiff"), newPartyRow("defendant")];
    render(<PartiesHarness initial={rows} error="En az bir taraf müvekkil olarak işaretlenmeli." partyErrors={{ [rows[1].key]: "Taraf adı gerekli." }} />);
    const input = within(screen.getByRole("group", { name: "Taraf 2" })).getByLabelText(/^Ad/);
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent("Taraf adı gerekli.");
    expect(within(screen.getByRole("group", { name: "Taraf 1" })).getByLabelText(/^Ad/)).not.toHaveAttribute("aria-describedby");
    expect(screen.getByRole("alert")).toHaveTextContent("En az bir taraf müvekkil olarak işaretlenmeli.");
  });

  it("renders a message per rejected file even when the same file is rejected twice, without key warnings", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<FollowUpHarness />);
    const bad = () => new File(["b"], "gorsel.png", { type: "image/png" });
    await userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText("Belge ekle"), [bad(), bad()]);
    expect(screen.getAllByText("gorsel.png desteklenmeyen bir dosya türü (pdf, docx, txt).")).toHaveLength(2);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
