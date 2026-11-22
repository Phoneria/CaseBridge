import type { AppUser } from "@/types";

/** Where a user lands after signing in or opening "/". */
export function homePath(user: Pick<AppUser, "role" | "is_platform_admin" | "workspace_position">): string {
  if (user.is_platform_admin) return "/platform";
  if (user.workspace_position) return "/calisma-alanim";
  return user.role === "admin" ? "/admin" : "/dashboard";
}
