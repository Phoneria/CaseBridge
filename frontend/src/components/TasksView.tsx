"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { listAllTasks, updateTask, updateTaskStatus } from "@/lib/api";
import {
  TASK_LIST_PARAM_KEYS,
  describeTaskListQuery,
  filterTasks,
  isOverdue,
  parseTaskListQuery,
  sortTasks,
  type TaskListQuery,
} from "@/lib/filters";
import { formatDate } from "@/lib/labels";
import { useQuickViewHref, useUrlParams } from "@/lib/urlState";
import type { Case, Task, TaskWithCase, TaskStage } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { userMessage } from "@/lib/userMessages";
import { EmptyState } from "@/components/EmptyState";
import { TaskFormModal } from "@/components/tasks/TaskFormModal";
import { FilterChips, NoFilterResults } from "@/components/FilterChips";

import { STAGES, PRIORITIES, stageOf } from "@/lib/taskBoard";

const STRIPES = { backlog: "border-t-slate-400", todo: "border-t-sky-500", in_progress: "border-t-amber-500", in_review: "border-t-violet-500", done: "border-t-emerald-500" };

type Tone = "navy" | "emerald" | "amber" | "red";
const TONE_TEXT: Record<Tone, string> = {
  navy: "text-navy-900",
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  red: "text-red-600",
};

export function TasksView() {
  const { params, hrefWith, setParams } = useUrlParams();
  const quickViewHref = useQuickViewHref();
  const query = useMemo(() => parseTaskListQuery(params), [params]);

  const [tasks, setTasks] = useState<TaskWithCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const [editing, setEditing] = useState<TaskWithCase>();
  const [dropStage, setDropStage] = useState<TaskStage | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const changing = useRef(new Set<string>());

  useEffect(() => {
    setLoading(true);
    setError(null);
    listAllTasks()
      .then(setTasks)
      .catch(() => setError("Görevler yüklenemedi. Lütfen daha sonra tekrar deneyin."))
      .finally(() => setLoading(false));
  }, []);

  async function move(task: TaskWithCase, stage: TaskStage, toggle = false) {
    if (changing.current.has(task.id) || stageOf(task) === stage) return;
    changing.current.add(task.id);
    setToggleError(null);
    try {
      const updated = toggle
        ? await updateTaskStatus(task.case_id, task.id, stage === "done" ? "completed" : "pending")
        : await updateTask(task.case_id, task.id, { stage });
      setTasks(prev => prev.map(row => row.id === task.id ? { ...row, ...updated } : row));
    } catch (err) {
      setToggleError(userMessage(err, "Görev güncellenemedi. Lütfen tekrar deneyin."));
    } finally {
      changing.current.delete(task.id);
    }
  }

  function handleSaved(task: Task, taskCase: Case) {
    if (editing) {
      setTasks(prev => prev.map(row => row.id === task.id ? { ...row, ...task } : row));
    } else {
      setTasks(prev => [{ ...task, case_name: taskCase.case_name, case_number: taskCase.case_number }, ...prev]);
    }
    setEditing(undefined);
    setFormOpen(false);
  }

  function clearFilters() {
    setParams(Object.fromEntries(TASK_LIST_PARAM_KEYS.map((key) => [key, null])));
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const today = new Date();
  const visible = sortTasks(filterTasks(tasks, query, today), today);
  const chips = describeTaskListQuery(query, (caseId) => tasks.find((t) => t.case_id === caseId)?.case_name);

  // Each card's number is the row count of the list its own link opens (spec 5.1).
  function card<K extends "durum" | "vade">(label: string, tone: Tone, key: K, value: NonNullable<TaskListQuery[K]>) {
    const active = query[key] === value;
    const next: TaskListQuery = { ...query };
    if (active) delete next[key];
    else next[key] = value;
    return {
      label,
      tone,
      active,
      value: filterTasks(tasks, next, today).length,
      href: hrefWith({ [key]: active ? null : value }),
    };
  }

  const cards = [
    card("Açık görev", "navy", "durum", "acik"),
    card("Tamamlanan", "emerald", "durum", "tamamlanan"),
    card("7 gün içinde", "amber", "vade", "7gun"),
    card("Gecikmiş", "red", "vade", "gecikmis"),
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-900">Görevler</h1>
          <p className="text-sm text-navy-500">Kartı sürükleyerek veya aşamasını seçerek taşıyın.</p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="shrink-0 rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
        >
          Yeni görev
        </button>
      </div>

      {toggleError && <ErrorState message={toggleError} />}

      {tasks.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              replace
              scroll={false}
              aria-current={card.active ? "true" : undefined}
              className={`rounded-xl border bg-white p-4 shadow-card transition hover:border-accent-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
                card.active ? "border-accent-500 ring-2 ring-accent-200" : "border-surface-border"
              }`}
            >
              <p className="text-xs text-navy-500">{card.label}</p>
              <p className={`mt-1 text-2xl font-semibold ${TONE_TEXT[card.tone]}`}>{card.value}</p>
            </Link>
          ))}
        </div>
      )}

      <FilterChips chips={chips} onRemove={(key) => setParams({ [key]: null })} onClear={clearFilters} resultCount={visible.length} />

      {tasks.length === 0 && (
        <EmptyState message="Henüz görev yok." hint="İlk görevi 'Yeni görev' ile ekleyin." />
      )}
      {tasks.length > 0 && visible.length === 0 ? (
        <NoFilterResults onClear={clearFilters} />
      ) : (
        <div aria-label="Görev panosu" className="flex max-w-full items-stretch gap-3 overflow-x-auto pb-3">
          {(Object.keys(STAGES) as TaskStage[]).map(stage => {
            const cards = visible.filter(task => stageOf(task) === stage);
            return <section key={stage} aria-label={STAGES[stage]}
              className={`min-h-64 min-w-[15rem] flex-1 xl:min-w-[13rem] rounded-xl border border-t-4 p-2.5 ${STRIPES[stage]} ${dropStage === stage ? "border-accent-500 bg-accent-50" : "border-surface-border bg-surface-muted"}`}
              onDragOver={event => { if (dragging) { event.preventDefault(); setDropStage(stage); } }}
              onDrop={event => {
                event.preventDefault();
                const task = visible.find(row => row.id === dragging);
                setDragging(null);
                setDropStage(null);
                if (task) void move(task, stage);
              }}>
              <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-semibold text-navy-800">
                {STAGES[stage]} <span className="rounded-full bg-white px-2 py-0.5 text-xs">{cards.length}</span>
              </h2>
              <ul className="max-h-[65vh] space-y-2 overflow-y-auto">
                {cards.map(task => <li key={task.id} draggable
                  onDragStart={event => { event.dataTransfer.setData("text/plain", task.id); event.dataTransfer.effectAllowed = "move"; setDragging(task.id); }}
                  onDragEnd={() => { setDragging(null); setDropStage(null); }}
                  className="cursor-grab rounded-xl border border-surface-border bg-white p-3 text-sm shadow-sm active:cursor-grabbing">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <Link href={hrefWith({ dava: task.case_id })} replace scroll={false} className="text-xs text-navy-500 hover:underline">
                      {task.case_number} - {task.case_name}
                    </Link>
                    <input type="checkbox" checked={task.status === "completed"} aria-label={`${task.title} tamamlandı olarak işaretle`}
                      onChange={() => void move(task, task.status === "completed" ? "todo" : "done", true)} />
                  </div>
                  <Link href={quickViewHref(task.case_id, { type: "gorev", id: task.id })} scroll={false} data-testid="task-title"
                    className="block break-words font-semibold text-navy-900 hover:underline">{task.title}</Link>
                  {task.description && <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-navy-600">{task.description}</p>}
                  <div className="my-3 flex flex-wrap items-center gap-2 text-xs text-navy-600">
                    <span className={`rounded px-1.5 py-0.5 font-medium ${task.priority === "urgent" ? "bg-red-50 text-red-700" : task.priority === "high" ? "bg-amber-50 text-amber-700" : "bg-surface-muted"}`}>{PRIORITIES[task.priority ?? "normal"]}</span>
                    <span>{task.assignee_name ?? "Atanmadı"}</span>
                    {task.due_date && <span className={isOverdue(task, today) ? "font-medium text-red-600" : ""}>Son tarih: {formatDate(task.due_date)}{isOverdue(task, today) && " (gecikmiş)"}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-1 border-t border-surface-border pt-2">
                    <select aria-label={`${task.title} aşaması`} value={stage} onChange={e => void move(task, e.target.value as TaskStage)}
                      className="rounded border border-surface-border bg-white p-1 text-xs">
                      {Object.entries(STAGES).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <button type="button" aria-label={`${task.title} görevini düzenle`} onClick={() => { setEditing(task); setFormOpen(true); }}
                      className="text-xs font-medium text-accent-700">Düzenle</button>
                  </div>
                </li>)}
              </ul>
            </section>;
          })}
        </div>
      )}

      {formOpen && <TaskFormModal initialCaseId={query.dava} editing={editing} onClose={() => { setEditing(undefined); setFormOpen(false); }} onCreated={handleSaved} />}
    </div>
  );
}
