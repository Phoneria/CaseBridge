"use client";

import { AGENDA_DAYS, MONTH_NAMES, WEEKDAY_NAMES, addDays, groupByDate, parseDateKey, startOfWeek, toDateKey } from "@/lib/calendar";
import type { CalendarEvent } from "@/types";
import { CalendarItemButton } from "@/components/calendar/CalendarItemButton";

export function CalendarAgendaView({
  today,
  items,
  onSelect,
}: {
  today: Date;
  items: CalendarEvent[];
  onSelect: (item: CalendarEvent) => void;
}) {
  const todayKey = toDateKey(today);
  const lastKey = toDateKey(addDays(today, AGENDA_DAYS - 1));
  const weekEndKey = toDateKey(addDays(startOfWeek(today), 6));
  const byDate = groupByDate(items);
  const keys = Object.keys(byDate)
    .filter((key) => key >= todayKey && key <= lastKey)
    .sort();

  if (keys.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-navy-500">Önümüzdeki 30 günde kayıt yok.</p>;
  }

  return (
    <ol aria-label="Ajanda" className="divide-y divide-surface-border">
      {keys.map((key) => {
        const date = parseDateKey(key);
        const isToday = key === todayKey;
        const thisWeek = !isToday && key <= weekEndKey;
        return (
          <li key={key} className={`px-5 py-4 ${isToday ? "bg-accent-50/50" : ""}`}>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-navy-900">
                {date.getDate()} {MONTH_NAMES[date.getMonth()]} {WEEKDAY_NAMES[(date.getDay() + 6) % 7]}
              </h3>
              {isToday && <span className="rounded-full bg-accent-600 px-2 py-0.5 text-[11px] font-medium text-white">Bugün</span>}
              {thisWeek && (
                <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-medium text-accent-800">Bu hafta</span>
              )}
            </div>
            <ul className="space-y-1.5">
              {byDate[key].map((item) => (
                <li key={item.id}>
                  <CalendarItemButton item={item} onSelect={onSelect} className="w-full text-xs" />
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
