"use client";

import { EVENT_TYPE_LABELS, TYPE_SLUG_TO_EVENT_TYPE } from "@/lib/calendar";
import { CALENDAR_TYPE_SLUGS, type CalendarQuery } from "@/lib/filters";
import type { AppUser, Case } from "@/types";

type FilterUpdates = Record<string, string | null>;

const SELECT_CLASS =
  "mt-1 block w-48 rounded-lg border border-surface-border bg-white px-2.5 py-1.5 text-sm text-navy-800 outline-none focus:border-accent-400";

export function CalendarFilters({
  query,
  users,
  cases,
  onChange,
}: {
  query: CalendarQuery;
  users: AppUser[];
  cases: Case[];
  onChange: (updates: FilterUpdates) => void;
}) {
  const active = Boolean(query.tur || query.sorumlu || query.dava || query.benim);
  return (
    <div role="group" aria-label="Takvim filtreleri" className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="calendar-filter-type" className="text-xs font-medium text-navy-600">
          Tür
        </label>
        <select
          id="calendar-filter-type"
          value={query.tur ?? ""}
          onChange={(event) => onChange({ tur: event.target.value || null, goster: null })}
          className={SELECT_CLASS}
        >
          <option value="">Tümü</option>
          {CALENDAR_TYPE_SLUGS.map((slug) => (
            <option key={slug} value={slug}>
              {EVENT_TYPE_LABELS[TYPE_SLUG_TO_EVENT_TYPE[slug]]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="calendar-filter-assignee" className="text-xs font-medium text-navy-600">
          Sorumlu
        </label>
        <select
          id="calendar-filter-assignee"
          value={query.sorumlu ?? ""}
          onChange={(event) => onChange({ sorumlu: event.target.value || null })}
          className={SELECT_CLASS}
        >
          <option value="">Tümü</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.full_name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="calendar-filter-case" className="text-xs font-medium text-navy-600">
          Dava
        </label>
        <select
          id="calendar-filter-case"
          value={query.dava ?? ""}
          onChange={(event) => onChange({ dava: event.target.value || null })}
          className={SELECT_CLASS}
        >
          <option value="">Tümü</option>
          {cases.map((item) => (
            <option key={item.id} value={item.id}>
              {item.case_name}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 pb-1.5 text-sm text-navy-700">
        <input
          type="checkbox"
          checked={query.benim === "1"}
          onChange={(event) => onChange({ benim: event.target.checked ? "1" : null })}
          className="h-4 w-4 accent-accent-600"
        />
        Yalnızca benimkiler
      </label>
      {active && (
        <button
          type="button"
          onClick={() => onChange({ tur: null, goster: null, sorumlu: null, dava: null, benim: null })}
          className="pb-1.5 text-xs font-medium text-accent-700 hover:underline"
        >
          Filtreleri temizle
        </button>
      )}
    </div>
  );
}
