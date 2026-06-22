"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  ShieldAlert,
  AlertTriangle,
  Key,
  Eye,
  Info,
  Bot,
  ArrowRight,
  Sparkles,
  Loader2,
  ExternalLink,
  RotateCcw,
  Trophy,
  Wand2,
  GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthButton } from "@/components/trust/AuthButton";
import type { AppState } from "@/components/trust/client-app";
import type {
  ScanResult,
  BenchmarkData,
  ScheduledScan,
  RepoScanResult,
  RepoVulnType,
  VulnTier,
} from "@/lib/types";
import { classifyTier, classifyRepoTier } from "@/lib/types";
import {
  trackTierFilterClicked,
  trackAiAnalysisClicked,
  trackAiAnalysisAll,
  trackFixWithAiClicked,
  trackFixPRClicked,
  trackReportShared,
  trackBadgeGenerated,
  trackUpgradeModalOpened,
} from "@/lib/analytics";
import {
  analyzeVulnerabilities,
  analyzeRepoVulnerabilities,
  generateBadge,
  markAsFixed,
  markRepoVulnAsFixed,
  getBenchmark,
  exportReport,
  createScheduledScan,
  getScheduledScans,
  deleteScheduledScan,
  type BadgeResponse,
} from "@/lib/api";
import {
  ScoreCard,
  FilterBar,
  VulnerabilityList,
  BadgeSection,
  ScheduleSection,
  FixPromptModal,
  CreateFixPRModal,
  ReportFAB,
  SecurityChecklist,
} from "@/components/trust/dashboard";
import { DigestSection } from "@/components/trust/dashboard/DigestSection";
import { UpgradeModal } from "@/components/trust/UpgradeModal";
import { NoiseBackground } from "@/components/ui/noise-background";
import type { SubscriptionState } from "@/lib/subscription";
// BenchmarkChart removed — percentile is shown inline in ScoreCard
import type { UIVulnerability, UIRepoVulnerability } from "@/components/trust/dashboard";

interface DashboardViewProps {
  scanResult: ScanResult | null;
  isRepoScan?: boolean;
  repoScanResult?: RepoScanResult | null;
  onNavigate: (state: AppState) => void;
  onNewScan: () => void;
  subscription: SubscriptionState;
}

export function DashboardView({ scanResult, isRepoScan, repoScanResult, onNavigate, onNewScan, subscription }: DashboardViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [vulns, setVulns] = useState<UIVulnerability[]>(
    scanResult?.vulnerabilities?.map((v) => ({ ...v, fixed: v.is_fixed || false })) || []
  );
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);
  const [badge, setBadge] = useState<BadgeResponse | null>(null);
  const [isGeneratingBadge, setIsGeneratingBadge] = useState(false);
  const [copiedAfterCode, setCopiedAfterCode] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<VulnTier | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [benchmark, setBenchmark] = useState<BenchmarkData | null>(null);
  const [exportingFormat, setExportingFormat] = useState<"pdf" | "csv" | null>(null);
  const [schedules, setSchedules] = useState<ScheduledScan[]>([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleFreq, setScheduleFreq] = useState<"hourly" | "daily" | "weekly">("daily");
  const [scheduleEmail, setScheduleEmail] = useState("");
  const [scheduleSlack, setScheduleSlack] = useState("");
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false);
  const [deletingScheduleId, setDeletingScheduleId] = useState<string | null>(null);
  const [fixPromptOpen, setFixPromptOpen] = useState(false);
  const [fixPROpen, setFixPROpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [freeAnalysisCount, setFreeAnalysisCount] = useState(0);
  const [repoAnalyzingIds, setRepoAnalyzingIds] = useState<Set<string>>(new Set());
  const [isAnalyzingAllRepo, setIsAnalyzingAllRepo] = useState(false);
  const [freeRepoAnalysisCount, setFreeRepoAnalysisCount] = useState(0);
  const FREE_ANALYSIS_LIMIT = 2;

  // Repo scan vulnerability state
  const [repoVulns, setRepoVulns] = useState<UIRepoVulnerability[]>(
    repoScanResult?.vulnerabilities?.map((v) => ({ ...v, fixed: v.is_fixed || false })) || []
  );
  const [repoVulnTypeFilter, setRepoVulnTypeFilter] = useState<RepoVulnType | null>(null);

  // Use repo scan data when in repo mode
  const score = isRepoScan ? (repoScanResult?.score ?? 68) : (scanResult?.score ?? 68);
  const grade = isRepoScan ? (repoScanResult?.grade ?? "B-") : (scanResult?.grade ?? "B-");
  const summary = isRepoScan ? repoScanResult?.summary : scanResult?.summary;
  const scoreBreakdown = scanResult?.score_breakdown;
  const scanId = isRepoScan ? repoScanResult?.scan_id : scanResult?.scan_id;

  // A-grade celebration
  useEffect(() => {
    if (grade !== "A" || !scanId) return;
    const key = `trust_celebrated_${scanId}`;
    if (sessionStorage.getItem(key)) return;
    const timer = setTimeout(() => {
      setShowCelebration(true);
      sessionStorage.setItem(key, "1");
    }, 1500);
    return () => clearTimeout(timer);
  }, [grade, scanId]);

  // Fetch benchmark data
  useEffect(() => {
    getBenchmark(score)
      .then(setBenchmark)
      .catch((err) => console.error("Failed to fetch benchmark:", err));
  }, [score]);

  // Fetch scheduled scans
  useEffect(() => {
    getScheduledScans()
      .then((res) => setSchedules(res.schedules))
      .catch((err) => console.error("Failed to fetch schedules:", err));
  }, []);

  // Initialize freeAnalysisCount from already-analyzed vulns to prevent bypass on refresh
  useEffect(() => {
    if (subscription.plan === "pro") return;
    const analyzedCount = vulns.filter((v) => v.ai_analyzed).length;
    if (analyzedCount > 0) {
      setFreeAnalysisCount(analyzedCount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run only on mount

  // Initialize freeRepoAnalysisCount from already-analyzed repo vulns
  useEffect(() => {
    if (subscription.plan === "pro") return;
    const analyzedCount = repoVulns.filter((v) => v.ai_analyzed).length;
    if (analyzedCount > 0) {
      setFreeRepoAnalysisCount(analyzedCount);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run only on mount

  const cronMap = {
    hourly: "0 * * * *",
    daily: "0 9 * * *",
    weekly: "0 9 * * 1",
  } as const;

  const handleCreateSchedule = async () => {
    if (subscription.plan !== "pro") { setUpgradeOpen(true); return; }
    if (!scanResult?.target_url) return;
    setIsCreatingSchedule(true);
    try {
      const newSchedule = await createScheduledScan({
        target_url: scanResult.target_url,
        cron_expression: cronMap[scheduleFreq],
        notification_email: scheduleEmail || undefined,
        slack_webhook_url: scheduleSlack || undefined,
      });
      setSchedules((prev) => [...prev, newSchedule]);
      setShowScheduleForm(false);
      setScheduleEmail("");
      setScheduleSlack("");
    } catch (error) {
      console.error("Failed to create schedule:", error);
    } finally {
      setIsCreatingSchedule(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    setDeletingScheduleId(id);
    try {
      await deleteScheduledScan(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } catch (error) {
      console.error("Failed to delete schedule:", error);
    } finally {
      setDeletingScheduleId(null);
    }
  };

  // Calculate tier counts
  const tierCounts = { "must-fix": 0, "should-fix": 0, "good-to-know": 0 };
  if (isRepoScan) {
    for (const v of repoVulns) {
      tierCounts[classifyRepoTier(v.severity, v.vuln_type)]++;
    }
  } else {
    for (const v of vulns) {
      tierCounts[classifyTier(v.severity, v.template_id)]++;
    }
  }

  // Calculate summary cards from tier data
  const summaryCards = [
    {
      icon: ShieldAlert,
      title: "Must Fix",
      count: tierCounts["must-fix"],
      color: "text-red-400",
      bgColor: "bg-red-400/10",
      borderColor: "border-red-400/20",
    },
    {
      icon: Shield,
      title: "Should Fix",
      count: tierCounts["should-fix"],
      color: "text-yellow-400",
      bgColor: "bg-yellow-400/10",
      borderColor: "border-yellow-400/20",
    },
    {
      icon: Info,
      title: "Good to Know",
      count: tierCounts["good-to-know"],
      color: "text-blue-400",
      bgColor: "bg-blue-400/10",
      borderColor: "border-blue-400/20",
    },
  ];

  const handleApplyFix = async (id: string) => {
    if (isRepoScan) {
      setRepoVulns((prev) =>
        prev.map((v) => (v.id === id ? { ...v, fixed: true } : v))
      );
      try {
        await markRepoVulnAsFixed(id);
      } catch (error) {
        console.error("Failed to mark as fixed:", error);
        setRepoVulns((prev) =>
          prev.map((v) => (v.id === id ? { ...v, fixed: false } : v))
        );
      }
      return;
    }

    setVulns((prev) =>
      prev.map((v) => (v.id === id ? { ...v, fixed: true } : v))
    );

    try {
      await markAsFixed(id);
    } catch (error) {
      console.error("Failed to mark as fixed:", error);
      setVulns((prev) =>
        prev.map((v) => (v.id === id ? { ...v, fixed: false } : v))
      );
    }
  };

  const handleGenerateBadge = async () => {
    if (!scanResult?.scan_id) return;

    setIsGeneratingBadge(true);
    try {
      const response = await generateBadge(scanResult.scan_id);
      setBadge(response);
      trackBadgeGenerated(scanResult.grade ?? "unknown");
    } catch (error) {
      console.error("Failed to generate badge:", error);
    } finally {
      setIsGeneratingBadge(false);
    }
  };

  const handleCopyAfterCode = async (vulnId: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedAfterCode(vulnId);
      setTimeout(() => setCopiedAfterCode(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const getShareUrl = () => {
    const currentScanId = isRepoScan ? repoScanResult?.scan_id : scanResult?.scan_id;
    if (!currentScanId) return "";
    const typeQuery = isRepoScan ? "?type=repo" : "";
    return `${window.location.origin}/report/${currentScanId}${typeQuery}`;
  };

  const handleShareReport = async () => {
    const url = getShareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedShareLink(true);
      trackReportShared("copy");
      setTimeout(() => setCopiedShareLink(false), 2000);
    } catch (error) {
      console.error("Failed to copy share link:", error);
    }
  };

  const handleShareTwitter = () => {
    const url = getShareUrl();
    if (!url) return;
    trackReportShared("twitter");
    const currentScore = isRepoScan ? repoScanResult?.score : scanResult?.score;
    const currentGrade = isRepoScan ? repoScanResult?.grade : scanResult?.grade;
    const text = `My website security score is ${currentScore ?? "?"}/100 (Grade ${currentGrade ?? "?"})! Scan your site for free with Gwangju Security`;
    window.open(
      `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer,width=550,height=420"
    );
  };

  const handleShareLinkedIn = () => {
    const url = getShareUrl();
    if (!url) return;
    trackReportShared("linkedin");
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer,width=550,height=420"
    );
  };

  const handleExport = async (format: "pdf" | "csv") => {
    if (subscription.plan !== "pro") { setUpgradeOpen(true); trackUpgradeModalOpened("export"); return; }
    const currentScanId = isRepoScan ? repoScanResult?.scan_id : scanResult?.scan_id;
    if (!currentScanId) return;
    setExportingFormat(format);
    try {
      await exportReport(currentScanId, format);
    } catch (error) {
      console.error(`Failed to export ${format}:`, error);
    } finally {
      setExportingFormat(null);
    }
  };

  const handleAnalyzeVulnerability = async (vulnId: string) => {
    if (subscription.plan !== "pro" && freeAnalysisCount >= FREE_ANALYSIS_LIMIT) {
      setUpgradeOpen(true);
      trackUpgradeModalOpened("ai_analysis_limit");
      return;
    }
    if (!scanResult?.scan_id) return;

    const vuln = vulns.find((v) => v.id === vulnId);
    trackAiAnalysisClicked(vulnId, vuln?.severity ?? "unknown");
    setAnalyzingIds((prev) => new Set([...prev, vulnId]));

    try {
      const response = await analyzeVulnerabilities(scanResult.scan_id, [vulnId], subscription.accessToken || undefined);

      if (response.vulnerabilities.length > 0) {
        const analyzed = response.vulnerabilities[0];
        setVulns((prev) =>
          prev.map((v) =>
            v.id === vulnId
              ? {
                  ...v,
                  ai_analyzed: true,
                  description: analyzed.description,
                  before_code: analyzed.before_code,
                  after_code: analyzed.after_code,
                  fix_steps: analyzed.fix_steps,
                }
              : v
          )
        );
        if (subscription.plan !== "pro") {
          setFreeAnalysisCount((c) => c + 1);
        }
      }
    } catch (error) {
      console.error("Failed to analyze vulnerability:", error);
    } finally {
      setAnalyzingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(vulnId);
        return newSet;
      });
    }
  };

  const handleAnalyzeAll = async () => {
    if (subscription.plan !== "pro" && freeAnalysisCount >= FREE_ANALYSIS_LIMIT) {
      setUpgradeOpen(true);
      trackUpgradeModalOpened("ai_analysis_limit");
      return;
    }
    if (!scanResult?.scan_id) return;

    trackAiAnalysisAll(vulns.filter((v) => !v.ai_analyzed).length);
    setIsAnalyzingAll(true);

    try {
      let unanalyzedIds = vulns
        .filter((v) => !v.ai_analyzed)
        .map((v) => v.id);

      if (unanalyzedIds.length === 0) return;

      // Free users: limit to remaining free slots
      if (subscription.plan !== "pro") {
        const remaining = FREE_ANALYSIS_LIMIT - freeAnalysisCount;
        if (remaining <= 0) { setUpgradeOpen(true); return; }
        unanalyzedIds = unanalyzedIds.slice(0, remaining);
      }

      const response = await analyzeVulnerabilities(scanResult.scan_id, unanalyzedIds, subscription.accessToken || undefined);

      const analyzedMap = new Map(
        response.vulnerabilities.map((v) => [v.id, v])
      );

      let newlyAnalyzed = 0;
      setVulns((prev) =>
        prev.map((v) => {
          const analyzed = analyzedMap.get(v.id);
          if (analyzed) {
            newlyAnalyzed++;
            return {
              ...v,
              ai_analyzed: true,
              description: analyzed.description,
              before_code: analyzed.before_code,
              after_code: analyzed.after_code,
              fix_steps: analyzed.fix_steps,
            };
          }
          return v;
        })
      );

      if (subscription.plan !== "pro") {
        setFreeAnalysisCount((c) => c + newlyAnalyzed);
      }
    } catch (error) {
      console.error("Failed to analyze vulnerabilities:", error);
    } finally {
      setIsAnalyzingAll(false);
    }
  };

  const handleAnalyzeRepoVulnerability = async (vulnId: string) => {
    if (subscription.plan !== "pro" && freeRepoAnalysisCount >= FREE_ANALYSIS_LIMIT) {
      setUpgradeOpen(true);
      trackUpgradeModalOpened("ai_analysis_limit");
      return;
    }
    if (!repoScanResult?.scan_id) return;

    const vuln = repoVulns.find((v) => v.id === vulnId);
    trackAiAnalysisClicked(vulnId, vuln?.severity ?? "unknown");
    setRepoAnalyzingIds((prev) => new Set([...prev, vulnId]));

    try {
      const response = await analyzeRepoVulnerabilities(
        repoScanResult.scan_id,
        [vulnId],
        subscription.accessToken || undefined
      );

      if (response.vulnerabilities.length > 0) {
        const analyzed = response.vulnerabilities[0];
        setRepoVulns((prev) =>
          prev.map((v) =>
            v.id === vulnId
              ? {
                  ...v,
                  ai_analyzed: true,
                  description: analyzed.description,
                  before_code: analyzed.before_code,
                  after_code: analyzed.after_code,
                  fix_steps: analyzed.fix_steps,
                }
              : v
          )
        );
        if (subscription.plan !== "pro") {
          setFreeRepoAnalysisCount((c) => c + 1);
        }
      }
    } catch (error) {
      console.error("Failed to analyze repo vulnerability:", error);
    } finally {
      setRepoAnalyzingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(vulnId);
        return newSet;
      });
    }
  };

  const handleAnalyzeAllRepo = async () => {
    if (subscription.plan !== "pro" && freeRepoAnalysisCount >= FREE_ANALYSIS_LIMIT) {
      setUpgradeOpen(true);
      trackUpgradeModalOpened("ai_analysis_limit");
      return;
    }
    if (!repoScanResult?.scan_id) return;

    trackAiAnalysisAll(repoVulns.filter((v) => !v.ai_analyzed).length);
    setIsAnalyzingAllRepo(true);

    try {
      let unanalyzedIds = repoVulns
        .filter((v) => !v.ai_analyzed)
        .map((v) => v.id);

      if (unanalyzedIds.length === 0) return;

      if (subscription.plan !== "pro") {
        const remaining = FREE_ANALYSIS_LIMIT - freeRepoAnalysisCount;
        if (remaining <= 0) { setUpgradeOpen(true); return; }
        unanalyzedIds = unanalyzedIds.slice(0, remaining);
      }

      const response = await analyzeRepoVulnerabilities(
        repoScanResult.scan_id,
        unanalyzedIds,
        subscription.accessToken || undefined
      );

      const analyzedMap = new Map(
        response.vulnerabilities.map((v) => [v.id, v])
      );

      let newlyAnalyzed = 0;
      setRepoVulns((prev) =>
        prev.map((v) => {
          const analyzed = analyzedMap.get(v.id);
          if (analyzed) {
            newlyAnalyzed++;
            return {
              ...v,
              ai_analyzed: true,
              description: analyzed.description,
              before_code: analyzed.before_code,
              after_code: analyzed.after_code,
              fix_steps: analyzed.fix_steps,
            };
          }
          return v;
        })
      );

      if (subscription.plan !== "pro") {
        setFreeRepoAnalysisCount((c) => c + newlyAnalyzed);
      }
    } catch (error) {
      console.error("Failed to analyze repo vulnerabilities:", error);
    } finally {
      setIsAnalyzingAllRepo(false);
    }
  };

  // Filter vulnerabilities by tier
  const filteredVulns = vulns.filter((v) => {
    if (tierFilter && classifyTier(v.severity, v.template_id) !== tierFilter) return false;
    if (searchQuery && !v.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Filter repo vulnerabilities by tier + type
  const filteredRepoVulns = repoVulns.filter((v) => {
    if (tierFilter && classifyRepoTier(v.severity, v.vuln_type) !== tierFilter) return false;
    if (repoVulnTypeFilter && v.vuln_type !== repoVulnTypeFilter) return false;
    if (searchQuery && !v.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Check if there are unanalyzed vulnerabilities
  const hasUnanalyzed = vulns.some((v) => !v.ai_analyzed);
  const hasUnanalyzedRepo = repoVulns.some((v) => !v.ai_analyzed);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 md:px-12 border-b border-border/50">
        <button
          onClick={onNewScan}
          aria-label="Go to Trust home page"
          className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
        >
          <Shield className="w-7 h-7 text-neon-cyan" aria-hidden="true" />
          <span className="text-lg font-semibold text-foreground">광주 보안관</span>
        </button>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {(vulns.length > 0 || repoVulns.length > 0) && (
            <Button
              size="sm"
              onClick={() => {
                if (subscription.plan !== "pro") { setUpgradeOpen(true); trackUpgradeModalOpened("fix_with_ai"); return; }
                const sid = isRepoScan ? repoScanResult?.scan_id : scanResult?.scan_id;
                if (sid) trackFixWithAiClicked(sid, !!isRepoScan);
                setFixPromptOpen(true);
              }}
              className="bg-neon-cyan text-black hover:bg-neon-cyan/90 font-semibold"
            >
              <Wand2 className="w-3.5 h-3.5 md:mr-1.5" />
              <span className="hidden md:inline">Fix with AI</span>
            </Button>
          )}
          {isRepoScan && repoVulns.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (subscription.plan !== "pro") { setUpgradeOpen(true); trackUpgradeModalOpened("fix_pr"); return; }
                if (repoScanResult?.scan_id) trackFixPRClicked(repoScanResult.scan_id);
                setFixPROpen(true);
              }}
              className="border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 font-semibold"
            >
              <GitBranch className="w-3.5 h-3.5 md:mr-1.5" />
              <span className="hidden md:inline">Fix PR</span>
            </Button>
          )}
          <AuthButton initialUser={subscription.user} initialPlan={subscription.plan} />
          <Button
            variant="outline"
            size="icon"
            onClick={onNewScan}
            aria-label="Scan again"
            className="border-white/20 text-foreground hover:bg-white/5 w-8 h-8"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 md:px-12">
        {/* Repo Scan Info Banner */}
        {isRepoScan && repoScanResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-xl p-4 mb-6 flex items-center gap-4"
          >
            <div className="w-10 h-10 bg-neon-cyan/10 rounded-lg flex items-center justify-center shrink-0">
              <ExternalLink className="w-5 h-5 text-neon-cyan" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {repoScanResult.repo_name}
              </p>
              <p className="text-xs text-muted-foreground">
                Branch: <span className="text-neon-cyan">{repoScanResult.branch}</span>
                {repoScanResult.commit_hash && (
                  <> &middot; Commit: <code className="text-xs">{repoScanResult.commit_hash.slice(0, 7)}</code></>
                )}
                {repoScanResult.files_scanned > 0 && (
                  <> &middot; {repoScanResult.files_scanned.toLocaleString()} files scanned</>
                )}
              </p>
            </div>
            <a
              href={repoScanResult.repo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-neon-cyan hover:underline flex items-center gap-1 shrink-0"
            >
              View on GitHub
              <ExternalLink className="w-3 h-3" />
            </a>
          </motion.div>
        )}

        {/* Score Section */}
        <ScoreCard score={score} grade={grade} summaryCards={summaryCards} percentile={benchmark?.percentile} />

        {/* Security Headers Checklist (URL scans only) */}
        {!isRepoScan && scanResult?.target_url && (
          <SecurityChecklist targetUrl={scanResult.target_url} />
        )}

        {/* Section Divider */}
        <div className="border-t border-white/8 my-2" />

        {/* Vulnerability List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-foreground">
                Vulnerabilities
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-sm font-semibold bg-red-500/15 text-red-400 border border-red-500/20">
                {isRepoScan ? repoVulns.length : vulns.length}
              </span>
              {subscription.plan !== "pro" && ((isRepoScan && repoVulns.length > 0) || (!isRepoScan && vulns.length > 0)) && (() => {
                const used = isRepoScan ? freeRepoAnalysisCount : freeAnalysisCount;
                const remaining = FREE_ANALYSIS_LIMIT - used;
                return (
                  <span className="text-sm ml-1">
                    {remaining > 0
                      ? <span className="text-neon-cyan font-medium">{remaining}/{FREE_ANALYSIS_LIMIT} free</span>
                      : <span className="text-red-400 font-medium">0/{FREE_ANALYSIS_LIMIT} free</span>}
                  </span>
                );
              })()}
            </div>
            {((!isRepoScan && hasUnanalyzed) || (isRepoScan && hasUnanalyzedRepo)) && (
              <NoiseBackground
                containerClassName="rounded-full"
                gradientColors={["#00f3ff", "#0891b2", "#00d4e0"]}
              >
                <Button
                  onClick={isRepoScan ? handleAnalyzeAllRepo : handleAnalyzeAll}
                  disabled={isRepoScan ? isAnalyzingAllRepo : isAnalyzingAll}
                  aria-label={
                    (isRepoScan ? isAnalyzingAllRepo : isAnalyzingAll)
                      ? "AI analysis in progress"
                      : "Analyze all vulnerabilities with AI"
                  }
                  className="rounded-full bg-background text-neon-cyan hover:bg-neon-cyan/10 border-0 shadow-[0px_1px_0px_0px_rgba(255,255,255,0.03)_inset]"
                >
                  {(isRepoScan ? isAnalyzingAllRepo : isAnalyzingAll) ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  {(isRepoScan ? isAnalyzingAllRepo : isAnalyzingAll) ? "Analyzing..." : "Get AI Insights"}
                </Button>
              </NoiseBackground>
            )}
          </div>

          <FilterBar
            isRepoScan={!!isRepoScan}
            totalCount={isRepoScan ? repoVulns.length : vulns.length}
            filteredCount={isRepoScan ? filteredRepoVulns.length : filteredVulns.length}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            repoVulnTypeFilter={repoVulnTypeFilter}
            setRepoVulnTypeFilter={setRepoVulnTypeFilter}
            tierFilter={tierFilter}
            setTierFilter={setTierFilter}
            tierCounts={tierCounts}
          />

          {/* Upgrade prompt — only when free analyses exhausted */}
          {subscription.plan !== "pro" &&
           (isRepoScan ? freeRepoAnalysisCount : freeAnalysisCount) >= FREE_ANALYSIS_LIMIT &&
           ((isRepoScan && repoVulns.length > 0) || (!isRepoScan && vulns.length > 0)) && (
            <div className="glass rounded-xl p-3 mb-4 flex items-center justify-between">
              <p className="text-sm text-foreground/70">
                <Sparkles className="w-3.5 h-3.5 inline mr-1.5 text-neon-cyan" />
                Upgrade to Pro to analyze all {isRepoScan ? repoVulns.length : vulns.length} vulnerabilities with AI.
              </p>
              <Button
                size="sm"
                onClick={() => { setUpgradeOpen(true); trackUpgradeModalOpened("go_pro_banner"); }}
                className="bg-neon-cyan text-black hover:bg-neon-cyan/90 font-semibold shrink-0 ml-3"
              >
                Go Pro
              </Button>
            </div>
          )}

          <VulnerabilityList
            isRepoScan={!!isRepoScan}
            subscription={subscription}
            vulns={vulns}
            filteredVulns={filteredVulns}
            analyzingIds={isRepoScan ? repoAnalyzingIds : analyzingIds}
            onAnalyzeVulnerability={isRepoScan ? handleAnalyzeRepoVulnerability : handleAnalyzeVulnerability}
            copiedAfterCode={copiedAfterCode}
            onCopyAfterCode={handleCopyAfterCode}
            repoVulns={repoVulns}
            filteredRepoVulns={filteredRepoVulns}
            expandedId={expandedId}
            setExpandedId={setExpandedId}
            onApplyFix={handleApplyFix}
          />
        </motion.div>

        {/* Next Steps Section */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="mt-8"
        >
          <h2 className="text-xl font-semibold text-foreground mb-4">
            Next Steps
          </h2>
          <div className="space-y-3">
            {/* 1. MCP Agent */}
            <div className="glass rounded-2xl p-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-neon-cyan/10 rounded-lg flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5 text-neon-cyan" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Scan from Claude Code or Cursor</p>
                  <p className="text-xs text-muted-foreground">Use the MCP Agent to run security scans without leaving your IDE</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate("mcp")}
                aria-label="Set up MCP Agent"
                className="border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 shrink-0"
              >
                Set Up MCP
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" aria-hidden="true" />
              </Button>
            </div>

            {/* 2. Trust Badge */}
            <BadgeSection
              badge={badge}
              grade={grade}
              score={score}
              vulnsCount={vulns.length}
              isGeneratingBadge={isGeneratingBadge}
              onGenerateBadge={handleGenerateBadge}
              scanId={scanResult?.scan_id || repoScanResult?.scan_id || ""}
            />

            {/* 3. Scheduled Scan (URL scans only) */}
            {!isRepoScan && (
              <ScheduleSection
                targetUrl={scanResult?.target_url}
                schedules={schedules}
                showScheduleForm={showScheduleForm}
                setShowScheduleForm={setShowScheduleForm}
                scheduleFreq={scheduleFreq}
                setScheduleFreq={setScheduleFreq}
                scheduleEmail={scheduleEmail}
                setScheduleEmail={setScheduleEmail}
                scheduleSlack={scheduleSlack}
                setScheduleSlack={setScheduleSlack}
                isCreatingSchedule={isCreatingSchedule}
                onCreateSchedule={handleCreateSchedule}
                deletingScheduleId={deletingScheduleId}
                onDeleteSchedule={handleDeleteSchedule}
              />
            )}
          </div>
        </motion.div>

        {/* Weekly Digest Settings */}
        <DigestSection authToken={subscription.accessToken} />
      </div>

      {/* A-Grade Celebration Modal */}
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            key="celebration-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCelebration(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="glass rounded-2xl p-8 max-w-sm w-full mx-4 text-center border border-neon-cyan/20"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-16 h-16 rounded-full bg-neon-cyan/10 flex items-center justify-center mx-auto mb-4">
                <Trophy className="w-8 h-8 text-neon-cyan" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-2">
                Perfect Security Score!
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                Share your achievement and let the world know your site is secure.
              </p>
              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleShareTwitter}
                  className="bg-neon-cyan text-background hover:bg-neon-cyan/90 font-semibold w-full"
                >
                  Share on X
                </Button>
                <Button
                  onClick={handleShareLinkedIn}
                  variant="outline"
                  className="border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 font-semibold w-full"
                >
                  Share on LinkedIn
                </Button>
                <button
                  onClick={() => setShowCelebration(false)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
                >
                  Maybe Later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button — Share & Export */}
      <ReportFAB
        exportingFormat={exportingFormat}
        onExport={handleExport}
        copiedShareLink={copiedShareLink}
        onShareReport={handleShareReport}
        onShareTwitter={handleShareTwitter}
        onShareLinkedIn={handleShareLinkedIn}
      />

      <FixPromptModal
        open={fixPromptOpen}
        onClose={() => setFixPromptOpen(false)}
        scanId={scanId || ""}
        isRepo={!!isRepoScan}
        authToken={subscription.accessToken || undefined}
      />
      {isRepoScan && (
        <CreateFixPRModal
          open={fixPROpen}
          onClose={() => setFixPROpen(false)}
          scanId={scanId || ""}
          authToken={subscription.accessToken || undefined}
          repoUrl={repoScanResult?.repo_url}
          needsAnalysis={!repoVulns.some((v) => v.before_code && v.after_code)}
          onAnalyze={handleAnalyzeAllRepo}
        />
      )}
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
