/**
 * The case list's last URL (with its filters), so "← Davalar" on a case page
 * returns to the list the user came from. Per tab (sessionStorage); any storage
 * failure falls back to the plain list.
 */
const KEY = "casebridge:lastCaseListHref";
const LIST_HREF = /^\/davalar(\?|$)/;

export function rememberCaseListHref(href: string): void {
  if (!LIST_HREF.test(href)) return;
  try {
    window.sessionStorage.setItem(KEY, href);
  } catch {
    // Storage blocked: the back link uses the plain list.
  }
}

export function lastCaseListHref(): string {
  try {
    const stored = window.sessionStorage.getItem(KEY);
    if (stored && LIST_HREF.test(stored)) return stored;
  } catch {
    // Storage blocked.
  }
  return "/davalar";
}
