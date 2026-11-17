import { test, expect } from "@playwright/test";
import { DEMO_LAWYER, login } from "./helpers";

// Add a client, open a case for it from its page, see the case and the
// counts there, rename the client and see the new name on the case page.
test("client screen: add, open a case for the client, rename", async ({ page }) => {
  test.setTimeout(90_000);
  const stamp = Date.now();
  const clientName = `E2E Müvekkil ${stamp}`;
  const renamed = `E2E Holding ${stamp}`;

  await login(page, DEMO_LAWYER);
  await page.getByRole("link", { name: "Müvekkiller", exact: true }).click();
  await expect(page).toHaveURL(/\/muvekkiller$/);

  await page.getByRole("button", { name: "Yeni müvekkil" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni müvekkil" });
  await dialog.getByLabel(/^Ad \/ unvan/).fill(clientName);
  await dialog.getByLabel("Telefon").fill("0212 555 00 00");
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(page).toHaveURL(/\/muvekkiller\/[0-9a-f-]{36}$/);
  const clientUrl = page.url();
  await expect(page.getByRole("heading", { name: clientName })).toBeVisible();

  await page.getByRole("link", { name: "Bu müvekkil için yeni dava" }).click();
  await expect(page).toHaveURL(/\/davalar\/yeni\?muvekkil=/);
  const first = page.getByRole("group", { name: "Taraf 1" });
  await expect(first.getByRole("link", { name: clientName })).toBeVisible();
  await page.locator("#case_number").fill(`E2E-CL-${stamp}`);
  await page.locator("#case_name").fill("E2E Müvekkil Davası");
  await page.getByRole("group", { name: "Taraf 2" }).getByLabel(/^Ad/).fill("E2E Karşı Taraf");
  await page.getByRole("button", { name: "Davayı oluştur" }).click();
  await expect(page).toHaveURL(/\/davalar\/[0-9a-f-]{36}$/);
  const caseUrl = page.url();

  await page.goto(clientUrl);
  await expect(page.getByRole("link", { name: "E2E Müvekkil Davası" })).toBeVisible();
  await expect(page.getByText("Toplam dava", { exact: true }).locator("..")).toContainText("1");

  await page.getByRole("button", { name: "Düzenle" }).click();
  const edit = page.getByRole("dialog", { name: "Müvekkili düzenle" });
  await edit.getByLabel(/^Ad \/ unvan/).fill(renamed);
  await edit.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByRole("heading", { name: renamed })).toBeVisible();

  await page.goto(caseUrl);
  await expect(page.getByRole("link", { name: renamed })).toHaveAttribute("href", new URL(clientUrl).pathname);
});
