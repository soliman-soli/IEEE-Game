import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const chipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[var(--radius-default)] border px-2.5 py-0.5 font-mono text-xs font-medium tracking-[0.01em] tabular-nums select-none",
  {
    variants: {
      tone: {
        neutral: "border-border bg-elevated text-secondary",
        brand: "border-brand-light/35 bg-brand-subtle text-brand-light",
        signal: "border-signal/35 bg-signal-subtle text-signal",
        success: "border-success/35 bg-success-subtle text-success",
        danger: "border-danger/35 bg-danger-subtle text-danger",
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
            tone === "brand" && "bg-brand-light",
            tone === "signal" && "bg-signal",
            tone === "success" && "bg-success",
            tone === "danger" && "bg-danger",
            (tone === "neutral" || !tone) && "bg-secondary",
          )}
        />
      )}
      {children}
    </span>
  );
}
