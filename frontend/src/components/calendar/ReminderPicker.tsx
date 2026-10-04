"use client";

import { REMINDER_OPTIONS, reminderDayLabel } from "@/lib/calendar";

const CHIP = "flex items-center gap-1.5 rounded-lg border border-surface-border px-2.5 py-1.5 text-sm text-navy-700";

/** Multi-select of reminder offsets; an empty list means "Hatırlatma yok". */
export function ReminderPicker({
  value,
  onChange,
  legend = "Hatırlatma",
}: {
  value: number[];
  onChange: (days: number[]) => void;
  legend?: string;
}) {
  function toggle(days: number) {
    const next = value.includes(days) ? value.filter((d) => d !== days) : [...value, days];
    onChange(Array.from(new Set(next)).sort((a, b) => b - a));
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-navy-600">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {REMINDER_OPTIONS.map((days) => (
          <label key={days} className={CHIP}>
            <input type="checkbox" checked={value.includes(days)} onChange={() => toggle(days)} className="h-4 w-4 accent-accent-600" />
            {reminderDayLabel(days)}
          </label>
        ))}
        <label className={CHIP}>
          <input type="checkbox" checked={value.length === 0} onChange={() => onChange([])} className="h-4 w-4 accent-accent-600" />
          Hatırlatma yok
        </label>
      </div>
    </fieldset>
  );
}
