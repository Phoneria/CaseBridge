import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Flow 3: Login → Analytics → Inspect Lost Cases → Open Relevant Case

test("inspect a lost case from analytics and open it", async ({ page }) => {
  await login(page);

  await page.getByRole("link", { name: "Analitik" }).click();
  await expect(page.getByRole("heading", { name: "Analitik" })).toBeVisible();

  await expect(page.getByText("Kaybedilen Davalar", { exact: true })).toBeVisible();

  const lostCaseLink = page.getByRole("link", { name: "Sözleşme İhlali Tazminat Davası" });
  await expect(lostCaseLink).toBeVisible();
  await lostCaseLink.click();

  await expect(page.getByRole("heading", { name: "Sözleşme İhlali Tazminat Davası" })).toBeVisible();
});
