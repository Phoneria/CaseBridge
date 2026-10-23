import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CaseActionsMenu } from "@/components/CaseActionsMenu";

describe("CaseActionsMenu", () => {
  it("renders nothing when there is no action", () => {
    const { container } = render(<CaseActionsMenu actions={[]} busy={false} onPick={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the actions with their labels once opened", async () => {
    render(<CaseActionsMenu actions={["edit", "reopen", "archive"]} busy={false} onPick={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "İşlemler" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Bilgileri düzenle",
      "Yeniden aç",
      "Arşivle",
    ]);
  });

  it("reports the picked action, closes the menu and puts focus back on the button", async () => {
    const onPick = vi.fn();
    render(<CaseActionsMenu actions={["edit", "close"]} busy={false} onPick={onPick} />);
    const trigger = screen.getByRole("button", { name: "İşlemler" });

    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("menuitem", { name: "Davayı kapat" }));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith("close");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape and returns focus to the button", async () => {
    render(<CaseActionsMenu actions={["unarchive"]} busy={false} onPick={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "İşlemler" });
    await userEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("ignores a pick while an action is running (aria-disabled, not disabled)", async () => {
    const onPick = vi.fn();
    render(<CaseActionsMenu actions={["unarchive"]} busy onPick={onPick} />);
    await userEvent.click(screen.getByRole("button", { name: "İşlemler" }));

    const item = screen.getByRole("menuitem", { name: "Arşivden çıkar" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).not.toBeDisabled();
    await userEvent.click(item);

    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });
});
