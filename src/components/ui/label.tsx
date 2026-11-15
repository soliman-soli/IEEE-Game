import * as React from "react";
import { cn } from "@/lib/cn";

export interface LabelProps extends React.HTMLAttributes<HTMLSpanElement> {
  index?: string;
  tone?: "default" | "brand" | "signal" | "success" | "danger";
  dot?: boolean;
}

/**
 * Small lowercase monospace micro-label with optional slash index or live dot:
 * e.g. <Label index="surface">01</Label> or <Label dot tone="signal">timing / live</Label>
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
        "inline-flex items-center gap-1.5 font-mono text-[11px] leading-4 lowercase tracking-[0.04em] tabular-nums select-none",
        tone === "default" && "text-secondary",
        tone === "brand" && "text-brand-light",
        tone === "signal" && "text-signal",
        tone === "success" && "text-success",
        tone === "danger" && "text-danger",
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            tone === "default" && "bg-secondary",
            tone === "brand" && "bg-brand-light",
            tone === "signal" && "bg-signal",
            tone === "success" && "bg-success",
            tone === "danger" && "bg-danger",
          )}
        />
      )}
      {index && (
        <>
          <span className="text-muted">{index}</span>
          <span className="text-muted">/</span>
        </>
      )}
      <span>{children}</span>
    </span>
  );
}
