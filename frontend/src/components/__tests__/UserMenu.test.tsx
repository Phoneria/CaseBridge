import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const logout = vi.fn();
const getMe = vi.fn();
vi.mock("@/lib/api", () => ({
  logout: (...args: unknown[]) => logout(...args),
  getMe: (...args: unknown[]) => getMe(...args),
}));
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
vi.mock("@/components/Sidebar", () => ({ Sidebar: () => <nav aria-label="Ana menü" /> }));
vi.mock("@/components/CaseQuickView", () => ({ CaseQuickView: () => null }));
vi.mock("@/components/GlobalSearch", () => ({ GlobalSearch: () => null }));
vi.mock("@/components/UpcomingNotifications", () => ({ UpcomingNotifications: () => null }));
import { nav, resetNav, setUrl } from "@/test/navigation";

import { AppShell } from "@/components/AppShell";
import { UserMenu } from "@/components/UserMenu";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { announceUserUpdated } from "@/lib/userEvents";
import type { AppUser } from "@/types";

const ADMIN: AppUser = {
  id: "u1", email: "ayse@example.com", full_name: "Ayşe Demir", department: null, gender: null,
  role: "admin", law_firm_id: "f1", is_active: true,
};

beforeEach(() => {
  logout.mockReset();
  getMe.mockReset();
  resetNav();
});

describe("UserMenu", () => {
  it("shows the name and role and keeps the menu closed until it is opened", async () => {
    const user = userEvent.setup();
    render(<UserMenu user={ADMIN} />);

    const trigger = screen.getByRole("button", { name: "Kullanıcı menüsü, Ayşe Demir" });
    expect(trigger).toHaveTextContent("Ayşe Demir");
    expect(trigger).toHaveTextContent("Yönetici");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Hesabım" })).toHaveAttribute("href", "/hesabim");
    expect(screen.getByRole("menuitem", { name: "Çıkış yap" })).toBeInTheDocument();
  });

  it("shows Avukat for a lawyer and a neutral label before the user is loaded", () => {
    const { rerender } = render(<UserMenu user={{ ...ADMIN, role: "lawyer" }} />);
    expect(screen.getByRole("button")).toHaveTextContent("Avukat");

    rerender(<UserMenu user={null} />);
    expect(screen.getByRole("button", { name: "Kullanıcı menüsü, Kullanıcı" })).toBeInTheDocument();
  });

  it("closes on Escape (focus returns to the button) and on an outside click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Dışarıda</button>
        <UserMenu user={ADMIN} />
      </div>,
    );
    const trigger = screen.getByRole("button", { name: /Kullanıcı menüsü/ });

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Dışarıda" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("logs out: calls the endpoint, then goes to /login", async () => {
    logout.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<UserMenu user={ADMIN} />);

    await user.click(screen.getByRole("button", { name: /Kullanıcı menüsü/ }));
    await user.click(screen.getByRole("menuitem", { name: "Çıkış yap" }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login"));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("ignores a second click on Çıkış yap while the first is running (aria-disabled, not disabled)", async () => {
    let finish: () => void = () => undefined;
    logout.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<UserMenu user={ADMIN} />);

    await user.click(screen.getByRole("button", { name: /Kullanıcı menüsü/ }));
    const item = screen.getByRole("menuitem", { name: "Çıkış yap" });
    await user.click(item);
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).not.toBeDisabled();
    await user.click(item);
    expect(logout).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1));
  });

  it("is part of the workspace header", () => {
    setUrl("/hesabim");
    render(<WorkspaceHeader user={ADMIN} />);

    const crumb = within(screen.getByRole("banner")).getAllByRole("link", { name: "Hesabım" })[0];
    expect(crumb).toHaveAttribute("href", "/hesabim");
    expect(screen.getByRole("button", { name: /Kullanıcı menüsü/ })).toBeInTheDocument();
  });
});

describe("AppShell", () => {
  it("updates the header when the account page announces a new name", async () => {
    let resolveMe: (user: AppUser) => void = () => undefined;
    getMe.mockReturnValue(new Promise<AppUser>((resolve) => (resolveMe = resolve)));
    window.localStorage.setItem("casebridge_token", "tok");
    render(
      <AppShell>
        <p>içerik</p>
      </AppShell>,
    );
    await act(async () => resolveMe(ADMIN));

    expect(screen.getByRole("button", { name: "Kullanıcı menüsü, Ayşe Demir" })).toBeInTheDocument();

    await act(async () => announceUserUpdated({ ...ADMIN, full_name: "Ayşe Yılmaz" }));

    expect(screen.getByRole("button", { name: "Kullanıcı menüsü, Ayşe Yılmaz" })).toBeInTheDocument();
    window.localStorage.clear();
  });

  it("sends a visitor without a token to /login", () => {
    window.localStorage.clear();
    render(
      <AppShell>
        <p>içerik</p>
      </AppShell>,
    );

    expect(nav.replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("içerik")).not.toBeInTheDocument();
  });
});
