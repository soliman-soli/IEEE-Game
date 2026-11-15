import * as React from "react";
import { cn } from "@/lib/cn";

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "accent" | "ok" | "danger";
}

export function Stat({
  label,
  value,
  sub,
  tone = "default",
  className,
  ...props
}: StatProps) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-1 rounded-[var(--radius-sm)] border border-border bg-surface px-3.5 py-2.5",
        className,
      )}
      {...props}
    >
      <span className="font-mono text-[11px] lowercase tracking-[0.04em] text-muted">
        {label}
      </span>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "font-mono text-lg font-semibold tracking-tight tabular-nums",
            tone === "default" && "text-foreground",
            tone === "accent" && "text-accent",
            tone === "ok" && "text-ok",
            tone === "danger" && "text-danger",
          )}
        >
          {value}
        </span>
        {sub && (
          <span className="font-mono text-[11px] text-dim tabular-nums">
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}
