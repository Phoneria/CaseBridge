import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const addCaseEvent = vi.fn();
const updateCaseNote = vi.fn();
const deleteCaseNote = vi.fn();
vi.mock("@/lib/api", () => ({
  addCaseEvent: (...args: unknown[]) => addCaseEvent(...args),
  updateCaseNote: (...args: unknown[]) => updateCaseNote(...args),
  deleteCaseNote: (...args: unknown[]) => deleteCaseNote(...args),
}));

import { CaseNotesPanel } from "@/components/CaseNotesPanel";
import { ApiError } from "@/lib/apiError";
import { todayLocalISO } from "@/lib/closing";
import type { CaseEvent } from "@/types";

const author = { id: "u-author", role: "lawyer" as const };
const stranger = { id: "u-x", role: "lawyer" as const };
const note = (over: Partial<CaseEvent>): CaseEvent => ({
  id: "n1", event_date: "2026-10-01", title: "Müvekkil aradı.", description: "Müvekkil aradı.\nYarın dönülecek.",
  event_type: "note", created_by: "u-author", created_by_name: "Ayşe Avukat", created_at: "2026-10-01T09:00:00", ...over,
});

function setup(props: Partial<React.ComponentProps<typeof CaseNotesPanel>> = {}) {
  const handlers = { onAdded: vi.fn(), onUpdated: vi.fn(), onDeleted: vi.fn() };
  render(<CaseNotesPanel caseId="c1" notes={[note({})]} me={author} assignedLawyerId="u-owner" readOnly={false} {...handlers} {...props} />);
  return handlers;
}

beforeEach(() => vi.clearAllMocks());

describe("CaseNotesPanel", () => {
  it("lists notes newest first with author and full text", () => {
    setup({ notes: [note({}), note({ id: "n2", event_date: "2026-10-05", description: "Daha yeni", title: "Daha yeni", created_by_name: null })] });
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Daha yeni");
    expect(items[0]).not.toHaveTextContent("—");
    expect(items[1]).toHaveTextContent("— Ayşe Avukat");
    expect(items[1]).toHaveTextContent("Yarın dönülecek.");
  });

  it("adds a note dated today by default", async () => {
    const created = note({ id: "n9", description: "Yeni not", title: "Yeni not" });
    addCaseEvent.mockResolvedValue(created);
    const { onAdded } = setup({ notes: [] });
    expect(screen.getByText("Henüz not eklenmedi.")).toBeInTheDocument();
    expect((screen.getByLabelText("Tarih") as HTMLInputElement).value).toBe(todayLocalISO());

    await userEvent.type(screen.getByLabelText("Not"), "  Yeni not ");
    await userEvent.click(screen.getByRole("button", { name: "Not ekle" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(created));
    expect(addCaseEvent).toHaveBeenCalledWith("c1", { event_date: todayLocalISO(), event_type: "note", description: "Yeni not" });
    expect((screen.getByLabelText("Not") as HTMLTextAreaElement).value).toBe("");
  });

  it("refuses an empty note without calling the API and shows the counter", async () => {
    setup({ notes: [] });
    expect(screen.getByText("0/4000")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Not"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Not ekle" }));
    expect(await screen.findByText("Not metni boş olamaz.")).toBeInTheDocument();
    expect(addCaseEvent).not.toHaveBeenCalled();
  });

  it("edits a note in place", async () => {
    const updated = note({ description: "Düzeltilmiş", title: "Düzeltilmiş" });
    updateCaseNote.mockResolvedValue(updated);
    const { onUpdated } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Düzenle" }));
    const editor = screen.getByLabelText("Notu düzenle") as HTMLTextAreaElement;
    expect(editor.value).toBe("Müvekkil aradı.\nYarın dönülecek.");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Düzeltilmiş");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(updated));
    expect(updateCaseNote).toHaveBeenCalledWith("c1", "n1", { description: "Düzeltilmiş", event_date: "2026-10-01" });
    expect(screen.queryByLabelText("Notu düzenle")).toBeNull();
  });

  it("keeps the editor open and shows the API message when saving fails", async () => {
    updateCaseNote.mockRejectedValue(new ApiError("Bu notu yalnızca yazan kişi, sorumlu avukat veya yönetici değiştirebilir.", 403));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Düzenle" }));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByText("Bu notu yalnızca yazan kişi, sorumlu avukat veya yönetici değiştirebilir.")).toBeInTheDocument();
    expect(screen.getByLabelText("Notu düzenle")).toBeInTheDocument();
  });

  it("deletes after confirmation", async () => {
    deleteCaseNote.mockResolvedValue(undefined);
    const { onDeleted } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Sil" }));
    const dialog = screen.getByRole("dialog", { name: "Not silinsin mi?" });
    expect(dialog).toHaveTextContent("Bu işlem geri alınamaz.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sil" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("n1"));
    expect(deleteCaseNote).toHaveBeenCalledWith("c1", "n1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the fallback when deleting fails with a non-API error", async () => {
    deleteCaseNote.mockRejectedValue(new Error("network"));
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Sil" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sil" }));
    expect(await screen.findByText("Not silinemedi. Lütfen tekrar deneyin.")).toBeInTheDocument();
  });

  it("offers no edit or delete to someone who may not change the note", () => {
    setup({ me: stranger });
    expect(screen.queryByRole("button", { name: "Düzenle" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sil" })).toBeNull();
  });

  it("is read-only on an archived case", () => {
    setup({ readOnly: true });
    expect(screen.queryByLabelText("Not")).toBeNull();
    expect(screen.queryByRole("button", { name: "Düzenle" })).toBeNull();
    expect(screen.getByText(/Yarın dönülecek/)).toBeInTheDocument();
  });
});
