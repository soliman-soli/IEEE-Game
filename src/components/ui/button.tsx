import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-default)] font-sans font-medium tracking-[-0.01em] transition-[background-color,border-color,color,opacity,transform] duration-[var(--duration-ui)] ease-[var(--ease-out)] select-none active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-light focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-foreground border border-brand-light/30 hover:bg-brand/90 hover:border-brand-light/50",
        secondary:
          "bg-elevated text-foreground border border-border hover:border-border-strong",
        ghost:
          "bg-transparent text-secondary border border-transparent hover:bg-elevated hover:text-foreground",
        danger:
          "bg-danger text-foreground border border-danger hover:opacity-90",
      },
      size: {
        player: "h-12 min-h-[48px] px-5 text-sm font-medium",
        lg: "h-11 min-h-[44px] px-4 text-sm font-medium",
        default: "h-9 px-3.5 text-xs font-medium",
        sm: "h-8 px-3 text-xs",
        xs: "h-7 px-2.5 text-xs font-mono",
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
