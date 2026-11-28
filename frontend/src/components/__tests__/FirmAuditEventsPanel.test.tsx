import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = { listFirmAuditEvents: vi.fn(), listPlatformFirms: vi.fn() };

vi.mock("@/lib/api", () => ({
  listFirmAuditEvents: (...a: unknown[]) => api.listFirmAuditEvents(...a),
  listPlatformFirms: (...a: unknown[]) => api.listPlatformFirms(...a),
  downloadAuditCsv: vi.fn(),
}));

import { ApiError } from "@/lib/apiError";
import { AUDIT_PAGE_SIZE, FirmAuditEventsPanel } from "@/components/platform/FirmAuditEventsPanel";
import type { AuditEvent, AuditEventPage } from "@/types";

const LAWYER = "195e4715-46c7-4c75-80c6-237322df47d2";
const STRANGER = "77777777-46c7-4c75-80c6-237322df47d2";
const CASE = "4b458a0d-9d4e-4e91-8456-320223653276";

function event(over: Partial<AuditEvent>): AuditEvent {
  return {
    id: over.id ?? "e1", occurred_at: "2026-11-25T09:30:00Z", actor_user_id: LAWYER, actor_role: "lawyer",
    action: "case.closed", case_id: CASE, case_type: "kira", target_type: null, target_id: null, details: {}, ...over,
  };
}

function page(items: AuditEvent[], over: Partial<AuditEventPage> = {}): AuditEventPage {
  return {
    firm_id: "f1", firm_name: "Demir Hukuk", from: "2026-10-27", to: "2026-11-25", total: items.length,
    limit: AUDIT_PAGE_SIZE, offset: 0, by_action: { "case.closed": 1 }, items, ...over,
  };
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.listPlatformFirms.mockResolvedValue([{
    id: "f1", name: "Demir Hukuk", created_at: null, is_active: true, suspended_at: null, active_user_count: 2,
    admins: [], lawyers: [{ id: LAWYER, full_name: "Ayşe Avukat", email: "a@buro.test", role: "lawyer", status: "active", invited_at: null }],
  }]);
});

describe("FirmAuditEventsPanel", () => {
  it("shows the firm's events with names, Turkish labels and readable details", async () => {
    api.listFirmAuditEvents.mockResolvedValue(page([
      event({ details: { counts: { open_days: 12 }, transitions: { outcome: ["ongoing", "won"] } } }),
      event({ id: "e2", actor_user_id: STRANGER, actor_role: "admin", action: "document.uploaded",
        details: { counts: { size_kb: 40 }, flags: { file_kind: "pdf", text_extracted: "yes" } } }),
    ], { total: 2, by_action: { "case.closed": 1, "document.uploaded": 1 } }));
    render(<FirmAuditEventsPanel firmId="f1" />);

    const rows = await screen.findAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(api.listFirmAuditEvents).toHaveBeenCalledWith("f1", expect.objectContaining({ limit: AUDIT_PAGE_SIZE, offset: 0 }));
    await waitFor(() => expect(rows[1]).toHaveTextContent("Ayşe Avukat"));
    expect(rows[1]).toHaveTextContent("Dava kapatıldı");
    expect(rows[1]).toHaveTextContent("Kira · 4b458a0d");
    expect(rows[1]).toHaveTextContent("Sonuç: Devam ediyor → Kazanıldı · 12 gün açık kaldı");
    expect(rows[2]).toHaveTextContent("Yönetici · 77777777");
    expect(rows[2]).toHaveTextContent("Belge yüklendi");
    expect(rows[2]).toHaveTextContent("40 KB · PDF · metin okundu");
    expect(screen.getByText("Toplam hareket").parentElement).toHaveTextContent("2");
  });

  it("filters by date and action, and by clicking a user or a case", async () => {
    const user = userEvent.setup();
    api.listFirmAuditEvents.mockResolvedValue(page([event({})]));
    render(<FirmAuditEventsPanel firmId="f1" />);
    await screen.findAllByRole("row");

    await user.selectOptions(screen.getByLabelText("İşlem"), "case.closed");
    await user.clear(screen.getByLabelText("Başlangıç"));
    await user.type(screen.getByLabelText("Başlangıç"), "2026-11-01");
    await user.click(screen.getByRole("button", { name: "Uygula" }));
    await waitFor(() => expect(api.listFirmAuditEvents).toHaveBeenLastCalledWith("f1",
      expect.objectContaining({ action: "case.closed", from: "2026-11-01", offset: 0 })));

    await user.click(await screen.findByRole("button", { name: "Ayşe Avukat" }));
    await waitFor(() => expect(api.listFirmAuditEvents).toHaveBeenLastCalledWith("f1",
      expect.objectContaining({ actorUserId: LAWYER })));
    await user.click(screen.getByRole("button", { name: "Kira · 4b458a0d" }));
    await waitFor(() => expect(api.listFirmAuditEvents).toHaveBeenLastCalledWith("f1",
      expect.objectContaining({ actorUserId: LAWYER, caseId: CASE })));

    await user.click(screen.getByRole("button", { name: "Kullanıcı: Ayşe Avukat ×" }));
    await waitFor(() => expect(api.listFirmAuditEvents).toHaveBeenLastCalledWith("f1",
      expect.objectContaining({ actorUserId: undefined, caseId: CASE })));
  });

  it("pages through the results", async () => {
    const user = userEvent.setup();
    api.listFirmAuditEvents.mockResolvedValue(page([event({})], { total: 120 }));
    render(<FirmAuditEventsPanel firmId="f1" />);
    expect(await screen.findByText(`1–${AUDIT_PAGE_SIZE} / 120`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Önceki" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Sonraki" }));
    await waitFor(() => expect(api.listFirmAuditEvents).toHaveBeenLastCalledWith("f1",
      expect.objectContaining({ offset: AUDIT_PAGE_SIZE })));
  });

  it("filters by an action from the summary cards", async () => {
    const user = userEvent.setup();
    api.listFirmAuditEvents.mockResolvedValue(page([event({})], { by_action: { "ai.chat_message": 9, "case.closed": 1 } }));
    render(<FirmAuditEventsPanel firmId="f1" />);
    await user.click(await screen.findByRole("button", { name: "CaseBridge AI mesajı: 9 hareket, filtrele" }));
    await waitFor(() => expect(api.listFirmAuditEvents).toHaveBeenLastCalledWith("f1",
      expect.objectContaining({ action: "ai.chat_message" })));
    expect(screen.getByLabelText("İşlem")).toHaveValue("ai.chat_message");
  });

  it("shows an empty state and the server's error message", async () => {
    api.listFirmAuditEvents.mockResolvedValueOnce(page([], { by_action: {} }));
    const { unmount } = render(<FirmAuditEventsPanel firmId="f1" />);
    expect(await screen.findByText("Bu aralıkta ve filtrelerde hareket yok.")).toBeInTheDocument();
    unmount();

    api.listFirmAuditEvents.mockRejectedValueOnce(new ApiError("Başlangıç tarihi bitiş tarihinden sonra olamaz.", 422));
    render(<FirmAuditEventsPanel firmId="f1" />);
    expect(within(await screen.findByRole("alert")).getByText("Başlangıç tarihi bitiş tarihinden sonra olamaz.")).toBeInTheDocument();
  });
});
