import type { AppUser, Case } from "@/types";

/**
 * Who may change a case: the responsible lawyer and admins. A case without a
 * responsible lawyer belongs to the admins. This only decides what the page
 * shows; the backend (app/api/case_access.py) answers 403 whatever the page does.
 */
export function canManageCase(
  me: Pick<AppUser, "id" | "role"> | null,
  item: Pick<Case, "assigned_lawyer_id">,
): boolean {
  if (!me) return false;
  return me.role === "admin" || (item.assigned_lawyer_id !== null && item.assigned_lawyer_id === me.id);
}

export type CaseAction = "edit" | "close" | "reopen" | "archive" | "unarchive";

export const CASE_ACTION_LABELS: Record<CaseAction, string> = {
  edit: "Bilgileri düzenle",
  close: "Davayı kapat",
  reopen: "Yeniden aç",
  archive: "Arşivle",
  unarchive: "Arşivden çıkar",
};

/** The entries of the "İşlemler" menu, in menu order; empty for a user who may not manage the case. */
export function caseActions(
  me: Pick<AppUser, "id" | "role"> | null,
  item: Pick<Case, "assigned_lawyer_id" | "status" | "is_archived">,
): CaseAction[] {
  if (!canManageCase(me, item)) return [];
  if (item.is_archived) return ["unarchive"];
  if (item.status === "kapali") return ["edit", "reopen", "archive"];
  return ["edit", "close"];
}
