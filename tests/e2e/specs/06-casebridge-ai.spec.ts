import { test, expect } from "@playwright/test";
import { login, DEMO_LAWYER } from "./helpers";

// Flow 6: CaseBridge AI area — dashboard entry, legacy redirect,
// and starting an analysis from /ai/analiz.

test("reach CaseBridge AI from the dashboard and start an analysis", async ({ page }) => {
  await login(page, DEMO_LAWYER);

  await page.getByRole("link", { name: "Duruşmaya gir" }).first().click();
  await expect(page).toHaveURL(/\/ai\/durusma$/);
  await expect(page.getByRole("heading", { level: 1, name: "Canlı Duruşma" })).toBeVisible();

  await page.goto("/simulasyonlar");
  await expect(page).toHaveURL(/\/ai$/);
  await expect(page.getByRole("heading", { level: 1, name: "CaseBridge AI" })).toBeVisible();

  await page.getByRole("link", { name: "Dosya Analizi", exact: true }).click();
  await expect(page).toHaveURL(/\/ai\/analiz$/);
  await page.getByRole("list", { name: "Davalar" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "Analizi başlat" }).click();

  await expect(page).toHaveURL(/\/davalar\/[^/?]+\?sekme=ai$/);
  await expect(page.getByRole("tab", { name: "CaseBridge AI" })).toHaveAttribute("aria-selected", "true");
});
