"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getMe } from "@/lib/api";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const token = window.localStorage.getItem("casebridge_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    getMe().then((user) => router.replace(user.role === "admin" ? "/admin" : "/dashboard"))
      .catch(() => router.replace("/login"));
  }, [router]);

  return null;
}
