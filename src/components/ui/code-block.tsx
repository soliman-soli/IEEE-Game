import * as React from "react";
import { cn } from "@/lib/cn";

export function CodeBlock({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-[var(--radius-default)] border border-border bg-background px-3.5 py-3 font-mono text-[13px] leading-relaxed text-foreground",
        className,
      )}
    >
      <pre className="m-0">
        <code>{code}</code>
      </pre>
    </div>
  );
}
