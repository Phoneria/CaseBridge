# CaseBridge AI Alanı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the AI features (Dosya Analizi + Canlı Duruşma) into a distinct "CaseBridge AI" area with its own routes, sidebar block, visual identity and entry points across the app.

**Architecture:** A small AI design system (`components/ai/AiMark|AiBadge|AiCard|AiHero|AiModelStatus`) plus pure helpers in `lib/ai.ts` are built first. The current `SimulationsView` is split into `CourtroomLobbyView` (`/ai/durusma`) and `AnalysisView` (`/ai/analiz`), with a new hub at `/ai`. Old `/simulasyonlar` URLs redirect. Dashboard, case detail and the quick-view drawer get AI entry points that fetch their own AI data so AI failures never break the host screen. Frontend only.

**Tech Stack:** Next.js 14.2 App Router, React 18, TypeScript, Tailwind 3.4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-casebridge-ai-area-design.md`

## Global Constraints

- Branch: `feature/casebridge-ai` (based on `feature/clickable-drilldown`). One commit per task.
- No backend changes. No new npm dependencies. No new colors: use existing `navy-*`, `accent-*`, `surface-*` tokens.
- All user-facing copy is Turkish.
- Product name is exactly **"CaseBridge AI"**; sub-products are exactly **"Dosya Analizi"** and **"Canlı Duruşma"**.
- Routes: `/ai`, `/ai/analiz`, `/ai/durusma`, `/ai/durusma/oturum/[id]`. Redirects (permanent): `/simulasyonlar` → `/ai`, `/simulasyonlar/oturum/:id` → `/ai/durusma/oturum/:id`.
- Case detail tab slug is `ai` (label "CaseBridge AI"); `?sekme=simulasyonlar` must still open it.
- `/ai/analiz?dava=<caseId>` preselects a case.
- The ✦ mark (`AiMark`), `AiCard` and `AiBadge` are used only on AI-produced content or elements that start AI work.
- The ✦ mark is an `aria-hidden` SVG; accessible names come from adjacent text (e.g. the tab's accessible name is "CaseBridge AI").
- AI data on Dashboard and in the quick-view drawer is fetched independently; an AI fetch failure shows only inside the AI element and never breaks the rest of the screen.
- AI output keeps the "AI tahmini" disclaimer.
- Animations respect `prefers-reduced-motion` (`motion-reduce:animate-none`).
- Every link is a real `<Link>`; case detail links are built with `caseDetailHref` from `@/lib/filters`.

**Environment:** frontend deps installed; run from `frontend/`: focused `npx vitest run <path>`, full `npx vitest run`, `npx tsc --noEmit`. Component tests that render something using `next/navigation` hooks mock it with:

```ts
vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";
```

(`nav.push`/`nav.replace` are recorded `vi.fn()`s; the mock URL is static and set with `setUrl`.)

---

## File Map

| File | Responsibility |
|---|---|
| `src/lib/ai.ts` (new) | Pure AI helpers, labels, routes |
| `src/components/ai/AiMark.tsx`, `AiBadge.tsx`, `AiCard.tsx`, `AiHero.tsx`, `AiModelStatus.tsx` (new) | AI visual system |
| `src/components/ai/CaseAiSummaryCard.tsx` (new) | Case detail "Genel Bakış" AI card |
| `src/components/ai/ScenarioCard.tsx`, `CourtroomLobbyView.tsx` (new) | `/ai/durusma` |
| `src/components/ai/CaseSearchSelect.tsx`, `AnalysisView.tsx` (new) | `/ai/analiz` |
| `src/components/ai/AiHubView.tsx` (new) | `/ai` |
| `src/components/ai/DashboardAiCard.tsx` (new) | Dashboard card |
| `src/components/ai/QuickViewAiRow.tsx` (new) | Quick-view AI row |
| `src/app/ai/**` (new) | Routes |
| `src/app/simulasyonlar/**`, `src/components/SimulationsView.tsx` + test (deleted) | replaced |
| `Sidebar.tsx`, `DashboardView.tsx`, `CaseDetailView.tsx`, `CaseQuickView.tsx`, `CourtroomSessionView.tsx`, `SimulationResultCard.tsx`, `lib/filters.ts`, `next.config.mjs`, `tailwind.config.ts` | modified |

---

### Task 1: AI foundations — helpers, visual system, `ai` tab slug

**Files:**
- Create: `frontend/src/lib/ai.ts`, `frontend/src/components/ai/AiMark.tsx`, `AiBadge.tsx`, `AiCard.tsx`, `AiHero.tsx`, `AiModelStatus.tsx`
- Modify: `frontend/tailwind.config.ts`, `frontend/src/lib/filters.ts`, `frontend/src/components/SimulationResultCard.tsx`, `frontend/src/components/CaseDetailView.tsx` (TABS slug only), `frontend/src/components/CaseQuickView.tsx` (SHORTCUTS slug only)
- Test: `frontend/src/lib/__tests__/ai.test.ts` (new), `frontend/src/components/__tests__/AiDesignSystem.test.tsx` (new), `frontend/src/lib/__tests__/filters.test.ts` (append)

**Interfaces:**
- Produces (used by every later task):
  - `@/lib/ai`: `AI_ROUTES = { hub: "/ai", analysis: "/ai/analiz", courtroom: "/ai/durusma" }`, `AI_PERSPECTIVES` (readonly `["Hakim","Davacı vekili","Davalı vekili","Araştırmacı"]`), `CONFIDENCE_LABELS: Record<string,string>`, `COURTROOM_STATUS_LABELS: Record<CourtroomStatus,string>`, `COURTROOM_ROLE_LABELS: Record<CourtroomRole,string>`, `courtroomSessionHref(id: string): string`, `analysisStartHref(caseId?: string): string`, `analysisDate(sim: Simulation): string`, `latestCompletedAnalysis<T extends Simulation>(sims: T[]): T | null`, `isAnalysisInProgress(sims: Simulation[]): boolean`, `activeSession(s: CourtroomSessionSummary[]): CourtroomSessionSummary | null`, `latestSession(...)`, `bestScore(s): number | null`, `AiActivityItem`, `mergeRecentAiActivity(sims: SimulationWithCase[], sessions: CourtroomSessionSummary[], limit: number): AiActivityItem[]`.
  - Components: `AiMark({ className?, withLabel? })`, `AiBadge()`, `AiCard({ children, disclaimer?, className?, id? })`, `AiHero({ eyebrow?, title, description?, actions?, stats?, compact?, children? })` with `AiHeroStat = { label: string; value: string | number }`, `AiModelStatus({ status: AIStatus | null, variant: "dark" | "light" })`.
  - `@/lib/filters`: `CASE_TAB_SLUGS` contains `"ai"` instead of `"simulasyonlar"`; `parseCaseTab("simulasyonlar") === "ai"`.

- [ ] **Step 1: Write the failing helper tests** — `frontend/src/lib/__tests__/ai.test.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing design-system tests** — `frontend/src/components/__tests__/AiDesignSystem.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { AiBadge } from "@/components/ai/AiBadge";
import { AiCard } from "@/components/ai/AiCard";
import { AiHero } from "@/components/ai/AiHero";
import { AiMark } from "@/components/ai/AiMark";
import { AiModelStatus } from "@/components/ai/AiModelStatus";

describe("AI design system", () => {
  it("renders the mark as decorative and the label as text", () => {
    const { container } = render(<AiMark withLabel />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("CaseBridge AI")).toBeInTheDocument();
  });

  it("renders the badge with an accessible AI label", () => {
    render(<AiBadge />);
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("renders card content and an optional disclaimer", () => {
    render(<AiCard disclaimer="AI tahminidir.">İçerik</AiCard>);
    expect(screen.getByText("İçerik")).toBeInTheDocument();
    expect(screen.getByText("AI tahminidir.")).toBeInTheDocument();
  });

  it("renders the hero title, eyebrow, stats and actions", () => {
    render(
      <AiHero
        title="CaseBridge AI"
        description="Açıklama"
        stats={[{ label: "Tamamlanan analiz", value: 4 }]}
        actions={<button type="button">Başlat</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "CaseBridge AI" })).toBeInTheDocument();
    expect(screen.getByText("Tamamlanan analiz")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Başlat" })).toBeInTheDocument();
  });

  it("shows model readiness or a settings warning", () => {
    const { rerender } = render(<AiModelStatus status={{ provider: "ollama", configured: true, error: null }} variant="dark" />);
    expect(screen.getByText("Model: ollama · Hazır")).toBeInTheDocument();

    rerender(<AiModelStatus status={{ provider: "ollama", configured: false, error: "x" }} variant="light" />);
    expect(screen.getByText(/AI modeli yapılandırılmamış/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ayarlar" })).toHaveAttribute("href", "/ayarlar");

    rerender(<AiModelStatus status={null} variant="light" />);
    expect(screen.queryByText(/Model:/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Append the failing tab-slug test** — inside `describe("calendar, tabs and dates", ...)` in `frontend/src/lib/__tests__/filters.test.ts`:

```ts
  it("uses the ai tab slug and accepts the legacy simulasyonlar slug", () => {
    expect(parseCaseTab("ai")).toBe("ai");
    expect(parseCaseTab("simulasyonlar")).toBe("ai");
    expect(caseDetailHref("c1", "ai")).toBe("/davalar/c1?sekme=ai");
  });
```

- [ ] **Step 4: Run to verify they fail**

Run: `cd frontend && npx vitest run src/lib/__tests__/ai.test.ts src/components/__tests__/AiDesignSystem.test.tsx src/lib/__tests__/filters.test.ts`
Expected: FAIL — modules `@/lib/ai` and `@/components/ai/*` not found; `parseCaseTab("simulasyonlar")` returns `"simulasyonlar"`.

- [ ] **Step 5: Change the tab slug** — in `frontend/src/lib/filters.ts` replace the case-detail-tabs block with:

```ts
export const CASE_TAB_SLUGS = ["genel", "belgeler", "gelismeler", "gorevler", "ai", "devir", "notlar"] as const;
export type CaseTabSlug = (typeof CASE_TAB_SLUGS)[number];

/** Legacy slugs that still open a tab after a rename. */
const CASE_TAB_ALIASES: Record<string, CaseTabSlug> = { simulasyonlar: "ai" };

export function parseCaseTab(value: string | null): CaseTabSlug {
  if (value !== null && Object.prototype.hasOwnProperty.call(CASE_TAB_ALIASES, value)) return CASE_TAB_ALIASES[value];
  return pick(value, CASE_TAB_SLUGS) ?? "genel";
}
```

(Keep `caseDetailHref` unchanged.) Then keep the code compiling:
- `frontend/src/components/CaseDetailView.tsx`: in `TABS`, change `{ slug: "simulasyonlar", label: "Simülasyonlar" }` to `{ slug: "ai", label: "Simülasyonlar" }` (the label changes in Task 2).
- `frontend/src/components/CaseQuickView.tsx`: in `SHORTCUTS`, change `["simulasyonlar", "Simülasyonlar"]` to `["ai", "Simülasyonlar"]` (the label changes in Task 2).

- [ ] **Step 6: Add Tailwind tokens** — in `frontend/tailwind.config.ts`, inside `theme.extend` after `boxShadow`, add:

```ts
      backgroundImage: {
        "ai-glow":
          "radial-gradient(600px circle at 85% -10%, rgba(109, 67, 245, 0.45), transparent 60%), radial-gradient(500px circle at -5% 110%, rgba(90, 47, 219, 0.35), transparent 55%)",
        "ai-border": "linear-gradient(135deg, #8b6bff 0%, #5a2fdb 45%, #152238 100%)",
      },
      keyframes: {
        "ai-glow": {
          "0%, 100%": { opacity: "0.8" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "ai-glow": "ai-glow 8s ease-in-out infinite",
      },
```

- [ ] **Step 7: Create `frontend/src/lib/ai.ts`**

```ts
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
```

- [ ] **Step 8: Create the visual system components**

`frontend/src/components/ai/AiMark.tsx`:

```tsx
/** The ✦ CaseBridge AI mark. Decorative: meaning comes from adjacent text. */
export function AiMark({ className = "h-4 w-4 text-accent-500", withLabel = false }: { className?: string; withLabel?: boolean }) {
  const icon = (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2c.7 5 2.9 7.3 8 8-5.1.7-7.3 3-8 8-.7-5-2.9-7.3-8-8 5.1-.7 7.3-3 8-8Z" />
      <path d="M19 15c.3 1.9 1.1 2.7 3 3-1.9.3-2.7 1.1-3 3-.3-1.9-1.1-2.7-3-3 1.9-.3 2.7-1.1 3-3Z" opacity="0.7" />
    </svg>
  );
  if (!withLabel) return icon;
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <span>CaseBridge AI</span>
    </span>
  );
}
```

`frontend/src/components/ai/AiBadge.tsx`:

```tsx
import { AiMark } from "@/components/ai/AiMark";

export function AiBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700 ring-1 ring-accent-200">
      <AiMark className="h-3 w-3 text-accent-500" />
      AI
    </span>
  );
}
```

`frontend/src/components/ai/AiCard.tsx`:

```tsx
import type { ReactNode } from "react";

/** White card with a violet→navy gradient frame; used for AI-produced or AI-starting content only. */
export function AiCard({
  children,
  disclaimer,
  className = "",
  id,
}: {
  children: ReactNode;
  disclaimer?: string;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={`rounded-2xl bg-ai-border p-px shadow-card ${className}`}>
      <div className="flex h-full flex-col rounded-[calc(1.25rem-1px)] bg-white p-5">
        {children}
        {disclaimer && <p className="mt-4 border-t border-surface-border pt-3 text-[11px] text-navy-500">{disclaimer}</p>}
      </div>
    </div>
  );
}
```

`frontend/src/components/ai/AiHero.tsx`:

```tsx
import type { ReactNode } from "react";

import { AiMark } from "@/components/ai/AiMark";

export interface AiHeroStat {
  label: string;
  value: string | number;
}

export function AiHero({
  eyebrow = "CaseBridge AI",
  title,
  description,
  actions,
  stats,
  compact = false,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  stats?: AiHeroStat[];
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className={`relative overflow-hidden rounded-3xl bg-navy-950 text-white ${compact ? "px-6 py-6" : "px-6 py-8 sm:px-8 sm:py-10"}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 animate-ai-glow bg-ai-glow motion-reduce:animate-none" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent-200">
            <AiMark className="h-3.5 w-3.5 text-accent-300" />
            {eyebrow}
          </p>
          <h1 className={`mt-2 font-semibold tracking-tight ${compact ? "text-2xl" : "text-3xl sm:text-4xl"}`}>{title}</h1>
          {description && <p className="mt-2 text-sm leading-6 text-accent-100">{description}</p>}
          {children}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {stats && stats.length > 0 && (
        <dl className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
              <dt className="text-[11px] uppercase tracking-wide text-accent-200">{stat.label}</dt>
              <dd className="mt-1 text-xl font-semibold">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
```

`frontend/src/components/ai/AiModelStatus.tsx`:

```tsx
import Link from "next/link";

import type { AIStatus } from "@/types";

export function AiModelStatus({ status, variant }: { status: AIStatus | null; variant: "dark" | "light" }) {
  if (!status) return null;

  if (status.configured) {
    return (
      <p
        className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
          variant === "dark" ? "bg-white/10 text-accent-100" : "bg-emerald-50 text-emerald-700"
        }`}
      >
        <i aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
        Model: {status.provider} · Hazır
      </p>
    );
  }

  return (
    <p
      role="status"
      className={`mt-4 inline-flex flex-wrap items-center gap-1 rounded-xl px-3 py-1.5 text-xs ${
        variant === "dark" ? "bg-amber-400/15 text-amber-200" : "bg-amber-50 text-amber-800"
      }`}
    >
      AI modeli yapılandırılmamış ·{" "}
      <Link href="/ayarlar" className="font-semibold underline underline-offset-2">
        Ayarlar
      </Link>
    </p>
  );
}
```

- [ ] **Step 9: Reuse the confidence labels** — in `frontend/src/components/SimulationResultCard.tsx` delete the local `CONFIDENCE_LABELS` constant and add `import { CONFIDENCE_LABELS } from "@/lib/ai";` at the top.

- [ ] **Step 10: Run to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/lib frontend/src/components/ai frontend/src/components/__tests__/AiDesignSystem.test.tsx frontend/src/components/SimulationResultCard.tsx frontend/src/components/CaseDetailView.tsx frontend/src/components/CaseQuickView.tsx frontend/tailwind.config.ts
git commit -m "feat(web): CaseBridge AI helpers, visual system and ai tab slug"
```

---

### Task 2: Case detail — "CaseBridge AI" tab and overview AI card

**Files:**
- Create: `frontend/src/components/ai/CaseAiSummaryCard.tsx`
- Modify: `frontend/src/components/CaseDetailView.tsx`, `frontend/src/components/CaseQuickView.tsx` (shortcut label)
- Test: `frontend/src/components/__tests__/CaseAiSummaryCard.test.tsx` (new), `frontend/src/components/__tests__/CaseDetailView.test.tsx`

**Interfaces:**
- Consumes: `AiCard`, `AiMark`, `latestCompletedAnalysis`, `isAnalysisInProgress`, `CONFIDENCE_LABELS`, `AI_PERSPECTIVES` (Task 1).
- Produces: `CaseAiSummaryCard({ simulations: Simulation[]; running: boolean; onStart: () => void; onOpenReport: () => void })`. Case detail tab accessible name "CaseBridge AI". Overview buttons "Analizi başlat" / "Yeniden analiz et" / "Raporu aç". Overview text "Son AI değerlendirmesi" when an analysis exists; "Analiz sürüyor…" while one runs.

- [ ] **Step 1: Write the failing card tests** — `frontend/src/components/__tests__/CaseAiSummaryCard.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CaseAiSummaryCard } from "@/components/ai/CaseAiSummaryCard";
import type { Simulation } from "@/types";

const completed = {
  id: "s1",
  case_id: "c1",
  status: "completed",
  error_message: null,
  started_at: "2026-09-01T10:00:00",
  completed_at: "2026-09-01T10:05:00",
  current_stage: null,
  failure_category: null,
  result: {
    summary: "Kiracı lehine güçlü deliller var.",
    strong_points: [],
    weak_points: [],
    opposing_arguments: [],
    missing_information: [],
    possible_scenarios: [],
    questions: [],
    recommended_actions: [],
    assessment: { score: 72, confidence: "high" },
    ai_disclaimer: "Bu bir yapay zeka tahminidir.",
    requires_verification: false,
  },
} as unknown as Simulation;

describe("CaseAiSummaryCard", () => {
  it("invites the first analysis when there is none", async () => {
    const onStart = vi.fn();
    render(<CaseAiSummaryCard simulations={[]} running={false} onStart={onStart} onOpenReport={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Analizi başlat" }));
    expect(onStart).toHaveBeenCalled();
  });

  it("summarises the latest analysis with its disclaimer", async () => {
    const onOpenReport = vi.fn();
    const onStart = vi.fn();
    render(<CaseAiSummaryCard simulations={[completed]} running={false} onStart={onStart} onOpenReport={onOpenReport} />);

    expect(screen.getByText("Son AI değerlendirmesi")).toBeInTheDocument();
    expect(screen.getByText("%72")).toBeInTheDocument();
    expect(screen.getByText("Yüksek güven")).toBeInTheDocument();
    expect(screen.getByText("Kiracı lehine güçlü deliller var.")).toBeInTheDocument();
    expect(screen.getByText("Bu bir yapay zeka tahminidir.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Raporu aç" }));
    expect(onOpenReport).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Yeniden analiz et" }));
    expect(onStart).toHaveBeenCalled();
  });

  it("shows progress while an analysis runs", () => {
    render(
      <CaseAiSummaryCard
        simulations={[completed, { ...completed, id: "s2", status: "running", result: null, completed_at: null }]}
        running={false}
        onStart={vi.fn()}
        onOpenReport={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Analiz sürüyor…");
    expect(screen.queryByRole("button", { name: "Yeniden analiz et" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Update the case detail tests** — in `frontend/src/components/__tests__/CaseDetailView.test.tsx`:

1. Replace the test `"renders the case overview and the Simülasyonu Başlat button by default"` with:

```tsx
  it("renders the case overview with the AI card by default", async () => {
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValue([]);

    render(<CaseDetailView caseId="c1" />);

    await waitFor(() => expect(screen.getByText("Sözleşmenin Feshi Davası")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Analizi başlat" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "CaseBridge AI" })).toBeInTheDocument();
  });
```

2. In `"starts a simulation, polls until it completes, and renders the result"`, replace the click line and the final assertion so the test reads:

```tsx
    await userEvent.click(screen.getByRole("button", { name: "Analizi başlat" }));
    expect(startSimulation).toHaveBeenCalledWith("c1");

    await waitFor(() => expect(getSimulation).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("Son AI değerlendirmesi")).toBeInTheDocument());
    expect(screen.getByText("%55")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Raporu aç" }));
    expect(screen.getByRole("tab", { name: "CaseBridge AI" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("AI Değerlendirmesi: %55")).toBeInTheDocument();
```

3. Replace every `screen.getByRole("tab", { name: "Simülasyonlar" })` with `screen.getByRole("tab", { name: "CaseBridge AI" })`.

4. Append inside the top-level `describe`:

```tsx
  it("opens the AI tab from ?sekme=ai and the legacy ?sekme=simulasyonlar", async () => {
    getCase.mockResolvedValue(caseDetail);
    listSimulations.mockResolvedValue([]);
    listDocuments.mockResolvedValue([]);

    setUrl("/davalar/c1?sekme=ai");
    const { unmount } = render(<CaseDetailView caseId="c1" />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "CaseBridge AI" })).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByText("Bu dava için henüz AI analizi yapılmadı.")).toBeInTheDocument();
    unmount();

    setUrl("/davalar/c1?sekme=simulasyonlar");
    render(<CaseDetailView caseId="c1" />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "CaseBridge AI" })).toHaveAttribute("aria-selected", "true"));
  });
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/CaseAiSummaryCard.test.tsx src/components/__tests__/CaseDetailView.test.tsx`
Expected: FAIL — module missing; tab named "Simülasyonlar"; no "Analizi başlat" button.

- [ ] **Step 4: Create `frontend/src/components/ai/CaseAiSummaryCard.tsx`**

```tsx
import { AiCard } from "@/components/ai/AiCard";
import { AiMark } from "@/components/ai/AiMark";
import { CONFIDENCE_LABELS, analysisDate, isAnalysisInProgress, latestCompletedAnalysis } from "@/lib/ai";
import { formatDate } from "@/lib/labels";
import type { Simulation } from "@/types";

const PRIMARY = "rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-60";
const SECONDARY = "rounded-xl border border-accent-200 px-4 py-2 text-sm font-semibold text-accent-700 hover:bg-accent-50 disabled:opacity-60";

export function CaseAiSummaryCard({
  simulations,
  running,
  onStart,
  onOpenReport,
}: {
  simulations: Simulation[];
  running: boolean;
  onStart: () => void;
  onOpenReport: () => void;
}) {
  const latest = latestCompletedAnalysis(simulations);
  const inProgress = running || isAnalysisInProgress(simulations);

  return (
    <AiCard disclaimer={latest && !inProgress ? latest.result?.ai_disclaimer : undefined}>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-600">
        <AiMark className="h-3.5 w-3.5 text-accent-500" />
        CaseBridge AI · Dosya Analizi
      </p>

      {inProgress ? (
        <div role="status" className="mt-4 flex items-center gap-3 text-sm text-navy-700">
          <span aria-hidden="true" className="h-2 w-24 overflow-hidden rounded-full bg-accent-100">
            <span className="block h-full w-1/2 animate-pulse rounded-full bg-accent-500 motion-reduce:animate-none" />
          </span>
          Analiz sürüyor…
        </div>
      ) : latest?.result ? (
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-navy-500">Son AI değerlendirmesi</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-accent-700">%{latest.result.assessment.score}</span>
              <span className="text-xs text-navy-500">{CONFIDENCE_LABELS[latest.result.assessment.confidence]}</span>
              <span className="text-xs text-navy-400">{formatDate(analysisDate(latest))}</span>
            </p>
            <p className="mt-2 line-clamp-2 text-sm text-navy-600">{latest.result.summary}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onOpenReport} className={PRIMARY}>
              Raporu aç
            </button>
            <button type="button" onClick={onStart} className={SECONDARY}>
              Yeniden analiz et
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-navy-600">
            Hakim, davacı vekili, davalı vekili ve araştırmacı perspektiflerinden karar destek analizi üretin.
          </p>
          <button type="button" onClick={onStart} className={`${PRIMARY} shrink-0`}>
            Analizi başlat
          </button>
        </div>
      )}
    </AiCard>
  );
}
```

- [ ] **Step 5: Wire it into `CaseDetailView.tsx`**

1. Add imports:

```tsx
import { AiMark } from "@/components/ai/AiMark";
import { CaseAiSummaryCard } from "@/components/ai/CaseAiSummaryCard";
import { AI_PERSPECTIVES } from "@/lib/ai";
```

2. In `TABS`, change `{ slug: "ai", label: "Simülasyonlar" }` to `{ slug: "ai", label: "CaseBridge AI" }`.

3. Delete the line `const latestCompletedSimulation = simulations.find((s) => s.status === "completed" && s.result);`.

4. In the `activeTab === "Genel Bakış"` block, replace everything from the dashed `<div className="flex items-center justify-between rounded-2xl border border-dashed ...">` through the closing of `{latestCompletedSimulation?.result && (...)}` with:

```tsx
          <CaseAiSummaryCard
            simulations={simulations}
            running={simulationRunning}
            onStart={handleStartSimulation}
            onOpenReport={() => selectTab(TABS.find((tab) => tab.slug === "ai")!)}
          />
          {simulationError && <ErrorState message={simulationError} />}
```

5. In the tab bar, replace the button's `className` and children so the AI tab stands out:

```tsx
            className={`px-3 py-2 text-sm font-medium ${
              activeTab === tab.label
                ? "border-b-2 border-accent-600 text-accent-700"
                : tab.slug === "ai"
                  ? "text-accent-600 hover:text-accent-800"
                  : "text-navy-500 hover:text-navy-800"
            }`}
          >
            {tab.slug === "ai" ? (
              <span className="inline-flex items-center gap-1.5">
                <AiMark className="h-3.5 w-3.5 text-accent-500" />
                {tab.label}
              </span>
            ) : (
              tab.label
            )}
```

6. Change `{activeTab === "Simülasyonlar" && (` to `{activeTab === "CaseBridge AI" && (`, and at the top of that block's `<div className="space-y-4">` insert the AI strip and error:

```tsx
          <div className="relative flex flex-col gap-3 overflow-hidden rounded-2xl bg-navy-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-ai-glow" />
            <div className="relative">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent-200">
                <AiMark className="h-3.5 w-3.5 text-accent-300" />
                CaseBridge AI · Dosya Analizi
              </p>
              <p className="mt-1 text-sm text-accent-100">{AI_PERSPECTIVES.join(" · ")}</p>
            </div>
            <button
              type="button"
              onClick={handleStartSimulation}
              disabled={simulationRunning}
              className="relative rounded-xl bg-white px-4 py-2 text-sm font-semibold text-navy-900 hover:bg-accent-50 disabled:opacity-60"
            >
              {simulationRunning
                ? "Analiz sürüyor…"
                : simulations.some((s) => s.status === "completed")
                  ? "Yeniden analiz et"
                  : "Analiz başlat"}
            </button>
          </div>
          {simulationError && <ErrorState message={simulationError} />}
```

7. In that block change the empty-state message to `"Bu dava için henüz AI analizi yapılmadı."`.

- [ ] **Step 6: Update the quick-view shortcut label** — in `frontend/src/components/CaseQuickView.tsx`:
- Change `["ai", "Simülasyonlar"]` to `["ai", "AI"]`.
- Add `import { AiMark } from "@/components/ai/AiMark";`.
- In the shortcuts `<Link>` render, replace `{label}` with:

```tsx
                  {slug === "ai" ? (
                    <span className="inline-flex items-center gap-1">
                      <AiMark className="h-3 w-3 text-accent-500" />
                      {label}
                    </span>
                  ) : (
                    label
                  )}
```

- [ ] **Step 7: Run to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ai/CaseAiSummaryCard.tsx frontend/src/components/CaseDetailView.tsx frontend/src/components/CaseQuickView.tsx frontend/src/components/__tests__/CaseAiSummaryCard.test.tsx frontend/src/components/__tests__/CaseDetailView.test.tsx
git commit -m "feat(web): CaseBridge AI tab and overview AI card on case detail"
```

---
### Task 3: Canlı Duruşma — `/ai/durusma` lobby and session route

**Files:**
- Create: `frontend/src/components/ai/ScenarioCard.tsx`, `frontend/src/components/ai/CourtroomLobbyView.tsx`, `frontend/src/app/ai/durusma/page.tsx`, `frontend/src/app/ai/durusma/oturum/[id]/page.tsx`
- Modify: `frontend/src/components/CourtroomSessionView.tsx` (header)
- Test: `frontend/src/components/__tests__/CourtroomLobbyView.test.tsx` (new)

**Interfaces:**
- Consumes: `AiHero`, `AiMark` (Task 1); `COURTROOM_STATUS_LABELS`, `COURTROOM_ROLE_LABELS`, `courtroomSessionHref`, `bestScore`, `AI_ROUTES` (Task 1); `listCourtroomScenarios`, `listCourtroomSessions`, `createCourtroomSession` from `@/lib/api`.
- Produces: `CourtroomLobbyView()`; `ScenarioCard({ scenario, busy, onStart(role) })`; routes `/ai/durusma` and `/ai/durusma/oturum/[id]`. (`SimulationsView` keeps working until Task 5 deletes it.)

- [ ] **Step 1: Write the failing tests** — `frontend/src/components/__tests__/CourtroomLobbyView.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/CourtroomLobbyView.test.tsx`
Expected: FAIL — cannot resolve `@/components/ai/CourtroomLobbyView`.

- [ ] **Step 3: Create `frontend/src/components/ai/ScenarioCard.tsx`** (moved from `SimulationsView.tsx`, unchanged behaviour)

```tsx
"use client";

import { useState } from "react";

import type { CourtroomRole, CourtroomScenario } from "@/types";

const DIFFICULTY = {
  beginner: { label: "Başlangıç", className: "bg-emerald-50 text-emerald-700" },
  intermediate: { label: "Orta", className: "bg-amber-50 text-amber-700" },
  advanced: { label: "İleri", className: "bg-rose-50 text-rose-700" },
};

export function ScenarioCard({
  scenario,
  busy,
  onStart,
}: {
  scenario: CourtroomScenario;
  busy: boolean;
  onStart: (role: CourtroomRole) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const difficulty = DIFFICULTY[scenario.difficulty];

  return (
    <article className="flex h-full flex-col rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className="rounded-full bg-accent-50 px-2.5 py-1 text-xs font-semibold text-accent-700">{scenario.category}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${difficulty.className}`}>{difficulty.label}</span>
      </div>
      <h2 className="text-base font-semibold text-navy-900">{scenario.title}</h2>
      <p className="mt-1 text-xs font-medium text-navy-600">
        {scenario.plaintiff_name} <span className="text-navy-400">/</span> {scenario.defendant_name}
      </p>
      <p className="mt-2 flex-1 text-sm leading-6 text-navy-500">{scenario.summary}</p>
      <div className="mt-4 flex items-center gap-4 border-t border-surface-border pt-4 text-xs text-navy-500">
        <span>{scenario.estimated_rounds} aşama</span>
        <button type="button" className="font-medium text-accent-700 hover:text-accent-800" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Detayı gizle" : "Davayı incele"}
        </button>
      </div>
      {expanded && (
        <div className="mt-4 space-y-3 rounded-xl bg-surface-muted p-4 text-xs leading-5 text-navy-600">
          <div>
            <p className="font-semibold text-navy-800">Tartışılacak konular</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {scenario.disputed_issues.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-navy-800">Bu çalışmada</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {scenario.learning_objectives.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onStart("plaintiff")}
          className="rounded-xl bg-accent-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
        >
          {busy ? "Hazırlanıyor…" : "Davacı ol"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onStart("defendant")}
          className="rounded-xl border border-surface-border px-3 py-2.5 text-sm font-semibold text-navy-700 hover:bg-surface-muted disabled:opacity-50"
        >
          Davalı ol
        </button>
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Create `frontend/src/components/ai/CourtroomLobbyView.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createCourtroomSession, listCourtroomScenarios, listCourtroomSessions } from "@/lib/api";
import { COURTROOM_ROLE_LABELS, COURTROOM_STATUS_LABELS, bestScore, courtroomSessionHref } from "@/lib/ai";
import { formatDate } from "@/lib/labels";
import type { CourtroomRole, CourtroomScenario, CourtroomSessionSummary } from "@/types";
import { AiHero } from "@/components/ai/AiHero";
import { ScenarioCard } from "@/components/ai/ScenarioCard";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";

function sortSessions(sessions: CourtroomSessionSummary[]): CourtroomSessionSummary[] {
  return [...sessions].sort((a, b) => {
    const activeFirst = Number(b.status === "active") - Number(a.status === "active");
    if (activeFirst !== 0) return activeFirst;
    return a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0;
  });
}

export function CourtroomLobbyView() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<CourtroomScenario[]>([]);
  const [sessions, setSessions] = useState<CourtroomSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCourtroomScenarios(), listCourtroomSessions()])
      .then(([scenarioRows, sessionRows]) => {
        if (cancelled) return;
        setScenarios(scenarioRows);
        setSessions(sessionRows);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Canlı duruşma verileri yüklenemedi. Backend ve yerel model ayarlarını kontrol edin.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function start(scenarioId: string, role: CourtroomRole) {
    setCreatingId(scenarioId);
    setStartError(null);
    try {
      const session = await createCourtroomSession(scenarioId, role);
      router.push(courtroomSessionHref(session.id));
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Oturum başlatılamadı.");
      setCreatingId(null);
    }
  }

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState message={loadError} />;

  const best = bestScore(sessions);
  const sorted = sortSessions(sessions).slice(0, 6);

  return (
    <div className="space-y-6">
      <AiHero
        compact
        title="Canlı Duruşma"
        description="Bir taraf seç, delillerini kullan ve yerel AI'ın oynadığı karşı taraf vekili ile hâkim karşısında davanı savun."
        stats={[
          { label: "Oturum", value: sessions.length },
          { label: "En yüksek puan", value: best ?? "—" },
        ]}
      />

      {startError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {startError}
        </div>
      )}

      {sorted.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy-900">Oturumlarım</h2>
            <span className="text-xs text-navy-500">{sessions.length} oturum</span>
          </div>
          <ul aria-label="Oturumlarım" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map((session) => {
              const live = session.status === "active";
              return (
                <li key={session.id}>
                  <Link
                    href={courtroomSessionHref(session.id)}
                    className={`block h-full rounded-2xl border bg-white p-4 shadow-card transition hover:border-accent-300 ${
                      live ? "border-accent-300 ring-1 ring-accent-200" : "border-surface-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-navy-900">{session.scenario_title}</p>
                      {session.total_score !== null && (
                        <span className="rounded-full bg-accent-50 px-2 py-1 text-xs font-bold text-accent-700">{session.total_score}/100</span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-navy-500">
                      {COURTROOM_ROLE_LABELS[session.chosen_role]} · {COURTROOM_STATUS_LABELS[session.status]} · {formatDate(session.updated_at)}
                    </p>
                    {live && <p className="mt-3 text-xs font-semibold text-accent-700">Devam et →</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-navy-900">Bir örnek dava seç</h2>
        {scenarios.length === 0 ? (
          <EmptyState message="Henüz duruşma senaryosu yok." hint="Backend seed komutunu çalıştırın." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {scenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                busy={creatingId === scenario.id}
                onStart={(role) => start(scenario.id, role)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Create the routes**

`frontend/src/app/ai/durusma/page.tsx`:

```tsx
import { AppShell } from "@/components/AppShell";
import { CourtroomLobbyView } from "@/components/ai/CourtroomLobbyView";

export default function CourtroomLobbyPage() {
  return (
    <AppShell>
      <CourtroomLobbyView />
    </AppShell>
  );
}
```

`frontend/src/app/ai/durusma/oturum/[id]/page.tsx`:

```tsx
import { AppShell } from "@/components/AppShell";
import { CourtroomSessionView } from "@/components/CourtroomSessionView";

export default function CourtroomSessionPage({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      <CourtroomSessionView sessionId={params.id} />
    </AppShell>
  );
}
```

- [ ] **Step 6: Update the session header** — in `frontend/src/components/CourtroomSessionView.tsx`:
- Add imports `import { AiMark } from "@/components/ai/AiMark";` and `import { AI_ROUTES } from "@/lib/ai";`.
- Replace `<Link href="/simulasyonlar" className="mt-1 rounded-lg ...">←</Link>` with:

```tsx
          <Link
            href={AI_ROUTES.courtroom}
            aria-label="Canlı Duruşma'ya dön"
            className="mt-1 rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-navy-600 hover:bg-surface-muted"
          >
            ←
          </Link>
```

- Immediately inside the returned root `<div className="space-y-5">`, before `<header ...>`, insert:

```tsx
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent-600">
        <AiMark className="h-3.5 w-3.5 text-accent-500" />
        CaseBridge AI · Canlı Duruşma
      </p>
```

- [ ] **Step 7: Run to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: all PASS (including `CourtroomSessionView.test.tsx`), no type errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ai/ScenarioCard.tsx frontend/src/components/ai/CourtroomLobbyView.tsx frontend/src/app/ai/durusma frontend/src/components/CourtroomSessionView.tsx frontend/src/components/__tests__/CourtroomLobbyView.test.tsx
git commit -m "feat(web): Canlı Duruşma lobby under /ai/durusma"
```

---

### Task 4: Dosya Analizi — `/ai/analiz` with case picker

**Files:**
- Create: `frontend/src/components/ai/CaseSearchSelect.tsx`, `frontend/src/components/ai/AnalysisView.tsx`, `frontend/src/app/ai/analiz/page.tsx`
- Test: `frontend/src/components/__tests__/AnalysisView.test.tsx` (new)

**Interfaces:**
- Consumes: `AiHero`, `AiCard`, `AiModelStatus` (Task 1); `caseDetailHref` (`@/lib/filters`); `useUrlParams`, `useQuickViewHref` (`@/lib/urlState`); `getCases`, `listAllSimulations`, `startSimulation`, `getAiStatus` (`@/lib/api`); `SimulationResultCard`; `SIMULATION_STATUS_LABELS` (`@/lib/labels`).
- Produces: `CaseSearchSelect({ cases: Case[]; value: string | null; onChange: (id: string) => void })`; `AnalysisView()`; route `/ai/analiz` (reads `?dava=`); section ids `yeni` and `raporlar`.

- [ ] **Step 1: Write the failing tests** — `frontend/src/components/__tests__/AnalysisView.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
import { nav, resetNav, setUrl } from "@/test/navigation";

const getCases = vi.fn();
const listAllSimulations = vi.fn();
const startSimulation = vi.fn();
const getAiStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  getCases: (...args: unknown[]) => getCases(...args),
  listAllSimulations: (...args: unknown[]) => listAllSimulations(...args),
  startSimulation: (...args: unknown[]) => startSimulation(...args),
  getAiStatus: (...args: unknown[]) => getAiStatus(...args),
}));

import { AnalysisView } from "@/components/ai/AnalysisView";

const cases = [
  { id: "c1", case_name: "Ticari Kira Uyarlama Davası", case_number: "2026/14", client_name: "Deniz Arslan" },
  { id: "c2", case_name: "İşçilik Alacakları Davası", case_number: "2026/15", client_name: "Ahmet Yılmaz" },
];

const completedSim = {
  id: "s1",
  case_id: "c1",
  case_name: "Ticari Kira Uyarlama Davası",
  case_number: "2026/14",
  status: "completed",
  error_message: null,
  started_at: "2026-09-01T10:00:00",
  completed_at: "2026-09-01T10:05:00",
  current_stage: null,
  failure_category: null,
  result: {
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
  },
};

beforeEach(() => {
  resetNav();
  setUrl("/ai/analiz");
  getCases.mockReset().mockResolvedValue(cases);
  listAllSimulations.mockReset().mockResolvedValue([]);
  startSimulation.mockReset();
  getAiStatus.mockReset().mockResolvedValue({ provider: "ollama", configured: true, error: null });
});

describe("AnalysisView", () => {
  it("loads only active cases and keeps the start button disabled until a case is chosen", async () => {
    render(<AnalysisView />);
    expect(await screen.findByRole("heading", { level: 1, name: "Dosya Analizi" })).toBeInTheDocument();
    expect(getCases).toHaveBeenCalledWith({ active: true });
    expect(screen.getByRole("button", { name: "Analizi başlat" })).toBeDisabled();
  });

  it("filters cases with Turkish-aware search and starts an analysis", async () => {
    startSimulation.mockResolvedValue({ id: "s9" });
    render(<AnalysisView />);

    await userEvent.type(await screen.findByLabelText("Dava ara"), "İŞÇİLİK");
    const list = screen.getByRole("list", { name: "Davalar" });
    expect(within(list).queryByText("Ticari Kira Uyarlama Davası")).not.toBeInTheDocument();
    await userEvent.click(within(list).getByRole("button", { name: /İşçilik Alacakları Davası/ }));

    await userEvent.click(screen.getByRole("button", { name: "Analizi başlat" }));
    expect(startSimulation).toHaveBeenCalledWith("c2");
    expect(nav.push).toHaveBeenCalledWith("/davalar/c2?sekme=ai");
  });

  it("preselects the case from ?dava=", async () => {
    setUrl("/ai/analiz?dava=c1");
    render(<AnalysisView />);
    expect(await screen.findByText("Seçili dava:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ticari Kira Uyarlama Davası/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Analizi başlat" })).toBeEnabled();
  });

  it("shows a start error inside the card", async () => {
    setUrl("/ai/analiz?dava=c1");
    startSimulation.mockRejectedValue(new Error("boom"));
    render(<AnalysisView />);
    await userEvent.click(await screen.findByRole("button", { name: "Analizi başlat" }));
    expect(await screen.findByText("Analiz başlatılamadı. Lütfen tekrar deneyin.")).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("warns when the AI model is not configured", async () => {
    getAiStatus.mockResolvedValue({ provider: "ollama", configured: false, error: "x" });
    render(<AnalysisView />);
    expect(await screen.findByText(/AI modeli yapılandırılmamış/)).toBeInTheDocument();
  });

  it("lists reports with preview links", async () => {
    listAllSimulations.mockResolvedValue([completedSim]);
    render(<AnalysisView />);

    const reports = await screen.findByRole("region", { name: "Raporlar" });
    expect(within(reports).getByRole("link", { name: "2026/14 - Ticari Kira Uyarlama Davası" })).toHaveAttribute("href", "/ai/analiz?onizle=c1");
    expect(within(reports).getByText("AI Değerlendirmesi: %72")).toBeInTheDocument();
  });

  it("shows an empty state without reports", async () => {
    render(<AnalysisView />);
    expect(await screen.findByText("Henüz dosya analizi yok.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/AnalysisView.test.tsx`
Expected: FAIL — cannot resolve `@/components/ai/AnalysisView`.

- [ ] **Step 3: Create `frontend/src/components/ai/CaseSearchSelect.tsx`**

```tsx
"use client";

import { useState } from "react";

import type { Case } from "@/types";

export function CaseSearchSelect({
  cases,
  value,
  onChange,
}: {
  cases: Case[];
  value: string | null;
  onChange: (caseId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase("tr-TR");
  const visible = needle
    ? cases.filter((c) =>
        [c.case_name, c.case_number, c.client_name].some((text) => text.toLocaleLowerCase("tr-TR").includes(needle)),
      )
    : cases;
  const selected = cases.find((c) => c.id === value) ?? null;

  return (
    <div className="space-y-2">
      <label htmlFor="ai-case-search" className="block text-xs font-medium text-navy-600">
        Dava ara
      </label>
      <input
        id="ai-case-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Dava adı, numarası veya müvekkil..."
        className="w-full rounded-xl border border-surface-border px-3 py-2 text-sm text-navy-800 outline-none focus:border-accent-400"
      />
      <ul aria-label="Davalar" className="max-h-64 divide-y divide-surface-border overflow-y-auto rounded-xl border border-surface-border">
        {visible.length === 0 ? (
          <li className="px-3 py-2 text-sm text-navy-500">Eşleşen dava yok.</li>
        ) : (
          visible.map((c) => {
            const active = c.id === value;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange(c.id)}
                  className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm transition ${
                    active ? "bg-accent-50 text-accent-800" : "text-navy-800 hover:bg-surface-muted"
                  }`}
                >
                  <span className="font-medium">{c.case_name}</span>
                  <span className="text-xs text-navy-500">
                    {c.case_number} · {c.client_name}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
      {selected && (
        <p className="text-xs text-navy-600">
          Seçili dava: <strong>{selected.case_name}</strong>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/src/components/ai/AnalysisView.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getAiStatus, getCases, listAllSimulations, startSimulation } from "@/lib/api";
import { caseDetailHref } from "@/lib/filters";
import { SIMULATION_STATUS_LABELS, formatDate } from "@/lib/labels";
import { useQuickViewHref, useUrlParams } from "@/lib/urlState";
import type { AIStatus, Case, SimulationWithCase } from "@/types";
import { AiCard } from "@/components/ai/AiCard";
import { AiHero } from "@/components/ai/AiHero";
import { AiModelStatus } from "@/components/ai/AiModelStatus";
import { CaseSearchSelect } from "@/components/ai/CaseSearchSelect";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { SimulationResultCard } from "@/components/SimulationResultCard";

export function AnalysisView() {
  const router = useRouter();
  const { params } = useUrlParams();
  const quickViewHref = useQuickViewHref();

  const [cases, setCases] = useState<Case[]>([]);
  const [simulations, setSimulations] = useState<SimulationWithCase[]>([]);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(() => params.get("dava"));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCases({ active: true }), listAllSimulations()])
      .then(([caseRows, simRows]) => {
        if (cancelled) return;
        setCases(caseRows);
        setSimulations(simRows);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Dosya analizi verileri yüklenemedi. Lütfen daha sonra tekrar deneyin.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    getAiStatus()
      .then((status) => {
        if (!cancelled) setAiStatus(status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function start() {
    if (!selectedCaseId) return;
    setStarting(true);
    setStartError(null);
    try {
      await startSimulation(selectedCaseId);
      router.push(caseDetailHref(selectedCaseId, "ai"));
    } catch {
      setStartError("Analiz başlatılamadı. Lütfen tekrar deneyin.");
      setStarting(false);
    }
  }

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState message={loadError} />;

  const reports = [...simulations].sort((a, b) => (a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0));

  return (
    <div className="space-y-6">
      <AiHero
        compact
        title="Dosya Analizi"
        description="Bir dava seçin; CaseBridge AI davayı hakim, davacı vekili, davalı vekili ve araştırmacı gözüyle değerlendirsin."
        stats={[{ label: "Analiz", value: simulations.length }]}
      />

      <AiCard id="yeni">
        <h2 className="text-base font-semibold text-navy-900">Yeni analiz</h2>
        {aiStatus && !aiStatus.configured && <AiModelStatus status={aiStatus} variant="light" />}
        <div className="mt-4">
          <CaseSearchSelect cases={cases} value={selectedCaseId} onChange={setSelectedCaseId} />
        </div>
        {startError && <p role="alert" className="mt-3 text-sm text-rose-700">{startError}</p>}
        <div className="mt-4">
          <button
            type="button"
            onClick={start}
            disabled={!selectedCaseId || starting}
            className="rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {starting ? "Başlatılıyor…" : "Analizi başlat"}
          </button>
        </div>
      </AiCard>

      <section id="raporlar" aria-labelledby="raporlar-baslik" className="space-y-4">
        <h2 id="raporlar-baslik" className="text-sm font-semibold text-navy-900">
          Raporlar
        </h2>
        {reports.length === 0 ? (
          <EmptyState message="Henüz dosya analizi yok." hint="Yukarıdan bir dava seçerek ilk analizi başlatın." />
        ) : (
          reports.map((sim) => (
            <div key={sim.id} className="space-y-2">
              <p className="text-xs font-medium text-navy-500">
                <Link href={quickViewHref(sim.case_id)} scroll={false} className="hover:text-accent-700 hover:underline">
                  {sim.case_number} - {sim.case_name}
                </Link>{" "}
                - {formatDate(sim.started_at)}
              </p>
              {sim.result ? (
                <SimulationResultCard result={sim.result} />
              ) : (
                <div className="rounded-2xl border border-surface-border bg-white p-4 text-sm text-navy-600 shadow-card">
                  {SIMULATION_STATUS_LABELS[sim.status] ?? sim.status}
                  {sim.error_message ? ` — ${sim.error_message}` : ""}
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Create the route** — `frontend/src/app/ai/analiz/page.tsx`:

```tsx
import { AppShell } from "@/components/AppShell";
import { AnalysisView } from "@/components/ai/AnalysisView";

export default function AnalysisPage() {
  return (
    <AppShell>
      <AnalysisView />
    </AppShell>
  );
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ai/CaseSearchSelect.tsx frontend/src/components/ai/AnalysisView.tsx frontend/src/app/ai/analiz frontend/src/components/__tests__/AnalysisView.test.tsx
git commit -m "feat(web): Dosya Analizi page with case picker under /ai/analiz"
```

---

### Task 5: `/ai` hub, sidebar AI block, redirects, remove old Simülasyonlar

**Files:**
- Create: `frontend/src/components/ai/AiHubView.tsx`, `frontend/src/app/ai/page.tsx`
- Modify: `frontend/src/components/Sidebar.tsx` (full replacement), `frontend/next.config.mjs`
- Delete: `frontend/src/app/simulasyonlar/` (whole folder), `frontend/src/components/SimulationsView.tsx`, `frontend/src/components/__tests__/SimulationsView.test.tsx`
- Test: `frontend/src/components/__tests__/AiHubView.test.tsx` (new), `frontend/src/components/__tests__/Sidebar.test.tsx` (update)

**Interfaces:**
- Consumes: Task 1 helpers/components; `listAllSimulations`, `listCourtroomSessions`, `getAiStatus`.
- Produces: `AiHubView()`; route `/ai`; sidebar links named "CaseBridge AI" (`/ai`), "Dosya Analizi" (`/ai/analiz`), "Canlı Duruşma" (`/ai/durusma`); redirects from `/simulasyonlar` paths.

- [ ] **Step 1: Write the failing hub tests** — `frontend/src/components/__tests__/AiHubView.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

const listAllSimulations = vi.fn();
const listCourtroomSessions = vi.fn();
const getAiStatus = vi.fn();

vi.mock("@/lib/api", () => ({
  listAllSimulations: (...args: unknown[]) => listAllSimulations(...args),
  listCourtroomSessions: (...args: unknown[]) => listCourtroomSessions(...args),
  getAiStatus: (...args: unknown[]) => getAiStatus(...args),
}));

import { AiHubView } from "@/components/ai/AiHubView";

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
  ai_disclaimer: "x",
  requires_verification: false,
};

const sim = {
  id: "s1",
  case_id: "c1",
  case_name: "Kira Davası",
  case_number: "2026/1",
  status: "completed",
  error_message: null,
  started_at: "2026-09-01T10:00:00",
  completed_at: "2026-09-01T10:05:00",
  current_stage: null,
  failure_category: null,
  result,
};

function session(id: string, status: string, updated_at: string, total_score: number | null) {
  return {
    id,
    scenario_id: "sc",
    scenario_title: `Senaryo ${id}`,
    chosen_role: "defendant",
    status,
    phase: "verdict",
    current_actor: "system",
    round_number: 6,
    max_rounds: 6,
    total_score,
    created_at: updated_at,
    updated_at,
  };
}

beforeEach(() => {
  listAllSimulations.mockReset().mockResolvedValue([]);
  listCourtroomSessions.mockReset().mockResolvedValue([]);
  getAiStatus.mockReset().mockResolvedValue({ provider: "ollama", configured: true, error: null });
});

describe("AiHubView", () => {
  it("shows the hero, stats and model status", async () => {
    listAllSimulations.mockResolvedValue([sim, { ...sim, id: "s2", status: "failed", result: null }]);
    listCourtroomSessions.mockResolvedValue([session("o1", "completed", "2026-09-02T10:00:00", 77)]);
    render(<AiHubView />);

    expect(await screen.findByRole("heading", { level: 1, name: "CaseBridge AI" })).toBeInTheDocument();
    expect(await screen.findByText("Model: ollama · Hazır")).toBeInTheDocument();
    const stats = screen.getByText("Tamamlanan analiz").closest("dl")!;
    await waitFor(() => expect(within(stats).getByText("Tamamlanan analiz").nextSibling).toHaveTextContent("1"));
    expect(within(stats).getByText("Duruşma oturumu").nextSibling).toHaveTextContent("1");
    expect(within(stats).getByText("Son duruşma puanı").nextSibling).toHaveTextContent("77");
  });

  it("offers both products and continues an active session", async () => {
    listCourtroomSessions.mockResolvedValue([session("live", "active", "2026-09-03T10:00:00", null)]);
    render(<AiHubView />);

    expect(await screen.findByRole("link", { name: "Analiz başlat" })).toHaveAttribute("href", "/ai/analiz");
    expect(screen.getByRole("link", { name: "Raporları gör" })).toHaveAttribute("href", "/ai/analiz#raporlar");
    expect(screen.getByRole("link", { name: "Devam et: Senaryo live" })).toHaveAttribute("href", "/ai/durusma/oturum/live");
  });

  it("offers to enter the courtroom when no session is active", async () => {
    render(<AiHubView />);
    expect(await screen.findByRole("link", { name: "Duruşmaya gir" })).toHaveAttribute("href", "/ai/durusma");
  });

  it("lists recent AI activity with links", async () => {
    listAllSimulations.mockResolvedValue([sim]);
    listCourtroomSessions.mockResolvedValue([session("o1", "completed", "2026-09-02T10:00:00", 77)]);
    render(<AiHubView />);

    const list = await screen.findByRole("list", { name: "Son AI aktivitesi" });
    const links = within(list).getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/ai/durusma/oturum/o1");
    expect(links[1]).toHaveAttribute("href", "/davalar/c1?sekme=ai");
  });

  it("shows an empty activity state and a settings warning", async () => {
    getAiStatus.mockResolvedValue({ provider: "ollama", configured: false, error: "x" });
    render(<AiHubView />);
    expect(await screen.findByText("Henüz AI aktivitesi yok.")).toBeInTheDocument();
    expect(await screen.findByText(/AI modeli yapılandırılmamış/)).toBeInTheDocument();
  });

  it("shows an error when AI data cannot be loaded", async () => {
    listAllSimulations.mockRejectedValue(new Error("boom"));
    render(<AiHubView />);
    expect(await screen.findByText(/AI verileri yüklenemedi/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Update the sidebar tests** — replace `frontend/src/components/__tests__/Sidebar.test.tsx` with:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

import { Sidebar } from "@/components/Sidebar";

beforeEach(() => {
  pathname = "/dashboard";
});

describe("Sidebar", () => {
  it("renders the main navigation without the old Simülasyonlar item", () => {
    render(<Sidebar />);
    for (const label of ["Dashboard", "Davalar", "Takvim", "Görevler", "Belgeler", "Analitik", "Raporlar", "Ayarlar"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByText("Simülasyonlar")).not.toBeInTheDocument();
  });

  it("renders the CaseBridge AI block", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "CaseBridge AI" })).toHaveAttribute("href", "/ai");
    expect(screen.getByRole("link", { name: "Dosya Analizi" })).toHaveAttribute("href", "/ai/analiz");
    expect(screen.getByRole("link", { name: "Canlı Duruşma" })).toHaveAttribute("href", "/ai/durusma");
  });

  it("marks the current route as active", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  it("marks AI routes as active, including session pages", () => {
    pathname = "/ai/durusma/oturum/x1";
    const { unmount } = render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Canlı Duruşma" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "CaseBridge AI" })).not.toHaveAttribute("aria-current");
    unmount();

    pathname = "/ai";
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "CaseBridge AI" })).toHaveAttribute("aria-current", "page");
  });

  it("renders the CaseBridge brand name", () => {
    render(<Sidebar />);
    expect(screen.getByText("CaseBridge")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/AiHubView.test.tsx src/components/__tests__/Sidebar.test.tsx`
Expected: FAIL — hub module missing; sidebar has no AI block and still shows "Simülasyonlar".

- [ ] **Step 4: Create `frontend/src/components/ai/AiHubView.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getAiStatus, listAllSimulations, listCourtroomSessions } from "@/lib/api";
import {
  AI_PERSPECTIVES,
  AI_ROUTES,
  activeSession,
  courtroomSessionHref,
  latestSession,
  mergeRecentAiActivity,
} from "@/lib/ai";
import { formatDate } from "@/lib/labels";
import type { AIStatus, CourtroomSessionSummary, SimulationWithCase } from "@/types";
import { AiCard } from "@/components/ai/AiCard";
import { AiHero } from "@/components/ai/AiHero";
import { AiMark } from "@/components/ai/AiMark";
import { AiModelStatus } from "@/components/ai/AiModelStatus";
import { ErrorState } from "@/components/ErrorState";

const PRIMARY = "rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-700";

export function AiHubView() {
  const [simulations, setSimulations] = useState<SimulationWithCase[]>([]);
  const [sessions, setSessions] = useState<CourtroomSessionSummary[]>([]);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAllSimulations(), listCourtroomSessions()])
      .then(([simRows, sessionRows]) => {
        if (cancelled) return;
        setSimulations(simRows);
        setSessions(sessionRows);
      })
      .catch(() => {
        if (!cancelled) setError("AI verileri yüklenemedi. Lütfen daha sonra tekrar deneyin.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    getAiStatus()
      .then((status) => {
        if (!cancelled) setAiStatus(status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const completedCount = simulations.filter((sim) => sim.status === "completed").length;
  const lastSession = latestSession(sessions);
  const liveSession = activeSession(sessions);
  const activity = mergeRecentAiActivity(simulations, sessions, 6);
  const pending = "…";

  return (
    <div className="space-y-6">
      <AiHero
        title="CaseBridge AI"
        description="Davalarınızı dört farklı perspektiften analiz edin, gerçekçi duruşma pratiği yapın."
        stats={[
          { label: "Tamamlanan analiz", value: loading ? pending : completedCount },
          { label: "Duruşma oturumu", value: loading ? pending : sessions.length },
          { label: "Son duruşma puanı", value: loading ? pending : lastSession?.total_score ?? "—" },
        ]}
      >
        <AiModelStatus status={aiStatus} variant="dark" />
      </AiHero>

      {error && <ErrorState message={error} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <AiCard>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-600">
            <AiMark className="h-3.5 w-3.5 text-accent-500" />
            Dosya Analizi
          </p>
          <h2 className="mt-2 text-lg font-semibold text-navy-900">Davanızı dört perspektiften değerlendirin</h2>
          <p className="mt-1 text-sm leading-6 text-navy-500">
            Güçlü ve zayıf yönler, karşı argümanlar, eksik bilgiler ve önerilen sonraki adımlar.
          </p>
          <ul aria-label="Perspektifler" className="mt-4 flex flex-wrap gap-2">
            {AI_PERSPECTIVES.map((perspective) => (
              <li key={perspective} className="rounded-full bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-700">
                {perspective}
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-wrap items-center gap-4 pt-5">
            <Link href={AI_ROUTES.analysis} className={PRIMARY}>
              Analiz başlat
            </Link>
            <Link href={`${AI_ROUTES.analysis}#raporlar`} className="text-sm font-medium text-accent-700 hover:text-accent-800">
              Raporları gör
            </Link>
          </div>
        </AiCard>

        <AiCard>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent-600">
            <AiMark className="h-3.5 w-3.5 text-accent-500" />
            Canlı Duruşma
          </p>
          <h2 className="mt-2 text-lg font-semibold text-navy-900">Hâkim karşısında pratik yapın</h2>
          <p className="mt-1 text-sm leading-6 text-navy-500">
            Yerel model karşı taraf vekilini ve hâkimi oynar. 6 aşama · 100 puanlık değerlendirme.
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-4 pt-5">
            {liveSession ? (
              <Link href={courtroomSessionHref(liveSession.id)} className={PRIMARY}>
                Devam et: {liveSession.scenario_title}
              </Link>
            ) : (
              <Link href={AI_ROUTES.courtroom} className={PRIMARY}>
                Duruşmaya gir
              </Link>
            )}
          </div>
        </AiCard>
      </div>

      <section className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
        <h2 className="mb-3 text-sm font-semibold text-navy-900">Son AI aktivitesi</h2>
        {!loading && activity.length === 0 ? (
          <p className="text-sm text-navy-500">Henüz AI aktivitesi yok.</p>
        ) : (
          <ul aria-label="Son AI aktivitesi" className="divide-y divide-surface-border">
            {activity.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link href={item.href} className="flex items-center justify-between gap-3 py-2.5 hover:text-accent-700">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-navy-800">{item.title}</span>
                    <span className="block text-xs text-navy-500">{item.subtitle}</span>
                  </span>
                  <span className="shrink-0 text-xs text-navy-400">{formatDate(item.date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Create the route** — `frontend/src/app/ai/page.tsx`:

```tsx
import { AppShell } from "@/components/AppShell";
import { AiHubView } from "@/components/ai/AiHubView";

export default function AiHubPage() {
  return (
    <AppShell>
      <AiHubView />
    </AppShell>
  );
}
```

- [ ] **Step 6: Replace `frontend/src/components/Sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AiMark } from "@/components/ai/AiMark";
import { AI_ROUTES } from "@/lib/ai";

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.75} stroke="currentColor" className="h-5 w-5">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <Icon d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
  { label: "Davalar", href: "/davalar", icon: <Icon d="M4 6h16M4 6v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /> },
  { label: "Takvim", href: "/takvim", icon: <Icon d="M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" /> },
  { label: "Görevler", href: "/gorevler", icon: <Icon d="M9 11.5 11 13.5 15.5 9M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" /> },
  { label: "Belgeler", href: "/belgeler", icon: <Icon d="M8 3h6l5 5v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v5h5" /> },
  { label: "Analitik", href: "/analitik", icon: <Icon d="M4 20V10M11 20V4M18 20v-7" /> },
  { label: "Raporlar", href: "/raporlar", icon: <Icon d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM8 12h8M8 16h5M8 8h8" /> },
];

const SETTINGS_ITEM: NavItem = {
  label: "Ayarlar",
  href: "/ayarlar",
  icon: <Icon d="M10.5 3.5h3l.5 2.3a7 7 0 0 1 1.8 1l2.2-.8 1.5 2.6-1.8 1.5a7 7 0 0 1 0 2.1l1.8 1.5-1.5 2.6-2.2-.8a7 7 0 0 1-1.8 1L13.5 20.5h-3l-.5-2.3a7 7 0 0 1-1.8-1l-2.2.8-1.5-2.6 1.8-1.5a7 7 0 0 1 0-2.1L4 10.3l1.5-2.6 2.2.8a7 7 0 0 1 1.8-1zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />,
};

const AI_ITEMS = [
  { label: "Dosya Analizi", href: AI_ROUTES.analysis },
  { label: "Canlı Duruşma", href: AI_ROUTES.courtroom },
];

function isActive(pathname: string | null, href: string): boolean {
  return pathname === href || !!pathname?.startsWith(`${href}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string | null }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-accent-50 text-accent-700" : "text-navy-600 hover:bg-surface-muted hover:text-navy-900"
      }`}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const inAi = isActive(pathname, AI_ROUTES.hub);
  const hubActive = pathname === AI_ROUTES.hub;

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-surface-border bg-white px-4 py-6">
      <div className="mb-8 flex items-center gap-2 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600 text-sm font-bold text-white">CB</span>
        <div className="leading-tight">
          <p className="text-base font-semibold text-navy-900">CaseBridge</p>
          <p className="text-[11px] text-navy-500">AI-Powered Legal Intelligence</p>
        </div>
      </div>

      <nav aria-label="Ana menü" className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}

        <div
          className={`relative mt-4 overflow-hidden rounded-2xl bg-navy-950 p-2 ${inAi ? "ring-2 ring-accent-400" : ""}`}
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-ai-glow opacity-70" />
          <Link
            href={AI_ROUTES.hub}
            aria-current={hubActive ? "page" : undefined}
            className={`relative flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white transition-colors ${
              hubActive ? "bg-white/15" : "hover:bg-white/10"
            }`}
          >
            <AiMark className="h-4 w-4 text-accent-300" />
            CaseBridge AI
          </Link>
          {AI_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center rounded-xl py-1.5 pl-9 pr-3 text-sm transition-colors ${
                  active ? "bg-white/15 font-medium text-white" : "text-accent-100 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto pt-4">
          <NavLink item={SETTINGS_ITEM} pathname={pathname} />
        </div>
      </nav>
    </aside>
  );
}
```

- [ ] **Step 7: Add redirects** — replace `frontend/next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/simulasyonlar", destination: "/ai", permanent: true },
      { source: "/simulasyonlar/oturum/:id", destination: "/ai/durusma/oturum/:id", permanent: true },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 8: Delete the old Simülasyonlar code**

```bash
git rm -r frontend/src/app/simulasyonlar frontend/src/components/SimulationsView.tsx frontend/src/components/__tests__/SimulationsView.test.tsx
grep -rn "SimulationsView\|/simulasyonlar" frontend/src
```

Expected: the grep prints nothing (the redirects live in `next.config.mjs`, outside `src`).

- [ ] **Step 9: Run to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npm run build`
Expected: all tests PASS, no type errors, build lists `/ai`, `/ai/analiz`, `/ai/durusma`, `/ai/durusma/oturum/[id]` and no `/simulasyonlar` route.

- [ ] **Step 10: Commit**

```bash
git add -A frontend/src frontend/next.config.mjs
git commit -m "feat(web): CaseBridge AI hub, sidebar AI block and /simulasyonlar redirects"
```

---

### Task 6: Dashboard CaseBridge AI card

**Files:**
- Create: `frontend/src/components/ai/DashboardAiCard.tsx`
- Modify: `frontend/src/components/DashboardView.tsx`
- Test: `frontend/src/components/__tests__/DashboardAiCard.test.tsx` (new), `frontend/src/components/__tests__/DashboardView.test.tsx`

**Interfaces:**
- Consumes: `AiCard`, `AiMark`; `latestCompletedAnalysis`, `latestSession`, `CONFIDENCE_LABELS`, `COURTROOM_STATUS_LABELS`, `courtroomSessionHref`, `analysisDate`, `AI_ROUTES`; `caseDetailHref`; `listAllSimulations`, `listCourtroomSessions`.
- Produces: `DashboardAiCard()` (self-fetching); placed in `DashboardView` right after the stat-card grid.

- [ ] **Step 1: Write the failing card tests** — `frontend/src/components/__tests__/DashboardAiCard.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const listAllSimulations = vi.fn();
const listCourtroomSessions = vi.fn();

vi.mock("@/lib/api", () => ({
  listAllSimulations: (...args: unknown[]) => listAllSimulations(...args),
  listCourtroomSessions: (...args: unknown[]) => listCourtroomSessions(...args),
}));

import { DashboardAiCard } from "@/components/ai/DashboardAiCard";

const sim = {
  id: "s1",
  case_id: "c1",
  case_name: "Ticari Kira Uyarlama Davası",
  case_number: "2026/14",
  status: "completed",
  error_message: null,
  started_at: "2026-09-01T10:00:00",
  completed_at: "2026-09-01T10:05:00",
  current_stage: null,
  failure_category: null,
  result: {
    summary: "Özet",
    strong_points: [],
    weak_points: [],
    opposing_arguments: [],
    missing_information: [],
    possible_scenarios: [],
    questions: [],
    recommended_actions: [],
    assessment: { score: 72, confidence: "high" },
    ai_disclaimer: "x",
    requires_verification: false,
  },
};

const session = {
  id: "o1",
  scenario_id: "sc",
  scenario_title: "Kira Uyarlama",
  chosen_role: "plaintiff",
  status: "completed",
  phase: "verdict",
  current_actor: "system",
  round_number: 6,
  max_rounds: 6,
  total_score: 81,
  created_at: "2026-09-02T10:00:00",
  updated_at: "2026-09-02T10:30:00",
};

beforeEach(() => {
  listAllSimulations.mockReset().mockResolvedValue([]);
  listCourtroomSessions.mockReset().mockResolvedValue([]);
});

describe("DashboardAiCard", () => {
  it("shows the latest analysis, latest session and shortcuts", async () => {
    listAllSimulations.mockResolvedValue([sim]);
    listCourtroomSessions.mockResolvedValue([session]);
    render(<DashboardAiCard />);

    expect(await screen.findByText("Ticari Kira Uyarlama Davası")).toBeInTheDocument();
    expect(screen.getByText("%72")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Raporu aç" })).toHaveAttribute("href", "/davalar/c1?sekme=ai");
    expect(screen.getByText("Kira Uyarlama")).toBeInTheDocument();
    expect(screen.getByText("81/100")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Oturumu aç" })).toHaveAttribute("href", "/ai/durusma/oturum/o1");
    expect(screen.getByRole("link", { name: "Dosya analizi başlat" })).toHaveAttribute("href", "/ai/analiz");
    expect(screen.getByRole("link", { name: "Duruşmaya gir" })).toHaveAttribute("href", "/ai/durusma");
    expect(screen.getByRole("link", { name: "Tümü →" })).toHaveAttribute("href", "/ai");
  });

  it("shows empty states when there is no AI activity", async () => {
    render(<DashboardAiCard />);
    expect(await screen.findByText("Henüz analiz yok.")).toBeInTheDocument();
    expect(screen.getByText("Henüz oturum yok.")).toBeInTheDocument();
  });

  it("keeps the shortcuts and shows an inline error when AI data fails", async () => {
    listAllSimulations.mockRejectedValue(new Error("boom"));
    render(<DashboardAiCard />);
    expect(await screen.findByRole("alert")).toHaveTextContent("AI verileri yüklenemedi.");
    expect(screen.getByRole("link", { name: "Duruşmaya gir" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Update the dashboard tests** — in `frontend/src/components/__tests__/DashboardView.test.tsx` add, right after the existing `vi.mock("@/lib/api", ...)` block:

```tsx
vi.mock("@/components/ai/DashboardAiCard", () => ({
  DashboardAiCard: () => <section aria-label="CaseBridge AI kartı" />,
}));
```

and append inside `describe("DashboardView", ...)`:

```tsx
  it("places the CaseBridge AI card on the dashboard", async () => {
    getAnalyticsOverview.mockResolvedValue(overview);
    getCases.mockResolvedValue([]);
    render(<DashboardView />);
    expect(await screen.findByRole("region", { name: "CaseBridge AI kartı" })).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/DashboardAiCard.test.tsx src/components/__tests__/DashboardView.test.tsx`
Expected: FAIL — module missing; card not on the dashboard.

- [ ] **Step 4: Create `frontend/src/components/ai/DashboardAiCard.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { listAllSimulations, listCourtroomSessions } from "@/lib/api";
import {
  AI_ROUTES,
  CONFIDENCE_LABELS,
  COURTROOM_STATUS_LABELS,
  analysisDate,
  courtroomSessionHref,
  latestCompletedAnalysis,
  latestSession,
} from "@/lib/ai";
import { caseDetailHref } from "@/lib/filters";
import { formatDate } from "@/lib/labels";
import type { CourtroomSessionSummary, SimulationWithCase } from "@/types";
import { AiCard } from "@/components/ai/AiCard";
import { AiMark } from "@/components/ai/AiMark";

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; simulations: SimulationWithCase[]; sessions: CourtroomSessionSummary[] };

/** Fetches its own data so an AI failure never breaks the rest of the dashboard. */
export function DashboardAiCard() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAllSimulations(), listCourtroomSessions()])
      .then(([simulations, sessions]) => {
        if (!cancelled) setState({ kind: "ready", simulations, sessions });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const analysis = state.kind === "ready" ? latestCompletedAnalysis(state.simulations) : null;
  const session = state.kind === "ready" ? latestSession(state.sessions) : null;

  return (
    <AiCard>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy-900">
          <AiMark className="h-4 w-4 text-accent-500" />
          CaseBridge AI
        </p>
        <Link href={AI_ROUTES.hub} className="text-xs font-medium text-accent-700 hover:text-accent-800">
          Tümü →
        </Link>
      </div>

      <div className="mt-4 grid gap-5 md:grid-cols-3">
        {state.kind === "error" ? (
          <p role="alert" className="text-sm text-navy-500 md:col-span-2">
            AI verileri yüklenemedi.
          </p>
        ) : (
          <>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">Son dosya analizi</p>
              {state.kind === "loading" ? (
                <p className="mt-2 text-sm text-navy-400">…</p>
              ) : analysis?.result ? (
                <div className="mt-2 space-y-1">
                  <p className="truncate text-sm font-medium text-navy-800">{analysis.case_name}</p>
                  <p className="flex items-baseline gap-2">
                    <span className="text-xl font-semibold text-accent-700">%{analysis.result.assessment.score}</span>
                    <span className="text-xs text-navy-500">{CONFIDENCE_LABELS[analysis.result.assessment.confidence]}</span>
                  </p>
                  <p className="text-xs text-navy-400">{formatDate(analysisDate(analysis))}</p>
                  <Link href={caseDetailHref(analysis.case_id, "ai")} className="text-xs font-medium text-accent-700 hover:text-accent-800">
                    Raporu aç
                  </Link>
                </div>
              ) : (
                <p className="mt-2 text-sm text-navy-500">Henüz analiz yok.</p>
              )}
            </div>

            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">Son duruşma</p>
              {state.kind === "loading" ? (
                <p className="mt-2 text-sm text-navy-400">…</p>
              ) : session ? (
                <div className="mt-2 space-y-1">
                  <p className="truncate text-sm font-medium text-navy-800">{session.scenario_title}</p>
                  <p className="text-xl font-semibold text-accent-700">
                    {session.total_score !== null ? `${session.total_score}/100` : COURTROOM_STATUS_LABELS[session.status]}
                  </p>
                  <p className="text-xs text-navy-400">{formatDate(session.updated_at)}</p>
                  <Link href={courtroomSessionHref(session.id)} className="text-xs font-medium text-accent-700 hover:text-accent-800">
                    Oturumu aç
                  </Link>
                </div>
              ) : (
                <p className="mt-2 text-sm text-navy-500">Henüz oturum yok.</p>
              )}
            </div>
          </>
        )}

        <div className="flex flex-col gap-2 md:col-start-3">
          <Link
            href={AI_ROUTES.analysis}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-700"
          >
            <AiMark className="h-4 w-4 text-white" />
            Dosya analizi başlat
          </Link>
          <Link
            href={AI_ROUTES.courtroom}
            className="inline-flex items-center justify-center rounded-xl border border-accent-200 px-4 py-2.5 text-sm font-semibold text-accent-700 hover:bg-accent-50"
          >
            Duruşmaya gir
          </Link>
        </div>
      </div>
    </AiCard>
  );
}
```

- [ ] **Step 5: Place it on the dashboard** — in `frontend/src/components/DashboardView.tsx`:
- Add `import { DashboardAiCard } from "@/components/ai/DashboardAiCard";`.
- Directly after the stat-card grid (the `</div>` that closes the grid containing `<StatCard label="Kazanma Oranı" ... />`), insert:

```tsx
      <DashboardAiCard />
```

- [ ] **Step 6: Run to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ai/DashboardAiCard.tsx frontend/src/components/DashboardView.tsx frontend/src/components/__tests__/DashboardAiCard.test.tsx frontend/src/components/__tests__/DashboardView.test.tsx
git commit -m "feat(web): CaseBridge AI card on the dashboard"
```

---

### Task 7: Quick-view AI row

**Files:**
- Create: `frontend/src/components/ai/QuickViewAiRow.tsx`
- Modify: `frontend/src/components/CaseQuickView.tsx`
- Test: `frontend/src/components/__tests__/QuickViewAiRow.test.tsx` (new), `frontend/src/components/__tests__/CaseQuickView.test.tsx`

**Interfaces:**
- Consumes: `AiBadge`; `latestCompletedAnalysis`, `analysisDate`, `analysisStartHref`; `caseDetailHref`; `listSimulations(caseId)` from `@/lib/api`.
- Produces: `QuickViewAiRow({ caseId: string })` — renders nothing while loading or on error.

- [ ] **Step 1: Write the failing tests** — `frontend/src/components/__tests__/QuickViewAiRow.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const listSimulations = vi.fn();
vi.mock("@/lib/api", () => ({
  listSimulations: (...args: unknown[]) => listSimulations(...args),
}));

import { QuickViewAiRow } from "@/components/ai/QuickViewAiRow";

const completed = {
  id: "s1",
  case_id: "c1",
  status: "completed",
  error_message: null,
  started_at: "2026-09-12T10:00:00",
  completed_at: "2026-09-12T10:05:00",
  current_stage: null,
  failure_category: null,
  result: { assessment: { score: 72, confidence: "medium" }, summary: "Özet" },
};

beforeEach(() => {
  listSimulations.mockReset();
});

describe("QuickViewAiRow", () => {
  it("shows the latest AI assessment with a link to the AI tab", async () => {
    listSimulations.mockResolvedValue([completed]);
    render(<QuickViewAiRow caseId="c1" />);

    expect(await screen.findByText(/Son AI değerlendirmesi: %72/)).toBeInTheDocument();
    expect(listSimulations).toHaveBeenCalledWith("c1");
    expect(screen.getByRole("link", { name: "Analize git" })).toHaveAttribute("href", "/davalar/c1?sekme=ai");
  });

  it("offers to start an analysis when there is none", async () => {
    listSimulations.mockResolvedValue([]);
    render(<QuickViewAiRow caseId="c1" />);

    expect(await screen.findByText("Henüz AI analizi yok")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Analiz başlat" })).toHaveAttribute("href", "/ai/analiz?dava=c1");
  });

  it("renders nothing when the request fails", async () => {
    listSimulations.mockRejectedValue(new Error("boom"));
    const { container } = render(<QuickViewAiRow caseId="c1" />);
    await waitFor(() => expect(listSimulations).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
```

In `frontend/src/components/__tests__/CaseQuickView.test.tsx`:
- add `const listSimulations = vi.fn();` next to the other mock fns and `listSimulations: (...args: unknown[]) => listSimulations(...args),` inside the `vi.mock("@/lib/api", ...)` factory;
- in `beforeEach` add `listSimulations.mockReset(); listSimulations.mockResolvedValue([]);`;
- append inside `describe("CaseQuickView", ...)`:

```tsx
  it("shows the AI row without blocking the rest of the panel when it fails", async () => {
    setUrl("/davalar?onizle=c1");
    getCase.mockResolvedValue(detail);
    listSimulations.mockRejectedValue(new Error("boom"));

    render(<CaseQuickView />);

    const dialog = await screen.findByRole("dialog", { name: "Ticari Kira Uyarlama Davası" });
    expect(within(dialog).getByText("Deniz Arslan")).toBeInTheDocument();
    expect(within(dialog).queryByText(/AI değerlendirmesi|AI analizi/)).not.toBeInTheDocument();
  });

  it("shows the AI row when an analysis exists", async () => {
    setUrl("/davalar?onizle=c1");
    getCase.mockResolvedValue(detail);
    listSimulations.mockResolvedValue([
      {
        id: "s1",
        case_id: "c1",
        status: "completed",
        error_message: null,
        started_at: "2026-09-12T10:00:00",
        completed_at: "2026-09-12T10:05:00",
        current_stage: null,
        failure_category: null,
        result: { assessment: { score: 64, confidence: "low" }, summary: "Özet" },
      },
    ]);

    render(<CaseQuickView />);

    expect(await screen.findByText(/Son AI değerlendirmesi: %64/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/__tests__/QuickViewAiRow.test.tsx src/components/__tests__/CaseQuickView.test.tsx`
Expected: FAIL — module missing; no AI row in the panel.

- [ ] **Step 3: Create `frontend/src/components/ai/QuickViewAiRow.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { listSimulations } from "@/lib/api";
import { analysisDate, analysisStartHref, latestCompletedAnalysis } from "@/lib/ai";
import { caseDetailHref } from "@/lib/filters";
import { formatDate } from "@/lib/labels";
import type { Simulation } from "@/types";
import { AiBadge } from "@/components/ai/AiBadge";

type LoadState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; latest: Simulation | null };

/** Fetches separately so an AI failure never affects the rest of the quick view. */
export function QuickViewAiRow({ caseId }: { caseId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    listSimulations(caseId)
      .then((sims) => {
        if (!cancelled) setState({ kind: "ready", latest: latestCompletedAnalysis(sims) });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (state.kind !== "ready") return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-accent-50/60 px-3 py-2 text-xs ring-1 ring-accent-100">
      <span className="flex min-w-0 items-center gap-2 text-navy-700">
        <AiBadge />
        {state.latest?.result ? (
          <span className="truncate">
            Son AI değerlendirmesi: %{state.latest.result.assessment.score} · {formatDate(analysisDate(state.latest))}
          </span>
        ) : (
          <span>Henüz AI analizi yok</span>
        )}
      </span>
      {state.latest?.result ? (
        <Link href={caseDetailHref(caseId, "ai")} className="shrink-0 font-semibold text-accent-700 hover:text-accent-800">
          Analize git
        </Link>
      ) : (
        <Link href={analysisStartHref(caseId)} className="shrink-0 font-semibold text-accent-700 hover:text-accent-800">
          Analiz başlat
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Mount it in the drawer** — in `frontend/src/components/CaseQuickView.tsx`:
- Add `import { QuickViewAiRow } from "@/components/ai/QuickViewAiRow";`.
- In `QuickViewBody`, directly after the closing `</dl>` of the künye grid, insert:

```tsx
      <QuickViewAiRow caseId={detail.id} />
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ai/QuickViewAiRow.tsx frontend/src/components/CaseQuickView.tsx frontend/src/components/__tests__/QuickViewAiRow.test.tsx frontend/src/components/__tests__/CaseQuickView.test.tsx
git commit -m "feat(web): latest AI assessment row in the case quick view"
```

---

### Task 8: E2E updates, new AI flow spec and visual check

**Files:**
- Modify: `tests/e2e/specs/01-case-lifecycle.spec.ts`, `tests/e2e/specs/02-existing-case-simulation.spec.ts`
- Create: `tests/e2e/specs/06-casebridge-ai.spec.ts`

**Interfaces:**
- Consumes: everything above. Accessible names used: tab "CaseBridge AI"; buttons "Analizi başlat", "Yeniden analiz et", "Raporu aç"; text "Son AI değerlendirmesi"; dashboard links "Duruşmaya gir"; `/ai/analiz` search box labelled "Dava ara" and list "Davalar".

- [ ] **Step 1: Update spec 01** — in `tests/e2e/specs/01-case-lifecycle.spec.ts` replace the last two lines of the test with:

```ts
  await page.getByRole("button", { name: "Analizi başlat" }).click();
  await expect(page.getByText("Son AI değerlendirmesi")).toBeVisible({ timeout: 30_000 });
```

- [ ] **Step 2: Update spec 02** — in `tests/e2e/specs/02-existing-case-simulation.spec.ts` replace everything from `await page.getByRole("tab", { name: "Genel Bakış" }).click();` to the end of the test body with:

```ts
  await page.getByRole("tab", { name: "Genel Bakış" }).click();
  await page.getByRole("button", { name: "Analizi başlat" }).click();
  await expect(page.getByText("Son AI değerlendirmesi")).toBeVisible({ timeout: 30_000 });

  // A second analysis run should also complete and be listed alongside the first.
  await page.getByRole("button", { name: "Yeniden analiz et" }).click();
  await page.getByRole("tab", { name: "CaseBridge AI" }).click();
  await expect(page.getByText(/AI Değerlendirmesi: %/)).toHaveCount(2, { timeout: 30_000 });
```

- [ ] **Step 3: Write the new flow** — `tests/e2e/specs/06-casebridge-ai.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Flow 6: CaseBridge AI area — dashboard entry, legacy redirect,
// and starting an analysis from /ai/analiz.

test("reach CaseBridge AI from the dashboard and start an analysis", async ({ page }) => {
  await login(page);

  await page.getByRole("link", { name: "Duruşmaya gir" }).first().click();
  await expect(page).toHaveURL(/\/ai\/durusma$/);
  await expect(page.getByRole("heading", { level: 1, name: "Canlı Duruşma" })).toBeVisible();

  await page.goto("/simulasyonlar");
  await expect(page).toHaveURL(/\/ai$/);
  await expect(page.getByRole("heading", { level: 1, name: "CaseBridge AI" })).toBeVisible();

  await page.getByRole("link", { name: "Dosya Analizi", exact: true }).click();
  await expect(page).toHaveURL(/\/ai\/analiz$/);
  await page.getByRole("list", { name: "Davalar" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "Analizi başlat" }).click();

  await expect(page).toHaveURL(/\/davalar\/[^/?]+\?sekme=ai$/);
  await expect(page.getByRole("tab", { name: "CaseBridge AI" })).toHaveAttribute("aria-selected", "true");
});
```

- [ ] **Step 4: Run the full verification**

Run, from the repo root:

```bash
(cd backend && source .venv/bin/activate && pytest -q)
(cd frontend && npx vitest run && npx tsc --noEmit && npm run build)
(cd tests/e2e && npx playwright test)
```

Expected: backend all PASS (unchanged), frontend all PASS, no type errors, build OK, E2E 6/6 PASS. If Playwright's bundled Chromium is missing in your environment, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed Chromium (the config supports it).

- [ ] **Step 5: Visual check** — with the app running (or reuse the E2E servers), open `/ai`, `/ai/analiz`, `/ai/durusma` and the dashboard at desktop width (1440px) and at 390px. Capture screenshots (e.g. a short Playwright script using `page.setViewportSize` + `page.screenshot({ fullPage: true })`). Confirm: hero text is readable on the dark band, no horizontal overflow at 390px, product cards stack on mobile, the sidebar AI block is visible without scrolling at 900px height. Fix any overflow before committing.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/specs
git commit -m "test(e2e): CaseBridge AI flows and updated analysis steps"
```
