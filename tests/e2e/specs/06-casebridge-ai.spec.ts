import { test, expect, Page } from "@playwright/test";
import { login } from "./helpers";

// Flow 6: CaseBridge AI area — dashboard entry, legacy redirect,
// and starting an analysis from /ai/analiz.

// The backend limits logins to 5 per 60s; this is the 6th login of the suite,
// so wait out the window if the first attempt is rejected.
async function loginWithRateLimitRetry(page: Page) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await login(page);
      return;
    } catch (err) {
      if (attempt === 5) throw err;
      await page.waitForTimeout(10_000);
    }
  }
}

test("reach CaseBridge AI from the dashboard and start an analysis", async ({ page }) => {
  test.setTimeout(150_000);
  await loginWithRateLimitRetry(page);

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
