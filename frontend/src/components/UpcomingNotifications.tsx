"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { getCalendarEvents, listAllTasks } from "@/lib/api";
import { addDays, EVENT_TYPE_LABELS } from "@/lib/calendar";
import { caseDetailHref, daysUntil, toDateKey } from "@/lib/filters";
import { formatDate } from "@/lib/labels";
import type { CalendarEvent, TaskWithCase } from "@/types";

const POLL_MS = 60_000;
const UPCOMING_DAYS = 7;

export function relevantNotifications(events: CalendarEvent[], today = new Date()): CalendarEvent[] {
  return events.filter((event) => {
    const days = daysUntil(event.date, today);
    return (days >= 0 && days <= UPCOMING_DAYS) || (event.event_type === "task" && days < 0);
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/** A pending task as a calendar row, so overdue tasks older than any calendar range still show up. */
export function taskToCalendarItem(task: TaskWithCase & { due_date: string }): CalendarEvent {
  return {
    id: `task:${task.id}`, kind: "task", event_type: "task", title: task.title, date: task.due_date,
    start: null, end: null, all_day: true, case_id: task.case_id, case_name: task.case_name,
    task_id: task.id, event_id: null, assignee_id: task.assigned_to ?? null, assignee_name: null,
    location: null, notes: null, reminder_days: task.reminder_days ?? [1], editable: false,
  };
}

/** Next-seven-day calendar rows plus every overdue pending task, deduplicated by row id. */
async function loadNotificationItems(today = new Date()): Promise<CalendarEvent[]> {
  const [upcoming, pending] = await Promise.all([
    getCalendarEvents({ from: toDateKey(today), to: toDateKey(addDays(today, UPCOMING_DAYS)) }),
    listAllTasks("pending"),
  ]);
  const overdue = pending
    .filter((task): task is TaskWithCase & { due_date: string } => !!task.due_date && daysUntil(task.due_date, today) < 0)
    .map(taskToCalendarItem);
  const byId = new Map([...overdue, ...upcoming].map((item) => [item.id, item]));
  return [...byId.values()];
}

function notificationHref(event: CalendarEvent): string {
  if (!event.case_id) return "/takvim";
  return caseDetailHref(event.case_id, event.event_type === "task" ? "gorevler" : undefined);
}

export function UpcomingNotifications() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    let cancelled = false;
    function refresh() {
      loadNotificationItems().then((rows) => {
        if (!cancelled) { setEvents(rows); setError(false); }
      }).catch(() => { if (!cancelled) setError(true); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener("focus", refresh);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  const relevant = relevantNotifications(events);
  return <div className="relative">
    <button type="button" aria-label={`Bildirimler${relevant.length ? `, ${relevant.length} yaklaşan kayıt` : ""}`} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-surface-border text-navy-600 hover:bg-surface-muted">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg>
      {relevant.length > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-accent-600 px-1 text-[10px] font-semibold text-white">{relevant.length > 9 ? "9+" : relevant.length}</span>}
    </button>
    {open && <div role="dialog" aria-label="Yaklaşan bildirimler" className="absolute right-0 z-30 mt-2 w-[min(88vw,360px)] rounded-xl border border-surface-border bg-white p-3 shadow-xl">
      <h2 className="px-2 text-sm font-semibold text-navy-900">Yaklaşan işler</h2>
      <p className="px-2 text-xs text-navy-500">Gelecek 7 gün ve gecikmiş görevler</p>
      <div className="mt-2 max-h-80 overflow-y-auto">
        {loading ? <p className="p-2 text-sm text-navy-500">Bildirimler yükleniyor...</p>
          : error ? <p role="alert" className="p-2 text-sm text-red-600">Bildirimler yüklenemedi.</p>
          : relevant.length === 0 ? <p className="p-2 text-sm text-navy-500">Yaklaşan duruşma veya görev yok.</p>
          : <ul className="space-y-1">{relevant.slice(0, 6).map((event) => {
              const overdue = event.event_type === "task" && daysUntil(event.date) < 0;
              return <li key={event.id}>
                <Link href={notificationHref(event)} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 hover:bg-surface-muted">
                  <span className={`text-[11px] font-medium ${overdue ? "text-red-600" : "text-accent-700"}`}>{overdue ? "Gecikmiş görev" : EVENT_TYPE_LABELS[event.event_type]} · {formatDate(event.date)}</span>
                  <span className="block truncate text-sm font-medium text-navy-900">{event.title}</span>
                  {event.case_name && <span className="block truncate text-xs text-navy-500">{event.case_name}</span>}
                </Link>
              </li>;
            })}</ul>}
      </div>
      <Link href="/takvim" onClick={() => setOpen(false)} className="mt-2 block border-t border-surface-border px-2 pt-3 text-xs font-medium text-accent-700 hover:underline">Takvimin tamamını gör →</Link>
    </div>}
  </div>;
}
