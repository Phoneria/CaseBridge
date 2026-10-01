"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  abandonCourtroomSession,
  getCourtroomSession,
  retryCourtroomSession,
  sendCourtroomMove,
} from "@/lib/api";
import { AI_ROUTES } from "@/lib/ai";
import type {
  CourtroomAction,
  CourtroomActor,
  CourtroomPhase,
  CourtroomSession,
} from "@/types";
import { AiMark } from "@/components/ai/AiMark";
import { AiBrand } from "@/components/ai/AiBrand";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";

const PHASES: Array<{ key: CourtroomPhase; label: string; hint: string }> = [
  { key: "opening", label: "Açılış", hint: "Olayı kendi tarafınızdan kısa ve düzenli biçimde çerçeveleyin." },
  { key: "main_arguments", label: "Ana iddia", hint: "Ana iddia veya savunmanızı somut olaylarla kurun." },
  { key: "evidence", label: "Delil", hint: "Bir delil seçip tam olarak neyi kanıtladığını açıklayın." },
  { key: "examination", label: "Sorgu", hint: "Hâkimin sorusuna cevap verin ve kayıtlardaki çelişkiyi gösterin." },
  { key: "rebuttal", label: "Karşı cevap", hint: "Karşı tarafın en güçlü noktasına doğrudan yanıt verin." },
  { key: "closing", label: "Kapanış", hint: "Kabul edilen delilleri toparlayıp talebinizi netleştirin." },
];

const ACTIONS: Record<Exclude<CourtroomPhase, "verdict">, Array<{ value: CourtroomAction; label: string }>> = {
  opening: [{ value: "opening", label: "Açılış beyanı" }, { value: "argument", label: "Argüman" }],
  main_arguments: [{ value: "argument", label: "Argüman" }, { value: "rebuttal", label: "Karşı cevap" }],
  evidence: [{ value: "evidence", label: "Delil sun" }, { value: "argument", label: "Argüman" }, { value: "objection", label: "İtiraz" }],
  examination: [{ value: "answer", label: "Soruyu yanıtla" }, { value: "argument", label: "Argüman" }, { value: "objection", label: "İtiraz" }],
  rebuttal: [{ value: "rebuttal", label: "Karşı cevap" }, { value: "argument", label: "Argüman" }, { value: "objection", label: "İtiraz" }],
  closing: [{ value: "closing", label: "Kapanış beyanı" }],
};

const DEFAULT_ACTION: Record<Exclude<CourtroomPhase, "verdict">, CourtroomAction> = {
  opening: "opening",
  main_arguments: "argument",
  evidence: "evidence",
  examination: "answer",
  rebuttal: "rebuttal",
  closing: "closing",
};

const ACTOR_META: Record<CourtroomActor, { label: string; badge: string; bubble: string }> = {
  user: { label: "Siz", badge: "bg-accent-100 text-accent-700", bubble: "border-accent-200 bg-accent-50/60" },
  opponent: { label: "Karşı avukat", badge: "bg-rose-100 text-rose-700", bubble: "border-rose-100 bg-rose-50/50" },
  judge: { label: "Hâkim", badge: "bg-amber-100 text-amber-800", bubble: "border-amber-200 bg-amber-50/60" },
  system: { label: "Duruşma kâtibi", badge: "bg-slate-100 text-slate-600", bubble: "border-surface-border bg-surface-muted" },
};

function ScoreCard({ session }: { session: CourtroomSession }) {
  const result = session.evaluation;
  if (!result) return null;
  const verdict = {
    plaintiff: "Davacı lehine",
    defendant: "Davalı lehine",
    partial: "Kısmi sonuç",
    undetermined: "Karar için yetersiz",
  }[result.verdict];
  const scores = [
    ["Konuya uygunluk", result.relevance_score],
    ["Delil kullanımı", result.evidence_score],
    ["Karşı cevap", result.rebuttal_score],
    ["Duruşma stratejisi", result.courtroom_strategy_score],
  ] as const;

  return (
    <section className="rounded-2xl border border-accent-200 bg-white p-6 shadow-card">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-600">Kurgusal karar</p>
          <h2 className="mt-1 text-xl font-semibold text-navy-900">{verdict}</h2>
          <p className="mt-2 text-sm text-navy-600">{result.summary}</p>
        </div>
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-8 border-accent-100 text-center">
          <span><strong className="block text-2xl text-accent-700">{result.total_score}</strong><span className="text-xs text-navy-500">/ 100</span></span>
        </div>
      </div>
      <p className="mt-4 rounded-xl bg-surface-muted p-4 text-sm leading-6 text-navy-700">{result.reasoning}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {scores.map(([label, value]) => (
          <div key={label}>
            <div className="mb-1 flex justify-between text-xs"><span className="text-navy-600">{label}</span><strong className="text-navy-800">{value}/25</strong></div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-accent-500" style={{ width: `${value * 4}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {[
          ["Güçlü yanların", result.user_strengths, "text-emerald-700"],
          ["Geliştirilecekler", result.user_weaknesses, "text-rose-700"],
          ["Sonraki prova", result.learning_notes, "text-accent-700"],
        ].map(([title, items, color]) => (
          <div key={title as string} className="rounded-xl border border-surface-border p-4">
            <p className={`text-sm font-semibold ${color}`}>{title as string}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-navy-600">{(items as string[]).map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-navy-500">{result.disclaimer}</p>
    </section>
  );
}

export function CourtroomSessionView({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<CourtroomSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [action, setAction] = useState<CourtroomAction>("opening");
  const [evidenceCode, setEvidenceCode] = useState("");
  const transcriptEnd = useRef<HTMLDivElement>(null);

  async function refresh() {
    const next = await getCourtroomSession(sessionId);
    setSession(next);
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    getCourtroomSession(sessionId)
      .then((next) => { if (!cancelled) setSession(next); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Oturum yüklenemedi."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    if (!session || session.status !== "active" || session.current_actor !== "opponent") return;
    const timer = window.setInterval(() => {
      refresh().catch(() => setError("AI yanıtı kontrol edilemedi; yeniden denenecek."));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [session?.status, session?.current_actor, sessionId]);

  useEffect(() => {
    if (!session || session.phase === "verdict") return;
    setAction(DEFAULT_ACTION[session.phase]);
    setEvidenceCode("");
  }, [session?.phase]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [session?.turns.length]);

  const currentPhase = useMemo(
    () => PHASES.find((phase) => phase.key === session?.phase),
    [session?.phase]
  );

  async function submit() {
    if (!session || content.trim().length < 2) return;
    if (action === "evidence" && !evidenceCode) {
      setError("Delil sunmak için soldaki dosyadan bir delil seçin.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const next = await sendCourtroomMove(session.id, {
        content: content.trim(),
        action_type: action,
        evidence_code: action === "evidence" ? evidenceCode : undefined,
        client_request_id: typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      });
      setSession(next);
      setContent("");
      setEvidenceCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hamle gönderilemedi.");
    } finally {
      setSending(false);
    }
  }

  async function retry() {
    if (!session) return;
    setSending(true);
    setError(null);
    try { setSession(await retryCourtroomSession(session.id)); }
    catch (err) { setError(err instanceof Error ? err.message : "Tekrar denenemedi."); }
    finally { setSending(false); }
  }

  async function abandon() {
    if (!session) return;
    setSending(true);
    try { setSession(await abandonCourtroomSession(session.id)); }
    catch (err) { setError(err instanceof Error ? err.message : "Oturum kapatılamadı."); }
    finally { setSending(false); }
  }

  if (loading) return <LoadingState />;
  if (!session) return <ErrorState message={error ?? "Oturum bulunamadı."} />;

  const activeActions = session.phase === "verdict" ? [] : ACTIONS[session.phase];
  const waiting = session.status === "active" && session.current_actor === "opponent";
  const canWrite = session.status === "active" && session.current_actor === "user";

  return (
    <div className="space-y-5">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent-600">
        <AiMark className="h-3.5 w-3.5 text-accent-500" />
        <AiBrand /> · Canlı Duruşma
      </p>
      <header className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
        <div className="flex items-start gap-3">
          <Link
            href={AI_ROUTES.courtroom}
            aria-label="Canlı Duruşma'ya dön"
            className="mt-1 rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-navy-600 hover:bg-surface-muted"
          >
            ←
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-600">{session.scenario.category} · {session.model}</p>
            <h1 className="mt-1 text-xl font-semibold text-navy-900">{session.scenario.title}</h1>
            <p className="mt-1 text-sm text-navy-500">Rolünüz: <strong>{session.chosen_role === "plaintiff" ? "Davacı vekili" : "Davalı vekili"}</strong></p>
            <p className="mt-0.5 text-xs text-navy-500">{session.scenario.plaintiff_name} (davacı) / {session.scenario.defendant_name} (davalı)</p>
          </div>
        </div>
        {session.status === "active" && <button type="button" disabled={sending} onClick={abandon} className="self-start text-xs font-medium text-navy-500 hover:text-rose-600">Oturumu terk et</button>}
      </header>

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-surface-border bg-white p-2">
        {PHASES.map((phase, index) => {
          const activeIndex = session.phase === "verdict" ? PHASES.length : PHASES.findIndex((item) => item.key === session.phase);
          const complete = index < activeIndex;
          const active = index === activeIndex;
          return <div key={phase.key} className={`min-w-[110px] flex-1 rounded-xl px-3 py-2 text-center text-xs font-semibold ${active ? "bg-accent-600 text-white" : complete ? "bg-emerald-50 text-emerald-700" : "text-navy-400"}`}>{complete ? "✓ " : ""}{phase.label}</div>;
        })}
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {session.status === "failed" && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span>{session.error_message ?? "Yerel model bu turu tamamlayamadı."}</span>
          <button type="button" disabled={sending} onClick={retry} className="rounded-lg bg-amber-700 px-3 py-2 font-semibold text-white">Yeniden dene</button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_280px]">
        <aside className="space-y-4">
          <section className="rounded-2xl border border-surface-border bg-white p-4 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent-600">Size özel dosya notu</p>
            <p className="mt-2 text-sm font-semibold leading-5 text-navy-900">{session.role_brief.objective}</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-4 text-xs leading-5 text-navy-600">{session.role_brief.known_facts?.map((fact) => <li key={fact}>{fact}</li>)}</ul>
            {session.role_brief.strategy_notes?.map((note) => <p key={note} className="mt-3 rounded-lg bg-accent-50 p-2.5 text-xs leading-5 text-accent-800">💡 {note}</p>)}
          </section>
          <section className="rounded-2xl border border-surface-border bg-white p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold text-navy-900">Delil dosyanız</p><span className="text-xs text-navy-500">{session.available_evidence.length}</span></div>
            <div className="space-y-2">
              {session.available_evidence.map((item) => {
                const used = session.presented_evidence_codes.includes(item.code);
                const selected = evidenceCode === item.code;
                return <button key={item.code} type="button" disabled={!canWrite || action !== "evidence"} onClick={() => setEvidenceCode(item.code)} className={`w-full rounded-xl border p-3 text-left transition ${selected ? "border-accent-400 bg-accent-50" : "border-surface-border bg-white"} disabled:cursor-default disabled:opacity-70`}>
                  <div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold text-navy-800">{item.title}</p>{used && <span className="text-[10px] font-semibold text-emerald-700">SUNULDU</span>}</div>
                  <p className="mt-1 text-[11px] leading-4 text-navy-500">{item.description}</p>
                  {selected && <p className="mt-2 border-t border-accent-100 pt-2 text-[11px] leading-4 text-navy-700">{item.content}</p>}
                </button>;
              })}
            </div>
          </section>
        </aside>

        <main className="flex min-h-[620px] flex-col rounded-2xl border border-surface-border bg-white shadow-card">
          <div className="border-b border-surface-border px-5 py-4">
            <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-navy-900">Duruşma tutanağı</p><span className="text-xs text-navy-500">Tur {session.round_number}/{session.max_rounds}</span></div>
            {currentPhase && <p className="mt-1 text-xs leading-5 text-navy-500">{currentPhase.hint}</p>}
          </div>
          <div className="max-h-[540px] flex-1 space-y-3 overflow-y-auto p-5">
            {session.turns.map((turn) => {
              const meta = ACTOR_META[turn.actor];
              return <div key={turn.id} className={`rounded-xl border p-4 ${meta.bubble}`}>
                <div className="mb-2 flex items-center justify-between gap-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${meta.badge}`}>{meta.label}</span><span className="text-[10px] text-navy-500">{turn.turn_type.replace("_", " ")}</span></div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-navy-800">{turn.content}</p>
                {turn.evidence_title && <p className="mt-2 rounded-lg bg-white/80 p-2 text-xs font-medium text-navy-600">📎 {turn.evidence_title}</p>}
              </div>;
            })}
            {waiting && <div className="rounded-xl border border-dashed border-accent-200 bg-accent-50/50 p-4 text-sm text-accent-700"><span className="mr-2 inline-block animate-pulse">●</span>Karşı avukat ve hâkim yanıt hazırlıyor…</div>}
            <div ref={transcriptEnd} />
          </div>
          {canWrite && (
            <div className="border-t border-surface-border p-4">
              <div className="mb-2 flex flex-wrap gap-2">{activeActions.map((item) => <button key={item.value} type="button" onClick={() => { setAction(item.value); if (item.value !== "evidence") setEvidenceCode(""); }} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${action === item.value ? "bg-navy-900 text-white" : "bg-surface-muted text-navy-600"}`}>{item.label}</button>)}</div>
              {session.pending_judge_question && <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Hâkimin sorusu: {session.pending_judge_question}</p>}
              {action === "evidence" && <p className="mb-2 text-xs text-accent-700">{evidenceCode ? `Seçili delil: ${session.available_evidence.find((item) => item.code === evidenceCode)?.title}` : "Soldaki dosyadan sunacağınız delili seçin."}</p>}
              <textarea value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit(); }} rows={4} maxLength={4000} placeholder="Hâkime hitaben beyanınızı yazın. İddianızı somut olay ve delille bağlantılandırın…" className="w-full resize-none rounded-xl border border-surface-border p-3 text-sm text-navy-800 outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-100" />
              <div className="mt-2 flex items-center justify-between"><span className="text-[11px] text-navy-500">⌘/CTRL + Enter · {content.length}/4000</span><button type="button" onClick={submit} disabled={sending || content.trim().length < 2 || (action === "evidence" && !evidenceCode)} className="rounded-xl bg-accent-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50">Beyanı gönder</button></div>
            </div>
          )}
        </main>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-surface-border bg-white p-4 shadow-card">
            <p className="text-sm font-semibold text-navy-900">Ortak olaylar</p>
            <ol className="mt-3 space-y-2 text-xs leading-5 text-navy-600">{session.scenario.public_facts.map((fact, index) => <li key={fact} className="flex gap-2"><span className="font-bold text-accent-600">{index + 1}.</span><span>{fact}</span></li>)}</ol>
          </section>
          <section className="rounded-2xl border border-surface-border bg-white p-4 shadow-card">
            <p className="text-sm font-semibold text-navy-900">Hâkimin arayacağı cevaplar</p>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-xs leading-5 text-navy-600">{session.scenario.disputed_issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
          </section>
          <section className="rounded-xl bg-navy-900 p-4 text-xs leading-5 text-white/70"><strong className="text-white">Eğitim modu</strong><br />Taraflar ve hâkim aynı yerel modeli farklı, birbirinden ayrı talimatlarla kullanır. Sonuç hukuki danışmanlık değildir.</section>
        </aside>
      </div>

      <ScoreCard session={session} />
    </div>
  );
}
