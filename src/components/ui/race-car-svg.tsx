import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * Sharp F1/arcade top-down race car vector with front/rear aero wings, cockpit halo,
 * custom team livery color, and condensed display number plate.
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
      ? "w-28 h-11"
      : size === "sm"
        ? "w-14 h-6"
        : "w-20 h-8";

  return (
    <div
      className={cn(
        "relative inline-flex items-center select-none shrink-0",
        dims,
        className,
      )}
    >
      <svg
        viewBox="0 0 128 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        {/* Front & Rear Racing Slicks */}
        <rect
          x="18"
          y="3"
          width="20"
          height="7"
          rx="2"
          fill="#080B10"
          stroke="rgba(245,247,250,0.28)"
          strokeWidth="1.1"
        />
        <rect
          x="18"
          y="38"
          width="20"
          height="7"
          rx="2"
          fill="#080B10"
          stroke="rgba(245,247,250,0.28)"
          strokeWidth="1.1"
        />
        <rect
          x="84"
          y="4"
          width="18"
          height="6"
          rx="2"
          fill="#080B10"
          stroke="rgba(245,247,250,0.28)"
          strokeWidth="1.1"
        />
        <rect
          x="84"
          y="38"
          width="18"
          height="6"
          rx="2"
          fill="#080B10"
          stroke="rgba(245,247,250,0.28)"
          strokeWidth="1.1"
        />

        {/* Suspension Pushrods */}
        <path
          d="M28 10V15M28 33V38M92 10V16M92 32V38"
          stroke="rgba(245,247,250,0.35)"
          strokeWidth="1.2"
        />

        {/* Front Aero Wing (Right Side) */}
        <path
          d="M110 7H121C122.5 7 123 8 123 9.5V38.5C123 40 122.5 41 121 41H110L114 34V14L110 7Z"
          fill="#111722"
          stroke={color}
          strokeWidth="1.4"
        />

        {/* Rear Aero Wing (Left Side) */}
        <rect
          x="3"
          y="7"
          width="8"
          height="34"
          rx="1.5"
          fill="#111722"
          stroke={color}
          strokeWidth="1.4"
        />
        <line x1="6" y1="7" x2="6" y2="41" stroke={color} strokeWidth="1" strokeOpacity="0.6" />

        {/* Main F1 Floor & Sidepods */}
        <path
          d="M12 13L22 10H64L80 15L114 19C117 19.6 118 21.5 118 24C118 26.5 117 28.4 114 29L80 33L64 38H22L12 35V13Z"
          fill="#111722"
          stroke={color}
          strokeWidth="1.6"
        />

        {/* Sidepod Livery Accents */}
        <path d="M22 12H58L66 15H22V12Z" fill={color} fillOpacity="0.85" />
        <path d="M22 36H58L66 33H22V36Z" fill={color} fillOpacity="0.85" />

        {/* Nose Cone Center Stripe */}
        <path
          d="M84 21.5H116C116.8 22 117 23 117 24C117 25 116.8 26 116 26.5H84V21.5Z"
          fill={color}
        />

        {/* Cockpit Halo & Number Plate */}
        <rect
          x="32"
          y="15"
          width="40"
          height="18"
          rx="4"
          fill="#080B10"
          stroke="rgba(245,247,250,0.2)"
          strokeWidth="1"
        />
        <path
          d="M66 17C72 19 74 21 74 24C74 27 72 29 66 31"
          stroke="rgba(245,247,250,0.45)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      <span
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center pr-3 font-display font-bold tracking-wider text-[#F5F7FA] tabular-nums",
          size === "lg" ? "text-base" : size === "sm" ? "text-[10px]" : "text-xs",
        )}
      >
        #{String(carNumber).padStart(2, "0")}
      </span>
    </div>
  );
}
