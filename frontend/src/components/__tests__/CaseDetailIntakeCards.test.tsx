import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateCase = vi.fn();
vi.mock("@/lib/api", () => ({
  updateCase: (...args: unknown[]) => updateCase(...args),
}));

import { CaseDisputeCard } from "@/components/CaseDisputeCard";
import { CasePartiesCard } from "@/components/CasePartiesCard";
import { ApiError } from "@/lib/apiError";
import type { Case } from "@/types";

const baseCase = {
  id: "c1",
  client_role: "plaintiff",
  court_file_number: "2026/145 E.",
  claim: "150.000 TL alacak",
  facts_summary: "Fatura ödenmedi.",
  plaintiff_position: "Mal teslim edildi.",
  defendant_position: null,
  description: "Müvekkil acele istiyor.",
  parties: [
    { id: "p1", name: "Alfa Ticaret A.Ş.", role: "plaintiff", is_client: true, counsel_name: "Av. Ece Kaya", sort_order: 0 },
    { id: "p2", name: "Beta Lojistik Ltd.", role: "defendant", is_client: false, counsel_name: null, sort_order: 1 },
  ],
} as unknown as Case;

beforeEach(() => updateCase.mockReset());

describe("CasePartiesCard", () => {
  it("lists the parties with role, counsel and the client badge", () => {
    render(<CasePartiesCard caseDetail={baseCase} onSaved={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Taraflar" })).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("Alfa Ticaret A.Ş.")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Davacı")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Vekili: Av. Ece Kaya")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Müvekkilimiz")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Davalı")).toBeInTheDocument();
    expect(within(rows[1]).queryByText("Müvekkilimiz")).toBeNull();
  });

  it("says so when no party is recorded", () => {
    render(<CasePartiesCard caseDetail={{ ...baseCase, parties: [] }} onSaved={vi.fn()} />);
    expect(screen.getByText("Kayıtlı taraf yok.")).toBeInTheDocument();
  });

  it("edits the parties, saves them with PATCH and reports the updated case", async () => {
    const updated = { ...baseCase, client_name: "Alfa Ticaret A.Ş. Yeni" } as Case;
    updateCase.mockResolvedValue(updated);
    const onSaved = vi.fn();
    render(<CasePartiesCard caseDetail={baseCase} onSaved={onSaved} />);

    await userEvent.click(screen.getByRole("button", { name: "Tarafları düzenle" }));
    const first = screen.getByRole("group", { name: "Taraf 1" });
    expect(within(first).getByLabelText(/^Ad/)).toHaveValue("Alfa Ticaret A.Ş.");
    expect(within(first).getByLabelText("Müvekkilimiz")).toBeChecked();
    await userEvent.type(within(first).getByLabelText(/^Ad/), " Yeni");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    expect(updateCase).toHaveBeenCalledWith("c1", {
      parties: [
        { name: "Alfa Ticaret A.Ş. Yeni", role: "plaintiff", is_client: true, counsel_name: "Av. Ece Kaya" },
        { name: "Beta Lojistik Ltd.", role: "defendant", is_client: false, counsel_name: null },
      ],
    });
    expect(screen.queryByRole("button", { name: "Kaydet" })).toBeNull();
  });

  it("requires a client before saving", async () => {
    render(<CasePartiesCard caseDetail={baseCase} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Tarafları düzenle" }));
    await userEvent.click(within(screen.getByRole("group", { name: "Taraf 1" })).getByLabelText("Müvekkilimiz"));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(screen.getByText("En az bir taraf müvekkil olarak işaretlenmeli.")).toBeInTheDocument();
    expect(updateCase).not.toHaveBeenCalled();
  });

  it("shows the server error in an alert and stays in edit mode", async () => {
    updateCase.mockRejectedValueOnce(new ApiError("Sunucu hatası", 500));
    const onSaved = vi.fn();
    render(<CasePartiesCard caseDetail={baseCase} onSaved={onSaved} />);
    await userEvent.click(screen.getByRole("button", { name: "Tarafları düzenle" }));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sunucu hatası");
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeEnabled();
  });

  it("shows a Turkish fallback for a non-ApiError failure", async () => {
    updateCase.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<CasePartiesCard caseDetail={baseCase} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Tarafları düzenle" }));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Taraflar kaydedilemedi.");
  });

  it("discards edits on Vazgeç", async () => {
    render(<CasePartiesCard caseDetail={baseCase} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Tarafları düzenle" }));
    await userEvent.type(within(screen.getByRole("group", { name: "Taraf 1" })).getByLabelText(/^Ad/), "xyz");
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.getByText("Alfa Ticaret A.Ş.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tarafları düzenle" }));
    expect(within(screen.getByRole("group", { name: "Taraf 1" })).getByLabelText(/^Ad/)).toHaveValue("Alfa Ticaret A.Ş.");
    expect(updateCase).not.toHaveBeenCalled();
  });
});

describe("CaseDisputeCard", () => {
  it("shows the dispute fields with labels for the client's side", () => {
    render(<CaseDisputeCard caseDetail={baseCase} onSaved={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Uyuşmazlık" })).toBeInTheDocument();
    expect(screen.getByText("2026/145 E.")).toBeInTheDocument();
    expect(screen.getByText("150.000 TL alacak")).toBeInTheDocument();
    expect(screen.getByText("Fatura ödenmedi.")).toBeInTheDocument();
    expect(screen.getByText("İddiamız (davacı)")).toBeInTheDocument();
    expect(screen.getByText("Mal teslim edildi.")).toBeInTheDocument();
    expect(screen.getByText("Karşı tarafın savunması (davalı)")).toBeInTheDocument();
    expect(screen.getByText("Genel notlar")).toBeInTheDocument();
    expect(screen.getByText("Müvekkil acele istiyor.")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });

  it("uses neutral labels when the client's side is unknown", () => {
    render(<CaseDisputeCard caseDetail={{ ...baseCase, client_role: null }} onSaved={vi.fn()} />);
    expect(screen.getByText("Davacının iddiası")).toBeInTheDocument();
    expect(screen.getByText("Davalının savunması")).toBeInTheDocument();
  });

  it("edits and saves the dispute, clearing emptied fields with null", async () => {
    const updated = { ...baseCase, claim: "Yeni talep" } as Case;
    updateCase.mockResolvedValue(updated);
    const onSaved = vi.fn();
    render(<CaseDisputeCard caseDetail={baseCase} onSaved={onSaved} />);

    await userEvent.click(screen.getByRole("button", { name: "Uyuşmazlığı düzenle" }));
    const claim = screen.getByLabelText("Talep / dava konusu");
    await userEvent.clear(claim);
    await userEvent.type(claim, "Yeni talep");
    await userEvent.clear(screen.getByLabelText("Olay özeti"));
    expect(screen.getByLabelText("İddiamız (davacı)")).toHaveValue("Mal teslim edildi.");
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    expect(updateCase).toHaveBeenCalledWith("c1", {
      court_file_number: "2026/145 E.",
      claim: "Yeni talep",
      facts_summary: null,
      plaintiff_position: "Mal teslim edildi.",
      defendant_position: null,
      description: "Müvekkil acele istiyor.",
    });
    expect(screen.queryByRole("button", { name: "Kaydet" })).toBeNull();
  });

  it("shows the server error in an alert", async () => {
    updateCase.mockRejectedValueOnce(new ApiError("Sunucu hatası", 500));
    render(<CaseDisputeCard caseDetail={baseCase} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Uyuşmazlığı düzenle" }));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sunucu hatası");
  });

  it("shows a Turkish fallback for a non-ApiError failure", async () => {
    updateCase.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<CaseDisputeCard caseDetail={baseCase} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Uyuşmazlığı düzenle" }));
    await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Uyuşmazlık bilgileri kaydedilemedi.");
  });

  it("discards edits on Vazgeç", async () => {
    render(<CaseDisputeCard caseDetail={baseCase} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Uyuşmazlığı düzenle" }));
    await userEvent.type(screen.getByLabelText("Talep / dava konusu"), " ekle");
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.getByText("150.000 TL alacak")).toBeInTheDocument();
    expect(updateCase).not.toHaveBeenCalled();
  });
});
