/**
 * Shared next/navigation mock for component tests. Use in a test file with:
 *
 *   vi.mock("next/navigation", async () => (await import("@/test/navigation")).navigationModule);
 *   import { nav, resetNav, setUrl } from "@/test/navigation";
 *
 * The mock URL is static: push/replace are recorded but do not change it,
 * so tests set the URL up front with setUrl() and assert on nav.replace/push.
 */
import { vi } from "vitest";

export const nav = {
  pathname: "/",
  searchParams: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
};

export function setUrl(url: string) {
  const parsed = new URL(url, "http://localhost:3000");
  nav.pathname = parsed.pathname;
  nav.searchParams = new URLSearchParams(parsed.search);
}

export function resetNav() {
  setUrl("/");
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.back.mockReset();
}

export const navigationModule = {
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.searchParams,
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: nav.back, refresh: vi.fn(), prefetch: vi.fn() }),
};
