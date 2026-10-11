import type { AppUser } from "@/types";

const USER_UPDATED = "casebridge:user-updated";

/** Tells the app shell that the signed-in user's profile changed, so the
 * header shows the new name without a reload. */
export function announceUserUpdated(user: AppUser): void {
  window.dispatchEvent(new CustomEvent<AppUser>(USER_UPDATED, { detail: user }));
}

export function subscribeUserUpdated(handler: (user: AppUser) => void): () => void {
  function listener(event: Event) {
    handler((event as CustomEvent<AppUser>).detail);
  }
  window.addEventListener(USER_UPDATED, listener);
  return () => window.removeEventListener(USER_UPDATED, listener);
}
