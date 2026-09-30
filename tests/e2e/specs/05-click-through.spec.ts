import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Flow 5: Dashboard chart legend -> filtered case list (count matches) ->
// quick view -> case detail on the Görevler tab -> back returns to the list.

test("drill down from a dashboard category to a case's tasks tab", async ({ page }) => {
  await login(page);

  const legend = page.getByRole("list", { name: "Dava dağılımı kategorileri" });
  const firstCategory = legend.getByRole("link").first();
  const label = (await firstCategory.textContent()) ?? "";
  const expectedCount = Number(label.split("·")[1].trim());
  expect(expectedCount).toBeGreaterThan(0);

  await firstCategory.click();
  await expect(page).toHaveURL(/\/davalar\?kategori=[a-z_]+&arsiv=dahil$/);
  await expect(page.locator("tbody tr")).toHaveCount(expectedCount);
  const listUrl = page.url();

  await page.getByRole("link", { name: / önizle$/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/onizle=/);

  await dialog.getByRole("link", { name: "Görevler", exact: true }).click();
  await expect(page).toHaveURL(/\/davalar\/[^/?]+\?sekme=gorevler$/);
  await expect(page.getByRole("tab", { name: "Görevler" })).toHaveAttribute("aria-selected", "true");

  await page.goBack();
  await expect(page).toHaveURL(/onizle=/);
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(listUrl);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
