import { test, expect } from "@playwright/test";
import { login, DEMO_PLATFORM } from "./helpers";

test("platform Settings supports masked key entry and a verified connection", async ({ page }) => {
  await page.route("**/system/openai-key**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ json: { connected: true, checked_at: 1, checks: [
        { name: "Analiz", provider: "openai", model: "test-model", reachable: true, detail: null },
        { name: "Hukuk Asistanı", provider: "openai", model: "test-model", reachable: true, detail: null },
      ] } });
    } else {
      const pending = route.request().method() === "PUT";
      if (pending) expect(route.request().postDataJSON()).toEqual({ api_key: "sk-synthetic-browser-test-key" });
      await route.fulfill({ json: { configured: true, managed: false, pending, can_save: true } });
    }
  });
  await login(page, DEMO_PLATFORM);
  await page.getByRole("link", { name: "Ayarlar", exact: true }).click();
  await page.getByRole("button", { name: "Gizli anahtar ekle" }).click();
  const input = page.getByLabel("OpenAI API anahtarı", { exact: true });
  await expect(input).toHaveAttribute("type", "password");
  await input.fill("sk-synthetic-browser-test-key");
  await page.getByRole("button", { name: "Kaydet ve bağlantıyı kontrol et" }).click();
  await expect(page.getByText("Yeni anahtar test edildi ve beklemeye alındı. Mevcut bağlantı değişmedi.")).toBeVisible();
  await page.getByRole("button", { name: "Yeni anahtarı etkinleştir" }).click();
  await expect(page.getByText(/Yeni anahtar etkinleştirildi. AI bağlantısı doğrulandı/)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Gizli anahtar ekle" }).click();
  await expect(input).toHaveValue("");
  await page.screenshot({ path: test.info().outputPath("ai-key-entry.png") });
});
