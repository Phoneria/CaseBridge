"use client";

import { useEffect, useState } from "react";

import {
  addCaseEvent,
  createTask,
  generateHandover,
  getCase,
  getSimulation,
  listCaseTasks,
  listDocuments,
  listSimulations,
  retrySimulation,
  startSimulation,
  updateTaskStatus,
  uploadDocument,
} from "@/lib/api";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, SIMULATION_STATUS_LABELS, formatDate } from "@/lib/labels";
import { parseCaseTab, type CaseTabSlug } from "@/lib/filters";
import { useUrlParams } from "@/lib/urlState";
import type { CaseDetail, DocumentItem, HandoverReport, Simulation, Task } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { SimulationResultCard } from "@/components/SimulationResultCard";
import { AiMark } from "@/components/ai/AiMark";
import { AiBrand } from "@/components/ai/AiBrand";
import { CaseAiSummaryCard } from "@/components/ai/CaseAiSummaryCard";
import { AI_PERSPECTIVES } from "@/lib/ai";
import { CaseDocumentsPanel } from "@/components/CaseDocumentsPanel";

const TABS = [
  { slug: "genel", label: "Genel Bakış" },
  { slug: "belgeler", label: "Belgeler" },
  { slug: "gelismeler", label: "Gelişmeler" },
  { slug: "gorevler", label: "Görevler" },
  { slug: "ai", label: "CaseBridge AI" },
  { slug: "devir", label: "Devir Raporu" },
  { slug: "notlar", label: "Notlar" },
] as const satisfies ReadonlyArray<{ slug: CaseTabSlug; label: string }>;
type Tab = (typeof TABS)[number]["label"];

function labelForSlug(slug: CaseTabSlug): Tab {
  return TABS.find((tab) => tab.slug === slug)!.label;
}

// Shortened in the test environment so polling tests don't need to fake
// timers or wait multiple real seconds - the same code path runs either way.
const SIMULATION_POLL_INTERVAL_MS = process.env.NODE_ENV === "test" ? 10 : 2000;

function isTerminalSimulation(status: Simulation["status"]): boolean {
  return status === "completed" || status === "failed";
}

export function CaseDetailView({ caseId }: { caseId: string }) {
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { params, setParams } = useUrlParams();
  const sekmeParam = params.get("sekme");
  const [activeTab, setActiveTab] = useState<Tab>(() => labelForSlug(parseCaseTab(sekmeParam)));
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [eventForm, setEventForm] = useState({ event_date: "", title: "" });
  const [addingEvent, setAddingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [handoverReport, setHandoverReport] = useState<HandoverReport | null>(null);
  const [handoverGenerating, setHandoverGenerating] = useState(false);
  const [handoverError, setHandoverError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskForm, setTaskForm] = useState({ title: "", due_date: "" });
  const [addingTask, setAddingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([getCase(caseId), listDocuments(caseId), listSimulations(caseId), listCaseTasks(caseId)])
      .then(([caseResult, documentsResult, simulationsResult, tasksResult]) => {
        setCaseDetail(caseResult);
        setDocuments(documentsResult);
        setSimulations(simulationsResult);
        setTasks(tasksResult);

        // Refresh-safe: if a simulation was still pending/running when the
        // page was last closed or reloaded, resume polling it instead of
        // leaving it silently stuck in the UI.
        const inFlight = simulationsResult.find((s) => !isTerminalSimulation(s.status));
        if (inFlight) {
          setSimulationRunning(true);
          pollSimulationUntilTerminal(inFlight.id).finally(() => setSimulationRunning(false));
        }
      })
      .catch(() => setError("Dava yüklenemedi. Lütfen daha sonra tekrar deneyin."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  // Follow external URL changes (e.g. a quick-view shortcut to another tab of this case).
  useEffect(() => {
    setActiveTab(labelForSlug(parseCaseTab(sekmeParam)));
  }, [sekmeParam]);

  function upsertSimulation(updated: Simulation) {
    setSimulations((prev) => {
      const exists = prev.some((s) => s.id === updated.id);
      if (exists) {
        return prev.map((s) => (s.id === updated.id ? updated : s));
      }
      return [updated, ...prev];
    });
  }

  async function pollSimulationUntilTerminal(simulationId: string): Promise<void> {
    const current = await getSimulation(caseId, simulationId);
    upsertSimulation(current);
    if (isTerminalSimulation(current.status)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, SIMULATION_POLL_INTERVAL_MS));
    await pollSimulationUntilTerminal(simulationId);
  }

  async function handleStartSimulation() {
    setSimulationRunning(true);
    setSimulationError(null);
    try {
      const simulation = await startSimulation(caseId);
      upsertSimulation(simulation);
      if (!isTerminalSimulation(simulation.status)) {
        await pollSimulationUntilTerminal(simulation.id);
      }
    } catch {
      setSimulationError("Analiz başlatılamadı. Lütfen daha sonra tekrar deneyin.");
    } finally {
      setSimulationRunning(false);
    }
  }

  async function handleRetrySimulation(simulationId: string) {
    setSimulationRunning(true);
    setSimulationError(null);
    try {
      const retried = await retrySimulation(caseId, simulationId);
      upsertSimulation(retried);
      if (!isTerminalSimulation(retried.status)) {
        await pollSimulationUntilTerminal(retried.id);
      }
    } catch {
      setSimulationError("Analiz tekrar başlatılamadı. Lütfen daha sonra tekrar deneyin.");
    } finally {
      setSimulationRunning(false);
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      await uploadDocument(caseId, file);
      const refreshed = await listDocuments(caseId);
      setDocuments(refreshed);
    } catch {
      setUploadError("Belge yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setUploading(false);
    }
  }

  async function handleAddEvent(event: React.FormEvent) {
    event.preventDefault();
    setAddingEvent(true);
    setEventError(null);
    try {
      const newEvent = await addCaseEvent(caseId, {
        event_date: eventForm.event_date,
        title: eventForm.title,
      });
      setCaseDetail((prev) => (prev ? { ...prev, timeline: [...prev.timeline, newEvent] } : prev));
      setEventForm({ event_date: "", title: "" });
    } catch {
      setEventError("Gelişme eklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setAddingEvent(false);
    }
  }

  async function handleAddTask(event: React.FormEvent) {
    event.preventDefault();
    setAddingTask(true);
    setTaskError(null);
    try {
      const payload: { title: string; due_date?: string } = { title: taskForm.title };
      if (taskForm.due_date) payload.due_date = taskForm.due_date;
      const newTask = await createTask(caseId, payload);
      setTasks((prev) => [...prev, newTask]);
      setTaskForm({ title: "", due_date: "" });
    } catch {
      setTaskError("Görev eklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setAddingTask(false);
    }
  }

  async function handleToggleTask(task: Task) {
    setTaskError(null);
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    try {
      const updated = await updateTaskStatus(caseId, task.id, nextStatus);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      setTaskError("Görev güncellenemedi. Lütfen tekrar deneyin.");
    }
  }

  function selectTab(tab: (typeof TABS)[number]) {
    setActiveTab(tab.label);
    setParams({ sekme: tab.slug === "genel" ? null : tab.slug });
  }

  async function handleGenerateHandover() {
    setHandoverGenerating(true);
    setHandoverError(null);
    try {
      const report = await generateHandover(caseId);
      setHandoverReport(report);
    } catch {
      setHandoverError("Devir raporu oluşturulamadı. Lütfen tekrar deneyin.");
    } finally {
      setHandoverGenerating(false);
    }
  }

  if (loading) return <LoadingState label="Dava yükleniyor..." />;
  if (error) return <ErrorState message={error} />;
  if (!caseDetail) return null;

  const notes = caseDetail.timeline.filter((e) => e.event_type === "note");
  const pendingTasks = tasks.filter((task) => task.status === "pending").length;
  const latestEvents = [...caseDetail.timeline].sort((a, b) => b.event_date.localeCompare(a.event_date));
  const latestDocuments = [...documents].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  const orderedTasks = [...tasks].sort((a, b) => {
    if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
    return (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31");
  });

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-accent-600">
          {caseDetail.case_number}
        </p>
        <h1 className="text-xl font-semibold text-navy-900">{caseDetail.case_name}</h1>
        <p className="text-sm text-navy-500">
          {caseDetail.client_name}
          {caseDetail.opposing_party ? ` vs. ${caseDetail.opposing_party}` : ""}
        </p>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-surface-border">
        {TABS.map((tab) => (
          <button
            key={tab.slug}
            role="tab"
            aria-selected={activeTab === tab.label}
            onClick={() => selectTab(tab)}
            className={`px-3 py-2 text-sm font-medium ${
              activeTab === tab.label
                ? "border-b-2 border-accent-600 text-accent-700"
                : tab.slug === "ai"
                  ? "text-accent-600 hover:text-accent-800"
                  : "text-navy-500 hover:text-navy-800"
            }`}
          >
            {tab.slug === "ai" ? (
              <span className="inline-flex items-center gap-1.5">
                <AiMark className="h-3.5 w-3.5 text-accent-500" />
                {tab.label}
              </span>
            ) : (
              tab.label
            )}
          </button>
        ))}
      </div>

      {activeTab === "Genel Bakış" && (
        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
            <div className="grid gap-px bg-surface-border sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Kategori", CASE_TYPE_LABELS[caseDetail.case_type]],
                ["Mahkeme", caseDetail.court ?? "—"],
                ["Durum", CASE_STATUS_LABELS[caseDetail.status]],
                ["Açılış Tarihi", formatDate(caseDetail.opening_date)],
                ["Sonraki Duruşma", caseDetail.next_hearing_date ? formatDate(caseDetail.next_hearing_date) : "Planlanmadı"],
                ["Karşı Taraf", caseDetail.opposing_party ?? "—"],
                ["Dava Değeri", caseDetail.case_value ? new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(caseDetail.case_value) : "Belirtilmedi"],
                ["Dosya Numarası", caseDetail.case_number],
              ].map(([label, value]) => <div key={label} className="bg-white p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">{label}</p>
                <p className="mt-1 text-sm font-medium text-navy-800">{value}</p>
              </div>)}
            </div>
            {caseDetail.description && <div className="border-t border-surface-border bg-surface-muted/60 px-5 py-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">Dava Özeti</p><p className="mt-1 text-sm leading-6 text-navy-700">{caseDetail.description}</p></div>}
          </section>

          <div className="grid grid-cols-3 gap-3">
            <button type="button" onClick={() => selectTab(TABS.find((tab) => tab.slug === "belgeler")!)} className="rounded-2xl border border-surface-border bg-white p-4 text-left shadow-card transition hover:border-accent-200 hover:bg-accent-50/30">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">Belgeler</p><p className="mt-1 text-2xl font-bold text-navy-900">{documents.length}</p><p className="text-xs text-navy-500">dosya kayıtlı</p>
            </button>
            <button type="button" onClick={() => selectTab(TABS.find((tab) => tab.slug === "gelismeler")!)} className="rounded-2xl border border-surface-border bg-white p-4 text-left shadow-card transition hover:border-accent-200 hover:bg-accent-50/30">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">Gelişmeler</p><p className="mt-1 text-2xl font-bold text-navy-900">{caseDetail.timeline.length}</p><p className="text-xs text-navy-500">zaman çizelgesi kaydı</p>
            </button>
            <button type="button" onClick={() => selectTab(TABS.find((tab) => tab.slug === "gorevler")!)} className="rounded-2xl border border-surface-border bg-white p-4 text-left shadow-card transition hover:border-accent-200 hover:bg-accent-50/30">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-navy-400">Açık Görevler</p><p className={`mt-1 text-2xl font-bold ${pendingTasks ? "text-amber-600" : "text-emerald-600"}`}>{pendingTasks}</p><p className="text-xs text-navy-500">{tasks.length} toplam görev</p>
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <section className="flex min-h-[390px] flex-col overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
              <header className="flex items-center justify-between border-b border-surface-border bg-gradient-to-r from-white to-accent-50/60 px-4 py-3">
                <div><h2 className="text-sm font-semibold text-navy-800">Belgeler</h2><p className="text-[11px] text-navy-500">Dosyadaki güncel evraklar</p></div>
                <button type="button" onClick={() => selectTab(TABS.find((tab) => tab.slug === "belgeler")!)} className="text-xs font-semibold text-accent-700 hover:underline">Tümünü aç →</button>
              </header>
              {latestDocuments.length === 0 ? <div className="grid flex-1 place-items-center p-5"><EmptyState message="Henüz belge yok." hint="Belgeler sekmesinden yükleyebilirsiniz." /></div> : <ul className="max-h-[390px] divide-y divide-surface-border overflow-y-auto">
                {latestDocuments.map((document) => <li key={document.id} className="p-4">
                  <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-50 text-[9px] font-bold uppercase text-accent-700 ring-1 ring-accent-100">{document.file_type}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-navy-800">{document.filename}</p><p className="mt-0.5 text-[11px] text-navy-500">Yüklendi: {formatDate(document.uploaded_at)}</p></div></div>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-navy-500">{document.extracted_text?.trim() || "Belge metni henüz çıkarılmadı; orijinal dosya belge görüntüleyicisinden açılabilir."}</p>
                </li>)}
              </ul>}
            </section>

            <section className="flex min-h-[390px] flex-col overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
              <header className="flex items-center justify-between border-b border-surface-border bg-gradient-to-r from-white to-accent-50/60 px-4 py-3">
                <div><h2 className="text-sm font-semibold text-navy-800">Gelişmeler</h2><p className="text-[11px] text-navy-500">En yeniden eskiye dosya hareketleri</p></div>
                <button type="button" onClick={() => selectTab(TABS.find((tab) => tab.slug === "gelismeler")!)} className="text-xs font-semibold text-accent-700 hover:underline">Gelişme ekle →</button>
              </header>
              {latestEvents.length === 0 ? <div className="grid flex-1 place-items-center p-5"><EmptyState message="Henüz gelişme yok." /></div> : <ol className="max-h-[390px] overflow-y-auto p-4">
                {latestEvents.map((event, index) => <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {index < latestEvents.length - 1 && <span className="absolute bottom-0 left-[7px] top-4 w-px bg-accent-100" />}
                  <span className="relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-[3px] border-white bg-accent-500 ring-1 ring-accent-200" />
                  <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-accent-600">{formatDate(event.event_date)}</p><p className="mt-0.5 text-sm font-semibold text-navy-800">{event.title}</p>{event.description && <p className="mt-1 text-xs leading-5 text-navy-500">{event.description}</p>}</div>
                </li>)}
              </ol>}
            </section>

            <section className="flex min-h-[390px] flex-col overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
              <header className="flex items-center justify-between border-b border-surface-border bg-gradient-to-r from-white to-accent-50/60 px-4 py-3">
                <div><h2 className="text-sm font-semibold text-navy-800">Görevler</h2><p className="text-[11px] text-navy-500">Öncelikli işler ve son tarihler</p></div>
                <button type="button" onClick={() => selectTab(TABS.find((tab) => tab.slug === "gorevler")!)} className="text-xs font-semibold text-accent-700 hover:underline">Görev ekle →</button>
              </header>
              {orderedTasks.length === 0 ? <div className="grid flex-1 place-items-center p-5"><EmptyState message="Henüz görev yok." hint="Görevler sekmesinden ekleyebilirsiniz." /></div> : <ul className="max-h-[390px] divide-y divide-surface-border overflow-y-auto px-4">
                {orderedTasks.map((task) => {
                  const overdue = task.status === "pending" && Boolean(task.due_date) && task.due_date! < new Date().toISOString().slice(0, 10);
                  return <li key={task.id} className="flex gap-3 py-3">
                    <input type="checkbox" checked={task.status === "completed"} onChange={() => handleToggleTask(task)} className="mt-0.5 h-4 w-4 rounded border-surface-border text-accent-600 focus:ring-accent-400" aria-label={`${task.title} tamamlandı olarak işaretle`} />
                    <div className="min-w-0 flex-1"><p className={`text-sm font-medium ${task.status === "completed" ? "text-navy-400 line-through" : "text-navy-800"}`}>{task.title}</p>{task.description && <p className="mt-1 text-xs leading-5 text-navy-500">{task.description}</p>}<div className="mt-2 flex flex-wrap gap-1.5">{task.due_date && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${overdue ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{overdue ? "Gecikti · " : "Son tarih · "}{formatDate(task.due_date)}</span>}<span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${task.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-accent-50 text-accent-700"}`}>{task.status === "completed" ? "Tamamlandı" : "Devam ediyor"}</span></div></div>
                  </li>;
                })}
              </ul>}
            </section>
          </div>

          <CaseAiSummaryCard
            simulations={simulations}
            running={simulationRunning}
            onStart={handleStartSimulation}
            onOpenReport={() => selectTab(TABS.find((tab) => tab.slug === "ai")!)}
          />
          {simulationError && <ErrorState message={simulationError} />}
        </div>
      )}

      {activeTab === "Belgeler" && (
        <CaseDocumentsPanel
          documents={documents}
          uploading={uploading}
          uploadError={uploadError}
          onUpload={uploadFile}
          onDeleted={(id) => setDocuments((prev) => prev.filter((d) => d.id !== id))}
        />
      )}

      {activeTab === "Gelişmeler" && (
        <div className="space-y-4 rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <form onSubmit={handleAddEvent} className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="event_date" className="mb-1 block text-xs font-medium text-navy-600">
                Tarih
              </label>
              <input
                id="event_date"
                type="date"
                required
                value={eventForm.event_date}
                onChange={(event) => setEventForm({ ...eventForm, event_date: event.target.value })}
                className="rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="event_title" className="mb-1 block text-xs font-medium text-navy-600">
                Gelişme Başlığı
              </label>
              <input
                id="event_title"
                required
                value={eventForm.title}
                onChange={(event) => setEventForm({ ...eventForm, title: event.target.value })}
                className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
              />
            </div>
            <button
              type="submit"
              disabled={addingEvent}
              className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
            >
              {addingEvent ? "Ekleniyor..." : "Ekle"}
            </button>
          </form>
          {eventError && <ErrorState message={eventError} />}

          {caseDetail.timeline.length === 0 ? (
            <EmptyState message="Henüz gelişme yok." />
          ) : (
            <ol className="space-y-4">
              {caseDetail.timeline.map((event) => (
                <li key={event.id} className="flex gap-4">
                  <div className="w-24 shrink-0 text-xs text-navy-500">{formatDate(event.event_date)}</div>
                  <div>
                    <p className="text-sm font-medium text-navy-800">{event.title}</p>
                    {event.description && <p className="text-xs text-navy-500">{event.description}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {activeTab === "Görevler" && (
        <div className="space-y-4 rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          <form onSubmit={handleAddTask} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="task_title" className="mb-1 block text-xs font-medium text-navy-600">
                Görev Başlığı
              </label>
              <input
                id="task_title"
                required
                value={taskForm.title}
                onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })}
                className="w-full rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
              />
            </div>
            <div>
              <label htmlFor="task_due_date" className="mb-1 block text-xs font-medium text-navy-600">
                Son Tarih (opsiyonel)
              </label>
              <input
                id="task_due_date"
                type="date"
                value={taskForm.due_date}
                onChange={(event) => setTaskForm({ ...taskForm, due_date: event.target.value })}
                className="rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400"
              />
            </div>
            <button
              type="submit"
              disabled={addingTask}
              className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
            >
              {addingTask ? "Ekleniyor..." : "Görev Ekle"}
            </button>
          </form>
          {taskError && <ErrorState message={taskError} />}

          {tasks.length === 0 ? (
            <EmptyState message="Bu dava için henüz görev yok." hint="Yukarıdaki formla yeni bir görev ekleyin." />
          ) : (
            <ul className="divide-y divide-surface-border text-sm">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center gap-3 py-3">
                  <input
                    type="checkbox"
                    checked={task.status === "completed"}
                    onChange={() => handleToggleTask(task)}
                    className="h-4 w-4 rounded border-surface-border text-accent-600 focus:ring-accent-400"
                    aria-label={`${task.title} tamamlandı olarak işaretle`}
                  />
                  <div className="flex-1">
                    <p
                      className={
                        task.status === "completed"
                          ? "text-navy-400 line-through"
                          : "text-navy-800"
                      }
                    >
                      {task.title}
                    </p>
                    {task.due_date && (
                      <p className="text-xs text-navy-500">Son tarih: {formatDate(task.due_date)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === "CaseBridge AI" && (
        <div className="space-y-4">
          <div className="relative flex flex-col gap-3 overflow-hidden rounded-2xl bg-navy-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-ai-glow" />
            <div className="relative">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent-200">
                <AiMark className="h-3.5 w-3.5 text-accent-300" />
                <AiBrand /> · Dosya Analizi
              </p>
              <p className="mt-1 text-sm text-accent-100">{AI_PERSPECTIVES.join(" · ")}</p>
            </div>
            <button
              type="button"
              onClick={handleStartSimulation}
              disabled={simulationRunning}
              className="relative rounded-xl bg-white px-4 py-2 text-sm font-semibold text-navy-900 hover:bg-accent-50 disabled:opacity-60"
            >
              {simulationRunning
                ? "Analiz sürüyor…"
                : simulations.some((s) => s.status === "completed")
                  ? "Yeniden analiz et"
                  : "Analizi başlat"}
            </button>
          </div>
          {simulationError && <ErrorState message={simulationError} />}
          {simulations.length === 0 ? (
            <EmptyState message="Bu dava için henüz AI analizi yapılmadı." />
          ) : (
            simulations.map((sim) =>
              sim.result ? (
                <SimulationResultCard key={sim.id} result={sim.result} />
              ) : (
                <div
                  key={sim.id}
                  className="flex items-center justify-between rounded-2xl border border-surface-border bg-white p-4 text-sm text-navy-600 shadow-card"
                >
                  <span>
                    Analiz durumu: {SIMULATION_STATUS_LABELS[sim.status] ?? sim.status}
                    {sim.error_message ? " — Analiz tamamlanamadı." : ""}
                  </span>
                  {sim.status === "failed" && (
                    <button
                      onClick={() => handleRetrySimulation(sim.id)}
                      disabled={simulationRunning}
                      className="shrink-0 rounded-lg border border-accent-300 px-3 py-1.5 text-xs font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-60"
                    >
                      Tekrar Dene
                    </button>
                  )}
                </div>
              )
            )
          )}
        </div>
      )}

      {activeTab === "Devir Raporu" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl border border-dashed border-accent-200 bg-accent-50 p-5">
            <div>
              <p className="text-sm font-medium text-accent-700">Dava Devir Raporu</p>
              <p className="text-xs text-accent-600">
                Dava başka bir avukata devredilirken kullanılacak özet raporu oluşturun.
              </p>
            </div>
            <button
              onClick={handleGenerateHandover}
              disabled={handoverGenerating}
              className="shrink-0 rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60"
            >
              {handoverGenerating ? "Oluşturuluyor..." : "Devir Raporu Oluştur"}
            </button>
          </div>

          {handoverError && <ErrorState message={handoverError} />}

          {handoverReport && (
            <div className="space-y-4 rounded-2xl border border-surface-border bg-white p-5 shadow-card">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-navy-500">Mevcut Durum</p>
                <p className="mt-1 text-sm text-navy-800">{handoverReport.current_situation}</p>
              </div>

              {handoverReport.important_arguments.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-navy-500">Önemli Argümanlar</p>
                  <ul className="mt-1 list-inside list-disc text-sm text-navy-800">
                    {handoverReport.important_arguments.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {handoverReport.risks.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-navy-500">Riskler</p>
                  <ul className="mt-1 list-inside list-disc text-sm text-navy-800">
                    {handoverReport.risks.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {handoverReport.recommended_next_steps.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-navy-500">
                    Önerilen Sonraki Adımlar
                  </p>
                  <ul className="mt-1 list-inside list-disc text-sm text-navy-800">
                    {handoverReport.recommended_next_steps.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "Notlar" && (
        <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
          {notes.length === 0 ? (
            <EmptyState message="Henüz not eklenmedi." />
          ) : (
            <ul className="space-y-3 text-sm">
              {notes.map((note) => (
                <li key={note.id}>
                  <p className="text-xs text-navy-500">{formatDate(note.event_date)}</p>
                  <p className="text-navy-800">{note.title}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
