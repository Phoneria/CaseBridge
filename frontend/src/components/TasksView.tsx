"use client";

import { useEffect, useState } from "react";

import { listAllTasks, updateTaskStatus } from "@/lib/api";
import { formatDate } from "@/lib/labels";
import type { TaskWithCase } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { EmptyState } from "@/components/EmptyState";

export function TasksView() {
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

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const pendingCount = tasks.length - completedCount;
  const today = new Date();
  const oneWeekLater = new Date(today);
  oneWeekLater.setDate(today.getDate() + 7);
  const dueSoonCount = tasks.filter((task) => {
    if (!task.due_date || task.status === "completed") return false;
    const dueDate = new Date(`${task.due_date}T12:00:00`);
    return dueDate >= today && dueDate <= oneWeekLater;
  }).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-900">Görevler</h1>
        <p className="text-sm text-navy-500">Büronuzun tüm davalarındaki görevleri tek yerden takip edin.</p>
      </div>

      {toggleError && <ErrorState message={toggleError} />}

      {tasks.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-surface-border bg-white p-4 shadow-card">
            <p className="text-xs text-navy-500">Açık görev</p>
            <p className="mt-1 text-2xl font-semibold text-navy-900">{pendingCount}</p>
          </div>
          <div className="rounded-xl border border-surface-border bg-white p-4 shadow-card">
            <p className="text-xs text-navy-500">Tamamlanan</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-600">{completedCount}</p>
          </div>
          <div className="rounded-xl border border-surface-border bg-white p-4 shadow-card">
            <p className="text-xs text-navy-500">7 gün içinde</p>
            <p className="mt-1 text-2xl font-semibold text-amber-600">{dueSoonCount}</p>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <EmptyState message="Henüz görev yok." hint="Görevler bir davanın Görevler sekmesinden eklenir." />
      ) : (
        <div className="rounded-2xl border border-surface-border bg-white shadow-card">
          <ul className="divide-y divide-surface-border text-sm">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center gap-3 p-4">
                <input
                  type="checkbox"
                  checked={task.status === "completed"}
                  onChange={() => handleToggle(task)}
                  className="h-4 w-4 rounded border-surface-border text-accent-600 focus:ring-accent-400"
                  aria-label={`${task.title} tamamlandı olarak işaretle`}
                />
                <div className="flex-1">
                  <p className={task.status === "completed" ? "text-navy-400 line-through" : "text-navy-800"}>
                    {task.title}
                  </p>
                  <p className="text-xs text-navy-500">
                    {task.case_number} - {task.case_name}
                    {task.due_date ? ` - Son tarih: ${formatDate(task.due_date)}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
