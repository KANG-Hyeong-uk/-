"use client";

import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import type { BenchmarkData } from "@/lib/types";

interface BenchmarkChartProps {
  benchmark: BenchmarkData;
  score: number;
}

export function BenchmarkChart({ benchmark, score }: BenchmarkChartProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="glass rounded-2xl p-6 mb-10"
    >
      <div className="flex items-center gap-3 mb-4">
        <BarChart3 className="w-5 h-5 text-neon-cyan" />
        <h2 className="text-lg font-semibold text-foreground">
          Benchmark Comparison
        </h2>
      </div>

      <p className="text-sm text-muted-foreground mb-1">
        Based on <span className="text-foreground font-medium">{benchmark.total_scans.toLocaleString()}</span> scans
        {" | "}Average: <span className="text-foreground font-medium">{benchmark.avg_score}</span>
        {" | "}Median: <span className="text-foreground font-medium">{benchmark.median_score}</span>
      </p>
      <p className="text-lg font-semibold neon-text text-neon-cyan mb-4">
        You&apos;re in the top {benchmark.percentile}% of scanned sites
      </p>

      <div className="h-52" role="img" aria-label={`Score distribution chart. Your score ${score} is in the top ${benchmark.percentile}% of scanned sites`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={benchmark.score_distribution} barCategoryGap="15%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="range"
              tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(10,10,15,0.95)",
                border: "1px solid rgba(0,243,255,0.3)",
                borderRadius: "8px",
                color: "#fff",
                fontSize: "13px",
              }}
              formatter={(value: number) => [`${value} scans`, "Count"]}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {benchmark.score_distribution.map((entry, index) => {
                const rangeParts = entry.range.replace(/[^\d-]/g, "").split("-");
                const lo = parseInt(rangeParts[0], 10);
                const hi = parseInt(rangeParts[1], 10);
                const isCurrentRange = score >= lo && score <= hi;
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={isCurrentRange ? "var(--neon-cyan)" : "rgba(0,243,255,0.25)"}
                    stroke={isCurrentRange ? "var(--neon-cyan)" : "transparent"}
                    strokeWidth={isCurrentRange ? 2 : 0}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
