import { test, expect } from "@playwright/test";
import { login, DEMO_PLATFORM, DEMO_ADMIN, DEMO_LAWYER } from "./helpers";

for (const [role, credentials] of [["platform", DEMO_PLATFORM], ["bureau administrator", DEMO_ADMIN]] as const) {
test(`${role} Settings supports masked key entry and explicit activation`, async ({ page }) => {
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
  await login(page, credentials);
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
}

test("a bureau lawyer sees connection status without bureau-wide key controls", async ({ page }) => {
  await login(page, DEMO_LAWYER);
  await page.goto("/ayarlar");
  await expect(page.getByRole("region", { name: "Yapay Zeka Durumu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gizli anahtar ekle" })).toHaveCount(0);
  await expect(page.getByText(/büro yöneticinizle iletişime geçin/)).toBeVisible();
});
