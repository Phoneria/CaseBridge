"use client";

import { useEffect, useRef, useState } from "react";

import { getLabStatus, trialAsk, trialBeat, trialGuide } from "@/lib/api";
import type { BeatResult, CaseRef, GuideResult, IntervMode, Karar, LabStatus, LawRef, TrialSide, TrialTurn } from "@/types/legalLab";
import { AiCard } from "@/components/ai/AiCard";
import { AiHero } from "@/components/ai/AiHero";
import { ErrorState } from "@/components/ErrorState";
import { CaseSource, GHOST_BTN, LawChip, ModeBanner, PRIMARY_BTN, hasCase } from "@/components/lab/LabBits";

const CHARS: Record<string, string> = { hakim: "Hâkim", davaci: "Davacı vekili", davali: "Davalı vekili", bilirkisi: "Bilirkişi" };
const TONE: Record<string, string> = {
  hakim: "border-navy-300 bg-navy-50",
  davaci: "border-accent-300 bg-accent-50",
  davali: "border-amber-200 bg-amber-50",
  bilirkisi: "border-emerald-200 bg-emerald-50",
  kullanici: "border-accent-600 bg-white",
};
const SONUC: Record<string, string> = { kabul: "Davanın kabulü", kismen_kabul: "Kısmen kabul", red: "Davanın reddi" };
const STAGES = ["Dava ve cevap", "Ön inceleme", "Delil ve ispat", "Bilirkişi raporu", "Hüküm"];

interface Composer {
  mode: IntervMode;
  target: string;
  text: string;
}

export function DirectedTrialView({ fixedCaseId }: { fixedCaseId?: string } = {}) {
  const [selection, setRef] = useState<CaseRef>({});
  const ref = fixedCaseId ? { case_id: fixedCaseId } : selection;
  const [side, setSide] = useState<TrialSide>("davaci");
  const [started, setStarted] = useState(false);
  const [stage, setStage] = useState(0);
  const [turns, setTurns] = useState<TrialTurn[]>([]);
  const [manual, setManual] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<BeatResult | null>(null);
  const [karar, setKarar] = useState<{ k: Karar; dersler: string[] } | null>(null);
  const [aside, setAside] = useState<{ q: string; a: string; law: LawRef[] } | null>(null);
  const [comp, setComp] = useState<Composer>({ mode: "order", target: "hakim", text: "" });
  const [sonuc, setSonuc] = useState<"kabul" | "kismen_kabul" | "red">("kismen_kabul");
  const [guideRole, setGuideRole] = useState<TrialSide>("hakim");
  const [guide, setGuide] = useState<GuideResult | null>(null);
  const [guideBusy, setGuideBusy] = useState(false);
  const [labStatus, setLabStatus] = useState<LabStatus | null>(null);
  const [full, setFull] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    getLabStatus().then(setLabStatus).catch(() => {});
  }, []);
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, busy]);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const judge = side === "hakim";
  const mode = last?.mode ?? labStatus?.mode;
  const note = last?.note ?? labStatus?.note;

  function tag(rows: BeatResult["turns"], stageIdx: number): TrialTurn[] {
    return rows.map((t) => ({ who: t.who, text: t.text, law: t.law, stage_name: STAGES[stageIdx] }));
  }

  async function beat(stageIdx: number, interv: Composer | null, history: TrialTurn[], manualSet = manual) {
    setBusy(true);
    setError(null);
    try {
      const res = await trialBeat({
        ...ref,
        side,
        stage_idx: stageIdx,
        transcript: history.map(({ who, text, stage_name }) => ({ who, text, stage_name })),
        interv: interv ? { mode: interv.mode, target: interv.target, text: interv.text, sonuc: interv.mode === "hukum" ? sonuc : null } : null,
        manual: manualSet,
      });
      setLast(res);
      setTurns([...history, ...tag(res.turns, stageIdx)]);
      if (res.karar) setKarar({ k: res.karar, dersler: res.dersler });
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sahne ilerletilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setTurns([]);
    setKarar(null);
    setAside(null);
    setGuide(null);
    setStage(0);
    setStarted(true);
    await beat(0, null, []);
  }

  async function next() {
    const n = Math.min(stage + 1, STAGES.length - 1);
    setStage(n);
    await beat(n, null, turns);
  }

  async function send() {
    const text = comp.text.trim();
    if (!text || busy) return;
    if (comp.mode === "aside") {
      setBusy(true);
      try {
        const r = await trialAsk({ ...ref, side, question: text, transcript: turns.map(({ who, text: t }) => ({ who, text: t })) });
        setAside({ q: text, a: r.answer, law: r.law });
        setComp({ ...comp, text: "" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Danışmana ulaşılamadı.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const marker: TrialTurn = { who: "kullanici", text: describe(comp, side), stage_name: STAGES[stage] };
    const history = comp.mode === "puppet" ? turns : [...turns, marker];
    setTurns(history);
    setComp({ ...comp, text: "" });
    await beat(stage, comp, history.concat(comp.mode === "puppet" ? [marker] : []).filter((t) => t !== marker || comp.mode !== "puppet"));
  }

  async function loadGuide(role: TrialSide) {
    setGuideRole(role);
    setGuide(null);
    setGuideBusy(true);
    try {
      setGuide(await trialGuide({ ...ref, role, stage_idx: stage, transcript: turns.map(({ who, text }) => ({ who, text })) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rehber hazırlanamadı.");
    } finally {
      setGuideBusy(false);
    }
  }

  function prefill(text: string, who: TrialSide | "bilirkisi") {
    // Own side's lawyer: an instruction. Otherwise: make that character say it.
    const own = !judge && who === side;
    setComp({ mode: own ? "order" : who === side && judge ? "order" : "direct", target: who === side ? (judge ? "hakim" : side) : who, text });
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function toggleManual(k: string) {
    setManual((m) => (m.includes(k) ? m.filter((x) => x !== k) : [...m, k]));
  }

  const shell = full ? "fixed inset-0 z-50 overflow-y-auto bg-navy-50 p-4" : "space-y-5";

  return (
    <div className={shell}>
      {!full && (
        <AiHero
          compact
          title="Yönetilen Duruşma"
          description="Dört karakterli duruşma: hâkim, iki vekil ve bilirkişi. Her karakteri siz yönetebilir ya da bırakıp izleyebilirsiniz; rehber bir sonraki hamleyi önerir."
        />
      )}

      {!started ? (
        <AiCard>
          {!fixedCaseId && <CaseSource value={ref} onChange={setRef} />}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div role="group" aria-label="Rolünüz" className="inline-flex rounded-xl border border-surface-border p-0.5">
              {(["davaci", "davali", "hakim"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={side === s}
                  onClick={() => {
                    setSide(s);
                    setGuideRole(s === "hakim" ? "hakim" : s);
                    setComp({ mode: s === "hakim" ? "order" : "order", target: s === "hakim" ? "davaci" : "hakim", text: "" });
                  }}
                  className={`rounded-[10px] px-3 py-1.5 text-sm font-medium ${side === s ? "bg-accent-600 text-white" : "text-navy-600 hover:text-accent-800"}`}
                >
                  {s === "hakim" ? "Hâkim" : s === "davaci" ? "Davacı vekili" : "Davalı vekili"}
                </button>
              ))}
            </div>
            <button type="button" onClick={start} disabled={!hasCase(ref) || busy} className={PRIMARY_BTN}>
              Duruşmayı başlat
            </button>
          </div>
          <ModeBanner mode={labStatus?.mode} note={labStatus?.note} />
        </AiCard>
      ) : (
        <div className={`grid gap-4 ${full ? "h-[calc(100vh-2rem)] lg:grid-cols-[minmax(0,1fr)_24rem]" : "lg:grid-cols-[minmax(0,1fr)_24rem]"}`}>
          <section className="flex min-h-0 flex-col rounded-2xl border border-surface-border bg-white shadow-card" aria-label="Duruşma sahnesi">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border px-4 py-3">
              <ol className="flex flex-wrap gap-1.5" aria-label="Aşamalar">
                {STAGES.map((s, i) => (
                  <li key={s} aria-current={i === stage ? "step" : undefined} className={`rounded-full px-2.5 py-1 text-xs font-medium ${i === stage ? "bg-accent-600 text-white" : i < stage ? "bg-accent-50 text-accent-700" : "bg-navy-50 text-navy-500"}`}>
                    {s}
                  </li>
                ))}
              </ol>
              <div className="flex gap-2">
                <button type="button" onClick={next} disabled={busy || stage >= STAGES.length - 1 || !!karar} className={GHOST_BTN}>
                  Sonraki aşama
                </button>
                <button type="button" onClick={() => setFull((f) => !f)} className={GHOST_BTN} aria-pressed={full}>
                  {full ? "Küçült" : "Tam ekran"}
                </button>
              </div>
            </header>

            <div className="grid grid-cols-2 gap-2 border-b border-surface-border px-4 py-3 sm:grid-cols-4">
              {Object.entries(CHARS).map(([k, name]) => (
                <div key={k} className={`rounded-xl border p-2 ${TONE[k]}`}>
                  <p className="text-xs font-semibold text-navy-900">{name}{k === side ? " (siz)" : ""}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button type="button" aria-pressed={manual.includes(k)} onClick={() => toggleManual(k)} className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ${manual.includes(k) ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-navy-600 ring-surface-border"}`}>
                      {manual.includes(k) ? "Elle" : "Oto"}
                    </button>
                    <button type="button" onClick={() => setComp({ mode: "puppet", target: k, text: comp.text })} className="rounded-md bg-white px-1.5 py-0.5 text-[11px] text-navy-600 ring-1 ring-surface-border hover:text-accent-700">
                      Olarak konuş
                    </button>
                    <button type="button" onClick={() => setComp({ mode: "direct", target: k, text: comp.text })} className="rounded-md bg-white px-1.5 py-0.5 text-[11px] text-navy-600 ring-1 ring-surface-border hover:text-accent-700">
                      Söylet
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div ref={feedRef} className={`min-h-[18rem] flex-1 space-y-2 overflow-y-auto px-4 py-3 ${full ? "" : "max-h-[30rem]"}`} aria-live="polite">
              {turns.map((t, i) => (
                <div key={i} className={`rounded-xl border px-3 py-2 text-sm leading-6 ${TONE[t.who] ?? TONE.hakim} ${t.who === "kullanici" ? "border-dashed" : ""}`}>
                  <p className="text-xs font-semibold text-navy-500">{t.who === "kullanici" ? "Müdahaleniz" : CHARS[t.who] ?? t.who}</p>
                  <p className="text-navy-900">{t.text}</p>
                  {t.law && t.law.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {t.law.map((l) => (
                        <LawChip key={l.code} law={l} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {busy && <p className="text-sm text-navy-400" role="status">Sahne ilerliyor…</p>}
              {karar && <KararCard k={karar.k} dersler={karar.dersler} />}
              {aside && (
                <div className="rounded-xl border border-accent-200 bg-white p-3 text-sm">
                  <p className="text-xs font-semibold text-accent-700">Kayıt dışı danışman · {aside.q}</p>
                  <p className="mt-1 text-navy-800">{aside.a}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">{aside.law.map((l) => <LawChip key={l.code} law={l} />)}</div>
                </div>
              )}
            </div>

            <footer className="space-y-2 border-t border-surface-border px-4 py-3">
              {error && <ErrorState message={error} />}
              {last && last.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5" aria-label="Öneriler">
                  {last.suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => setComp({ ...comp, text: s })} className="rounded-full bg-accent-50 px-2.5 py-1 text-xs text-accent-700 ring-1 ring-accent-100 hover:bg-accent-100">
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label="Müdahale türü" value={comp.mode} onChange={(e) => setComp({ ...comp, mode: e.target.value as IntervMode })} className="rounded-xl border border-surface-border bg-white px-2 py-1.5 text-sm">
                  <option value="order">{judge ? "Ara karar / talimat" : "Vekilime talimat"}</option>
                  <option value="say">Sahnede söz al</option>
                  <option value="direct">Karaktere söylet</option>
                  <option value="puppet">Karakter olarak konuş</option>
                  <option value="aside">Danışmana sor (kayıt dışı)</option>
                  {judge && <option value="hukum">Hükmü ver</option>}
                </select>
                {["say", "direct", "puppet"].includes(comp.mode) && (
                  <select aria-label="Karakter" value={comp.target} onChange={(e) => setComp({ ...comp, target: e.target.value })} className="rounded-xl border border-surface-border bg-white px-2 py-1.5 text-sm">
                    {Object.entries(CHARS).map(([k, n]) => (
                      <option key={k} value={k}>{n}</option>
                    ))}
                  </select>
                )}
                {comp.mode === "hukum" && (
                  <select aria-label="Hüküm" value={sonuc} onChange={(e) => setSonuc(e.target.value as typeof sonuc)} className="rounded-xl border border-surface-border bg-white px-2 py-1.5 text-sm">
                    {Object.entries(SONUC).map(([k, n]) => (
                      <option key={k} value={k}>{n}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  aria-label="Müdahale metni"
                  rows={2}
                  value={comp.text}
                  onChange={(e) => setComp({ ...comp, text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
                  }}
                  placeholder="Ne söylensin ya da yapılsın? (Ctrl+Enter ile gönder)"
                  className="min-h-[3rem] flex-1 rounded-xl border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
                />
                <button type="button" onClick={send} disabled={busy || !comp.text.trim()} className={PRIMARY_BTN}>
                  Gönder
                </button>
              </div>
            </footer>
          </section>

          <aside className="min-h-0 space-y-3 overflow-y-auto" aria-label="Rehber">
            <ModeBanner mode={mode} note={note} />
            <div className="rounded-2xl border border-surface-border bg-white p-4 shadow-card">
              <div role="tablist" aria-label="Rehber rolü" className="flex gap-1">
                {(["hakim", "davaci", "davali"] as const).map((r) => (
                  <button key={r} role="tab" aria-selected={guideRole === r} type="button" onClick={() => loadGuide(r)} className={`rounded-lg px-2.5 py-1 text-xs font-medium ${guideRole === r ? "bg-accent-600 text-white" : "bg-navy-50 text-navy-600 hover:text-accent-800"}`}>
                    {r === "hakim" ? "Hâkim" : r === "davaci" ? "Davacı vekili" : "Davalı vekili"}
                  </button>
                ))}
              </div>
              {guideBusy && <p className="mt-3 text-sm text-navy-400" role="status">Rehber hazırlanıyor…</p>}
              {!guide && !guideBusy && <p className="mt-3 text-sm text-navy-500">Bir rol seçin; rehber o tarafın şimdiki durumunu ve önerilen hamleleri çıkarır.</p>}
              {guide && <GuideBody g={guide} onUse={(text) => prefill(text, guide.role)} />}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function describe(c: Composer, side: TrialSide): string {
  const who = CHARS[c.target] ?? "";
  switch (c.mode) {
    case "puppet": return `${who} olarak: ${c.text}`;
    case "direct": return `${who} karakterine söylettiniz: ${c.text}`;
    case "say": return `${who} ile konuşuyorsunuz: ${c.text}`;
    case "hukum": return `Hüküm yönergesi: ${c.text}`;
    default: return side === "hakim" ? `Ara karar: ${c.text}` : `Vekile talimat: ${c.text}`;
  }
}

function KararCard({ k, dersler }: { k: Karar; dersler: string[] }) {
  return (
    <div className="rounded-xl border border-accent-300 bg-accent-50 p-4 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">Karar · {SONUC[k.sonuc] ?? k.sonuc}</p>
      <p className="mt-1 text-navy-900">{k.gerekce}</p>
      {k.hukum.length > 0 && <ul className="mt-2 list-disc pl-5 text-navy-700">{k.hukum.map((h) => <li key={h}>{h}</li>)}</ul>}
      {k.riskler.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-navy-800">Bozma riski olabilecek noktalar</p>
          <ul className="mt-1 space-y-1 text-navy-700">{k.riskler.map((r) => <li key={r.risk}>{r.risk} <span className="text-navy-500">→ {r.cozum}</span></li>)}</ul>
        </div>
      )}
      {dersler.length > 0 && <ul className="mt-3 list-disc pl-5 text-xs text-navy-600">{dersler.map((d) => <li key={d}>{d}</li>)}</ul>}
      <div className="mt-2 flex flex-wrap gap-1.5">{k.law?.map((l) => <LawChip key={l.code} law={l} />)}</div>
    </div>
  );
}

function UseBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-1 rounded-lg bg-accent-600 px-2 py-1 text-xs font-semibold text-white hover:bg-accent-700">
      {label}
    </button>
  );
}

function GuideBody({ g, onUse }: { g: GuideResult; onUse: (text: string) => void }) {
  if (g.role === "hakim") {
    return (
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-navy-700"><span className="font-semibold">{g.hazir ? "Karara hazır" : "Henüz hazır değil"}:</span> {g.hazir_neden}</p>
        {g.uyusmazlik && g.uyusmazlik.length > 0 && <Block title="Uyuşmazlık">{g.uyusmazlik.map((u) => <p key={u.konu}><b>{u.konu}</b> · {u.durum}<br /><span className="text-navy-500">Davacı: {u.davaci} · Davalı: {u.davali}</span></p>)}</Block>}
        {g.ispat && g.ispat.length > 0 && <Block title="İspat yükü">{g.ispat.map((i) => <div key={i.konu}><p><b>{i.konu}</b> → {i.yuk === "davaci" ? "davacı" : "davalı"}: {i.neden}</p><Laws laws={i.law} /></div>)}</Block>}
        {g.sorular && g.sorular.length > 0 && <Block title="Sorulabilecekler">{g.sorular.map((s) => <div key={s.soru}><p>{CHARS[s.kime]}: {s.soru}</p><UseBtn label="Hâkime söylet" onClick={() => onUse(s.soru)} /></div>)}</Block>}
        {g.sonraki && <Block title="Sonraki adım"><p>{g.sonraki.adim}</p><Laws laws={g.sonraki.law} /></Block>}
        {g.yollar && g.yollar.length > 0 && <Block title="Karar yolları">{g.yollar.map((y) => <p key={y.sonuc}><b>{SONUC[y.sonuc]}</b>: {y.kosul}<br /><span className="text-navy-500">Bozma riski: {y.bozma_riski}</span></p>)}</Block>}
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-3 text-sm">
      <p className="text-navy-700">{g.durum}</p>
      {g.hamleler && g.hamleler.length > 0 && (
        <Block title="Önerilen hamleler">
          {g.hamleler.map((h) => (
            <div key={h.hamle} data-testid="guide-move" className="rounded-xl bg-accent-50 p-2.5 ring-1 ring-accent-100">
              <p className="font-medium text-navy-900">{h.hamle}</p>
              <p className="text-xs text-navy-500">{h.neden} · risk: {h.risk}</p>
              <Laws laws={h.law} />
              <UseBtn label="Vekilime söylet" onClick={() => onUse(h.hamle)} />
            </div>
          ))}
        </Block>
      )}
      {g.guclu && g.guclu.length > 0 && <Block title="Güçlü yanlar">{g.guclu.map((x) => <div key={x.nokta}><p>{x.nokta}</p><Laws laws={x.law} /></div>)}</Block>}
      {g.zayif && g.zayif.length > 0 && <Block title="Zayıf yanlar">{g.zayif.map((x) => <p key={x.nokta}><b>{x.nokta}</b>: {x.risk} <span className="text-navy-500">→ {x.cozum}</span></p>)}</Block>}
      {g.karsi_hamle && g.karsi_hamle.length > 0 && <Block title="Karşı tarafın olası hamleleri">{g.karsi_hamle.map((x) => <p key={x.hamle}>{x.hamle} <span className="text-navy-500">→ {x.karsilik}</span></p>)}</Block>}
      {g.eksik_belge && g.eksik_belge.length > 0 && <Block title="Eksik belge">{g.eksik_belge.map((x) => <p key={x}>{x}</p>)}</Block>}
      {g.sureler && g.sureler.length > 0 && <Block title="Süreler">{g.sureler.map((x) => <p key={x}>{x}</p>)}</Block>}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-navy-400">{title}</h3>
      <div className="mt-1 space-y-1.5 text-navy-700">{children}</div>
    </div>
  );
}

function Laws({ laws }: { laws?: LawRef[] }) {
  if (!laws || laws.length === 0) return null;
  return <div className="mt-1 flex flex-wrap gap-1.5">{laws.map((l) => <LawChip key={l.code} law={l} />)}</div>;
}
