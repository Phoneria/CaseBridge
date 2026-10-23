import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ deleteDocument: vi.fn(), downloadDocument: vi.fn() }));

import { CaseDocumentsPanel } from "@/components/CaseDocumentsPanel";
import type { DocumentItem } from "@/types";

const document = { id: "d1", filename: "karar.pdf", file_type: "pdf", uploaded_at: "2026-10-01T10:00:00", extracted_text: "Karar metni" } as DocumentItem;

function renderPanel(documents: DocumentItem[], readOnly: boolean) {
  render(<CaseDocumentsPanel documents={documents} uploading={false} uploadError={null} onUpload={vi.fn()} onDeleted={vi.fn()} readOnly={readOnly} />);
}

describe("CaseDocumentsPanel readOnly", () => {
  it("shows the upload zone and delete when it can be changed", () => {
    renderPanel([document], false);
    expect(screen.getByText(/Belge Yükle/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sil" })).toBeInTheDocument();
  });

  it("hides the upload zone and delete but keeps copy and download when read-only", () => {
    renderPanel([document], true);
    expect(screen.queryByText(/Belge Yükle/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Sil" })).toBeNull();
    expect(screen.getByRole("button", { name: "İndir" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kopyala" })).toBeInTheDocument();
  });

  it("shows only the empty state, without a prompt to upload, when read-only and empty", () => {
    renderPanel([], true);
    expect(screen.getByText("Henüz belge yok.")).toBeInTheDocument();
    expect(screen.queryByText(/Belge Yükle/)).toBeNull();
    expect(screen.queryByText("Bu davaya PDF, DOCX veya TXT belge yükleyin.")).toBeNull();
  });
});
