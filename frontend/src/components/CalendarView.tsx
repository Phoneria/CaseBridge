"use client";

import { useEffect, useMemo, useState } from "react";

import { getCalendarEvents, getCases, getMe, listUsers } from "@/lib/api";
import {
  MONTH_NAMES,
  addDays,
  agendaRange,
  filterCalendarItems,
  monthFromKey,
  monthKey,
  monthRange,
  parseDateKey,
  startOfWeek,
  toDateKey,
  weekRange,
} from "@/lib/calendar";
import { parseCalendarQuery, type CalendarViewSlug } from "@/lib/filters";
import { useUrlParams } from "@/lib/urlState";
import type { AppUser, CalendarEvent, Case } from "@/types";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";
import { CalendarAgendaView } from "@/components/calendar/CalendarAgendaView";
import { CalendarEventDrawer } from "@/components/calendar/CalendarEventDrawer";
import { CalendarEventForm, eventFormInitialFromItem, type EventFormInitial } from "@/components/calendar/CalendarEventForm";
import { CalendarFilters } from "@/components/calendar/CalendarFilters";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import { CalendarWeekView } from "@/components/calendar/CalendarWeekView";

type ParamUpdates = Record<string, string | null>;

const VIEW_LABELS: Record<CalendarViewSlug, string> = { ay: "Ay", hafta: "Hafta", ajanda: "Ajanda" };
const NAV_BUTTON =
  "grid h-9 w-9 place-items-center rounded-lg border border-surface-border text-lg text-navy-600 transition hover:bg-surface-muted";

function weekTitle(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const startMonth = weekStart.getMonth() === weekEnd.getMonth() ? "" : ` ${MONTH_NAMES[weekStart.getMonth()]}`;
  return `${weekStart.getDate()}${startMonth} – ${weekEnd.getDate()} ${MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
}

export function CalendarView() {
  const { params, setParams } = useUrlParams();
  // The URL is mirrored into local state so the page reacts immediately
  // (and so tests with a static mocked URL can still navigate).
  const [search, setSearch] = useState(() => params.toString());
  const query = useMemo(() => parseCalendarQuery(new URLSearchParams(search)), [search]);
  const view: CalendarViewSlug = query.gorunum ?? "ay";

  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const visibleMonth = monthFromKey(query.ay) ?? new Date(today.getFullYear(), today.getMonth(), 1);
  const weekStart = startOfWeek(query.hafta ? parseDateKey(query.hafta) : today);
  const range = view === "ay" ? monthRange(visibleMonth) : view === "hafta" ? weekRange(weekStart) : agendaRange(today);

  const [items, setItems] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [me, setMe] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formInitial, setFormInitial] = useState<EventFormInitial | null>(null);

  useEffect(() => {
    // Filters and the form still work (with empty lists) if these fail.
    Promise.all([getMe(), listUsers(), getCases()])
      .then(([meResult, usersResult, casesResult]) => {
        setMe(meResult);
        setUsers(usersResult);
        setCases(casesResult);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCalendarEvents({ from: range.from, to: range.to })
      .then((result) => {
        if (!cancelled) {
          setItems(result);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setError("Takvim yüklenemedi. Lütfen daha sonra tekrar deneyin.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, reloadToken]);

  const shown = useMemo(() => filterCalendarItems(items, query, me?.id ?? null), [items, query, me]);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  function update(updates: ParamUpdates) {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearch(next.toString());
    setParams(updates);
  }

  const reload = () => setReloadToken((token) => token + 1);

  function changePeriod(delta: number) {
    if (view === "ay") {
      update({ ay: monthKey(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + delta, 1)) });
    } else {
      update({ hafta: toDateKey(addDays(weekStart, delta * 7)) });
    }
  }

  function goToToday() {
    update(view === "ay" ? { ay: null } : { hafta: null });
  }

  function openCreate(date: string, time?: string) {
    setFormInitial({ date, time: time ?? "09:00" });
  }

  if (!loaded) return <LoadingState />;
  if (error) return <ErrorState message={error} />;

  const monthItems = items.filter((item) => item.date.startsWith(monthKey(visibleMonth)));
  const periodTitle =
    view === "ay" ? `${MONTH_NAMES[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}` : view === "hafta" ? weekTitle(weekStart) : "Önümüzdeki 30 gün";
  const unit = view === "ay" ? "ay" : "hafta";

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-xl font-semibold text-navy-900">Takvim</h1>
          <p className="text-sm text-navy-500">Duruşma, görev ve etkinliklerinizi takip edin; e-posta hatırlatmalarını ayarlayın.</p>
        </div>
        <button
          type="button"
          onClick={() => openCreate(todayKey)}
          className="h-9 rounded-xl bg-accent-600 px-4 text-sm font-medium text-white transition hover:bg-accent-700"
        >
          Yeni etkinlik
        </button>
      </div>

      <CalendarFilters query={query} users={users} cases={cases} onChange={update} />

      <section className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
        <div className="flex flex-col justify-between gap-3 border-b border-surface-border px-5 py-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="font-semibold text-navy-900">{periodTitle}</h2>
            {view === "ay" && (
              <p className="mt-0.5 text-xs text-navy-500">
                Bu ay {monthItems.filter((item) => item.event_type === "hearing").length} duruşma,{" "}
                {monthItems.filter((item) => item.kind === "task").length} görev ve{" "}
                {monthItems.filter((item) => item.kind === "event" && item.event_type !== "hearing").length} etkinlik bulunuyor.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Görünüm" className="flex rounded-lg border border-surface-border p-0.5">
              {(Object.keys(VIEW_LABELS) as CalendarViewSlug[]).map((slug) => (
                <button
                  key={slug}
                  type="button"
                  aria-pressed={view === slug}
                  onClick={() => update({ gorunum: slug === "ay" ? null : slug })}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    view === slug ? "bg-accent-600 text-white" : "text-navy-600 hover:bg-surface-muted"
                  }`}
                >
                  {VIEW_LABELS[slug]}
                </button>
              ))}
            </div>
            {view !== "ajanda" && (
              <>
                <button type="button" onClick={() => changePeriod(-1)} aria-label={`Önceki ${unit}`} className={NAV_BUTTON}>
                  ‹
                </button>
                <button
                  type="button"
                  onClick={goToToday}
                  className="h-9 rounded-lg border border-surface-border px-4 text-xs font-medium text-navy-700 transition hover:bg-surface-muted"
                >
                  Bugün
                </button>
                <button type="button" onClick={() => changePeriod(1)} aria-label={`Sonraki ${unit}`} className={NAV_BUTTON}>
                  ›
                </button>
              </>
            )}
          </div>
        </div>

        {view === "ay" && (
          <CalendarMonthView month={visibleMonth} items={shown} todayKey={todayKey} onSelect={(item) => setSelectedId(item.id)} onCreate={openCreate} />
        )}
        {view === "hafta" && (
          <CalendarWeekView weekStart={weekStart} items={shown} todayKey={todayKey} onSelect={(item) => setSelectedId(item.id)} onCreate={openCreate} />
        )}
        {view === "ajanda" && <CalendarAgendaView today={today} items={shown} onSelect={(item) => setSelectedId(item.id)} />}

        {view !== "ajanda" && items.length === 0 && (
          <p className="border-t border-surface-border px-5 py-4 text-center text-sm text-navy-500">
            Takvimde bu dönem için kayıt yok. Yeni etkinlik ekleyebilir veya bir davaya duruşma ya da görev tarihi girebilirsiniz.
          </p>
        )}
      </section>

      {selected && (
        <CalendarEventDrawer
          item={selected}
          onClose={() => setSelectedId(null)}
          onEdit={(item) => {
            setSelectedId(null);
            setFormInitial(eventFormInitialFromItem(item));
          }}
          onChanged={reload}
        />
      )}

      {formInitial && (
        <CalendarEventForm
          initial={formInitial}
          cases={cases}
          users={users}
          onClose={() => setFormInitial(null)}
          onSaved={() => {
            setFormInitial(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
