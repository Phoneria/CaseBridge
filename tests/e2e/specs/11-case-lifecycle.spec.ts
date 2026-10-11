import { test, expect, type Page } from "@playwright/test";
import { BACKEND_URL, DEMO_LAWYER, login } from "./helpers";

// Flow 11: a lawyer edits their own case, closes it with a decision document (the
// dashboard's won count goes up), archives it (read-only), unarchives and reopens it.
// One lawyer login only: the token is reused for the API setup (the login endpoint
// is rate limited to 5 attempts per user per minute and the demo lawyer is used by
// several other specs).

const STAMP = Date.now();
const ORIGINAL_NAME = `E2E Yaşam Döngüsü ${STAMP}`;
const EDITED_NAME = `${ORIGINAL_NAME} (düzenlendi)`;

async function wonCases(page: Page): Promise<number> {
  await page.goto("/dashboard");
  const card = page.getByRole("link", { name: /^Kazanılan Davalar/ });
  await expect(card).toBeVisible();
  return Number((await card.locator("p").nth(1).innerText()).trim());
}

async function menu(page: Page, item: string) {
  await page.getByRole("button", { name: "İşlemler" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("edit, close with a decision document, archive, unarchive and reopen a case", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, DEMO_LAWYER);

  const token = await page.evaluate(() => window.localStorage.getItem("casebridge_token"));
  expect(token).toBeTruthy();
  const created = await page.request.post(`${BACKEND_URL}/cases`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      case_number: `E2E-LC-${STAMP}`,
      case_name: ORIGINAL_NAME,
      client_name: "E2E Müvekkil",
      opposing_party: "E2E Karşı Taraf",
      case_type: "diger",
      opening_date: "2026-02-03",
    },
  });
  expect(created.ok()).toBeTruthy();
  const caseId = (await created.json()).id as string;

  const wonBefore = await wonCases(page);

  // --- Bilgileri düzenle ---
  await page.goto(`/davalar/${caseId}`);
  await expect(page.getByRole("heading", { name: ORIGINAL_NAME, exact: true })).toBeVisible();
  await menu(page, "Bilgileri düzenle");
  const editDialog = page.getByRole("dialog", { name: "Bilgileri düzenle" });
  await expect(editDialog.getByLabel("Dava no")).toHaveAttribute("readonly", "");
  await editDialog.getByLabel(/^Dava adı/).fill(EDITED_NAME);
  await editDialog.getByLabel("Mahkeme").fill("İstanbul 5. Asliye Hukuk Mahkemesi");
  await editDialog.getByLabel("Durum").selectOption("karar_bekleyen");
  await editDialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(editDialog).toBeHidden();
  await expect(page.getByRole("heading", { name: EDITED_NAME, exact: true })).toBeVisible();
  const badges = page.getByRole("group", { name: "Dava durumu" });
  await expect(badges).toContainText("Karar Bekleyen");

  // --- Davayı kapat (Kazanıldı + karar belgesi) ---
  await menu(page, "Davayı kapat");
  const closeDialog = page.getByRole("dialog", { name: "Davayı kapat" });
  await closeDialog.getByLabel("Kazanıldı").check();
  await closeDialog.getByLabel("Karar notu").fill("Karar tebliğ edildi.");
  await closeDialog.getByLabel("Karar belgesi ekle").setInputFiles({
    name: "karar.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Mahkeme davanın kabulüne karar vermiştir."),
  });
  await closeDialog.getByRole("button", { name: "Davayı kapat" }).click();
  await expect(closeDialog).toBeHidden();

  await expect(badges).toContainText("Kapalı");
  await expect(badges).toContainText("Kazanıldı");
  const decision = page.getByRole("region", { name: "Karar bilgisi" });
  await expect(decision).toContainText("Karar tebliğ edildi.");
  await page.getByRole("tab", { name: "Gelişmeler" }).click();
  await expect(page.getByText("Dava kapatıldı — Kazanıldı")).toBeVisible();
  await page.getByRole("tab", { name: "Belgeler" }).click();
  await expect(page.getByRole("button", { name: /karar\.txt/ })).toBeVisible();

  // --- Dashboard: one more won case ---
  expect(await wonCases(page)).toBe(wonBefore + 1);

  // --- Arşivle: read-only ---
  await page.goto(`/davalar/${caseId}`);
  await menu(page, "Arşivle");
  await page.getByRole("dialog", { name: "Dava arşivlensin mi?" }).getByRole("button", { name: "Arşivle" }).click();
  await expect(page.getByRole("note")).toContainText("Bu dava arşivlendi; salt okunur.");
  await page.getByRole("tab", { name: "Gelişmeler" }).click();
  await expect(page.getByLabel("Gelişme Başlığı")).toHaveCount(0);
  await page.getByRole("tab", { name: "Belgeler" }).click();
  await expect(page.getByText(/Belge Yükle/)).toHaveCount(0);
  const refused = await page.request.post(`${BACKEND_URL}/cases/${caseId}/events`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { event_date: "2026-10-12", title: "Arşivde eklenmeye çalışılan" },
  });
  expect(refused.status()).toBe(409);

  // --- Arşivden çıkar, then Yeniden aç ---
  await page.getByRole("note").getByRole("button", { name: "Arşivden çıkar" }).click();
  await expect(page.getByRole("note")).toHaveCount(0);
  await menu(page, "Yeniden aç");
  await page.getByRole("dialog", { name: "Dava yeniden açılsın mı?" }).getByRole("button", { name: "Yeniden aç" }).click();
  await expect(badges).toContainText("Devam Eden");
  await expect(badges).not.toContainText("Kazanıldı");
  await expect(page.getByRole("region", { name: "Karar bilgisi" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Gelişmeler" }).click();
  await expect(page.getByText("Dava yeniden açıldı")).toBeVisible();
  await expect(page.getByText("Dava kapatıldı — Kazanıldı")).toBeVisible();
});
