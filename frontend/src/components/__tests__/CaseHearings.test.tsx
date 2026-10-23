import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createCalendarEvent = vi.fn();
const updateCalendarEvent = vi.fn();
const deleteCalendarEvent = vi.fn();
const recordHearingResult = vi.fn();

vi.mock("@/lib/api", () => ({
  createCalendarEvent: (...args: unknown[]) => createCalendarEvent(...args),
  updateCalendarEvent: (...args: unknown[]) => updateCalendarEvent(...args),
  deleteCalendarEvent: (...args: unknown[]) => deleteCalendarEvent(...args),
  recordHearingResult: (...args: unknown[]) => recordHearingResult(...args),
}));

import { CaseHearingsCard } from "@/components/CaseHearingsCard";
import { ApiError } from "@/lib/apiError";
import type { CaseHearing } from "@/types";

function hearing(overrides: Partial<CaseHearing> = {}): CaseHearing {
  return {
    id: "h1", starts_at: "2099-01-05T10:30:00", all_day: false, duration_minutes: 60, location: "3. Asliye Hukuk",
    notes: null, assignee_id: "u1", result_note: null, is_past: false, result_open: false, ...overrides,
  };
}
const upcoming = hearing();
const pastNoResult = hearing({ id: "h2", starts_at: "2001-02-03T00:00:00", all_day: true, location: null, is_past: true, result_open: true });
const pastWithResult = hearing({ id: "h3", starts_at: "2002-02-03T09:00:00", is_past: true, result_open: true, result_note: "Bilirkişi atandı." });
const today = hearing({ id: "h4", starts_at: "2003-04-05T09:00:00", is_past: false, result_open: true });
const open = { id: "c1", assigned_lawyer_id: "u1", status: "devam_eden" as const };

const onChanged = vi.fn();
function renderCard(props: Partial<React.ComponentProps<typeof CaseHearingsCard>> = {}) {
  return render(<CaseHearingsCard caseDetail={open} hearings={[upcoming, pastNoResult, pastWithResult]} readOnly={false} onChanged={onChanged} {...props} />);
}

beforeEach(() => {
  [createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, recordHearingResult, onChanged].forEach((fn) => fn.mockReset());
});

describe("CaseHearingsCard", () => {
  it("lists upcoming and past hearings with time, place and result", () => {
    renderCard();
    const card = screen.getByRole("region", { name: "Duruşmalar" });
    expect(card).toHaveAttribute("id", "durusmalar");
    expect(card).toHaveTextContent("Yaklaşan");
    expect(card).toHaveTextContent("05.01.2099 · 10:30");
    expect(card).toHaveTextContent("3. Asliye Hukuk");
    expect(card).toHaveTextContent("Geçmiş");
    expect(card).toHaveTextContent("03.02.2001 · Tüm gün");
    expect(card).toHaveTextContent("Sonuç girilmedi");
    expect(card).toHaveTextContent("Sonuç: Bilirkişi atandı.");
  });

  it("shows the result line on today's hearing too, once a result can be entered", () => {
    renderCard({ hearings: [today, hearing({ id: "h5", starts_at: "2003-04-06T09:00:00", result_open: true, result_note: "Ertelendi." }), upcoming] });
    const card = screen.getByRole("region", { name: "Duruşmalar" });
    expect(card).toHaveTextContent("Sonuç girilmedi");
    expect(card).toHaveTextContent("Sonuç: Ertelendi.");
    expect(within(card).getAllByText(/Sonuç(:| girilmedi)/)).toHaveLength(2); // not on the upcoming row
  });

  it("shows an empty state", () => {
    renderCard({ hearings: [] });
    expect(screen.getByText("Henüz duruşma yok.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duruşma ekle" })).toBeInTheDocument();
  });

  it("offers the result button only once the hearing day has come", () => {
    renderCard({ hearings: [upcoming, today, pastWithResult] });
    expect(screen.getAllByRole("button", { name: "Sonuç gir" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Sonucu düzenle" })).toHaveLength(1);
  });

  it("hides every action on an archived case", () => {
    renderCard({ readOnly: true });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Duruşmalar" })).toHaveTextContent("05.01.2099 · 10:30");
  });

  it("hides 'Duruşma ekle' and the next-hearing option on a closed case but keeps edit, delete and result", async () => {
    renderCard({ caseDetail: { ...open, status: "kapali" } });
    expect(screen.queryByRole("button", { name: "Duruşma ekle" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Düzenle" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Sil" }).length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole("button", { name: "Sonuç gir" })[0]);
    expect(screen.getByRole("dialog", { name: "Sonuç gir" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Sonraki duruşmayı ekle")).not.toBeInTheDocument();
  });

  it("adds a hearing for the case with the lawyer as assignee and the default reminders", async () => {
    createCalendarEvent.mockResolvedValue({ id: "new" });
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Duruşma ekle" }));
    const dialog = screen.getByRole("dialog", { name: "Duruşma ekle" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(within(dialog).getByText("Tarih zorunludur.")).toBeInTheDocument();
    expect(createCalendarEvent).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText("Tarih"), "2099-03-04");
    await userEvent.clear(within(dialog).getByLabelText("Saat"));
    await userEvent.type(within(dialog).getByLabelText("Saat"), "14:15");
    await userEvent.type(within(dialog).getByLabelText("Salon / yer"), " Salon 5 ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(createCalendarEvent).toHaveBeenCalledTimes(1));
    expect(createCalendarEvent).toHaveBeenCalledWith({
      title: "Duruşma", event_type: "hearing", case_id: "c1", assignee_id: "u1", reminder_days: [3, 1],
      starts_at: "2099-03-04T14:15:00", all_day: false, duration_minutes: 60, location: "Salon 5", notes: null,
    });
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("edits a hearing and shows only the API message, or the Turkish fallback", async () => {
    updateCalendarEvent.mockRejectedValueOnce(new ApiError("Arşivli davada değişiklik yapılamaz.", 409));
    updateCalendarEvent.mockRejectedValueOnce(new Error("Failed to fetch"));
    renderCard();
    await userEvent.click(screen.getAllByRole("button", { name: "Düzenle" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Duruşmayı düzenle" });
    expect(within(dialog).getByLabelText("Tarih")).toHaveValue("2099-01-05");
    expect(within(dialog).getByLabelText("Saat")).toHaveValue("10:30");

    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Arşivli davada değişiklik yapılamaz.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("Duruşma kaydedilemedi. Lütfen tekrar deneyin."));
    expect(updateCalendarEvent).toHaveBeenCalledWith("h1", expect.objectContaining({ starts_at: "2099-01-05T10:30:00", all_day: false }));
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("ignores a second click while saving", async () => {
    let finish: (value: unknown) => void = () => undefined;
    updateCalendarEvent.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderCard();
    await userEvent.click(screen.getAllByRole("button", { name: "Düzenle" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Duruşmayı düzenle" });
    const save = within(dialog).getByRole("button", { name: "Kaydet" });
    await userEvent.click(save);
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydediliyor..." }));
    expect(updateCalendarEvent).toHaveBeenCalledTimes(1);
    finish({});
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("deletes a hearing after confirmation", async () => {
    deleteCalendarEvent.mockResolvedValue(undefined);
    renderCard();
    await userEvent.click(screen.getAllByRole("button", { name: "Sil" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Duruşma silinsin mi?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Sil" }));

    await waitFor(() => expect(deleteCalendarEvent).toHaveBeenCalledWith("h1"));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("keeps the delete dialog open with the fallback message when deleting fails", async () => {
    deleteCalendarEvent.mockRejectedValue(new Error("x"));
    renderCard();
    await userEvent.click(screen.getAllByRole("button", { name: "Sil" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Duruşma silinsin mi?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Sil" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Duruşma silinemedi. Lütfen tekrar deneyin.");
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("CaseHearingResultModal (through the card)", () => {
  async function openResult(index = 0) {
    renderCard();
    await userEvent.click(screen.getAllByRole("button", { name: "Sonuç gir" })[index]);
    return screen.getByRole("dialog", { name: "Sonuç gir" });
  }

  it("requires a note before saving", async () => {
    const dialog = await openResult();
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(within(dialog).getByText("Sonuç notu gerekli.")).toBeInTheDocument();
    expect(recordHearingResult).not.toHaveBeenCalled();
  });

  it("saves the trimmed note alone", async () => {
    recordHearingResult.mockResolvedValue({ hearing: pastNoResult, next_hearing: null });
    const dialog = await openResult();
    await userEvent.type(within(dialog).getByLabelText("Sonuç / ara karar notu"), "  Bilirkişi atandı.  ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(recordHearingResult).toHaveBeenCalledWith("h2", { result_note: "Bilirkişi atandı." }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("adds the next hearing in the same request, validating its date", async () => {
    recordHearingResult.mockResolvedValue({ hearing: pastNoResult, next_hearing: upcoming });
    const dialog = await openResult();
    await userEvent.type(within(dialog).getByLabelText("Sonuç / ara karar notu"), "Ertelendi.");
    await userEvent.click(within(dialog).getByLabelText("Sonraki duruşmayı ekle"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(within(dialog).getByText("Tarih zorunludur.")).toBeInTheDocument();
    expect(recordHearingResult).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText("Tarih"), "2099-06-01");
    await userEvent.click(within(dialog).getByLabelText("Tüm gün"));
    await userEvent.type(within(dialog).getByLabelText("Salon / yer"), "Salon 2");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(recordHearingResult).toHaveBeenCalledWith("h2", {
      result_note: "Ertelendi.",
      next_hearing: { starts_at: "2099-06-01T00:00:00", all_day: true, duration_minutes: 60, location: "Salon 2" },
    }));
  });

  it("shows the API message or the Turkish fallback when saving fails", async () => {
    recordHearingResult.mockRejectedValueOnce(new ApiError("Sonuç yalnızca tarihi gelmiş duruşmalara girilebilir.", 422));
    recordHearingResult.mockRejectedValueOnce(new Error("boom"));
    const dialog = await openResult();
    await userEvent.type(within(dialog).getByLabelText("Sonuç / ara karar notu"), "Not");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Sonuç yalnızca tarihi gelmiş duruşmalara girilebilir.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("Sonuç kaydedilemedi. Lütfen tekrar deneyin."));
  });

  it("prefills the existing note when editing a result", async () => {
    renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Sonucu düzenle" }));
    const dialog = screen.getByRole("dialog", { name: "Sonucu düzenle" });
    expect(within(dialog).getByLabelText("Sonuç / ara karar notu")).toHaveValue("Bilirkişi atandı.");
  });
});
