"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { createCalendarEvent, updateCalendarEvent } from "@/lib/api";
import { DEFAULT_REMINDER_DAYS, EVENT_TYPE_LABELS, EVENT_TYPE_OPTIONS, durationMinutes, timeLabel } from "@/lib/calendar";
import type { AppUser, CalendarEvent, CalendarEventPayload, CalendarEventRecord, CalendarEventType, Case } from "@/types";
import { CaseSearchSelect } from "@/components/ai/CaseSearchSelect";
import { ReminderPicker } from "@/components/calendar/ReminderPicker";

export interface EventFormInitial {
  id?: string; // set -> edit
  title?: string;
  event_type?: CalendarEventType;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  all_day?: boolean;
  duration_minutes?: number;
  location?: string | null;
  notes?: string | null;
  case_id?: string | null;
  assignee_id?: string | null;
  reminder_days?: number[];
}

export function eventFormInitialFromItem(item: CalendarEvent): EventFormInitial {
  return {
    id: item.event_id ?? undefined,
    title: item.title,
    event_type: item.event_type === "task" ? "other" : item.event_type,
    date: item.date,
    time: item.start ? timeLabel(item.start) : "09:00",
    all_day: item.all_day,
    duration_minutes: durationMinutes(item),
    location: item.location,
    notes: item.notes,
    case_id: item.case_id,
    assignee_id: item.assignee_id,
    reminder_days: item.reminder_days,
  };
}

const INPUT =
  "mt-1 block w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400 disabled:bg-surface-muted";
const LABEL = "text-xs font-medium text-navy-600";

export function CalendarEventForm({
  initial,
  cases,
  users,
  onClose,
  onSaved,
}: {
  initial: EventFormInitial;
  cases: Case[];
  users: AppUser[];
  onClose: () => void;
  onSaved: (record: CalendarEventRecord) => void;
}) {
  const editing = Boolean(initial.id);
  const initialType = initial.event_type ?? "meeting";
  const [title, setTitle] = useState(initial.title ?? "");
  const [eventType, setEventType] = useState<CalendarEventType>(initialType);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time ?? "09:00");
  const [allDay, setAllDay] = useState(initial.all_day ?? false);
  const [duration, setDuration] = useState(String(initial.duration_minutes ?? 60));
  const [caseId, setCaseId] = useState<string | null>(initial.case_id ?? null);
  const [assigneeId, setAssigneeId] = useState(initial.assignee_id ?? "");
  const [location, setLocation] = useState(initial.location ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [reminders, setReminders] = useState<number[]>(initial.reminder_days ?? DEFAULT_REMINDER_DAYS[initialType]);
  const [remindersTouched, setRemindersTouched] = useState(editing);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const savingRef = useRef(false);
  savingRef.current = saving;
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    titleRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !savingRef.current) closeRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, []);

  function changeType(next: CalendarEventType) {
    setEventType(next);
    if (!remindersTouched) setReminders(DEFAULT_REMINDER_DAYS[next]);
  }

  function changeReminders(next: number[]) {
    setRemindersTouched(true);
    setReminders(next);
  }

  function validate(): string[] {
    const problems: string[] = [];
    const minutes = Number(duration);
    if (!title.trim()) problems.push("Başlık zorunludur.");
    if (!date) problems.push("Tarih zorunludur.");
    if (!allDay && !time) problems.push("Saat zorunludur.");
    if (!allDay && (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440)) {
      problems.push("Süre 5 ile 1440 dakika arasında olmalıdır.");
    }
    return problems;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problems = validate();
    setErrors(problems);
    if (problems.length > 0) return;

    const minutes = Number(duration);
    const payload: CalendarEventPayload = {
      title: title.trim(),
      event_type: eventType,
      starts_at: `${date}T${allDay ? "00:00" : time}:00`,
      all_day: allDay,
      duration_minutes: Number.isInteger(minutes) && minutes >= 5 && minutes <= 1440 ? minutes : 60,
      location: location.trim() || null,
      notes: notes.trim() || null,
      case_id: caseId,
      assignee_id: assigneeId || null,
      reminder_days: reminders,
    };
    setSaving(true);
    try {
      const record = initial.id ? await updateCalendarEvent(initial.id, payload) : await createCalendarEvent(payload);
      onSaved(record);
    } catch (error) {
      setErrors([error instanceof Error ? `Etkinlik kaydedilemedi: ${error.message}` : "Etkinlik kaydedilemedi."]);
    } finally {
      setSaving(false);
    }
  }

  const selectedCase = cases.find((item) => item.id === caseId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-900/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-form-title"
        className="w-full max-w-2xl rounded-2xl bg-white shadow-xl"
      >
        <form onSubmit={submit} noValidate>
          <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
            <h2 id="event-form-title" className="text-base font-semibold text-navy-900">
              {editing ? "Etkinliği düzenle" : "Yeni etkinlik"}
            </h2>
            <button type="button" disabled={saving} onClick={onClose} aria-label="Formu kapat" className="grid h-8 w-8 place-items-center rounded-lg text-navy-500 hover:bg-surface-muted disabled:opacity-60">
              ✕
            </button>
          </div>

          <div className="grid max-h-[70vh] gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-2">
            {errors.length > 0 && (
              <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
                {errors.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            )}
            <div className="sm:col-span-2">
              <label htmlFor="event-title" className={LABEL}>Başlık</label>
              <input id="event-title" ref={titleRef} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="event-type" className={LABEL}>Tür</label>
              <select id="event-type" value={eventType} onChange={(e) => changeType(e.target.value as CalendarEventType)} className={INPUT}>
                {EVENT_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>{EVENT_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="event-date" className={LABEL}>Tarih</label>
              <input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
            </div>
            <label className="flex items-center gap-2 text-sm text-navy-700 sm:col-span-2">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 accent-accent-600" />
              Tüm gün
            </label>
            <div>
              <label htmlFor="event-time" className={LABEL}>Saat</label>
              <input id="event-time" type="time" value={time} disabled={allDay} onChange={(e) => setTime(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="event-duration" className={LABEL}>Süre (dakika)</label>
              <input
                id="event-duration"
                type="number"
                min={5}
                max={1440}
                step={5}
                value={duration}
                disabled={allDay}
                onChange={(e) => setDuration(e.target.value)}
                className={INPUT}
              />
            </div>
            <div className="sm:col-span-2">
              <CaseSearchSelect cases={cases} value={caseId} onChange={setCaseId} />
              {selectedCase && (
                <button type="button" onClick={() => setCaseId(null)} className="mt-1 text-xs font-medium text-accent-700 hover:underline">
                  Davayı kaldır
                </button>
              )}
            </div>
            <div>
              <label htmlFor="event-assignee" className={LABEL}>Sorumlu</label>
              <select id="event-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={INPUT}>
                <option value="">Seçilmedi</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="event-location" className={LABEL}>Konum</label>
              <input id="event-location" value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="event-notes" className={LABEL}>Not</label>
              <textarea id="event-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <ReminderPicker value={reminders} onChange={changeReminders} />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-4">
            <button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted disabled:opacity-60">
              Vazgeç
            </button>
            <button type="submit" disabled={saving} className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60">
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
