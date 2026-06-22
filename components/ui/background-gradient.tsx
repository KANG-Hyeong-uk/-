"use client";

import { cn } from "@/lib/utils";
import React, { useEffect, useState } from "react";

export function BackgroundGradient({
  children,
  className,
  containerClassName,
}: {
  children?: React.ReactNode;
  className?: string;
  containerClassName?: string;
}) {
  const [angle, setAngle] = useState(0);

  useEffect(() => {
    let frame: number;
    let start: number | null = null;

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = (timestamp - start) / 1000;
      setAngle((elapsed * 30) % 360);
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={cn("relative group/card", containerClassName)}
    >
      {/* Outer glow — blurred, behind everything */}
      <div
        className="absolute -inset-[2px] rounded-2xl opacity-20 group-hover/card:opacity-50 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `conic-gradient(from ${angle}deg at 50% 50%, #00f3ff 0deg, #0891b2 90deg, transparent 180deg, #00d4e0 270deg, #00f3ff 360deg)`,
          filter: "blur(6px)",
        }}
      />
      {/* Sharp border line */}
      <div
        className="absolute -inset-[1px] rounded-2xl opacity-25 group-hover/card:opacity-60 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `conic-gradient(from ${angle}deg at 50% 50%, #00f3ff 0deg, #0891b2 90deg, transparent 180deg, #00d4e0 270deg, #00f3ff 360deg)`,
        }}
      />
      {/* Content — opaque background to block gradient bleed */}
      <div className={cn("relative rounded-2xl bg-[oklch(0.12_0.01_260)] h-full", className)}>
        {children}
      </div>
    </div>
  );
}
