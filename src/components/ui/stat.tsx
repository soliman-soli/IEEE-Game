import * as React from "react";
import { cn } from "@/lib/cn";

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "brand" | "signal" | "success" | "danger" | "warning";
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
        "flex flex-col justify-between gap-1 rounded-[var(--radius-default)] border border-border bg-surface px-4 py-3",
        className,
      )}
      {...props}
    >
      <span className="font-mono text-[11px] leading-4 lowercase tracking-[0.04em] text-secondary">
        {label}
      </span>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "font-display text-2xl font-bold leading-none tracking-wide tabular-nums",
            tone === "default" && "text-foreground",
            tone === "brand" && "text-brand-light",
            tone === "signal" && "text-signal",
            tone === "success" && "text-success",
            tone === "danger" && "text-danger",
            tone === "warning" && "text-warning",
          )}
        >
          {value}
        </span>
        {sub && (
          <span className="font-mono text-[11px] text-muted tabular-nums">
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}
