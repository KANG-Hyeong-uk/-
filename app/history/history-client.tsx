"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { LazyMotion, domAnimation, m } from "framer-motion";
import { Shield, ArrowLeft, TrendingUp, ExternalLink, Globe, Github, LogIn } from "lucide-react";
import { getScanHistory } from "@/lib/api";
import type { ScanHistoryItem } from "@/lib/api";
import { GRADE_CONFIGS } from "@/lib/types";
import { useSubscription } from "@/lib/subscription";

const TrendChart = dynamic(() => import("./trend-chart").then((mod) => mod.TrendChart), {
  ssr: false,
  loading: () => (
    <div className="glass rounded-2xl p-6 mb-8">
      <div className="h-52 animate-pulse bg-white/5 rounded-xl" />
    </div>
  ),
});

function formatShortDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatFullDate(dateStr?: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function displayTarget(item: ScanHistoryItem): string {
  if (item.type === "repo") {
    // "https://github.com/owner/repo" → "owner/repo"
    return item.target.replace(/^https?:\/\/github\.com\//, "");
  }
  return item.target.replace(/^https?:\/\//, "");
}

export function HistoryClient() {
  const router = useRouter();
  const subscription = useSubscription();
  const [scans, setScans] = useState<ScanHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (subscription.loading) return;

    if (!subscription.accessToken) {
      setLoading(false);
      return;
    }

    async function loadHistory() {
      try {
        const data = await getScanHistory(subscription.accessToken!);
        setScans(data.items);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, [subscription.loading, subscription.accessToken]);

  const trendData = scans
    .filter((s) => s.score !== undefined && s.score !== null)
    .slice()
    .reverse()
    .map((s) => ({
      date: formatShortDate(s.completed_at || s.created_at),
      score: s.score!,
      url: s.target,
    }));

  const isLoggedIn = !!subscription.user;

  return (
    <LazyMotion features={domAnimation}>
      <div className="min-h-screen bg-background">
        {/* Background effects */}
        <div
          className="fixed inset-0 opacity-[0.02] pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(0, 243, 255, 0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0, 243, 255, 0.5) 1px, transparent 1px)
            `,
            backgroundSize: "60px 60px",
          }}
        />
        <div className="fixed top-0 left-1/4 w-[600px] h-[600px] bg-neon-cyan/5 rounded-full blur-[80px] pointer-events-none" style={{ transform: "translateZ(0)" }} />

        <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
          {/* Header */}
          <m.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-4 mb-10"
          >
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg glass hover:bg-white/[0.06] transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <div className="relative">
              <Shield className="w-7 h-7 text-neon-cyan" />
              <div className="absolute inset-0 w-7 h-7 bg-neon-cyan/30 blur-lg" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Scan History</h1>
          </m.div>

          {loading || subscription.loading ? (
            <SkeletonUI />
          ) : !isLoggedIn ? (
            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="glass rounded-2xl p-12 text-center"
            >
              <LogIn className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-lg text-muted-foreground mb-2">
                Sign in to view your scan history
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                Your scans are automatically saved when you&apos;re logged in.
              </p>
              <button
                onClick={() => router.push("/")}
                className="px-6 py-2.5 rounded-xl bg-neon-cyan text-background font-semibold hover:bg-neon-cyan/90 transition-colors"
              >
                Go to Home
              </button>
            </m.div>
          ) : scans.length === 0 ? (
            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="glass rounded-2xl p-12 text-center"
            >
              <Shield className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-lg text-muted-foreground mb-2">
                No scan history yet.
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                Go back to the home page and run your first scan!
              </p>
              <button
                onClick={() => router.push("/")}
                className="px-6 py-2.5 rounded-xl bg-neon-cyan text-background font-semibold hover:bg-neon-cyan/90 transition-colors"
              >
                Go to Home
              </button>
            </m.div>
          ) : (
            <>
              {/* Trend Chart */}
              {trendData.length >= 2 && (
                <m.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 }}
                >
                  <div className="glass rounded-2xl p-6 mb-8">
                    <div className="flex items-center gap-3 mb-4">
                      <TrendingUp className="w-5 h-5 text-neon-cyan" />
                      <h2 className="text-lg font-semibold text-foreground">
                        Score Trend
                      </h2>
                    </div>
                    <TrendChart data={trendData} />
                  </div>
                </m.div>
              )}

              {/* History Table */}
              <m.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="glass rounded-2xl overflow-hidden"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left px-6 py-4 text-muted-foreground font-medium">Target</th>
                        <th className="text-center px-4 py-4 text-muted-foreground font-medium">Type</th>
                        <th className="text-center px-4 py-4 text-muted-foreground font-medium">Score</th>
                        <th className="text-center px-4 py-4 text-muted-foreground font-medium">Grade</th>
                        <th className="text-center px-4 py-4 text-muted-foreground font-medium">Date</th>
                        <th className="text-center px-4 py-4 text-muted-foreground font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scans.map((scan, index) => {
                        const gradeConfig = scan.grade ? GRADE_CONFIGS[scan.grade] : null;
                        const reportUrl = scan.type === "repo"
                          ? `/report/${scan.scan_id}?type=repo`
                          : `/report/${scan.scan_id}`;
                        return (
                          <m.tr
                            key={scan.scan_id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, delay: 0.05 * Math.min(index, 10) }}
                            className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                          >
                            <td className="px-6 py-4">
                              <span className="text-foreground truncate block max-w-[300px]" title={scan.target}>
                                {displayTarget(scan)}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-center">
                              {scan.type === "repo" ? (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Github className="w-3 h-3" /> Repo
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <Globe className="w-3 h-3" /> URL
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span className="text-foreground font-medium">
                                {scan.score ?? "-"}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-center">
                              {scan.grade ? (
                                <span className={`font-bold text-lg ${gradeConfig?.color || "text-gray-400"}`}>
                                  {scan.grade}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-center text-muted-foreground">
                              {formatFullDate(scan.completed_at || scan.created_at)}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <button
                                onClick={() => router.push(reportUrl)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-neon-cyan hover:bg-neon-cyan/10 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Report
                              </button>
                            </td>
                          </m.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </m.div>
            </>
          )}
        </div>
      </div>
    </LazyMotion>
  );
}

function SkeletonUI() {
  return (
    <div className="space-y-8">
      <div className="glass rounded-2xl p-6">
        <div className="h-52 animate-pulse bg-white/5 rounded-xl" />
      </div>
      <div className="glass rounded-2xl p-6 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse bg-white/5 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
