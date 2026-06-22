"use client";

import React from "react";
import { cn } from "@/lib/utils";

function generateNoiseSVG(): string {
  return `data:image/svg+xml;base64,${btoa(`
    <svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'>
      <filter id='noise'>
        <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/>
        <feColorMatrix type='saturate' values='0'/>
      </filter>
      <rect width='300' height='300' filter='url(#noise)' opacity='0.4'/>
    </svg>
  `)}`;
}

interface NoiseBackgroundProps {
  children: React.ReactNode;
  containerClassName?: string;
  className?: string;
  gradientColors?: string[];
}

export function NoiseBackground({
  children,
  containerClassName,
  className,
  gradientColors = ["#00f3ff", "#0891b2", "#00d4e0"],
}: NoiseBackgroundProps) {
  const noiseSrc = generateNoiseSVG();

  const gradientStyle = {
    background: `radial-gradient(ellipse at top left, ${gradientColors[0]}55 0%, ${gradientColors[1]}40 40%, ${gradientColors[2] || gradientColors[0]}30 70%, transparent 100%)`,
  };

  return (
    <div className={cn("relative p-[2px] rounded-full overflow-hidden", containerClassName)}>
      {/* Gradient background */}
      <div
        className="absolute inset-0 rounded-full"
        style={gradientStyle}
      />
      {/* Noise texture overlay */}
      <div
        className="absolute inset-0 rounded-full opacity-[0.18] mix-blend-overlay"
        style={{
          backgroundImage: `url("${noiseSrc}")`,
          backgroundRepeat: "repeat",
          backgroundSize: "150px 150px",
        }}
      />
      {/* Content */}
      <div className={cn("relative z-10", className)}>{children}</div>
    </div>
  );
}
