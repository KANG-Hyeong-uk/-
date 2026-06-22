"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";
import { LandingView } from "@/components/trust/landing-view";
import { ScanningView } from "@/components/trust/scanning-view";
import { DashboardView } from "@/components/trust/dashboard-view";
import { MCPView } from "@/components/trust/mcp-view";
import { UpgradeModal } from "@/components/trust/UpgradeModal";
import { ProviderPicker } from "@/components/trust/ProviderPicker";
import type { ScanResult, RepoScanResult } from "@/lib/types";
import { startScan, getScanStatus, startRepoScan, getRepoScanStatus, APIError } from "@/lib/api";
import { trackScanStarted, trackScanCompleted, trackUpgradeModalOpened } from "@/lib/analytics";
import { useSubscription } from "@/lib/subscription";
import { createClient } from "@/lib/supabase";
import { useNotifications } from "@/components/trust/NotificationToggle";
import { PaddleLoader } from "@/components/trust/PaddleLoader";

export type AppState = "landing" | "scanning" | "dashboard" | "mcp";

function CheckoutToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="fixed top-16 right-4 z-40 p-3 px-4 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-sm max-w-xs shadow-lg flex items-center gap-3">
      <span>{message}</span>
      <button onClick={onDismiss} className="text-neon-cyan/50 hover:text-neon-cyan shrink-0 text-lg leading-none">
        ×
      </button>
    </div>
  );
}

function CheckoutHandler({ onMessage }: { onMessage: (msg: string | null) => void }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      onMessage("Upgraded to Pro! Enjoy unlimited AI analysis and scheduled scans.");
    }
    if (checkout === "success" || checkout === "canceled") {
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams, onMessage]);

  return null;
}

export function ClientApp({ liveStats }: { liveStats?: { scans: number; vulns: number } | null } = {}) {
  const [appState, setAppState] = useState<AppState>("landing");
  const [scanTarget, setScanTarget] = useState("");
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isRepoScan, setIsRepoScan] = useState(false);
  const [repoScanResult, setRepoScanResult] = useState<RepoScanResult | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [skipTransition, setSkipTransition] = useState(false);
  const subscription = useSubscription();
  const {
    permission, enabled, requestPermission,
    showDeniedGuide, setShowDeniedGuide, isIncognito,
    sendTestNotification, testSent, recheckPermission,
  } = useNotifications();

  const [loginPickerOpen, setLoginPickerOpen] = useState(false);
  const [loginIntent, setLoginIntent] = useState<{ type: "url" | "repo"; target: string; branch?: string } | null>(null);

  const triggerLogin = (intent?: { type: "url" | "repo"; target: string; branch?: string }) => {
    setLoginIntent(intent || null);
    setLoginPickerOpen(true);
  };

  // Resume pending scan after OAuth login
  useEffect(() => {
    if (subscription.loading || !subscription.user) return;
    const raw = sessionStorage.getItem("pending_scan");
    if (!raw) return;
    sessionStorage.removeItem("pending_scan");
    try {
      const intent = JSON.parse(raw) as { type: "url" | "repo"; target: string; branch?: string };
      if (intent.type === "repo") {
        handleStartRepoScan(intent.target, intent.branch);
      } else {
        handleStartScan(intent.target);
      }
    } catch {
      // malformed data — ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscription.loading, subscription.user]);

  const handleStartScan = async (target: string, repoFullName?: string | null) => {
    if (subscription.loading) return;
    if (subscription.plan === "free" && subscription.urlScansUsed >= subscription.urlScansLimit) {
      setUpgradeOpen(true);
      trackUpgradeModalOpened("scan_limit");
      return;
    }
    setScanTarget(target);
    setScanError(null);
    setIsRepoScan(false);
    setRepoScanResult(null);
    setAppState("scanning");
    trackScanStarted("url", target);

    try {
      // Start the scan via API (pass auth token so user_id is saved)
      const response = await startScan(target, "quick", subscription.accessToken, repoFullName ?? null);
      setScanId(response.scan_id);
      subscription.refresh();
    } catch (error) {
      if (error instanceof APIError && error.status === 429) {
        setAppState("landing");
        setUpgradeOpen(true);
        trackUpgradeModalOpened("rate_limit");
        return;
      }
      console.error("Failed to start scan:", error);
      setScanError(error instanceof Error ? error.message : "Failed to start scan");
      // Still show scanning view - it will handle the error state
    }
  };

  const handleStartRepoScan = async (repoUrl: string, branch?: string) => {
    if (subscription.loading) return;
    if (subscription.plan === "free" && subscription.repoScansUsed >= subscription.repoScansLimit) {
      setUpgradeOpen(true);
      trackUpgradeModalOpened("scan_limit");
      return;
    }
    if (subscription.plan === null) {
      // Not logged in — trigger GitHub OAuth login
      triggerLogin({ type: "repo", target: repoUrl, branch: branch || undefined });
      return;
    }
    setScanTarget(repoUrl);
    setScanError(null);
    setIsRepoScan(true);
    setScanResult(null);
    setRepoScanResult(null);
    setAppState("scanning");
    trackScanStarted("repo", repoUrl);

    try {
      const response = await startRepoScan(repoUrl, branch || undefined, "full", subscription.accessToken);
      setScanId(response.scan_id);
      subscription.refresh();
    } catch (error) {
      if (error instanceof APIError && error.status === 429) {
        setAppState("landing");
        setUpgradeOpen(true);
        trackUpgradeModalOpened("rate_limit");
        return;
      }
      if (error instanceof APIError && error.status === 401) {
        setAppState("landing");
        triggerLogin({ type: "repo", target: repoUrl, branch: branch || undefined });
        return;
      }
      console.error("Failed to start repo scan:", error);
      setScanError(error instanceof Error ? error.message : "Failed to start repo scan");
    }
  };

  const handleScanComplete = (result: ScanResult | RepoScanResult) => {
    if (isRepoScan) {
      setRepoScanResult(result as RepoScanResult);
    } else {
      setScanResult(result as ScanResult);
    }
    setAppState("dashboard");
    trackScanCompleted({
      type: isRepoScan ? "repo" : "url",
      score: result.score,
      grade: result.grade,
      vuln_count: result.vulnerabilities.length,
    });
    if (result.scan_id) {
      window.history.pushState(null, "", `/report/${result.scan_id}`);
    }
    // Push notifications are now sent server-side via Web Push
  };

  const handleScanError = (error: string) => {
    setScanError(error);
    // Stay on scanning view to show error
  };

  const handleNavigate = (state: AppState) => {
    setAppState(state);
  };

  const handleNewScan = () => {
    // Reset state for new scan
    setSkipTransition(true);
    setScanId(null);
    setScanResult(null);
    setScanError(null);
    setIsRepoScan(false);
    setRepoScanResult(null);
    setAppState("landing");
    // Reset URL back to root
    window.history.pushState(null, "", "/");
  };

  const handleViewReport = async (reportScanId: string) => {
    try {
      const result = await getScanStatus(reportScanId);
      setScanResult(result);
      setScanId(reportScanId);
      setIsRepoScan(false);
      setAppState("dashboard");
      window.history.pushState(null, "", `/report/${reportScanId}`);
    } catch (error) {
      console.error("Failed to load report:", error);
    }
  };

  const handleViewRepoReport = async (reportScanId: string) => {
    try {
      const result = await getRepoScanStatus(reportScanId);
      setRepoScanResult(result);
      setScanId(reportScanId);
      setIsRepoScan(true);
      setAppState("dashboard");
      window.history.pushState(null, "", `/report/${reportScanId}?type=repo`);
    } catch (error) {
      console.error("Failed to load repo report:", error);
    }
  };

  return (
    <main className="min-h-screen bg-background overflow-hidden relative" aria-live="polite">
      <Suspense>
        <CheckoutHandler onMessage={setCheckoutMessage} />
      </Suspense>
      {checkoutMessage && (
        <CheckoutToast message={checkoutMessage} onDismiss={() => setCheckoutMessage(null)} />
      )}
      <PaddleLoader />
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} trigger="scan_limit" urlScansUsed={subscription.urlScansUsed} urlScansLimit={subscription.urlScansLimit} repoScansUsed={subscription.repoScansUsed} repoScansLimit={subscription.repoScansLimit} />
      <ProviderPicker open={loginPickerOpen} onClose={() => setLoginPickerOpen(false)} pendingIntent={loginIntent} />
      {/* Background grid pattern */}
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

      {/* Ambient glow effects */}
      <div className="fixed top-0 left-1/4 w-[600px] h-[600px] bg-neon-cyan/5 rounded-full blur-[80px] pointer-events-none" style={{ transform: 'translateZ(0)' }} />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-neon-cyan/3 rounded-full blur-[60px] pointer-events-none" style={{ transform: 'translateZ(0)' }} />

      <LazyMotion features={domAnimation}>
        <AnimatePresence mode="wait" onExitComplete={() => { if (skipTransition) setSkipTransition(false); }}>
          {appState === "landing" && (
            <m.div
              key="landing"
              initial={skipTransition ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={skipTransition ? { opacity: 0 } : { opacity: 0, y: -20 }}
              transition={{ duration: skipTransition ? 0 : 0.4 }}
            >
              <LandingView onStartScan={handleStartScan} onStartRepoScan={handleStartRepoScan} onViewReport={handleViewReport} onViewRepoReport={handleViewRepoReport} subscription={subscription} liveStats={liveStats ?? null} notificationProps={{ permission, enabled, onToggle: requestPermission, showDeniedGuide, isIncognito, onDismissGuide: () => setShowDeniedGuide(false), onRecheckPermission: recheckPermission, onSendTest: sendTestNotification, testSent }} />
            </m.div>
          )}

          {appState === "scanning" && (
            <m.div
              key="scanning"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={skipTransition ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
              transition={{ duration: skipTransition ? 0 : 0.4 }}
            >
              <ScanningView
                target={scanTarget}
                scanId={scanId}
                isRepoScan={isRepoScan}
                onComplete={handleScanComplete}
                onError={handleScanError}
                initialError={scanError}
                onGoHome={handleNewScan}
              />
            </m.div>
          )}

          {appState === "dashboard" && (
            <m.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={skipTransition ? { opacity: 0 } : { opacity: 0, y: -20 }}
              transition={{ duration: skipTransition ? 0 : 0.4 }}
            >
              <DashboardView
                scanResult={scanResult}
                isRepoScan={isRepoScan}
                repoScanResult={repoScanResult}
                onNavigate={handleNavigate}
                onNewScan={handleNewScan}
                subscription={subscription}
              />
            </m.div>
          )}

          {appState === "mcp" && (
            <m.div
              key="mcp"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={skipTransition ? { opacity: 0 } : { opacity: 0, x: -20 }}
              transition={{ duration: skipTransition ? 0 : 0.4 }}
            >
              <MCPView onNavigate={(s) => handleNavigate(s as AppState)} />
            </m.div>
          )}
        </AnimatePresence>
      </LazyMotion>
    </main>
  );
}
