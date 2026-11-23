import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { getSimilarPrecedents, setPrecedentLink } from "@/lib/api";
import { SimilarPrecedentsSidebar, highlightRuns } from "@/components/similar/SimilarPrecedentsSidebar";
import type { SimilarPrecedent } from "@/types";

vi.mock("@/lib/api", () => ({ getSimilarPrecedents: vi.fn(), setPrecedentLink: vi.fn() }));

const best: SimilarPrecedent = {
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
};
const other: SimilarPrecedent = {
  ...best, precedent_id: "p2", case_name: "Tahliye kararı", score: 31, linked_to_case: true,
  explanation: { shared_terms: [], shared_statutes: [], matching_fields: ["Aynı kategori: Kira"], passages: [] },
};

beforeEach(() => vi.clearAllMocks());

describe("SimilarPrecedentsSidebar", () => {
  it("shows ranked precedents with score, matching fields, statutes and a link to each decision", async () => {
    vi.mocked(getSimilarPrecedents).mockResolvedValue([best, other]);
    render(<SimilarPrecedentsSidebar caseId="c1" canLink onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Benzer Davalar" })).toBeVisible();
    expect(getSimilarPrecedents).toHaveBeenCalledWith("c1", 8);
    const list = await screen.findByRole("list", { name: "Benzer emsaller" });
    const rows = within(list).getAllByRole("listitem").filter((li) => li.parentElement === list);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByLabelText("Benzerlik 74 / 100")).toHaveTextContent("74");
    expect(within(rows[0]).getByText("Kazanıldı")).toBeVisible();
    expect(within(rows[0]).getByText("TBK m. 344")).toBeVisible();
    expect(within(rows[0]).getByText("Yakın dava değeri")).toBeVisible();
    expect(within(rows[0]).getByRole("link", { name: "Emsali aç" })).toHaveAttribute("href", "/emsaller?karar=p1");
    expect(within(rows[1]).getByText("Bağlı")).toBeVisible();
    expect(within(rows[1]).queryByRole("button", { name: /Neden benzer/ })).toBeNull();
    expect(screen.getByText(/yapay zekâ yorumu içermez/)).toBeVisible();
  });

  it("reveals shared terms and highlighted passage pairs on demand", async () => {
    vi.mocked(getSimilarPrecedents).mockResolvedValue([best]);
    render(<SimilarPrecedentsSidebar caseId="c1" canLink={false} onClose={() => {}} />);
    const toggle = await screen.findByRole("button", { name: "Neden benzer?" });
    expect(screen.queryByRole("list", { name: "Eşleşen pasajlar" })).toBeNull();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("list", { name: "Ortak anahtar terimler" })).toHaveTextContent("bedelini");
    const passages = screen.getByRole("list", { name: "Eşleşen pasajlar" });
    expect(within(passages).getByText("Emsal · Belge: karar.txt")).toBeVisible();
    const marks = passages.querySelectorAll("mark");
    expect([...marks].map((m) => m.textContent)).toEqual(["kira", "bedelini", "kira", "bedelini"]);
    expect(screen.queryByRole("button", { name: "Bu davaya bağla" })).toBeNull();
  });

  it("links and unlinks a precedent for users who may edit the case", async () => {
    vi.mocked(getSimilarPrecedents).mockResolvedValue([best]);
    vi.mocked(setPrecedentLink).mockResolvedValue(undefined);
    render(<SimilarPrecedentsSidebar caseId="c1" canLink onClose={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "Bu davaya bağla" }));
    expect(setPrecedentLink).toHaveBeenCalledWith("c1", "p1", true);
    expect(await screen.findByRole("button", { name: "Bağlantıyı kaldır" })).toBeVisible();
  });

  it("shows empty and error states", async () => {
    vi.mocked(getSimilarPrecedents).mockResolvedValueOnce([]);
    const { unmount } = render(<SimilarPrecedentsSidebar caseId="c1" canLink onClose={() => {}} />);
    expect(await screen.findByText("Benzer emsal bulunamadı.")).toBeVisible();
    unmount();
    vi.mocked(getSimilarPrecedents).mockRejectedValueOnce(new Error("x"));
    render(<SimilarPrecedentsSidebar caseId="c1" canLink onClose={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Benzer emsaller yüklenemedi");
  });

  it("closes with Escape and the close button", async () => {
    vi.mocked(getSimilarPrecedents).mockResolvedValue([]);
    const onClose = vi.fn();
    render(<SimilarPrecedentsSidebar caseId="c1" canLink onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Benzer Davalar panelini kapat" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("highlightRuns", () => {
  it("splits text by offsets and ignores overlapping or out-of-range ones", () => {
    expect(highlightRuns("kira bedeli", [{ start: 5, end: 11 }, { start: 0, end: 4 }, { start: 2, end: 6 }, { start: 9, end: 40 }]))
      .toEqual([
        { text: "kira", marked: true }, { text: " ", marked: false }, { text: "bedeli", marked: true },
      ]);
    expect(highlightRuns("abc", [])).toEqual([{ text: "abc", marked: false }]);
  });
});
