import { test, expect } from "@playwright/test";
import { login, DEMO_LAWYER } from "./helpers";

// Flow 7: CaseBridge AI Hukuk Asistanı — ask a question (mock chat
// provider), rate the streamed answer, and find the conversation again
// after a reload.

test("ask the legal assistant, rate the answer and reopen the conversation", async ({ page }) => {
  await login(page, DEMO_LAWYER);

  await page.getByRole("link", { name: "Hukuk Asistanı" }).click();
  await expect(page).toHaveURL(/\/ai\/sohbet$/);
  await expect(page.getByRole("heading", { level: 1, name: "Hukuk Asistanı" })).toBeVisible();

  await page.getByLabel("Mesajınız").fill("Kira artışı nasıl hesaplanır?");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Sorunuz: Kira artışı nasıl hesaplanır?")).toBeVisible();
  await expect(page).toHaveURL(/\/ai\/sohbet\?sohbet=/);

  const like = page.getByRole("button", { name: "Faydalı", exact: true });
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  const conversations = page.getByRole("navigation", { name: "Sohbetler" });
  await expect(conversations.getByRole("button", { name: /^Kira artışı nasıl hesaplanır\?/ })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: "Faydalı", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("answer at the Basit level and keep the choice after a reload", async ({ page }) => {
  await login(page, DEMO_LAWYER);
  await page.goto("/ai/sohbet");

  const levels = page.getByRole("radiogroup", { name: "Yanıt seviyesi" });
  await levels.getByRole("radio", { name: "Basit" }).click();
  await expect(levels.getByRole("radio", { name: "Basit" })).toHaveAttribute("aria-checked", "true");

  await page.getByLabel("Mesajınız").fill("İstinaf süresi kaç gündür?");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Sorunuz: İstinaf süresi kaç gündür?")).toBeVisible();
  await expect(page.getByText("Basit · mock")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("radio", { name: "Basit" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Basit · mock")).toBeVisible();
});
