import { test, expect } from "@playwright/test";
import { login, DEMO_LAWYER } from "./helpers";

async function setup(page: any) {
  await page.route("**/sufle/status", (r: any) => r.fulfill({ json: { configured: true, model: "synthetic-gpt" } }));
  await page.route("**/sufle/analyze", async (r: any) => {
    const body = r.request().postDataJSON();
    const source = body.turns.at(-1);
    await r.fulfill({ json: { cards: body.mode === "summary" ? [] : [{ priority: "important", category: "evidence", title: "Belgeyi netleştirin", reason: "Kaynak belgesi henüz görülmedi.", question: "Belgenin tamamını görebilir miyiz?", source_id: source.id, source_quote: source.text.slice(0,45) }], summary: body.mode === "summary" ? "Görüşme tamamlandı; belge ve tarih kontrol edilecek." : "", open_questions: body.mode === "summary" ? ["Kesin tarih nedir?"] : [], documents: body.mode === "summary" ? ["Tebligat zarfı"] : [], model: "synthetic-gpt", total_tokens: 120 } });
  });
  await login(page, DEMO_LAWYER);
  await page.getByRole("complementary").getByRole("link", { name: "Sufle", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sufle", exact: true })).toBeVisible();
  await page.getByRole("checkbox").check();
}

test("Sufle examples, GPT text flow, card actions and summary work on desktop and mobile", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await setup(page);
  await expect(page.getByRole("complementary").getByRole("link", { name: "Sufle", exact: true })).toHaveAttribute("aria-current", "page");
  const example = await page.request.get("/sufle/ornekler.txt");
  expect(example.ok()).toBe(true);
  const text = await example.text();
  expect(text.match(/^\d{2}\. (Avukat|Müvekkil):/gm)).toHaveLength(1002);
  expect(text.match(/\[SUFLE S\d/g)).toHaveLength(120);
  await page.getByRole("button", { name: "Kurgu örneği yükle" }).click();
  await expect(page.getByRole("textbox", { name: /konuşma metni/ })).toHaveCount(6);
  await page.getByRole("button", { name: "Sufle iste", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Belgeyi netleştirin" })).toBeVisible();
  await page.screenshot({ path: "/tmp/sufle-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Soruldu", exact: true }).click();
  await expect(page.getByText("İşaretlenen öneriler (1)")).toBeVisible();
  await page.getByLabel("Metinle ekle / test et").fill("Makbuzu buldum; zarfın tamamı henüz elimde değil.");
  await page.getByRole("button", { name: "Ekle ve sufle al" }).click();
  await expect(page.getByRole("textbox", { name: /konuşma metni/ })).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Bitir ve özetle" })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Bitir ve özetle" }).click();
  await expect(page.getByRole("region", { name: "Görüşme özeti" })).toContainText("Görüşme tamamlandı");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Metni ve özeti indir" }).click();
  expect((await download).suggestedFilename()).toBe("sufle-gorusme.txt");
  await page.getByRole("region", { name: "Görüşme özeti" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/sufle-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("continuous microphone clips retain failed audio, retry, and finish the final clip before summary", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__stoppedTracks = 0;
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() { (window as any).__stoppedTracks++; } }], getAudioTracks: () => [{ addEventListener() {} }] }) } });
    class Recorder extends EventTarget {
      static isTypeSupported() { return true; }
      state = "inactive";
      ondataavailable: any = null; onstop: any = null;
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; setTimeout(() => { this.ondataavailable?.({ data: new Blob(["synthetic-voice"], { type: "audio/webm" }) }); this.onstop?.(); this.dispatchEvent(new Event("stop")); }, 5); }
    }
    class Context {
      async resume() {} async close() {}
      createMediaStreamSource() { return { connect() {} }; }
      createAnalyser() { return { fftSize: 2048, getFloatTimeDomainData(a: Float32Array) { a.fill(0.2); } }; }
    }
    Object.defineProperty(window, "MediaRecorder", { value: Recorder });
    Object.defineProperty(window, "AudioContext", { value: Context });
  });
  let calls = 0;
  let finalPhase = false;
  await page.route("**/sufle/transcribe", async route => {
    calls++;
    if (calls === 1) await route.fulfill({ status: 503, json: { detail: "Geçici ses hatası" } });
    else await route.fulfill({ json: { text: finalPhase ? "Son sözüm: makbuz da elimde." : "Evrakı dün gördüm ama eşim geçen hafta almış." } });
  });
  await setup(page);
  await page.getByRole("button", { name: "Mikrofonu başlat" }).click();
  // The first 10-second segment is sent automatically; no stop button is needed.
  await expect(page.getByText("Geçici ses hatası", { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/\d+ ses parçası bekliyor/)).toBeVisible();
  await page.getByRole("button", { name: "Bekleyen sesi yeniden dene" }).click();
  await expect(page.getByLabel("1. konuşma metni")).toHaveValue("Evrakı dün gördüm ama eşim geçen hafta almış.");
  await expect(page.getByRole("button", { name: "Mikrofonla devam et" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Bitir ve özetle" })).toBeEnabled();
  const previousTurns = await page.getByRole("textbox", { name: /konuşma metni/ }).count();
  await page.getByRole("button", { name: "Mikrofonla devam et" }).click();
  await expect(page.getByText("● Mikrofon açık · Dinleniyor")).toBeVisible();
  await page.waitForTimeout(100);
  finalPhase = true;
  await page.getByRole("button", { name: "Bitir ve özetle" }).click();
  await expect(page.getByRole("region", { name: "Görüşme özeti" })).toBeVisible();
  await expect(page.getByLabel(`${previousTurns + 1}. konuşma metni`)).toHaveValue("Son sözüm: makbuz da elimde.");
  expect(await page.evaluate(() => (window as any).__stoppedTracks)).toBeGreaterThan(0);
  expect(calls).toBe(previousTurns + 2);
});
