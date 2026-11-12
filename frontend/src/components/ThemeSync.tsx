"use client";
import { useEffect } from "react";
import { applyTheme, THEME_STORAGE_KEY } from "@/lib/theme";

export function ThemeSync() {
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        applyTheme(event.newValue === "light" ? "light" : "dark");
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return null;
}
