import { test, expect } from "@playwright/test";
import { BACKEND_URL, DEMO_LAWYER, login } from "./helpers";

// Flow 13: hearings are calendar events. A hearing added on the case page shows in the calendar,
// moving it there changes the date on the case page, and a result entered on a past hearing
// (with the next hearing) lands in the timeline. All dates derive from today's date in the
// application's time zone (Europe/Istanbul), never from fixed calendar days. One lawyer login only.

const STAMP = Date.now();
const CASE_NAME = `E2E Duruşma Davası ${STAMP}`;

/** "YYYY-MM-DD" of today in Europe/Istanbul, shifted by `days`. */
function istanbulDay(days = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const shifted = new Date(`${today}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" -> "dd.mm.yyyy" (how the app prints dates). */
function shown(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}.${month}.${year}`;
}

test("add a hearing on the case page, move it in the calendar, then record a result with the next hearing", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, DEMO_LAWYER);

  const token = await page.evaluate(() => window.localStorage.getItem("casebridge_token"));
  expect(token).toBeTruthy();
  const headers = { Authorization: `Bearer ${token}` };

  const created = await page.request.post(`${BACKEND_URL}/cases`, {
    headers,
    data: {
      case_number: `E2E-HD-${STAMP}`,
      case_name: CASE_NAME,
      client_name: "E2E Müvekkil",
      opposing_party: "E2E Karşı Taraf",
      case_type: "diger",
      opening_date: "2026-02-03",
    },
  });
  expect(created.ok()).toBeTruthy();
  const caseId = (await created.json()).id as string;

  // A hearing of yesterday, so a result can be entered on it.
  const yesterday = istanbulDay(-1);
  const past = await page.request.post(`${BACKEND_URL}/calendar/events`, {
    headers,
    data: {
      title: "Duruşma", event_type: "hearing", starts_at: `${yesterday}T00:00:00`, all_day: true, duration_minutes: 60,
      location: null, notes: null, case_id: caseId, assignee_id: null, reminder_days: [3, 1],
    },
  });
  expect(past.ok()).toBeTruthy();

  const first = istanbulDay(10);
  const moved = istanbulDay(12);
  const later = istanbulDay(30);

  // --- Add a hearing from the case page ---
  await page.goto(`/davalar/${caseId}`);
  const card = page.getByRole("region", { name: "Duruşmalar" });
  await expect(card).toContainText("Sonuç girilmedi");
  await card.getByRole("button", { name: "Duruşma ekle" }).click();
  const addDialog = page.getByRole("dialog", { name: "Duruşma ekle" });
  await addDialog.getByLabel("Tarih").fill(first);
  await addDialog.getByLabel("Saat").fill("10:30");
  await addDialog.getByLabel("Salon / yer").fill("E2E Salon 4");
  await addDialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(addDialog).toBeHidden();
  await expect(card).toContainText(`${shown(first)} · 10:30`);
  await expect(card).toContainText("E2E Salon 4");
  await expect(page.getByRole("link", { name: `${shown(first)} · 10:30` })).toBeVisible();

  // --- It is a real calendar event; move it there ---
  await page.goto(`/takvim?gorunum=hafta&hafta=${first}&dava=${caseId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Takvim" })).toBeVisible();
  await page.getByTestId(`day-${first}`).getByRole("button", { name: /Duruşma/ }).click();
  const drawer = page.getByRole("dialog", { name: "Duruşma" });
  await expect(drawer).toContainText("E2E Salon 4");
  await drawer.getByRole("button", { name: "Düzenle" }).click();
  const form = page.getByRole("dialog", { name: "Etkinliği düzenle" });
  await form.getByLabel("Tarih").fill(moved);
  await form.getByRole("button", { name: "Kaydet" }).click();
  await expect(form).toHaveCount(0);
  await page.goto(`/takvim?gorunum=hafta&hafta=${moved}&dava=${caseId}`);
  await expect(page.getByTestId(`day-${moved}`).getByRole("button", { name: /Duruşma/ })).toBeVisible();

  // --- The case page follows ---
  await page.goto(`/davalar/${caseId}`);
  await expect(card).toContainText(`${shown(moved)} · 10:30`);
  await expect(card).not.toContainText(shown(first));
  await expect(page.getByRole("link", { name: `${shown(moved)} · 10:30` })).toBeVisible();

  // --- Result on the past hearing, with the next hearing ---
  await card.getByRole("button", { name: "Sonuç gir" }).click();
  const result = page.getByRole("dialog", { name: "Sonuç gir" });
  await result.getByRole("button", { name: "Kaydet" }).click();
  await expect(result.getByText("Sonuç notu gerekli.")).toBeVisible();
  await result.getByLabel("Sonuç / ara karar notu").fill("Bilirkişi raporu için süre verildi.");
  await result.getByLabel("Sonraki duruşmayı ekle").check();
  await result.getByLabel("Tarih").fill(later);
  await result.getByLabel("Tüm gün").check();
  await result.getByRole("button", { name: "Kaydet" }).click();
  await expect(result).toBeHidden();
  await expect(card).toContainText("Sonuç: Bilirkişi raporu için süre verildi.");
  await expect(card).toContainText(`${shown(later)} · Tüm gün`);

  // --- The timeline has the "Duruşma yapıldı" entry ---
  await page.getByRole("tab", { name: "Gelişmeler" }).click();
  await expect(page.getByText(`Duruşma yapıldı — ${shown(yesterday)}`)).toBeVisible();
  await expect(page.getByText("Bilirkişi raporu için süre verildi.")).toBeVisible();
});
