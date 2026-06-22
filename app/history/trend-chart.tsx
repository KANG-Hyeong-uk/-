"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TrendDataPoint {
  date: string;
  score: number;
  url: string;
}

interface TrendChartProps {
  data: TrendDataPoint[];
}

export function TrendChart({ data }: TrendChartProps) {
  return (
    <div className="h-52" role="img" aria-label="Score trend chart showing scan scores over time">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="date"
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }}
            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
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
            formatter={(value: number) => [`${value}`, "Score"]}
            labelFormatter={(label: string) => label}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="var(--neon-cyan)"
            strokeWidth={2}
            dot={{ fill: "var(--neon-cyan)", r: 4, strokeWidth: 0 }}
            activeDot={{ fill: "var(--neon-cyan)", r: 6, strokeWidth: 2, stroke: "rgba(0,243,255,0.3)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
