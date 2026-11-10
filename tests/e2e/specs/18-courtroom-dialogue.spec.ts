import { test, expect } from "@playwright/test";
import { login, DEMO_LAWYER } from "./helpers";

test("written and spoken advocacy continues until the user requests the judge", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
      getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
    } });
    class Recorder {
      static isTypeSupported() { return true; }
      state = "inactive";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["synthetic audio"]) }); this.onstop?.(); }
    }
    Object.defineProperty(window, "MediaRecorder", { value: Recorder });
    class SpokenAudio {
      onended: (() => void) | null = null;
      pause() {}
      async play() { setTimeout(() => this.onended?.(), 10); }
    }
    Object.defineProperty(window, "Audio", { value: SpokenAudio });
  });
  let transcription = "Bu transferin borç olduğunu savunuyorum; açıklama ve ödeme tarihleri birlikte değerlendirilmelidir.";
  let spokenRequests = 0;
  await page.route("**/courtroom-sessions/*/voice/transcribe", (route) => route.fulfill({ json: { text: transcription } }));
  await page.route("**/courtroom-sessions/*/voice/turns/**", (route) => {
    spokenRequests += 1;
    return route.fulfill({ contentType: "audio/mpeg", body: "synthetic speech" });
  });
  await login(page, DEMO_LAWYER);
  await page.goto("/ai/durusma");
  await page.getByRole("button", { name: "Davacı ol", exact: true }).first().click();
  await expect(page).toHaveURL(/\/ai\/durusma\/.+/);
  await expect(page.getByRole("button", { name: "Bitir ve karar iste" })).toBeVisible();
  const sessionUrl = page.url().split("/").pop()!;
  let state: any;
  page.on("response", async (response) => {
    if (response.url().endsWith(`/courtroom-sessions/${sessionUrl}`) && response.request().method() === "GET") state = await response.json();
  });
  await page.getByRole("textbox").fill("Dekonttaki açıklama borç ilişkisini desteklemektedir. Talebimizin kabulünü istiyoruz.");
  await page.getByRole("button", { name: "Beyanı gönder" }).click();
  await expect.poll(() => state?.turns.filter((turn: any) => turn.actor === "opponent").length).toBe(1);
  expect(state.turns.some((turn: any) => turn.actor === "judge")).toBe(false);
  expect(state.conversation_mode).toBe(true);
  await page.getByRole("button", { name: /Konuş/ }).click();
  await page.getByRole("button", { name: "Kaydı bitir", exact: true }).click();
  await expect.poll(() => state?.turns.filter((turn: any) => turn.actor === "opponent").length).toBe(2);
  expect(state.status).toBe("active");
  expect(state.turns.some((turn: any) => turn.actor === "judge")).toBe(false);
  await expect.poll(() => spokenRequests).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: "/tmp/casebridge-dialogue-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Bitir ve karar iste" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Bitir ve karar iste" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Bitir ve karar iste" })).toBeInViewport();
  await page.screenshot({ path: "/tmp/casebridge-dialogue-mobile.png", fullPage: true });
  transcription = "Bitir.";
  await page.getByRole("button", { name: /Konuş/ }).click();
  await page.getByRole("button", { name: "Kaydı bitir", exact: true }).click();
  await expect(page.getByText("Kurgusal karar", { exact: true })).toBeVisible();
  await expect.poll(() => state?.status).toBe("completed");
  expect(state.turns.filter((turn: any) => turn.actor === "judge")).toHaveLength(1);
  expect(state.turns.filter((turn: any) => turn.actor === "opponent")).toHaveLength(2);
  expect(state.evaluation.total_score).toBe(69);
});
