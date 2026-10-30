import { test, expect } from "@playwright/test";
import { DEMO_PLATFORM, login, newestPasswordLink } from "./helpers";

// Flow 14: the CaseBridge team opens a firm in the platform panel, the firm's
// first administrator sets a password from the e-mailed link and lands in the
// admin panel; the team suspends the firm, the open session ends with the
// suspension notice and a new sign-in is refused.

const STAMP = Date.now();
const FIRM = `E2E Hukuk ${STAMP}`;
const ADMIN_NAME = `Büro Yöneticisi ${STAMP}`;
const ADMIN_EMAIL = `yonetici.${STAMP}@e2e.casebridge.dev`;
const PASSWORD = "Yeni-Sifre-2026";
const SUSPENDED = "Büronuzun erişimi askıya alındı.";

test("open a firm, its admin signs in, then the firm is suspended", async ({ page, browser }) => {
  await login(page, DEMO_PLATFORM);
  await expect(page).toHaveURL(/\/platform/);
  await expect(page.getByRole("link", { name: /Davalar/ })).toHaveCount(0);

  // 1. Open the firm with its first administrator.
  await page.getByRole("button", { name: "Yeni büro" }).click();
  const form = page.getByRole("dialog", { name: "Yeni büro" });
  await form.getByLabel("Büro adı *").fill(FIRM);
  await form.getByLabel("Yönetici adı soyadı *").fill(ADMIN_NAME);
  await form.getByLabel("Yönetici e-postası *").fill(ADMIN_EMAIL);
  await form.getByRole("button", { name: "Büroyu oluştur" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Büro oluşturuldu, davet gönderildi." })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: FIRM })).toContainText("Davet bekliyor");

  // 2. The administrator sets a password from the e-mailed link.
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await adminPage.goto(await newestPasswordLink(ADMIN_EMAIL));
  await expect(adminPage.getByText(`Merhaba ${ADMIN_NAME}`)).toBeVisible();
  await adminPage.getByLabel("Yeni şifre", { exact: true }).fill(PASSWORD);
  await adminPage.getByLabel("Yeni şifre (tekrar)").fill(PASSWORD);
  await adminPage.getByRole("button", { name: "Şifreyi belirle" }).click();
  await expect(adminPage).toHaveURL(/\/admin/);

  // 3. The platform team suspends the firm.
  await page.reload();
  await page.getByRole("button", { name: FIRM }).click();
  await page.getByRole("dialog", { name: FIRM }).getByRole("button", { name: "Büroyu askıya al" }).click();
  await page.getByRole("dialog", { name: "Büroyu askıya al" }).getByRole("button", { name: "Askıya al" }).click();
  await expect(page.getByRole("dialog", { name: FIRM }).getByRole("status")).toHaveText("Büro askıya alındı.");
  await expect(page.getByRole("row").filter({ hasText: FIRM })).toContainText("Askıda");

  // 4. The administrator's open session ends with the notice ...
  await adminPage.goto("/dashboard");
  await expect(adminPage).toHaveURL(/\/login\?askida=1/);
  await expect(adminPage.locator("p[role=alert]")).toHaveText(SUSPENDED);

  // ... and signing in again is refused.
  await adminPage.getByLabel(/e-posta/i).fill(ADMIN_EMAIL);
  await adminPage.getByLabel(/şifre/i).fill(PASSWORD);
  const [loginResponse] = await Promise.all([
    adminPage.waitForResponse((r) => r.url().includes("/auth/login") && r.request().method() === "POST"),
    adminPage.getByRole("button", { name: /giriş/i }).click(),
  ]);
  expect(loginResponse.status()).toBe(403);
  await expect(adminPage.locator("p[role=alert]")).toHaveText(SUSPENDED);
  await expect(adminPage).not.toHaveURL(/\/(admin|dashboard)/);
  await adminContext.close();
});
