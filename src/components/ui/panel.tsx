import * as React from "react";
import { cn } from "@/lib/cn";
import { Label } from "./label";

export interface PanelProps extends React.HTMLAttributes<HTMLElement> {
  index?: string;
  label?: string;
  rightSlot?: React.ReactNode;
}

/**
 * Architectural 1px-bordered instrument panel with optional top telemetry bar.
 */
export function Panel({
  index,
  label,
  rightSlot,
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-md)] border border-border bg-surface text-foreground overflow-hidden",
        className,
      )}
      {...props}
    >
      {(label || rightSlot) && (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-subtle px-4 py-2.5">
          {label ? <Label index={index}>{label}</Label> : <span />}
          {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
