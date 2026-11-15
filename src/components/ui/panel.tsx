import * as React from "react";
import { cn } from "@/lib/cn";
import { Label } from "./label";

export interface PanelProps extends React.HTMLAttributes<HTMLElement> {
  index?: string;
  label?: string;
  rightSlot?: React.ReactNode;
}

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
        "rounded-[var(--radius-default)] border border-border bg-surface text-foreground overflow-hidden",
        className,
      )}
      {...props}
    >
      {(label || rightSlot) && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          {label ? <Label index={index}>{label}</Label> : <span />}
          {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
