"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { listAllTasks, updateTaskStatus } from "@/lib/api";
import {
  TASK_LIST_PARAM_KEYS,
  describeTaskListQuery,
  filterTasks,
  isDueWithinWeek,
  isOverdue,
  parseTaskListQuery,
  sortTasks,
  type TaskListQuery,
} from "@/lib/filters";
import { formatDate } from "@/lib/labels";
import { useQuickViewHref, useUrlParams } from "@/lib/urlState";
import type { TaskWithCase } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips, NoFilterResults } from "@/components/FilterChips";

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

  useEffect(() => {
    setLoading(true);
    setError(null);
    listAllTasks()
      .then(setTasks)
      .catch(() => setError("Görevler yüklenemedi. Lütfen daha sonra tekrar deneyin."))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(task: TaskWithCase) {
    setToggleError(null);
    const nextStatus = task.status === "completed" ? "pending" : "completed";
    try {
      const updated = await updateTaskStatus(task.case_id, task.id, nextStatus);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
    } catch {
      setToggleError("Görev güncellenemedi. Lütfen tekrar deneyin.");
    }
  }

  function clearFilters() {
    setParams(Object.fromEntries(TASK_LIST_PARAM_KEYS.map((key) => [key, null])));
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const today = new Date();
  const visible = sortTasks(filterTasks(tasks, query, today), today);
  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const pendingCount = tasks.length - completedCount;
  const dueSoonCount = tasks.filter((task) => isDueWithinWeek(task, today)).length;
  const overdueCount = tasks.filter((task) => isOverdue(task, today)).length;
  const chips = describeTaskListQuery(query, (caseId) => tasks.find((t) => t.case_id === caseId)?.case_name);

  function toggleHref<K extends keyof TaskListQuery>(key: K, value: NonNullable<TaskListQuery[K]>) {
    return hrefWith({ [key]: query[key] === value ? null : value });
  }

  const cards: Array<{ label: string; value: number; tone: Tone; href: string; active: boolean }> = [
    { label: "Açık görev", value: pendingCount, tone: "navy", href: toggleHref("durum", "acik"), active: query.durum === "acik" },
    { label: "Tamamlanan", value: completedCount, tone: "emerald", href: toggleHref("durum", "tamamlanan"), active: query.durum === "tamamlanan" },
    { label: "7 gün içinde", value: dueSoonCount, tone: "amber", href: toggleHref("vade", "7gun"), active: query.vade === "7gun" },
    { label: "Gecikmiş", value: overdueCount, tone: "red", href: toggleHref("vade", "gecikmis"), active: query.vade === "gecikmis" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Görevler</h1>
        <p className="text-sm text-navy-500">Büronuzun tüm davalarındaki görevleri tek yerden takip edin.</p>
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

      {tasks.length === 0 ? (
        <EmptyState message="Henüz görev yok." hint="Görevler bir davanın Görevler sekmesinden eklenir." />
      ) : visible.length === 0 ? (
        <NoFilterResults onClear={clearFilters} />
      ) : (
        <div className="rounded-2xl border border-surface-border bg-white shadow-card">
          <ul className="divide-y divide-surface-border text-sm">
            {visible.map((task) => {
              const completed = task.status === "completed";
              const overdue = isOverdue(task, today);
              return (
                <li key={task.id} className="flex items-center gap-3 p-4 transition hover:bg-surface-muted">
                  <input
                    type="checkbox"
                    checked={completed}
                    onChange={() => handleToggle(task)}
                    className="h-4 w-4 rounded border-surface-border text-accent-600 focus:ring-accent-400"
                    aria-label={`${task.title} tamamlandı olarak işaretle`}
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={quickViewHref(task.case_id, { type: "gorev", id: task.id })}
                      scroll={false}
                      data-testid="task-title"
                      className={`block truncate hover:text-accent-700 ${completed ? "text-navy-400 line-through" : "text-navy-800"}`}
                    >
                      {task.title}
                    </Link>
                    <p className="text-xs text-navy-500">
                      <Link href={hrefWith({ dava: task.case_id })} replace scroll={false} className="hover:text-accent-700 hover:underline">
                        {task.case_number} - {task.case_name}
                      </Link>
                      {task.due_date && (
                        <span className={overdue ? "font-medium text-red-600" : ""}>
                          {" "}
                          - Son tarih: {formatDate(task.due_date)}
                          {overdue ? " (gecikmiş)" : ""}
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
