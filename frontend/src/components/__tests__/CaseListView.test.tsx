import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getCases = vi.fn();
const createCase = vi.fn();

vi.mock("@/lib/api", () => ({
  getCases: (...args: unknown[]) => getCases(...args),
  createCase: (...args: unknown[]) => createCase(...args),
}));

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";

import { CaseListView } from "@/components/CaseListView";

const icraCase = {
  id: "c1",
  case_number: "2026/1",
  case_name: "Kat Mülkiyeti Aidat Alacağı",
  client_name: "Ayşe Kaya",
  case_type: "icra",
  status: "devam_eden",
  outcome: "ongoing",
  next_hearing_date: null,
  is_archived: false,
};

beforeEach(() => {
  getCases.mockReset();
  createCase.mockReset();
  resetNav();
  setUrl("/davalar");
});

describe("CaseListView", () => {
  it("shows a loading state before cases arrive", () => {
    getCases.mockReturnValue(new Promise(() => {}));
    render(<CaseListView />);
    expect(screen.getByText(/yükleniyor/i)).toBeInTheDocument();
  });

  it("renders case rows once loaded", async () => {
    getCases.mockResolvedValue([
      {
        id: "c1",
        case_number: "2026/1",
        case_name: "İşçilik Alacakları Davası",
        client_name: "Ahmet Yılmaz",
        case_type: "is_hukuku",
        status: "devam_eden",
        is_archived: false,
      },
    ]);

    render(<CaseListView />);
    await waitFor(() => expect(screen.getByText("İşçilik Alacakları Davası")).toBeInTheDocument());
    expect(screen.getByText("Ahmet Yılmaz")).toBeInTheDocument();
  });

  it("shows an empty state when there are no cases", async () => {
    getCases.mockResolvedValue([]);
    render(<CaseListView />);
    await waitFor(() => expect(screen.getByText(/henüz dava bulunmuyor/i)).toBeInTheDocument());
  });

  it("shows an error state when the request fails", async () => {
    getCases.mockRejectedValue(new Error("boom"));
    render(<CaseListView />);
    await waitFor(() => expect(screen.getByText(/davalar yüklenemedi/i)).toBeInTheDocument());
  });

  it("creates a new case through the form and refreshes the list", async () => {
    getCases.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "c2",
        case_number: "2026/9",
        case_name: "Yeni Oluşturulan Dava",
        client_name: "Yeni Müvekkil",
        case_type: "diger",
        status: "devam_eden",
        is_archived: false,
      },
    ]);
    createCase.mockResolvedValue({ id: "c2" });

    render(<CaseListView />);
    await waitFor(() => expect(screen.getByText(/henüz dava bulunmuyor/i)).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /yeni dava/i }));
    await userEvent.type(screen.getByLabelText("Dava No"), "2026/9");
    await userEvent.type(screen.getByLabelText("Dava Adı"), "Yeni Oluşturulan Dava");
    await userEvent.type(screen.getByLabelText("Müvekkil"), "Yeni Müvekkil");
    await userEvent.click(screen.getByRole("button", { name: /kaydet/i }));

    await waitFor(() => expect(createCase).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Yeni Oluşturulan Dava")).toBeInTheDocument());
  });

  it("loads with filters read from the URL and shows them as chips", async () => {
    setUrl("/davalar?kategori=icra&sonuc=kazanilan&arsiv=dahil");
    getCases.mockResolvedValue([icraCase]);

    render(<CaseListView />);

    await waitFor(() => expect(getCases).toHaveBeenCalledWith({ case_type: "icra", outcome: "won", include_archived: true }));
    expect(screen.getByText("Kategori: İcra")).toBeInTheDocument();
    expect(screen.getByText("Sonuç: Kazanılan")).toBeInTheDocument();
    expect(screen.getByText("Arşiv dahil")).toBeInTheDocument();
    expect(screen.getByText("1 sonuç")).toBeInTheDocument();
  });

  it("maps durum=aktif to the active filter", async () => {
    setUrl("/davalar?durum=aktif");
    getCases.mockResolvedValue([]);
    render(<CaseListView />);
    await waitFor(() => expect(getCases).toHaveBeenCalledWith({ active: true }));
  });

  it("writes dropdown changes and chip removals to the URL", async () => {
    setUrl("/davalar?kategori=icra");
    getCases.mockResolvedValue([icraCase]);
    render(<CaseListView />);
    await screen.findByText("Kat Mülkiyeti Aidat Alacağı");

    await userEvent.selectOptions(screen.getByLabelText("Durum filtresi"), "aktif");
    expect(nav.replace).toHaveBeenLastCalledWith("/davalar?kategori=icra&durum=aktif", { scroll: false });

    await userEvent.click(screen.getByRole("button", { name: "Kategori: İcra filtresini kaldır" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/davalar", { scroll: false });
  });

  it("shows the filtered empty state when filters match nothing", async () => {
    setUrl("/davalar?kategori=kira");
    getCases.mockResolvedValue([]);
    render(<CaseListView />);
    expect(await screen.findByText("Bu filtrelere uyan kayıt yok.")).toBeInTheDocument();
    expect(screen.queryByText(/henüz dava bulunmuyor/i)).not.toBeInTheDocument();
  });

  it("links name to detail, row to preview and badges to filters", async () => {
    getCases.mockResolvedValue([{ ...icraCase, next_hearing_date: "2026-10-12" }]);
    render(<CaseListView />);
    await screen.findByText("Kat Mülkiyeti Aidat Alacağı");

    expect(screen.getByRole("link", { name: "Kat Mülkiyeti Aidat Alacağı" })).toHaveAttribute("href", "/davalar/c1");
    expect(screen.getByRole("link", { name: "Kat Mülkiyeti Aidat Alacağı önizle" })).toHaveAttribute("href", "/davalar?onizle=c1");
    expect(screen.getByRole("link", { name: "İcra" })).toHaveAttribute("href", "/davalar?kategori=icra");
    expect(screen.getByRole("link", { name: "Devam Eden" })).toHaveAttribute("href", "/davalar?durum=devam_eden");
    expect(screen.getByText("12.10.2026")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Ayşe Kaya"));
    expect(nav.push).toHaveBeenCalledWith("/davalar?onizle=c1", { scroll: false });
  });

  it("submits the search box to the URL", async () => {
    getCases.mockResolvedValue([]);
    render(<CaseListView />);
    await userEvent.type(screen.getByPlaceholderText(/dava adı, müvekkil/i), "kira");
    await userEvent.click(screen.getByRole("button", { name: "Ara" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/davalar?ara=kira", { scroll: false });
  });

  it("ignores stale responses from slower requests when filters change", async () => {
    const caseA = { ...icraCase, id: "cA", case_name: "Case A" };
    const caseB = { ...icraCase, id: "cB", case_name: "Case B" };

    let resolveFirst: (value: typeof caseB[]) => void = () => {};
    let resolveSecond: (value: typeof caseA[]) => void = () => {};

    const firstPromise = new Promise<typeof caseB[]>((resolve) => {
      resolveFirst = resolve;
    });
    const secondPromise = new Promise<typeof caseA[]>((resolve) => {
      resolveSecond = resolve;
    });

    getCases.mockReturnValueOnce(firstPromise).mockReturnValueOnce(secondPromise);

    const { rerender } = render(<CaseListView />);
    expect(screen.getByText(/yükleniyor/i)).toBeInTheDocument();

    setUrl("/davalar?kategori=kira");
    rerender(<CaseListView />);
    expect(getCases).toHaveBeenCalledTimes(2);

    resolveSecond([caseA]);
    await waitFor(() => expect(screen.getByText("Case A")).toBeInTheDocument());
    expect(screen.queryByText("Case B")).not.toBeInTheDocument();

    await act(async () => {
      resolveFirst([caseB]);
      await firstPromise;
    });
    expect(screen.getByText("Case A")).toBeInTheDocument();
    expect(screen.queryByText("Case B")).not.toBeInTheDocument();
  });
});
