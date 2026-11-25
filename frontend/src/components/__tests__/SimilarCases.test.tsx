import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { getCases, getSimilarCases, searchSimilarCases } from "@/lib/api";
import { OUTCOME_COLORS } from "@/lib/brand";
import { SimilarCasesCard } from "@/components/similar/SimilarCasesCard";
import { SimilarCasesView } from "@/components/ai/SimilarCasesView";
import { AI_NAVIGATION } from "@/lib/aiNavigation";
import type { Case, SimilarCase } from "@/types";

vi.mock("@/lib/api", () => ({ getCases: vi.fn(), getSimilarCases: vi.fn(), searchSimilarCases: vi.fn() }));

const won: SimilarCase = {
  case_id: "c2", case_number: "2025/11", case_name: "Kira Tespit Davası", case_type: "kira", status: "kapali",
  outcome: "won", decision_date: "2025-07-09", duration_days: 180, duration_ongoing: false,
  assigned_lawyer_name: "Mehmet Avukat", is_precedent: false, score: 82,
  reasons: ["Aynı kategori: Kira", "Benzer talep: kira farkı"],
};
const precedent: SimilarCase = {
  ...won, case_id: "p1", case_number: "Y3HD 2024/5", case_name: "Kira farkı emsal kararı", is_precedent: true,
  outcome: "lost", assigned_lawyer_name: null, duration_days: null, decision_date: null, score: 61, reasons: ["Aynı kategori: Kira"],
};
const ongoing: SimilarCase = {
  ...won, case_id: "c3", case_name: "Tahliye Davası", status: "durusma_bekleyen", outcome: "ongoing",
  decision_date: null, duration_days: 40, duration_ongoing: true, score: 35, reasons: [],
};
const source = { id: "c1", case_name: "Kira farkı davası", case_number: "2026/40", client_name: "Kurgusal Müvekkil" } as Case;

beforeEach(() => vi.clearAllMocks());

describe("SimilarCasesCard", () => {
  it("lists the first five with score, result badge, duration, lawyer, reasons and links", async () => {
    vi.mocked(getSimilarCases).mockResolvedValue([won, precedent, ongoing]);
    render(<SimilarCasesCard caseId="c1" />);
    expect(getSimilarCases).toHaveBeenCalledWith("c1", 5);
    const list = await screen.findByRole("list", { name: "Benzer davalar" });
    const rows = within(list).getAllByRole("listitem").filter((li) => li.parentElement === list);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByLabelText("Benzerlik 82 / 100")).toHaveTextContent("82");
    expect(within(rows[0]).getByText("Kazanıldı")).toBeVisible();
    expect(within(rows[0]).getByText("Kazanıldı").querySelector("span")).toHaveStyle({ backgroundColor: OUTCOME_COLORS.won });
    expect(within(rows[0]).getByText("Süre: 180 gün")).toBeVisible();
    expect(within(rows[0]).getByText("Avukat: Mehmet Avukat")).toBeVisible();
    expect(within(rows[0]).getByText("Benzer talep: kira farkı")).toBeVisible();
    expect(within(rows[0]).getByRole("link", { name: "Davaya git" })).toHaveAttribute("href", "/davalar/c2");
    expect(within(rows[1]).getByText("Emsal")).toBeVisible();
    expect(within(rows[1]).getByRole("link", { name: "Karara git" })).toHaveAttribute("href", "/emsaller?karar=p1");
    expect(within(rows[2]).getByText("Duruşma Bekleyen")).toBeVisible();
    expect(within(rows[2]).getByText("Süre: 40 gün (sürüyor)")).toBeVisible();
    expect(screen.getByRole("link", { name: "Tümünü gör" })).toHaveAttribute("href", "/ai/benzer-davalar?dava=c1");
  });

  it("shows an empty state when nothing is similar", async () => {
    vi.mocked(getSimilarCases).mockResolvedValue([]);
    render(<SimilarCasesCard caseId="c1" />);
    expect(await screen.findByText("Benzer dava bulunamadı.")).toBeVisible();
    expect(screen.getByText(/Talep ve olay özetini doldurmak/)).toBeVisible();
  });

  it("shows a safe error when the request fails", async () => {
    vi.mocked(getSimilarCases).mockRejectedValue(new Error("boom"));
    render(<SimilarCasesCard caseId="c1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Benzer davalar yüklenemedi");
  });
});

describe("SimilarCasesView", () => {
  it("is listed in the CaseBridge AI menu", () => {
    expect(AI_NAVIGATION).toContainEqual({ label: "Benzer Dava Bul", href: "/ai/benzer-davalar" });
  });

  it("finds cases similar to the case chosen from the link or the picker", async () => {
    vi.mocked(getCases).mockResolvedValue([source]);
    vi.mocked(getSimilarCases).mockResolvedValue([won]);
    render(<SimilarCasesView initialCaseId="c1" />);
    expect(await screen.findByText("Kira Tespit Davası")).toBeVisible();
    expect(getCases).toHaveBeenCalledWith({ include_archived: true });
    expect(getSimilarCases).toHaveBeenCalledWith("c1", 10);
    expect(await screen.findByRole("heading", { name: "Kira farkı davası için benzer davalar" })).toBeVisible();
  });

  it("searches free text with an optional category and shows the empty state", async () => {
    vi.mocked(getCases).mockResolvedValue([source]);
    vi.mocked(searchSimilarCases).mockResolvedValueOnce([precedent]).mockResolvedValueOnce([]);
    render(<SimilarCasesView />);
    await userEvent.click(screen.getByRole("tab", { name: "Metinle ara" }));
    const submit = screen.getByRole("button", { name: "Benzer davaları bul" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Uyuşmazlığı anlatın"), { target: { value: "  kira farkı tespiti  " } });
    fireEvent.change(screen.getByLabelText("Kategori (isteğe bağlı)"), { target: { value: "kira" } });
    await userEvent.click(submit);
    expect(searchSimilarCases).toHaveBeenCalledWith("kira farkı tespiti", "kira", 10);
    expect(await screen.findByText("Kira farkı emsal kararı")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Benzer davaları bul" }));
    expect(await screen.findByText("Benzer dava bulunamadı.")).toBeVisible();
    expect(screen.getByText(/Talebi ve olayları biraz daha ayrıntılı/)).toBeVisible();
  });
});
