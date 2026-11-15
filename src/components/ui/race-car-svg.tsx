import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Clean flat vector top-down race car marker in line-art style with tabular number plate.
 */
export function RaceCarSvg({
  color,
  carNumber,
  className,
  size = "md",
}: {
  color: string;
  carNumber: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dims =
    size === "lg"
      ? "w-24 h-10"
      : size === "sm"
        ? "w-14 h-6"
        : "w-18 h-7";

  return (
    <div
      className={cn(
        "relative inline-flex items-center select-none",
        dims,
        className,
      )}
    >
      <svg
        viewBox="0 0 112 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        {/* Minimal line-art wheels */}
        <rect
          x="14"
          y="2"
          width="18"
          height="6"
          rx="2"
          fill="#111317"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1"
        />
        <rect
          x="14"
          y="36"
          width="18"
          height="6"
          rx="2"
          fill="#111317"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1"
        />
        <rect
          x="76"
          y="3"
          width="16"
          height="5"
          rx="2"
          fill="#111317"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1"
        />
        <rect
          x="76"
          y="36"
          width="16"
          height="5"
          rx="2"
          fill="#111317"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1"
        />

        {/* Rear wing */}
        <rect
          x="4"
          y="8"
          width="5"
          height="28"
          rx="1.5"
          fill="#111317"
          stroke={color}
          strokeWidth="1.25"
        />

        {/* Clean line-art monocoque silhouette */}
        <path
          d="M11 12C11 9.5 19 8 34 8H70L102 15C106 16.5 108 19 108 22C108 25 106 27.5 102 29L70 36H34C19 36 11 34.5 11 32V12Z"
          fill="#111317"
          stroke={color}
          strokeWidth="1.5"
        />

        {/* Accent nose tip */}
        <path
          d="M84 19.5H104C105.5 20.3 106 21.1 106 22C106 22.9 105.5 23.7 104 24.5H84V19.5Z"
          fill={color}
        />

        {/* Number bay */}
        <rect
          x="26"
          y="12"
          width="42"
          height="20"
          rx="4"
          fill="#0A0B0D"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1"
        />
      </svg>
      <span
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center pr-4 font-mono font-medium tracking-tight text-foreground tabular-nums",
          size === "lg" ? "text-xs" : size === "sm" ? "text-[9px]" : "text-[10px]",
        )}
      >
        {String(carNumber).padStart(2, "0")}
      </span>
    </div>
  );
}
