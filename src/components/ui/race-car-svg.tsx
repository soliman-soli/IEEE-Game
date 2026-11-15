import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Precision top-down telemetry car vector with custom livery & tabular number plate.
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
    <div
      className={cn(
        "relative inline-flex items-center select-none",
        dims,
        className,
      )}
    >
      <svg
        viewBox="0 0 120 52"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        {/* Rear & Front Tires */}
        <rect
          x="14"
          y="2"
          width="22"
          height="9"
          rx="2.5"
          fill="#0B0C0E"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1.2"
        />
        <rect
          x="14"
          y="41"
          width="22"
          height="9"
          rx="2.5"
          fill="#0B0C0E"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1.2"
        />
        <rect
          x="82"
          y="3"
          width="20"
          height="8"
          rx="2.5"
          fill="#0B0C0E"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1.2"
        />
        <rect
          x="82"
          y="41"
          width="20"
          height="8"
          rx="2.5"
          fill="#0B0C0E"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1.2"
        />

        {/* Rear Wing */}
        <rect
          x="3"
          y="7"
          width="8"
          height="38"
          rx="1.5"
          fill={color}
          stroke="#0A0B0D"
          strokeWidth="1.2"
        />

        {/* Main Chassis Aero Body */}
        <path
          d="M12 14C12 11 22 9 38 9H74L108 16C114 18 117 21 117 26C117 31 114 34 108 36L74 43H38C22 43 12 41 12 38V14Z"
          fill={color}
          stroke="#F3F2EE"
          strokeOpacity="0.4"
          strokeWidth="1.2"
        />

        {/* Nose Aero Stripe */}
        <path d="M74 24H114V28H74V24Z" fill="#F3F2EE" fillOpacity="0.85" />

        {/* Cockpit Number Plate Box */}
        <rect
          x="31"
          y="14"
          width="43"
          height="24"
          rx="4"
          fill="#0A0B0D"
          stroke="#F3F2EE"
          strokeOpacity="0.45"
          strokeWidth="1"
        />
      </svg>
      <span
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center pr-3 font-mono font-semibold tracking-tight text-[#F3F2EE] tabular-nums",
          size === "lg" ? "text-xs" : size === "sm" ? "text-[9px]" : "text-[11px]",
        )}
      >
        #{String(carNumber).padStart(2, "0")}
      </span>
    </div>
  );
}
