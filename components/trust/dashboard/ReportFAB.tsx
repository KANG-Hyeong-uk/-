"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Share2,
  Download,
  X,
  FileText,
  FileSpreadsheet,
  Link as LinkIcon,
  Check,
  Loader2,
  ArrowUpFromLine,
} from "lucide-react";

interface ReportFABProps {
  exportingFormat: "pdf" | "csv" | null;
  onExport: (format: "pdf" | "csv") => void;
  copiedShareLink: boolean;
  onShareReport: () => void;
  onShareTwitter: () => void;
  onShareLinkedIn: () => void;
}

export function ReportFAB({
  exportingFormat,
  onExport,
  copiedShareLink,
  onShareReport,
  onShareTwitter,
  onShareLinkedIn,
}: ReportFABProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const shareItems = [
    {
      icon: (
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      label: "Share X",
      onClick: () => { onShareTwitter(); setOpen(false); },
    },
    {
      icon: (
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      ),
      label: "Share LI",
      onClick: () => { onShareLinkedIn(); setOpen(false); },
    },
    {
      icon: copiedShareLink ? (
        <Check className="w-4 h-4 shrink-0 text-green-400" />
      ) : (
        <LinkIcon className="w-4 h-4 shrink-0" />
      ),
      label: copiedShareLink ? "Copied!" : "Copy Link",
      onClick: onShareReport,
    },
  ];

  const exportItems = [
    {
      icon: <FileText className="w-4 h-4 shrink-0 text-red-400" />,
      label: "PDF",
      onClick: () => { onExport("pdf"); setOpen(false); },
    },
    {
      icon: <FileSpreadsheet className="w-4 h-4 shrink-0 text-green-400" />,
      label: "CSV",
      onClick: () => { onExport("csv"); setOpen(false); },
    },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-40" ref={containerRef}>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 16 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className="absolute bottom-[72px] right-0 w-44 rounded-2xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden bg-[#0a1a1f]/95 backdrop-blur-md"
          >
            {/* Share Section */}
            <div className="p-1.5 pb-0.5">
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                <Share2 className="w-3.5 h-3.5 text-neon-cyan" />
                <span className="text-sm font-semibold text-neon-cyan">
                  Share
                </span>
              </div>
              {shareItems.map((item, i) => (
                <motion.button
                  key={`share-${i}`}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.15 }}
                  onClick={item.onClick}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-foreground/90 hover:bg-white/5 hover:text-foreground transition-colors"
                >
                  {item.icon}
                  {item.label}
                </motion.button>
              ))}
            </div>

            <div className="border-t border-white/10 mx-2.5" />

            {/* Export Section */}
            <div className="p-1.5 pt-0.5">
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                <Download className="w-3.5 h-3.5 text-neon-cyan" />
                <span className="text-sm font-semibold text-neon-cyan">
                  Export
                </span>
              </div>
              {exportItems.map((item, i) => (
                <motion.button
                  key={`export-${i}`}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (shareItems.length + i) * 0.03, duration: 0.15 }}
                  onClick={item.onClick}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-foreground/90 hover:bg-white/5 hover:text-foreground transition-colors"
                >
                  {item.icon}
                  {item.label}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB Button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", delay: 0.8, stiffness: 200, damping: 15 }}
        onClick={() => setOpen(!open)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-colors duration-200 ${
          open
            ? "bg-white/10 border border-white/20 shadow-black/30"
            : "bg-neon-cyan shadow-neon-cyan/30 hover:shadow-neon-cyan/50"
        }`}
        aria-label={open ? "Close menu" : "Share & Export"}
        aria-expanded={open}
      >
        <AnimatePresence mode="wait">
          {exportingFormat ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.12 }}
            >
              <Loader2 className={`w-5 h-5 animate-spin ${open ? "text-foreground" : "text-black"}`} />
            </motion.div>
          ) : open ? (
            <motion.div
              key="close"
              initial={{ opacity: 0, rotate: -90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 90 }}
              transition={{ duration: 0.15 }}
            >
              <X className="w-5 h-5 text-foreground" />
            </motion.div>
          ) : (
            <motion.div
              key="open"
              initial={{ opacity: 0, rotate: 90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: -90 }}
              transition={{ duration: 0.15 }}
            >
              <ArrowUpFromLine className="w-5 h-5 text-black" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
