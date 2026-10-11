import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const closeCase = vi.fn();
const uploadDocument = vi.fn();
vi.mock("@/lib/api", () => ({
  closeCase: (...args: unknown[]) => closeCase(...args),
  uploadDocument: (...args: unknown[]) => uploadDocument(...args),
}));

import { CaseCloseModal } from "@/components/CaseCloseModal";
import { ApiError } from "@/lib/apiError";
import { todayLocalISO } from "@/lib/closing";
import type { Case } from "@/types";

const closed = { id: "c1", status: "kapali", outcome: "won" } as unknown as Case;

function renderModal(props: { pendingTaskCount?: number; onClose?: () => void; onClosed?: (result: unknown) => void } = {}) {
  const onClose = props.onClose ?? vi.fn();
  const onClosed = props.onClosed ?? vi.fn();
  render(<CaseCloseModal caseId="c1" pendingTaskCount={props.pendingTaskCount ?? 0} onClose={onClose} onClosed={onClosed} />);
  return { onClose, onClosed };
}

const pdf = () => new File(["%PDF"], "karar.pdf", { type: "application/pdf" });

beforeEach(() => {
  closeCase.mockReset();
  uploadDocument.mockReset();
});

describe("CaseCloseModal", () => {
  it("is a dialog with the outcome choices, today's date and a note", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: "Davayı kapat" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("radio", { name: "Kazanıldı" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Kaybedildi" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Sulh" })).toBeInTheDocument();
    const date = screen.getByLabelText("Karar tarihi");
    expect(date).toHaveValue(todayLocalISO());
    expect(date).toHaveAttribute("max", todayLocalISO());
    expect(screen.getByLabelText("Karar notu")).toHaveValue("");
    expect(screen.getByLabelText("Karar belgesi ekle")).toHaveAttribute("type", "file");
  });

  it("warns about pending tasks without blocking", async () => {
    closeCase.mockResolvedValue(closed);
    renderModal({ pendingTaskCount: 2 });
    expect(screen.getByText("Bu davada 2 bekleyen görev var.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Sulh" }));
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));
    await waitFor(() => expect(closeCase).toHaveBeenCalledTimes(1));
  });

  it("shows no warning without pending tasks", () => {
    renderModal();
    expect(screen.queryByText(/bekleyen görev var/)).toBeNull();
  });

  it("asks for an outcome before sending", async () => {
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));
    expect(screen.getByText("Sonuç seçin.")).toBeInTheDocument();
    expect(closeCase).not.toHaveBeenCalled();
  });

  it("rejects a future date", async () => {
    renderModal();
    await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
    const date = screen.getByLabelText("Karar tarihi");
    await userEvent.clear(date);
    await userEvent.type(date, "2999-01-01");
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));
    expect(screen.getByText("Karar tarihi ileri bir tarih olamaz.")).toBeInTheDocument();
    expect(closeCase).not.toHaveBeenCalled();
  });

  it("closes the case with the outcome, date and trimmed note and reports it", async () => {
    closeCase.mockResolvedValue(closed);
    const { onClosed } = renderModal();
    await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
    await userEvent.type(screen.getByLabelText("Karar notu"), "  Karar tebliğ edildi.  ");
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledWith({ updated: closed, documentFailed: false }));
    expect(closeCase).toHaveBeenCalledWith("c1", { outcome: "won", decision_date: todayLocalISO(), note: "Karar tebliğ edildi." });
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it("uploads the decision document after closing", async () => {
    closeCase.mockResolvedValue(closed);
    uploadDocument.mockResolvedValue({ id: "d1" });
    const { onClosed } = renderModal();
    await userEvent.click(screen.getByRole("radio", { name: "Kaybedildi" }));
    await userEvent.upload(screen.getByLabelText("Karar belgesi ekle"), pdf());
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledWith({ updated: closed, documentFailed: false }));
    expect(uploadDocument).toHaveBeenCalledWith("c1", expect.objectContaining({ name: "karar.pdf" }));
    expect(closeCase.mock.invocationCallOrder[0]).toBeLessThan(uploadDocument.mock.invocationCallOrder[0]);
  });

  it("reports the case as closed when only the document upload fails", async () => {
    closeCase.mockResolvedValue(closed);
    uploadDocument.mockRejectedValue(new Error("boom"));
    const { onClosed } = renderModal();
    await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
    await userEvent.upload(screen.getByLabelText("Karar belgesi ekle"), pdf());
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));

    await waitFor(() => expect(onClosed).toHaveBeenCalledWith({ updated: closed, documentFailed: true }));
  });

  it("refuses an unsupported or oversized file before anything is sent", async () => {
    renderModal();
    const input = screen.getByLabelText("Karar belgesi ekle");
    await userEvent.upload(input, new File(["x"], "karar.exe"), { applyAccept: false });
    expect(screen.getByRole("alert")).toHaveTextContent("karar.exe desteklenmeyen bir dosya türü (pdf, docx, txt).");

    const big = new File(["x"], "büyük.pdf");
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    await userEvent.upload(input, big);
    expect(screen.getByRole("alert")).toHaveTextContent("büyük.pdf 10 MB sınırını aşıyor.");
    expect(closeCase).not.toHaveBeenCalled();
  });

  it("shows the server's message and stays open when closing fails", async () => {
    closeCase.mockRejectedValueOnce(new ApiError("Dava zaten kapalı.", 409));
    const { onClosed } = renderModal();
    await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Dava zaten kapalı.");
    expect(onClosed).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("falls back to a Turkish message for other failures", async () => {
    closeCase.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderModal();
    await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Dava kapatılamadı. Lütfen tekrar deneyin.");
  });

  it("sends once on a double click and locks Vazgeç and Escape meanwhile", async () => {
    let resolve!: (value: Case) => void;
    closeCase.mockReturnValue(new Promise<Case>((r) => (resolve = r)));
    const { onClose, onClosed } = renderModal();
    await userEvent.click(screen.getByRole("radio", { name: "Kazanıldı" }));
    await userEvent.click(screen.getByRole("button", { name: "Davayı kapat" }));
    await userEvent.click(screen.getByRole("button", { name: "Kapatılıyor..." }));
    expect(closeCase).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Kapatılıyor..." })).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();

    resolve(closed);
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
  });

  it("closes on Vazgeç without sending", async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(closeCase).not.toHaveBeenCalled();
  });
});
