import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";

import { explainSimilarPrecedent, getSimilarPrecedents, setPrecedentLink } from "@/lib/api";
import { SimilarPrecedentsSidebar, highlightRuns, sortItems } from "@/components/similar/SimilarPrecedentsSidebar";
import { summaryLine } from "@/components/similar/similarPrecedentUi";
import type { SimilarPrecedentDetail, SimilarPrecedentsResponse, SimilarityFacts } from "@/types";

vi.mock("@/lib/api", () => ({
  getSimilarPrecedents: vi.fn(),
  explainSimilarPrecedent: vi.fn(),
  setPrecedentLink: vi.fn(),
}));

const sourceFacts: SimilarityFacts = {
  case_type: "kira", court: "İstanbul 14. Sulh Hukuk Mahkemesi", court_type: "Sulh Hukuk", client_role: "plaintiff",
  case_value: 120000, opening_date: "2026-01-05", decision_date: null, duration_months: null, outcome: "ongoing",
  evidence: ["İhtarname"], has_expert_report: false, document_count: 0, statutes: ["TBK m. 344"],
};

const best: SimilarPrecedentDetail = {
  precedent_id: "p1", case_number: "Y3HD 2024/5 E.", case_name: "Kira bedelinin tespiti emsal kararı",
  case_type: "kira", court: "Yargıtay 3. Hukuk Dairesi", outcome: "won", decision_date: "2024-06-01",
  score: 74, text_score: 58, linked_to_case: false,
  explanation: {
    shared_terms: ["kira", "bedelini", "tespiti"],
    shared_statutes: ["TBK m. 344"],
    matching_fields: ["Aynı kategori: Kira", "Yakın dava değeri"],
    passages: [{
      case_label: "Olay özeti", case_text: "Kiracı yeni dönem kira bedelini ödedi.",
      case_highlights: [{ start: 18, end: 22 }, { start: 23, end: 31 }],
      precedent_label: "Belge: karar.txt", precedent_text: "Kiracı kira bedelini ödemedi.",
      precedent_highlights: [{ start: 7, end: 11 }, { start: 12, end: 20 }],
    }],
  },
  case_value: 100000, duration_months: 14,
  score_breakdown: [
    { key: "text", label: "Metin benzerliği", points: 35, max_points: 60 },
    { key: "case_type", label: "Kategori", points: 20, max_points: 20 },
    { key: "court", label: "Mahkeme", points: 9, max_points: 10 },
    { key: "statutes", label: "Ortak mevzuat", points: 10, max_points: 10 },
  ],
  key_differences: [
    { label: "Müvekkil rolü", case_value: "Davacı", precedent_value: "Davalı" },
    { label: "Bilirkişi raporu", case_value: "Yok", precedent_value: "Var" },
  ],
  timeline: [
    { event_date: "2023-01-10", event_type: "filing", title: "Dava açıldı" },
    { event_date: "2023-06-01", event_type: "expert_report", title: "Bilirkişi raporu alındı" },
  ],
  facts: {
    ...sourceFacts, court: "Yargıtay 3. Hukuk Dairesi", court_type: null, client_role: "defendant",
    case_value: 100000, opening_date: "2023-01-10", decision_date: "2024-06-01", duration_months: 14,
    outcome: "won", evidence: ["Bilirkişi raporu", "İhtarname"], has_expert_report: true, document_count: 1,
  },
  ai_explanation: null,
};
const other: SimilarPrecedentDetail = {
  ...best, precedent_id: "p2", case_name: "Tahliye kararı", score: 31, linked_to_case: true, outcome: "lost",
  decision_date: "2025-02-01", duration_months: 6, case_value: null,
  explanation: { shared_terms: [], shared_statutes: [], matching_fields: ["Aynı kategori: Kira"], passages: [] },
  timeline: [], key_differences: [],
};

function response(items: SimilarPrecedentDetail[], extra: Partial<SimilarPrecedentsResponse["summary"]> = {}): SimilarPrecedentsResponse {
  return {
    summary: {
      count: items.length, outcomes: { won: 1, lost: 1 }, avg_duration_months: 10, duration_count: 2,
      avg_case_value: 100000, value_count: 1,
      available_courts: ["Ankara 2. Sulh Hukuk Mahkemesi", "Yargıtay 3. Hukuk Dairesi"], excluded_signals: [],
      ...extra,
    },
    source: sourceFacts,
    items,
  };
}

function rowsOf(list: HTMLElement) {
  return within(list).getAllByRole("listitem").filter((li) => li.parentElement === list);
}

beforeEach(() => vi.clearAllMocks());

describe("SimilarPrecedentsSidebar list", () => {
  it("shows the summary header and ranked cards with duration, amount and statutes", async () => {
    vi.mocked(getSimilarPrecedents).mockResolvedValue(response([best, other], { count: 12, outcomes: { won: 8, lost: 3, settled: 1 }, avg_duration_months: 14 }));
    render(<SimilarPrecedentsSidebar caseId="c1" canLink onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Benzer Davalar" })).toBeVisible();
    expect(getSimilarPrecedents).toHaveBeenCalledWith("c1", { limit: 20, outcome: [], court: null, minScore: 0 });
    const summary = await screen.findByLabelText("Özet");
    expect(summary).toHaveTextContent("12 emsal · 8 kazanıldı · 3 kaybedildi · 1 sulh · ort. 14 ay");
    expect(summary).toHaveTextContent("ilk 2 gösteriliyor");
    const rows = rowsOf(screen.getByRole("list", { name: "Benzer emsaller" }));
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByLabelText("Benzerlik 74 / 100")).toHaveTextContent("74");
    expect(within(rows[0]).getByText("Süre: 14 ay")).toBeVisible();
    expect(within(rows[0]).getByText(/Değer: ₺100\.000/)).toBeVisible();
    expect(within(rows[0]).getByText("TBK m. 344")).toBeVisible();
    expect(within(rows[0]).getByRole("link", { name: "Emsali aç" })).toHaveAttribute("href", "/emsaller?karar=p1");
    expect(within(rows[1]).getByText("Bağlı")).toBeVisible();
    expect(within(rows[1]).queryByText(/Değer:/)).toBeNull();
    expect(within(rows[1]).queryByRole("button", { name: /Neden benzer/ })).toBeNull();
  });

  it("reveals shared terms and highlighted passage pairs on demand", async () => {
    vi.mocked(getSimilarPrecedents).mockResolvedValue(response([best]));
    render(<SimilarPrecedentsSidebar caseId="c1" canLink={false} onClose={() => {}} />);
    const toggle = await screen.findByRole("button", { name: "Neden benzer?" });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const passages = screen.getByRole("list", { name: "Eşleşen pasajlar" });
    expect([...passages.querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["kira", "bedelini", "kira", "bedelini"]);
    expect(screen.queryByRole("button", { name: "Bu davaya bağla" })).toBeNull();
  });

  it("filters by outcome chips, court and minimum similarity through the API", async () => {
    vi.mocked(getSimilarPrecedents).mockResolvedValue(response([best, other]));
    render(<SimilarPrecedentsSidebar caseId="c1" canLink onClose={() => {}} />);
    const outcomes = await screen.findByRole("group", { name: "Sonuç" });
    await userEvent.click(within(outcomes).getByRole("button", { name: "Kazanıldı" }));
    expect(within(outcomes).getByRole("button", { name: "Kazanıldı" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(getSimilarPrecedents).toHaveBeenLastCalledWith("c1", { limit: 20, outcome: ["won"], court: null, minScore: 0 }));

    await userEvent.selectOptions(screen.getByLabelText("Mahkeme"), "Yargıtay 3. Hukuk Dairesi");
    await waitFor(() => expect(getSimilarPrecedents).toHaveBeenLastCalledWith(
      "c1", { limit: 20, outcome: ["won"], court: "Yargıtay 3. Hukuk Dairesi", minScore: 0 }));

    fireEvent.change(screen.getByLabelText(/En az benzerlik/), { target: { value: "40" } });
    expect(screen.getByLabelText(/En az benzerlik/)).toHaveValue("40");
    await waitFor(() => expect(getSimilarPrecedents).toHaveBeenLastCalledWith(
      "c1", { limit: 20, outcome: ["won"], court: "Yargıtay 3. Hukuk Dairesi", minScore: 40 }));

    vi.mocked(getSimilarPrecedents).mockResolvedValue(response([], { count: 0, outcomes: {} }));
    await userEvent.click(within(outcomes).getByRole("button", { name: "Sulh" }));
    expect(await screen.findByText("Filtrelere uyan emsal yok.")).toBeVisible();
    vi.mocked(getSimilarPrecedents).mockResolvedValue(response([best, other]));
    await userEvent.click(screen.getByRole("button", { name: "Temizle" }));
    await waitFor(() => expect(getSimilarPrecedents).toHaveBeenLastCalledWith("c1", { limit: 20, outcome: [], court: null, minScore: 0 }));
  });

  it("sorts on the client without another request", async () => {
    vi.mocked(getSimilarPrecedents).mockResolvedValue(response([best, other]));
    render(<SimilarPrecedentsSidebar caseId="c1" canLink onClose={() => {}} />);
    await screen.findByRole("list", { name: "Benzer emsaller" });
    const calls = vi.mocked(getSimilarPrecedents).mock.calls.length;
    await userEvent.selectOptions(screen.getByLabelText("Sırala"), "duration");
    const names = rowsOf(screen.getByRole("list", { name: "Benzer emsaller" }))
      .map((li) => within(li).getAllByRole("button")[0].textContent);
    expect(names).toEqual(["Tahliye kararı", "Kira bedelinin tespiti emsal kararı"]);
    expect(vi.mocked(getSimilarPrecedents).mock.calls.length).toBe(calls);
  });

  it("links a precedent and shows empty, error and close behaviour", async () => {
    vi.mocked(getSimilarPrecedents).mockResolvedValue(response([best]));
    vi.mocked(setPrecedentLink).mockResolvedValue(undefined);
    const onClose = vi.fn();
    const { unmount } = render(<SimilarPrecedentsSidebar caseId="c1" canLink onClose={onClose} />);
    await userEvent.click(await screen.findByRole("button", { name: "Bu davaya bağla" }));
    expect(setPrecedentLink).toHaveBeenCalledWith("c1", "p1", true);
    expect(await screen.findByRole("button", { name: "Bağlantıyı kaldır" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Benzer Davalar panelini kapat" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();

    vi.mocked(getSimilarPrecedents).mockResolvedValueOnce(response([], { count: 0, outcomes: {}, available_courts: [] }));
    const second = render(<SimilarPrecedentsSidebar caseId="c1" canLink onClose={() => {}} />);
    expect(await screen.findByText("Benzer emsal bulunamadı.")).toBeVisible();
    expect(screen.queryByRole("group", { name: "Filtreler" })).toBeNull();
    second.unmount();

    vi.mocked(getSimilarPrecedents).mockRejectedValueOnce(new Error("x"));
    render(<SimilarPrecedentsSidebar caseId="c1" canLink onClose={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Benzer emsaller yüklenemedi");
  });
});

describe("SimilarPrecedentsSidebar detail", () => {
  async function openDetail() {
    vi.mocked(getSimilarPrecedents).mockResolvedValue(response([best, other], { excluded_signals: ["Mahkeme"] }));
    render(<SimilarPrecedentsSidebar caseId="c1" canLink onClose={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: /Kira bedelinin tespiti emsal kararı: ayrıntılar/ }));
  }

  it("shows the score breakdown, timeline and key differences, and goes back to the list", async () => {
    await openDetail();
    expect(screen.getByRole("heading", { name: "Kira bedelinin tespiti emsal kararı" })).toHaveFocus();
    const breakdown = screen.getByRole("list", { name: "Puan dağılımı" });
    expect(within(breakdown).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Metin benzerliği35 / 60", "Kategori20 / 20", "Mahkeme9 / 10", "Ortak mevzuat10 / 10",
    ]);
    expect(screen.getByText(/Hesaba katılmadı \(bu davada kayıtlı değil\): Mahkeme/)).toBeVisible();
    const timeline = screen.getByRole("list", { name: "İzlenen yol" });
    expect(within(timeline).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "10.01.2023Dava açıldıDava açılışı / dilekçe", "01.06.2023Bilirkişi raporu alındıBilirkişi raporu",
    ]);
    const differences = screen.getByRole("list", { name: "Temel farklar" });
    expect(within(differences).getAllByRole("listitem")[0]).toHaveTextContent("Müvekkil rolüBu dava: DavacıEmsal: Davalı");
    await userEvent.click(screen.getByRole("button", { name: "← Tüm benzer emsaller" }));
    expect(screen.getByRole("list", { name: "Benzer emsaller" })).toBeVisible();
  });

  it("shows empty timeline and difference states", async () => {
    vi.mocked(getSimilarPrecedents).mockResolvedValue(response([other]));
    render(<SimilarPrecedentsSidebar caseId="c1" canLink onClose={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Tahliye kararı" }));
    expect(screen.getByText("Bu emsal için kayıtlı gelişme yok.")).toBeVisible();
    expect(screen.getByText("Kayıtlı bilgilerde temel bir fark bulunmadı.")).toBeVisible();
  });

  it("compares this case with the precedent side by side and marks differences", async () => {
    await openDetail();
    await userEvent.click(screen.getByRole("button", { name: "Karşılaştır" }));
    expect(screen.getByRole("button", { name: "Karşılaştır" })).toHaveAttribute("aria-pressed", "true");
    const table = screen.getByRole("table");
    const row = (label: string) => within(table).getByRole("rowheader", { name: new RegExp(`^${label}`) }).closest("tr")!;
    expect(row("Müvekkil rolü")).toHaveAttribute("data-different", "true");
    expect(row("Müvekkil rolü")).toHaveTextContent("DavacıDavalı");
    expect(within(row("Müvekkil rolü")).getByText("Farklı")).toBeVisible();
    expect(row("Kategori")).not.toHaveAttribute("data-different");
    expect(row("Mevzuat ve karar atıfları")).not.toHaveAttribute("data-different");
    // Shown for reference, never marked: they differ between any two files.
    expect(row("Karar tarihi")).toHaveTextContent("—01.06.2024");
    expect(row("Karar tarihi")).not.toHaveAttribute("data-different");
    expect(row("Sonuç")).not.toHaveAttribute("data-different");
    // A fact stored on one side only is not a difference.
    expect(row("Mahkeme türü")).toHaveTextContent("Sulh Hukuk—");
    expect(row("Mahkeme türü")).not.toHaveAttribute("data-different");
    // Close case values (120.000 vs 100.000) are not a difference; evidence sets are.
    expect(row("Dava değeri")).not.toHaveAttribute("data-different");
    expect(row("Delil türleri")).toHaveAttribute("data-different", "true");
    expect(row("Bilirkişi raporu")).toHaveTextContent("YokVar");
    await userEvent.click(screen.getByRole("button", { name: "Ayrıntı" }));
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("asks for the AI explanation with a loading state and shows the answer", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof explainSimilarPrecedent>>) => void;
    vi.mocked(explainSimilarPrecedent).mockReturnValue(new Promise((r) => { resolve = r; }));
    await openDetail();
    await userEvent.click(screen.getByRole("button", { name: "Yapay zekâ açıklaması" }));
    expect(explainSimilarPrecedent).toHaveBeenCalledWith("c1", "p1");
    expect(screen.getByRole("button", { name: "Hazırlanıyor…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Açıklama hazırlanıyor…");
    resolve({ status: "ai", text: "İki dosya da kira bedelinin tespitine ilişkindir.", notice: null });
    expect(await screen.findByText("İki dosya da kira bedelinin tespitine ilişkindir.")).toBeVisible();
    expect(screen.getByText(/doğrulama gerektirir/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Yeniden oluştur" })).toBeEnabled();
  });

  it("shows the server fallback notice and a request error", async () => {
    vi.mocked(explainSimilarPrecedent).mockResolvedValueOnce({
      status: "fallback", text: "Eşleşen bilgiler: Aynı kategori: Kira.",
      notice: "Yapay zekâ açıklaması zamanında alınamadı; kayıtlı verilerden hazırlanan özet gösteriliyor.",
    });
    await openDetail();
    await userEvent.click(screen.getByRole("button", { name: "Yapay zekâ açıklaması" }));
    expect(await screen.findByRole("note")).toHaveTextContent("zamanında alınamadı");
    expect(screen.getByText("Kayıtlı verilerden hazırlanan özet.")).toBeVisible();

    vi.mocked(explainSimilarPrecedent).mockRejectedValueOnce(new Error("network"));
    await userEvent.click(screen.getByRole("button", { name: "Yeniden oluştur" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Açıklama alınamadı");
    expect(screen.getByRole("button", { name: "Yeniden oluştur" })).toBeEnabled();
  });
});

describe("helpers", () => {
  it("splits text by offsets and ignores overlapping or out-of-range ones", () => {
    expect(highlightRuns("kira bedeli", [{ start: 5, end: 11 }, { start: 0, end: 4 }, { start: 2, end: 6 }, { start: 9, end: 40 }]))
      .toEqual([{ text: "kira", marked: true }, { text: " ", marked: false }, { text: "bedeli", marked: true }]);
    expect(highlightRuns("abc", [])).toEqual([{ text: "abc", marked: false }]);
  });

  it("builds the summary line only from stored values", () => {
    expect(summaryLine({
      count: 3, outcomes: { lost: 1, won: 2 }, avg_duration_months: 9.94, duration_count: 2,
      avg_case_value: null, value_count: 0, available_courts: [], excluded_signals: [],
    })).toBe("3 emsal · 2 kazanıldı · 1 kaybedildi · ort. 9,9 ay");
  });

  it("sorts with missing values last", () => {
    const undated = { ...other, precedent_id: "p3", decision_date: null };
    expect(sortItems([undated, best, other], "decision").map((i) => i.precedent_id)).toEqual(["p2", "p1", "p3"]);
    expect(sortItems([other, best], "value").map((i) => i.precedent_id)).toEqual(["p1", "p2"]);
  });
});
