import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const extractCaseIntake = vi.fn();
vi.mock("@/lib/api", () => ({
  extractCaseIntake: (...args: unknown[]) => extractCaseIntake(...args),
}));
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { resetNav } from "@/test/navigation";

import { NewCaseView } from "@/components/NewCaseView";
import type { CaseIntakeResult } from "@/types";

const RESULT: CaseIntakeResult = {
  truncated: false,
  source_chars: 900,
  draft: {
    case_name: "Alacak Davası",
    case_type: "ticaret_hukuku",
    court: "İstanbul 3. Asliye Ticaret Mahkemesi",
    court_file_number: "2026/145 E.",
    case_value: 150000,
    opening_date: "2026-03-02",
    next_hearing_date: "2026-05-12",
    claim: "150.000 TL alacağın tahsili",
    facts_summary: "Fatura bedeli ödenmedi.",
    plaintiff_position: "Mal teslim edildi.",
    defendant_position: "Mal ayıplıydı.",
    parties: [
      { name: "Alfa Ticaret A.Ş.", role: "plaintiff", counsel_name: "Av. Ece Kaya" },
      { name: "Beta Lojistik Ltd.", role: "defendant", counsel_name: null },
    ],
    events: [
      { event_date: "2026-03-02", title: "Dava açıldı", description: null, event_type: "filing" },
      { event_date: "2026-05-12", title: "İlk duruşma", description: null, event_type: "hearing" },
    ],
  },
};

beforeEach(() => {
  extractCaseIntake.mockReset();
  resetNav();
});

async function fillFromPastedText() {
  await userEvent.click(screen.getByRole("tab", { name: "Metni yapıştır" }));
  await userEvent.type(screen.getByLabelText("Belge metni"), "dilekçe metni");
  await userEvent.click(screen.getByRole("button", { name: "Doldur" }));
  await screen.findByText("AI taslağıdır; kaydetmeden önce kontrol edin.");
}

describe("NewCaseView", () => {
  it("renders the four sections with a section menu", () => {
    render(<NewCaseView />);
    expect(screen.getByRole("heading", { name: "Yeni dava" })).toBeInTheDocument();
    const menu = screen.getByRole("navigation", { name: "Bölümler" });
    const links = within(menu).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Temel bilgiler ve mahkeme",
      "Taraflar",
      "Uyuşmazlık",
      "Belgeler ve takip",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#bolum-temel",
      "#bolum-taraflar",
      "#bolum-uyusmazlik",
      "#bolum-belgeler",
    ]);
    for (const title of ["Temel bilgiler ve mahkeme", "Taraflar", "Uyuşmazlık", "Belgeler ve takip"]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("group", { name: /^Taraf \d$/ })).toHaveLength(2);
  });

  it("fills the sections from the draft, badges them and leaves the client unmarked", async () => {
    extractCaseIntake.mockResolvedValue(RESULT);
    render(<NewCaseView />);
    await fillFromPastedText();

    expect(screen.getByLabelText(/^Dava adı/)).toHaveValue("Alacak Davası");
    expect(screen.getByLabelText(/^Dava türü/)).toHaveValue("ticaret_hukuku");
    expect(screen.getByLabelText("Mahkeme")).toHaveValue("İstanbul 3. Asliye Ticaret Mahkemesi");
    expect(screen.getByLabelText("Esas no")).toHaveValue("2026/145 E.");
    expect(screen.getByLabelText("Dava değeri")).toHaveValue(150000);
    expect(screen.getByLabelText("Talep / dava konusu")).toHaveValue("150.000 TL alacağın tahsili");
    expect(screen.getByLabelText("Sonraki duruşma tarihi")).toHaveValue("2026-05-12");

    const first = screen.getByRole("group", { name: "Taraf 1" });
    expect(within(first).getByLabelText(/^Ad/)).toHaveValue("Alfa Ticaret A.Ş.");
    expect(within(first).getByLabelText("Vekili")).toHaveValue("Av. Ece Kaya");
    expect(within(first).getByLabelText("Müvekkilimiz")).not.toBeChecked();
    expect(screen.getByRole("group", { name: "Taraf 2" })).toBeInTheDocument();
    expect(screen.getByText("Müvekkilinizi işaretleyin.")).toBeInTheDocument();

    expect(within(screen.getByLabelText(/^Dava adı/).parentElement!).getByText("AI")).toBeInTheDocument();
    expect(within(screen.getByLabelText(/^Dava no/).parentElement!).queryByText("AI")).toBeNull();

    const events = screen.getByRole("list", { name: "Önerilen olaylar" });
    expect(within(events).getAllByRole("checkbox")).toHaveLength(2);
    expect(within(events).getAllByRole("checkbox").every((box) => (box as HTMLInputElement).checked)).toBe(true);
    const source = screen.getByLabelText("Kaynak belgeyi davaya ekle");
    expect(source).toBeChecked();
    expect(screen.getByText(/Yapıştırılan metin/, { selector: "span" })).toBeInTheDocument();
  });

  it("drops the AI badge once the field is edited", async () => {
    extractCaseIntake.mockResolvedValue(RESULT);
    render(<NewCaseView />);
    await fillFromPastedText();

    const name = screen.getByLabelText(/^Dava adı/);
    await userEvent.type(name, " (düzeltildi)");
    expect(within(name.parentElement!).queryByText("AI")).toBeNull();

    const first = screen.getByRole("group", { name: "Taraf 1" });
    expect(within(first).getByText("AI")).toBeInTheDocument();
    await userEvent.type(within(first).getByLabelText(/^Ad/), "x");
    expect(within(first).queryByText("AI")).toBeNull();
  });

  it("hides the client hint once a client is marked and relabels the positions", async () => {
    extractCaseIntake.mockResolvedValue(RESULT);
    render(<NewCaseView />);
    await fillFromPastedText();

    expect(screen.getByLabelText("Davacının iddiası")).toBeInTheDocument();
    expect(screen.getByLabelText("Davalının savunması")).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("group", { name: "Taraf 2" })).getByLabelText("Müvekkilimiz"));
    expect(screen.queryByText("Müvekkilinizi işaretleyin.")).toBeNull();
    expect(screen.getByLabelText("Davacının iddiası")).toHaveValue("Mal teslim edildi.");
    expect(screen.getByLabelText("Savunmamız (davalı)")).toHaveValue("Mal ayıplıydı.");
  });

  it("keeps the typed values and asks before a second fill overwrites them", async () => {
    extractCaseIntake.mockResolvedValue(RESULT);
    render(<NewCaseView />);
    await userEvent.type(screen.getByLabelText(/^Dava adı/), "Elle yazılan ad");
    await userEvent.click(screen.getByRole("tab", { name: "Metni yapıştır" }));
    await userEvent.type(screen.getByLabelText("Belge metni"), "dilekçe metni");
    await userEvent.click(screen.getByRole("button", { name: "Doldur" }));

    expect(await screen.findByText("Formdaki mevcut bilgiler AI taslağıyla değiştirilsin mi?")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Dava adı/)).toHaveValue("Elle yazılan ad");
    await userEvent.click(screen.getByRole("button", { name: "Değiştir" }));
    await waitFor(() => expect(screen.getByLabelText(/^Dava adı/)).toHaveValue("Alacak Davası"));
  });

  it("adds and removes party rows", async () => {
    render(<NewCaseView />);
    await userEvent.click(screen.getByRole("button", { name: "Taraf ekle" }));
    expect(screen.getAllByRole("group", { name: /^Taraf \d$/ })).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "Taraf 3 satırını kaldır" }));
    expect(screen.getAllByRole("group", { name: /^Taraf \d$/ })).toHaveLength(2);
  });

  it("asks first and keeps typed values the draft leaves null when typing happened during the request", async () => {
    let resolve!: (value: CaseIntakeResult) => void;
    extractCaseIntake.mockReturnValue(new Promise<CaseIntakeResult>((r) => (resolve = r)));
    render(<NewCaseView />);
    await userEvent.click(screen.getByRole("tab", { name: "Metni yapıştır" }));
    await userEvent.type(screen.getByLabelText("Belge metni"), "dilekçe metni");
    await userEvent.click(screen.getByRole("button", { name: "Doldur" }));
    await userEvent.type(screen.getByLabelText("Esas no"), "9/9");
    await userEvent.type(screen.getByLabelText("Mahkeme"), "Elle mahkeme");

    resolve({ ...RESULT, draft: { ...RESULT.draft, court: null } });
    expect(await screen.findByText("Formdaki mevcut bilgiler AI taslağıyla değiştirilsin mi?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Değiştir" }));
    expect(screen.getByLabelText("Mahkeme")).toHaveValue("Elle mahkeme");
    expect(screen.getByLabelText(/^Dava adı/)).toHaveValue("Alacak Davası");
  });

  it("drops stale party badges when a second draft replaces the parties", async () => {
    extractCaseIntake.mockResolvedValueOnce(RESULT);
    render(<NewCaseView />, { wrapper: StrictMode });
    await fillFromPastedText();

    extractCaseIntake.mockResolvedValueOnce({
      ...RESULT,
      draft: { ...RESULT.draft, parties: [{ name: "Gama A.Ş.", role: "plaintiff", counsel_name: null }] },
    });
    await userEvent.click(screen.getByRole("button", { name: "Doldur" }));
    await userEvent.click(await screen.findByRole("button", { name: "Değiştir" }));
    expect(screen.getAllByRole("group", { name: /^Taraf \d$/ })).toHaveLength(1);
    expect(screen.getByText("Müvekkilinizi işaretleyin.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^Ad/), "x");
    expect(screen.queryByText("Müvekkilinizi işaretleyin.")).toBeNull();
  });

  it("keeps text typed in a form field while the prompt is open", async () => {
    let resolve!: (value: CaseIntakeResult) => void;
    extractCaseIntake.mockReturnValue(new Promise<CaseIntakeResult>((r) => (resolve = r)));
    render(<NewCaseView />);
    await userEvent.click(screen.getByRole("tab", { name: "Metni yapıştır" }));
    await userEvent.type(screen.getByLabelText("Belge metni"), "dilekçe metni");
    await userEvent.click(screen.getByRole("button", { name: "Doldur" }));
    await userEvent.type(screen.getByLabelText("Mahkeme"), "Ankara");
    resolve(RESULT);
    await screen.findByRole("alertdialog");
    await userEvent.keyboard(" 3.");
    expect(screen.getByLabelText("Mahkeme")).toHaveValue("Ankara 3.");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});
