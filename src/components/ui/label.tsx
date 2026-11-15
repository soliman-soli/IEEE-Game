import * as React from "react";
import { cn } from "@/lib/cn";

export interface LabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  index?: string;
  tone?: "default" | "accent" | "ok" | "danger";
  dot?: boolean;
}

/**
 * Duckurity-inspired lowercase monospace micro-label with slash index,
 * e.g. <Label index="01">surface / driver</Label> -> "01 / surface / driver"
 */
export function Label({
  index,
  tone = "default",
  dot = false,
  className,
  children,
  ...props
}: LabelProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[11px] lowercase tracking-[0.04em] tabular-nums select-none",
        tone === "default" && "text-muted",
        tone === "accent" && "text-accent",
        tone === "ok" && "text-ok",
        tone === "danger" && "text-danger",
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            tone === "default" && "bg-muted",
            tone === "accent" && "bg-accent",
            tone === "ok" && "bg-ok",
            tone === "danger" && "bg-danger",
          )}
        />
      )}
      {index && (
        <>
          <span className="text-dim">{index}</span>
          <span className="text-dim">/</span>
        </>
      )}
      <span>{children}</span>
    </span>
  );
}
