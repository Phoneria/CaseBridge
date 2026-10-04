import { test, expect } from "@playwright/test";
import { login, DEMO_LAWYER } from "./helpers";

// Flow 9: Görevler — add a task from the Görevler page, see it in the list
// and on its due date in the calendar agenda.

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test("add a task from the Görevler page and see it in the list and the calendar", async ({ page }) => {
  const title = `E2E Yeni Görev ${Date.now()}`;
  const due = new Date();
  due.setDate(due.getDate() + 3);
  const dueKey = localDateKey(due);

  await login(page, DEMO_LAWYER);
  await page.goto("/gorevler");
  await expect(page.getByRole("heading", { level: 1, name: "Görevler" })).toBeVisible();

  await page.getByRole("button", { name: "Yeni görev" }).click();
  const form = page.getByRole("dialog", { name: "Yeni görev" });
  await form.getByLabel("Başlık", { exact: true }).fill(title);
  await form.getByRole("list", { name: "Davalar" }).getByRole("button").first().click();
  await form.getByLabel("Son tarih").fill(dueKey);
  await form.getByRole("button", { name: "Kaydet" }).click();
  await expect(form).toHaveCount(0);

  await expect(page.getByTestId("task-title").filter({ hasText: title })).toBeVisible();

  await page.goto("/takvim?gorunum=ajanda");
  await expect(page.getByRole("heading", { level: 1, name: "Takvim" })).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();
});
