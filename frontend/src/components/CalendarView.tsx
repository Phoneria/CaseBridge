"use client";

import { useEffect, useMemo, useState } from "react";

import { getCalendarEvents } from "@/lib/api";
import type { CalendarEvent } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function CalendarView() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    setLoading(true);
    setError(null);
    getCalendarEvents()
      .then(setEvents)
      .catch(() => setError("Takvim yüklenemedi. Lütfen daha sonra tekrar deneyin."))
      .finally(() => setLoading(false));
  }, []);

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const eventsByDate = useMemo(() => {
    return events.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
      (acc[event.date] ??= []).push(event);
      return acc;
    }, {});
  }, [events]);

  const calendarCells = useMemo(() => {
    const leadingEmptyCells = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<number | null> = [
      ...Array.from({ length: leadingEmptyCells }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [month, year]);

  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const visibleEvents = events.filter((event) => event.date.startsWith(monthPrefix));
  const hearingCount = visibleEvents.filter((event) => event.event_type === "hearing").length;
  const taskCount = visibleEvents.filter((event) => event.event_type === "task").length;

  function changeMonth(delta: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  function goToToday() {
    const now = new Date();
    setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-xl font-semibold text-navy-900">Takvim</h1>
          <p className="text-sm text-navy-500">Duruşma ve görev tarihlerinizi aylık görünümde takip edin.</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-navy-600">
          <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-red-500" /> Duruşma</span>
          <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-accent-500" /> Görev</span>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
        <div className="flex flex-col justify-between gap-3 border-b border-surface-border px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-navy-900">{MONTH_NAMES[month]} {year}</h2>
            <p className="mt-0.5 text-xs text-navy-500">Bu ay {hearingCount} duruşma ve {taskCount} görev bulunuyor.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              aria-label="Önceki ay"
              className="grid h-9 w-9 place-items-center rounded-lg border border-surface-border text-lg text-navy-600 transition hover:bg-surface-muted"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="h-9 rounded-lg border border-surface-border px-4 text-xs font-medium text-navy-700 transition hover:bg-surface-muted"
            >
              Bugün
            </button>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              aria-label="Sonraki ay"
              className="grid h-9 w-9 place-items-center rounded-lg border border-surface-border text-lg text-navy-600 transition hover:bg-surface-muted"
            >
              ›
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-7 border-b border-surface-border bg-surface-muted/60">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday} className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-navy-500">
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {calendarCells.map((day, index) => {
                const key = day ? dateKey(year, month, day) : `empty-${index}`;
                const dayEvents = day ? eventsByDate[key] ?? [] : [];
                const isToday = key === todayKey;
                return (
                  <div
                    key={key}
                    className={`min-h-32 border-b border-r border-surface-border p-2.5 ${day ? "bg-white" : "bg-surface-muted/35"}`}
                  >
                    {day && (
                      <>
                        <span className={`mb-2 grid h-7 w-7 place-items-center rounded-full text-xs font-medium ${isToday ? "bg-accent-600 text-white" : "text-navy-600"}`}>
                          {day}
                        </span>
                        <div className="space-y-1.5">
                          {dayEvents.map((event, eventIndex) => (
                            <div
                              key={`${event.event_type}-${event.case_id}-${eventIndex}`}
                              title={`${event.title} — ${event.case_name}`}
                              className={`rounded-md border-l-2 px-2 py-1.5 text-[11px] leading-4 ${
                                event.event_type === "hearing"
                                  ? "border-red-500 bg-red-50 text-red-800"
                                  : "border-accent-500 bg-accent-50 text-accent-800"
                              }`}
                            >
                              <p className="font-semibold">{event.title}</p>
                              <p className="truncate opacity-70">{event.case_name}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {events.length === 0 && (
          <p className="border-t border-surface-border px-5 py-4 text-center text-sm text-navy-500">
            Takvimde henüz yaklaşan tarih yok. Bir davaya duruşma veya görev tarihi ekleyebilirsiniz.
          </p>
        )}
      </section>
    </div>
  );
}
