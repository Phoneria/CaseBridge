import { describe, expect, it } from "vitest";

import {
  activeSession,
  analysisStartHref,
  bestScore,
  courtroomSessionHref,
  isAnalysisInProgress,
  latestCompletedAnalysis,
  latestSession,
  mergeRecentAiActivity,
  AI_ROUTES,
} from "@/lib/ai";
import type { CourtroomSessionSummary, SimulationWithCase } from "@/types";

const result = {
  summary: "Özet",
  strong_points: [],
  weak_points: [],
  opposing_arguments: [],
  missing_information: [],
  possible_scenarios: [],
  questions: [],
  recommended_actions: [],
  assessment: { score: 72, confidence: "medium" },
  ai_disclaimer: "Bu bir yapay zeka tahminidir.",
  requires_verification: false,
};

function sim(overrides: Partial<SimulationWithCase>): SimulationWithCase {
  return {
    id: "s",
    case_id: "c1",
    case_name: "Kira Davası",
    case_number: "2026/1",
    status: "completed",
    error_message: null,
    started_at: "2026-09-01T10:00:00",
    completed_at: "2026-09-01T10:05:00",
    result,
    current_stage: null,
    failure_category: null,
    ...overrides,
  } as SimulationWithCase;
}

function session(overrides: Partial<CourtroomSessionSummary>): CourtroomSessionSummary {
  return {
    id: "o",
    scenario_id: "sc",
    scenario_title: "Kira Uyarlama",
    chosen_role: "plaintiff",
    status: "completed",
    phase: "verdict",
    current_actor: "system",
    round_number: 6,
    max_rounds: 6,
    total_score: 70,
    created_at: "2026-09-01T09:00:00",
    updated_at: "2026-09-01T09:30:00",
    ...overrides,
  };
}

describe("analyses", () => {
  it("picks the newest completed analysis with a result", () => {
    const sims = [
      sim({ id: "old", completed_at: "2026-08-01T10:00:00" }),
      sim({ id: "new", completed_at: "2026-09-10T10:00:00" }),
      sim({ id: "running", status: "running", completed_at: null, result: null, started_at: "2026-09-20T10:00:00" }),
      sim({ id: "failed", status: "failed", result: null, completed_at: "2026-09-21T10:00:00" }),
    ];
    expect(latestCompletedAnalysis(sims)?.id).toBe("new");
    expect(latestCompletedAnalysis([])).toBeNull();
  });

  it("detects an analysis in progress", () => {
    expect(isAnalysisInProgress([sim({ status: "pending" })])).toBe(true);
    expect(isAnalysisInProgress([sim({ status: "running" })])).toBe(true);
    expect(isAnalysisInProgress([sim({}), sim({ status: "failed" })])).toBe(false);
  });
});

describe("sessions", () => {
  const sessions = [
    session({ id: "a", status: "completed", total_score: 64, updated_at: "2026-09-01T09:00:00" }),
    session({ id: "b", status: "active", total_score: null, updated_at: "2026-09-05T09:00:00" }),
    session({ id: "c", status: "completed", total_score: 81, updated_at: "2026-09-03T09:00:00" }),
  ];

  it("finds the active, latest and best sessions", () => {
    expect(activeSession(sessions)?.id).toBe("b");
    expect(latestSession(sessions)?.id).toBe("b");
    expect(bestScore(sessions)).toBe(81);
    expect(activeSession([])).toBeNull();
    expect(bestScore([session({ total_score: null })])).toBeNull();
  });
});

describe("links and activity", () => {
  it("builds AI links", () => {
    expect(courtroomSessionHref("o1")).toBe("/ai/durusma/oturum/o1");
    expect(analysisStartHref()).toBe("/ai/analiz");
    expect(analysisStartHref("c9")).toBe("/ai/analiz?dava=c9");
    expect(AI_ROUTES.chat).toBe("/ai/sohbet");
  });

  it("merges analyses and sessions newest first and applies the limit", () => {
    const items = mergeRecentAiActivity(
      [sim({ id: "s1", completed_at: "2026-09-02T10:00:00" }), sim({ id: "s2", status: "running", result: null, completed_at: null, started_at: "2026-09-04T10:00:00" })],
      [session({ id: "o1", updated_at: "2026-09-03T10:00:00" })],
      2,
    );
    expect(items.map((item) => item.id)).toEqual(["s2", "o1"]);
    expect(items[0]).toMatchObject({ kind: "analysis", title: "Kira Davası", href: "/davalar/c1?sekme=ai" });
    expect(items[0].subtitle).toBe("Dosya analizi · Çalışıyor");
    expect(items[1]).toMatchObject({ kind: "session", title: "Kira Uyarlama", href: "/ai/durusma/oturum/o1" });
    expect(items[1].subtitle).toBe("Canlı duruşma · Davacı vekili · Tamamlandı · 70/100");
  });

  it("shows the score on completed analyses", () => {
    const [item] = mergeRecentAiActivity([sim({ id: "s1" })], [], 5);
    expect(item.subtitle).toBe("Dosya analizi · %72");
  });
});
