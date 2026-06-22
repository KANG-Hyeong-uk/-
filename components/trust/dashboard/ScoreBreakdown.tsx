"use client";

import { motion } from "framer-motion";
import { SEVERITY_CONFIGS } from "@/lib/types";
import type { ScoreBreakdownItem } from "@/lib/types";

interface ScoreBreakdownProps {
  items: ScoreBreakdownItem[];
  score: number;
}

export function ScoreBreakdown({ items, score }: ScoreBreakdownProps) {
  const deductionItems = items.filter(
    (item) => item.actual_deduction > 0 && !item.template_id.startsWith("_cap_")
  );

  if (deductionItems.length === 0) return null;

  const severityOrder = ["critical", "high", "medium", "low", "info"];
  const sorted = [...deductionItems].sort(
    (a, b) =>
      severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity) ||
      b.actual_deduction - a.actual_deduction
  );

  const criticalOrHigh = sorted.filter(
    (i) => i.severity === "critical" || i.severity === "high"
  ).length;
  const medium = sorted.filter((i) => i.severity === "medium").length;
  const other = sorted.length - criticalOrHigh - medium;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25 }}
      className="glass rounded-2xl p-6 mb-10"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">
          What&apos;s Affecting Your Score
        </h3>
        <div className="flex items-center gap-1.5 shrink-0 ml-4">
          {criticalOrHigh > 0 && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
              {criticalOrHigh} critical
            </span>
          )}
          {medium > 0 && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-yellow-400/15 text-yellow-400 border border-yellow-400/20">
              {medium} to fix
            </span>
          )}
          {other > 0 && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground border border-white/10">
              {other} info
            </span>
          )}
        </div>
      </div>

      {/* Issue list */}
      <div className="space-y-2">
        {sorted.map((item, idx) => {
          const sevConfig =
            SEVERITY_CONFIGS[item.severity as keyof typeof SEVERITY_CONFIGS] ||
            SEVERITY_CONFIGS.info;

          return (
            <div
              key={`${item.template_id}-${idx}`}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span
                  className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${sevConfig.bgColor} ${sevConfig.color} shrink-0`}
                >
                  {item.severity}
                </span>
                <span className="text-sm text-foreground truncate">
                  {item.name}
                </span>
              </div>
              {item.locations > 1 && (
                <span className="text-xs text-muted-foreground shrink-0 ml-3">
                  found in {item.locations} places
                </span>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
