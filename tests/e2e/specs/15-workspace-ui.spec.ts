import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("scrolling past Settings keeps the workspace inside the viewport", async ({ page }) => {
  await login(page);
  await page.goto("/ayarlar");
  await expect(page.locator("main").getByRole("heading", { name: "Ayarlar", exact: true })).toBeVisible();
  for (const viewport of [{ width: 1440, height: 800 }, { width: 390, height: 700 }]) {
    await page.setViewportSize(viewport);
    const main = page.locator("main");
    await main.hover();
    await page.mouse.wheel(0, 10000);
    await expect.poll(() => main.evaluate(el => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop))).toBeLessThanOrEqual(1);
    await page.mouse.wheel(0, 10000);
    const bounds = await page.evaluate(() => {
      window.scrollTo(0, 10000);
      const main = document.querySelector("main")!.getBoundingClientRect();
      return { outerScroll: window.scrollY, outerHeight: document.documentElement.scrollHeight,
        height: window.innerHeight, mainBottom: main.bottom };
    });
    expect(bounds.outerScroll).toBe(0);
    expect(bounds.outerHeight).toBeLessThanOrEqual(bounds.height);
    expect(bounds.mainBottom).toBe(bounds.height);
    await page.screenshot({ path: test.info().outputPath(`settings-bottom-${viewport.width}.png`) });
  }
});

test("workspace sections load and AI diagnostics explain demo mode", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const sidebar = page.locator("aside");
  const aiBlock = await sidebar.getByRole("group", { name: "CaseBridge AI" }).boundingBox();
  const connection = await sidebar.getByRole("button", { name: /AI (bağlantısı|kontrol)/ }).boundingBox();
  expect(aiBlock).not.toBeNull();
  expect(connection).not.toBeNull();
  const gap = connection!.y - (aiBlock!.y + aiBlock!.height);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(32);
  for (const [route, title] of [
    ["/dashboard", "Dashboard"], ["/davalar", "Davalar"], ["/emsaller", "Emsal Kararlar"],
    ["/takvim", "Takvim"], ["/gorevler", "Görevler"], ["/belgeler", "Belgeler"],
    ["/analitik", "Analitik"], ["/raporlar", "Raporlar"], ["/ai", "CaseBridge AI"],
  ]) {
    await page.goto(route);
    await expect(page.locator("main").getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.locator("aside").getByLabel(/Uygulama sürümü/)).toBeVisible();
  }
  await page.goto("/ayarlar");
  const panel = page.getByRole("region", { name: "Yapay Zeka Durumu" });
  await expect(panel.getByText("Demo modu açık; gerçek AI bağlantısı etkin değil.")).toHaveCount(2);
  await panel.getByRole("button", { name: "Bağlantıyı yeniden kontrol et" }).click();
  await expect(panel.getByRole("button", { name: "Bağlantıyı yeniden kontrol et" })).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath("desktop-settings.png"), fullPage: true });
});

test("mobile navigation opens, follows a link and returns focus on Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const trigger = page.getByRole("button", { name: "Ana menüyü aç" });
  await trigger.click();
  const menu = page.getByRole("dialog", { name: "Uygulama menüsü" });
  await expect(menu).toBeVisible();
  await expect(menu.getByLabel(/Uygulama sürümü/)).toBeVisible();
  await expect(menu.getByRole("link", { name: "Ayarlar", exact: true })).toBeInViewport();
  await menu.getByRole("link", { name: "Hukuk Asistanı", exact: true }).scrollIntoViewIfNeeded();
  await expect(menu.getByRole("link", { name: "Hukuk Asistanı", exact: true })).toBeInViewport();
  await expect(menu.getByRole("link", { name: "Ayarlar", exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("mobile-menu.png") });
  await menu.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(menu).toHaveCount(0);
  await expect(page.locator("main").getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasOverflow).toBe(false);
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
