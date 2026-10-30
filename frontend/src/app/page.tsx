"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getMe } from "@/lib/api";
import { ApiError } from "@/lib/apiError";
import { FIRM_SUSPENDED } from "@/lib/firmStatus";
import { homePath } from "@/lib/home";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const token = window.localStorage.getItem("casebridge_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    getMe().then((user) => router.replace(homePath(user)))
      .catch((err) => {
        // A suspended firm: api.ts is already loading /login?askida=1; a client
        // redirect here would race it and drop the notice.
        if (err instanceof ApiError && err.message === FIRM_SUSPENDED) return;
        router.replace("/login");
      });
  }, [router]);

  return null;
}
