import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mgmt = { profile: vi.fn(), support: vi.fn() };

vi.mock("@/lib/management", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/management")>();
  return { ...actual, mgmt: { ...actual.mgmt, profile: (...a: unknown[]) => mgmt.profile(...a), support: (...a: unknown[]) => mgmt.support(...a) } };
});
vi.mock("@/components/platform/FirmAuditEventsPanel", () => ({
  FirmAuditEventsPanel: ({ firmId }: { firmId: string }) => <p>Hareket paneli {firmId}</p>,
}));

import { FirmProfileView } from "@/components/platform/FirmProfileView";

beforeEach(() => {
  mgmt.profile.mockResolvedValue({
    id: "f1", name: "Demir Hukuk", is_active: true, version: 1, profile: {},
    usage: { active_users: 2, pending_invites: 0, case_count: 3, document_count: 1, storage_bytes: 0, missing_files: 0,
      failed_jobs_30d: 0, pending_jobs: 0, failed_reminders: 0, active_7d: 1, active_30d: 2 },
    onboarding: [], ai: { configured: false, pending: false },
  });
  mgmt.support.mockResolvedValue([]);
});

describe("FirmProfileView", () => {
  it("opens the firm's audit events from the Hareket kayıtları tab", async () => {
    const user = userEvent.setup();
    render(<FirmProfileView id="f1" />);
    await user.click(await screen.findByRole("button", { name: "Hareket kayıtları" }));
    expect(screen.getByText("Hareket paneli f1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hareket kayıtları" })).toHaveAttribute("aria-current", "page");
  });
});
