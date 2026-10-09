import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const extractCaseIntake = vi.fn();
vi.mock("@/lib/api", () => ({
  extractCaseIntake: (...args: unknown[]) => extractCaseIntake(...args),
}));

import { IntakeFillBox } from "@/components/case-form/IntakeFillBox";
import { ApiError } from "@/lib/apiError";
import type { CaseIntakeResult } from "@/types";

const RESULT: CaseIntakeResult = {
  truncated: false,
  source_chars: 120,
  draft: {
    case_name: "Alacak Davası",
    case_type: "ticaret_hukuku",
    court: null,
    court_file_number: null,
    case_value: null,
    opening_date: null,
    next_hearing_date: null,
    claim: null,
    facts_summary: null,
    plaintiff_position: null,
    defendant_position: null,
    parties: [],
    events: [],
  },
};

beforeEach(() => extractCaseIntake.mockReset());

async function pasteAndFill(text = "Davacı vekili dilekçesi") {
  await userEvent.click(screen.getByRole("tab", { name: "Metni yapıştır" }));
  await userEvent.type(screen.getByLabelText("Belge metni"), text);
  await userEvent.click(screen.getByRole("button", { name: "Doldur" }));
}

describe("IntakeFillBox", () => {
  it("keeps Doldur disabled until there is a file or text", async () => {
    render(<IntakeFillBox hasContent={false} onDraft={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Belgeden doldur" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Doldur" })).toBeDisabled();
    await userEvent.click(screen.getByRole("tab", { name: "Metni yapıştır" }));
    expect(screen.getByRole("button", { name: "Doldur" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Belge metni"), "metin");
    expect(screen.getByRole("button", { name: "Doldur" })).toBeEnabled();
  });

  it("sends pasted text, shows the loading state and hands the draft over with a .txt source", async () => {
    let resolve!: (value: CaseIntakeResult) => void;
    extractCaseIntake.mockReturnValue(new Promise<CaseIntakeResult>((r) => (resolve = r)));
    const onDraft = vi.fn();
    render(<IntakeFillBox hasContent={false} onDraft={onDraft} />);

    await pasteAndFill();
    expect(extractCaseIntake).toHaveBeenCalledWith({ text: "Davacı vekili dilekçesi" });
    expect(screen.getByRole("button", { name: "Belge okunuyor…" })).toBeDisabled();

    resolve(RESULT);
    await waitFor(() => expect(onDraft).toHaveBeenCalledTimes(1));
    const [result, source] = onDraft.mock.calls[0];
    expect(result).toBe(RESULT);
    expect(source.label).toBe("Yapıştırılan metin");
    expect(source.file.name).toBe("yapistirilan-metin.txt");
    expect(screen.getByText("AI taslağıdır; kaydetmeden önce kontrol edin.")).toBeInTheDocument();
    expect(screen.queryByText("Belge uzun olduğu için yalnızca ilk kısmı okundu.")).toBeNull();
    expect(screen.getByRole("button", { name: "Doldur" })).toBeEnabled();
  });

  it("sends a chosen file and uses its name as the source", async () => {
    extractCaseIntake.mockResolvedValue({ ...RESULT, truncated: true });
    const onDraft = vi.fn();
    render(<IntakeFillBox hasContent={false} onDraft={onDraft} />);
    const file = new File(["x"], "dilekce.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByLabelText("Doldurulacak belge"), file);
    await userEvent.click(screen.getByRole("button", { name: "Doldur" }));

    await waitFor(() => expect(onDraft).toHaveBeenCalled());
    expect(extractCaseIntake).toHaveBeenCalledWith({ file });
    expect(onDraft.mock.calls[0][1]).toEqual({ label: "dilekce.pdf", file });
    expect(screen.getByText("Belge uzun olduğu için yalnızca ilk kısmı okundu.")).toBeInTheDocument();
  });

  it("rejects an unsupported file before calling the API", async () => {
    render(<IntakeFillBox hasContent={false} onDraft={vi.fn()} />);
    await userEvent
      .setup({ applyAccept: false })
      .upload(screen.getByLabelText("Doldurulacak belge"), new File(["x"], "foto.png", { type: "image/png" }));
    expect(screen.getByRole("alert")).toHaveTextContent("foto.png desteklenmeyen bir dosya türü (pdf, docx, txt).");
    expect(screen.getByRole("button", { name: "Doldur" })).toBeDisabled();
    expect(extractCaseIntake).not.toHaveBeenCalled();
  });

  it("shows the backend detail in an alert and does not hand over a draft on failure", async () => {
    extractCaseIntake.mockRejectedValueOnce(new ApiError("AI zamanında yanıt vermedi. Lütfen tekrar deneyin.", 504));
    const onDraft = vi.fn();
    render(<IntakeFillBox hasContent={false} onDraft={onDraft} />);
    await pasteAndFill();
    expect(await screen.findByRole("alert")).toHaveTextContent("AI zamanında yanıt vermedi. Lütfen tekrar deneyin.");
    expect(onDraft).not.toHaveBeenCalled();
    expect(screen.queryByText("AI taslağıdır; kaydetmeden önce kontrol edin.")).toBeNull();
  });

  it("asks before overwriting a filled form and applies the draft only after confirmation", async () => {
    extractCaseIntake.mockResolvedValue(RESULT);
    const onDraft = vi.fn();
    render(<IntakeFillBox hasContent onDraft={onDraft} />);
    await pasteAndFill();

    expect(await screen.findByText("Formdaki mevcut bilgiler AI taslağıyla değiştirilsin mi?")).toBeInTheDocument();
    expect(onDraft).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Değiştir" }));
    expect(onDraft).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Formdaki mevcut bilgiler AI taslağıyla değiştirilsin mi?")).toBeNull();
    expect(screen.getByText("AI taslağıdır; kaydetmeden önce kontrol edin.")).toBeInTheDocument();
  });

  it("keeps the form untouched when the overwrite is declined", async () => {
    extractCaseIntake.mockResolvedValue(RESULT);
    const onDraft = vi.fn();
    render(<IntakeFillBox hasContent onDraft={onDraft} />);
    await pasteAndFill();
    await userEvent.click(await screen.findByRole("button", { name: "Vazgeç" }));
    expect(onDraft).not.toHaveBeenCalled();
    expect(screen.queryByText("Formdaki mevcut bilgiler AI taslağıyla değiştirilsin mi?")).toBeNull();
    expect(screen.queryByText("AI taslağıdır; kaydetmeden önce kontrol edin.")).toBeNull();
  });
});
