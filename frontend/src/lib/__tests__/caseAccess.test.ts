import { describe, expect, it } from "vitest";

import { CASE_ACTION_LABELS, canManageCase, caseActions } from "@/lib/caseAccess";

const admin = { id: "u-admin", role: "admin" as const };
const owner = { id: "u-owner", role: "lawyer" as const };
const colleague = { id: "u-colleague", role: "lawyer" as const };

const open = { assigned_lawyer_id: "u-owner", status: "devam_eden" as const, is_archived: false };
const closed = { ...open, status: "kapali" as const };
const archived = { ...closed, is_archived: true };

describe("canManageCase", () => {
  it("allows the responsible lawyer and admins only", () => {
    expect(canManageCase(owner, open)).toBe(true);
    expect(canManageCase(admin, open)).toBe(true);
    expect(canManageCase(colleague, open)).toBe(false);
  });

  it("leaves a case without a responsible lawyer to the admins", () => {
    const orphan = { ...open, assigned_lawyer_id: null };
    expect(canManageCase(admin, orphan)).toBe(true);
    expect(canManageCase(owner, orphan)).toBe(false);
  });

  it("allows nobody until the user is known", () => {
    expect(canManageCase(null, open)).toBe(false);
  });
});

describe("caseActions", () => {
  it("offers edit and close on an open case", () => {
    expect(caseActions(owner, open)).toEqual(["edit", "close"]);
    expect(caseActions(admin, { ...open, status: "karar_bekleyen" })).toEqual(["edit", "close"]);
  });

  it("offers edit, reopen and archive on a closed case that is not archived", () => {
    expect(caseActions(owner, closed)).toEqual(["edit", "reopen", "archive"]);
  });

  it("offers only unarchive on an archived case", () => {
    expect(caseActions(owner, archived)).toEqual(["unarchive"]);
    expect(caseActions(admin, archived)).toEqual(["unarchive"]);
  });

  it("offers nothing to a user who may not manage the case", () => {
    expect(caseActions(colleague, open)).toEqual([]);
    expect(caseActions(colleague, closed)).toEqual([]);
    expect(caseActions(colleague, archived)).toEqual([]);
    expect(caseActions(null, open)).toEqual([]);
  });

  it("labels every action exactly", () => {
    expect(CASE_ACTION_LABELS).toEqual({
      edit: "Bilgileri düzenle",
      close: "Davayı kapat",
      reopen: "Yeniden aç",
      archive: "Arşivle",
      unarchive: "Arşivden çıkar",
    });
  });
});
