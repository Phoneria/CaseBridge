"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { deleteCalendarEvent, updateCalendarEvent, updateTaskReminders, updateTaskStatus } from "@/lib/api";
import { EVENT_TYPE_LABELS, describeReminders, formatDayLong, isTimed, timeLabel } from "@/lib/calendar";
import { caseDetailHref } from "@/lib/filters";
import type { CalendarEvent } from "@/types";
import { TYPE_DOTS } from "@/components/calendar/CalendarItemButton";
import { ReminderPicker } from "@/components/calendar/ReminderPicker";

const SECONDARY_BUTTON =
  "rounded-xl border border-surface-border px-3 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted disabled:opacity-60";
const PRIMARY_BUTTON = "rounded-xl bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-60";

export function CalendarEventDrawer({
  item,
  onClose,
  onEdit,
  onChanged,
}: {
  item: CalendarEvent;
  onClose: () => void;
  onEdit: (item: CalendarEvent) => void;
  onChanged: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingReminders, setEditingReminders] = useState(false);
  const [reminders, setReminders] = useState<number[]>(item.reminder_days);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reminderKey = item.reminder_days.join(",");

  useEffect(() => {
    setReminders(item.reminder_days);
    setEditingReminders(false);
    setConfirmingDelete(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, reminderKey]);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    panelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  async function run(action: () => Promise<unknown>, after: () => void, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      after();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  function saveReminders() {
    return run(
      () =>
        item.kind === "event"
          ? updateCalendarEvent(item.event_id as string, { reminder_days: reminders })
          : updateTaskReminders(item.task_id as string, reminders),
      () => {
        setEditingReminders(false);
        onChanged();
      },
      "Hatırlatma kaydedilemedi.",
    );
  }

  function remove() {
    return run(() => deleteCalendarEvent(item.event_id as string), () => {
      onChanged();
      onClose();
    }, "Etkinlik silinemedi.");
  }

  function complete() {
    return run(() => updateTaskStatus(item.case_id as string, item.task_id as string, "completed"), () => {
      onChanged();
      onClose();
    }, "Görev güncellenemedi.");
  }

  const timeText = isTimed(item) && item.start && item.end ? `${timeLabel(item.start)} – ${timeLabel(item.end)}` : "Tüm gün";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-navy-900/30" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-drawer-title"
        tabIndex={-1}
        className="relative flex h-full w-full flex-col bg-white shadow-xl outline-none sm:w-[420px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-navy-600">
              <i className={`h-2.5 w-2.5 rounded-full ${TYPE_DOTS[item.event_type]}`} />
              {EVENT_TYPE_LABELS[item.event_type]}
            </p>
            <h2 id="calendar-drawer-title" className="mt-1 text-base font-semibold text-navy-900">
              {item.title}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Paneli kapat" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-navy-500 hover:bg-surface-muted">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm">
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2">
            <dt className="text-navy-500">Tarih</dt>
            <dd className="text-navy-800">{formatDayLong(item.date)}</dd>
            <dt className="text-navy-500">Saat</dt>
            <dd className="text-navy-800">{timeText}</dd>
            {item.case_id && item.case_name && (
              <>
                <dt className="text-navy-500">Dava</dt>
                <dd>
                  <Link href={caseDetailHref(item.case_id)} className="font-medium text-accent-700 hover:underline">
                    {item.case_name}
                  </Link>
                </dd>
              </>
            )}
            <dt className="text-navy-500">Sorumlu</dt>
            <dd className="text-navy-800">{item.assignee_name ?? "Atanmadı"}</dd>
            {item.location && (
              <>
                <dt className="text-navy-500">Konum</dt>
                <dd className="text-navy-800">{item.location}</dd>
              </>
            )}
            {item.notes && (
              <>
                <dt className="text-navy-500">Not</dt>
                <dd className="whitespace-pre-wrap text-navy-800">{item.notes}</dd>
              </>
            )}
            <dt className="text-navy-500">Hatırlatmalar</dt>
            <dd className="text-navy-800">{describeReminders(item.reminder_days)}</dd>
          </dl>

          {item.kind === "case_hearing" && (
            <p className="rounded-xl bg-surface-muted px-3 py-2 text-xs text-navy-600">
              Dava duruşmalarında varsayılan hatırlatma: 3 gün ve 1 gün önce, davanın sorumlu avukatına e-posta.
            </p>
          )}

          {editingReminders && (
            <div className="space-y-3 rounded-xl border border-surface-border p-3">
              <ReminderPicker value={reminders} onChange={setReminders} legend="Hatırlatmaları değiştir" />
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={saveReminders} className={PRIMARY_BUTTON}>
                  Kaydet
                </button>
                <button type="button" onClick={() => setEditingReminders(false)} className={SECONDARY_BUTTON}>
                  Vazgeç
                </button>
              </div>
            </div>
          )}

          {confirmingDelete && (
            <div className="space-y-3 rounded-xl border border-red-100 bg-red-50 p-3 text-red-800">
              <p>Bu etkinlik silinsin mi?</p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={remove} className="rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
                  Evet, sil
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className={SECONDARY_BUTTON}>
                  Vazgeç
                </button>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-surface-border p-4">
          {item.kind === "event" && (
            <>
              <button type="button" onClick={() => onEdit(item)} className={PRIMARY_BUTTON}>
                Düzenle
              </button>
              <button type="button" onClick={() => setEditingReminders(true)} className={SECONDARY_BUTTON}>
                Hatırlatmayı değiştir
              </button>
              <button type="button" onClick={() => setConfirmingDelete(true)} className={SECONDARY_BUTTON}>
                Sil
              </button>
            </>
          )}
          {item.kind === "task" && (
            <>
              <button type="button" disabled={busy} onClick={complete} className={PRIMARY_BUTTON}>
                Tamamlandı
              </button>
              <button type="button" onClick={() => setEditingReminders(true)} className={SECONDARY_BUTTON}>
                Hatırlatmayı değiştir
              </button>
              {item.case_id && (
                <Link href={caseDetailHref(item.case_id, "gorevler")} className={SECONDARY_BUTTON}>
                  Göreve git
                </Link>
              )}
            </>
          )}
          {item.kind === "case_hearing" && item.case_id && (
            <Link href={caseDetailHref(item.case_id)} className={PRIMARY_BUTTON}>
              Davayı aç
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
