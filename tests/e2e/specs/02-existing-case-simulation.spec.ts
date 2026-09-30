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
  await page.getByRole("button", { name: /simülasyonu başlat/i }).click();
  await expect(page.getByText(/AI Değerlendirmesi: %/)).toBeVisible({ timeout: 30_000 });

  // A second simulation run should also complete and be listed alongside the first.
  await page.getByRole("button", { name: /simülasyonu başlat/i }).click();
  await expect(page.getByText(/AI Değerlendirmesi: %/)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("tab", { name: "Simülasyonlar" }).click();
  const results = page.getByText(/AI Değerlendirmesi: %/);
  await expect(results).toHaveCount(2);
});
