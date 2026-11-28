import { describe, expect, it } from "vitest";

import { AUDIT_ACTION_GROUPS, AUDIT_ACTION_LABELS, auditActionLabel, describeAuditDetails } from "@/lib/auditEvents";

describe("auditEvents", () => {
  it("puts every labelled action in exactly one filter group", () => {
    for (const action of Object.keys(AUDIT_ACTION_LABELS)) {
      const groups = AUDIT_ACTION_GROUPS.filter((group) => group.prefix.some((prefix) => action.startsWith(prefix)));
      expect(groups, action).toHaveLength(1);
    }
  });

  it("falls back to the raw code for an action it does not know yet", () => {
    expect(auditActionLabel("case.created")).toBe("Dava oluşturuldu");
    expect(auditActionLabel("case.future_action")).toBe("case.future_action");
  });

  it("describes fields, transitions, counts and flags, naming known lawyers only", () => {
    const names: Record<string, string> = { "lawyer-1": "Ayşe Avukat" };
    const nameOf = (id: string) => names[id] ?? null;
    expect(describeAuditDetails({
      transitions: { assigned_lawyer_id: ["lawyer-x", "lawyer-1"], task_status: [null, "pending"] },
      fields: ["court", "description"],
      counts: { parties: 2 },
      flags: { source: "ai_intake" },
    }, nameOf)).toEqual([
      "Sorumlu: başka kullanıcı → Ayşe Avukat", "Görev: Bekliyor", "Değişen: mahkeme, açıklama", "2 taraf", "AI ile giriş",
    ]);
    expect(describeAuditDetails({}, nameOf)).toEqual([]);
  });
});
