import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-default)] font-sans font-semibold tracking-[-0.01em] transition-[background-color,border-color,color,opacity,transform] duration-[var(--duration-ui)] ease-[var(--ease-out)] select-none active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF] focus-visible:ring-offset-1 focus-visible:ring-offset-[#080B10] disabled:pointer-events-none disabled:opacity-40 cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-[#00D4FF] text-[#080B10] border border-[#00D4FF] hover:bg-[#33DDFF] hover:border-[#33DDFF]",
        racing:
          "bg-[#FF453A] text-[#F5F7FA] border border-[#FF453A] hover:bg-[#FF5E54] hover:border-[#FF5E54]",
        secondary:
          "bg-[#172030] text-[#F5F7FA] border border-border hover:border-[#00D4FF]/50",
        ghost:
          "bg-transparent text-secondary border border-transparent hover:bg-[#172030] hover:text-[#F5F7FA]",
        danger:
          "bg-[#FF453A] text-[#F5F7FA] border border-[#FF453A] hover:opacity-90",
      },
      size: {
        player: "h-12 min-h-[48px] px-5 text-sm",
        lg: "h-11 min-h-[44px] px-5 text-sm",
        default: "h-9 px-3.5 text-xs",
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
