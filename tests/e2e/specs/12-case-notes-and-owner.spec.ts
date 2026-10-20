import { test, expect } from "@playwright/test";
import { BACKEND_URL, DEMO_LAWYER, login } from "./helpers";

// Flow 12: a lawyer writes, edits and deletes a note, adds a typed timeline entry,
// filters the case list to "Benim davalarım", opens the case and comes back to the
// filtered list with "← Davalar". One login; the token is reused for the API setup.

const STAMP = Date.now();
const CASE_NAME = `E2E Notlar ${STAMP}`;

test("notes, typed entries, responsible lawyer and the way back to the list", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, DEMO_LAWYER);
  const token = await page.evaluate(() => window.localStorage.getItem("casebridge_token"));
  const headers = { Authorization: `Bearer ${token}` };
  const me = await (await page.request.get(`${BACKEND_URL}/users/me`, { headers })).json();
  const created = await page.request.post(`${BACKEND_URL}/cases`, {
    headers,
    data: { case_number: `E2E-NO-${STAMP}`, case_name: CASE_NAME, client_name: "E2E Müvekkil", case_type: "diger", opening_date: "2026-02-03" },
  });
  expect(created.ok()).toBeTruthy();

  // --- List: Sorumlu column and "Benim davalarım" ---
  await page.goto("/davalar");
  await page.getByLabel("Sorumlu filtresi").selectOption({ label: "Benim davalarım" });
  await expect(page).toHaveURL(new RegExp(`avukat=${me.id}`));
  const row = page.getByRole("row", { name: new RegExp(CASE_NAME) });
  await expect(row).toContainText(me.full_name);
  await row.getByRole("link", { name: CASE_NAME, exact: true }).click();

  // --- Header ---
  await expect(page.getByRole("heading", { name: CASE_NAME })).toBeVisible();
  await expect(page.getByText(`Sorumlu: ${me.full_name}`)).toBeVisible();

  // --- Notlar: add, edit, delete ---
  await page.getByRole("tab", { name: "Notlar" }).click();
  await page.getByLabel("Not", { exact: true }).fill("Müvekkil aradı.\nYarın dönülecek.");
  await page.getByRole("button", { name: "Not ekle" }).click();
  await expect(page.getByText(`— ${me.full_name}`)).toBeVisible();
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  await page.getByLabel("Notu düzenle").fill("Müvekkil aradı, belgeler istendi.");
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Müvekkil aradı, belgeler istendi.")).toBeVisible();
  await page.getByRole("button", { name: "Sil", exact: true }).click();
  await page.getByRole("dialog", { name: "Not silinsin mi?" }).getByRole("button", { name: "Sil" }).click();
  await expect(page.getByText("Henüz not eklenmedi.")).toBeVisible();

  // --- Gelişmeler: typed entry ---
  await page.getByRole("tab", { name: "Gelişmeler" }).click();
  await page.getByLabel("Tarih").fill("2026-03-01");
  await page.getByLabel("Gelişme Başlığı").fill("Rapor tebliğ edildi");
  await page.getByLabel("Tür").selectOption({ label: "Bilirkişi raporu" });
  await page.getByRole("button", { name: "Ekle" }).click();
  const entry = page.getByRole("listitem").filter({ hasText: "Rapor tebliğ edildi" });
  await expect(entry.getByText("Bilirkişi raporu", { exact: true })).toBeVisible();

  // --- Back to the filtered list ---
  await page.getByRole("link", { name: "← Davalar" }).click();
  await expect(page).toHaveURL(new RegExp(`/davalar\\?.*avukat=${me.id}`));
  await expect(page.getByText("Sorumlu: Benim davalarım")).toBeVisible();
});
