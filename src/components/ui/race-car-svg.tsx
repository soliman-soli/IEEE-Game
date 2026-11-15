import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Flat top-down motorsport race car SVG with custom livery color & race number plate.
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
      ? "w-28 h-12"
      : size === "sm"
        ? "w-14 h-6"
        : "w-20 h-9";

  return (
    <div className={cn("relative inline-flex items-center select-none", dims, className)}>
      <svg
        viewBox="0 0 120 52"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        {/* Rear & Front Tires */}
        <rect x="14" y="2" width="22" height="9" rx="3" fill="#0B0C0E" stroke="#2E3440" strokeWidth="1.5" />
        <rect x="14" y="41" width="22" height="9" rx="3" fill="#0B0C0E" stroke="#2E3440" strokeWidth="1.5" />
        <rect x="82" y="3" width="20" height="8" rx="3" fill="#0B0C0E" stroke="#2E3440" strokeWidth="1.5" />
        <rect x="82" y="41" width="20" height="8" rx="3" fill="#0B0C0E" stroke="#2E3440" strokeWidth="1.5" />

        {/* Rear Wing */}
        <rect x="3" y="7" width="9" height="38" rx="2" fill={color} stroke="#17191D" strokeWidth="1.5" />

        {/* Main Chassis Aero Body */}
        <path
          d="M12 14C12 11 22 9 38 9H74L108 16C114 18 117 21 117 26C117 31 114 34 108 36L74 43H38C22 43 12 41 12 38V14Z"
          fill={color}
          stroke="#F5F3ED"
          strokeOpacity="0.35"
          strokeWidth="1.5"
        />

        {/* Racing Stripe */}
        <path d="M74 23H114V29H74V23Z" fill="#F5F3ED" fillOpacity="0.85" />

        {/* Cockpit Canopy / Number Plate Box */}
        <rect
          x="32"
          y="14"
          width="42"
          height="24"
          rx="5"
          fill="#17191D"
          stroke="#F5F3ED"
          strokeOpacity="0.5"
          strokeWidth="1.2"
        />
      </svg>
      <span
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center pr-3 font-[family-name:var(--font-orbitron)] font-bold tracking-tight text-[#F5F3ED] tabular-nums",
          size === "lg" ? "text-sm" : size === "sm" ? "text-[10px]" : "text-xs",
        )}
      >
        #{String(carNumber).padStart(2, "0")}
      </span>
    </div>
  );
}
