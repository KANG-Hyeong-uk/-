"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Download, Check, Loader2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFixPrompt } from "@/lib/api";

interface FixPromptModalProps {
  open: boolean;
  onClose: () => void;
  scanId: string;
  isRepo: boolean;
  authToken?: string;
}

const SEVERITY_OPTIONS = [
  { value: "critical", label: "Critical", color: "text-red-500", bg: "bg-red-500" },
  { value: "high", label: "High", color: "text-red-400", bg: "bg-red-400" },
  { value: "medium", label: "Medium", color: "text-yellow-400", bg: "bg-yellow-400" },
  { value: "low", label: "Low", color: "text-blue-400", bg: "bg-blue-400" },
] as const;

export function FixPromptModal({ open, onClose, scanId, isRepo, authToken }: FixPromptModalProps) {
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>(
    SEVERITY_OPTIONS.map((s) => s.value)
  );
  const [prompt, setPrompt] = useState("");
  const [vulnCount, setVulnCount] = useState(0);
  const [estimatedChanges, setEstimatedChanges] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchPrompt = useCallback(async () => {
    if (!scanId || selectedSeverities.length === 0) {
      setPrompt("");
      setVulnCount(0);
      setEstimatedChanges(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await getFixPrompt(scanId, {
        severity: selectedSeverities,
        isRepo,
        authToken,
      });
      setPrompt(result.prompt);
      setVulnCount(result.vuln_count);
      setEstimatedChanges(result.estimated_changes);
    } catch (err) {
      console.error("Failed to fetch fix prompt:", err);
      setError(err instanceof Error ? err.message : "Failed to generate prompt");
    } finally {
      setLoading(false);
    }
  }, [scanId, selectedSeverities, isRepo, authToken]);

  // Fetch on open and when severities change
  useEffect(() => {
    if (open) {
      fetchPrompt();
    }
  }, [open, fetchPrompt]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setCopied(false);
      setError(null);
    }
  }, [open]);

  const handleToggleSeverity = (severity: string) => {
    setSelectedSeverities((prev) =>
      prev.includes(severity)
        ? prev.filter((s) => s !== severity)
        : [...prev, severity]
    );
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([prompt], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fix-prompt-${scanId.slice(0, 8)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="fix-prompt-overlay"
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
            className="glass rounded-2xl border border-neon-cyan/20 max-w-2xl w-full mx-4 p-6 shadow-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-neon-cyan flex items-center gap-2">
                <Wand2 className="w-5 h-5" />
                Fix with AI
              </h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground mb-4">
              Generate a structured prompt to fix vulnerabilities using AI coding tools like Claude Code or Cursor.
            </p>

            {/* Severity Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              {SEVERITY_OPTIONS.map((sev) => (
                <label
                  key={sev.value}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={selectedSeverities.includes(sev.value)}
                    onChange={() => handleToggleSeverity(sev.value)}
                    className="sr-only"
                  />
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      selectedSeverities.includes(sev.value)
                        ? `${sev.bg} border-transparent`
                        : "border-white/20 bg-white/5"
                    }`}
                  >
                    {selectedSeverities.includes(sev.value) && (
                      <Check className="w-3 h-3 text-black" />
                    )}
                  </div>
                  <span className={`text-sm font-medium ${sev.color}`}>
                    {sev.label}
                  </span>
                </label>
              ))}
            </div>

            {/* Summary */}
            {!loading && !error && prompt && (
              <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
                <span>
                  <strong className="text-foreground">{vulnCount}</strong> vulnerabilities
                </span>
                <span>
                  <strong className="text-foreground">{estimatedChanges}</strong> estimated changes
                </span>
              </div>
            )}

            {/* Prompt Preview */}
            <div className="flex-1 min-h-0 mb-4">
              {loading ? (
                <div className="flex items-center justify-center h-48 rounded-xl bg-white/5 border border-white/10">
                  <Loader2 className="w-6 h-6 text-neon-cyan animate-spin" />
                  <span className="ml-3 text-sm text-muted-foreground">Generating prompt...</span>
                </div>
              ) : error ? (
                <div className="h-48 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              ) : selectedSeverities.length === 0 ? (
                <div className="h-48 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">Select at least one severity level</p>
                </div>
              ) : (
                <textarea
                  readOnly
                  value={prompt}
                  className="w-full h-64 rounded-xl bg-white/5 border border-white/10 p-4 text-sm text-foreground font-mono resize-none focus:outline-none focus:border-neon-cyan/30 overflow-auto"
                />
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleCopy}
                disabled={!prompt || loading}
                className="bg-neon-cyan text-black hover:bg-neon-cyan/90 font-semibold flex-1"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy to Clipboard
                  </>
                )}
              </Button>
              <Button
                onClick={handleDownload}
                disabled={!prompt || loading}
                variant="outline"
                className="border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10"
              >
                <Download className="w-4 h-4 mr-2" />
                Download .md
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
