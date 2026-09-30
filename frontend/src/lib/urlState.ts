"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export type FocusType = "gorev" | "belge" | "olay";
export interface Focus {
  type: FocusType;
  id: string;
}

export const QUICK_VIEW_PARAM = "onizle";
export const FOCUS_PARAM = "odak";
const FOCUS_TYPES: FocusType[] = ["gorev", "belge", "olay"];

export function parseOdak(value: string | null | undefined): Focus | null {
  if (!value) return null;
  const separator = value.indexOf(":");
  if (separator <= 0) return null;
  const type = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!id || !(FOCUS_TYPES as string[]).includes(type)) return null;
  return { type: type as FocusType, id };
}

export function formatOdak(focus: Focus): string {
  return `${focus.type}:${focus.id}`;
}

type ParamUpdates = Record<string, string | null | undefined>;

/** `pathname` + current params with `updates` applied; null/""/undefined removes a key. */
export function withParams(pathname: string, current: { toString(): string }, updates: ParamUpdates): string {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const serialized = searchParams?.toString() ?? "";
  const params = useMemo(() => new URLSearchParams(serialized), [serialized]);

  const hrefWith = useCallback((updates: ParamUpdates) => withParams(pathname, params, updates), [pathname, params]);

  const setParams = useCallback(
    (updates: ParamUpdates, options: { push?: boolean } = {}) => {
      const href = withParams(pathname, params, updates);
      if (options.push) router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [pathname, params, router],
  );

  return { params, hrefWith, setParams };
}

/** Returns a builder for "open the quick view for this case" links that keep the current page and filters. */
export function useQuickViewHref() {
  const { hrefWith } = useUrlParams();
  return useCallback(
    (caseId: string, focus?: Focus) =>
      hrefWith({ [QUICK_VIEW_PARAM]: caseId, [FOCUS_PARAM]: focus ? formatOdak(focus) : null }),
    [hrefWith],
  );
}
