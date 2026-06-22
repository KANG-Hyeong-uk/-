"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Shield, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Boxes } from "@/components/ui/background-boxes";
import type { ScanResult, RepoScanResult, NucleiVulnerability } from "@/lib/types";
import { getScanStatus, getRepoScanStatus } from "@/lib/api";

interface ScanningViewProps {
  target: string;
  scanId: string | null;
  isRepoScan?: boolean;
  onComplete: (result: ScanResult | RepoScanResult) => void;
  onError: (error: string) => void;
  initialError?: string | null;
  onGoHome?: () => void;
}

// Category to template/tag mapping for vulnerability classification
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "API Security": ["exposure", "api", "token", "key", "secret", "credential", "leak", "env"],
  "Authentication": ["auth", "login", "session", "jwt", "oauth", "password", "cookie"],
  "Data Protection": ["misconfig", "headers", "ssl", "tls", "csrf", "cors", "security-headers", "hsts"],
  "Dependencies": ["cve", "eol", "outdated", "version", "php-eol", "nginx-eol", "apache-eol"],
};

// Security categories list
const SECURITY_CATEGORIES = ["API Security", "Authentication", "Data Protection", "Dependencies"];
const REPO_SCAN_CATEGORIES = ["Secret Detection", "SAST Analysis", "Dependency Scan", "Score Calculation"];

// Category status type
interface CategoryStatus {
  hasIssue: boolean;
  maxSeverity: string | null;
}

// Classify vulnerabilities into categories
function categorizeVulnerabilities(vulnerabilities: NucleiVulnerability[]): Record<string, CategoryStatus> {
  const categories: Record<string, CategoryStatus> = {
    "API Security": { hasIssue: false, maxSeverity: null },
    "Authentication": { hasIssue: false, maxSeverity: null },
    "Data Protection": { hasIssue: false, maxSeverity: null },
    "Dependencies": { hasIssue: false, maxSeverity: null },
  };

  const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

  for (const vuln of vulnerabilities) {
    const templateId = vuln.template_id?.toLowerCase() || "";
    const name = vuln.name?.toLowerCase() || "";
    const severity = vuln.severity?.toLowerCase() || "info";

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      const matches = keywords.some(k => templateId.includes(k) || name.includes(k));

      if (matches) {
        categories[category].hasIssue = true;
        // Update max severity
        const currentMax = categories[category].maxSeverity;
        if (!currentMax || severityOrder[severity] > severityOrder[currentMax]) {
          categories[category].maxSeverity = severity;
        }
      }
    }
  }

  return categories;
}

// Get color class based on category status
function getCategoryColorClass(
  category: string,
  progress: number,
  index: number,
  categoryStatus: Record<string, CategoryStatus> | null
): string {
  // Still scanning this category
  if (progress <= (index + 1) * 25) {
    return "bg-neon-cyan"; // Cyan: in progress
  }

  // Check if we have status info
  if (!categoryStatus || !categoryStatus[category]) {
    return "bg-green-400"; // Default to green if no data
  }

  const status = categoryStatus[category];

  // No issues found
  if (!status.hasIssue) {
    return "bg-green-400"; // Green: passed
  }

  // Has issues - color based on severity
  const severity = status.maxSeverity;
  if (severity === "critical" || severity === "high" || severity === "medium") {
    return "bg-orange-400"; // Orange: warning (medium+)
  }

  return "bg-yellow-400"; // Yellow: caution (info/low)
}

// Simulated log messages that match the scan stages
const scanStageMessages: Record<string, { prefix: string; message: string }[]> = {
  initializing: [
    { prefix: "[Trust]", message: "Initializing security scanner..." },
    { prefix: "[Nuclei]", message: "Loading vulnerability templates..." },
  ],
  parsing: [
    { prefix: "[Trust]", message: "Parsing scan results..." },
  ],
  complete: [
    { prefix: "[Trust]", message: "Scan complete. Generating dashboard..." },
  ],
};

// Continuous scanning log messages for active scanning effect
const continuousScanMessages: { prefix: string; message: string }[] = [
  { prefix: "[Nuclei]", message: "Scanning for API Key leaks..." },
  { prefix: "[Trust AI]", message: "Analyzing OAuth flow patterns..." },
  { prefix: "[Security]", message: "Checking CSRF & CORS configurations..." },
  { prefix: "[Nuclei]", message: "Detecting exposed environment variables..." },
  { prefix: "[Trust AI]", message: "Analyzing authentication endpoints..." },
  { prefix: "[Security]", message: "Scanning for SQL injection vectors..." },
  { prefix: "[Trust AI]", message: "Evaluating input sanitization..." },
  { prefix: "[Nuclei]", message: "Checking for XSS vulnerabilities..." },
  { prefix: "[Trust AI]", message: "Analyzing session management..." },
  { prefix: "[Security]", message: "Scanning dependency vulnerabilities..." },
  { prefix: "[Nuclei]", message: "Testing for open redirects..." },
  { prefix: "[Trust AI]", message: "Checking JWT token validation..." },
  { prefix: "[Security]", message: "Scanning for SSRF vulnerabilities..." },
  { prefix: "[Nuclei]", message: "Detecting misconfigured headers..." },
  { prefix: "[Trust AI]", message: "Analyzing rate limiting policies..." },
  { prefix: "[Security]", message: "Checking for directory traversal..." },
  { prefix: "[Nuclei]", message: "Scanning for information disclosure..." },
  { prefix: "[Trust AI]", message: "Evaluating error handling patterns..." },
  { prefix: "[Security]", message: "Testing for IDOR vulnerabilities..." },
  { prefix: "[Nuclei]", message: "Checking SSL/TLS configurations..." },
  { prefix: "[Trust AI]", message: "Analyzing cookie security flags..." },
  { prefix: "[Security]", message: "Scanning for XXE injection..." },
  { prefix: "[Nuclei]", message: "Detecting exposed admin panels..." },
  { prefix: "[Trust AI]", message: "Checking Content-Security-Policy..." },
  { prefix: "[Security]", message: "Testing for command injection..." },
  { prefix: "[Nuclei]", message: "Scanning for prototype pollution..." },
  { prefix: "[Trust AI]", message: "Analyzing CORS misconfiguration..." },
  { prefix: "[Security]", message: "Checking for clickjacking vectors..." },
  { prefix: "[Nuclei]", message: "Detecting exposed .git directories..." },
  { prefix: "[Trust AI]", message: "Evaluating authentication bypass..." },
];

// Repo scan specific log messages
const repoScanMessages: { prefix: string; message: string }[] = [
  { prefix: "[Git]", message: "Cloning repository..." },
  { prefix: "[Scanner]", message: "Collecting source files..." },
  { prefix: "[Secret]", message: "Scanning for AWS access keys..." },
  { prefix: "[Secret]", message: "Detecting hardcoded API tokens..." },
  { prefix: "[SAST]", message: "Analyzing SQL injection patterns..." },
  { prefix: "[Secret]", message: "Checking for exposed private keys..." },
  { prefix: "[SAST]", message: "Scanning for XSS vulnerabilities..." },
  { prefix: "[SAST]", message: "Detecting command injection risks..." },
  { prefix: "[Secret]", message: "Looking for database credentials..." },
  { prefix: "[SAST]", message: "Checking eval/exec usage..." },
  { prefix: "[SCA]", message: "Parsing dependency files..." },
  { prefix: "[SCA]", message: "Querying OSV.dev for known CVEs..." },
  { prefix: "[SAST]", message: "Analyzing path traversal patterns..." },
  { prefix: "[Secret]", message: "Detecting Stripe/Slack tokens..." },
  { prefix: "[SCA]", message: "Checking npm packages for vulnerabilities..." },
  { prefix: "[SAST]", message: "Scanning for insecure deserialization..." },
  { prefix: "[SCA]", message: "Analyzing Python dependencies..." },
  { prefix: "[SAST]", message: "Detecting debug mode in production..." },
  { prefix: "[Secret]", message: "Scanning for JWT secrets..." },
  { prefix: "[SCA]", message: "Checking for outdated packages..." },
  { prefix: "[SAST]", message: "Analyzing cryptographic weaknesses..." },
  { prefix: "[Trust AI]", message: "Calculating security score..." },
];

export function ScanningView({
  target,
  scanId,
  isRepoScan = false,
  onComplete,
  onError,
  initialError,
  onGoHome,
}: ScanningViewProps) {
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState("initializing");
  const [visibleLogs, setVisibleLogs] = useState<{ prefix: string; message: string }[]>([]);
  const [error, setError] = useState<string | null>(initialError || null);
  const [retrying, setRetrying] = useState(false);
  const [categoryStatus, setCategoryStatus] = useState<Record<string, CategoryStatus> | null>(null);

  // Ref for auto-scrolling log container
  const logContainerRef = useRef<HTMLDivElement>(null);
  const logIndexRef = useRef(0);

  // Add log message (FIFO, max 50 entries)
  const addLog = useCallback((log: { prefix: string; message: string }) => {
    setVisibleLogs((prev) => {
      const next = [...prev, log];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
  }, []);

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [visibleLogs]);

  // Continuous log generation during scanning
  useEffect(() => {
    if (error || currentStage === "complete" || currentStage === "parsing") return;

    const messages = isRepoScan ? repoScanMessages : continuousScanMessages;
    const interval = setInterval(() => {
      const message = messages[logIndexRef.current % messages.length];
      addLog(message);
      logIndexRef.current++;
    }, 1500); // Add new log every 1.5 seconds

    return () => clearInterval(interval);
  }, [error, currentStage, addLog, isRepoScan]);

  // Poll scan status
  useEffect(() => {
    if (!scanId || error) return;

    let isMounted = true;
    let pollTimeout: NodeJS.Timeout;
    const abortController = new AbortController();

    // Add initial logs
    scanStageMessages.initializing.forEach((log, i) => {
      setTimeout(() => {
        if (isMounted) addLog(log);
      }, i * 300);
    });

    const pollStatus = async () => {
      if (abortController.signal.aborted) return;

      try {
        const result = isRepoScan
          ? await getRepoScanStatus(scanId)
          : await getScanStatus(scanId);

        if (!isMounted || abortController.signal.aborted) return;

        // Update progress
        setProgress(result.progress || 0);
        setCurrentStage(result.current_stage || "scanning");

        // Add parsing stage log
        if (result.current_stage === "parsing") {
          scanStageMessages.parsing.forEach((log) => addLog(log));
        }

        // Update category status in real-time as vulnerabilities are found
        if (!isRepoScan && result.vulnerabilities && result.vulnerabilities.length > 0) {
          const status = categorizeVulnerabilities(result.vulnerabilities as NucleiVulnerability[]);
          setCategoryStatus(status);
        }

        // Check completion
        if (result.status === "completed") {
          setCurrentStage("complete");
          scanStageMessages.complete.forEach((log) => addLog(log));

          // If tab is hidden, skip animation and complete immediately
          // (requestAnimationFrame pauses in hidden tabs)
          if (document.visibilityState === "hidden") {
            setProgress(100);
            if (isMounted) onComplete(result);
            return;
          }

          // Smooth progress animation to 100%
          const startProgress = result.progress || 90;
          const duration = 800; // ms
          const startTime = Date.now();

          const animateProgress = () => {
            const elapsed = Date.now() - startTime;
            const t = Math.min(elapsed / duration, 1);
            // Ease-out cubic for smooth deceleration
            const eased = 1 - Math.pow(1 - t, 3);
            const currentProgress = Math.round(startProgress + (100 - startProgress) * eased);

            setProgress(currentProgress);

            if (t < 1) {
              requestAnimationFrame(animateProgress);
            } else {
              setTimeout(() => {
                if (isMounted) onComplete(result);
              }, 700);
            }
          };

          requestAnimationFrame(animateProgress);
          return; // Stop polling
        }

        if (result.status === "failed") {
          setError(result.error_message || "Scan failed");
          onError(result.error_message || "Scan failed");
          return; // Stop polling
        }

        // Continue polling
        pollTimeout = setTimeout(pollStatus, 2000);
      } catch (err) {
        if (isMounted && !abortController.signal.aborted) {
          const errorMessage = err instanceof Error ? err.message : "Connection error";
          setError(errorMessage);
          onError(errorMessage);
        }
      }
    };

    // Resume polling immediately when tab becomes visible again
    // (browsers throttle/pause timers in hidden tabs)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isMounted && !abortController.signal.aborted) {
        clearTimeout(pollTimeout);
        pollStatus();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Start polling after a short delay
    const startDelay = setTimeout(() => {
      pollStatus();
    }, 1000);

    return () => {
      isMounted = false;
      abortController.abort();
      clearTimeout(startDelay);
      clearTimeout(pollTimeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [scanId, error, onComplete, onError, addLog, isRepoScan]);

  const handleRetry = () => {
    setRetrying(true);
    setError(null);
    setProgress(0);
    setVisibleLogs([]);
    // Parent component will handle retry via onError callback
    window.location.reload();
  };

  const circumference = 2 * Math.PI * 120;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden" role="main" aria-label="Security scan in progress">
      {/* Background boxes */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          maskImage: "radial-gradient(ellipse 90% 80% at 50% 50%, white 20%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 80% at 50% 50%, white 20%, transparent 70%)",
        }}
      >
        <Boxes />
      </div>
      {/* Existing content */}
      <div className="w-full max-w-4xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <button
            onClick={onGoHome}
            aria-label="Go to Trust home page"
            className="flex items-center justify-center gap-3 mb-4 hover:opacity-80 transition-opacity cursor-pointer mx-auto"
          >
            <Shield className="w-8 h-8 text-neon-cyan" />
            <span className="text-xl font-semibold text-foreground">Trust</span>
          </button>
          <p className="text-muted-foreground">
            Scanning:{" "}
            <span className="text-neon-cyan font-mono">{target}</span>
          </p>
        </motion.div>

        {/* Error State */}
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-8 p-6 glass rounded-2xl border border-red-400/30"
            role="alert"
          >
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <AlertCircle className="w-6 h-6" aria-hidden="true" />
              <span className="font-semibold">Scan Error</span>
            </div>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button
              onClick={handleRetry}
              disabled={retrying}
              aria-label={retrying ? "Retrying scan" : "Retry scan"}
              className="bg-neon-cyan text-background hover:bg-neon-cyan/90"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${retrying ? "animate-spin" : ""}`} />
              {retrying ? "Retrying..." : "Try Again"}
            </Button>
          </motion.div>
        )}

        {/* Progress Ring */}
        {!error && (
          <div className="flex flex-col lg:flex-row items-center justify-center gap-12 mb-12">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="relative w-64 h-64"
            >
              {/* Glow effect */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-48 h-48 bg-neon-cyan/20 rounded-full blur-3xl" />
              </div>

              {/* SVG Ring */}
              <svg
                className="w-full h-full transform -rotate-90"
                viewBox="0 0 256 256"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Scan progress: ${progress}%`}
              >
                {/* Background ring */}
                <circle
                  cx="128"
                  cy="128"
                  r="120"
                  fill="none"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="8"
                />
                {/* Progress ring */}
                <motion.circle
                  cx="128"
                  cy="128"
                  r="120"
                  fill="none"
                  stroke="var(--neon-cyan)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="drop-shadow-[0_0_10px_rgba(0,243,255,0.5)]"
                />
              </svg>

              {/* Center content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <motion.span
                  key={progress}
                  initial={{ scale: 1.1 }}
                  animate={{ scale: 1 }}
                  className="text-5xl font-bold text-neon-cyan neon-text font-mono"
                >
                  {progress}%
                </motion.span>
                <span className="text-sm text-muted-foreground mt-2 capitalize">
                  {currentStage === "complete" ? "Complete" : "Analyzing"}
                </span>
              </div>
            </motion.div>

            {/* Terminal Logs */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex-1 w-full max-w-lg glass rounded-2xl p-6 h-64 overflow-hidden"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                <div className="w-3 h-3 rounded-full bg-green-500/50" />
                <span className="text-xs text-muted-foreground ml-2 font-mono">
                  trust-scanner.log
                </span>
              </div>

              <div
                ref={logContainerRef}
                className="font-mono text-sm space-y-2 overflow-y-auto h-48 pr-2 scroll-smooth"
                aria-live="polite"
                aria-label="Scan log output"
              >
                {visibleLogs.map((log, index) => (
                  <motion.div
                    key={`log-${index}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex gap-2"
                  >
                    <span
                      className={`shrink-0 ${
                        log.prefix === "[Trust AI]"
                          ? "text-neon-cyan"
                          : log.prefix === "[Nuclei]"
                            ? "text-green-400"
                            : log.prefix === "[Security]"
                              ? "text-yellow-400"
                              : log.prefix === "[Secret]"
                                ? "text-red-400"
                                : log.prefix === "[SAST]"
                                  ? "text-yellow-400"
                                  : log.prefix === "[SCA]"
                                    ? "text-blue-400"
                                    : log.prefix === "[Git]" || log.prefix === "[Scanner]"
                                      ? "text-green-400"
                                      : "text-purple-400"
                      }`}
                    >
                      {log.prefix}
                    </span>
                    <span className="text-muted-foreground">{log.message}</span>
                  </motion.div>
                ))}
                {/* Blinking cursor */}
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY }}
                  className="inline-block w-2 h-4 bg-neon-cyan"
                />
              </div>
            </motion.div>
          </div>
        )}

        {/* Scanning indicators */}
        {!error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex flex-wrap justify-center gap-4"
          >
            {(isRepoScan ? REPO_SCAN_CATEGORIES : SECURITY_CATEGORIES).map((item, index) => {
              const colorClass = getCategoryColorClass(item, progress, index, categoryStatus);
              const isComplete = progress > (index + 1) * 25;

              return (
                <motion.div
                  key={item}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 + index * 0.1 }}
                  className="flex items-center gap-2 px-4 py-2 glass rounded-full"
                >
                  <motion.div
                    animate={{
                      opacity: isComplete ? 1 : [0.3, 1, 0.3],
                    }}
                    transition={
                      isComplete
                        ? {}
                        : { duration: 1.5, repeat: Number.POSITIVE_INFINITY }
                    }
                    className={`w-2 h-2 rounded-full ${colorClass}`}
                  />
                  <span className="text-sm text-muted-foreground">{item}</span>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
