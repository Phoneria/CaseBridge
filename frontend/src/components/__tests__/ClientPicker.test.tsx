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
    expect(screen.getByRole("link", { name: "Acme Ltd." })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Acme Ltd." })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("button", { name: "Müvekkili değiştir" })).toHaveFocus();
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
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("closes the list on a click outside the picker, even without focus", async () => {
    listClients.mockResolvedValue([ACME]);
    render(
      <>
        <button type="button">Dışarıda</button>
        <Harness initial="Acme" />
      </>,
    );
    await screen.findByRole("option", { name: /Acme Ltd\./ });
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(screen.getByRole("button", { name: "Dışarıda" }));
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("resets the highlighted option when new results arrive", async () => {
    const BETA = { ...ACME, id: "cl-2", name: "Acme Beta" };
    let resolveSecond!: (items: unknown[]) => void;
    listClients.mockResolvedValueOnce([ACME, BETA]).mockReturnValueOnce(new Promise((r) => (resolveSecond = r)));
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "ac");
    await screen.findByRole("option", { name: /Acme Ltd\./ });
    await userEvent.type(input, "m");
    await waitFor(() => expect(listClients).toHaveBeenCalledTimes(2));
    await userEvent.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant");
    resolveSecond([BETA]);
    await waitFor(() => expect(screen.queryByRole("option", { name: /Acme Ltd\./ })).toBeNull());
    expect(input).not.toHaveAttribute("aria-activedescendant");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("chosen")).toHaveTextContent("");
  });

  it("ignores option clicks while a client is being added", async () => {
    listClients.mockResolvedValue([ACME]);
    let resolve!: (value: { id: string; name: string }) => void;
    createClient.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<Harness />);
    await userEvent.type(screen.getByRole("combobox"), "Acme");
    const acme = await screen.findByRole("option", { name: /Acme Ltd\./ });
    await userEvent.click(screen.getByRole("option", { name: /adıyla yeni müvekkil ekle/ }));
    expect(screen.getByRole("option", { name: /adıyla yeni müvekkil ekle/ })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(acme);
    expect(screen.getByTestId("chosen")).toHaveTextContent("");
    resolve({ id: "cl-9", name: "Acme" });
    await waitFor(() => expect(screen.getByTestId("chosen")).toHaveTextContent("cl-9"));
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("links the error to the input and clears it when the text is edited", async () => {
    createClient.mockRejectedValue(new ApiError("Sunucu hatası.", 500));
    render(<Harness />);
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "Acme");
    await userEvent.click(screen.getByRole("option", { name: /adıyla yeni müvekkil ekle/ }));
    const alert = await screen.findByRole("alert");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
    await userEvent.type(input, "x");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(input.getAttribute("aria-describedby") ?? "").toBe("");
  });

  it("keeps the incoming describedBy next to the error id", async () => {
    createClient.mockRejectedValue(new ApiError("Sunucu hatası.", 500));
    render(
      <ClientPicker inputId="n" query="Acme" clientId={null} maxLength={255} describedBy="hata-1" onQueryChange={() => {}} onSelect={() => {}} onClear={() => {}} />,
    );
    await userEvent.click(await screen.findByRole("option", { name: /adıyla yeni müvekkil ekle/ }));
    const alert = await screen.findByRole("alert");
    expect(screen.getByRole("combobox").getAttribute("aria-describedby")?.split(" ")).toEqual(["hata-1", alert.id]);
  });

  it("does not let Escape that closes the list reach a surrounding dialog", async () => {
    listClients.mockResolvedValue([ACME]);
    const onKeyDown = vi.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <Harness />
      </div>,
    );
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "ac");
    await screen.findByRole("option", { name: /Acme Ltd\./ });
    onKeyDown.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(onKeyDown).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });
});
