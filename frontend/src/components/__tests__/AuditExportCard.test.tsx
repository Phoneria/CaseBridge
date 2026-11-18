import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const downloadAuditCsv = vi.fn();
const saveBlob = vi.fn();
vi.mock("@/lib/api", () => ({ downloadAuditCsv: (...args: unknown[]) => downloadAuditCsv(...args) }));
vi.mock("@/lib/download", () => ({ saveBlob: (...args: unknown[]) => saveBlob(...args) }));

import { ApiError } from "@/lib/apiError";
import { AuditExportCard, defaultAuditRange } from "@/components/platform/AuditExportCard";

const FIRMS = [
  { id: "f1", name: "Demir Hukuk", created_at: null, is_active: true, suspended_at: null, active_user_count: 3, admins: [] },
  { id: "f2", name: "Kaya Hukuk", created_at: null, is_active: true, suspended_at: null, active_user_count: 1, admins: [] },
];

beforeEach(() => {
  downloadAuditCsv.mockReset();
  saveBlob.mockReset();
});

describe("defaultAuditRange", () => {
  it("is the last 30 days ending today in UTC", () => {
    expect(defaultAuditRange(new Date("2026-11-17T23:30:00+03:00"))).toEqual({ from: "2026-10-19", to: "2026-11-17" });
  });
});

describe("AuditExportCard", () => {
  it("downloads all firms for the default range", async () => {
    const blob = new Blob(["x"]);
    downloadAuditCsv.mockResolvedValue(blob);
    render(<AuditExportCard firms={FIRMS} />);
    const range = defaultAuditRange(new Date());
    expect(screen.getByRole("heading", { name: "Hareket kayıtları" })).toBeInTheDocument();
    expect(screen.getByLabelText("Büro")).toHaveValue("");
    expect(screen.getByLabelText("Başlangıç")).toHaveValue(range.from);
    expect(screen.getByLabelText("Bitiş")).toHaveValue(range.to);
    await userEvent.click(screen.getByRole("button", { name: "CSV indir" }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, `casebridge-hareketler-${range.from}-${range.to}.csv`));
    expect(downloadAuditCsv).toHaveBeenCalledWith({ firmId: undefined, from: range.from, to: range.to });
  });

  it("sends the chosen firm and dates", async () => {
    downloadAuditCsv.mockResolvedValue(new Blob(["x"]));
    render(<AuditExportCard firms={FIRMS} />);
    await userEvent.selectOptions(screen.getByLabelText("Büro"), "f2");
    await userEvent.clear(screen.getByLabelText("Başlangıç"));
    await userEvent.type(screen.getByLabelText("Başlangıç"), "2026-01-01");
    await userEvent.click(screen.getByRole("button", { name: "CSV indir" }));
    await waitFor(() => expect(downloadAuditCsv).toHaveBeenCalledWith(expect.objectContaining({ firmId: "f2", from: "2026-01-01" })));
  });

  it("shows the server's message and ignores a second click while downloading", async () => {
    let reject: (error: unknown) => void = () => {};
    downloadAuditCsv.mockReturnValue(new Promise((_, r) => { reject = r; }));
    render(<AuditExportCard firms={FIRMS} />);
    const button = screen.getByRole("button", { name: "CSV indir" });
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(button);
    expect(downloadAuditCsv).toHaveBeenCalledTimes(1);
    reject(new ApiError("En fazla 366 günlük kayıt indirilebilir.", 422));
    expect(await screen.findByRole("alert")).toHaveTextContent("En fazla 366 günlük kayıt indirilebilir.");
  });
});
