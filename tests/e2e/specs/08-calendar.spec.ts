import { test, expect } from "@playwright/test";
import { login, DEMO_LAWYER } from "./helpers";

// Flow 8: Takvim — add an event from the week view, see it in the hour
// grid, change its reminders in the detail drawer, then delete it.

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test("add an event from the week view, change its reminders and delete it", async ({ page }) => {
  const title = `E2E Müvekkil Toplantısı ${Date.now()}`;
  await login(page, DEMO_LAWYER);
  await page.goto("/takvim?gorunum=hafta");
  await expect(page.getByRole("heading", { level: 1, name: "Takvim" })).toBeVisible();

  await page.getByRole("button", { name: "Yeni etkinlik" }).click();
  const form = page.getByRole("dialog", { name: "Yeni etkinlik" });
  await form.getByLabel("Başlık").fill(title);
  await form.getByLabel("Tür").selectOption({ label: "Müvekkil görüşmesi" });
  await form.getByLabel("Tarih").fill(localDateKey(new Date()));
  await form.getByLabel("Saat").fill("10:00");
  await form.getByLabel("Süre (dakika)").fill("90");
  await form.getByLabel("Konum").fill("Büro toplantı odası");
  await form.getByRole("button", { name: "Kaydet" }).click();
  await expect(form).toHaveCount(0);

  const chip = page.getByTestId(`day-${localDateKey(new Date())}`).getByRole("button", { name: new RegExp(title) });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText("10:00");

  await chip.click();
  const drawer = page.getByRole("dialog", { name: title });
  await expect(drawer).toContainText("10:00 – 11:30");
  await expect(drawer).toContainText("1 gün önce");
  await drawer.getByRole("button", { name: "Hatırlatmayı değiştir" }).click();
  await drawer.getByLabel("7 gün önce").check();
  await drawer.getByRole("button", { name: "Kaydet" }).click();
  await expect(drawer).toContainText("7 gün önce, 1 gün önce");

  await drawer.getByRole("button", { name: "Sil" }).click();
  await drawer.getByRole("button", { name: "Evet, sil" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole("button", { name: new RegExp(title) })).toHaveCount(0);
});
