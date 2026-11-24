"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { MascotChatPanel } from "@/components/mascot/MascotChatPanel";
import {
  CASE_VIEWED_EVENT,
  HIDDEN_STORAGE_KEY,
  INITIAL_MASCOT_STATE,
  MASCOT_MODE_LABELS,
  POSITION_STORAGE_KEY,
  SLEEP_AFTER_MS,
  VARIANT_CHANCE,
  VARIANT_CHECK_MS,
  VARIANT_MS,
  VICTORY_MS,
  caseIdFromPath,
  clampPosition,
  defaultPosition,
  mascotImage,
  mascotMode,
  mascotReducer,
  pageModeFor,
  parsePosition,
  positionLeft,
  safeStorage,
  snapPosition,
  type CaseViewedDetail,
  type MascotMode,
  type MascotPosition,
  type Viewport,
} from "@/lib/mascot";

const SIZE = 80;
const DRAG_THRESHOLD = 6;
const OPEN_KEY = "cb.mascot.open";
const VICTORY_KEY = "cb.mascot.victories";
const CROSSFADE_MS = 220;

function viewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

function isShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "j";
}

/** Two stacked images: the new pose fades in over the old one. */
function CatImage({ mode }: { mode: MascotMode }) {
  const [shown, setShown] = useState<{ current: MascotMode; previous: MascotMode | null }>({ current: mode, previous: null });
  useEffect(() => {
    if (mode === shown.current) return;
    setShown({ current: mode, previous: shown.current });
    const timer = window.setTimeout(() => setShown({ current: mode, previous: null }), CROSSFADE_MS);
    return () => window.clearTimeout(timer);
  }, [mode, shown]);
  const image = (pose: MascotMode, className: string) => (
    <img
      key={pose}
      src={mascotImage(pose, 128)}
      srcSet={`${mascotImage(pose, 128)} 1x, ${mascotImage(pose, 256)} 2x`}
      width={SIZE}
      height={SIZE}
      alt=""
      draggable={false}
      className={`pointer-events-none absolute inset-0 h-full w-full select-none object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)] ${className}`}
    />
  );
  return (
    <span className="relative block h-full w-full" data-mode={mode}>
      {shown.previous && image(shown.previous, "opacity-0 transition-opacity duration-200 motion-reduce:transition-none")}
      {image(shown.current, "animate-mascot-in motion-reduce:animate-none")}
    </span>
  );
}

export function AiMascot({ random = Math.random }: { random?: () => number }) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const [state, dispatch] = useReducer(mascotReducer, INITIAL_MASCOT_STATE);
  const [position, setPosition] = useState<MascotPosition | null>(null);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const drag = useRef<{ pointerId: number; dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const mode = mascotMode(state);
  const caseId = caseIdFromPath(pathname);

  // Restore position, visibility and the open panel (kept across page changes).
  useEffect(() => {
    const saved = parsePosition(safeStorage.get(POSITION_STORAGE_KEY));
    setPosition(clampPosition(saved ?? defaultPosition(viewport(), SIZE), viewport(), SIZE));
    setHidden(safeStorage.get(HIDDEN_STORAGE_KEY) === "1");
    setOpen(safeStorage.get(OPEN_KEY, "session") === "1");
  }, []);

  useEffect(() => {
    const onResize = () => setPosition((current) => (current ? clampPosition(current, viewport(), SIZE) : current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const setPanel = useCallback((value: boolean) => {
    setOpen(value);
    safeStorage.set(OPEN_KEY, value ? "1" : null, "session");
    if (!value) window.setTimeout(() => buttonRef.current?.focus(), 0);
  }, []);

  const setHiddenState = useCallback((value: boolean) => {
    setHidden(value);
    safeStorage.set(HIDDEN_STORAGE_KEY, value ? "1" : null);
    if (value) {
      setOpen(false);
      safeStorage.set(OPEN_KEY, null, "session");
    }
  }, []);

  // ⌘J / Ctrl+J toggles the panel (and brings a hidden cat back); Esc closes it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isShortcut(event)) {
        event.preventDefault();
        if (hidden) setHiddenState(false);
        setPanel(!open || hidden);
      } else if (event.key === "Escape" && open && !event.defaultPrevented) {
        const active = document.activeElement;
        const inOtherDialog = active instanceof HTMLElement && active.closest("dialog, [role=dialog]:not([data-testid=mascot-panel])");
        if (!inOtherDialog) setPanel(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hidden, setPanel, setHiddenState]);

  // Page poses.
  useEffect(() => dispatch({ type: "page", page: pageModeFor(pathname, search) }), [pathname, search]);

  // Sleep after SLEEP_AFTER_MS without input; any input wakes the cat.
  useEffect(() => {
    let timer = window.setTimeout(() => dispatch({ type: "idle-timeout" }), SLEEP_AFTER_MS);
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      dispatch({ type: "activity" });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => dispatch({ type: "idle-timeout" }), SLEEP_AFTER_MS);
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, onActivity));
    };
  }, []);

  // Rare idle variants: the reducer allows one per VARIANT_GAP_MS.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (random() < VARIANT_CHANCE) dispatch({ type: "variant", variant: random() < 0.5 ? "tea-break" : "dancing", now: Date.now() });
    }, VARIANT_CHECK_MS);
    return () => window.clearInterval(interval);
  }, [random]);
  useEffect(() => {
    if (!state.variant) return;
    const timer = window.setTimeout(() => dispatch({ type: "variant-end" }), VARIANT_MS);
    return () => window.clearTimeout(timer);
  }, [state.variant]);

  // Victory once per won case (per browser tab session).
  useEffect(() => {
    const onCase = (event: Event) => {
      const detail = (event as CustomEvent<CaseViewedDetail>).detail;
      if (!detail || detail.outcome !== "won") return;
      const seen = (safeStorage.get(VICTORY_KEY, "session") ?? "").split(",").filter(Boolean);
      if (seen.includes(detail.id)) return;
      safeStorage.set(VICTORY_KEY, [...seen, detail.id].slice(-50).join(","), "session");
      dispatch({ type: "case-won" });
    };
    window.addEventListener(CASE_VIEWED_EVENT, onCase);
    return () => window.removeEventListener(CASE_VIEWED_EVENT, onCase);
  }, []);
  useEffect(() => {
    if (!state.victory) return;
    const timer = window.setTimeout(() => dispatch({ type: "victory-end" }), VICTORY_MS);
    return () => window.clearTimeout(timer);
  }, [state.victory]);

  // ---------- drag (mouse, pen and touch through pointer events) ----------

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !position) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top, startX: event.clientX, startY: event.clientY, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < DRAG_THRESHOLD) return;
    current.moved = true;
    setDragPoint({ x: event.clientX - current.dx, y: event.clientY - current.dy });
  }

  function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    drag.current = null;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.moved) {
      suppressClick.current = true;
      const next = snapPosition(event.clientX - current.dx, event.clientY - current.dy, viewport(), SIZE);
      setPosition(next);
      setDragPoint(null);
      safeStorage.set(POSITION_STORAGE_KEY, JSON.stringify(next));
      event.preventDefault();
    }
  }

  function onClick() {
    if (suppressClick.current) {
      suppressClick.current = false; // the click that ends a drag
      return;
    }
    setPanel(!open);
  }

  if (!position) return null;
  const view = viewport();
  const left = dragPoint ? dragPoint.x : positionLeft(position, view, SIZE);
  const top = dragPoint ? dragPoint.y : position.top;
  const label = `CaseBridge AI (${MASCOT_MODE_LABELS[mode]})`;

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => { setHiddenState(false); setPanel(true); }}
        className={`fixed bottom-4 z-40 rounded-full bg-navy-950 px-3 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-white/10 hover:bg-navy-900 ${position.side === "left" ? "left-4" : "right-4"}`}
      >
        CaseBridge AI&apos;ı göster
      </button>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-keyshortcuts="Meta+J Control+J"
        title="CaseBridge AI (⌘J / Ctrl+J)"
        data-testid="ai-mascot"
        data-mode={mode}
        data-side={position.side}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; setDragPoint(null); }}
        onClick={onClick}
        style={{ left, top, width: SIZE, height: SIZE, touchAction: "none" }}
        className={`fixed z-40 rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-accent-300 ${dragPoint ? "cursor-grabbing" : "cursor-grab transition-[left,top] duration-200 ease-out motion-reduce:transition-none"} ${open ? "hidden sm:block" : ""}`}
      >
        <CatImage mode={mode} />
      </button>
      <MascotChatPanel
        open={open}
        side={position.side}
        route={pathname}
        caseId={caseId}
        onClose={() => setPanel(false)}
        onHide={() => setHiddenState(true)}
        onChatEvent={dispatch}
      />
    </>
  );
}
