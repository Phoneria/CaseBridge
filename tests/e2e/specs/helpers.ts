import { Page, expect } from "@playwright/test";

export const DEMO_ADMIN = { email: "admin@demo.casebridge.dev", password: "demo1234" };
export const DEMO_LAWYER = { email: "avukat@demo.casebridge.dev", password: "demo1234" };

export async function login(page: Page, creds: { email: string; password: string } = DEMO_ADMIN) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill(creds.email);
  await page.getByLabel(/şifre/i).fill(creds.password);
  await page.getByRole("button", { name: /giriş/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
