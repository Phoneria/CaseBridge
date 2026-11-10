"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Sidebar } from "@/components/Sidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CaseQuickView } from "@/components/CaseQuickView";
import { WorkspaceHeader } from "@/components/WorkspaceHeader";
import { LoadingState } from "@/components/LoadingState";
import { getMe } from "@/lib/api";
import { ApiError } from "@/lib/apiError";
import { FIRM_SUSPENDED } from "@/lib/firmStatus";
import { subscribeUserUpdated } from "@/lib/userEvents";
import type { AppUser } from "@/types";

/** Pages a platform admin may open besides the platform panel. */
const PLATFORM_ALLOWED = ["/hesabim", "/ayarlar"];

/** `platform`: the page is the platform panel (platform admins only). A
 * platform admin is kept out of the firm pages: they belong to no customer firm. */
export function AppShell({ children, platform = false }: { children: React.ReactNode; platform?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDialogElement>(null);

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const dialog = menuRef.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const onResize = () => { if (window.innerWidth >= 768) setMenuOpen(false); };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      dialog?.close();
      previous?.focus();
    };
  }, [menuOpen]);

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

  if (!ready) return <div className="min-h-screen bg-surface-muted p-6"><LoadingState label="Çalışma alanı yükleniyor…" /></div>;

  // Suspense boundaries: views and the drawer read useSearchParams(), which
  // Next 14 requires to be inside <Suspense> for static prerendering.
  return (
    <div className="flex h-dvh bg-surface-muted">
      <div className="hidden w-64 shrink-0 md:block"><Sidebar role={user?.role} platform={!!user?.is_platform_admin} /></div>
      {menuOpen && (
        <dialog ref={menuRef} aria-label="Uygulama menüsü" onCancel={() => setMenuOpen(false)}
          onClick={(event) => { if (event.target === event.currentTarget) setMenuOpen(false); }}
          className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-72 max-w-[calc(100vw-2rem)] border-0 bg-accent-50 p-0 text-navy-900 shadow-xl backdrop:bg-navy-950/50">
          <div className="flex h-full flex-col">
            <button type="button" onClick={() => setMenuOpen(false)} className="m-3 self-end rounded-lg border border-accent-200 bg-white px-3 py-2 text-sm font-medium">Menüyü kapat</button>
            <div className="min-h-0 flex-1" onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setMenuOpen(false); }}>
              <Sidebar role={user?.role} platform={!!user?.is_platform_admin} />
            </div>
          </div>
        </dialog>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <WorkspaceHeader user={user} onMenuToggle={() => setMenuOpen(true)} menuOpen={menuOpen} />
        <main id="main-content" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1600px]">
          <ErrorBoundary>
            <Suspense fallback={null}>{children}</Suspense>
          </ErrorBoundary>
          </div>
        </main>
      </div>
      <Suspense fallback={null}>
        <CaseQuickView />
      </Suspense>
    </div>
  );
}
