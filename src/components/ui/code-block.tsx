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
        "w-full overflow-x-auto rounded-[6px] border border-[#2E3440] bg-[#111317] px-3.5 py-3 font-mono text-[13px] leading-relaxed text-[#F5F3ED]",
        className,
      )}
    >
      <pre className="m-0">
        <code>{code}</code>
      </pre>
    </div>
  );
}
