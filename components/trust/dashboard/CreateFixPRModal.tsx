"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch,
  ExternalLink,
  Loader2,
  X,
  Check,
  AlertCircle,
  Github,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getGitHubConnection,
  connectGitHub,
  createFixPR,
  submitFixFeedback,
} from "@/lib/api";

interface CreateFixPRModalProps {
  open: boolean;
  onClose: () => void;
  scanId: string;
  authToken?: string;
  repoUrl?: string;
  needsAnalysis?: boolean;
  onAnalyze?: () => Promise<void>;
}

type Step = "analyze" | "check" | "connect" | "create" | "success" | "error";

export function CreateFixPRModal({
  open,
  onClose,
  scanId,
  authToken,
  repoUrl,
  needsAnalysis,
  onAnalyze,
}: CreateFixPRModalProps) {
  const [step, setStep] = useState<Step>(needsAnalysis ? "analyze" : "check");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ghUsername, setGhUsername] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [prResult, setPrResult] = useState<{
    files_changed: number;
    vulnerabilities_fixed: number;
    branch: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(null);

  // Run AI analysis first if needed, then check GitHub connection
  useEffect(() => {
    if (!open || !authToken) return;
    setError(null);
    setPrUrl(null);
    setPrResult(null);
    setFeedback(null);

    (async () => {
      // Step 1: Run AI analysis if needed
      if (needsAnalysis && onAnalyze) {
        setStep("analyze");
        try {
          await onAnalyze();
        } catch {
          // Analysis failed — continue to check connection anyway
        }
      }

      // Step 2: Check GitHub connection
      setStep("check");
      try {
        const conn = await getGitHubConnection(authToken);
        if (conn.connected) {
          setGhUsername(conn.github_username || null);
          setStep("create");
        } else {
          setStep("connect");
        }
      } catch {
        setStep("connect");
      }
    })();
  }, [open, authToken]);

  // Handle OAuth result from sessionStorage (fallback when popup was blocked)
  useEffect(() => {
    if (!open || !authToken) return;
    const stored = sessionStorage.getItem("github_oauth_result");
    if (!stored) return;

    sessionStorage.removeItem("github_oauth_result");
    sessionStorage.removeItem("github_oauth_return_url");

    try {
      const { code, state: returnedState } = JSON.parse(stored);
      const savedState = sessionStorage.getItem("github_oauth_state");
      if (returnedState !== savedState) {
        setError("OAuth state mismatch");
        return;
      }

      setLoading(true);
      connectGitHub(code, authToken)
        .then((result) => {
          setGhUsername(result.github_username);
          setStep("create");
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to connect GitHub");
          setStep("error");
        })
        .finally(() => setLoading(false));
    } catch {
      // ignore malformed data
    }
  }, [open, authToken]);

  const handleGitHubConnect = () => {
    // Open GitHub OAuth in popup
    const clientId = process.env.NEXT_PUBLIC_GITHUB_APP_CLIENT_ID;
    if (!clientId) {
      setError("GitHub OAuth not configured");
      return;
    }
    const redirectUri = `${window.location.origin}/auth/github-callback`;
    const scope = "repo";
    const state = crypto.randomUUID();
    sessionStorage.setItem("github_oauth_state", state);
    // Store current URL for fallback redirect
    sessionStorage.setItem("github_oauth_return_url", window.location.href);

    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;
    const popup = window.open(url, "github-oauth", "width=600,height=700");

    // Listen for callback message from popup
    const handler = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "github-oauth-callback") return;

      window.removeEventListener("message", handler);
      popup?.close();

      const { code, state: returnedState } = event.data;
      const savedState = sessionStorage.getItem("github_oauth_state");
      if (returnedState !== savedState) {
        setError("OAuth state mismatch");
        return;
      }

      setLoading(true);
      try {
        const result = await connectGitHub(code, authToken!);
        setGhUsername(result.github_username);
        setStep("create");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect GitHub");
        setStep("error");
      } finally {
        setLoading(false);
      }
    };

    window.addEventListener("message", handler);
  };

  const handleCreatePR = async () => {
    if (!authToken) return;
    setLoading(true);
    setError(null);

    try {
      const result = await createFixPR(scanId, { authToken });
      setPrUrl(result.pr_url);
      setPrResult({
        files_changed: result.files_changed,
        vulnerabilities_fixed: result.vulnerabilities_fixed,
        branch: result.branch,
      });
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create PR");
      setStep("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="fix-pr-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="glass rounded-2xl border border-neon-cyan/20 max-w-md w-full mx-4 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-neon-cyan flex items-center gap-2">
                <GitBranch className="w-5 h-5" />
                Create Fix PR
              </h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step: AI Analysis */}
            {step === "analyze" && (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-neon-cyan/10 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-neon-cyan animate-pulse" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Analyzing Vulnerabilities</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Running AI analysis to generate fix code...<br />
                  This may take a moment.
                </p>
                <div className="flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-neon-cyan animate-spin" />
                </div>
              </div>
            )}

            {/* Step: Checking connection */}
            {step === "check" && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-neon-cyan animate-spin" />
                <span className="ml-3 text-sm text-muted-foreground">
                  Checking GitHub connection...
                </span>
              </div>
            )}

            {/* Step: Connect GitHub */}
            {step === "connect" && (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <Github className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Connect GitHub</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Grant repo access to create fix branches and pull requests.
                </p>
                <Button
                  onClick={handleGitHubConnect}
                  disabled={loading}
                  className="bg-neon-cyan text-black hover:bg-neon-cyan/90 font-semibold w-full"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Github className="w-4 h-4 mr-2" />
                      Connect with GitHub
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Step: Create PR */}
            {step === "create" && (
              <div className="py-4">
                {ghUsername && (
                  <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                    <Github className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">
                      Connected as <strong className="text-neon-cyan">{ghUsername}</strong>
                    </span>
                  </div>
                )}
                <p className="text-sm text-muted-foreground mb-4">
                  This will create a new branch with security fixes and open a pull request.
                  Only vulnerabilities with AI-analyzed fix code will be included.
                </p>
                {repoUrl && (
                  <p className="text-xs text-muted-foreground mb-4">
                    Repository: <code className="text-neon-cyan">{repoUrl}</code>
                  </p>
                )}
                <Button
                  onClick={handleCreatePR}
                  disabled={loading}
                  className="bg-neon-cyan text-black hover:bg-neon-cyan/90 font-semibold w-full"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating PR...
                    </>
                  ) : (
                    <>
                      <GitBranch className="w-4 h-4 mr-2" />
                      Create Fix PR
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Step: Success */}
            {step === "success" && prResult && (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Check className="w-8 h-8 text-green-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">PR Created!</h3>
                <div className="text-sm text-muted-foreground mb-4 space-y-1">
                  <p>
                    <strong className="text-foreground">{prResult.vulnerabilities_fixed}</strong> vulnerabilities fixed across{" "}
                    <strong className="text-foreground">{prResult.files_changed}</strong> files
                  </p>
                  <p className="text-xs">
                    Branch: <code className="text-neon-cyan">{prResult.branch}</code>
                  </p>
                </div>
                {prUrl && (
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-neon-cyan text-black px-6 py-2.5 rounded-xl font-semibold hover:bg-neon-cyan/90 transition-colors mb-4"
                  >
                    View PR on GitHub
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                {/* Feedback buttons */}
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-xs text-muted-foreground mb-2">
                    How was the fix quality?
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={async () => {
                        setFeedback("positive");
                        if (authToken) {
                          try { await submitFixFeedback(scanId, "positive", authToken); } catch {}
                        }
                      }}
                      disabled={feedback !== null}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        feedback === "positive"
                          ? "bg-green-500/20 text-green-400 border border-green-500/30"
                          : feedback === null
                          ? "bg-white/5 hover:bg-white/10 text-muted-foreground border border-white/10"
                          : "opacity-40 bg-white/5 text-muted-foreground border border-white/10"
                      }`}
                    >
                      Good
                    </button>
                    <button
                      onClick={async () => {
                        setFeedback("negative");
                        if (authToken) {
                          try { await submitFixFeedback(scanId, "negative", authToken); } catch {}
                        }
                      }}
                      disabled={feedback !== null}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        feedback === "negative"
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : feedback === null
                          ? "bg-white/5 hover:bg-white/10 text-muted-foreground border border-white/10"
                          : "opacity-40 bg-white/5 text-muted-foreground border border-white/10"
                      }`}
                    >
                      Needs work
                    </button>
                  </div>
                  {feedback && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Thanks for your feedback!
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Step: Error */}
            {step === "error" && (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
                <p className="text-sm text-red-400 mb-4">{error}</p>
                <Button
                  onClick={() => setStep("create")}
                  variant="outline"
                  className="border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10"
                >
                  Try Again
                </Button>
              </div>
            )}

            {/* Inline error for non-error steps */}
            {error && step !== "error" && (
              <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
