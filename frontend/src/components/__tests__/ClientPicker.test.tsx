import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const listClients = vi.fn();
const createClient = vi.fn();
vi.mock("@/lib/api", () => ({
  listClients: (...args: unknown[]) => listClients(...args),
  createClient: (...args: unknown[]) => createClient(...args),
}));

import { ApiError } from "@/lib/apiError";
import { ClientPicker } from "@/components/case-form/ClientPicker";

const ACME = { id: "cl-1", name: "Acme Ltd.", client_type: "company", phone: "0212 555", case_count: 2, open_case_count: 1 };

function Harness({ initial = "" }: { initial?: string }) {
  const [query, setQuery] = useState(initial);
  const [clientId, setClientId] = useState<string | null>(null);
  return (
    <>
      <label htmlFor="name">Ad</label>
      <ClientPicker
        inputId="name"
        query={query}
        clientId={clientId}
        maxLength={255}
        onQueryChange={setQuery}
        onSelect={(client) => {
          setQuery(client.name);
          setClientId(client.id);
        }}
        onClear={() => setClientId(null)}
      />
      <output data-testid="chosen">{clientId ?? ""}</output>
    </>
  );
}

beforeEach(() => {
  listClients.mockReset().mockResolvedValue([]);
  createClient.mockReset();
});

describe("ClientPicker", () => {
  it("searches as the user types and selects a suggestion", async () => {
    listClients.mockResolvedValue([ACME]);
    render(<Harness />);
    await userEvent.type(screen.getByRole("combobox", { name: "Ad" }), "acme");
    await waitFor(() => expect(listClients).toHaveBeenLastCalledWith({ q: "acme", limit: 10 }));
    const option = await screen.findByRole("option", { name: /Acme Ltd\..*Şirket.*0212 555/ });
    await userEvent.click(option);
    expect(screen.getByTestId("chosen")).toHaveTextContent("cl-1");
    expect(screen.getByRole("link", { name: "Acme Ltd." })).toHaveAttribute("href", "/muvekkiller/cl-1");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("always offers to add the typed name as a new client", async () => {
    createClient.mockResolvedValue({ id: "cl-9", name: "Yeni Müvekkil" });
    render(<Harness />);
    await userEvent.type(screen.getByRole("combobox"), "Yeni Müvekkil");
    await userEvent.click(screen.getByRole("option", { name: "+ 'Yeni Müvekkil' adıyla yeni müvekkil ekle" }));
    await waitFor(() => expect(screen.getByTestId("chosen")).toHaveTextContent("cl-9"));
    expect(createClient).toHaveBeenCalledWith({ name: "Yeni Müvekkil", client_type: "person", phone: null, email: null, address: null, notes: null });
  });

  it("opens with suggestions for a name that is already filled in (AI draft)", async () => {
    listClients.mockResolvedValue([ACME]);
    render(<Harness initial="Acme" />);
    expect(await screen.findByRole("option", { name: /Acme Ltd\./ })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "true");
  });

  it("picks with the keyboard and closes with Escape", async () => {
    listClients.mockResolvedValue([ACME]);
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "ac");
    await screen.findByRole("option", { name: /Acme Ltd\./ });
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByTestId("chosen")).toHaveTextContent("cl-1");
  });

  it("keeps the typed name and shows the error when adding fails", async () => {
    createClient.mockRejectedValue(new ApiError("Sunucu hatası.", 500));
    render(<Harness />);
    await userEvent.type(screen.getByRole("combobox"), "Acme");
    await userEvent.click(screen.getByRole("option", { name: /adıyla yeni müvekkil ekle/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sunucu hatası.");
    expect(screen.getByRole("combobox")).toHaveValue("Acme");
  });

  it("lets the user change a chosen client", async () => {
    listClients.mockResolvedValue([ACME]);
    render(<Harness />);
    await userEvent.type(screen.getByRole("combobox"), "acme");
    await userEvent.click(await screen.findByRole("option", { name: /Acme Ltd\./ }));
    await userEvent.click(screen.getByRole("button", { name: "Müvekkili değiştir" }));
    expect(screen.getByRole("combobox")).toHaveValue("Acme Ltd.");
    expect(screen.getByTestId("chosen")).toHaveTextContent("");
  });
});
