import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const chipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] border px-2 py-0.5 font-mono text-[11px] font-medium tracking-[0.02em] tabular-nums select-none",
  {
    variants: {
      tone: {
        neutral: "border-border bg-elevated text-muted",
        strong: "border-border-strong bg-surface text-foreground",
        accent: "border-accent/40 bg-accent-subtle text-accent",
        ok: "border-ok/40 bg-ok-subtle text-ok",
        danger: "border-danger/40 bg-danger-subtle text-danger",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {
  dot?: boolean;
}

export function Chip({
  className,
  tone,
  dot = false,
  children,
  ...props
}: ChipProps) {
  return (
    <span className={cn(chipVariants({ tone, className }))} {...props}>
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            tone === "accent" && "bg-accent",
            tone === "ok" && "bg-ok",
            tone === "danger" && "bg-danger",
            (tone === "neutral" || tone === "strong" || !tone) && "bg-muted",
          )}
        />
      )}
      {children}
    </span>
  );
}
