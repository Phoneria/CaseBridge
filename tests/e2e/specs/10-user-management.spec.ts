import { test, expect } from "@playwright/test";
import { BACKEND_URL, login, newestPasswordLink, DEMO_ADMIN } from "./helpers";

// Flow 10: the admin invites a lawyer, the lawyer sets a password from the
// e-mailed link, signs out and back in; later the admin hands the lawyer's
// work over and deactivates them, and they can no longer sign in.
//
// This spec signs the demo admin in exactly once (the login rate limit is 5
// attempts per user per minute) and reuses that token for API set-up.

const STAMP = Date.now();
const LAWYER_EMAIL = `yeni.avukat.${STAMP}@e2e.casebridge.dev`;
const LAWYER_NAME = `Yeni Avukat ${STAMP}`;
const NEW_PASSWORD = "Yeni-Sifre-2026";
const CASE_NAME = `Devir Davası ${STAMP}`;

test("invite, set password, sign in, then deactivate with hand-over", async ({ page, browser }) => {
  await login(page, DEMO_ADMIN);
  const adminToken = await page.evaluate(() => window.localStorage.getItem("casebridge_token"));
  expect(adminToken).toBeTruthy();
  const auth = { Authorization: `Bearer ${adminToken}` };

  // 1. Invite from Ayarlar > Kullanıcılar.
  await page.goto("/ayarlar");
  await page.getByRole("button", { name: "Kullanıcı ekle" }).click();
  const form = page.getByRole("dialog", { name: "Kullanıcı ekle" });
  await form.getByLabel("Ad soyad *").fill(LAWYER_NAME);
  await form.getByLabel("E-posta *").fill(LAWYER_EMAIL);
  await form.getByLabel("Departman").fill("Ticaret");
  await form.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Davet gönderildi." })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: LAWYER_EMAIL });
  await expect(row).toContainText("Davet bekliyor");

  // 2. The invited person sets a password from the e-mailed link.
  const invitee = await browser.newContext();
  const inviteePage = await invitee.newPage();
  const link = await newestPasswordLink(LAWYER_EMAIL);
  await inviteePage.goto(link);
  await expect(inviteePage.getByText(`Merhaba ${LAWYER_NAME}`)).toBeVisible();
  await inviteePage.getByLabel("Yeni şifre", { exact: true }).fill(NEW_PASSWORD);
  await inviteePage.getByLabel("Yeni şifre (tekrar)").fill(NEW_PASSWORD);
  await inviteePage.getByRole("button", { name: "Şifreyi belirle" }).click();
  await expect(inviteePage).toHaveURL(/\/dashboard/);

  // The link works once.
  await inviteePage.goto(link);
  await expect(inviteePage.getByText("Bağlantının süresi dolmuş veya bağlantı daha önce kullanılmış.")).toBeVisible();

  // 3. Sign out from the user menu, sign in with the new password.
  await inviteePage.goto("/dashboard");
  await inviteePage.getByRole("button", { name: new RegExp(`Kullanıcı menüsü, ${LAWYER_NAME}`) }).click();
  await inviteePage.getByRole("menuitem", { name: "Çıkış yap" }).click();
  await expect(inviteePage).toHaveURL(/\/login/);
  await login(inviteePage, { email: LAWYER_EMAIL, password: NEW_PASSWORD });

  // 4. Give the lawyer a case through the API, then deactivate with a hand-over.
  await page.reload();
  const lawyers = await page.request.get(`${BACKEND_URL}/admin/lawyers`, { headers: auth });
  const lawyerId = (await lawyers.json()).find((item: { email: string }) => item.email === LAWYER_EMAIL)?.id;
  expect(lawyerId).toBeTruthy();
  const created = await page.request.post(`${BACKEND_URL}/cases`, {
    headers: auth,
    data: { case_number: `E2E-${STAMP}`, case_name: CASE_NAME, client_name: "E2E Müvekkil", case_type: "diger", assigned_lawyer_id: lawyerId },
  });
  expect(created.ok()).toBeTruthy();

  await page.getByRole("row").filter({ hasText: LAWYER_EMAIL }).getByRole("button", { name: /^İşlemler/ }).click();
  await page.getByRole("menuitem", { name: "Pasifleştir" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(CASE_NAME)).toBeVisible();
  await dialog.getByRole("button", { name: "Devret ve pasifleştir" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Devredilecek avukatı seçin.");
  await dialog.getByLabel("Devredilecek avukat").selectOption({ index: 1 });
  await dialog.getByRole("button", { name: "Devret ve pasifleştir" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Kullanıcı pasifleştirildi." })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: LAWYER_EMAIL })).toContainText("Pasif");

  // 5. The old session is closed and the deactivated lawyer cannot sign in.
  await inviteePage.reload();
  await expect(inviteePage).toHaveURL(/\/login/);
  // The demo hint appears once the page has hydrated and loaded /auth/config;
  // typing earlier would be wiped by hydration.
  await expect(inviteePage.getByText("Demo hesapları")).toBeVisible();
  await inviteePage.getByLabel(/e-posta/i).fill(LAWYER_EMAIL);
  await inviteePage.getByLabel(/şifre/i).fill(NEW_PASSWORD);
  await inviteePage.getByRole("button", { name: /giriş/i }).click();
  await expect(inviteePage.locator("p[role=alert]")).toHaveText("E-posta veya şifre hatalı.");
  await invitee.close();
});
