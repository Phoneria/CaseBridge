import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Flow 4: Login → Open Case → Generate Case Handover Summary →
// View Handover Report

test("generate and view a case handover report", async ({ page }) => {
  await login(page);

  await page.getByRole("link", { name: "Davalar", exact: true }).click();
  await page.getByRole("link", { name: "İşe İade Davası", exact: true }).click();
  await expect(page.getByRole("heading", { name: "İşe İade Davası" })).toBeVisible();

  await page.getByRole("tab", { name: "Devir Raporu" }).click();
  await page.getByRole("button", { name: /devir raporu oluştur/i }).click();

  await expect(page.getByText("Mevcut Durum")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/duruşma bekleniyor|dava devam ediyor|karar bekleniyor|dava kapatıldı/i)).toBeVisible();
});
