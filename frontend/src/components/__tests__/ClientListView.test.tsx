import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const listClients = vi.fn();
const createClient = vi.fn();
const updateClient = vi.fn();
vi.mock("@/lib/api", () => ({
  listClients: (...args: unknown[]) => listClients(...args),
  createClient: (...args: unknown[]) => createClient(...args),
  updateClient: (...args: unknown[]) => updateClient(...args),
}));
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav } from "@/test/navigation";

import { ApiError } from "@/lib/apiError";
import { ClientListView } from "@/components/ClientListView";

const row = (id: string, name: string, extra = {}) => ({
  id, law_firm_id: "f1", name, client_type: "person", phone: null, email: null, address: null, notes: null,
  created_at: "2026-11-01T00:00:00", updated_at: "2026-11-01T00:00:00", case_count: 0, open_case_count: 0, ...extra,
});

beforeEach(() => {
  resetNav();
  for (const mock of [listClients, createClient, updateClient]) mock.mockReset();
});

describe("ClientListView", () => {
  it("lists clients with type, contact and case counts", async () => {
    listClients.mockResolvedValue([row("c1", "Acme Ltd.", { client_type: "company", phone: "0212", email: "a@b.co", case_count: 3, open_case_count: 1 })]);
    render(<ClientListView />);
    const table = await screen.findByRole("table");
    const cells = within(table).getAllByRole("row")[1];
    expect(within(cells).getByRole("link", { name: "Acme Ltd." })).toHaveAttribute("href", "/muvekkiller/c1");
    for (const text of ["Şirket", "0212", "a@b.co", "3", "1"]) expect(within(cells).getByText(text)).toBeInTheDocument();
    expect(listClients).toHaveBeenCalledWith({ q: "", limit: 50, offset: 0 });
  });

  it("searches after the user stops typing", async () => {
    listClients.mockResolvedValue([]);
    render(<ClientListView />);
    await userEvent.type(await screen.findByRole("searchbox", { name: "Müvekkil ara" }), "acme");
    await waitFor(() => expect(listClients).toHaveBeenLastCalledWith({ q: "acme", limit: 50, offset: 0 }));
    expect(await screen.findByText("Aramanızla eşleşen müvekkil yok.")).toBeInTheDocument();
  });

  it("shows the empty state of a firm without clients", async () => {
    listClients.mockResolvedValue([]);
    render(<ClientListView />);
    expect(await screen.findByText("Henüz müvekkil yok.")).toBeInTheDocument();
  });

  it("pages through 50 clients at a time", async () => {
    listClients.mockResolvedValue(Array.from({ length: 50 }, (_, i) => row(`c${i}`, `Müvekkil ${i}`)));
    render(<ClientListView />);
    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: "Sonraki" }));
    await waitFor(() => expect(listClients).toHaveBeenLastCalledWith({ q: "", limit: 50, offset: 50 }));
  });

  it("creates a client and opens its page", async () => {
    listClients.mockResolvedValue([]);
    createClient.mockResolvedValue(row("new-1", "Nova Yazılım"));
    render(<ClientListView />);
    await userEvent.click(await screen.findByRole("button", { name: "Yeni müvekkil" }));
    const dialog = screen.getByRole("dialog", { name: "Yeni müvekkil" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(within(dialog).getByText("Ad gerekli.")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/^Ad \/ unvan/), "Nova Yazılım");
    await userEvent.selectOptions(within(dialog).getByLabelText("Tür"), "company");
    await userEvent.type(within(dialog).getByLabelText("E-posta"), "yanlis");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(within(dialog).getByText("Geçerli bir e-posta girin.")).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText("E-posta"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/muvekkiller/new-1"));
    expect(createClient).toHaveBeenCalledWith({ name: "Nova Yazılım", client_type: "company", phone: null, email: null, address: null, notes: null });
  });

  it("keeps the form open with the server's message when saving fails", async () => {
    listClients.mockResolvedValue([]);
    createClient.mockRejectedValue(new ApiError("Sunucu hatası.", 500));
    render(<ClientListView />);
    await userEvent.click(await screen.findByRole("button", { name: "Yeni müvekkil" }));
    const dialog = screen.getByRole("dialog", { name: "Yeni müvekkil" });
    await userEvent.type(within(dialog).getByLabelText(/^Ad \/ unvan/), "Nova");
    await userEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Sunucu hatası.");
  });
});
