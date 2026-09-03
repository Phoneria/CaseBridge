import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const listAllDocuments = vi.fn();

vi.mock("@/lib/api", () => ({
  listAllDocuments: (...args: unknown[]) => listAllDocuments(...args),
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

beforeEach(() => {
  listAllDocuments.mockReset();
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
});
