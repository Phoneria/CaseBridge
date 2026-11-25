export type Theme = "dark" | "light";
export const THEME_STORAGE_KEY = "casebridge-theme";
export const THEME_CHANGE_EVENT = "casebridge:themechange";

// Runs before the body paints; an unavailable/invalid preference means dark.
export const THEME_INIT_SCRIPT = `(function(){var t="dark";try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="light")t="light"}catch(e){}document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t})()`;

export function getTheme(): Theme {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function setTheme(theme: Theme) {
  applyTheme(theme);
  try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Keep the current session usable when storage is blocked. */ }
}
