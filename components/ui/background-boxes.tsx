"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

const ROWS = 25;
const COLS = 20;

const COLORS = [
  "rgba(0,243,255,0.22)",
  "rgba(0,212,224,0.20)",
  "rgba(8,145,178,0.18)",
  "rgba(6,182,212,0.18)",
  "rgba(34,211,238,0.25)",
];

function getColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function Boxes({ className }: { className?: string }) {
  const [glowing, setGlowing] = useState<Record<string, string>>({});
  const animRef = useRef<number | null>(null);

  const triggerGlow = useCallback((row: number, col: number) => {
    const key = `${row}-${col}`;
    const color = getColor();
    setGlowing((prev) => ({ ...prev, [key]: color }));
    const duration = 600 + Math.random() * 800;
    setTimeout(() => {
      setGlowing((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, duration);
  }, []);

  useEffect(() => {
    let active = true;
    const scheduleNext = () => {
      if (!active) return;
      const delay = 120 + Math.random() * 350;
      animRef.current = window.setTimeout(() => {
        const count = Math.random() < 0.3 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          triggerGlow(
            Math.floor(Math.random() * ROWS),
            Math.floor(Math.random() * COLS)
          );
        }
        scheduleNext();
      }, delay);
    };
    scheduleNext();
    return () => {
      active = false;
      if (animRef.current) clearTimeout(animRef.current);
    };
  }, [triggerGlow]);

  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)}>
      {/* Skewed grid container */}
      <div
        className="absolute"
        style={{
          width: "200%",
          height: "200%",
          left: "-30%",
          top: "-50%",
          transform: "skewX(-48deg) skewY(14deg) scale(0.675)",
          transformOrigin: "center center",
          display: "grid",
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
        }}
      >
        {Array.from({ length: ROWS * COLS }).map((_, i) => {
          const row = Math.floor(i / COLS);
          const col = i % COLS;
          const key = `${row}-${col}`;
          const color = glowing[key];

          return (
            <div
              key={key}
              className="transition-colors duration-700 ease-out"
              style={{
                borderLeft: "1px solid rgba(0,243,255,0.08)",
                borderTop: "1px solid rgba(0,243,255,0.08)",
                backgroundColor: color || "transparent",
              }}
              onMouseEnter={() => triggerGlow(row, col)}
            />
          );
        })}
      </div>
    </div>
  );
}
