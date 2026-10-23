import type { AppUser, CaseEvent } from "@/types";

export const NOTE_MAX_LENGTH = 4000;

/** A note's full text; notes written before the Notlar form only have a title. */
export function noteText(note: CaseEvent): string {
  return note.description ?? note.title;
}

export function sortNotes(notes: CaseEvent[]): CaseEvent[] {
  return [...notes].sort((a, b) => b.event_date.localeCompare(a.event_date) || b.created_at.localeCompare(a.created_at));
}

/**
 * Who may edit or delete a note: its author, the case's responsible lawyer, admins.
 * Only decides what the page shows; the backend answers 403 whatever the page does.
 */
export function canChangeNote(
  me: Pick<AppUser, "id" | "role"> | null,
  assignedLawyerId: string | null,
  note: Pick<CaseEvent, "created_by">,
): boolean {
  if (!me) return false;
  if (me.role === "admin") return true;
  if (note.created_by !== null && note.created_by === me.id) return true;
  return assignedLawyerId !== null && assignedLawyerId === me.id;
}
