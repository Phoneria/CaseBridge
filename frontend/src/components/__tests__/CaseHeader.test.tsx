import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CaseHeader } from "@/components/CaseHeader";
import { rememberCaseListHref } from "@/lib/caseListMemory";
import type { Case } from "@/types";

const base = {
  id: "c1", case_number: "2026/1", case_name: "Kira Davası", client_name: "Deniz", opposing_party: null,
  status: "devam_eden", outcome: "ongoing", is_archived: false, assigned_lawyer_id: "u1", assigned_lawyer_name: "Ayşe Demir",
} as unknown as Case;

afterEach(() => window.sessionStorage.clear());

describe("CaseHeader", () => {
  it("links back to the last case list and names the responsible lawyer", async () => {
    rememberCaseListHref("/davalar?durum=aktif");
    render(<CaseHeader caseDetail={base} actions={[]} busy={false} actionError={null} onPick={() => {}} />);
    expect(await screen.findByRole("link", { name: "← Davalar" })).toHaveAttribute("href", "/davalar?durum=aktif");
    expect(screen.getByText("Sorumlu: Ayşe Demir")).toBeInTheDocument();
  });

  it("falls back to /davalar and says when nobody is responsible", () => {
    render(<CaseHeader caseDetail={{ ...base, assigned_lawyer_id: null, assigned_lawyer_name: null }} actions={[]} busy={false} actionError={null} onPick={() => {}} />);
    expect(screen.getByRole("link", { name: "← Davalar" })).toHaveAttribute("href", "/davalar");
    expect(screen.getByText("Sorumlu: Atanmamış")).toBeInTheDocument();
  });
});
