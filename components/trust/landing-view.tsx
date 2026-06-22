"use client";

import React from "react"

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ShieldCheck, Github, Globe, Sparkles, Lock, Zap, Bot, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { validateUrl, validateGitHubUrl } from "@/lib/validators";
import { AuthButton } from "@/components/trust/AuthButton";
import { UpgradeModal } from "@/components/trust/UpgradeModal";
import { NotificationToggle } from "@/components/trust/NotificationToggle";
import { RepoSelector } from "@/components/trust/RepoSelector";
import {
  getGitHubConnection,
  getVercelConnection,
  getVercelProjectUrl,
  type GitHubRepo,
} from "@/lib/api";
import { useGitHubConnect } from "@/lib/use-github-connect";
import { useVercelConnect } from "@/lib/use-vercel-connect";
import type { SubscriptionState } from "@/lib/subscription";
import dynamic from "next/dynamic";

const GridScan = dynamic(
  () => import("@/components/trust/GridScan").then((mod) => mod.GridScan),
  { ssr: false }
);
import ShinyText from "@/components/ui/ShinyText";
import { dict, detectInitialLang, type Lang } from "@/components/trust/landing-view.i18n";

// Scan history is now stored server-side (DB) via user_id.

interface NotificationProps {
  permission: "default" | "granted" | "denied";
  enabled: boolean;
  onToggle: () => void;
  showDeniedGuide?: boolean;
  isIncognito?: boolean;
  onDismissGuide?: () => void;
  onRecheckPermission?: () => void;
  onSendTest?: () => void;
  testSent?: boolean;
}

interface LandingViewProps {
  onStartScan: (target: string, repoFullName?: string | null) => void | Promise<void>;
  onStartRepoScan?: (repoUrl: string, branch?: string) => void | Promise<void>;
  onViewReport?: (scanId: string) => void;
  onViewRepoReport?: (scanId: string) => void;
  subscription: SubscriptionState;
  notificationProps?: NotificationProps;
  liveStats?: { scans: number; vulns: number } | null;
}

export function LandingView({ onStartScan, onStartRepoScan, subscription, notificationProps, liveStats }: LandingViewProps) {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    setLang(detectInitialLang());
  }, []);
  const t = dict[lang];
  const setLangPersist = useCallback((next: Lang) => {
    setLang(next);
    try {
      window.localStorage.setItem("trust_lang", next);
    } catch {
      // ignore storage failures
    }
  }, []);

  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [scanTab, setScanTab] = useState<"url" | "github">("url");
  // Branch selection is deferred to the backend (default branch is used);
  // the form only passes ``""`` so the caller contract stays stable.
  const [showLowerSections, setShowLowerSections] = useState(false);
  const [githubConnected, setGithubConnected] = useState<boolean>(false);
  // True once the GitHub-connection probe has run at least once. Used to
  // avoid flashing the Connect banner / RepoSelector in their default
  // states before we know which to show.
  const [githubConnectionChecked, setGithubConnectionChecked] = useState(false);
  const [vercelConnected, setVercelConnected] = useState<boolean>(false);
  const [vercelConnectionChecked, setVercelConnectionChecked] = useState(false);
  const [selectedRepoFullName, setSelectedRepoFullName] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  // Track whether the user has manually edited the URL input. Used to decide
  // whether picking a repo should auto-fill from repo.homepage without
  // clobbering the user's typing.
  const [urlManuallyEdited, setUrlManuallyEdited] = useState(false);

  // Check if the signed-in user has a GitHub connection.
  // Silently ignore errors — selector stays hidden.
  const checkGitHubConnection = useCallback(async () => {
    if (!subscription.user || !subscription.accessToken) {
      setGithubConnected(false);
      // Mark checked so anonymous flow can render without waiting on a
      // network roundtrip that will never happen.
      setGithubConnectionChecked(!subscription.loading);
      return;
    }
    try {
      const conn = await getGitHubConnection(subscription.accessToken!);
      setGithubConnected(!!conn.connected);
    } catch (err) {
      console.error("[LandingView] GitHub connection check failed:", err);
      setGithubConnected(false);
    } finally {
      setGithubConnectionChecked(true);
    }
  }, [subscription.user, subscription.accessToken, subscription.loading]);

  useEffect(() => {
    void checkGitHubConnection();
  }, [checkGitHubConnection]);

  // Optional: probe the user's Vercel connection. Used to swap the auto-
  // filled URL from homepage to Vercel's real production alias when
  // available (handles custom domains that GitHub's homepage field misses).
  const checkVercelConnection = useCallback(async () => {
    if (!subscription.user || !subscription.accessToken) {
      setVercelConnected(false);
      setVercelConnectionChecked(!subscription.loading);
      return;
    }
    try {
      const conn = await getVercelConnection(subscription.accessToken!);
      setVercelConnected(!!conn.connected);
    } catch (err) {
      console.error("[LandingView] Vercel connection check failed:", err);
      setVercelConnected(false);
    } finally {
      setVercelConnectionChecked(true);
    }
  }, [subscription.user, subscription.accessToken, subscription.loading]);

  useEffect(() => {
    void checkVercelConnection();
  }, [checkVercelConnection]);

  // Keep inputValue in sync with the selected repo after a tab switch.
  // Repo tab needs ``owner/repo`` as the submit value; URL tab pre-fills
  // from repo.homepage and then upgrades to the Vercel alias async if
  // available.
  useEffect(() => {
    if (!selectedRepoFullName || !githubConnected) return;
    if (scanTab === "github") {
      if (inputValue.trim() !== selectedRepoFullName) setInputValue(selectedRepoFullName);
    } else if (scanTab === "url" && !urlManuallyEdited) {
      if (selectedRepo?.homepage) setInputValue(selectedRepo.homepage);
      void fetchVercelUrlAndMaybeApply(selectedRepoFullName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanTab, selectedRepoFullName, selectedRepo?.homepage, githubConnected]);

  // Auth + all integration probes must be resolved before we render any
  // UI whose visibility depends on them. Otherwise the page flashes the
  // anonymous layout for a few hundred ms while Supabase Auth and the
  // integration probes (/github/connection, /vercel/connection) are in
  // flight.
  const authResolved =
    !subscription.loading && githubConnectionChecked && vercelConnectionChecked;

  // Shared OAuth popup for the "Connect GitHub" prompt.
  const { connect: connectGitHubOAuth, loading: connectLoading, error: connectError } = useGitHubConnect({
    authToken: subscription.accessToken ?? null,
    onConnected: () => {
      // Re-check so the selector appears immediately after OAuth resolves.
      void checkGitHubConnection();
    },
  });

  // Vercel connect popup — surfaced only when the auto-filled URL looks
  // like an auto-generated preview host, as a hint that connecting Vercel
  // will surface the user's real custom domain.
  const {
    connect: connectVercelOAuth,
    loading: vercelConnectLoading,
    error: vercelConnectError,
  } = useVercelConnect({
    authToken: subscription.accessToken ?? null,
    onConnected: () => {
      void checkVercelConnection();
      // Re-run the auto-fill against the currently selected repo now that
      // we can query Vercel for its production alias.
      if (selectedRepoFullName) void fetchVercelUrlAndMaybeApply(selectedRepoFullName);
    },
  });

  // Fetch the Vercel-known production URL for a repo and replace the
  // URL input — but only if the user hasn't started typing their own URL.
  // Exposed as a standalone callback so it can be called both from
  // handleRepoChange and after a Vercel connect completes.
  const fetchVercelUrlAndMaybeApply = useCallback(
    async (repoFullName: string) => {
      if (!subscription.accessToken) return;
      if (!vercelConnected) return;
      try {
        const { project_url } = await getVercelProjectUrl(repoFullName, subscription.accessToken);
        if (!project_url) return;
        // Only clobber the URL if the user hasn't typed their own. Run
        // the check against the latest state via the setter callback so
        // we don't race with rapid edits.
        setInputValue((cur) => (urlManuallyEdited ? cur : project_url));
      } catch (err) {
        console.error("[LandingView] Vercel project URL lookup failed:", err);
      }
    },
    [subscription.accessToken, vercelConnected, urlManuallyEdited],
  );

  useEffect(() => {
    const handleScroll = () => {
      // Show lower sections when scrolled past ~60% of viewport height
      setShowLowerSections(window.scrollY > window.innerHeight * 0.5);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    setUrlManuallyEdited(true);
    if (urlError) setUrlError(null);
  }, [urlError]);

  // When a repo is selected:
  //   • Repo tab → stash ``owner/repo`` as the submit value
  //   • URL tab → fill the URL input with the best known production URL
  //     for that repo. GitHub's homepage field is a decent default but
  //     often carries the auto-generated ``*.vercel.app`` preview. If the
  //     user has connected Vercel, ask Vercel for its real alias (custom
  //     domains included) and swap it in once it returns.
  const handleRepoChange = useCallback((fullName: string | null, repo: GitHubRepo | null) => {
    setSelectedRepoFullName(fullName);
    setSelectedRepo(repo);
    if (urlError) setUrlError(null);

    if (scanTab === "url" && !urlManuallyEdited) {
      if (repo?.homepage) setInputValue(repo.homepage);
      else setInputValue("");
      if (fullName) void fetchVercelUrlAndMaybeApply(fullName);
      return;
    }
    if (scanTab === "github" && fullName) {
      setInputValue(fullName);
    }
  }, [scanTab, urlError, urlManuallyEdited, fetchVercelUrlAndMaybeApply]);

  const isInputValid = inputValue.trim()
    ? scanTab === "github"
      ? validateGitHubUrl(inputValue).valid
      : validateUrl(inputValue).valid
    : false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (scanTab === "github") {
      const result = validateGitHubUrl(inputValue);
      if (!result.valid) {
        setUrlError(result.error || "Enter a valid GitHub repo (e.g., owner/repo)");
        return;
      }
      onStartRepoScan?.(inputValue.trim(), "");
    } else {
      const result = validateUrl(inputValue);
      if (!result.valid) {
        setUrlError(result.error || "Please enter a valid URL");
        return;
      }
      // Only forward the selected repo when the selector is actually shown
      // (i.e. user is GitHub-connected on the URL tab).
      const repoFullName = githubConnected ? selectedRepoFullName : null;
      onStartScan(inputValue.trim(), repoFullName);
    }
  };

  const handleTabSwitch = (tab: "url" | "github") => {
    setScanTab(tab);
    setInputValue("");
    setUrlManuallyEdited(false);
    setUrlError(null);
    // Don't reset selectedRepoFullName — the user's repo choice usefully
    // carries across tabs (source scan and URL scan of the same project).
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* GridScan background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <GridScan
          linesColor="#00f3ff"
          scanColor="#00f3ff"
          scanOpacity={0.55}
          gridScale={0.13}
          lineThickness={1.2}
          bloomIntensity={0.4}
          bloomThreshold={0.1}
          bloomSmoothing={0.3}
          chromaticAberration={0.0008}
          noiseIntensity={0.008}
          scanGlow={0.7}
          scanSoftness={2.5}
          scanDuration={3.0}
          scanDelay={1.5}
          enablePost={true}
          className="opacity-25"
        />
      </div>
      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-4 sm:px-6 py-4 md:px-12">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-2"
        >
          <div className="relative">
            <Shield className="w-8 h-8 text-neon-cyan" />
            <div className="absolute inset-0 w-8 h-8 bg-neon-cyan/30 blur-lg" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-xl font-semibold tracking-tight text-foreground">광주 보안관</span>
            <span className="text-xs text-muted-foreground tracking-wide">Gwangju Security</span>
          </div>
        </motion.div>

        <motion.nav
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="flex items-center gap-2"
        >
          <Link
            href="/developers"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-muted-foreground text-sm font-medium hover:text-foreground transition-colors"
          >
            API
          </Link>
          <Link
            href="/pricing"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neon-cyan/30 text-neon-cyan text-sm font-medium hover:bg-neon-cyan/10 hover:border-neon-cyan/50 transition-colors"
          >
            요금제
          </Link>
          {notificationProps && (
            <NotificationToggle
              permission={notificationProps.permission}
              enabled={notificationProps.enabled}
              onToggle={notificationProps.onToggle}
              showDeniedGuide={notificationProps.showDeniedGuide}
              isIncognito={notificationProps.isIncognito}
              onDismissGuide={notificationProps.onDismissGuide}
              onRecheckPermission={notificationProps.onRecheckPermission}
              onSendTest={notificationProps.onSendTest}
              testSent={notificationProps.testSent}
            />
          )}
          <div
            role="group"
            aria-label="Language"
            className="flex items-center text-xs text-muted-foreground select-none"
          >
            <button
              type="button"
              onClick={() => setLangPersist("en")}
              aria-pressed={lang === "en"}
              className={`px-1.5 py-1 transition-colors ${
                lang === "en" ? "text-foreground font-medium" : "hover:text-foreground/80"
              }`}
            >
              EN
            </button>
            <span className="text-muted-foreground/40">|</span>
            <button
              type="button"
              onClick={() => setLangPersist("ko")}
              aria-pressed={lang === "ko"}
              className={`px-1.5 py-1 transition-colors ${
                lang === "ko" ? "text-foreground font-medium" : "hover:text-foreground/80"
              }`}
            >
              KO
            </button>
          </div>
          <AuthButton initialUser={subscription.user} initialPlan={subscription.plan} />
          {subscription.plan !== "pro" && subscription.user && (
            <Button
              size="sm"
              onClick={() => setUpgradeOpen(true)}
              className="bg-neon-cyan text-black hover:bg-neon-cyan/90 font-semibold"
            >
              {t.goPro}
            </Button>
          )}
        </motion.nav>
      </header>

      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12 md:py-20 relative z-10 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-center max-w-4xl mx-auto w-full"
        >
          {/* Trust badge */}
          <span
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-neon-cyan/30 bg-neon-cyan/5 text-neon-cyan text-xs font-medium mb-8 min-h-[44px]"
          >
            <ShieldCheck className="w-3 h-3" />
            {t.hero.badge}
          </span>

          {/* Headline */}
          <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground mb-6 text-balance">
            {lang === "en" ? (
              <>
                <ShinyText
                  text={t.hero.headlineLine1A}
                  speed={3}
                  delay={0.5}
                  color="#00f3ff"
                  shineColor="#ffffff"
                  spread={120}
                  direction="left"
                  className="neon-text"
                />{" "}
                <ShinyText
                  text={t.hero.headlineLine1B}
                  speed={4}
                  delay={1.5}
                  color="#b8c5d3"
                  shineColor="#e0f4ff"
                  spread={120}
                  direction="right"
                />
                <br className="hidden md:block" />
                {" "}
                <ShinyText
                  text={t.hero.headlineLine2}
                  speed={4}
                  delay={2.5}
                  color="#b8c5d3"
                  shineColor="#e0f4ff"
                  spread={120}
                  direction="left"
                />
              </>
            ) : (
              <>
                <span className="neon-text" style={{ color: "#00f3ff" }}>
                  {t.hero.headlineLine1A}
                </span>
                <br className="hidden md:block" />
                {" "}
                <span style={{ color: "#b8c5d3" }}>
                  {t.hero.headlineLine1B} {t.hero.headlineLine2}
                </span>
              </>
            )}
          </h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="text-base sm:text-lg max-w-xl mx-auto mb-8 leading-relaxed"
          >
            <span className="text-foreground/70 font-medium tracking-wide">{t.hero.subLine1}</span>
            <br />
            {lang === "en" ? (
              <ShinyText
                text={t.hero.subLine2}
                speed={5}
                delay={3.5}
                color="#7dd3d8"
                shineColor="#00f3ff"
                spread={120}
                direction="left"
              />
            ) : (
              <span style={{ color: "#7dd3d8" }}>{t.hero.subLine2}</span>
            )}
          </motion.p>

          {/* Scan Tab Switcher */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="flex gap-1 glass rounded-md sm:rounded-lg p-0.5 sm:p-1 w-fit mx-auto mb-4"
            role="tablist"
            aria-label="Scan type"
          >
            <button
              onClick={() => handleTabSwitch("url")}
              role="tab"
              aria-selected={scanTab === "url"}
              aria-controls="scan-input-panel"
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors min-h-[36px] sm:min-h-[44px] ${
                scanTab === "url"
                  ? "bg-neon-cyan/20 text-neon-cyan"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
              {t.hero.urlTab}
            </button>
            <button
              onClick={() => handleTabSwitch("github")}
              role="tab"
              aria-selected={scanTab === "github"}
              aria-controls="scan-input-panel"
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors min-h-[36px] sm:min-h-[44px] ${
                scanTab === "github"
                  ? "bg-neon-cyan/20 text-neon-cyan"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Github className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
              {t.hero.repoTab}
            </button>
          </motion.div>

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto" id="scan-input-panel" role="tabpanel" aria-label={scanTab === "github" ? "GitHub repository scan" : "URL scan"}>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.25 }}
              className={`relative glass-strong rounded-xl sm:rounded-2xl p-2 transition-all duration-300 ${
                isFocused ? "neon-border neon-glow" : "scan-input-idle"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 px-4 py-2 text-muted-foreground shrink-0">
                    {scanTab === "github" ? (
                      <Github className="w-4 h-4 sm:w-5 sm:h-5" />
                    ) : (
                      <Globe className="w-4 h-4 sm:w-5 sm:h-5" />
                    )}
                  </div>
                  {subscription.plan === "free" && (
                    <span className={`text-sm sm:text-lg font-semibold tabular-nums shrink-0 ${
                      scanTab === "github"
                        ? subscription.repoScansUsed >= subscription.repoScansLimit ? "text-red-400" : "text-muted-foreground"
                        : subscription.urlScansUsed >= subscription.urlScansLimit ? "text-red-400" : "text-muted-foreground"
                    }`}>
                      ({scanTab === "github"
                        ? `${subscription.repoScansUsed}/${subscription.repoScansLimit}`
                        : `${subscription.urlScansUsed}/${subscription.urlScansLimit}`})
                    </span>
                  )}
                  {scanTab === "github" && authResolved && githubConnected ? (
                    // Repo tab, connected: the dropdown IS the primary input.
                    // The repo full_name is stashed in inputValue via handleRepoChange.
                    // `bare` lets it blend into the outer glass-strong pill —
                    // the outer Github icon already stands in for the one the
                    // dropdown would otherwise render.
                    <div className="flex-1 min-w-0">
                      <RepoSelector
                        authToken={subscription.accessToken}
                        userId={subscription.user?.id ?? null}
                        value={selectedRepoFullName}
                        onChange={handleRepoChange}
                        placeholder={t.hero.repoPickerPlaceholder}
                        bare
                      />
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => handleInputChange(e.target.value)}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                      placeholder={
                        scanTab === "github"
                          ? t.hero.repoPlaceholder
                          : t.hero.urlPlaceholder
                      }
                      aria-label={scanTab === "github" ? t.hero.repoAriaLabel : t.hero.urlAriaLabel}
                      className="flex-1 min-w-0 bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm sm:text-lg py-2"
                    />
                  )}
                </div>
                <Button
                  type="submit"
                  disabled={!inputValue.trim() || !isInputValid || subscription.loading || (subscription.plan === "free" && (scanTab === "github" ? subscription.repoScansUsed >= subscription.repoScansLimit : subscription.urlScansUsed >= subscription.urlScansLimit))}
                  aria-label="Start security scan"
                  className="bg-neon-cyan text-background hover:bg-neon-cyan/90 font-semibold px-6 py-2 sm:py-4 rounded-lg sm:rounded-xl text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto shrink-0 min-h-[40px] sm:min-h-[48px]"
                >
                  {subscription.loading ? (
                    <>
                      <div className="w-4 h-4 mr-2 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                      {t.hero.loading}
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5 mr-2" />
                      {t.hero.startFreeScan}
                    </>
                  )}
                </Button>
              </div>
            </motion.div>

            {/* URL tab: surface a one-liner nudge to connect Vercel when the
                auto-filled URL smells like a preview host. This is the
                exact moment the user realises their custom domain is
                missing, so show the fix right there. */}
            {(() => {
              const showVercelHint =
                scanTab === "url" &&
                authResolved &&
                githubConnected &&
                !vercelConnected &&
                !!selectedRepoFullName &&
                /\.(vercel\.app|netlify\.app|pages\.dev)\/?$/i.test(inputValue.trim());
              if (!showVercelHint) return null;
              return (
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="hidden sm:inline">{t.hero.previewUrlFull}</span>
                  <span className="sm:hidden">{t.hero.previewUrlShort}</span>
                  <button
                    type="button"
                    onClick={connectVercelOAuth}
                    disabled={vercelConnectLoading}
                    className="underline decoration-dotted underline-offset-2 text-neon-cyan/90 hover:text-neon-cyan disabled:opacity-60"
                  >
                    {vercelConnectLoading ? t.hero.connectingVercel : t.hero.connectVercel}
                  </button>
                  <span className="hidden sm:inline">{t.hero.vercelHintTail}</span>
                  <span className="sm:hidden">{t.hero.vercelHintTailShort}</span>
                  {vercelConnectError && (
                    <span className="text-red-400 basis-full sm:basis-auto">— {vercelConnectError}</span>
                  )}
                </div>
              );
            })()}

            {/* Probe skeleton — signed-in users wait on the GitHub/Vercel
                connection checks before the right slot (banner vs
                dropdown) is decided. Cold Cloud Run responses can take
                3-5s, so we hold the spot with a soft "checking" line
                rather than leaving a blank frame. */}
            <AnimatePresence>
              {subscription.user && !authResolved && (
                <motion.div
                  key="probe-skeleton"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 animate-pulse">
                    <Github className="w-5 h-5 text-muted-foreground/60 shrink-0" />
                    <div className="flex-1 min-w-0 text-sm">
                      <p className="text-muted-foreground truncate">{t.hero.checkingIntegrations}</p>
                      <p className="text-xs text-muted-foreground/60 truncate">
                        {t.hero.checkingIntegrationsSub}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* URL tab: repo picker (bigger, under URL). Lets the scanner
                read your pages from source so it finds more to check.
                Wait for auth probe to resolve so we don't flash an empty
                frame first. */}
            <AnimatePresence>
              {scanTab === "url" && authResolved && githubConnected && (
                <motion.div
                  key="repo-selector"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-visible"
                >
                  <div className="mt-3">
                    <RepoSelector
                      authToken={subscription.accessToken}
                      userId={subscription.user?.id ?? null}
                      value={selectedRepoFullName}
                      onChange={handleRepoChange}
                      label={t.hero.repoPickerLabel}
                      placeholder={t.hero.repoPickerOptional}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* URL tab: prompt signed-in users to connect GitHub so the repo
                picker becomes available. */}
            <AnimatePresence>
              {scanTab === "url" && authResolved && subscription.user && !githubConnected && (
                <motion.div
                  key="url-connect-prompt"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-neon-cyan/20 bg-neon-cyan/5 px-4 py-3">
                    <Github className="w-5 h-5 text-neon-cyan/90 shrink-0" />
                    <div className="flex-1 min-w-0 text-sm">
                      <p className="text-foreground/90 font-medium truncate">{t.hero.connectGithub}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {t.hero.connectGithubUrlReason}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={connectGitHubOAuth}
                      disabled={connectLoading}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 px-3 py-2 text-sm font-medium text-neon-cyan hover:bg-neon-cyan/20 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {connectLoading ? t.hero.connectingButton : t.hero.connectButton}
                    </button>
                  </div>
                  {connectError && (
                    <p className="mt-1 text-xs text-red-400">{connectError}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Sign-in hint for anonymous users on the Repo tab. */}
            <AnimatePresence>
              {scanTab === "github" && authResolved && !subscription.user && (
                <motion.div
                  key="repo-signin-hint"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 flex items-center justify-end gap-1 text-xs" style={{ color: "#b8c5d3" }}>
                    <Lock className="w-3 h-3 shrink-0" />
                    <span className="hidden sm:inline">{t.hero.signInToScanRepoFull}</span>
                    <span className="sm:hidden">{t.hero.signInToScanRepoShort}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Repo tab: prompt signed-in users to connect GitHub so the repo
                picker replaces the URL field. */}
            <AnimatePresence>
              {scanTab === "github" && authResolved && subscription.user && !githubConnected && (
                <motion.div
                  key="repo-connect-prompt"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 flex items-center gap-3 rounded-xl border border-neon-cyan/20 bg-neon-cyan/5 px-4 py-3">
                    <Github className="w-5 h-5 text-neon-cyan/90 shrink-0" />
                    <div className="flex-1 min-w-0 text-sm">
                      <p className="text-foreground/90 font-medium truncate">{t.hero.connectGithub}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {t.hero.connectGithubRepoReason}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={connectGitHubOAuth}
                      disabled={connectLoading}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 px-3 py-2 text-sm font-medium text-neon-cyan hover:bg-neon-cyan/20 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {connectLoading ? t.hero.connectingButton : t.hero.connectButton}
                    </button>
                  </div>
                  {connectError && (
                    <p className="mt-1 text-xs text-red-400">{connectError}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {urlError && (
              <p className="text-red-400 text-sm mt-2" role="alert">{urlError}</p>
            )}
          </form>

          {/* Live counter — real numbers from Supabase, server-rendered.
              Builds trust for first-time visitors (no fake numbers). */}
          {liveStats && liveStats.scans > 0 && (
            <p className="text-xs sm:text-sm text-muted-foreground mt-4 tabular-nums">
              <span className="text-foreground/80 font-semibold">{liveStats.scans.toLocaleString()}</span>
              {t.hero.sitesScannedSuffix}
              <span className="text-foreground/80 font-semibold">{liveStats.vulns.toLocaleString()}</span>
              {t.hero.vulnsFoundSuffix}
            </p>
          )}

          {/* Quick examples — only for anonymous visitors. Signed-in users
              either have a repo to pick from or their own URL in mind.
              Gate on authResolved so the chips don't flash during the
              auth/ github-connection probe. */}
          {authResolved && !subscription.user && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.3 }}
              className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mt-2 sm:mt-3"
            >
              <span className="text-xs sm:text-sm text-foreground/70 font-medium">{t.hero.tryLabel}</span>
              {(scanTab === "github"
                ? [
                    "expressjs/express",
                    "sindresorhus/got",
                  ]
                : [
                    "http://demo.testfire.net",
                    "https://ginandjuice.shop",
                  ]
              ).map((example, idx) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => handleInputChange(example)}
                  className={`text-xs sm:text-sm px-3 py-1.5 rounded-lg border border-neon-cyan/20 text-neon-cyan/80 hover:text-neon-cyan hover:border-neon-cyan/40 hover:bg-neon-cyan/5 cursor-pointer transition-colors min-h-[36px] sm:min-h-[44px] items-center ${
                    idx > 0 ? "hidden sm:inline-flex" : "inline-flex"
                  }`}
                >
                  {example}
                </button>
              ))}
            </motion.div>
          )}
        </motion.div>

        {/* Feature Cards */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-5xl mx-auto mt-8 sm:mt-16 w-full"
        >
          {[
            {
              icon: Shield,
              title: t.features.vuln.title,
              description: t.features.vuln.description,
              cta: null as { label: string; href: string } | null,
            },
            {
              icon: Lock,
              title: t.features.secret.title,
              description: t.features.secret.description,
              cta: null,
            },
            {
              icon: Sparkles,
              title: t.features.aiFix.title,
              description: t.features.aiFix.description,
              cta: null,
            },
            {
              icon: Bot,
              title: t.features.mcp.title,
              description: t.features.mcp.description,
              cta: { label: t.features.mcp.cta, href: "/mcp" },
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="glass rounded-2xl p-6 hover:bg-white/[0.04] transition-colors group flex flex-col"
            >
              <div className="w-12 h-12 rounded-xl bg-neon-cyan/10 flex items-center justify-center mb-4 group-hover:bg-neon-cyan/20 transition-colors">
                <feature.icon className="w-6 h-6 text-neon-cyan" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                {feature.description}
              </p>
              {feature.cta && (
                <Link
                  href={feature.cta.href}
                  className="mt-4 text-xs text-neon-cyan hover:underline underline-offset-2 text-left transition-colors py-2 min-h-[44px] inline-flex items-center"
                >
                  {feature.cta.label}
                </Link>
              )}
            </div>
          ))}
        </motion.div>

        {/* Lower Sections — fade in on scroll, fade out at top */}
        <motion.div
          animate={{ opacity: showLowerSections ? 1 : 0, y: showLowerSections ? 0 : 40 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={showLowerSections ? "" : "pointer-events-none"}
        >

        {/* How It Works */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false }}
          transition={{ duration: 0.5 }}
          className="max-w-5xl mx-auto mt-20 sm:mt-28 w-full"
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground text-center mb-10">
            {t.howItWorks.heading}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                icon: Globe,
                step: "1",
                title: t.howItWorks.step1.title,
                description: t.howItWorks.step1.description,
              },
              {
                icon: Shield,
                step: "2",
                title: t.howItWorks.step2.title,
                description: t.howItWorks.step2.description,
              },
              {
                icon: Zap,
                step: "3",
                title: t.howItWorks.step3.title,
                description: t.howItWorks.step3.description,
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: false }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="glass rounded-2xl p-6 text-center flex flex-col items-center"
              >
                <div className="w-12 h-12 rounded-xl bg-neon-cyan/10 flex items-center justify-center mb-4">
                  <item.icon className="w-6 h-6 text-neon-cyan" />
                </div>
                <span className="text-xs text-neon-cyan font-semibold mb-1">{t.howItWorks.step} {item.step}</span>
                <h3 className="text-lg font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Comparison Table */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false }}
          transition={{ duration: 0.5 }}
          className="max-w-5xl mx-auto mt-20 sm:mt-28 w-full"
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground text-center mb-10">
            {t.comparison.heading}
          </h2>
          <div className="overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[680px] glass rounded-2xl text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left p-4 text-muted-foreground font-medium">{t.comparison.featureCol}</th>
                  <th className="p-4 text-neon-cyan font-semibold">광주 보안관</th>
                  <th className="p-4 text-muted-foreground font-medium">GitHub Copilot</th>
                  <th className="p-4 text-muted-foreground font-medium">Cursor</th>
                  <th className="p-4 text-muted-foreground font-medium">Mobb</th>
                  <th className="p-4 text-muted-foreground font-medium">Snyk</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: t.comparison.rows.urlDast, trust: true, copilot: false, cursor: false, mobb: false, snyk: false },
                  { feature: t.comparison.rows.vulnScan, trust: true, copilot: false, cursor: false, mobb: true, snyk: true },
                  { feature: t.comparison.rows.secret, trust: true, copilot: false, cursor: false, mobb: true, snyk: true },
                  { feature: t.comparison.rows.aiFix, trust: true, copilot: true, cursor: true, mobb: true, snyk: false },
                  { feature: t.comparison.rows.autoPr, trust: true, copilot: false, cursor: false, mobb: true, snyk: false },
                  { feature: t.comparison.rows.scheduled, trust: true, copilot: false, cursor: false, mobb: true, snyk: true },
                  { feature: t.comparison.rows.mcp, trust: true, copilot: false, cursor: false, mobb: true, snyk: false },
                  { feature: t.comparison.rows.freeTier, trust: true, copilot: false, cursor: false, mobb: true, snyk: true },
                ].map((row) => (
                  <tr key={row.feature} className="border-b border-white/5 last:border-b-0">
                    <td className="p-4 text-foreground font-medium">{row.feature}</td>
                    <td className="p-4 text-center">
                      {row.trust ? <CheckCircle2 className="w-5 h-5 text-neon-cyan mx-auto" /> : <span className="text-white/20">—</span>}
                    </td>
                    <td className="p-4 text-center">
                      {row.copilot ? <CheckCircle2 className="w-5 h-5 text-white/40 mx-auto" /> : <span className="text-white/20">—</span>}
                    </td>
                    <td className="p-4 text-center">
                      {row.cursor ? <CheckCircle2 className="w-5 h-5 text-white/40 mx-auto" /> : <span className="text-white/20">—</span>}
                    </td>
                    <td className="p-4 text-center">
                      {row.mobb ? <CheckCircle2 className="w-5 h-5 text-white/40 mx-auto" /> : <span className="text-white/20">—</span>}
                    </td>
                    <td className="p-4 text-center">
                      {row.snyk ? <CheckCircle2 className="w-5 h-5 text-white/40 mx-auto" /> : <span className="text-white/20">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-center mt-6">
            <Link
              href="/why-trust"
              className="text-sm text-foreground/80 hover:text-neon-cyan transition-colors inline-flex items-center gap-1.5"
            >
              <span className="underline underline-offset-4 decoration-inherit">{t.comparison.learnMore}</span>
              <span aria-hidden="true" className="no-underline">→</span>
            </Link>
          </p>
        </motion.div>

        {/* Social Proof Stats */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false }}
          transition={{ duration: 0.5 }}
          className="max-w-5xl mx-auto mt-20 sm:mt-28 w-full"
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {[
              { value: "10,000+", label: t.socialProof.templates },
              { value: "37+", label: t.socialProof.patterns },
              { value: "8", label: t.socialProof.mcpTools },
              { value: "<2 min", label: t.socialProof.avgScan },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: false }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="glass rounded-2xl p-6 text-center"
              >
                <div className="text-2xl sm:text-3xl font-bold text-neon-cyan mb-1">{stat.value}</div>
                <div className="text-xs sm:text-sm text-muted-foreground">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto mt-20 sm:mt-28 mb-8 w-full text-center"
        >
          <h2 className="text-2xl sm:text-4xl font-bold text-foreground mb-4">
            {t.bottomCta.heading}
          </h2>
          <p className="text-muted-foreground mb-8">
            {t.bottomCta.sub}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="bg-neon-cyan text-background hover:bg-neon-cyan/90 font-semibold px-8 py-3 rounded-xl text-base min-h-[48px]"
            >
              <Zap className="w-5 h-5 mr-2" />
              {t.bottomCta.startFreeScan}
            </Button>
            <Link
              href="/pricing"
              className="inline-flex items-center px-6 py-3 rounded-xl border border-neon-cyan/30 text-neon-cyan text-sm font-medium hover:bg-neon-cyan/10 hover:border-neon-cyan/50 transition-colors min-h-[48px]"
            >
              {t.bottomCta.viewPricing}
            </Link>
          </div>
        </motion.div>

        </motion.div>
        {/* End Lower Sections wrapper */}

      </div>

      {/* Footer */}
      <footer className="border-t border-white/8 mt-16 py-4 sm:py-6 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>{t.footer.copyright}</span>
          <div className="flex gap-2 sm:gap-4">
            <Link href="/pricing" className="hover:text-foreground transition-colors py-2 px-4 min-h-[44px] inline-flex items-center">{t.footer.pricing}</Link>
            <Link href="/why-trust" className="hover:text-foreground transition-colors py-2 px-4 min-h-[44px] inline-flex items-center">{t.footer.whyTrust}</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors py-2 px-4 min-h-[44px] inline-flex items-center">{t.footer.terms}</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors py-2 px-4 min-h-[44px] inline-flex items-center">{t.footer.privacy}</Link>
          </div>
        </div>
      </footer>

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </div>
  );
}
