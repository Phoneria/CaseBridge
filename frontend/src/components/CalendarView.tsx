"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getCalendarEvents } from "@/lib/api";
import { monthRange } from "@/lib/calendar";
import { parseCalendarQuery } from "@/lib/filters";
import { useQuickViewHref, useUrlParams } from "@/lib/urlState";
import type { CalendarEvent } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const MAX_EVENTS_PER_DAY = 3;

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthFromKey(key: string | undefined): Date | null {
  if (!key) return null;
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function currentMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

type LegacyShow = "durusma" | "gorev";

function legacyShow(tur: string | undefined): LegacyShow | undefined {
  return tur === "durusma" || tur === "gorev" ? tur : undefined;
}

export function CalendarView() {
  const { params, setParams } = useUrlParams();
  const quickViewHref = useQuickViewHref();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => monthFromKey(parseCalendarQuery(params).ay) ?? currentMonthStart());
  const [show, setShow] = useState<LegacyShow | undefined>(() => legacyShow(parseCalendarQuery(params).tur));
  const [openDay, setOpenDay] = useState<string | null>(null);

  const range = monthRange(visibleMonth);
  useEffect(() => {
    setError(null);
    getCalendarEvents({ from: range.from, to: range.to })
      .then(setEvents)
      .catch(() => setError("Takvim yüklenemedi. Lütfen daha sonra tekrar deneyin."))
      .finally(() => setLoading(false));
  }, [range.from, range.to]);

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const today = new Date();
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const shownEvents = useMemo(
    () => events.filter((event) => !show || (show === "durusma" ? event.event_type === "hearing" : event.event_type === "task")),
    [events, show],
  );

  const eventsByDate = useMemo(() => {
    return shownEvents.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
      (acc[event.date] ??= []).push(event);
      return acc;
    }, {});
  }, [shownEvents]);

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

  const monthPrefix = monthKey(visibleMonth);
  const monthEvents = events.filter((event) => event.date.startsWith(monthPrefix));
  const hearingCount = monthEvents.filter((event) => event.event_type === "hearing").length;
  const taskCount = monthEvents.filter((event) => event.event_type === "task").length;

  function goToMonth(next: Date, writeToUrl: string | null) {
    setVisibleMonth(next);
    setOpenDay(null);
    setParams({ ay: writeToUrl });
  }

  function changeMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    goToMonth(next, monthKey(next));
  }

  function goToToday() {
    goToMonth(currentMonthStart(), null);
  }

  function toggleShow(kind: LegacyShow) {
    const next = show === kind ? undefined : kind;
    setShow(next);
    setParams({ tur: next ?? null, goster: null });
  }

  function eventHref(event: CalendarEvent) {
    if (!event.case_id) return "/takvim";
    return quickViewHref(event.case_id, event.task_id ? { type: "gorev", id: event.task_id } : undefined);
  }

  function renderEvent(event: CalendarEvent, key: string) {
    const hearing = event.event_type === "hearing";
    return (
      <Link
        key={key}
        href={eventHref(event)}
        scroll={false}
        title={[event.title, event.case_name].filter(Boolean).join(" — ")}
        className={`block rounded-md border-l-2 px-2 py-1.5 text-[11px] leading-4 transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
          hearing ? "border-red-500 bg-red-50 text-red-800" : "border-accent-500 bg-accent-50 text-accent-800"
        }`}
      >
        <p className="font-semibold">{event.title}</p>
        <p className="truncate opacity-70">{event.case_name}</p>
      </Link>
    );
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
        <div className="flex items-center gap-2 text-xs text-navy-600">
          <button
            type="button"
            aria-pressed={show === "durusma"}
            onClick={() => toggleShow("durusma")}
            className={`flex items-center gap-2 rounded-full px-2.5 py-1 transition ${
              show === "durusma" ? "bg-red-50 text-red-800 ring-1 ring-red-200" : "hover:bg-surface-muted"
            } ${show === "gorev" ? "opacity-50" : ""}`}
          >
            <i className="h-2.5 w-2.5 rounded-full bg-red-500" /> Duruşma
          </button>
          <button
            type="button"
            aria-pressed={show === "gorev"}
            onClick={() => toggleShow("gorev")}
            className={`flex items-center gap-2 rounded-full px-2.5 py-1 transition ${
              show === "gorev" ? "bg-accent-50 text-accent-800 ring-1 ring-accent-200" : "hover:bg-surface-muted"
            } ${show === "durusma" ? "opacity-50" : ""}`}
          >
            <i className="h-2.5 w-2.5 rounded-full bg-accent-500" /> Görev
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
        <div className="flex flex-col justify-between gap-3 border-b border-surface-border px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-semibold text-navy-900">
              {MONTH_NAMES[month]} {year}
            </h2>
            <p className="mt-0.5 text-xs text-navy-500">
              Bu ay {hearingCount} duruşma ve {taskCount} görev bulunuyor.
            </p>
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
                const hiddenCount = dayEvents.length - MAX_EVENTS_PER_DAY;
                const isToday = key === todayKey;
                return (
                  <div
                    key={key}
                    className={`relative min-h-32 border-b border-r border-surface-border p-2.5 ${day ? "bg-white" : "bg-surface-muted/35"}`}
                  >
                    {day && (
                      <>
                        <span
                          className={`mb-2 grid h-7 w-7 place-items-center rounded-full text-xs font-medium ${
                            isToday ? "bg-accent-600 text-white" : "text-navy-600"
                          }`}
                        >
                          {day}
                        </span>
                        <div className="space-y-1.5">
                          {dayEvents
                            .slice(0, MAX_EVENTS_PER_DAY)
                            .map((event, eventIndex) => renderEvent(event, `${event.event_type}-${event.task_id ?? event.case_id}-${eventIndex}`))}
                          {hiddenCount > 0 && (
                            <button
                              type="button"
                              aria-expanded={openDay === key}
                              onClick={() => setOpenDay((current) => (current === key ? null : key))}
                              className="w-full rounded-md px-2 py-1 text-left text-[11px] font-medium text-navy-600 hover:bg-surface-muted"
                            >
                              +{hiddenCount} daha
                            </button>
                          )}
                        </div>
                        {openDay === key && (
                          <div
                            role="dialog"
                            aria-label={`${day} ${MONTH_NAMES[month]} olayları`}
                            className="absolute left-1 top-10 z-20 w-64 space-y-1.5 rounded-xl border border-surface-border bg-white p-3 shadow-xl"
                          >
                            <div className="mb-1 flex items-center justify-between">
                              <p className="text-xs font-semibold text-navy-800">
                                {day} {MONTH_NAMES[month]}
                              </p>
                              <button type="button" aria-label="Kapat" onClick={() => setOpenDay(null)} className="text-navy-400 hover:text-navy-700">
                                ✕
                              </button>
                            </div>
                            {dayEvents.map((event, eventIndex) => renderEvent(event, `popover-${event.event_type}-${event.task_id ?? event.case_id}-${eventIndex}`))}
                          </div>
                        )}
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
