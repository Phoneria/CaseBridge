"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { createTask, getCases, listUsers, updateTask, type TaskPatch } from "@/lib/api";
import { ApiError } from "@/lib/apiError";
import type { AppUser, Case, Task, TaskWithCase, TaskPriority, TaskStage } from "@/types";
import { CaseSearchSelect } from "@/components/ai/CaseSearchSelect";
import { ReminderPicker } from "@/components/calendar/ReminderPicker";

import { STAGES, PRIORITIES, stageOf } from "@/lib/taskBoard";

const INPUT =
  "mt-1 block w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400 disabled:bg-surface-muted";
const LABEL = "text-xs font-medium text-navy-600";
const MAX_TITLE = 200;

export interface TaskPayload {
  title: string;
  stage?: TaskStage;
  priority?: TaskPriority;
  description?: string;
  due_date?: string;
  assigned_to?: string;
  reminder_days?: number[];
}

export function TaskFormModal({
  initialCaseId,
  editing,
  onClose,
  onCreated,
}: {
  editing?: TaskWithCase;
  initialCaseId?: string | null;
  onClose: () => void;
  onCreated: (task: Task, taskCase: Case) => void;
}) {
  const [cases, setCases] = useState<Case[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [title, setTitle] = useState(editing?.title ?? "");
  const [stage, setStage] = useState<TaskStage>(editing ? stageOf(editing) : "todo");
  const [priority, setPriority] = useState<TaskPriority>(editing?.priority ?? "normal");
  const [caseId, setCaseId] = useState<string | null>(editing?.case_id ?? initialCaseId ?? null);
  const [description, setDescription] = useState(editing?.description ?? "");
  const [dueDate, setDueDate] = useState(editing?.due_date ?? "");
  const [assigneeId, setAssigneeId] = useState(editing?.assigned_to ?? "");
  const [reminders, setReminders] = useState<number[]>(editing?.reminder_days ?? [1]);
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

  useEffect(() => {
    let active = true;
    getCases().then(data => { if (active) setCases(data); })
      .catch(() => active && setLoadError(true))
      .finally(() => active && setLoadingLists(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setUsers([]);
    listUsers(caseId).then(data => { if (active) setUsers(data); })
      .catch(() => active && setLoadError(true));
    return () => { active = false; };
  }, [caseId]);

  const selectedCase = cases.find((item) => item.id === caseId) ?? null;

  function validate(): string[] {
    const problems: string[] = [];
    const trimmed = title.trim();
    if (!trimmed) problems.push("Başlık gerekli.");
    else if (trimmed.length > MAX_TITLE) problems.push("Başlık en fazla 200 karakter olabilir.");
    if (!selectedCase) problems.push("Dava seçin.");
    return problems;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problems = validate();
    setErrors(problems);
    if (problems.length > 0 || !selectedCase) return;

    const payload: TaskPayload = { title: title.trim() };
    if (stage !== "todo") payload.stage = stage;
    if (priority !== "normal") payload.priority = priority;
    if (description.trim()) payload.description = description.trim();
    if (dueDate) {
      payload.due_date = dueDate;
      payload.reminder_days = reminders;
    }
    if (assigneeId) payload.assigned_to = assigneeId;

    setSaving(true);
    try {
      let task: Task;
      if (editing) {
        const patch: TaskPatch = {};
        if (payload.title !== editing.title) patch.title = payload.title;
        if (stage !== stageOf(editing)) patch.stage = stage;
        if (priority !== (editing.priority ?? "normal")) patch.priority = priority;
        if (description !== (editing.description ?? "")) patch.description = description.trim() || null;
        if (dueDate !== (editing.due_date ?? "")) patch.due_date = dueDate || null;
        if (assigneeId !== (editing.assigned_to ?? "")) patch.assigned_to = assigneeId || null;
        if (dueDate && reminders.join() !== (editing.reminder_days ?? [1]).join()) patch.reminder_days = reminders;
        task = await updateTask(selectedCase.id, editing.id, patch);
      } else {
        task = await createTask(selectedCase.id, payload);
      }
      onCreated(task, selectedCase);
    } catch (error) {
      setErrors(editing ? [error instanceof ApiError ? error.message : "Görev kaydedilemedi."] : [error instanceof ApiError ? `Görev eklenemedi: ${error.message}` : "Görev eklenemedi."]);
      setSaving(false);
    }
  }

  const alerts = loadError ? ["Davalar veya kullanıcılar yüklenemedi.", ...errors] : errors;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim p-4 sm:items-center">
      <div role="dialog" aria-modal="true" aria-labelledby="task-form-title" className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <form onSubmit={submit} noValidate>
          <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
            <h2 id="task-form-title" className="text-base font-semibold text-navy-900">
              {editing ? "Görevi düzenle" : "Yeni görev"}
            </h2>
            <button type="button" disabled={saving} onClick={onClose} aria-label="Formu kapat" className="grid h-8 w-8 place-items-center rounded-lg text-navy-500 hover:bg-surface-muted disabled:opacity-60">
              ✕
            </button>
          </div>

          <div className="grid max-h-[70vh] gap-4 overflow-y-auto px-5 py-4 sm:grid-cols-2">
            {alerts.length > 0 && (
              <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
                {alerts.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            )}
            <div className="sm:col-span-2">
              <label htmlFor="task-title" className={LABEL}>Başlık</label>
              <input id="task-title" ref={titleRef} value={title} maxLength={MAX_TITLE} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              {editing ? <p className={LABEL}>{editing.case_number} · {editing.case_name}</p> : loadingLists ? (
                <p className="text-sm text-navy-500">Davalar yükleniyor...</p>
              ) : (
                <CaseSearchSelect cases={cases} value={caseId} onChange={id => { if (id !== caseId) setAssigneeId(""); setCaseId(id); }} />
              )}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="task-description" className={LABEL}>{editing ? "Görev notları" : "Açıklama"}</label>
              <textarea id="task-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="task-due" className={LABEL}>Son tarih</label>
              <input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="task-assignee" className={LABEL}>Atanan kişi</label>
              <select id="task-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={INPUT}>
                <option value="">Atanmadı</option>
                {editing?.assigned_to && assigneeId === editing.assigned_to && !users.some(user => user.id === editing.assigned_to) &&
                  <option value={editing.assigned_to}>{editing.assignee_name ?? "Mevcut sorumlu"}</option>}
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.full_name}</option>
                ))}
              </select>
            </div>
            <label className={LABEL}>Aşama
              <select value={stage} onChange={e => setStage(e.target.value as TaskStage)} className={INPUT}>
                {Object.entries(STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className={LABEL}>Öncelik
              <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)} className={INPUT}>
                {Object.entries(PRIORITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <fieldset disabled={!dueDate} className="space-y-1 disabled:opacity-60 sm:col-span-2">
              <ReminderPicker value={reminders} onChange={setReminders} />
              {!dueDate && <p className="text-xs text-navy-500">Hatırlatma için son tarih seçin.</p>}
            </fieldset>
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
