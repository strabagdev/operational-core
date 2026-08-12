"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  nextThemePreference,
  resolveThemePreference,
  themeStorageKey,
  type ResolvedTheme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

type ThemeToggleButtonProps = {
  className?: string;
  tooltipClassName?: string;
};

function readStoredTheme(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  return resolveThemePreference({
    preference: window.localStorage.getItem(themeStorageKey),
    systemPrefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
  });
}

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(theme);
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggleButton({
  className,
  tooltipClassName,
}: ThemeToggleButtonProps) {
  const [theme, setTheme] = useState<ResolvedTheme>(() => readStoredTheme());
  const nextTheme = nextThemePreference(theme);
  const label = nextTheme === "dark" ? "Cambiar a modo oscuro" : "Cambiar a modo claro";
  const Icon = nextTheme === "dark" ? Moon : Sun;

  function toggleTheme() {
    const next = nextThemePreference(theme);

    window.localStorage.setItem(themeStorageKey, next);
    applyTheme(next);
    setTheme(next);
  }

  return (
    <Button
      aria-label={label}
      className={cn("group relative h-10 w-10 px-0", className)}
      onClick={toggleTheme}
      suppressHydrationWarning
      type="button"
      variant="ghost"
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      <span
        className={cn(
          "pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
          tooltipClassName,
        )}
        role="tooltip"
      >
        {label}
      </span>
    </Button>
  );
}
