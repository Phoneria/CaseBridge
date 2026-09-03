"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const token = window.localStorage.getItem("casebridge_token");
    router.replace(token ? "/dashboard" : "/login");
  }, [router]);

  return null;
}
