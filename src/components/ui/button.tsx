import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] font-sans font-medium tracking-[-0.01em] transition-[transform,background-color,border-color,color,opacity] duration-150 select-none active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg border border-accent hover:opacity-90",
        secondary:
          "bg-elevated text-foreground border border-border hover:border-border-strong hover:bg-surface",
        outline:
          "bg-transparent text-foreground border border-border-strong hover:bg-elevated",
        ghost:
          "bg-transparent text-muted border border-transparent hover:text-foreground hover:bg-elevated",
        danger:
          "bg-danger text-white border border-danger hover:opacity-90",
      },
      size: {
        player: "h-13 px-5 text-base font-semibold",
        lg: "h-11 px-5 text-sm font-semibold",
        default: "h-9 px-3.5 text-xs font-medium",
        sm: "h-8 px-2.5 text-xs font-mono",
        xs: "h-7 px-2 text-[11px] font-mono",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
