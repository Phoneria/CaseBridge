"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Sidebar } from "@/components/Sidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CaseQuickView } from "@/components/CaseQuickView";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { getMe } from "@/lib/api";
import { ApiError } from "@/lib/apiError";
import { FIRM_SUSPENDED } from "@/lib/firmStatus";
import { subscribeUserUpdated } from "@/lib/userEvents";
import type { AppUser } from "@/types";

/** Pages a platform admin may open besides the platform panel. */
const PLATFORM_ALLOWED = ["/hesabim"];

/** `platform`: the page is the platform panel (platform admins only). A
 * platform admin is kept out of the firm pages: they belong to no customer firm. */
export function AppShell({ children, platform = false }: { children: React.ReactNode; platform?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);

  useEffect(() => {
    const token = window.localStorage.getItem("casebridge_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    getMe().then((result) => {
      if (platform && !result.is_platform_admin) {
        router.replace("/dashboard");
        return;
      }
      if (!platform && result.is_platform_admin && !PLATFORM_ALLOWED.includes(pathname ?? "")) {
        router.replace("/platform");
        return;
      }
      setUser(result);
      setReady(true);
    }).catch((err) => {
      // A suspended firm: api.ts is already loading /login?askida=1; a client
      // redirect here would race it and drop the notice.
      if (err instanceof ApiError && err.message === FIRM_SUSPENDED) return;
      router.replace("/login");
    });
  }, [router, platform, pathname]);

  // The account page announces profile changes so the header stays current.
  useEffect(() => subscribeUserUpdated(setUser), []);

  if (!ready) return null;

  // Suspense boundaries: views and the drawer read useSearchParams(), which
  // Next 14 requires to be inside <Suspense> for static prerendering.
  return (
    <div className="flex h-screen bg-surface-muted">
      <Sidebar role={user?.role} platform={!!user?.is_platform_admin} />
      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceHeader user={user} />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <ErrorBoundary>
            <Suspense fallback={null}>{children}</Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <Suspense fallback={null}>
        <CaseQuickView />
      </Suspense>
    </div>
  );
}
