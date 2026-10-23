import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CaseConfirmModal } from "@/components/CaseConfirmModal";
import { ApiError } from "@/lib/apiError";

function renderConfirm(onConfirm: () => Promise<void>, onClose = vi.fn()) {
  render(
    <CaseConfirmModal title="Dava arşivlensin mi?" message="Arşivli dava salt okunur olur." confirmLabel="Arşivle" fallbackError="Dava arşivlenemedi. Lütfen tekrar deneyin." onConfirm={onConfirm} onClose={onClose} />,
  );
  return onClose;
}

describe("CaseConfirmModal", () => {
  it("shows the question and runs the confirmation", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderConfirm(onConfirm);
    expect(screen.getByRole("dialog", { name: "Dava arşivlensin mi?" })).toBeInTheDocument();
    expect(screen.getByText("Arşivli dava salt okunur olur.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Arşivle" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("cancels without running anything", async () => {
    const onConfirm = vi.fn();
    const onClose = renderConfirm(onConfirm);
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the server's message and stays open on failure", async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new ApiError("Yalnızca kapalı davalar arşivlenebilir.", 409));
    renderConfirm(onConfirm);
    await userEvent.click(screen.getByRole("button", { name: "Arşivle" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Yalnızca kapalı davalar arşivlenebilir.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("falls back to the Turkish text for a network failure", async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderConfirm(onConfirm);
    await userEvent.click(screen.getByRole("button", { name: "Arşivle" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Dava arşivlenemedi. Lütfen tekrar deneyin.");
    expect(alert).not.toHaveTextContent("Failed to fetch");
  });

  it("runs once on a double click and locks Vazgeç and Escape while running", async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn().mockReturnValue(new Promise<void>((r) => (resolve = r)));
    const onClose = renderConfirm(onConfirm);
    await userEvent.click(screen.getByRole("button", { name: "Arşivle" }));
    await userEvent.click(screen.getByRole("button", { name: "Lütfen bekleyin..." }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Lütfen bekleyin..." })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => resolve());
  });
});
