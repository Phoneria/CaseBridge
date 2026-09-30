import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { resetNav, setUrl } from "@/test/navigation";

const listAllDocuments = vi.fn();
const downloadDocument = vi.fn();

vi.mock("@/lib/api", () => ({
  listAllDocuments: (...args: unknown[]) => listAllDocuments(...args),
  downloadDocument: (...args: unknown[]) => downloadDocument(...args),
}));

import { DocumentsView } from "@/components/DocumentsView";

const doc = {
  id: "d1",
  case_id: "c1",
  case_name: "Sözleşmenin Feshi Davası",
  case_number: "2026/1",
  filename: "sozlesme.pdf",
  file_type: "pdf",
  extracted_text: null,
  uploaded_at: "2026-01-01",
};

const txtDoc = { ...doc, id: "d2", case_id: "c2", case_name: "Kiracı Tahliye Davası", case_number: "2026/2", filename: "notlar.txt", file_type: "txt" };

beforeEach(() => {
  resetNav();
  setUrl("/belgeler");
  listAllDocuments.mockReset();
  downloadDocument.mockReset();
  global.URL.createObjectURL = vi.fn(() => "blob:mock");
  global.URL.revokeObjectURL = vi.fn();
});

describe("DocumentsView", () => {
  it("lists documents across cases with the case name", async () => {
    listAllDocuments.mockResolvedValue([doc]);

    render(<DocumentsView />);

    await waitFor(() => expect(screen.getByText("sozlesme.pdf")).toBeInTheDocument());
    expect(screen.getByText(/Sözleşmenin Feshi Davası/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no documents", async () => {
    listAllDocuments.mockResolvedValue([]);

    render(<DocumentsView />);

    await waitFor(() => expect(screen.getByText(/henüz belge yok/i)).toBeInTheDocument());
  });

  it("filters by ?tur= and ?dava= from the URL", async () => {
    setUrl("/belgeler?tur=txt");
    listAllDocuments.mockResolvedValue([doc, txtDoc]);
    const { unmount } = render(<DocumentsView />);
    await screen.findByText("notlar.txt");
    expect(screen.queryByText("sozlesme.pdf")).not.toBeInTheDocument();
    unmount();

    setUrl("/belgeler?dava=c1");
    render(<DocumentsView />);
    await screen.findByText("sozlesme.pdf");
    expect(screen.queryByText("notlar.txt")).not.toBeInTheDocument();
    expect(screen.getByText("Dava: Sözleşmenin Feshi Davası")).toBeInTheDocument();
  });

  it("links the filename to the preview and the case to the case filter", async () => {
    listAllDocuments.mockResolvedValue([doc]);
    render(<DocumentsView />);
    await screen.findByText("sozlesme.pdf");

    expect(screen.getByRole("link", { name: "sozlesme.pdf" })).toHaveAttribute("href", "/belgeler?onizle=c1&odak=belge%3Ad1");
    expect(screen.getByRole("link", { name: "2026/1 - Sözleşmenin Feshi Davası" })).toHaveAttribute("href", "/belgeler?dava=c1");
  });

  it("downloads a document", async () => {
    listAllDocuments.mockResolvedValue([doc]);
    downloadDocument.mockResolvedValue(new Blob(["x"]));
    render(<DocumentsView />);

    await userEvent.click(await screen.findByRole("button", { name: "sozlesme.pdf indir" }));

    await waitFor(() => expect(downloadDocument).toHaveBeenCalledWith("d1"));
    expect(global.URL.createObjectURL).toHaveBeenCalled();
  });

  it("shows an error when the download fails", async () => {
    listAllDocuments.mockResolvedValue([doc]);
    downloadDocument.mockRejectedValue(new Error("boom"));
    render(<DocumentsView />);

    await userEvent.click(await screen.findByRole("button", { name: "sozlesme.pdf indir" }));

    expect(await screen.findByText(/belge indirilemedi/i)).toBeInTheDocument();
  });
});
