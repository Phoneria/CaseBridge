import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Flow 2: Login → Open Existing Case → Add Development →
// Run New Simulation → Compare Current Result

test("open existing case, add a development, run a new simulation", async ({ page }) => {
  await login(page);

  await page.getByRole("link", { name: "Davalar", exact: true }).click();
  await expect(page).toHaveURL(/\/davalar$/);

  // Open one of the seeded demo cases.
  await page.getByRole("link", { name: "Kiracı Tahliye Davası", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kiracı Tahliye Davası", exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Gelişmeler" }).click();
  await page.getByLabel("Tarih").fill("2026-08-20");
  await page.getByLabel("Gelişme Başlığı").fill("Bilirkişi raporu dosyaya girdi");
  await page.getByRole("button", { name: /^ekle$/i }).click();
  await expect(page.getByText("Bilirkişi raporu dosyaya girdi")).toBeVisible();

  await page.getByRole("tab", { name: "Genel Bakış" }).click();
  await page.getByRole("button", { name: "Analizi başlat" }).click();
  await expect(page.getByText("Son AI değerlendirmesi")).toBeVisible({ timeout: 30_000 });

  // A second analysis run should also complete and be listed alongside the first.
  await page.getByRole("button", { name: "Yeniden analiz et" }).click();
  await page.getByRole("tab", { name: "CaseBridge AI" }).click();
  await expect(page.getByText(/AI Değerlendirmesi: %/)).toHaveCount(2, { timeout: 30_000 });
});
