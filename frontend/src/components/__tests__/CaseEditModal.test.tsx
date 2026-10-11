import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateCase = vi.fn();
vi.mock("@/lib/api", () => ({
  updateCase: (...args: unknown[]) => updateCase(...args),
}));

import { CaseEditModal } from "@/components/CaseEditModal";
import { ApiError } from "@/lib/apiError";
import type { Case } from "@/types";

const openCase = {
  id: "c1",
  case_number: "2026/7",
  case_name: "Tahliye Davası",
  case_type: "kira",
  court: "Ankara 3. Asliye Hukuk",
  court_file_number: "2026/7 E.",
  opening_date: "2026-02-03",
  case_value: 125000,
  status: "durusma_bekleyen",
  outcome: "ongoing",
} as unknown as Case;
const closedCase = { ...openCase, status: "kapali", outcome: "won" } as unknown as Case;

function renderModal(caseDetail: Case = openCase, props: { onClose?: () => void; onSaved?: (updated: Case) => void } = {}) {
  const onClose = props.onClose ?? vi.fn();
  const onSaved = props.onSaved ?? vi.fn();
  render(<CaseEditModal caseDetail={caseDetail} onClose={onClose} onSaved={onSaved} />);
  return { onClose, onSaved };
}

beforeEach(() => updateCase.mockReset());

describe("CaseEditModal", () => {
  it("is a modal dialog titled Bilgileri düzenle with the current values", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Bilgileri düzenle" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText(/^Dava adı/)).toHaveValue("Tahliye Davası");
    expect(screen.getByLabelText(/^Dava türü/)).toHaveValue("kira");
    expect(screen.getByLabelText("Mahkeme")).toHaveValue("Ankara 3. Asliye Hukuk");
    expect(screen.getByLabelText("Esas no")).toHaveValue("2026/7 E.");
    expect(screen.getByLabelText("Dava tarihi")).toHaveValue("2026-02-03");
    expect(screen.getByLabelText("Dava değeri")).toHaveValue(125000);
    expect(screen.getByLabelText("Durum")).toHaveValue("durusma_bekleyen");
  });

  it("shows the case number read-only", async () => {
    renderModal();
    const number = screen.getByLabelText("Dava no");
    expect(number).toHaveValue("2026/7");
    expect(number).toHaveAttribute("readonly");
    await userEvent.type(number, "9");
    expect(number).toHaveValue("2026/7");
  });

  it("offers only the open statuses", () => {
    renderModal();
    const status = screen.getByLabelText("Durum") as HTMLSelectElement;
    expect([...status.options].map((option) => option.text)).toEqual(["Devam Eden", "Duruşma Bekleyen", "Karar Bekleyen"]);
  });

  it("has no status field for a closed case and does not send one", async () => {
    updateCase.mockResolvedValue(closedCase);
    renderModal(closedCase);
    expect(screen.queryByLabelText("Durum")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(updateCase).toHaveBeenCalledTimes(1));
    expect(updateCase.mock.calls[0][1]).not.toHaveProperty("status");
  });

  it("saves the edited fields and reports the updated case", async () => {
    const updated = { ...openCase, case_name: "Yeni Ad" } as Case;
    updateCase.mockResolvedValue(updated);
    const { onSaved } = renderModal();

    const name = screen.getByLabelText(/^Dava adı/);
    await userEvent.clear(name);
    await userEvent.type(name, "  Yeni Ad  ");
    await userEvent.selectOptions(screen.getByLabelText(/^Dava türü/), "icra");
    await userEvent.selectOptions(screen.getByLabelText("Durum"), "karar_bekleyen");
    await userEvent.clear(screen.getByLabelText("Mahkeme"));
    await userEvent.clear(screen.getByLabelText("Dava değeri"));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    expect(updateCase).toHaveBeenCalledWith("c1", {
      case_name: "Yeni Ad",
      case_type: "icra",
      court: null,
      court_file_number: "2026/7 E.",
      case_value: null,
      opening_date: "2026-02-03",
      status: "karar_bekleyen",
    });
  });

  it("validates before sending", async () => {
    renderModal();
    await userEvent.clear(screen.getByLabelText(/^Dava adı/));
    await userEvent.clear(screen.getByLabelText("Dava tarihi"));
    await userEvent.clear(screen.getByLabelText("Dava değeri"));
    await userEvent.type(screen.getByLabelText("Dava değeri"), "-5");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(screen.getByText("Dava adı gerekli.")).toBeInTheDocument();
    expect(screen.getByText("Dava tarihi gerekli.")).toBeInTheDocument();
    expect(screen.getByText("Dava değeri geçerli bir sayı olmalı.")).toBeInTheDocument();
    expect(updateCase).not.toHaveBeenCalled();
  });

  it("shows the server's message in an alert and stays open", async () => {
    updateCase.mockRejectedValueOnce(new ApiError("Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.", 409));
    const { onSaved } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Arşivlenmiş dava değiştirilemez. Önce arşivden çıkarın.");
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a Turkish fallback, never the raw message, for other failures", async () => {
    updateCase.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Dava bilgileri kaydedilemedi. Lütfen tekrar deneyin.");
    expect(alert).not.toHaveTextContent("Failed to fetch");
  });

  it("sends once when Kaydet is clicked twice and locks Vazgeç and Escape while saving", async () => {
    let resolve!: (value: Case) => void;
    updateCase.mockReturnValue(new Promise<Case>((r) => (resolve = r)));
    const { onClose, onSaved } = renderModal();

    const save = screen.getByRole("button", { name: "Kaydet" });
    await userEvent.click(save);
    await userEvent.click(screen.getByRole("button", { name: "Kaydediliyor..." }));
    expect(updateCase).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Kaydediliyor..." })).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();

    resolve(openCase);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it("closes on Vazgeç without saving", async () => {
    const { onClose } = renderModal();
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateCase).not.toHaveBeenCalled();
  });
});
