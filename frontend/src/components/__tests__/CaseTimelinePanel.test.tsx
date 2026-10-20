import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const addCaseEvent = vi.fn();
vi.mock("@/lib/api", () => ({ addCaseEvent: (...args: unknown[]) => addCaseEvent(...args) }));

import { CaseTimelinePanel } from "@/components/CaseTimelinePanel";
import { ApiError } from "@/lib/apiError";
import type { CaseEvent } from "@/types";

const entry = (over: Partial<CaseEvent>): CaseEvent => ({
  id: "e1", event_date: "2026-01-12", title: "Dava açıldı", description: null, event_type: "filing",
  created_by: null, created_by_name: null, created_at: "2026-01-12T10:00:00", ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("CaseTimelinePanel", () => {
  it("shows each entry with its type badge and description", () => {
    // readOnly: no form, so the type select's options do not duplicate the badge texts.
    render(<CaseTimelinePanel caseId="c1" readOnly onAdded={vi.fn()} timeline={[
      entry({}),
      entry({ id: "e2", title: "Müvekkil aradı", event_type: "note" }),
      entry({ id: "e3", title: "Rapor", description: "Kusur oranı %70", event_type: "expert_report" }),
    ]} />);
    expect(screen.getByText("Dava açılışı / dilekçe")).toBeInTheDocument();
    expect(screen.getByText("Not")).toBeInTheDocument();
    expect(screen.getByText("Bilirkişi raporu")).toBeInTheDocument();
    expect(screen.getByText("Kusur oranı %70")).toBeInTheDocument();
  });

  it("renders entries in date order even when given out of order", () => {
    render(<CaseTimelinePanel caseId="c1" readOnly onAdded={vi.fn()} timeline={[
      entry({ id: "e3", title: "Üçüncü", event_date: "2026-03-01" }),
      entry({ id: "e1", title: "Birinci", event_date: "2026-01-01" }),
      entry({ id: "e2b", title: "İkinci-b", event_date: "2026-02-01", created_at: "2026-02-01T12:00:00" }),
      entry({ id: "e2a", title: "İkinci-a", event_date: "2026-02-01", created_at: "2026-02-01T09:00:00" }),
    ]} />);
    const titles = screen.getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);
    expect(titles).toEqual(["Birinci", "İkinci-a", "İkinci-b", "Üçüncü"]);
  });

  it("offers the five form types, defaulting to Diğer", () => {
    render(<CaseTimelinePanel caseId="c1" readOnly={false} onAdded={vi.fn()} timeline={[]} />);
    const select = screen.getByLabelText("Tür") as HTMLSelectElement;
    expect(select.value).toBe("other");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "Dava açılışı / dilekçe", "Beyan / cevap", "Bilirkişi raporu", "Mevzuat / içtihat gelişmesi", "Diğer",
    ]);
    expect(screen.getByText("Henüz gelişme yok.")).toBeInTheDocument();
  });

  it("sends type and description and hands the new entry up", async () => {
    const created = entry({ id: "e9", title: "Rapor geldi", event_type: "expert_report", description: "Ayrıntı" });
    addCaseEvent.mockResolvedValue(created);
    const onAdded = vi.fn();
    render(<CaseTimelinePanel caseId="c1" readOnly={false} onAdded={onAdded} timeline={[]} />);

    await userEvent.type(screen.getByLabelText("Tarih"), "2026-03-01");
    await userEvent.type(screen.getByLabelText("Gelişme Başlığı"), "Rapor geldi");
    await userEvent.selectOptions(screen.getByLabelText("Tür"), "expert_report");
    await userEvent.type(screen.getByLabelText("Açıklama"), "Ayrıntı");
    await userEvent.click(screen.getByRole("button", { name: "Ekle" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(created));
    expect(addCaseEvent).toHaveBeenCalledWith("c1", {
      event_date: "2026-03-01", title: "Rapor geldi", event_type: "expert_report", description: "Ayrıntı",
    });
    expect((screen.getByLabelText("Gelişme Başlığı") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Tür") as HTMLSelectElement).value).toBe("other");
  });

  it("omits an empty description, shows ApiError text and ignores a second click while saving", async () => {
    let reject: (error: unknown) => void = () => {};
    addCaseEvent.mockReturnValue(new Promise((_, r) => { reject = r; }));
    render(<CaseTimelinePanel caseId="c1" readOnly={false} onAdded={vi.fn()} timeline={[]} />);
    await userEvent.type(screen.getByLabelText("Tarih"), "2026-03-01");
    await userEvent.type(screen.getByLabelText("Gelişme Başlığı"), "Dilekçe verildi");
    const button = screen.getByRole("button", { name: "Ekle" });
    await userEvent.click(button);
    await userEvent.click(screen.getByRole("button", { name: "Ekleniyor..." }));
    expect(addCaseEvent).toHaveBeenCalledTimes(1);
    expect(addCaseEvent.mock.calls[0][1]).toEqual({ event_date: "2026-03-01", title: "Dilekçe verildi", event_type: "other" });
    reject(new ApiError("Gelişme başlığı boş olamaz.", 422));
    expect(await screen.findByText("Gelişme başlığı boş olamaz.")).toBeInTheDocument();
  });

  it("hides the form on an archived case", () => {
    render(<CaseTimelinePanel caseId="c1" readOnly onAdded={vi.fn()} timeline={[entry({})]} />);
    expect(screen.queryByLabelText("Gelişme Başlığı")).toBeNull();
    expect(screen.getByText("Dava açıldı")).toBeInTheDocument();
  });
});
