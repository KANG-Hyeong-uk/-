"use client";

import { motion } from "framer-motion";
import { GRADE_CONFIGS } from "@/lib/types";
import { BackgroundGradient } from "@/components/ui/background-gradient";

interface SummaryCard {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  color: string;
  bgColor: string;
  borderColor: string;
}

interface ScoreCardProps {
  score: number;
  grade: string;
  summaryCards: SummaryCard[];
  percentile?: number | null;
}

export function ScoreCard({ score, grade, summaryCards, percentile }: ScoreCardProps) {
  const circumference = 2 * Math.PI * 80;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const gradeConfig = GRADE_CONFIGS[grade] || GRADE_CONFIGS["B"];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-10">
      {/* Score Gauge */}
      <BackgroundGradient containerClassName="lg:col-span-1 h-full">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl p-6 flex flex-col items-center justify-center h-full"
        >
          <div className="relative w-44 h-44">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 180 180" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={`Security score: ${score} out of 100`}>
              <circle
                cx="90"
                cy="90"
                r="80"
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="12"
              />
              <motion.circle
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset }}
                transition={{ duration: 1, delay: 0.3 }}
                cx="90"
                cy="90"
                r="80"
                fill="none"
                stroke="var(--neon-cyan)"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={circumference}
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold text-foreground">
                {score}
              </span>
              <span className="text-sm text-muted-foreground">/100</span>
            </div>
          </div>

          <div className="mt-4 text-center">
            <span className={`text-2xl font-bold neon-text ${gradeConfig.textColor}`}>
              Grade: {grade}
            </span>
            <p className="text-sm text-muted-foreground mt-1">
              Security Score
            </p>
            {percentile != null && (
              <p className="text-[11px] text-neon-cyan mt-1.5">
                Better than {Math.round(percentile)}% of scanned sites
              </p>
            )}
          </div>
        </motion.div>
      </BackgroundGradient>

      {/* Summary Cards */}
      <div className="lg:col-span-3 grid grid-cols-3 gap-2 sm:gap-4">
        {summaryCards.map((card, index) => (
          <BackgroundGradient key={card.title} containerClassName="h-full">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + index * 0.1 }}
              className="rounded-2xl p-3 sm:p-6 h-full flex flex-col justify-between"
            >
              <div
                className={`w-8 h-8 sm:w-12 sm:h-12 ${card.bgColor} rounded-lg sm:rounded-xl flex items-center justify-center`}
              >
                <card.icon className={`w-4 h-4 sm:w-6 sm:h-6 ${card.color}`} />
              </div>
              <div className="mt-auto">
                <p className="text-xs sm:text-sm text-muted-foreground mb-1 sm:mb-2">
                  {card.title}
                </p>
                <p className={`text-xl sm:text-3xl font-bold ${card.color}`}>
                  {card.count}
                </p>
              </div>
            </motion.div>
          </BackgroundGradient>
        ))}
      </div>
    </div>
  );
}
