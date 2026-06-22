import { cn } from "@/lib/utils";
import React from "react";

interface AnimatedTrailProps extends React.HTMLAttributes<HTMLDivElement> {
  duration?: string;
  contentClassName?: string;
  trailColor?: string;
  trailSize?: "sm" | "md" | "lg";
}

const sizes = { sm: 5, md: 10, lg: 20 };

export default function AnimatedBorderTrail({
  children,
  className,
  duration = "10s",
  trailColor = "#00f3ff",
  trailSize = "sm",
  contentClassName,
  style,
  ...props
}: AnimatedTrailProps) {
  return (
    <div
      {...props}
      className={cn("relative h-fit w-full overflow-hidden rounded-2xl p-px", className)}
      style={{ background: "rgba(255,255,255,0.06)", ...style }}
    >
      <div
        className="absolute inset-0 h-full w-full animate-trail"
        style={{
          ["--duration" as string]: duration,
          ["--angle" as string]: "0deg",
          background: `conic-gradient(from var(--angle) at 50% 50%, transparent ${100 - sizes[trailSize]}%, ${trailColor})`,
        }}
      />
      <div
        className={cn(
          "relative h-full w-full overflow-hidden rounded-[calc(0.75rem-1px)]",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
