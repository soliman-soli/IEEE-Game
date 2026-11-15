import * as React from "react";
import { cn } from "@/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "h-10 w-full rounded-[var(--radius-default)] border border-border bg-elevated px-3 text-sm text-foreground placeholder:text-muted transition-colors duration-[var(--duration-ui)] focus:border-brand-light focus:outline-none disabled:pointer-events-none disabled:opacity-45",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
