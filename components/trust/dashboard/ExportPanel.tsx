"use client";

import { useState, useRef, useEffect } from "react";
import {
  Check,
  Share2,
  Download,
  ChevronDown,
  Loader2,
  FileText,
  FileSpreadsheet,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportPanelProps {
  exportOpen: boolean;
  setExportOpen: (open: boolean) => void;
  exportingFormat: "pdf" | "csv" | null;
  onExport: (format: "pdf" | "csv") => void;
  copiedShareLink: boolean;
  onShareReport: () => void;
  onShareTwitter: () => void;
  onShareLinkedIn: () => void;
}

export function ExportPanel({
  exportOpen,
  setExportOpen,
  exportingFormat,
  onExport,
  copiedShareLink,
  onShareReport,
  onShareTwitter,
  onShareLinkedIn,
}: ExportPanelProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShareOpen(false);
      }
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-2">
      {/* Share Dropdown — X, LinkedIn, Copy Link merged */}
      <div className="relative" ref={shareRef}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setShareOpen(!shareOpen); setExportOpen(false); }}
          aria-expanded={shareOpen}
          aria-haspopup="true"
          aria-label="Share report"
          className="border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10"
        >
          <Share2 className="w-4 h-4 mr-2" aria-hidden="true" />
          Share
          <ChevronDown className="w-3 h-3 ml-1" aria-hidden="true" />
        </Button>
        {shareOpen && (
          <div
            className="absolute right-0 top-full mt-1 z-50 glass rounded-lg border border-neon-cyan/20 py-1 min-w-[160px] shadow-lg"
            role="menu"
          >
            <button
              onClick={() => { onShareTwitter(); setShareOpen(false); }}
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-neon-cyan/10 transition-colors"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              Share on X
            </button>
            <button
              onClick={() => { onShareLinkedIn(); setShareOpen(false); }}
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-neon-cyan/10 transition-colors"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              Share on LinkedIn
            </button>
            <div className="border-t border-white/10 my-1" role="separator" />
            <button
              onClick={() => { onShareReport(); setShareOpen(false); }}
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-neon-cyan/10 transition-colors"
            >
              {copiedShareLink ? (
                <Check className="w-4 h-4 shrink-0 text-green-400" aria-hidden="true" />
              ) : (
                <LinkIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              {copiedShareLink ? "Copied!" : "Copy Link"}
            </button>
          </div>
        )}
      </div>
      {/* Export Dropdown */}
      <div className="relative" ref={exportRef}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExportOpen(!exportOpen)}
          disabled={exportingFormat !== null}
          aria-expanded={exportOpen}
          aria-haspopup="true"
          aria-label={exportingFormat ? `Exporting as ${exportingFormat}` : "Export report"}
          className="border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10"
        >
          {exportingFormat ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="w-4 h-4 mr-2" aria-hidden="true" />
          )}
          {exportingFormat ? "Exporting..." : "Export"}
          <ChevronDown className="w-3 h-3 ml-1" aria-hidden="true" />
        </Button>
        {exportOpen && (
          <div className="absolute right-0 top-full mt-1 z-50 glass rounded-lg border border-neon-cyan/20 py-1 min-w-[140px] shadow-lg" role="menu">
            <button
              onClick={() => onExport("pdf")}
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-neon-cyan/10 transition-colors"
            >
              <FileText className="w-4 h-4 text-red-400" aria-hidden="true" />
              Export as PDF
            </button>
            <button
              onClick={() => onExport("csv")}
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-neon-cyan/10 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-green-400" aria-hidden="true" />
              Export as CSV
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
