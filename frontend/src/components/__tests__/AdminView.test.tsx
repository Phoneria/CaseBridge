import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const getMe = vi.fn();
const listAdminLawyers = vi.fn();
const getCases = vi.fn();
const getPrecedents = vi.fn();
const getAnalyticsOverview = vi.fn();
const assignCaseLawyer = vi.fn();
const assignPrecedentReviewer = vi.fn();

vi.mock("@/lib/api", () => ({
  getMe: (...args: unknown[]) => getMe(...args),
  listAdminLawyers: (...args: unknown[]) => listAdminLawyers(...args),
  getCases: (...args: unknown[]) => getCases(...args),
  getPrecedents: (...args: unknown[]) => getPrecedents(...args),
  getAnalyticsOverview: (...args: unknown[]) => getAnalyticsOverview(...args),
  assignCaseLawyer: (...args: unknown[]) => assignCaseLawyer(...args),
  assignPrecedentReviewer: (...args: unknown[]) => assignPrecedentReviewer(...args),
}));

import { AdminView } from "@/components/AdminView";

const lawyers = [
  { id: "u1", full_name: "Emre Yılmaz", department: "Ticaret Hukuku", role: "lawyer", is_active: true },
  { id: "u3", full_name: "Kerem Demir", department: "İş Hukuku", role: "lawyer", is_active: true },
  { id: "u2", full_name: "Zeynep Arslan", department: "Kira Hukuku", role: "lawyer", is_active: true },
];
const caseRow = { id: "c1", case_name: "Ticari Dava", case_number: "2026/1", client_name: "Ayşe Kaya", status: "devam_eden", assigned_lawyer_id: "u1" };
const overview = { by_lawyer: [
  { lawyer_id: "u1", full_name: "Emre Yılmaz", department: "Ticaret Hukuku", total: 1, active: 1, won: 0, lost: 0 },
  { lawyer_id: "u3", full_name: "Kerem Demir", department: "İş Hukuku", total: 0, active: 0, won: 0, lost: 0 },
  { lawyer_id: "u2", full_name: "Zeynep Arslan", department: "Kira Hukuku", total: 0, active: 0, won: 0, lost: 0 },
] };
const precedents = Array.from({ length: 20 }, (_, index) => ({
  id: `p${index}`, case_name: `Emsal ${index + 1}`, case_number: `2026/${index + 1}`,
  reviewer_lawyer_id: index < 7 ? "u1" : index < 14 ? "u3" : "u2",
}));

beforeEach(() => {
  vi.clearAllMocks();
  getMe.mockResolvedValue({ role: "admin" });
  listAdminLawyers.mockResolvedValue(lawyers);
  getCases.mockResolvedValue([caseRow]);
  getPrecedents.mockResolvedValue(precedents);
  getAnalyticsOverview.mockResolvedValue(overview);
  assignCaseLawyer.mockResolvedValue({ ...caseRow, assigned_lawyer_id: "u2" });
  assignPrecedentReviewer.mockResolvedValue({ ...precedents[0], reviewer_lawyer_id: "u2" });
});

describe("AdminView", () => {
  it("shows responsibility analytics and changes a case owner", async () => {
    render(<AdminView />);
    expect((await screen.findAllByText("Ticari Dava")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ticaret Hukuku").length).toBeGreaterThan(0);
    expect(screen.getByText("Yeni Dava Trendi")).toBeInTheDocument();
    expect(screen.getByText("Durum Dağılımı")).toBeInTheDocument();
    expect(screen.getByText("Avukat İş Yükü")).toBeInTheDocument();
    expect(screen.getByText("Atama Panosu")).toBeInTheDocument();
    expect(screen.queryByText("Müvekkil Görünümü")).not.toBeInTheDocument();
    expect(screen.queryByText("Emsal İnceleme Atamaları")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Ticari Dava sorumlu avukatı" }), "u2");
    await waitFor(() => expect(assignCaseLawyer).toHaveBeenCalledWith("c1", "u2"));
  });

  it("does not load admin data for a lawyer", async () => {
    getMe.mockResolvedValue({ role: "lawyer" });
    render(<AdminView />);
    expect(await screen.findByText(/yalnızca yöneticiler/i)).toBeInTheDocument();
    expect(listAdminLawyers).not.toHaveBeenCalled();
    expect(getPrecedents).not.toHaveBeenCalled();
  });
});
