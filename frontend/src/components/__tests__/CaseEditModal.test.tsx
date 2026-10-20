import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateCase = vi.fn();
const listAdminLawyers = vi.fn();
const assignCaseLawyer = vi.fn();
vi.mock("@/lib/api", () => ({
  updateCase: (...args: unknown[]) => updateCase(...args),
  listAdminLawyers: (...args: unknown[]) => listAdminLawyers(...args),
  assignCaseLawyer: (...args: unknown[]) => assignCaseLawyer(...args),
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
  assigned_lawyer_id: "u-owner",
  assigned_lawyer_name: "Ayşe Avukat",
} as unknown as Case;
const CASE = openCase;
const closedCase = { ...openCase, status: "kapali", outcome: "won" } as unknown as Case;

function renderModal(overrides: Partial<ComponentProps<typeof CaseEditModal>> = {}) {
  const onSaved = vi.fn();
  const onUpdated = vi.fn();
  render(<CaseEditModal caseDetail={CASE} isAdmin={false} onClose={vi.fn()} onSaved={onSaved} onUpdated={onUpdated} {...overrides} />);
  return { onSaved, onUpdated, onClose: overrides.onClose as ReturnType<typeof vi.fn> };
}
beforeEach(() => {
  updateCase.mockReset();
  listAdminLawyers.mockReset();
  assignCaseLawyer.mockReset();
});

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
    renderModal({ caseDetail: closedCase });
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
    const onClose = vi.fn();
    const { onSaved } = renderModal({ onClose });

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
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateCase).not.toHaveBeenCalled();
  });

  it("blocks saving while the browser cannot read the typed value, and sends null only once the field is really cleared", async () => {
    updateCase.mockResolvedValue(openCase);
    renderModal();
    const value = screen.getByLabelText("Dava değeri") as HTMLInputElement;
    // A number input that holds e.g. "12-" reports value "" and validity.badInput (jsdom never sets it).
    const badInput = (bad: boolean) => {
      Object.defineProperty(value, "validity", { configurable: true, value: { badInput: bad, valid: !bad } });
      fireEvent.input(value, { target: { value: "" } });
    };

    badInput(true);
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByText("Geçerli bir tutar girin.")).toBeInTheDocument();
    expect(updateCase).not.toHaveBeenCalled();

    badInput(false);
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(updateCase).toHaveBeenCalledTimes(1));
    expect(updateCase.mock.calls[0][1]).toMatchObject({ case_value: null });
  });
});

describe("responsible lawyer (admin)", () => {
  const lawyers = [
    { id: "u-owner", full_name: "Ayşe Avukat", role: "lawyer" },
    { id: "u-2", full_name: "Zeynep Arslan", role: "lawyer" },
  ];

  it("is not shown to a lawyer", () => {
    renderModal({ isAdmin: false });
    expect(screen.queryByLabelText("Sorumlu avukat")).toBeNull();
    expect(listAdminLawyers).not.toHaveBeenCalled();
  });

  it("saves the details, then the new lawyer, then closes", async () => {
    listAdminLawyers.mockResolvedValue(lawyers);
    updateCase.mockResolvedValue({ ...CASE, case_name: "Yeni ad" });
    assignCaseLawyer.mockResolvedValue({ ...CASE, assigned_lawyer_id: "u-2", assigned_lawyer_name: "Zeynep Arslan" });
    const { onSaved } = renderModal({ isAdmin: true });
    const select = await screen.findByLabelText("Sorumlu avukat");
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe("u-owner"));
    await userEvent.selectOptions(select, "u-2");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ assigned_lawyer_name: "Zeynep Arslan" })));
    expect(assignCaseLawyer).toHaveBeenCalledWith(CASE.id, "u-2");
    expect(updateCase.mock.invocationCallOrder[0]).toBeLessThan(assignCaseLawyer.mock.invocationCallOrder[0]);
  });

  it("does not call the assignment when the lawyer did not change", async () => {
    listAdminLawyers.mockResolvedValue(lawyers);
    updateCase.mockResolvedValue(CASE);
    const { onSaved } = renderModal({ isAdmin: true });
    await screen.findByLabelText("Sorumlu avukat");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(assignCaseLawyer).not.toHaveBeenCalled();
  });

  it("keeps the dialog open when only the assignment fails", async () => {
    listAdminLawyers.mockResolvedValue(lawyers);
    const saved = { ...CASE, case_name: "Yeni ad" };
    updateCase.mockResolvedValue(saved);
    assignCaseLawyer.mockRejectedValue(new Error("network"));
    const { onSaved, onUpdated } = renderModal({ isAdmin: true });
    await userEvent.selectOptions(await screen.findByLabelText("Sorumlu avukat"), "u-2");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByText("Bilgiler kaydedildi ancak sorumlu avukat değiştirilemedi.")).toBeInTheDocument();
    expect(onUpdated).toHaveBeenCalledWith(saved);
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a current lawyer who is no longer assignable as (pasif)", async () => {
    listAdminLawyers.mockResolvedValue([lawyers[1]]);
    renderModal({ isAdmin: true });
    const select = await screen.findByLabelText("Sorumlu avukat");
    await waitFor(() => expect(within(select).getByRole("option", { name: "Ayşe Avukat (pasif)" })).toBeInTheDocument());
  });

  it("does not flash (pasif) while the list is loading, and shows the plain name if it fails", async () => {
    listAdminLawyers.mockReturnValue(new Promise(() => {}));
    renderModal({ isAdmin: true });
    const select = await screen.findByLabelText("Sorumlu avukat");
    expect(within(select).queryByRole("option", { name: /pasif/ })).toBeNull();
  });

  it("offers Avukat seçin for an unassigned case and keeps saving possible when the list fails", async () => {
    listAdminLawyers.mockRejectedValue(new Error("network"));
    updateCase.mockResolvedValue(CASE);
    const { onSaved } = renderModal({ isAdmin: true, caseDetail: { ...CASE, assigned_lawyer_id: null, assigned_lawyer_name: null } });
    expect(await screen.findByText("Avukat listesi yüklenemedi.")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Sorumlu avukat")).getByRole("option", { name: "Avukat seçin" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(assignCaseLawyer).not.toHaveBeenCalled();
  });

  it("shows the current lawyer as a plain option when the list fails", async () => {
    listAdminLawyers.mockRejectedValue(new Error("network"));
    renderModal({ isAdmin: true });
    await screen.findByText("Avukat listesi yüklenemedi.");
    expect(within(screen.getByLabelText("Sorumlu avukat")).getByRole("option", { name: "Ayşe Avukat" })).toBeInTheDocument();
  });
});
