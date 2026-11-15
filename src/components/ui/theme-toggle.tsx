"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";

const THEME_STORAGE_KEY = "ieee_gp_theme";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");

  React.useEffect(() => {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    const next = saved === "light" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(next);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    document.documentElement.classList.remove("dark", "light");
    document.documentElement.classList.add(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Theme: ${theme === "dark" ? "Pit Wall (Dark)" : "FIA Sheet (Light)"}`}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 font-mono text-[11px] lowercase tracking-[0.03em] text-muted transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer",
        className,
      )}
    >
      {theme === "dark" ? (
        <>
          <Moon className="size-3.5 text-accent" />
          <span>pit / dark</span>
        </>
      ) : (
        <>
          <Sun className="size-3.5 text-accent" />
          <span>fia / light</span>
        </>
      )}
    </button>
  );
}
