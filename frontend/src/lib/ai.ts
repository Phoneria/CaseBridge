/** Pure helpers, labels and routes for the CaseBridge AI area. */
import { buildHref, caseDetailHref } from "@/lib/filters";
import { SIMULATION_STATUS_LABELS } from "@/lib/labels";
import type { CourtroomRole, CourtroomSessionSummary, CourtroomStatus, Simulation, SimulationWithCase } from "@/types";

export const AI_ROUTES = {
  hub: "/ai",
  analysis: "/ai/analiz",
  courtroom: "/ai/durusma",
} as const;

export const AI_PERSPECTIVES = ["Hakim", "Davacı vekili", "Davalı vekili", "Araştırmacı"] as const;

export const CONFIDENCE_LABELS: Record<string, string> = {
  low: "Düşük güven",
  medium: "Orta güven",
  high: "Yüksek güven",
};

export const COURTROOM_STATUS_LABELS: Record<CourtroomStatus, string> = {
  active: "Devam ediyor",
  completed: "Tamamlandı",
  failed: "Yanıt bekliyor",
  abandoned: "Terk edildi",
};

export const COURTROOM_ROLE_LABELS: Record<CourtroomRole, string> = {
  plaintiff: "Davacı vekili",
  defendant: "Davalı vekili",
};

export function courtroomSessionHref(sessionId: string): string {
  return `${AI_ROUTES.courtroom}/oturum/${sessionId}`;
}

export function analysisStartHref(caseId?: string): string {
  return buildHref(AI_ROUTES.analysis, { dava: caseId });
}

/** The date an analysis is "about": completion if finished, otherwise start. */
export function analysisDate(sim: Simulation): string {
  return sim.completed_at ?? sim.started_at;
}

export function latestCompletedAnalysis<T extends Simulation>(sims: T[]): T | null {
  let latest: T | null = null;
  for (const sim of sims) {
    if (sim.status !== "completed" || !sim.result) continue;
    if (!latest || analysisDate(sim) > analysisDate(latest)) latest = sim;
  }
  return latest;
}

export function isAnalysisInProgress(sims: Simulation[]): boolean {
  return sims.some((sim) => sim.status === "pending" || sim.status === "running");
}

function newestBy<T>(items: T[], date: (item: T) => string): T | null {
  let newest: T | null = null;
  for (const item of items) {
    if (!newest || date(item) > date(newest)) newest = item;
  }
  return newest;
}

export function activeSession(sessions: CourtroomSessionSummary[]): CourtroomSessionSummary | null {
  return newestBy(
    sessions.filter((session) => session.status === "active"),
    (session) => session.updated_at,
  );
}

export function latestSession(sessions: CourtroomSessionSummary[]): CourtroomSessionSummary | null {
  return newestBy(sessions, (session) => session.updated_at);
}

export function bestScore(sessions: CourtroomSessionSummary[]): number | null {
  const scores = sessions.map((session) => session.total_score).filter((score): score is number => score !== null);
  return scores.length > 0 ? Math.max(...scores) : null;
}

export interface AiActivityItem {
  kind: "analysis" | "session";
  id: string;
  title: string;
  subtitle: string;
  date: string;
  href: string;
}

export function mergeRecentAiActivity(
  sims: SimulationWithCase[],
  sessions: CourtroomSessionSummary[],
  limit: number,
): AiActivityItem[] {
  const analyses: AiActivityItem[] = sims.map((sim) => ({
    kind: "analysis",
    id: sim.id,
    title: sim.case_name,
    subtitle:
      sim.status === "completed" && sim.result
        ? `Dosya analizi · %${sim.result.assessment.score}`
        : `Dosya analizi · ${SIMULATION_STATUS_LABELS[sim.status] ?? sim.status}`,
    date: analysisDate(sim),
    href: caseDetailHref(sim.case_id, "ai"),
  }));

  const courtroom: AiActivityItem[] = sessions.map((session) => {
    const parts = ["Canlı duruşma", COURTROOM_ROLE_LABELS[session.chosen_role], COURTROOM_STATUS_LABELS[session.status]];
    if (session.total_score !== null) parts.push(`${session.total_score}/100`);
    return {
      kind: "session",
      id: session.id,
      title: session.scenario_title,
      subtitle: parts.join(" · "),
      date: session.updated_at,
      href: courtroomSessionHref(session.id),
    };
  });

  return [...analyses, ...courtroom].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, limit);
}
