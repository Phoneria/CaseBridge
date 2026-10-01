import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Flow 1: Login → Dashboard → Create Case → Upload Document →
// Run Simulation → View Result

test("full case lifecycle: create, upload document, run simulation", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("link", { name: "Davalar", exact: true }).click();
  await expect(page).toHaveURL(/\/davalar$/);

  await page.getByRole("button", { name: /yeni dava/i }).click();
  const caseNumber = `E2E-${Date.now()}`;
  await page.locator("#case_number").fill(caseNumber);
  await page.locator("#case_name").fill("E2E Test Davası");
  await page.locator("#client_name").fill("E2E Müvekkil");
  await page.locator("#opposing_party").fill("E2E Karşı Taraf");
  await page.getByRole("button", { name: "Kaydet" }).click();

  const caseLink = page.getByRole("link", { name: "E2E Test Davası", exact: true });
  await expect(caseLink).toBeVisible();
  await caseLink.click();

  await expect(page.getByRole("heading", { name: "E2E Test Davası", exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Belgeler" }).click();
  await page.getByLabel(/belge yükle/i).setInputFiles({
    name: "beyan.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Bu bir E2E test belgesidir."),
  });
  await expect(page.getByText("beyan.txt")).toBeVisible();

  await page.getByRole("tab", { name: "Genel Bakış" }).click();
  await page.getByRole("button", { name: "Analizi başlat" }).click();
  await expect(page.getByText("Son AI değerlendirmesi")).toBeVisible({ timeout: 30_000 });
});
