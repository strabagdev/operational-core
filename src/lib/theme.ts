export const themeStorageKey = "operational-core.theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveThemePreference({
  preference,
  systemPrefersDark = false,
}: {
  preference?: string | null;
  systemPrefersDark?: boolean;
}): ResolvedTheme {
  if (preference === "dark") {
    return "dark";
  }

  if (preference === "system") {
    return systemPrefersDark ? "dark" : "light";
  }

  return "light";
}

export function nextThemePreference(currentTheme: ResolvedTheme): ResolvedTheme {
  return currentTheme === "dark" ? "light" : "dark";
}

export const themeInitScript = `
(() => {
  const storageKey = "${themeStorageKey}";
  const root = document.documentElement;
  const stored = localStorage.getItem(storageKey);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = stored === "dark" || (stored === "system" && prefersDark) ? "dark" : "light";

  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.dataset.theme = theme;
})();
`;
