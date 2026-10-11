import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { CaseDecisionCard } from "@/components/CaseDecisionCard";
import type { Case } from "@/types";

const closed = { status: "kapali", outcome: "lost", decision_date: "2026-10-01", closing_note: "Karar tebliğ edildi.\nİstinaf süresi 2 hafta." } as unknown as Case;

describe("CaseDecisionCard", () => {
  it("shows the outcome, the decision date and the note", () => {
    render(<CaseDecisionCard caseDetail={closed} />);
    const card = screen.getByRole("region", { name: "Karar bilgisi" });
    expect(within(card).getByText("Sonuç").nextSibling).toHaveTextContent("Kaybedildi");
    expect(within(card).getByText("Karar tarihi").nextSibling).toHaveTextContent("01.10.2026");
    expect(within(card).getByText("Karar notu").nextSibling).toHaveTextContent("Karar tebliğ edildi.");
    expect(within(card).getByText("Karar notu").nextSibling).toHaveTextContent("İstinaf süresi 2 hafta.");
  });

  it.each([
    ["won", "Kazanıldı"],
    ["settled", "Sulh"],
  ])("labels the %s outcome", (outcome, label) => {
    render(<CaseDecisionCard caseDetail={{ ...closed, outcome } as unknown as Case} />);
    expect(screen.getByText("Sonuç").nextSibling).toHaveTextContent(label);
  });

  it("shows a dash for what a case closed before decisions were recorded does not have", () => {
    render(<CaseDecisionCard caseDetail={{ status: "kapali", outcome: "ongoing", decision_date: null, closing_note: null } as unknown as Case} />);
    for (const label of ["Sonuç", "Karar tarihi", "Karar notu"]) {
      expect(screen.getByText(label).nextSibling).toHaveTextContent("—");
    }
  });
});
