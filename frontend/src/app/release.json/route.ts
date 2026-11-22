import { APP_VERSION } from "@/lib/appVersion";

export function GET() {
  return Response.json({ commit: process.env.NEXT_PUBLIC_RELEASE_COMMIT ?? "development", version: APP_VERSION, scope: "application" }, { headers: { "Cache-Control": "no-store" } });
}
