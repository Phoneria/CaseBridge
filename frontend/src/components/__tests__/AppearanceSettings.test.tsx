import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { ThemeSync } from "@/components/ThemeSync";
import { getTheme, setTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme";

describe("application appearance preference", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.colorScheme = "dark";
  });

  it("defaults to dark and restores only a valid light preference before paint", () => {
    for (const preference of [null, "dark", "invalid", "light"]) {
      if (preference === null) localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, preference);
      document.documentElement.dataset.theme = "light";
      new Function(THEME_INIT_SCRIPT)();
      expect(getTheme()).toBe(preference === "light" ? "light" : "dark");
      expect(document.documentElement.style.colorScheme).toBe(getTheme());
    }
  });

  it("changes the current theme and persists the choice from Settings", () => {
    render(<AppearanceSettings />);
    expect(screen.getByRole("radio", { name: /Koyu/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Açık" }));
    expect(getTheme()).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(screen.getByRole("radio", { name: "Açık" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Koyu/ }));
    expect(getTheme()).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("stays usable if browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow();
    expect(getTheme()).toBe("dark");
    expect(() => setTheme("light")).not.toThrow();
    expect(getTheme()).toBe("light");
  });

  it("syncs another tab's preference and defaults to dark when cleared", () => {
    render(<><ThemeSync /><AppearanceSettings /></>);
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "light" })));
    expect(screen.getByRole("radio", { name: "Açık" })).toBeChecked();
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: "unrelated", newValue: "dark" })));
    expect(getTheme()).toBe("light");
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null, newValue: null })));
    expect(screen.getByRole("radio", { name: /Koyu/ })).toBeChecked();
  });
});
