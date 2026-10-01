import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";

const listCourtroomScenarios = vi.fn();
const listCourtroomSessions = vi.fn();
const createCourtroomSession = vi.fn();

vi.mock("@/lib/api", () => ({
  listCourtroomScenarios: (...args: unknown[]) => listCourtroomScenarios(...args),
  listCourtroomSessions: (...args: unknown[]) => listCourtroomSessions(...args),
  createCourtroomSession: (...args: unknown[]) => createCourtroomSession(...args),
}));

import { CourtroomLobbyView } from "@/components/ai/CourtroomLobbyView";

const scenario = {
  id: "sc1",
  slug: "kira",
  title: "Ticari Kira Uyarlama",
  summary: "Kira bedelinin uyarlanması talebi.",
  category: "Kira",
  plaintiff_name: "A Ltd.",
  defendant_name: "B A.Ş.",
  difficulty: "intermediate",
  estimated_rounds: 6,
  learning_objectives: ["Uyarlama şartları"],
  public_facts: [],
  disputed_issues: ["Öngörülemezlik"],
  legal_context: [],
};

function session(id: string, status: string, updated_at: string, total_score: number | null) {
  return {
    id,
    scenario_id: "sc1",
    scenario_title: `Oturum ${id}`,
    chosen_role: "plaintiff",
    status,
    phase: status === "active" ? "evidence" : "verdict",
    current_actor: "user",
    round_number: 3,
    max_rounds: 6,
    total_score,
    created_at: updated_at,
    updated_at,
  };
}

beforeEach(() => {
  resetNav();
  setUrl("/ai/durusma");
  listCourtroomScenarios.mockReset().mockResolvedValue([scenario]);
  listCourtroomSessions.mockReset().mockResolvedValue([]);
  createCourtroomSession.mockReset();
});

describe("CourtroomLobbyView", () => {
  it("shows the hero with session stats", async () => {
    listCourtroomSessions.mockResolvedValue([session("a", "completed", "2026-09-01", 64), session("b", "completed", "2026-09-02", 81)]);
    render(<CourtroomLobbyView />);

    expect(await screen.findByRole("heading", { level: 1, name: "Canlı Duruşma" })).toBeInTheDocument();
    expect(screen.getByText("Oturum")).toBeInTheDocument();
    expect(screen.getByText("81")).toBeInTheDocument();
  });

  it("lists active sessions first as links with a continue cue", async () => {
    listCourtroomSessions.mockResolvedValue([
      session("done", "completed", "2026-09-05", 70),
      session("live", "active", "2026-09-01", null),
    ]);
    render(<CourtroomLobbyView />);

    const list = await screen.findByRole("list", { name: "Oturumlarım" });
    const links = within(list).getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/ai/durusma/oturum/live");
    expect(links[0]).toHaveTextContent("Devam et");
    expect(links[1]).toHaveAttribute("href", "/ai/durusma/oturum/done");
  });

  it("creates a session from a scenario and opens it", async () => {
    createCourtroomSession.mockResolvedValue({ id: "new1" });
    render(<CourtroomLobbyView />);

    await userEvent.click(await screen.findByRole("button", { name: "Davacı ol" }));

    expect(createCourtroomSession).toHaveBeenCalledWith("sc1", "plaintiff");
    expect(nav.push).toHaveBeenCalledWith("/ai/durusma/oturum/new1");
  });

  it("shows an empty state without scenarios", async () => {
    listCourtroomScenarios.mockResolvedValue([]);
    render(<CourtroomLobbyView />);
    expect(await screen.findByText("Henüz duruşma senaryosu yok.")).toBeInTheDocument();
  });

  it("shows an error when loading fails", async () => {
    listCourtroomScenarios.mockRejectedValue(new Error("boom"));
    render(<CourtroomLobbyView />);
    expect(await screen.findByText(/canlı duruşma verileri yüklenemedi/i)).toBeInTheDocument();
  });
});
