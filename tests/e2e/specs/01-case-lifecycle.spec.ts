import { test, expect } from "@playwright/test";
import { DEMO_LAWYER, login } from "./helpers";

// Flow 1: Login → Dashboard → New case page (manual) → Upload Document →
// Run Simulation → View Result, then a second case created with
// "Belgeden doldur" (pasted text, mock AI) → check the detail cards.
// Both cases are created in this one test so the suite logs in only once
// here (the login endpoint is rate limited to 5 attempts per user per minute).

const DETAIL_URL = /\/davalar\/[0-9a-f-]{36}$/;

test("full case lifecycle: create, upload document, run simulation, create from a document", async ({ page }) => {
  test.setTimeout(120_000);
  // A lawyer (not the admin) so the case is assigned automatically and the login lands on /dashboard.
  await login(page, DEMO_LAWYER);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("link", { name: "Davalar", exact: true }).click();
  await expect(page).toHaveURL(/\/davalar$/);

  await page.getByRole("link", { name: /yeni dava/i }).click();
  await expect(page).toHaveURL(/\/davalar\/yeni$/);
  await expect(page.getByRole("heading", { name: "Yeni dava" })).toBeVisible();

  const caseNumber = `E2E-${Date.now()}`;
  await page.locator("#case_number").fill(caseNumber);
  await page.locator("#case_name").fill("E2E Test Davası");
  const firstParty = page.getByRole("group", { name: "Taraf 1" });
  await firstParty.getByLabel(/^Ad/).fill("E2E Müvekkil");
  await firstParty.getByLabel("Müvekkilimiz").check();
  await page.getByRole("group", { name: "Taraf 2" }).getByLabel(/^Ad/).fill("E2E Karşı Taraf");
  await page.getByRole("button", { name: "Davayı oluştur" }).click();

  await expect(page).toHaveURL(DETAIL_URL);
  await expect(page.getByRole("heading", { name: "E2E Test Davası", exact: true })).toBeVisible();
  await expect(page.getByText("E2E Müvekkil vs. E2E Karşı Taraf")).toBeVisible();

  await page.getByRole("tab", { name: "Belgeler" }).click();
  await page.getByLabel(/belge yükle/i).setInputFiles({
    name: "beyan.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Bu bir E2E test belgesidir."),
  });
  // The viewer also shows the opened document, so match the list entry only.
  await expect(page.getByRole("button", { name: /beyan\.txt/ })).toBeVisible();

  await page.getByRole("tab", { name: "Genel Bakış" }).click();
  await page.getByRole("button", { name: "Analizi başlat" }).click();
  await expect(page.getByText("Son AI değerlendirmesi")).toBeVisible({ timeout: 30_000 });

  // --- Belgeden doldur: pasted text → mock draft → mark the client → create ---
  await page.goto("/davalar/yeni");
  await page.getByRole("tab", { name: "Metni yapıştır" }).click();
  await page.getByLabel("Belge metni").fill("DAVA DİLEKÇESİ\nDavacı Örnek Ticaret A.Ş., davalı Mavi Yapı Ltd. Şti.");
  await page.getByRole("button", { name: "Doldur" }).click();

  await expect(page.getByText("AI taslağıdır; kaydetmeden önce kontrol edin.")).toBeVisible();
  await expect(page.locator("#case_name")).toHaveValue("Alacak Davası (taslak)");
  await expect(page.getByText("Müvekkilinizi işaretleyin.")).toBeVisible();
  await expect(page.getByLabel("Kaynak belgeyi davaya ekle")).toBeChecked();

  await page.locator("#case_number").fill(`${caseNumber}-AI`);
  await page.getByRole("group", { name: "Taraf 1" }).getByLabel("Müvekkilimiz").check();
  await page.getByRole("button", { name: "Davayı oluştur" }).click();

  await expect(page).toHaveURL(DETAIL_URL);
  await expect(page.getByRole("heading", { name: "Alacak Davası (taslak)", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Taraflar" })).toBeVisible();
  await expect(page.getByText("Örnek Ticaret A.Ş.", { exact: true })).toBeVisible();
  await expect(page.getByText("Vekili: Av. Ayşe Demir")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Uyuşmazlık" })).toBeVisible();
  await expect(page.getByText("2026/123 Esas")).toBeVisible();
  await expect(page.getByText("İddiamız (davacı)")).toBeVisible();

  await page.getByRole("tab", { name: "Gelişmeler" }).click();
  await expect(page.getByText("Dava dilekçesi sunuldu")).toBeVisible();
  await page.getByRole("tab", { name: "Belgeler" }).click();
  await expect(page.getByRole("button", { name: /yapistirilan-metin\.txt/ })).toBeVisible();
});
