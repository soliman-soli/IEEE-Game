import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[6px] font-semibold tracking-tight transition-[transform,background-color,border-color,opacity] duration-100 select-none active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD43B] disabled:pointer-events-none disabled:opacity-45 cursor-pointer",
  {
    variants: {
      variant: {
        primary:
          "bg-[#00629B] text-[#F5F3ED] border border-[#3898EC]/40 active:bg-[#004f7c]",
        secondary:
          "bg-[#282D35] text-[#F5F3ED] border border-[#2E3440] active:bg-[#1F2329]",
        danger:
          "bg-[#EF4444] text-[#F5F3ED] border border-[#DC2626] active:bg-[#B91C1C]",
      },
      size: {
        player: "h-14 px-5 text-base",
        default: "h-11 px-4 text-sm",
        sm: "h-9 px-3 text-xs",
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
