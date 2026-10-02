"use client";

import { useMemo, useState, type MouseEvent } from "react";

import { MONTH_NAMES, WEEKDAYS, groupByDate, toDateKey } from "@/lib/calendar";
import type { CalendarEvent } from "@/types";
import { CalendarItemButton } from "@/components/calendar/CalendarItemButton";

const MAX_EVENTS_PER_DAY = 3;

export function CalendarMonthView({
  month,
  items,
  todayKey,
  onSelect,
  onCreate,
}: {
  month: Date;
  items: CalendarEvent[];
  todayKey: string;
  onSelect: (item: CalendarEvent) => void;
  onCreate: (dateKey: string) => void;
}) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const byDate = useMemo(() => groupByDate(items), [items]);

  const cells = useMemo(() => {
    const leading = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const result: Array<number | null> = [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [monthIndex, year]);

  function createOnEmptyClick(key: string) {
    return (event: MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onCreate(key);
    };
  }

  function select(item: CalendarEvent) {
    setOpenDay(null);
    onSelect(item);
  }

  return (
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
          {cells.map((day, index) => {
            if (!day) return <div key={`empty-${index}`} className="min-h-32 border-b border-r border-surface-border bg-surface-muted/35" />;
            const key = toDateKey(new Date(year, monthIndex, day));
            const dayItems = byDate[key] ?? [];
            const hidden = dayItems.length - MAX_EVENTS_PER_DAY;
            return (
              <div
                key={key}
                onClick={createOnEmptyClick(key)}
                className="group relative min-h-32 cursor-pointer border-b border-r border-surface-border bg-white p-2.5"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-xs font-medium ${
                      key === todayKey ? "bg-accent-600 text-white" : "text-navy-600"
                    }`}
                  >
                    {day}
                  </span>
                  <button
                    type="button"
                    aria-label={`${day} ${MONTH_NAMES[monthIndex]} için etkinlik ekle`}
                    onClick={() => onCreate(key)}
                    className="grid h-6 w-6 place-items-center rounded-md text-sm text-navy-500 opacity-0 transition hover:bg-surface-muted focus:opacity-100 group-hover:opacity-100"
                  >
                    +
                  </button>
                </div>
                <div className="space-y-1.5" onClick={createOnEmptyClick(key)}>
                  {dayItems.slice(0, MAX_EVENTS_PER_DAY).map((item) => (
                    <CalendarItemButton key={item.id} item={item} onSelect={select} />
                  ))}
                  {hidden > 0 && (
                    <button
                      type="button"
                      aria-expanded={openDay === key}
                      onClick={() => setOpenDay((current) => (current === key ? null : key))}
                      className="w-full rounded-md px-2 py-1 text-left text-[11px] font-medium text-navy-600 hover:bg-surface-muted"
                    >
                      +{hidden} daha
                    </button>
                  )}
                </div>
                {openDay === key && (
                  <div
                    role="dialog"
                    aria-label={`${day} ${MONTH_NAMES[monthIndex]} olayları`}
                    className="absolute left-1 top-10 z-20 w-64 cursor-default space-y-1.5 rounded-xl border border-surface-border bg-white p-3 shadow-xl"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-semibold text-navy-800">
                        {day} {MONTH_NAMES[monthIndex]}
                      </p>
                      <button type="button" aria-label="Kapat" onClick={() => setOpenDay(null)} className="text-navy-500 hover:text-navy-800">
                        ✕
                      </button>
                    </div>
                    {dayItems.map((item) => (
                      <CalendarItemButton key={`popover-${item.id}`} item={item} onSelect={select} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
