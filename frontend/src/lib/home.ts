import type { AppUser } from "@/types";

/** Where a user lands after signing in or opening "/". */
export function homePath(user: Pick<AppUser, "role" | "is_platform_admin">): string {
  if (user.is_platform_admin) return "/platform";
  return user.role === "admin" ? "/admin" : "/dashboard";
}
