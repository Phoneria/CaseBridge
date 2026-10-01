"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { getCase, listCaseTasks, listDocuments } from "@/lib/api";
import { ApiError } from "@/lib/apiError";
import { caseDetailHref, daysUntil, type CaseTabSlug } from "@/lib/filters";
import { CASE_STATUS_LABELS, CASE_TYPE_LABELS, formatDate } from "@/lib/labels";
import { FOCUS_PARAM, QUICK_VIEW_PARAM, parseOdak, useUrlParams, type Focus } from "@/lib/urlState";
import type { CaseDetail, DocumentItem, Task } from "@/types";
import { AiMark } from "@/components/ai/AiMark";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; notFound: boolean }
  | { kind: "ready"; detail: CaseDetail; tasks: Task[]; documents: DocumentItem[] };

const SHORTCUTS: Array<[CaseTabSlug, string]> = [
  ["gorevler", "Görevler"],
  ["belgeler", "Belgeler"],
  ["gelismeler", "Gelişmeler"],
  ["ai", "AI"],
];

const EMPTY = "—";

/** First `limit` items; if the focused item would be cut off, it is pinned to the top. */
export function pickWithFocus<T extends { id: string }>(items: T[], focusId: string | undefined, limit = 3): T[] {
  const top = items.slice(0, limit);
  if (!focusId || top.some((item) => item.id === focusId)) return top;
  const focused = items.find((item) => item.id === focusId);
  return focused ? [focused, ...items.slice(0, limit - 1)] : top;
}

function focusIdFor(focus: Focus | null, type: Focus["type"]): string | undefined {
  return focus?.type === type ? focus.id : undefined;
}

export function CaseQuickView() {
  const { params, setParams } = useUrlParams();
  const caseId = params.get(QUICK_VIEW_PARAM);
  const focus = parseOdak(params.get(FOCUS_PARAM));
  const isOpen = caseId !== null;

  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setParams({ [QUICK_VIEW_PARAM]: null, [FOCUS_PARAM]: null }), [setParams]);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    setState({ kind: "loading" });
    Promise.all([getCase(caseId), listCaseTasks(caseId), listDocuments(caseId)])
      .then(([detail, tasks, documents]) => {
        if (!cancelled) setState({ kind: "ready", detail, tasks, documents });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ kind: "error", notFound: error instanceof ApiError && error.status === 404 });
      });
    return () => {
      cancelled = true;
    };
  }, [caseId, reloadToken]);

  // Focus management + Escape + a minimal focus trap while open.
  useEffect(() => {
    if (!isOpen) return;
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusTo?.focus?.();
    };
  }, [isOpen]);

  if (!caseId) return null;

  const title = state.kind === "ready" ? state.detail.case_name : "Dava önizleme";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-navy-900/30" aria-hidden="true" data-testid="quickview-backdrop" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quickview-title"
        tabIndex={-1}
        className="relative flex h-full w-full flex-col bg-white shadow-xl outline-none sm:w-[440px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div className="min-w-0">
            {state.kind === "ready" && (
              <p className="text-xs font-medium uppercase tracking-wide text-accent-600">{state.detail.case_number}</p>
            )}
            <h2 id="quickview-title" className="truncate text-base font-semibold text-navy-900">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Önizlemeyi kapat"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-navy-500 hover:bg-surface-muted hover:text-navy-800"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {state.kind === "loading" && (
            <div role="status" aria-label="Dava yükleniyor" className="space-y-3">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="h-4 animate-pulse rounded bg-surface-muted" />
              ))}
            </div>
          )}

          {state.kind === "error" && state.notFound && (
            <div className="space-y-3 text-sm text-navy-600">
              <p>Dava bulunamadı veya erişiminiz yok.</p>
              <button type="button" onClick={close} className="rounded-lg border border-surface-border px-3 py-1.5 font-medium hover:bg-surface-muted">
                Kapat
              </button>
            </div>
          )}

          {state.kind === "error" && !state.notFound && (
            <div className="space-y-3 text-sm text-navy-600">
              <p>Dava bilgileri yüklenemedi.</p>
              <button
                type="button"
                onClick={() => setReloadToken((token) => token + 1)}
                className="rounded-lg border border-surface-border px-3 py-1.5 font-medium hover:bg-surface-muted"
              >
                Tekrar dene
              </button>
            </div>
          )}

          {state.kind === "ready" && <QuickViewBody {...state} focus={focus} />}
        </div>

        {state.kind === "ready" && (
          <div className="space-y-3 border-t border-surface-border p-4">
            <Link
              href={caseDetailHref(state.detail.id)}
              className="block w-full rounded-xl bg-accent-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-accent-700"
            >
              Davaya git →
            </Link>
            <nav aria-label="Dava sekmeleri" className="flex flex-wrap gap-2 text-xs">
              {SHORTCUTS.map(([slug, label]) => (
                <Link
                  key={slug}
                  href={caseDetailHref(state.detail.id, slug)}
                  className="rounded-lg border border-surface-border px-2.5 py-1.5 font-medium text-navy-700 hover:border-accent-400 hover:text-accent-700"
                >
                  {slug === "ai" ? (
                    <span className="inline-flex items-center gap-1">
                      <AiMark className="h-3 w-3 text-accent-500" />
                      {label}
                    </span>
                  ) : (
                    label
                  )}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickViewBody({
  detail,
  tasks,
  documents,
  focus,
}: {
  detail: CaseDetail;
  tasks: Task[];
  documents: DocumentItem[];
  focus: Focus | null;
}) {
  const openTasks = tasks.filter((task) => task.status !== "completed");
  const events = [...detail.timeline].sort((a, b) => (a.event_date < b.event_date ? 1 : a.event_date > b.event_date ? -1 : 0));
  const recentDocuments = [...documents].sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : a.uploaded_at > b.uploaded_at ? -1 : 0));
  const hearingDays = detail.next_hearing_date ? daysUntil(detail.next_hearing_date) : null;

  return (
    <div className="space-y-6 text-sm">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-700">
          {CASE_STATUS_LABELS[detail.status] ?? detail.status}
        </span>
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-navy-600">
          {CASE_TYPE_LABELS[detail.case_type] ?? detail.case_type}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field label="Müvekkil" value={detail.client_name} />
        <Field label="Karşı taraf" value={detail.opposing_party} />
        <Field label="Mahkeme" value={detail.court} />
        <div>
          <dt className="text-xs text-navy-500">Sonraki duruşma</dt>
          <dd className="mt-0.5 font-medium text-navy-800">
            {detail.next_hearing_date ? formatDate(detail.next_hearing_date) : EMPTY}
            {hearingDays !== null && hearingDays >= 0 && hearingDays <= 7 && (
              <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">7 gün içinde</span>
            )}
          </dd>
        </div>
      </dl>

      <Section
        title="Açık görevler"
        moreHref={caseDetailHref(detail.id, "gorevler")}
        moreLabel={`Tümü (${openTasks.length}) →`}
        empty="Açık görev yok."
        count={openTasks.length}
      >
        {pickWithFocus(openTasks, focusIdFor(focus, "gorev")).map((task) => (
          <Item key={task.id} testId="quickview-task" focused={task.id === focusIdFor(focus, "gorev")}>
            <span className="text-navy-800">{task.title}</span>
            <span className="shrink-0 text-xs text-navy-500">{task.due_date ? formatDate(task.due_date) : EMPTY}</span>
          </Item>
        ))}
      </Section>

      <Section
        title="Son gelişmeler"
        moreHref={caseDetailHref(detail.id, "gelismeler")}
        moreLabel="Tümü →"
        empty="Henüz gelişme yok."
        count={events.length}
      >
        {pickWithFocus(events, focusIdFor(focus, "olay")).map((event) => (
          <Item key={event.id} testId="quickview-event" focused={event.id === focusIdFor(focus, "olay")}>
            <span className="text-navy-800">{event.title}</span>
            <span className="shrink-0 text-xs text-navy-500">{formatDate(event.event_date)}</span>
          </Item>
        ))}
      </Section>

      <Section
        title="Belgeler"
        moreHref={caseDetailHref(detail.id, "belgeler")}
        moreLabel={`Tümü (${documents.length}) →`}
        empty="Henüz belge yok."
        count={documents.length}
      >
        {pickWithFocus(recentDocuments, focusIdFor(focus, "belge")).map((doc) => (
          <Item key={doc.id} testId="quickview-document" focused={doc.id === focusIdFor(focus, "belge")}>
            <span className="truncate text-navy-800">{doc.filename}</span>
            <span className="shrink-0 text-xs uppercase text-navy-500">{doc.file_type}</span>
          </Item>
        ))}
      </Section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-navy-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-navy-800">{value || EMPTY}</dd>
    </div>
  );
}

function Section({
  title,
  moreHref,
  moreLabel,
  empty,
  count,
  children,
}: {
  title: string;
  moreHref: string;
  moreLabel: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-navy-500">{title}</h3>
        {count > 0 && (
          <Link href={moreHref} className="text-xs font-medium text-accent-700 hover:text-accent-800">
            {moreLabel}
          </Link>
        )}
      </div>
      {count === 0 ? <p className="text-xs text-navy-400">{empty}</p> : <ul className="space-y-1.5">{children}</ul>}
    </section>
  );
}

function Item({ testId, focused, children }: { testId: string; focused: boolean; children: React.ReactNode }) {
  return (
    <li
      data-testid={testId}
      data-focused={focused ? "true" : undefined}
      className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 ${
        focused ? "bg-accent-50 ring-1 ring-accent-300" : "bg-surface-muted/60"
      }`}
    >
      {children}
    </li>
  );
}
