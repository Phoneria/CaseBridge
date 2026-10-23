"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getMe } from "@/lib/api";
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
      .catch(() => router.replace("/login"));
  }, [router]);

  return null;
}
