/** CaseBridge AI floating cat: mode state machine and position helpers.
 *
 * Everything here is pure so it can be unit-tested; AiMascot wires it to
 * timers, routes, the chat stream and localStorage. */

export const MASCOT_MODES = [
  "idle",
  "sleeping",
  "working",
  "researching",
  "reading",
  "dancing",
  "victory",
  "thinking",
  "courtroom",
  "tea-break",
] as const;
export type MascotMode = (typeof MASCOT_MODES)[number];

export const MASCOT_MODE_LABELS: Record<MascotMode, string> = {
  idle: "bekliyor",
  sleeping: "uyuyor",
  working: "yanıt yazıyor",
  researching: "kayıtlarınıza bakıyor",
  reading: "belge okuyor",
  dancing: "dans ediyor",
  victory: "kazanılan davayı kutluyor",
  thinking: "düşünüyor",
  courtroom: "duruşmada",
  "tea-break": "çay molasında",
};

export function mascotImage(mode: MascotMode, size: 128 | 256): string {
  return `/mascot/cat-${mode}@${size}.webp`;
}

export const SLEEP_AFTER_MS = 3 * 60 * 1000;
export const VARIANT_GAP_MS = 10 * 60 * 1000;
export const VARIANT_CHECK_MS = 60 * 1000;
export const VARIANT_CHANCE = 0.15;
export const VARIANT_MS = 8000;
export const VICTORY_MS = 5000;

export type ChatPhase = "none" | "thinking" | "researching" | "working";
export type PageMode = "none" | "reading" | "courtroom";
export type IdleVariant = "tea-break" | "dancing";

export interface MascotState {
  chat: ChatPhase;
  page: PageMode;
  asleep: boolean;
  victory: boolean;
  variant: IdleVariant | null;
  lastVariantAt: number | null;
}

export const INITIAL_MASCOT_STATE: MascotState = {
  chat: "none",
  page: "none",
  asleep: false,
  victory: false,
  variant: null,
  lastVariantAt: null,
};

export type MascotEvent =
  | { type: "send" } // a question went out: waiting for the answer
  | { type: "tool" } // a data tool is running
  | { type: "delta" } // the answer is streaming
  | { type: "finish" } // done, error or aborted
  | { type: "page"; page: PageMode }
  | { type: "case-won" }
  | { type: "victory-end" }
  | { type: "idle-timeout" }
  | { type: "activity" }
  | { type: "variant"; variant: IdleVariant; now: number }
  | { type: "variant-end" };

/** Documents and Canlı Duruşma pages have their own pose. */
export function pageModeFor(pathname: string, search = ""): PageMode {
  if (pathname === "/ai/durusma" || pathname.startsWith("/ai/durusma/")) return "courtroom";
  if (pathname === "/belgeler" || pathname.startsWith("/belgeler/")) return "reading";
  if (/^\/davalar\/[^/]+$/.test(pathname) && new URLSearchParams(search).get("sekme") === "belgeler") return "reading";
  return "none";
}

/** The case id of a case page (/davalar/<id>), if any. */
export function caseIdFromPath(pathname: string): string | null {
  const match = /^\/davalar\/([A-Za-z0-9-]+)$/.exec(pathname);
  return match && match[1] !== "yeni" ? match[1] : null;
}

export function canPlayVariant(state: MascotState, now: number): boolean {
  return (
    state.chat === "none" &&
    state.page === "none" &&
    !state.asleep &&
    !state.victory &&
    state.variant === null &&
    (state.lastVariantAt === null || now - state.lastVariantAt >= VARIANT_GAP_MS)
  );
}

export function mascotReducer(state: MascotState, event: MascotEvent): MascotState {
  switch (event.type) {
    case "send":
      return { ...state, chat: "thinking", asleep: false, variant: null };
    case "tool":
      return state.chat === "none" ? state : { ...state, chat: "researching" };
    case "delta":
      return state.chat === "none" ? state : { ...state, chat: "working" };
    case "finish":
      return { ...state, chat: "none" };
    case "page":
      return state.page === event.page ? state : { ...state, page: event.page, variant: null };
    case "case-won":
      return { ...state, victory: true, asleep: false, variant: null };
    case "victory-end":
      return { ...state, victory: false };
    case "idle-timeout":
      return state.chat === "none" ? { ...state, asleep: true, variant: null } : state;
    case "activity":
      return state.asleep ? { ...state, asleep: false } : state;
    case "variant":
      return canPlayVariant(state, event.now) ? { ...state, variant: event.variant, lastVariantAt: event.now } : state;
    case "variant-end":
      return state.variant === null ? state : { ...state, variant: null };
  }
}

/** Priority: chat activity > victory > page pose > sleep > idle variant > idle. */
export function mascotMode(state: MascotState): MascotMode {
  if (state.chat !== "none") return state.chat;
  if (state.victory) return "victory";
  if (state.page !== "none") return state.page;
  if (state.asleep) return "sleeping";
  return state.variant ?? "idle";
}

// ---------- position: snapped to the nearest side, kept inside the viewport ----------

export interface MascotPosition {
  side: "left" | "right";
  /** Distance from the top of the viewport to the cat's top edge, px. */
  top: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export const MASCOT_MARGIN = 16;
export const POSITION_STORAGE_KEY = "cb.mascot.position";
export const HIDDEN_STORAGE_KEY = "cb.mascot.hidden";

export function defaultPosition(viewport: Viewport, size: number): MascotPosition {
  return { side: "right", top: Math.max(MASCOT_MARGIN, viewport.height - size - MASCOT_MARGIN * 2) };
}

export function clampPosition(position: MascotPosition, viewport: Viewport, size: number): MascotPosition {
  const max = Math.max(MASCOT_MARGIN, viewport.height - size - MASCOT_MARGIN);
  return { side: position.side, top: Math.min(Math.max(position.top, MASCOT_MARGIN), max) };
}

/** Where a drag that ended with the cat's top-left corner at (x, y) snaps to. */
export function snapPosition(x: number, y: number, viewport: Viewport, size: number): MascotPosition {
  const side = x + size / 2 < viewport.width / 2 ? "left" : "right";
  return clampPosition({ side, top: y }, viewport, size);
}

export function positionLeft(position: MascotPosition, viewport: Viewport, size: number): number {
  return position.side === "left" ? MASCOT_MARGIN : viewport.width - size - MASCOT_MARGIN;
}

export function parsePosition(raw: string | null): MascotPosition | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<MascotPosition>;
    if ((value.side === "left" || value.side === "right") && typeof value.top === "number" && Number.isFinite(value.top)) {
      return { side: value.side, top: value.top };
    }
  } catch {
    // ignore a damaged value
  }
  return null;
}

/** localStorage that never throws (private mode, blocked storage). */
export const safeStorage = {
  get(key: string, store: "local" | "session" = "local"): string | null {
    try {
      return (store === "local" ? window.localStorage : window.sessionStorage).getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null, store: "local" | "session" = "local"): void {
    try {
      const target = store === "local" ? window.localStorage : window.sessionStorage;
      if (value === null) target.removeItem(key);
      else target.setItem(key, value);
    } catch {
      // storage unavailable: the widget still works for this page view
    }
  },
};

/** Fired by the case page so the cat can celebrate a won case once. */
export const CASE_VIEWED_EVENT = "casebridge:case-viewed";
export type CaseViewedDetail = { id: string; outcome: string | null | undefined };

export function announceCaseViewed(detail: CaseViewedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CaseViewedDetail>(CASE_VIEWED_EVENT, { detail }));
}
