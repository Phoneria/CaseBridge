import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const extractCaseIntake = vi.fn();
const createCase = vi.fn();
const addCaseEvent = vi.fn();
const uploadDocument = vi.fn();
const getMe = vi.fn();
const listAdminLawyers = vi.fn();
vi.mock("@/lib/api", () => ({
  extractCaseIntake: (...args: unknown[]) => extractCaseIntake(...args),
  createCase: (...args: unknown[]) => createCase(...args),
  addCaseEvent: (...args: unknown[]) => addCaseEvent(...args),
  uploadDocument: (...args: unknown[]) => uploadDocument(...args),
  getMe: (...args: unknown[]) => getMe(...args),
  listAdminLawyers: (...args: unknown[]) => listAdminLawyers(...args),
}));
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav } from "@/test/navigation";

import { ApiError } from "@/lib/apiError";

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

const scrollIntoView = vi.fn();

beforeEach(() => {
  for (const mock of [extractCaseIntake, createCase, addCaseEvent, uploadDocument, getMe, listAdminLawyers, scrollIntoView]) {
    mock.mockReset();
  }
  getMe.mockResolvedValue({ id: "u1", role: "lawyer" });
  createCase.mockResolvedValue({ id: "new-1" });
  addCaseEvent.mockResolvedValue({});
  uploadDocument.mockResolvedValue({});
  Element.prototype.scrollIntoView = scrollIntoView;
  resetNav();
});

async function fillFromPastedText() {
  await userEvent.click(screen.getByRole("tab", { name: "Metni yapıştır" }));
  await userEvent.type(screen.getByLabelText("Belge metni"), "dilekçe metni");
  await userEvent.click(screen.getByRole("button", { name: "Doldur" }));
  await screen.findByText("AI taslağıdır; kaydetmeden önce kontrol edin.");
}

describe("NewCaseView", () => {
  it("renders the four sections with a section menu", async () => {
    render(<NewCaseView />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Davayı oluştur" })).toHaveAttribute("aria-disabled", "false"));
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

async function fillRequired() {
  await userEvent.type(screen.getByLabelText(/^Dava no/), "2026/9 E.");
  await userEvent.type(screen.getByLabelText(/^Dava adı/), "Kira Alacağı");
  const first = screen.getByRole("group", { name: "Taraf 1" });
  await userEvent.type(within(first).getByLabelText(/^Ad/), "Alfa Ticaret A.Ş.");
  await userEvent.click(within(first).getByLabelText("Müvekkilimiz"));
}

const submit = () => userEvent.click(screen.getByRole("button", { name: "Davayı oluştur" }));

describe("NewCaseView create flow", () => {
  it("blocks an incomplete form, shows each error and scrolls to the first section with one", async () => {
    render(<NewCaseView />);
    await submit();

    expect(createCase).not.toHaveBeenCalled();
    expect(screen.getByText("Dava no gerekli.")).toBeInTheDocument();
    expect(screen.getByText("Dava adı gerekli.")).toBeInTheDocument();
    expect(screen.getByText("En az bir taraf müvekkil olarak işaretlenmeli.")).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect((scrollIntoView.mock.instances[0] as HTMLElement).id).toBe("bolum-temel");
  });

  it("scrolls to the parties section when only the client mark is missing", async () => {
    render(<NewCaseView />);
    await userEvent.type(screen.getByLabelText(/^Dava no/), "2026/9");
    await userEvent.type(screen.getByLabelText(/^Dava adı/), "Kira");
    await userEvent.type(within(screen.getByRole("group", { name: "Taraf 1" })).getByLabelText(/^Ad/), "Alfa");
    await submit();
    expect(createCase).not.toHaveBeenCalled();
    expect((scrollIntoView.mock.instances[0] as HTMLElement).id).toBe("bolum-taraflar");
  });

  it("creates a manually entered case with parties only and opens it", async () => {
    render(<NewCaseView />);
    await fillRequired();
    await submit();

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/davalar/new-1"));
    expect(createCase).toHaveBeenCalledWith({
      case_number: "2026/9 E.",
      case_name: "Kira Alacağı",
      case_type: "diger",
      status: "devam_eden",
      parties: [{ name: "Alfa Ticaret A.Ş.", role: "plaintiff", is_client: true, counsel_name: null }],
    });
    expect(addCaseEvent).not.toHaveBeenCalled();
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it("creates the case, then the chosen events, then the source text and extra documents in order", async () => {
    extractCaseIntake.mockResolvedValue(RESULT);
    const calls: string[] = [];
    createCase.mockImplementation(async () => {
      calls.push("case");
      return { id: "c9" };
    });
    addCaseEvent.mockImplementation(async (_id: string, payload: { title: string }) => {
      calls.push(`event:${payload.title}`);
    });
    uploadDocument.mockImplementation(async (_id: string, file: File) => {
      calls.push(`doc:${file.name}`);
    });

    render(<NewCaseView />);
    await userEvent.type(screen.getByLabelText(/^Dava no/), "2026/145");
    await fillFromPastedText();
    await userEvent.click(within(screen.getByRole("group", { name: "Taraf 1" })).getByLabelText("Müvekkilimiz"));
    await userEvent.upload(screen.getByLabelText("Belge ekle"), new File(["ek"], "ek-belge.pdf", { type: "application/pdf" }));
    await submit();

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/davalar/c9"));
    expect(calls).toEqual(["case", "event:Dava açıldı", "event:İlk duruşma", "doc:yapistirilan-metin.txt", "doc:ek-belge.pdf"]);
    expect(createCase.mock.calls[0][0]).toMatchObject({
      case_number: "2026/145",
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
        { name: "Alfa Ticaret A.Ş.", role: "plaintiff", is_client: true, counsel_name: "Av. Ece Kaya" },
        { name: "Beta Lojistik Ltd.", role: "defendant", is_client: false, counsel_name: null },
      ],
    });
    expect(addCaseEvent).toHaveBeenCalledWith("c9", {
      event_date: "2026-03-02",
      title: "Dava açıldı",
      event_type: "filing",
    });
  });

  it("skips unchecked events and the source document when they are switched off", async () => {
    extractCaseIntake.mockResolvedValue(RESULT);
    render(<NewCaseView />);
    await userEvent.type(screen.getByLabelText(/^Dava no/), "2026/145");
    await fillFromPastedText();
    await userEvent.click(within(screen.getByRole("group", { name: "Taraf 1" })).getByLabelText("Müvekkilimiz"));
    await userEvent.click(screen.getByLabelText(/İlk duruşma/));
    await userEvent.click(screen.getByLabelText("Kaynak belgeyi davaya ekle"));
    await submit();

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/davalar/new-1"));
    expect(addCaseEvent).toHaveBeenCalledTimes(1);
    expect(addCaseEvent.mock.calls[0][1].title).toBe("Dava açıldı");
    expect(uploadDocument).not.toHaveBeenCalled();
  });

  it("still opens the case and reports how many events and documents could not be added", async () => {
    extractCaseIntake.mockResolvedValue(RESULT);
    addCaseEvent.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({});
    uploadDocument.mockRejectedValueOnce(new Error("boom"));
    render(<NewCaseView />);
    await userEvent.type(screen.getByLabelText(/^Dava no/), "2026/145");
    await fillFromPastedText();
    await userEvent.click(within(screen.getByRole("group", { name: "Taraf 1" })).getByLabelText("Müvekkilimiz"));
    await submit();

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/davalar/new-1?eklenemeyen=2"));
    expect(addCaseEvent).toHaveBeenCalledTimes(2);
    expect(uploadDocument).toHaveBeenCalledTimes(1);
  });

  it("explains a duplicate case number and stays on the page", async () => {
    createCase.mockRejectedValueOnce(new ApiError("Case number already exists", 409));
    render(<NewCaseView />);
    await fillRequired();
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Bu dava numarası zaten kayıtlı.");
    expect(nav.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Davayı oluştur" })).toBeEnabled();
  });

  it("shows other creation errors with their detail", async () => {
    createCase.mockRejectedValueOnce(new ApiError("Sunucu hatası", 500));
    render(<NewCaseView />);
    await fillRequired();
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Dava oluşturulamadı: Sunucu hatası");
    expect(addCaseEvent).not.toHaveBeenCalled();
  });

  it("hides the lawyer select from lawyers", async () => {
    render(<NewCaseView />);
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    expect(screen.queryByLabelText(/^Sorumlu avukat/)).toBeNull();
    expect(listAdminLawyers).not.toHaveBeenCalled();
  });

  it("requires an admin to pick an active lawyer and sends the choice", async () => {
    getMe.mockResolvedValue({ id: "a1", role: "admin" });
    listAdminLawyers.mockResolvedValue([
      { id: "l1", full_name: "Av. Ece Kaya", department: "Ticaret", is_active: true },
      { id: "l2", full_name: "Av. Eski", department: "Ceza", is_active: false },
    ]);
    render(<NewCaseView />);
    const select = await screen.findByLabelText(/^Sorumlu avukat/);
    expect(within(select).queryByText(/Av. Eski/)).toBeNull();

    await fillRequired();
    await submit();
    expect(screen.getByText("Sorumlu avukat seçin.")).toBeInTheDocument();
    expect(createCase).not.toHaveBeenCalled();
    expect((scrollIntoView.mock.instances[0] as HTMLElement).id).toBe("bolum-belgeler");

    await userEvent.selectOptions(select, "l1");
    await submit();
    await waitFor(() => expect(createCase).toHaveBeenCalled());
    expect(createCase.mock.calls[0][0].assigned_lawyer_id).toBe("l1");
  });

  it("warns before leaving with unsaved input but not from a pristine form", async () => {
    render(<NewCaseView />);
    const pristine = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(pristine);
    expect(pristine.defaultPrevented).toBe(false);

    await userEvent.type(screen.getByLabelText(/^Dava adı/), "Kira");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it("does not warn after the case was created", async () => {
    render(<NewCaseView />);
    await fillRequired();
    await submit();
    await waitFor(() => expect(nav.push).toHaveBeenCalled());
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("NewCaseView create flow safeguards", () => {
  it("shows a Turkish fallback instead of a raw network error", async () => {
    createCase.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<NewCaseView />);
    await fillRequired();
    await submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Dava oluşturulamadı: Bilinmeyen hata.");
  });

  it("does nothing when submitted before the current user is known", async () => {
    getMe.mockReturnValue(new Promise(() => {}));
    render(<NewCaseView />);
    await fillRequired();
    await submit();
    expect(createCase).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Davayı oluştur" })).toHaveAttribute("aria-disabled", "true");
  });

  it("blocks an admin whose lawyer list failed and keeps the error visible", async () => {
    getMe.mockResolvedValue({ id: "a1", role: "admin" });
    listAdminLawyers.mockRejectedValue(new Error("boom"));
    render(<NewCaseView />);
    expect(await screen.findByText("Avukat listesi yüklenemedi.")).toBeInTheDocument();
    await fillRequired();
    await submit();
    await submit();
    expect(createCase).not.toHaveBeenCalled();
    expect(screen.getByText("Avukat listesi yüklenemedi.")).toBeInTheDocument();
  });

  it("blocks submit with a persistent error when the user cannot be loaded", async () => {
    getMe.mockRejectedValue(new Error("boom"));
    render(<NewCaseView />);
    expect(await screen.findByText("Kullanıcı bilgisi yüklenemedi.")).toBeInTheDocument();
    expect(screen.queryByText("Avukat listesi yüklenemedi.")).toBeNull();
    await fillRequired();
    await submit();
    expect(createCase).not.toHaveBeenCalled();
    expect(screen.getByText("Kullanıcı bilgisi yüklenemedi.")).toBeInTheDocument();
  });

  it("does not show a lawyer-list error to a lawyer", async () => {
    render(<NewCaseView />);
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    expect(screen.queryByText("Avukat listesi yüklenemedi.")).toBeNull();
  });

  it("sends only one request for two rapid submits", async () => {
    createCase.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ id: "x1" }), 50)));
    render(<NewCaseView />);
    await fillRequired();
    const button = screen.getByRole("button", { name: "Davayı oluştur" });
    await userEvent.dblClick(button);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/davalar/x1"));
    expect(createCase).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the first section with an error", async () => {
    render(<NewCaseView />);
    await submit();
    expect(screen.getByRole("heading", { name: "Temel bilgiler ve mahkeme" })).toHaveFocus();
  });
});
