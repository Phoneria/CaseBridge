import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getClient = vi.fn();
const deleteClient = vi.fn();
const updateClient = vi.fn();
const createClient = vi.fn();
const getMe = vi.fn();
vi.mock("@/lib/api", () => ({
  getClient: (...args: unknown[]) => getClient(...args),
  deleteClient: (...args: unknown[]) => deleteClient(...args),
  updateClient: (...args: unknown[]) => updateClient(...args),
  createClient: (...args: unknown[]) => createClient(...args),
  getMe: (...args: unknown[]) => getMe(...args),
}));
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav } from "@/test/navigation";

import { ApiError } from "@/lib/apiError";
import { ClientDetailView } from "@/components/ClientDetailView";
import { formatTry } from "@/lib/clients";

const STATS = { total: 2, open: 1, closed: 1, archived: 1, won: 1, lost: 0, settled: 0, total_case_value: 1750 };
const DETAIL = {
  id: "cl-1", law_firm_id: "f1", name: "Acme Ltd.", client_type: "company", phone: "0212 555", email: "a@acme.co",
  address: "İstanbul", notes: "Öncelikli", created_at: "2026-11-01T00:00:00", updated_at: "2026-11-01T00:00:00",
  stats: STATS,
  cases: [
    { id: "k1", case_number: "2026/1", case_name: "Kira Alacağı", case_type: "kira", status: "devam_eden", outcome: "ongoing",
      assigned_lawyer_name: "Ayşe Avukat", next_hearing_date: "2026-12-01", is_archived: false },
    { id: "k2", case_number: "2025/9", case_name: "Eski Dava", case_type: "icra", status: "kapali", outcome: "won",
      assigned_lawyer_name: null, next_hearing_date: null, is_archived: true },
  ],
};

beforeEach(() => {
  resetNav();
  for (const mock of [getClient, deleteClient, updateClient, createClient, getMe]) mock.mockReset();
  getMe.mockResolvedValue({ id: "u1", role: "lawyer" });
});

describe("ClientDetailView", () => {
  it("shows contact details, stats and the client's cases", async () => {
    getClient.mockResolvedValue(DETAIL);
    render(<ClientDetailView clientId="cl-1" />);
    expect(await screen.findByRole("heading", { name: "Acme Ltd." })).toBeInTheDocument();
    expect(screen.getByText("Şirket")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "0212 555" })).toHaveAttribute("href", "tel:0212 555");
    expect(screen.getByRole("link", { name: "a@acme.co" })).toHaveAttribute("href", "mailto:a@acme.co");
    expect(screen.getByText("İstanbul")).toBeInTheDocument();
    expect(screen.getByText(formatTry(1750))).toBeInTheDocument();
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(within(rows[1]).getByRole("link", { name: "Kira Alacağı" })).toHaveAttribute("href", "/davalar/k1");
    expect(within(rows[1]).getByText("Ayşe Avukat")).toBeInTheDocument();
    expect(rows[2]).toHaveClass("opacity-60");
    expect(screen.getByRole("link", { name: "Bu müvekkil için yeni dava" })).toHaveAttribute("href", "/davalar/yeni?muvekkil=cl-1");
    expect(screen.getByRole("link", { name: /Müvekkillere dön/ })).toHaveAttribute("href", "/muvekkiller");
  });

  it("shows the server's message for a client that is not found", async () => {
    getClient.mockRejectedValue(new ApiError("Müvekkil bulunamadı.", 404));
    render(<ClientDetailView clientId="x" />);
    expect(await screen.findByText("Müvekkil bulunamadı.")).toBeInTheDocument();
  });

  it("edits the client in place", async () => {
    getClient.mockResolvedValue(DETAIL);
    updateClient.mockResolvedValue({ ...DETAIL, name: "Acme Holding" });
    render(<ClientDetailView clientId="cl-1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Düzenle" }));
    const dialog = screen.getByRole("dialog", { name: "Müvekkili düzenle" });
    const name = within(dialog).getByLabelText(/^Ad \/ unvan/);
    await userEvent.clear(name);
    await userEvent.type(name, "Acme Holding");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByRole("heading", { name: "Acme Holding" })).toBeInTheDocument();
    expect(updateClient.mock.calls[0][0]).toBe("cl-1");
  });

  it("hides delete from lawyers", async () => {
    getClient.mockResolvedValue(DETAIL);
    render(<ClientDetailView clientId="cl-1" />);
    await screen.findByRole("heading", { name: "Acme Ltd." });
    expect(screen.queryByRole("button", { name: "Sil" })).toBeNull();
  });

  it("lets an admin delete only a client without cases", async () => {
    getMe.mockResolvedValue({ id: "a1", role: "admin" });
    getClient.mockResolvedValue(DETAIL);
    const { unmount } = render(<ClientDetailView clientId="cl-1" />);
    const blocked = await screen.findByRole("button", { name: "Sil" });
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Davası olan müvekkil silinemez.")).toBeInTheDocument();
    await userEvent.click(blocked);
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();

    getClient.mockResolvedValue({ ...DETAIL, stats: { ...STATS, total: 0 }, cases: [] });
    deleteClient.mockResolvedValue(undefined);
    render(<ClientDetailView clientId="cl-1" />);
    expect(await screen.findByText("Bu müvekkilin henüz davası yok.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sil" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Müvekkili sil" })).getByRole("button", { name: "Sil" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/muvekkiller"));
    expect(deleteClient).toHaveBeenCalledWith("cl-1");
  });
});
