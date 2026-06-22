"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Award, ExternalLink, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BadgeResponse } from "@/lib/api";

interface BadgeSectionProps {
  badge: BadgeResponse | null;
  grade: string;
  score: number;
  vulnsCount: number;
  isGeneratingBadge: boolean;
  onGenerateBadge: () => void;
  scanId: string;
}

export function BadgeSection({
  badge,
  grade,
  score,
  vulnsCount,
  isGeneratingBadge,
  onGenerateBadge,
  scanId,
}: BadgeSectionProps) {
  const [copiedType, setCopiedType] = useState<"md" | "html" | null>(null);

  const handleCopy = async (type: "md" | "html") => {
    if (!badge) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "https://trust-scan.me";
    const reportUrl = `${origin}/report/${scanId}`;

    const text =
      type === "md"
        ? `[![Gwangju Security](${badge.badge_url})](${reportUrl})`
        : `<a href="${reportUrl}"><img src="${badge.badge_url}" alt="Gwangju Security Badge" height="32" /></a>`;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  if (badge) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mt-8"
      >
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <Award className="w-6 h-6 text-neon-cyan" />
            <h2 className="text-xl font-semibold text-foreground">
              Your Gwangju Security Badge
            </h2>
          </div>

          <div className="flex flex-col items-center justify-center glass-strong rounded-xl p-8">
            <p className="text-sm text-muted-foreground mb-4">Preview</p>
            <img
              src={badge.badge_url}
              alt={`Gwangju Security Score: ${grade}`}
              className="h-8"
            />
            <a
              href={badge.badge_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 text-xs text-neon-cyan hover:underline flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Open in new tab
            </a>

            <div className="flex items-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy("md")}
                className="border-white/20 text-foreground hover:bg-white/5 text-xs h-8 px-3"
              >
                {copiedType === "md" ? (
                  <>
                    <Check className="w-3 h-3 mr-1.5 text-green-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 mr-1.5" />
                    Copy Markdown
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy("html")}
                className="border-white/20 text-foreground hover:bg-white/5 text-xs h-8 px-3"
              >
                {copiedType === "html" ? (
                  <>
                    <Check className="w-3 h-3 mr-1.5 text-green-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 mr-1.5" />
                    Copy HTML
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  if (score >= 70) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        className="glass rounded-2xl p-5 mt-6 flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-neon-cyan/10 rounded-lg flex items-center justify-center shrink-0">
            <Award className="w-5 h-5 text-neon-cyan" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Gwangju Security Badge</p>
            <p className="text-xs text-muted-foreground">Show off your {grade} grade on your README</p>
          </div>
        </div>
        <Button
          onClick={onGenerateBadge}
          disabled={isGeneratingBadge}
          variant="outline"
          size="sm"
          aria-label={isGeneratingBadge ? "Generating Gwangju Security Badge" : "Generate Gwangju Security Badge for your README"}
          className="border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 shrink-0"
        >
          {isGeneratingBadge ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <Award className="w-4 h-4 mr-1.5" />
          )}
          Generate
        </Button>
      </motion.div>
    );
  }

  return null;
}

