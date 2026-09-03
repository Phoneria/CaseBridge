import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getCases = vi.fn();
const createCase = vi.fn();

vi.mock("@/lib/api", () => ({
  getCases: (...args: unknown[]) => getCases(...args),
  createCase: (...args: unknown[]) => createCase(...args),
}));

import { CaseListView } from "@/components/CaseListView";

beforeEach(() => {
  getCases.mockReset();
  createCase.mockReset();
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
});
