import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  nextThemePreference,
  resolveThemePreference,
  themeInitScript,
  themeStorageKey,
} from "./theme";

const themeToggleSource = readFileSync(
  new URL("../components/theme-toggle-button.tsx", import.meta.url),
  "utf8",
);
const rootLayoutSource = readFileSync(
  new URL("../app/layout.tsx", import.meta.url),
  "utf8",
);

describe("theme preference", () => {
  it("defaults to light when no browser preference is stored", () => {
    expect(resolveThemePreference({ preference: null })).toBe("light");
    expect(resolveThemePreference({ preference: "unexpected" })).toBe("light");
  });

  it("toggles light to dark and dark to light", () => {
    expect(nextThemePreference("light")).toBe("dark");
    expect(nextThemePreference("dark")).toBe("light");
  });

  it("can resolve system preference internally without exposing a three-way UI", () => {
    expect(resolveThemePreference({
      preference: "system",
      systemPrefersDark: true,
    })).toBe("dark");
    expect(resolveThemePreference({
      preference: "system",
      systemPrefersDark: false,
    })).toBe("light");
  });

  it("ships an early script that persists and applies the document theme class", () => {
    expect(themeInitScript).toContain(themeStorageKey);
    expect(themeInitScript).toContain("localStorage.getItem(storageKey)");
    expect(themeInitScript).toContain('matchMedia("(prefers-color-scheme: dark)")');
    expect(themeInitScript).toContain('root.classList.remove("light", "dark")');
    expect(themeInitScript).toContain("root.classList.add(theme)");
    expect(themeInitScript).toContain("root.dataset.theme = theme");
  });

  it("renders accessible labels, tooltips, and Sun/Moon icons for the toggle", () => {
    expect(themeToggleSource).toContain("Cambiar a modo oscuro");
    expect(themeToggleSource).toContain("Cambiar a modo claro");
    expect(themeToggleSource).toContain("aria-label={label}");
    expect(themeToggleSource).toContain('role="tooltip"');
    expect(themeToggleSource).toContain("Moon");
    expect(themeToggleSource).toContain("Sun");
    expect(themeToggleSource).toContain("window.localStorage.setItem(themeStorageKey, next)");
  });

  it("keeps the early theme script in the root document head without next/script", () => {
    expect(rootLayoutSource).toContain("<head>");
    expect(rootLayoutSource).toContain(
      '<script dangerouslySetInnerHTML={{ __html: themeInitScript }} />',
    );
    expect(rootLayoutSource).not.toContain("next/script");
    expect(rootLayoutSource).not.toContain("strategy=\"beforeInteractive\"");
  });

  it("does not read browser theme state during the ThemeToggleButton initial render", () => {
    expect(themeToggleSource).toContain('useState<ResolvedTheme>("light")');
    expect(themeToggleSource).toContain("useEffect(() =>");
    expect(themeToggleSource).toContain("window.setTimeout");
    expect(themeToggleSource).toContain("setTheme(readStoredTheme())");
    expect(themeToggleSource).not.toContain("suppressHydrationWarning");
  });
});
