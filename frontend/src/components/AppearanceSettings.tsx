"use client";
import { useSyncExternalStore } from "react";
import { getTheme, setTheme, THEME_CHANGE_EVENT, type Theme } from "@/lib/theme";

const subscribe = (listener: () => void) => {
  window.addEventListener(THEME_CHANGE_EVENT, listener);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, listener);
};
const serverTheme = (): Theme => "dark";

export function AppearanceSettings() {
  const theme = useSyncExternalStore(subscribe, getTheme, serverTheme);
  return (
    <section aria-labelledby="appearance-title" className="rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <h2 id="appearance-title" className="text-sm font-semibold text-navy-900">Görünüm</h2>
      <p className="mt-1 text-sm text-navy-500">Tema tercihiniz bu tarayıcıda saklanır ve sonraki girişlerde korunur.</p>
      <fieldset className="mt-4 flex flex-wrap gap-3">
        <legend className="sr-only">Uygulama teması</legend>
        {([['dark', 'Koyu'], ['light', 'Açık']] as const).map(([value, label]) => (
          <label key={value} className={`flex min-w-36 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${theme === value ? 'border-accent-500 bg-accent-50 text-accent-800' : 'border-surface-border text-navy-700'}`}>
            <input type="radio" name="casebridge-theme" value={value} checked={theme === value} onChange={() => setTheme(value)} className="h-4 w-4 accent-accent-600" />
            <span>{label}{value === 'dark' && <span className="ml-2 text-xs text-navy-500">Varsayılan</span>}</span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
