import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const downloadCasesCsv = vi.fn();

vi.mock("@/lib/api", () => ({
  downloadCasesCsv: (...args: unknown[]) => downloadCasesCsv(...args),
}));

import { ReportsView } from "@/components/ReportsView";

beforeEach(() => {
  downloadCasesCsv.mockReset();
  global.URL.createObjectURL = vi.fn(() => "blob:mock");
  global.URL.revokeObjectURL = vi.fn();
});

describe("ReportsView", () => {
  it("lets the user download the case CSV report", async () => {
    downloadCasesCsv.mockResolvedValue(new Blob(["a,b\n1,2"], { type: "text/csv" }));

    render(<ReportsView />);
    await userEvent.click(screen.getByRole("button", { name: /csv olarak/i }));

    await waitFor(() => expect(downloadCasesCsv).toHaveBeenCalled());
  });

  it("shows an error message when the download fails", async () => {
    downloadCasesCsv.mockRejectedValue(new Error("boom"));

    render(<ReportsView />);
    await userEvent.click(screen.getByRole("button", { name: /csv olarak/i }));

    await waitFor(() => expect(screen.getByText(/rapor indirilemedi/i)).toBeInTheDocument());
  });
});
