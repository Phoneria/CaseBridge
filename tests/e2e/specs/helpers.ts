import { Page, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

export const DEMO_ADMIN = { email: "admin@demo.casebridge.dev", password: "demo1234" };
export const DEMO_LAWYER = { email: "avukat@demo.casebridge.dev", password: "demo1234" };
export const DEMO_PLATFORM = { email: "platform@demo.casebridge.dev", password: "demo1234" };

// The backend webServer writes every outgoing e-mail here (EMAIL_BACKEND=file).
export const MAIL_DIR = path.resolve(__dirname, "../mail");
export const BACKEND_URL = "http://127.0.0.1:8010";

export async function login(page: Page, creds: { email: string; password: string } = DEMO_ADMIN) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill(creds.email);
  await page.getByLabel(/şifre/i).fill(creds.password);
  await page.getByRole("button", { name: /giriş/i }).click();
  // Platform admins land on /platform, firm admins on /admin, lawyers on /dashboard.
  await expect(page).toHaveURL(/\/(dashboard|admin|platform)(\/|$|\?)/);
}

function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** The password link in the newest e-mail written for `recipient`. */
export async function newestPasswordLink(recipient: string): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const files = fs.existsSync(MAIL_DIR) ? fs.readdirSync(MAIL_DIR).filter((name) => name.endsWith(".eml")).sort() : [];
    for (const name of files.reverse()) {
      const raw = fs.readFileSync(path.join(MAIL_DIR, name), "utf8");
      const to = /^To:\s*(.+)$/im.exec(raw)?.[1] ?? "";
      if (!to.toLowerCase().includes(recipient.toLowerCase())) continue;
      const match = /http:\/\/[^\s"<>]*\/sifre-belirle\?token=([A-Za-z0-9_-]+)/.exec(decodeQuotedPrintable(raw));
      if (match) return match[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`No password e-mail found for ${recipient}`);
}
