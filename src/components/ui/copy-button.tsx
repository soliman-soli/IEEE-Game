"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "./button";

export function CopyButton({
  value,
  label = "Copy link",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <Button
      variant="secondary"
      size="sm"
      className={className}
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
      }}
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-success" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="size-3.5 text-secondary" />
          <span>{label}</span>
        </>
      )}
    </Button>
  );
}
