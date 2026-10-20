"use client";

import { useRef, useState } from "react";

import { addCaseEvent, deleteCaseNote, updateCaseNote } from "@/lib/api";
import { NOTE_MAX_LENGTH, canChangeNote, noteText, sortNotes } from "@/lib/caseNotes";
import { todayLocalISO } from "@/lib/closing";
import { formatDate } from "@/lib/labels";
import { userMessage } from "@/lib/userMessages";
import type { AppUser, CaseEvent } from "@/types";
import { EmptyState } from "@/components/EmptyState";
import { ModalFrame } from "@/components/ModalFrame";

const INPUT = "rounded-lg border border-surface-border px-3 py-2 text-sm outline-none focus:border-accent-400";
const SAVE_FAILED = "Not kaydedilemedi. Lütfen tekrar deneyin.";
const EMPTY_NOTE = "Not metni boş olamaz.";

interface Props {
  caseId: string;
  notes: CaseEvent[];
  me: Pick<AppUser, "id" | "role"> | null;
  assignedLawyerId: string | null;
  readOnly: boolean;
  onAdded: (note: CaseEvent) => void;
  onUpdated: (note: CaseEvent) => void;
  onDeleted: (noteId: string) => void;
}

/** "Notlar": notes are timeline entries of type "note"; any colleague adds, author / responsible lawyer / admin change. */
export function CaseNotesPanel({ caseId, notes, me, assignedLawyerId, readOnly, onAdded, onUpdated, onDeleted }: Props) {
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => todayLocalISO());
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const addInFlight = useRef(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const editInFlight = useRef(false);

  const [deleteTarget, setDeleteTarget] = useState<CaseEvent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteInFlight = useRef(false);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (addInFlight.current) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setAddError(EMPTY_NOTE);
      return;
    }
    addInFlight.current = true;
    setAdding(true);
    setAddError(null);
    try {
      const created = await addCaseEvent(caseId, { event_date: date, event_type: "note", description: trimmed });
      onAdded(created);
      setText("");
    } catch (err) {
      setAddError(userMessage(err, SAVE_FAILED));
    } finally {
      addInFlight.current = false;
      setAdding(false);
    }
  }

  function startEdit(note: CaseEvent) {
    setEditingId(note.id);
    setEditText(noteText(note));
    setEditDate(note.event_date);
    setEditError(null);
  }

  async function saveEdit(note: CaseEvent) {
    if (editInFlight.current) return;
    const trimmed = editText.trim();
    if (!trimmed) {
      setEditError(EMPTY_NOTE);
      return;
    }
    editInFlight.current = true;
    setEditSaving(true);
    setEditError(null);
    try {
      const updated = await updateCaseNote(caseId, note.id, { description: trimmed, event_date: editDate });
      onUpdated(updated);
      setEditingId(null);
    } catch (err) {
      setEditError(userMessage(err, SAVE_FAILED));
    } finally {
      editInFlight.current = false;
      setEditSaving(false);
    }
  }

  async function confirmDelete() {
    if (deleteInFlight.current || !deleteTarget) return;
    const target = deleteTarget;
    deleteInFlight.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCaseNote(caseId, target.id);
      onDeleted(target.id);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(userMessage(err, "Not silinemedi. Lütfen tekrar deneyin."));
    } finally {
      deleteInFlight.current = false;
      setDeleting(false);
    }
  }

  const sorted = sortNotes(notes);

  return (
    <div className="space-y-4 rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      {!readOnly && (
        <form onSubmit={add} noValidate className="space-y-2">
          <label htmlFor="note_text" className="block text-xs font-medium text-navy-600">Not</label>
          <textarea id="note_text" rows={3} maxLength={NOTE_MAX_LENGTH} value={text}
            onChange={(e) => setText(e.target.value)} className={`w-full ${INPUT}`} />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <label htmlFor="note_date" className="mb-1 block text-xs font-medium text-navy-600">Tarih</label>
              <input id="note_date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-navy-400">{`${text.length}/${NOTE_MAX_LENGTH}`}</span>
              <button type="submit" aria-disabled={adding}
                className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 aria-disabled:opacity-60">
                {adding ? "Ekleniyor..." : "Not ekle"}
              </button>
            </div>
          </div>
          {addError && <p role="alert" className="text-sm text-red-700">{addError}</p>}
        </form>
      )}

      {sorted.length === 0 ? (
        <EmptyState message="Henüz not eklenmedi." />
      ) : (
        <ul className="space-y-4 text-sm">
          {sorted.map((note) => {
            const mayChange = !readOnly && canChangeNote(me, assignedLawyerId, note);
            const editing = editingId === note.id;
            return (
              <li key={note.id} className="border-b border-surface-border pb-3 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-navy-500">
                    {formatDate(note.event_date)}
                    {note.created_by_name ? ` — ${note.created_by_name}` : ""}
                  </p>
                  {mayChange && !editing && (
                    <div className="flex gap-2 text-xs font-semibold">
                      <button type="button" onClick={() => startEdit(note)} className="text-accent-700 hover:underline">Düzenle</button>
                      <button type="button" onClick={() => { setDeleteError(null); setDeleteTarget(note); }} className="text-red-700 hover:underline">Sil</button>
                    </div>
                  )}
                </div>
                {editing ? (
                  <div className="mt-2 space-y-2">
                    <textarea aria-label="Notu düzenle" rows={3} maxLength={NOTE_MAX_LENGTH} value={editText}
                      onChange={(e) => setEditText(e.target.value)} className={`w-full ${INPUT}`} />
                    <div className="flex flex-wrap items-center gap-2">
                      <input aria-label="Not tarihi" type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className={INPUT} />
                      <button type="button" aria-disabled={editSaving} onClick={() => void saveEdit(note)}
                        className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-700 aria-disabled:opacity-60">
                        {editSaving ? "Kaydediliyor..." : "Kaydet"}
                      </button>
                      <button type="button" aria-disabled={editSaving} onClick={() => { if (!editSaving) setEditingId(null); }}
                        className="rounded-lg border border-surface-border px-3 py-1.5 text-xs font-medium text-navy-700 hover:bg-surface-muted">
                        Vazgeç
                      </button>
                    </div>
                    {editError && <p role="alert" className="text-sm text-red-700">{editError}</p>}
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-line text-navy-800">{noteText(note)}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {deleteTarget && (
        <ModalFrame title="Not silinsin mi?" onClose={() => setDeleteTarget(null)} busy={deleting}>
          <p className="text-sm text-navy-700">Bu işlem geri alınamaz.</p>
          {deleteError && <p role="alert" className="mt-3 text-sm text-red-700">{deleteError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" aria-disabled={deleting} onClick={() => { if (!deleting) setDeleteTarget(null); }}
              className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-navy-700 hover:bg-surface-muted">
              Vazgeç
            </button>
            <button type="button" aria-disabled={deleting} onClick={() => void confirmDelete()}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 aria-disabled:opacity-60">
              {deleting ? "Siliniyor..." : "Sil"}
            </button>
          </div>
        </ModalFrame>
      )}
    </div>
  );
}
