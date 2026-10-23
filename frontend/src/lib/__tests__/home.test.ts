import { describe, expect, it } from "vitest";

import { homePath } from "@/lib/home";

describe("homePath", () => {
  it("sends platform admins to the platform panel, admins to /admin and lawyers to /dashboard", () => {
    expect(homePath({ role: "admin", is_platform_admin: true })).toBe("/platform");
    expect(homePath({ role: "admin", is_platform_admin: false })).toBe("/admin");
    expect(homePath({ role: "admin" })).toBe("/admin");
    expect(homePath({ role: "lawyer" })).toBe("/dashboard");
  });
});
