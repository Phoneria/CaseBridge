"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AiHero } from "@/components/ai/AiHero";
import { analyzeSufle, getSufleStatus, transcribeSufle, type SufleAdvice, type SufleCard, type SufleTurn } from "@/lib/api";

const PRIMARY = "rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-40";
const SECONDARY = "rounded-xl border border-surface-border bg-white px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-40";
const PRIORITY = { urgent: "Acil", important: "Önemli", normal: "Takip sorusu" };
const CATEGORY = { safety: "Güvenlik", question: "Eksik bilgi", evidence: "Delil", contradiction: "Belirsizlik", deadline: "Tarih / belge" };
type VisibleCard = SufleCard & { key: string };
const DEMO: SufleTurn[] = [
  { id: 1, speaker: "Avukat", text: "Size gelen evrakı ne zaman teslim aldınız?" },
  { id: 2, speaker: "Müvekkil", text: "Dün gördüm ama eşim geçen hafta kapıcıdan almış; zarf yanımda değil." },
  { id: 3, speaker: "Avukat", text: "Borcun hangi işlemden doğduğunu anlatır mısınız?" },
  { id: 4, speaker: "Müvekkil", text: "Makine aldığım tedarikçi 240 bin istiyor, oysa borcu tamamen ödedim." },
  { id: 5, speaker: "Avukat", text: "Ödemeleri tek tek sayabilir misiniz?" },
  { id: 6, speaker: "Müvekkil", text: "100 bin havale, 80 bin elden verdim. Elden ödemenin makbuzu yok; temsilcinin aldım mesajı var." },
];

export function SufleView() {
  const [status, setStatus] = useState<{ configured: boolean; model: string } | null>(null);
  const [ack, setAck] = useState(false);
  const [focus, setFocus] = useState("Genel görüşme");
  const [turns, setTurns] = useState<SufleTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [speaker, setSpeaker] = useState<SufleTurn["speaker"]>("Müvekkil");
  const [cards, setCards] = useState<VisibleCard[]>([]);
  const [closed, setClosed] = useState<{ card: VisibleCard; state: string }[]>([]);
  const [summary, setSummary] = useState<SufleAdvice | null>(null);
  const [recording, setRecording] = useState(false);
  const [opening, setOpening] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [queued, setQueued] = useState(0);
  const [audioFailed, setAudioFailed] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [tokens, setTokens] = useState(0);
  const alive = useRef(true);
  const turnsRef = useRef<SufleTurn[]>([]);
  const cardsRef = useRef<VisibleCard[]>([]);
  const previous = useRef<string[]>([]);
  const revision = useRef(0);
  const desired = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipDone = useRef<Promise<void> | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const meter = useRef<AnalyserNode | null>(null);
  const meterFrame = useRef<number>(0);
  const voiced = useRef(false);
  const queue = useRef<Blob[]>([]);
  const processing = useRef<Promise<void> | null>(null);
  const audioBlocked = useRef(false);
  const analyzing = useRef(false);
  const analyzeAgain = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const ackRef = useRef(ack);
  ackRef.current = ack;
  const finishRef = useRef(false);
  const releaseMic = () => {
    stream.current?.getTracks().forEach(t => t.stop()); stream.current = null;
    cancelAnimationFrame(meterFrame.current);
    void audioContext.current?.close(); audioContext.current = null; meter.current = null;
  };
  const stopCapture = async (): Promise<void> => {
    desired.current = false;
    if (timer.current) clearTimeout(timer.current);
    if (alive.current) { setRecording(false); setStopping(true); }
    const current = recorder.current;
    const done = clipDone.current;
    if (current && current.state !== "inactive") current.stop();
    // Even an inactive recorder can still have its final data/stop event pending.
    if (done) await done;
    releaseMic();
    if (alive.current) setStopping(false);
  };

  useEffect(() => {
    alive.current = true;
    getSufleStatus().then(s => { if (alive.current) setStatus(s); }).catch(() => { if (alive.current) setError("GPT bağlantı durumu alınamadı. Sayfayı yeniden açın."); });
    const leave = (e: BeforeUnloadEvent) => { if (turnsRef.current.length || queue.current.length || desired.current) { e.preventDefault(); e.returnValue = ""; } };
    const hidden = () => { if (document.hidden && desired.current) { void stopCapture(); setNote("Sekme arka plana geçtiği için mikrofon duraklatıldı."); } };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      alive.current = false; desired.current = false;
      if (timer.current) clearTimeout(timer.current);
      const current = recorder.current;
      if (current && current.state !== "inactive") current.stop();
      releaseMic();
      controllers.current.forEach(c => c.abort()); controllers.current.clear(); queue.current = [];
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("visibilitychange", hidden);
    };
    // Cleanup intentionally owns the microphone for this mounted page only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateTurns(next: SufleTurn[]) {
    turnsRef.current = next; revision.current++; setTurns(next); setSummary(null);
  }
  function append(text: string, who: SufleTurn["speaker"]) {
    if (!text.trim()) return;
    const current = turnsRef.current;
    updateTurns([...current, { id: (current.at(-1)?.id ?? 0) + 1, speaker: who, text: text.trim() }]);
  }
  async function advice(mode: "live" | "summary" = "live") {
    if (!ackRef.current || !turnsRef.current.length || !alive.current) return;
    if (turnsRef.current.some(t => !t.text.trim()) || turnsRef.current.reduce((n,t) => n+t.text.length,0) > 80000 || turnsRef.current.length > 1200) {
      setError("Boş konuşma metnini düzeltin. Oturum sınırı 80.000 karakter ve 1.200 konuşmadır; sınırda metni dışa aktarıp yeni görüşme açın."); return;
    }
    if (analyzing.current) { if (mode === "live") analyzeAgain.current = true; return; }
    analyzing.current = true; setBusy(true);
    const version = revision.current;
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      const result = await analyzeSufle({ turns: turnsRef.current, focus: focusRef.current, previous_questions: previous.current.slice(-120), mode, acknowledged: true }, controller.signal);
      if (!alive.current) return;
      setTokens(n => n + result.total_tokens);
      if (revision.current !== version) { analyzeAgain.current = true; return; }
      if (mode === "summary") { setSummary(result); setFinished(true); }
      else {
        // A fresh response supersedes old cards, so corrected/answered facts do not linger.
        const next = result.cards.map(c => ({ ...c, key: `${c.category}:${c.question.toLocaleLowerCase("tr").trim()}` }));
        cardsRef.current = next; setCards(next);
        setNote(next.length ? "Öneriler görüşmenin son durumuna göre güncellendi." : "Yeni bir sufle gerektiren açık bilgi bulunmadı.");
      }
      setError("");
    } catch (e) {
      if (alive.current && !(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Sufle alınamadı. Yeniden deneyin.");
    } finally {
      controllers.current.delete(controller); analyzing.current = false;
      if (alive.current) setBusy(false);
      if (analyzeAgain.current && !finishRef.current && alive.current) { analyzeAgain.current = false; void advice(); }
    }
  }

  function processAudio(): Promise<void> {
    if (processing.current) return processing.current;
    if (audioBlocked.current) return Promise.resolve();
    const work = async () => {
      while (queue.current.length && alive.current && !audioBlocked.current) {
        const controller = new AbortController(); controllers.current.add(controller);
        try {
          const result = await transcribeSufle(queue.current[0], controller.signal);
          if (!alive.current) return;
          queue.current.shift(); setQueued(queue.current.length);
          if (result.text.trim() && (turnsRef.current.reduce((n,t) => n+t.text.length,0) + result.text.length > 74000 || turnsRef.current.length >= 1150)) {
            // Retain the final transcription in the export; stop before exceeding the API history limit.
            append(result.text, "Görüşme");
            void stopCapture(); setNote("Görüşme uzunluk sınırına yaklaştı. Özeti alıp dışa aktarın ve yeni görüşme başlatın.");
          } else if (result.text.trim()) { append(result.text, "Görüşme"); if (!finishRef.current) void advice(); }
          else setNote("Son ses parçasında konuşma tanınmadı.");
        } catch (e) {
          if (!alive.current) return;
          audioBlocked.current = true; setAudioFailed(true);
          void stopCapture();
          setError(e instanceof Error ? e.message : "Ses çözümlenemedi. Yeniden deneyin.");
        } finally { controllers.current.delete(controller); }
      }
    };
    processing.current = work().finally(() => { processing.current = null; });
    return processing.current;
  }

  function startClip(mimeType: string) {
    if (!stream.current || !desired.current || !alive.current) return;
    voiced.current = false;
    const chunks: Blob[] = [];
    const current = new MediaRecorder(stream.current, { mimeType }); recorder.current = current;
    let resolveClip: () => void = () => {};
    clipDone.current = new Promise<void>(resolve => { resolveClip = resolve; });
    current.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    current.onerror = () => { desired.current = false; void stopCapture(); setError("Mikrofon kaydı kesildi. Mevcut metin korunuyor."); };
    current.onstop = () => {
      const hasVoice = voiced.current;
      recorder.current = null;
      clipDone.current = null;
      if (!alive.current) { resolveClip(); return; }
      if (hasVoice && chunks.length) { queue.current.push(new Blob(chunks, { type: mimeType })); setQueued(queue.current.length); }
      if (queue.current.length >= 4) { desired.current = false; setRecording(false); releaseMic(); setNote("Çözümleme yetişmediği için mikrofon duraklatıldı. Bekleyen sesler işleniyor; sonra devam edebilirsiniz."); }
      if (desired.current) startClip(mimeType);
      else releaseMic();
      void processAudio();
      resolveClip();
    };
    current.start();
    timer.current = setTimeout(() => { if (current.state === "recording") current.stop(); }, 10000);
  }

  async function start() {
    if (!ack || !status?.configured || opening || desired.current || recorder.current || stream.current || queued || finished) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined" || typeof AudioContext === "undefined") { setError("Bu tarayıcı mikrofon kaydını desteklemiyor. Güncel Chrome veya Safari deneyin; metinle de test edebilirsiniz."); return; }
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find(t => MediaRecorder.isTypeSupported(t));
    if (!mimeType) { setError("Desteklenen ses biçimi bulunamadı. Metinle test edebilirsiniz."); return; }
    setOpening(true); setError(""); setNote("");
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!alive.current || document.hidden) { acquired.getTracks().forEach(t => t.stop()); return; }
      stream.current = acquired;
      const context = new AudioContext(); audioContext.current = context;
      await context.resume();
      if (!alive.current) { releaseMic(); return; }
      const analyser = context.createAnalyser(); analyser.fftSize = 2048; meter.current = analyser;
      context.createMediaStreamSource(acquired).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const measure = () => {
        analyser.getFloatTimeDomainData(samples);
        let energy = 0; for (const sample of samples) energy += sample * sample;
        if (Math.sqrt(energy / samples.length) > 0.009) voiced.current = true;
        if (alive.current && stream.current) meterFrame.current = requestAnimationFrame(measure);
      };
      desired.current = true; setRecording(true); startClip(mimeType); measure();
      acquired.getAudioTracks()[0]?.addEventListener("ended", () => { if (alive.current && desired.current) { void stopCapture(); setError("Mikrofon bağlantısı kesildi. Yeniden başlatabilirsiniz."); } });
    } catch { desired.current = false; releaseMic(); setRecording(false); setError("Mikrofon açılamadı. Tarayıcı iznini ve ses aygıtınızı kontrol edin; metinle de test edebilirsiniz."); }
    finally { if (alive.current) setOpening(false); }
  }

  async function finish() {
    if (finishRef.current || analyzing.current) return;
    if (draft.trim()) {
      if (turnsRef.current.reduce((n,t) => n+t.text.length,0) + draft.length > 80000) { setError("Metin sınırı aşılıyor; önce dışa aktarın."); return; }
      append(draft, speaker); setDraft("");
    }
    finishRef.current = true; setFinishing(true); setError("");
    try {
      await stopCapture();
      await processAudio();
      while (processing.current) await processing.current;
      // A live analysis may have started while the final audio was being captured.
      while (analyzing.current && alive.current) await new Promise(resolve => setTimeout(resolve, 50));
      if (audioBlocked.current || queue.current.length) { setError("Bekleyen sesler tamamlanmadı. Yeniden deneyip ardından görüşmeyi bitirin."); return; }
      analyzeAgain.current = false;
      if (!turnsRef.current.length) { setError("Özet için önce konuşma veya metin ekleyin."); return; }
      await advice("summary");
    } finally { finishRef.current = false; if (alive.current) setFinishing(false); }
  }

  function closeCard(card: VisibleCard, state: string) {
    previous.current.push(card.question);
    setClosed(old => [...old, { card, state }]);
    const next = cardsRef.current.filter(c => c.key !== card.key); cardsRef.current = next; setCards(next);
  }
  function reset() {
    if (locked || !window.confirm("Bu görüşme sayfadan silinecek. Gerekirse önce dışa aktarın. Yeni görüşme açılsın mı?")) return;
    updateTurns([]); setDraft(""); setCards([]); cardsRef.current = []; setClosed([]); previous.current = [];
    setSummary(null); setFinished(false); setAck(false); setTokens(0); setError(""); setNote("");
    setAudioFailed(false); audioBlocked.current = false; analyzeAgain.current = false;
  }
  function download() {
    const body = ["CASEBRIDGE SUFLE — GÖRÜŞME TASLAĞI", `Odak: ${focus}`, "", ...turns.map(t => `${t.id}. ${t.speaker}: ${t.text}`), ...(draft.trim() ? [`Gönderilmemiş taslak (${speaker}): ${draft}`] : []), "", "SUFLELER", ...[...cards.map(card => ({ card, state: "Açık" })), ...closed].map(({card,state}) => `[${state}] ${card.title}: ${card.question} (Konuşma ${card.source_id})`), "", "GÖRÜŞME SONU TASLAĞI", summary?.summary ?? "Henüz oluşturulmadı.", "", "AÇIK SORULAR", ...(summary?.open_questions ?? []), "", "İSTENECEK BELGELER", ...(summary?.documents ?? [])].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "sufle-gorusme.txt"; link.click(); URL.revokeObjectURL(url);
  }

  const enabled = ack && !!status?.configured;
  const locked = recording || queued > 0 || busy || finishing || opening || stopping;
  const charCount = turns.reduce((n,t) => n + t.text.length, 0);
  return <div className="space-y-6">
    <AiHero compact eyebrow="CASEBRIDGE AI · GÖRÜŞME DESTEĞİ" title="Sufle" description="Siz müvekkilinizi dinleyin. Sorulacak sorular, eksik belgeler ve netleştirilecek noktalar doğru anda önünüze gelsin." actions={<a className="rounded-xl border border-white/25 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10" href="/sufle/ornekler.html" target="_blank" rel="noreferrer">20 örnek görüşmeyi aç ↗</a>} />
    <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-navy-900">Görüşme masası <span className="ml-2 rounded-full bg-accent-50 px-2 py-1 text-xs text-accent-700">Deneme sürümü</span></h2><p className="mt-1 text-sm text-navy-500">{status ? status.configured ? `GPT bağlantısı hazır · ${status.model}` : "Büronuzun GPT bağlantısı hazır değil." : "GPT bağlantısı kontrol ediliyor…"}</p></div><a href="/sufle/ornekler.txt" download className="text-sm font-medium text-accent-700">Örnek dosyasını indir ↓</a></div>
      {status && !status.configured && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Büro yöneticiniz <Link href="/ayarlar" className="underline">Ayarlar</Link> üzerinden büronuza ait anahtarı test edip etkinleştirmeli.</p>}
      <div className="mt-5 flex flex-wrap items-end gap-4"><label className="text-xs font-semibold text-navy-600">Görüşmenin odağı<select value={focus} disabled={locked || finished} onChange={e => setFocus(e.target.value)} className="mt-1 block rounded-xl border border-surface-border bg-white px-3 py-2 text-sm text-navy-800">{["Genel görüşme", "Boşanma / aile", "İcra / alacak", "Ticari uyuşmazlık", "İş hukuku", "Kira / taşınmaz", "Ceza", "Miras", "Tüketici", "Diğer"].map(s => <option key={s}>{s}</option>)}</select></label><p className="text-xs leading-5 text-navy-500">Ses yaklaşık 10 saniyelik parçalarla işlenir; öneriler birkaç saniye gecikebilir.<br/>Tek mikrofonun konuşmacıları otomatik ayrılmaz. Metni düzeltebilirsiniz.</p></div>
      <label className="mt-4 flex items-start gap-2 text-sm leading-6 text-navy-700"><input type="checkbox" checked={ack} disabled={locked || turns.length > 0 || finished} onChange={e => setAck(e.target.checked)} className="mt-1 h-4 w-4"/>Görüşmenin GPT ile işleneceğini biliyorum; gerekli bilgilendirme ve yetki/izin süreçlerini tamamladım. İlk denemeyi kurgu veriyle yapacağım.</label>
      <p className="mt-2 text-xs leading-5 text-navy-500">Ses parçaları ve metin OpenAI'a iletilir. Uygulama ham sesi veya görüşmeyi kalıcı kaydetmez; bu sayfadan ayrılınca oturum kaybolur. Gerekirse önce dışa aktarın. GPT ve ses kullanımı büronuzun API hesabında ücretlenir; bu oturumun kullanımı aylık analiz/sohbet sayacına dahil değildir.</p>
      <div className="mt-5 flex flex-wrap gap-2"><button className={PRIMARY} disabled={!enabled || opening || stopping || finishing || queued > 0 || finished} onClick={() => recording ? void stopCapture() : void start()}>{stopping ? "Mikrofon duraklatılıyor…" : opening ? "Mikrofon açılıyor…" : recording ? "Mikrofonu duraklat" : turns.length ? "Mikrofonla devam et" : "Mikrofonu başlat"}</button><button className={SECONDARY} disabled={!enabled || locked || !turns.length || finished} onClick={() => void advice()}>Sufle iste</button><button className={SECONDARY} disabled={!enabled || busy || finishing || (!turns.length && !recording) || finished || opening || stopping} onClick={() => void finish()}>{finishing ? "Görüşme tamamlanıyor…" : "Bitir ve özetle"}</button><button className={SECONDARY} disabled={!turns.length} onClick={download}>Dışa aktar</button><button className={SECONDARY} disabled={locked || !turns.length} onClick={reset}>Yeni görüşme</button></div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-navy-500" role="status"><span className={recording ? "font-semibold text-rose-700" : ""}>{recording ? "● Mikrofon açık · Dinleniyor" : finished ? "Görüşme tamamlandı" : "Mikrofon kapalı"}</span><span>{turns.length} konuşma · {charCount.toLocaleString("tr-TR")} / 80.000 karakter</span>{queued > 0 && <span>{queued} ses parçası bekliyor</span>}{busy && <span>GPT değerlendiriyor…</span>}{tokens > 0 && <span>Bu oturum: {tokens.toLocaleString("tr-TR")} metin tokenı · Ses ayrıca</span>}</div>
    </section>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><p>{error}</p>{audioFailed && <button className="mt-2 font-semibold underline" onClick={() => { audioBlocked.current = false; setAudioFailed(false); setError(""); void processAudio(); }}>Bekleyen sesi yeniden dene</button>}</div>}
    {note && <p className="text-sm text-navy-500" aria-live="polite">{note}</p>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <section className="min-w-0 rounded-2xl border border-surface-border bg-white p-5 shadow-card"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-navy-900">Canlı görüşme metni</h2><button className="text-xs font-semibold text-accent-700 disabled:opacity-40" disabled={!enabled || locked || turns.length > 0 || finished} onClick={() => { updateTurns(DEMO.map(t => ({ ...t }))); setFocus("İcra / alacak"); focusRef.current = "İcra / alacak"; setNote("Kurgu görüşme yüklendi. Sufle iste ile gerçek GPT önerilerini deneyin."); }}>Kurgu örneği yükle</button></div>
        <div className="max-h-[520px] space-y-3 overflow-y-auto overscroll-contain" aria-label="Görüşme metni">{!turns.length && <div className="rounded-2xl border border-dashed border-accent-200 bg-accent-50/50 px-5 py-10 text-center"><p className="font-medium text-navy-800">İlk sözü bekliyoruz.</p><p className="mt-2 text-sm leading-6 text-navy-500">Mikrofonu açın, aşağıdan metin ekleyin veya kurgu örneğini yükleyin.</p></div>}{turns.map(t => <article id={`konusma-${t.id}`} key={t.id} className="rounded-xl border border-surface-border p-3"><label className="mb-1 block text-xs font-semibold text-accent-700" htmlFor={`metin-${t.id}`}>{t.id}. {t.speaker}</label><textarea id={`metin-${t.id}`} aria-label={`${t.id}. konuşma metni`} value={t.text} rows={Math.min(5, Math.max(2, Math.ceil(t.text.length / 85)))} maxLength={6000} disabled={locked || finished} onChange={e => { updateTurns(turnsRef.current.map(row => row.id === t.id ? { ...row, text: e.target.value } : row)); cardsRef.current = []; setCards([]); previous.current = []; }} className="w-full resize-y bg-transparent text-sm leading-6 text-navy-800 outline-none focus:ring-2 focus:ring-accent-200 disabled:opacity-90"/></article>)}</div>
        <form className="mt-4 border-t border-surface-border pt-4" onSubmit={e => { e.preventDefault(); if (!enabled || locked || finished || !draft.trim() || charCount + draft.length > 80000) return; append(draft, speaker); setDraft(""); void advice(); }}><div className="mb-2 flex items-center justify-between"><label htmlFor="sufle-draft" className="text-xs font-semibold text-navy-600">Metinle ekle / test et</label><select aria-label="Konuşmacı" value={speaker} onChange={e => setSpeaker(e.target.value as SufleTurn["speaker"])} disabled={locked || finished} className="rounded-lg border border-surface-border bg-white p-1 text-xs">{["Müvekkil", "Avukat", "Görüşme"].map(s => <option key={s}>{s}</option>)}</select></div><textarea id="sufle-draft" value={draft} onChange={e => setDraft(e.target.value)} disabled={!enabled || locked || finished} maxLength={6000} rows={3} placeholder="Örn. Ödeme emrini dün gördüm ama eşim zarfı geçen hafta almış…" className="w-full rounded-xl border border-surface-border p-3 text-sm outline-none focus:border-accent-400"/><button className={`${PRIMARY} mt-2`} disabled={!enabled || locked || finished || !draft.trim() || charCount + draft.length > 80000}>Ekle ve sufle al</button></form>
      </section>
      <section className="min-w-0 space-y-3" aria-label="Sufle önerileri"><div className="flex items-center justify-between px-1"><h2 className="font-semibold text-navy-900">Avukatın kulağına</h2><span className="text-xs text-navy-500">En fazla 3 öneri</span></div>{!cards.length && <div className="rounded-2xl border border-surface-border bg-white p-6 text-sm leading-6 text-navy-500">{busy ? "Görüşmenin son durumu değerlendiriliyor…" : "Görüşmede netleştirilecek bir nokta olduğunda öneriler burada görünür."}</div>}{cards.map(card => <article key={card.key} className={`rounded-2xl border-l-4 p-5 shadow-card ${card.priority === "urgent" ? "border-rose-500 bg-rose-50" : card.priority === "important" ? "border-amber-500 bg-amber-50" : "border-accent-500 bg-accent-50"}`}><div className="mb-2 flex justify-between gap-2 text-xs font-semibold text-navy-600"><span>{CATEGORY[card.category]}</span><span>{PRIORITY[card.priority]}</span></div><h3 className="font-semibold text-navy-900">{card.title}</h3><p className="mt-2 text-sm leading-6 text-navy-600">{card.reason}</p><p className="mt-3 text-sm font-semibold leading-6 text-navy-900">“{card.question}”</p><a href={`#konusma-${card.source_id}`} className="mt-3 block break-words text-xs leading-5 text-navy-500">Kaynak · {card.source_id}. konuşma: “{card.source_quote}”</a><div className="mt-4 flex flex-wrap gap-2">{["Soruldu", "Belge iste", "Kapat"].map(action => <button key={action} onClick={() => closeCard(card, action)} disabled={busy || finishing} className="rounded-lg border border-black/10 bg-white/70 px-2.5 py-1.5 text-xs font-medium disabled:opacity-40">{action}</button>)}</div></article>)}{closed.length > 0 && <details className="rounded-xl border border-surface-border bg-white p-4 text-xs text-navy-600"><summary className="cursor-pointer font-semibold">İşaretlenen öneriler ({closed.length})</summary><ul className="mt-3 space-y-2">{closed.map((c,i) => <li key={i}>{c.state} · {c.card.question}</li>)}</ul></details>}<p className="px-1 text-xs leading-5 text-navy-400">Öneriler avukatın değerlendirmesi içindir. Kesin hukuki sonuç veya doğrulanmış süre hesabı değildir.</p></section>
    </div>
    {summary && <section className="rounded-2xl border border-accent-200 bg-white p-6 shadow-card" aria-label="Görüşme özeti"><p className="text-xs font-semibold uppercase tracking-wider text-accent-600">İncelemeniz için taslak</p><h2 className="mt-1 text-xl font-semibold text-navy-900">Görüşme sonu</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-navy-700">{summary.summary}</p><div className="mt-5 grid gap-5 md:grid-cols-2">{[{ title: "Açık sorular", rows: summary.open_questions }, { title: "İstenecek belgeler", rows: summary.documents }].map(group => <div key={group.title}><h3 className="font-semibold text-navy-800">{group.title}</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-navy-600">{group.rows.map((row,i) => <li key={i}>{row}</li>)}</ul></div>)}</div><button className={`${PRIMARY} mt-5`} onClick={download}>Metni ve özeti indir</button></section>}
  </div>;
}
