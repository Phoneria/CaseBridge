"use client";

import type { CSSProperties } from "react";

import { EVENT_TYPE_LABELS, isTimed, timeLabel } from "@/lib/calendar";
import type { CalendarEvent } from "@/types";

export const TYPE_STYLES: Record<CalendarEvent["event_type"], string> = {
  hearing: "border-red-500 bg-red-50 text-red-800",
  task: "border-accent-500 bg-accent-50 text-accent-800",
  meeting: "border-sky-500 bg-sky-50 text-sky-800",
  client_meeting: "border-emerald-500 bg-emerald-50 text-emerald-800",
  other: "border-navy-500 bg-surface-muted text-navy-800",
};

export const TYPE_DOTS: Record<CalendarEvent["event_type"], string> = {
  hearing: "bg-red-500",
  task: "bg-accent-500",
  meeting: "bg-sky-500",
  client_meeting: "bg-emerald-500",
  other: "bg-navy-500",
};

/** One calendar item as a clickable chip; opens the detail drawer via onSelect. */
export function CalendarItemButton({
  item,
  onSelect,
  className = "w-full",
  style,
}: {
  item: CalendarEvent;
  onSelect: (item: CalendarEvent) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const subtitle = item.case_name ?? item.location ?? EVENT_TYPE_LABELS[item.event_type];
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      style={style}
      title={[item.title, item.case_name].filter(Boolean).join(" — ")}
      className={`block overflow-hidden rounded-md border-l-2 px-2 py-1 text-left text-[11px] leading-4 transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${TYPE_STYLES[item.event_type]} ${className}`}
    >
      <span className="block truncate font-semibold">
        {isTimed(item) && item.start && <span className="mr-1 font-normal opacity-80">{timeLabel(item.start)}</span>}
        {item.title}
      </span>
      <span className="block truncate opacity-70">{subtitle}</span>
    </button>
  );
}
