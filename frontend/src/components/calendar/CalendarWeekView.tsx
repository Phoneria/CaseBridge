"use client";

import { useMemo } from "react";

import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  HOUR_HEIGHT,
  MONTH_NAMES,
  WEEKDAYS,
  addDays,
  groupByDate,
  isTimed,
  timedBlock,
  toDateKey,
} from "@/lib/calendar";
import type { CalendarEvent } from "@/types";
import { CalendarItemButton } from "@/components/calendar/CalendarItemButton";

const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, index) => DAY_START_HOUR + index);
const GRID_COLUMNS = "grid grid-cols-[64px_repeat(7,minmax(0,1fr))]";

function hourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function CalendarWeekView({
  weekStart,
  items,
  todayKey,
  onSelect,
  onCreate,
}: {
  weekStart: Date;
  items: CalendarEvent[];
  todayKey: string;
  onSelect: (item: CalendarEvent) => void;
  onCreate: (dateKey: string, time?: string) => void;
}) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const byDate = useMemo(() => groupByDate(items), [items]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className={`${GRID_COLUMNS} border-b border-surface-border bg-surface-muted/60`}>
          <div />
          {days.map((day, index) => {
            const key = toDateKey(day);
            return (
              <div key={key} className="px-2 py-2 text-center text-xs font-semibold text-navy-600">
                <span className="uppercase tracking-wide text-navy-500">{WEEKDAYS[index]}</span>{" "}
                <span
                  className={`ml-1 inline-grid h-6 min-w-6 place-items-center rounded-full px-1 ${
                    key === todayKey ? "bg-accent-600 text-white" : "text-navy-800"
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        <div className={`${GRID_COLUMNS} border-b border-surface-border`}>
          <div className="px-2 py-2 text-right text-[11px] font-medium text-navy-500">Tüm gün</div>
          {days.map((day) => {
            const key = toDateKey(day);
            return (
              <div key={key} data-testid={`allday-${key}`} className="min-h-10 space-y-1 border-l border-surface-border p-1">
                {(byDate[key] ?? []).filter((item) => !isTimed(item)).map((item) => (
                  <CalendarItemButton key={item.id} item={item} onSelect={onSelect} />
                ))}
              </div>
            );
          })}
        </div>

        <div className={GRID_COLUMNS}>
          <div>
            {HOURS.map((hour) => (
              <div key={hour} style={{ height: HOUR_HEIGHT }} className="pr-2 pt-0.5 text-right text-[11px] text-navy-500">
                {hourLabel(hour)}
              </div>
            ))}
          </div>
          {days.map((day, index) => {
            const key = toDateKey(day);
            const label = `${WEEKDAYS[index]} ${day.getDate()} ${MONTH_NAMES[day.getMonth()]}`;
            return (
              <div key={key} data-testid={`day-${key}`} className="relative border-l border-surface-border">
                {HOURS.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    aria-label={`${label} ${hourLabel(hour)} için etkinlik ekle`}
                    onClick={() => onCreate(key, hourLabel(hour))}
                    style={{ height: HOUR_HEIGHT }}
                    className="block w-full border-b border-surface-border transition hover:bg-accent-50/50 focus:outline-none focus-visible:bg-accent-50"
                  />
                ))}
                {(byDate[key] ?? []).filter(isTimed).map((item) => {
                  const { top, height } = timedBlock(item);
                  return (
                    <CalendarItemButton
                      key={item.id}
                      item={item}
                      onSelect={onSelect}
                      style={{ top, height }}
                      className="absolute left-1 right-1 z-10 shadow-sm"
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
